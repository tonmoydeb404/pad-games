/**
 * The Jungle Express — a steam train that runs the jungle railway forever.
 *
 * Kenney "Train Pack" (April 2019, CC0) models, converted to engine space by
 * `scripts/build-train-assets.mjs` (front → -Z, grounded, footprints centred).
 * The module is engine-agnostic like `animals.ts`: the JeepEngine feeds a
 * `TrainHost` (scene, physics-body hooks, particles, audio) and applies what
 * the train asks for.
 *
 * Three parts:
 *   - `RailPath`   — the closed railway loop: control-point ring around the
 *     trail, heights smoothed off the base terrain with a wide window (trains
 *     hate grades), pulled level with the trail at the two level crossings.
 *     Gives O(1) nearest-point queries (terrain carving) and arc-length poses
 *     (the train itself, the instanced track pieces).
 *   - `findCrossings` — where the rail crosses the jeep trail; the engine
 *     plants warning signs there and the loco whistles on approach.
 *   - `TrainSystem` — the consist (loco, tender, three wagons) advancing along
 *     the loop at constant speed, chimney smoke, curve banking, distance/pan
 *     audio state, and kinematic Rapier boxes (via the host) so the jeep can
 *     bounce off — or get flattened by — the train.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clamp, TAU } from "./noise";

const BASE = "/assets/jeep/train";

/* -------------------------------------------------------------------------
   Railway geometry
   ------------------------------------------------------------------------- */

/**
 * Rail ring: control points on a circle around the trail loop, with two
 * Gaussian dips pulled in over the trail's biggest bulges (near the "DEEP
 * RUTS" stretch and the north-east bend). Each dip dips inside the trail
 * ring and back out, giving four level crossings (two chicane pairs ~60u
 * apart, half a lap between pairs). Verified against the real trail loop:
 * ≥ 15u clearance elsewhere, clear of every pond and the stream, min curve
 * radius ≈ 120u (the consist is 34.5u long), grades under 3.2°.
 */
const RAIL_RING = {
  points: 48,
  base: 315,
  dips: [
    { at: (69 * Math.PI) / 180, depth: 78, width: (36 * Math.PI) / 180 },
    { at: (-124 * Math.PI) / 180, depth: 78, width: (36 * Math.PI) / 180 },
  ],
};

/** Arc-length samples around the loop (≈ 2.3u spacing). */
export const RAIL_SAMPLES = 900;
/**
 * Flat ballast half-width (the carved bed the track pieces sit on).
 * Wider than the diagonal of the coarsest terrain lattice cell (5.26u step
 * at Low quality → 7.44u diagonal) so every lattice corner around the
 * centreline lands inside the bench — the *rendered* bed is then exactly the
 * rail height everywhere, and the track never floats or buries. Also fully
 * covers the dirt road where the two cross (level-crossing deck).
 */
export const RAIL_BED = 7.5;
/** Embankment run — the bed blends back to the jungle floor over this. */
export const RAIL_BLEND = 13.0;

/** Uniform kit→world scale for train + track (loco ≈ 6.5u long). */
export const TRAIN_SCALE = 0.8;
/** Cruise speed — u/s along the loop, forever. */
export const TRAIN_SPEED = 12.5;

/** Consist order (files in /assets/jeep/train) with kit-unit half-lengths. */
export const CARS: { file: string; half: number }[] = [
  { file: "locomotive", half: 8.09 / 2 },
  { file: "tender", half: 5.21 / 2 },
  { file: "passenger-wagon", half: 8.06 / 2 },
  { file: "goods-wagon", half: 8.06 / 2 },
  { file: "flatcar", half: 9.26 / 2 },
];
/** Coupler gap between cars (world units). */
const CAR_GAP = 0.9;
/** Track piece length in kit units (RailwayTrack_Straight) — instanced. */
const TRACK_PIECE = 18.0;
/**
 * Track pieces are compressed along the track axis (gauge unchanged) so
 * joints sit ≤2° apart on the tightest curve — the line reads smooth.
 * Sleepers get proportionally shallower, which reads fine at driving range.
 */
const TRACK_LENGTH_SCALE = 0.45;
/** Chimney mouth in baked model space (kit units) — steam source. */
const CHIMNEY = new THREE.Vector3(0, 3.55, -2.2);

const CELL = 26;
const gridKey = (cx: number, cz: number): number => cx * 4096 + cz;

export function buildRailCtrl(): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k < RAIL_RING.points; k++) {
    const a = (k / RAIL_RING.points) * TAU;
    let r = RAIL_RING.base;
    for (const dip of RAIL_RING.dips) {
      let dA = a - dip.at;
      dA = ((dA + Math.PI) % TAU + TAU) % TAU - Math.PI; // wrap to [-π, π)
      r -= dip.depth * Math.exp(-((dA / dip.width) ** 2));
    }
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

/** Optional pull toward another bed (the trail at level crossings). */
export interface RailNear {
  y: number;
  /** 0..1 blend weight. */
  w: number;
}

export interface RailInfo {
  dist: number;
  /** Bed height at the nearest centreline point. */
  y: number;
  i: number;
}

export interface RailPose {
  x: number;
  y: number;
  z: number;
  /** Unit tangent (3D — includes grade). */
  tx: number;
  ty: number;
  tz: number;
}

export class RailPath {
  private readonly grid: Map<number, number[]>;
  private readonly tmpInfo: RailInfo = { dist: 0, y: 0, i: 0 };

  private constructor(
    readonly pts: THREE.Vector3[],
    readonly tan: THREE.Vector3[],
    readonly segLen: number,
    readonly length: number,
  ) {
    // spatial hash for O(1) nearest-sample queries
    this.grid = new Map();
    for (let i = 0; i < pts.length; i++) {
      const cx = Math.floor(pts[i].x / CELL);
      const cz = Math.floor(pts[i].z / CELL);
      for (let ox = -1; ox <= 1; ox++)
        for (let oz = -1; oz <= 1; oz++) {
          const k = gridKey(cx + ox, cz + oz);
          let arr = this.grid.get(k);
          if (!arr) this.grid.set(k, (arr = []));
          arr.push(i);
        }
    }
  }

  /**
   * @param base  terrain height field the bed is smoothed from
   * @param near  another bed to stay level with (the trail at crossings)
   */
  static build(base: (x: number, z: number) => number, near?: (x: number, z: number) => RailNear | null): RailPath {
    const ctrl = buildRailCtrl().map((p) => new THREE.Vector3(p[0], 0, p[1]));
    const curve = new THREE.CatmullRomCurve3(ctrl, true, "catmullrom", 0.5);
    const pts = curve.getSpacedPoints(RAIL_SAMPLES);
    pts.length = RAIL_SAMPLES; // getSpacedPoints repeats the first point
    const segLen = Math.max(0.2, pts[0].distanceTo(pts[1]));

    // Bed profile: wide smoothing of the base terrain (grades trains can
    // climb), plus gentle periodic harmonics so the line rolls. Periodic in
    // t so the closed loop stays seamless.
    const WIN = 110; // ≈ ±250 world units of smoothing
    const raw = new Float32Array(RAIL_SAMPLES);
    for (let i = 0; i < RAIL_SAMPLES; i++) raw[i] = base(pts[i].x, pts[i].z) + 0.9;
    for (let i = 0; i < RAIL_SAMPLES; i++) {
      let s = 0;
      for (let k = -WIN; k <= WIN; k++) s += raw[(i + k + RAIL_SAMPLES) % RAIL_SAMPLES];
      const t = i / RAIL_SAMPLES;
      const harm = 2.2 * Math.sin(TAU * 3 * t + 0.9) + 1.4 * Math.sin(TAU * 7 * t + 2.6);
      pts[i].y = s / (2 * WIN + 1) + harm;
    }
    // stay level with the trail through the crossings
    if (near) {
      for (let i = 0; i < RAIL_SAMPLES; i++) {
        const n = near(pts[i].x, pts[i].z);
        if (n) pts[i].y = pts[i].y + (n.y - pts[i].y) * n.w;
      }
    }

    // horizontal tangents
    const tan: THREE.Vector3[] = [];
    for (let i = 0; i < RAIL_SAMPLES; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % RAIL_SAMPLES];
      tan.push(new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize());
    }
    return new RailPath(pts, tan, segLen, segLen * RAIL_SAMPLES);
  }

  /** Nearest centreline point (dist + interpolated bed height) — no allocs. */
  info(x: number, z: number, out: RailInfo = this.tmpInfo): RailInfo {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    const arr = this.grid.get(gridKey(cx, cz));
    let best = 1e9;
    let bi = 0;
    if (arr) {
      for (let n = 0; n < arr.length; n++) {
        const p = this.pts[arr[n]];
        const dx = p.x - x;
        const dz = p.z - z;
        const d = dx * dx + dz * dz;
        if (d < best) {
          best = d;
          bi = arr[n];
        }
      }
    } else {
      for (let i = 0; i < RAIL_SAMPLES; i += 5) {
        const p = this.pts[i];
        const dx = p.x - x;
        const dz = p.z - z;
        const d = dx * dx + dz * dz;
        if (d < best) {
          best = d;
          bi = i;
        }
      }
    }
    const p = this.pts[bi];
    const t = this.tan[bi];
    const along = clamp((x - p.x) * t.x + (z - p.z) * t.z, -this.segLen, this.segLen);
    const px = p.x + t.x * along;
    const pz = p.z + t.z * along;
    out.dist = Math.hypot(x - px, z - pz);
    out.i = bi;
    // bed height interpolated along the segment (central difference, like the trail)
    const yNext = this.pts[(bi + 1) % RAIL_SAMPLES].y;
    const yPrev = this.pts[(bi - 1 + RAIL_SAMPLES) % RAIL_SAMPLES].y;
    out.y = p.y + ((yNext - yPrev) / (2 * this.segLen)) * along;
    return out;
  }

  dist(x: number, z: number): number {
    return this.info(x, z, this.tmpInfo).dist;
  }

  private samplePos(d: number, out: THREE.Vector3): THREE.Vector3 {
    const f = ((d % this.length) + this.length) % this.length;
    const i0 = Math.floor(f / this.segLen) % RAIL_SAMPLES;
    const k = f / this.segLen - Math.floor(f / this.segLen);
    const a = this.pts[i0];
    const b = this.pts[(i0 + 1) % RAIL_SAMPLES];
    return out.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
  }

  /** Pose at arc distance `d` (wraps). Tangent is the 3D chord over ±2.5u. */
  pose(d: number, out: RailPose): RailPose {
    this.samplePos(d, this.tmpA);
    out.x = this.tmpA.x;
    out.y = this.tmpA.y;
    out.z = this.tmpA.z;
    this.samplePos(d - 2.5, this.tmpB);
    this.samplePos(d + 2.5, this.tmpC);
    const tx = this.tmpC.x - this.tmpB.x;
    const ty = this.tmpC.y - this.tmpB.y;
    const tz = this.tmpC.z - this.tmpB.z;
    const l = Math.hypot(tx, ty, tz) || 1;
    out.tx = tx / l;
    out.ty = ty / l;
    out.tz = tz / l;
    return out;
  }

  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpC = new THREE.Vector3();
}

/**
 * Level crossings between two closed, arc-length-sampled loops (both may end
 * with a duplicated first point). Returns deduped crossing points.
 */
export function findCrossings(a: THREE.Vector3[], b: THREE.Vector3[]): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  const test = (p: { x: number; z: number }): boolean => {
    for (const q of out) if (Math.hypot(q.x - p.x, q.z - p.z) < 4) return false;
    return true;
  };
  const seg = (i: number, n: number) => (i + 1) % n;
  for (let i = 0; i < a.length; i++) {
    const a0 = a[i];
    const a1 = a[seg(i, a.length)];
    const ax = a1.x - a0.x;
    const az = a1.z - a0.z;
    const alen2 = ax * ax + az * az;
    if (alen2 < 1e-8) continue;
    for (let j = 0; j < b.length; j++) {
      const b0 = b[j];
      const b1 = b[seg(j, b.length)];
      const bx = b1.x - b0.x;
      const bz = b1.z - b0.z;
      // quick reject: either endpoint outside the other segment's disc
      const blen2 = bx * bx + bz * bz;
      if (blen2 < 1e-8) continue;
      const den = ax * bz - az * bx;
      if (Math.abs(den) < 1e-9) continue;
      const ex = b0.x - a0.x;
      const ez = b0.z - a0.z;
      const u = (ex * bz - ez * bx) / den;
      const v = (ex * az - ez * ax) / den;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const p = { x: a0.x + u * ax, z: a0.z + u * az };
      if (test(p)) out.push(p);
    }
  }
  return out;
}

/**
 * Circle-vs-oriented-box overlap in the ground plane (the train-ram sting).
 * Returns the push-out normal length (0 = no hit) and writes the normal.
 */
export function obbCircleHit(
  px: number,
  pz: number,
  pr: number,
  cx: number,
  cz: number,
  halfLen: number,
  halfWid: number,
  yaw: number,
  out: { nx: number; nz: number; depth: number },
): number {
  // world → car local (car forward is -Z at yaw 0)
  const dx = px - cx;
  const dz = pz - cz;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const lx = c * dx - s * dz;
  const lz = s * dx + c * dz;
  const qx = clamp(lx, -halfWid, halfWid);
  const qz = clamp(lz, -halfLen, halfLen);
  let nx = lx - qx;
  let nz = lz - qz;
  let d = Math.hypot(nx, nz);
  if (d > pr) return 0;
  if (d < 1e-5) {
    // centre inside the box — push out along the shallowest face
    const penX = halfWid - Math.abs(lx);
    const penZ = halfLen - Math.abs(lz);
    if (penX < penZ) {
      nx = Math.sign(lx) || 1;
      nz = 0;
      d = penX;
    } else {
      nx = 0;
      nz = Math.sign(lz) || 1;
      d = penZ;
    }
  } else {
    nx /= d;
    nz /= d;
  }
  // local → world normal (inverse of the rotation above)
  out.nx = c * nx + s * nz;
  out.nz = -s * nx + c * nz;
  out.depth = pr - d;
  return out.depth;
}

/* -------------------------------------------------------------------------
   The train itself
   ------------------------------------------------------------------------- */

export interface TrainHost {
  scene: THREE.Scene;
  rail: RailPath;
  /** Level crossings with the jeep trail — the loco whistles on approach. */
  crossings: { x: number; z: number }[];
  /** One pooled smoke particle (engine's particle system). */
  puff(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: string, size: number, life: number): void;
  /** Steam whistle (audio already attenuates by distance to the jeep). */
  whistle(gain: number): void;
  /** The train just rammed the jeep — `closing` is the relative speed. */
  onRam(closing: number, nx: number, nz: number): void;
  /** Kinematic box colliders, one per car (engine owns the Rapier world). */
  addBox(id: number, hx: number, hy: number, hz: number): void;
  moveBox(id: number, x: number, y: number, z: number, qx: number, qy: number, qz: number, qw: number): void;
  removeBox(id: number): void;
  /** Camera right axis, for stereo panning. */
  camRight(out: THREE.Vector3): THREE.Vector3;
}

const WHISTLE_COOLDOWN = 20;
const WHISTLE_RANGE = 115;
const RAM_COOLDOWN = 0.9;
/** Beyond this the audio state goes silent (the train is 'out of earshot'). */
const EARSHOT = 380;

export class TrainSystem {
  private readonly root = new THREE.Group();
  private readonly groups: THREE.Group[] = [];
  private readonly halfLen: number[] = [];
  private readonly offsets: number[] = [];
  private d = 0;
  private puffAcc = 0;
  private whistleT = 6; // first whistle soon after the start — announce it
  private ramT = 0;
  private built = false;

  /** Live audio state — the engine pushes it into JeepAudio each frame. */
  readonly sound = { gain: 0, pan: 0, rate: TRAIN_SPEED / 4.5 };

  constructor(private readonly host: TrainHost) {
    // arc offsets along the consist
    let off = 0;
    for (let i = 0; i < CARS.length; i++) {
      if (i > 0) off += CARS[i - 1].half * TRAIN_SCALE + CAR_GAP + CARS[i].half * TRAIN_SCALE;
      this.offsets.push(off);
    }
  }

  /** Load every car + the track piece; failures degrade to fewer cars. */
  async load(onProgress?: (k: number) => void): Promise<void> {
    const loader = new GLTFLoader();
    const entries: [string, (scene: THREE.Object3D) => void][] = [
      ...CARS.map(
        (car) => [car.file, (scene: THREE.Object3D) => this.protos.set(car.file, scene)] as [string, (scene: THREE.Object3D) => void],
      ),
      ["track", (scene) => {
        this.trackProto = scene;
      }],
    ];
    let done = 0;
    await Promise.all(
      entries.map(
        ([name, put]) =>
          new Promise<void>((resolve) => {
            loader.load(
              `${BASE}/${name}.glb`,
              (g) => {
                put(g.scene);
                onProgress?.(++done / entries.length);
                resolve();
              },
              undefined,
              () => {
                console.warn(`[jeep] train asset missing: ${name}.glb`);
                onProgress?.(++done / entries.length);
                resolve();
              },
            );
          }),
      ),
    );
  }

  private readonly protos = new Map<string, THREE.Object3D>();
  private trackProto: THREE.Object3D | null = null;

  /** Build scene objects + the instanced track (call after load). */
  spawn(): void {
    const { scene, rail } = this.host;

    // --- track: one InstancedMesh per part, laid tangent to the loop.
    // Pieces are compressed along the track axis (sleepers get shallower,
    // gauge unchanged) so joints sit ~2° apart on the tightest curve instead
    // of ~4.5° — the line reads smooth — and each piece pitches to the bed
    // grade so slopes don't staircase.
    if (this.trackProto) {
      const parts: { mesh: THREE.Mesh }[] = [];
      this.trackProto.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) parts.push({ mesh: m });
      });
      const pieceLen = TRACK_PIECE * TRAIN_SCALE * TRACK_LENGTH_SCALE;
      const spacing = pieceLen - 0.6; // slight overlap hides the joints
      const count = Math.max(1, Math.ceil(rail.length / spacing));
      const d = new THREE.Object3D();
      const pose: RailPose = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
      for (const { mesh } of parts) {
        const im = new THREE.InstancedMesh(mesh.geometry, mesh.material as THREE.Material, count);
        im.receiveShadow = true; // thin rails — never cast (hundreds of k of tris is waste)
        for (let i = 0; i < count; i++) {
          rail.pose((i + 0.5) * spacing, pose);
          d.position.set(pose.x, pose.y + 0.02, pose.z);
          d.rotation.set(
            Math.asin(clamp(pose.ty, -1, 1)),
            Math.atan2(-pose.tx, -pose.tz),
            0,
            "YXZ",
          );
          d.scale.set(TRAIN_SCALE, TRAIN_SCALE, TRAIN_SCALE * TRACK_LENGTH_SCALE);
          d.updateMatrix();
          im.setMatrixAt(i, d.matrix);
        }
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        scene.add(im);
      }
    }

    // --- the consist
    for (const car of CARS) {
      const proto = this.protos.get(car.file);
      if (!proto) continue;
      const g = new THREE.Group();
      g.scale.setScalar(TRAIN_SCALE);
      // glTF carries no shadow flags — opt every part in here
      proto.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
      g.add(proto);
      g.visible = false;
      this.root.add(g);
      this.groups.push(g);
      this.halfLen.push(car.half * TRAIN_SCALE);
    }
    this.root.visible = false;
    scene.add(this.root);
    this.built = true;
  }

  get carCount(): number {
    return this.groups.length;
  }

  /** Advance the consist, smoke, whistle, colliders, audio. Runs forever. */
  update(dt: number, jeep: THREE.Vector3): void {
    if (!this.built || this.groups.length === 0) return;
    this.d += TRAIN_SPEED * dt;
    this.root.visible = true;
    this.ramT = Math.max(0, this.ramT - dt);
    this.whistleT = Math.max(0, this.whistleT - dt);

    const pose: RailPose = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
    const poseAhead: RailPose = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
    let nearest = 1e9;
    let nearestX = 0;
    let nearestZ = 0;
    let locoX = 0;
    let locoZ = 0;

    for (let k = 0; k < this.groups.length; k++) {
      const g = this.groups[k];
      const hl = this.halfLen[k];
      const d = this.d - this.offsets[k];
      this.host.rail.pose(d, pose);
      this.host.rail.pose(d + 7, poseAhead);

      // heading with grade pitch + gentle outward bank on curves
      const tx = poseAhead.tx - pose.tx;
      const tz = poseAhead.tz - pose.tz;
      // centripetal component along the car's right axis (world up × fwd)
      const rx = -pose.tz;
      const rz = pose.tx;
      const lateralK = (tx * rx + tz * rz) / 7;
      const roll = clamp(-lateralK * TRAIN_SPEED * TRAIN_SPEED * 50, -0.075, 0.075);
      const yaw = Math.atan2(-pose.tx, -pose.tz);
      const pitch = Math.asin(clamp(pose.ty, -1, 1));
      g.position.set(pose.x, pose.y + 0.06, pose.z);
      g.rotation.set(pitch, yaw, roll, "YXZ");
      g.visible = true;

      if (k === 0) {
        locoX = pose.x;
        locoZ = pose.z;
      }

      // proximity
      const dist = Math.hypot(jeep.x - pose.x, jeep.z - pose.z);
      if (dist < nearest) {
        nearest = dist;
        nearestX = pose.x;
        nearestZ = pose.z;
      }

      // kinematic collider: near the jeep → create/track; far → retire
      const active = this.live.has(k);
      if (dist < 150) {
        if (!active) {
          this.host.addBox(k, 1.12, 1.05, hl * 0.94);
          this.live.add(k);
        }
        // rotation quaternion: Euler(pitch, yaw, roll, "YXZ")
        const q = this.q.setFromEuler(this.e.set(pitch, yaw, roll, "YXZ"));
        this.host.moveBox(k, pose.x, pose.y + 1.08, pose.z, q.x, q.y, q.z, q.w);
      } else if (active) {
        this.live.delete(k);
        this.host.removeBox(k);
      }

      // the ram sting — Rapier bounces the jeep; this sells the damage
      if (this.ramT <= 0 && dist < hl + 4) {
        const hit = obbCircleHit(jeep.x, jeep.z, 1.4, pose.x, pose.z, hl * 0.94, 1.12, yaw, this.hit);
        if (hit > 0) {
          this.ramT = RAM_COOLDOWN;
          this.host.onRam(TRAIN_SPEED + 4, this.hit.nx, this.hit.nz);
        }
      }
    }

    // --- chimney smoke
    this.puffAcc += dt;
    const loco = this.groups[0];
    while (this.puffAcc > 0.11) {
      this.puffAcc -= 0.11;
      this.host.rail.pose(this.d, pose);
      const wp = this.v2.set(CHIMNEY.x * TRAIN_SCALE, CHIMNEY.y * TRAIN_SCALE, CHIMNEY.z * TRAIN_SCALE);
      wp.applyEuler(loco.rotation).add(loco.position);
      const r = Math.random();
      this.host.puff(
        wp.x + (Math.random() - 0.5) * 0.25,
        wp.y,
        wp.z + (Math.random() - 0.5) * 0.25,
        -pose.tx * 2.6 + (Math.random() - 0.5),
        1.7 + Math.random() * 1.1,
        -pose.tz * 2.6 + (Math.random() - 0.5),
        r < 0.62 ? "#d8d3c8" : r < 0.85 ? "#9a958c" : "#55524c",
        0.55 + Math.random() * 0.35,
        1.3 + Math.random() * 0.7,
      );
    }

    // --- whistle: approaching a level crossing
    if (this.whistleT <= 0) {
      for (const c of this.host.crossings) {
        if (Math.hypot(c.x - locoX, c.z - locoZ) < WHISTLE_RANGE) {
          this.whistleT = WHISTLE_COOLDOWN;
          this.host.whistle(clamp(1 - nearest / 420, 0.15, 1));
          break;
        }
      }
    }

    // --- audio state (distance + stereo bearing)
    if (nearest > EARSHOT) {
      this.sound.gain = 0;
    } else {
      this.sound.gain = clamp(1 / (1 + Math.pow(nearest / 62, 1.7)), 0, 1);
      this.host.camRight(this.v3);
      const dx = nearestX - jeep.x;
      const dz = nearestZ - jeep.z;
      const l = Math.hypot(dx, dz) || 1;
      this.sound.pan = clamp((dx / l) * this.v3.x + (dz / l) * this.v3.z, -1, 1);
    }
  }

  /** Tear down scene objects + any live colliders. */
  destroy(): void {
    for (const k of [...this.live]) this.host.removeBox(k);
    this.live.clear();
    this.root.removeFromParent();
    this.built = false;
  }

  private readonly live = new Set<number>();
  private readonly v2 = new THREE.Vector3();
  private readonly v3 = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly hit = { nx: 0, nz: 0, depth: 0 };
}
