/**
 * Port Marin — the suburban town beside the jungle.
 *
 * Kenney "City Kit (Suburban)" 2.0 + "City Kit (Roads)" (both CC0, see
 * public/assets/jeep/CREDITS.md), served from /assets/jeep/city/{town,roads}.
 * Like `train.ts`, the module splits in two:
 *
 *   - `CitySite`  — pure math, built once in the engine constructor (before
 *     any asset loads). It owns the town's footprint in the world: a shelf
 *     terraced into the south-east rim (the base terrain rises +48 there —
 *     the town digs in, TOWN_DIG below), the paved access road that climbs
 *     from a trail junction to the gate (crossing the Jungle Express rails
 *     at grade), and the whole street plan: a ring road with a cross, three
 *     cul-de-sac spurs, 20 building lots with fenced yards, and street
 *     furniture. The engine queries it from `terrainHeight` (carve), the
 *     boundary clamps, the scatter `pick()` (keep-out) and the surface model
 *     (asphalt). Everything is deterministic, which is what `city.test.ts`
 *     verifies.
 *   - `CitySystem` — the three.js half: loads the kit GLBs, lays the tiles
 *     (grid + spline) and lots as InstancedMeshes, and registers solid boxes
 *     for the buildings through a `CityHost`. A failed load degrades to a
 *     bare (but fully drivable) shelf and road bed — never a crash.
 *
 * Kit facts this layout relies on (measured from the GLBs, see
 * scripts/build-city-assets.mjs): every model is grounded at y=0 with its
 * footprint centred on the origin; road tiles occupy exactly 1×1 kit units;
 * piece orientations are MIXED (straights run along X, the half-straight
 * along Z, the bend joins +X↔−Z, the dead-end opens toward +X), so tiles
 * never get hand-placed yaws — `resolveTileYaw` rotates each piece's
 * connection table onto the faces the street plan requires, and the test
 * asserts every face actually meets a neighbour.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clamp, mulberry, smooth, TAU } from "./noise";

const TOWN_BASE = "/assets/jeep/city/town";
const ROADS_BASE = "/assets/jeep/city/roads";

/* -------------------------------------------------------------------------
   Town site constants (world units)
   ------------------------------------------------------------------------- */

/** Town centre — south-east rim, outside the rail ring (r ≈ 315). */
export const TOWN_CX = 246;
export const TOWN_CZ = -315;
/** Flat shelf radius, and the ring over which it blends back to the rim. */
export const TOWN_FLAT = 78;
export const TOWN_BLEND = 34;
/** How deep the shelf is dug into the rim (the town sits in a hollow). */
const TOWN_DIG = 20;

/** Street tile footprint (kit tile is 1×1 — this is also the kit scale). */
export const TILE = 8;
/** Street grid lines: ring road at ±RING, cross streets on the axes. */
export const RING = 32;
/** Access-road cross-section: flat core (covers the tile), shoulder, then a
 *  long berm blend so cuts through the rim read as embankments, not canyons. */
const ROAD_CORE = 4.4;
const ROAD_SHOULDER = 6.0;
const ROAD_BLEND = 20;

/** Where the access road leaves the trail (fraction of the trail loop). */
export const JUNCTION_T = 0.135;

/** Road samples + spatial-hash cell (mirrors the trail's structures). */
const ROAD_SAMPLES = 260;
const CELL = 26;
const gridKey = (cx: number, cz: number): number => cx * 4096 + cz;

/** Player/vehicle bound inside the town sector (the jungle rim bound is 440). */
export const TOWN_BOUND = 486;

/* -------------------------------------------------------------------------
   Kit data (kit units — multiplied by TILE at placement)
   ------------------------------------------------------------------------- */

/**
 * Building footprints + heights, kit units (w × d × h, from the build
 * script's dimension report). Width = X extent, depth = Z extent; house
 * fronts face kit −Z.
 */
const BUILDING_DIMS: Record<string, [w: number, d: number, h: number]> = {
  "building-type-a": [1.3, 1.028, 0.834],
  "building-type-b": [1.828, 1.14, 1.138],
  "building-type-c": [1.286, 1.028, 1.034],
  "building-type-d": [1.756, 1.028, 1.238],
  "building-type-e": [1.3, 1.028, 1.138],
  "building-type-f": [1.428, 1.406, 1.138],
  "building-type-g": [1.45, 1.178, 0.768],
  "building-type-h": [1.3, 0.916, 0.737],
  "building-type-i": [1.286, 1.028, 0.737],
  "building-type-j": [1.37, 0.916, 1.038],
  "building-type-k": [0.921, 1.02, 1.15],
  "building-type-l": [1.034, 1.02, 1.049],
  "building-type-m": [1.428, 1.428, 0.737],
  "building-type-n": [1.784, 1.378, 1.138],
  "building-type-o": [1.27, 1.028, 1.138],
  "building-type-p": [1.24, 0.99, 0.918],
  "building-type-q": [1.24, 0.886, 0.918],
  "building-type-r": [1.028, 1.02, 1.141],
  "building-type-s": [1.406, 1.086, 1.138],
  "building-type-t": [1.314, 1.406, 1.156],
  "building-type-u": [1.428, 1.087, 1.138],
};

/**
 * Road-piece connection tables, kit space: the tile edges that carry
 * asphalt. (+X is right, +Z is "up" in this table — the resolver rotates
 * them, nothing else in the module ever assumes an orientation.)
 */
const TILE_LINKS: Record<string, [number, number][]> = {
  "road-straight": [
    [1, 0],
    [-1, 0],
  ],
  "road-crossing": [
    [1, 0],
    [-1, 0],
  ],
  "road-crossroad": [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ],
  "road-bend": [
    [1, 0],
    [0, -1],
  ],
  "road-end": [[1, 0]],
};

/** Rotate a kit-space direction by `yaw` about Y (three.js convention). */
function rotDir(x: number, z: number, yaw: number): [number, number] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [x * c + z * s, -x * s + z * c];
}

/**
 * Find the quarter-turn that lines a piece's connection set up with the
 * faces the street plan requires. Throws when nothing fits — a layout bug,
 * not a runtime condition.
 */
function resolveTileYaw(model: string, want: [number, number][]): number {
  const links = TILE_LINKS[model];
  if (!links) throw new Error(`no connection table for ${model}`);
  // quarter-turn rotations pick up ~1e-16 epsilon and -0 — quantize
  const q = (v: number): number => Number(v.toFixed(4)) + 0;
  const key = (dirs: [number, number][]): string =>
    dirs.map(([x, z]) => `${q(x)},${q(z)}`)
      .sort()
      .join("|");
  const wantKey = key(want);
  for (let k = 0; k < 4; k++) {
    const yaw = (k * Math.PI) / 2;
    if (key(links.map(([x, z]) => rotDir(x, z, yaw))) === wantKey) return yaw;
  }
  throw new Error(`${model} cannot face [${wantKey}]`);
}

/* -------------------------------------------------------------------------
   CitySite — pure town math
   ------------------------------------------------------------------------- */

export interface CityNear {
  y: number;
  /** 0..1 blend weight. */
  w: number;
}

export interface CityHooks {
  /** Base terrain (rim included) — the shelf and road bed are cut from it. */
  base(x: number, z: number): number;
  /** The trail sample the access road starts from (bed height + tangent). */
  junction: { x: number; z: number; y: number; tx: number; tz: number };
  /** Trail bed pull: `{y, w}` near the trail, null elsewhere. */
  trailNear(x: number, z: number): CityNear | null;
  /** Rail bed pull: `{y, w}` near the railway, null elsewhere. */
  railNear(x: number, z: number): CityNear | null;
}

export interface CityTile {
  model: string;
  u: number;
  v: number;
  /** Quarter-turn in city-local space (resolved from TILE_LINKS). */
  yaw: number;
}

export interface CityBuilding {
  model: string;
  /** World position (shelf is flat — one height for the whole town). */
  x: number;
  y: number;
  z: number;
  /** World yaw — house fronts (kit −Z) face the street. */
  yaw: number;
  /** Collision halves (world units); `rotY` orients the box. */
  hx: number;
  hz: number;
  rotY: number;
  /** Collision half-height (tops stay unsolid, like tree canopies). */
  colH: number;
}

export interface CityProp {
  model: string;
  /** Which kit the GLB loads from. */
  dir: "town" | "roads";
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Shadow casting (road paint never casts). */
  cast: boolean;
}

export interface RoadInfo {
  dist: number;
  /** Bed height at the nearest centreline point. */
  y: number;
}

export class CitySite {
  /** Shelf height (flat everywhere inside TOWN_FLAT). */
  readonly plateauY: number;
  /** Town yaw — local +v points from the junction toward the centre. */
  readonly yaw: number;
  /** Trail junction (access road mouth). */
  readonly junction: { x: number; z: number; y: number };
  /** Where the road crosses the railway (level crossing). */
  readonly crossing = { x: 0, z: 0 };
  /** Arc distance along the road of the level crossing. */
  crossingArc = 0;

  /** Street plan (grid tiles + the zebra at the gate). */
  readonly tiles: CityTile[] = [];
  /** Spline-paved straights between the junction and the gate (yaw + grade roll). */
  readonly roadPieces: { x: number; y: number; z: number; yaw: number; roll: number }[] = [];
  readonly buildings: CityBuilding[] = [];
  readonly props: CityProp[] = [];

  private readonly hooks: CityHooks;
  private roadPts: THREE.Vector3[] = [];
  private roadTan: THREE.Vector3[] = [];
  private segLen = 1;
  private roadLen = 1;
  private readonly roadGrid = new Map<number, number[]>();

  private constructor(hooks: CityHooks) {
    this.hooks = hooks;
    const j = hooks.junction;
    this.junction = { x: j.x, z: j.z, y: j.y };

    // Town yaw: local +v points from the junction toward the centre.
    this.yaw = Math.atan2(TOWN_CX - j.x, TOWN_CZ - j.z);

    // Shelf height: the local rim height, dug in so the town sits in a
    // hollow instead of on a mesa top.
    let s = 0;
    for (const [dx, dz] of [[0, 0], [20, 0], [-20, 0], [0, 20], [0, -20]] as const) {
      s += hooks.base(TOWN_CX + dx, TOWN_CZ + dz);
    }
    this.plateauY = s / 5 - TOWN_DIG;
  }

  /* ---- construction ----------------------------------------------------- */

  static build(hooks: CityHooks): CitySite {
    const site = new CitySite(hooks);
    site.buildRoad();
    site.layoutTown();
    return site;
  }

  /**
   * The access road: a Catmull-Rom from the trail junction to the town gate
   * (local (0, −44), the outer face of the gate-arm zebra tile). Bed heights
   * are the smoothed base terrain — the climb over the rim stays, the noise
   * goes — pulled level with the trail at the mouth, the railway at the
   * level crossing, and the shelf at the gate.
   */
  private buildRoad(): void {
    const j = this.hooks.junction;
    const gate = this.toWorld(0, -44);
    const dx = gate.x - j.x;
    const dz = gate.z - j.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const lerpPt = (t: number, side: number): THREE.Vector3 =>
      new THREE.Vector3(j.x + dx * t + nx * side, 0, j.z + dz * t + nz * side);
    // gentle S — with 8-unit rigid tiles the road must sweep, not wiggle
    const ctrl = [
      new THREE.Vector3(j.x, 0, j.z),
      lerpPt(0.25, 3.5),
      lerpPt(0.55, -3),
      lerpPt(0.8, 1.5),
      new THREE.Vector3(gate.x, 0, gate.z),
    ];

    const curve = new THREE.CatmullRomCurve3(ctrl, false, "catmullrom", 0.5);
    const pts = curve.getSpacedPoints(ROAD_SAMPLES); // open curve: both ends kept
    const N = pts.length;
    this.segLen = curve.getLength() / (N - 1);
    this.roadLen = this.segLen * (N - 1);

    // bed: wide smoothing of the base (grades a road can hold), then pulls
    const WIN = 34;
    const raw = new Float32Array(N);
    for (let i = 0; i < N; i++) raw[i] = this.hooks.base(pts[i].x, pts[i].z) + 0.15;
    const y = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let k = -WIN; k <= WIN; k++) s += raw[clamp(i + k, 0, N - 1)];
      y[i] = s / (2 * WIN + 1);
    }
    let bestRailW = 0;
    let bestRailI = 0;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const near = this.hooks.trailNear(pts[i].x, pts[i].z);
      if (near) y[i] += (near.y - y[i]) * near.w;
      const rail = this.hooks.railNear(pts[i].x, pts[i].z);
      if (rail) {
        y[i] += (rail.y - y[i]) * rail.w;
        if (rail.w > bestRailW) {
          bestRailW = rail.w;
          bestRailI = i;
        }
      }
      // into town: meet the shelf before the gate tile
      y[i] += (this.plateauY - y[i]) * smooth(clamp((t - 0.68) / 0.26, 0, 1));
    }
    // grade limiter: pulls target beds that can sit a few units off the local
    // profile (the rail on its embankment, the shelf in its hollow) — cap the
    // slope at ~0.33 (18°) sample-to-sample, pinned at both ends so the mouth
    // stays glued to the trail and the gate to the shelf
    {
      const MAXG = 0.33;
      const step = MAXG * this.segLen;
      for (let i = 1; i < N; i++) y[i] = clamp(y[i], y[i - 1] - step, y[i - 1] + step);
      for (let i = N - 2; i >= 0; i--) y[i] = clamp(y[i], y[i + 1] - step, y[i + 1] + step);
    }
    // re-pin the level crossing: the sleepers must kiss the asphalt, so the
    // crossing samples land exactly on the rail bed (the limiter may have
    // shaved them toward the profile); a 5-tap settles the joint
    {
      const rail = this.hooks.railNear(pts[bestRailI].x, pts[bestRailI].z);
      if (rail) {
        for (let i = 0; i < N; i++) {
          const d = Math.abs(i - bestRailI) * this.segLen;
          if (d <= 2.6) y[i] = y[i] + (rail.y - y[i]) * (1 - d / 2.6);
        }
      }
    }
    // settle pull kinks (5-tap)
    const y2 = Float32Array.from(y);
    for (let i = 2; i < N - 2; i++) y[i] = (y2[i - 2] + 4 * y2[i - 1] + 6 * y2[i] + 4 * y2[i + 1] + y2[i + 2]) / 16;

    for (let i = 0; i < N; i++) {
      pts[i].y = y[i];
      this.roadTan.push(
        new THREE.Vector3(
          pts[Math.min(N - 1, i + 1)].x - pts[i].x,
          0,
          pts[Math.min(N - 1, i + 1)].z - pts[i].z,
        ).normalize(),
      );
      // spatial hash for O(1) nearest-sample queries
      const cx = Math.floor(pts[i].x / CELL);
      const cz = Math.floor(pts[i].z / CELL);
      for (let ox = -1; ox <= 1; ox++)
        for (let oz = -1; oz <= 1; oz++) {
          const k = gridKey(cx + ox, cz + oz);
          let arr = this.roadGrid.get(k);
          if (!arr) this.roadGrid.set(k, (arr = []));
          arr.push(i);
        }
    }
    this.roadPts = pts;
    const cp = pts[bestRailI];
    this.crossing.x = cp.x;
    this.crossing.z = cp.z;
    this.crossingArc = bestRailI * this.segLen;

    // pave it: rigid straights laid tangent to the spline (with grade roll so
    // they hug climbs), train-track style
    const spacing = TILE * 0.99;
    for (let d = 1.5; d < this.roadLen - 1.5; d += spacing) {
      const pose = this.roadPose(d);
      this.roadPieces.push({
        x: pose.x,
        y: pose.y + 0.02,
        z: pose.z,
        yaw: Math.atan2(-pose.tz, pose.tx),
        roll: Math.atan(pose.ty),
      });
    }
  }

  /** Position + tangent (with grade, `ty`) at arc distance `d` along the road. */
  roadPose(d: number): { x: number; y: number; z: number; tx: number; ty: number; tz: number } {
    const f = clamp(d / this.segLen, 0, this.roadPts.length - 1);
    const i0 = Math.min(this.roadPts.length - 1, Math.floor(f));
    const i1 = Math.min(this.roadPts.length - 1, i0 + 1);
    const k = f - i0;
    const a = this.roadPts[i0];
    const b = this.roadPts[i1];
    const t = this.roadTan[i0];
    // bed grade from the two flanking samples (central difference)
    const iPrev = Math.max(0, i0 - 1);
    const iNext = Math.min(this.roadPts.length - 1, i0 + 1);
    const ty = (this.roadPts[iNext].y - this.roadPts[iPrev].y) / Math.max(1e-4, (iNext - iPrev) * this.segLen);
    return {
      x: a.x + (b.x - a.x) * k,
      y: a.y + (b.y - a.y) * k,
      z: a.z + (b.z - a.z) * k,
      tx: t.x,
      ty: clamp(ty, -0.7, 0.7),
      tz: t.z,
    };
  }

  /** Arc length of the access road (junction → gate). */
  get roadLength(): number {
    return this.roadLen;
  }

  /* ---- street plan ------------------------------------------------------ */

  /**
   * Ring road at ±RING with cross streets on the axes, three cul-de-sac
   * spurs (the fourth, south, is the gate arm the access road feeds), 20
   * building lots with fenced yards, and the street furniture. Deterministic
   * via mulberry(7) — the tests pin the results.
   */
  private layoutTown(): void {
    const rnd = mulberry(7);
    const LINES = [-RING, 0, RING];

    // --- tiles ---------------------------------------------------------
    const addTile = (model: string, u: number, v: number, want: [number, number][]): void => {
      this.tiles.push({ model, u, v, yaw: resolveTileYaw(model, want) });
    };
    const NS: [number, number][] = [
      [0, 1],
      [0, -1],
    ];
    const EW: [number, number][] = [
      [1, 0],
      [-1, 0],
    ];
    const ALL: [number, number][] = [...NS, ...EW];

    for (const u of LINES) {
      for (let v = -RING; v <= RING; v += TILE) {
        const corner = Math.abs(u) === RING && Math.abs(v) === RING;
        if (corner) {
          // bend joining the two inward street ends at this corner
          addTile("road-bend", u, v, [
            [-Math.sign(u), 0],
            [0, -Math.sign(v)],
          ]);
        } else if (v === 0 || Math.abs(v) === RING) {
          // true intersection (u is already on a grid line here)
          addTile("road-crossroad", u, v, ALL);
        } else {
          addTile("road-straight", u, v, NS);
        }
      }
    }
    for (const v of LINES) {
      for (let u = -RING + TILE; u <= RING - TILE; u += TILE) {
        if (u === 0) continue; // intersections already laid by the N-S pass
        addTile("road-straight", u, v, EW);
      }
    }
    // cul-de-sac spurs off three ring crossroads (south = the gate arm)
    const spur = (su: number, sv: number, du: number, dv: number): void => {
      addTile("road-straight", su + du * TILE, sv + dv * TILE, du !== 0 ? EW : NS);
      addTile("road-end", su + du * 2 * TILE, sv + dv * 2 * TILE, [[-du, -dv]]);
    };
    spur(RING, 0, 1, 0);
    spur(-RING, 0, -1, 0);
    spur(0, RING, 0, 1);
    // the gate arm: zebra crossing, then the access road takes over
    addTile("road-crossing", 0, -RING - TILE, NS);

    // --- building lots ---------------------------------------------------
    // [u, v, face] — face points from the lot toward its street.
    const F = 0.7071;
    const LOTS: [number, number, number, number][] = [
      // interior quadrants — two houses each, fronting the ring streets
      [13, 22, 0, 1], [22, 13, 1, 0],
      [-13, 22, 0, 1], [-22, 13, -1, 0],
      [13, -22, 0, -1], [22, -13, 1, 0],
      [-13, -22, 0, -1], [-22, -13, -1, 0],
      // side strips outside the ring
      [46, 14, -1, 0], [46, -14, -1, 0],
      [-46, 14, 1, 0], [-46, -14, 1, 0],
      [14, 46, 0, -1], [-14, 46, 0, -1],
      [14, -46, 0, 1], [-14, -46, 0, 1],
      // outer corners, facing the ring corner
      [46, 46, -F, -F], [-46, 46, F, -F],
      [46, -46, -F, F], [-46, -46, F, F],
    ];

    // deterministic shuffle of the building types
    const types = Object.keys(BUILDING_DIMS);
    for (let i = types.length - 1; i > 0; i--) {
      const k = Math.floor(rnd() * (i + 1));
      [types[i], types[k]] = [types[k], types[i]];
    }

    /** Yaw so a kit −Z front faces `f`. */
    const faceYaw = (fx: number, fz: number): number => Math.atan2(-fx, -fz);
    /** Yaw so the kit +X axis points along `d`. */
    const xAxisYaw = (dx: number, dz: number): number => Math.atan2(-dz, dx);
    const prop = (
      model: string,
      dir: "town" | "roads",
      u: number,
      v: number,
      yaw: number,
      cast: boolean,
      y = this.plateauY,
    ): void => {
      const w = this.toWorld(u, v);
      this.props.push({ model, dir, x: w.x, y, z: w.z, yaw, cast });
    };

    LOTS.forEach(([u, v, fx, fz], lot) => {
      const model = types[lot % types.length];
      const [w, d, h] = BUILDING_DIMS[model];
      const yaw = faceYaw(fx, fz);
      const w0 = this.toWorld(u, v);

      // collision: axis-aligned houses keep their rotated AABB; the four
      // diagonal corner houses collide as the rotated box itself
      const diagonal = Math.abs(fx) > 0.5 && Math.abs(fz) > 0.5;
      const c = Math.abs(Math.cos(yaw));
      const s = Math.abs(Math.sin(yaw));
      const hw = (w / 2) * TILE;
      const hd = (d / 2) * TILE;
      this.buildings.push({
        model,
        x: w0.x,
        y: this.plateauY,
        z: w0.z,
        yaw,
        hx: diagonal ? hw : c * hw + s * hd,
        hz: diagonal ? hd : s * hw + c * hd,
        rotY: diagonal ? yaw : 0,
        colH: clamp((h * TILE) / 2, 2.6, 3.4),
      });

      // front path: two slabs from the door toward the street
      const faceDist = (diagonal ? (hw + hd) * 0.9 : Math.max(hw, hd)) + 1.6;
      for (let k = 0; k < 2; k++) {
        prop("path-long", "town", u + fx * (faceDist + 1.8 * k), v + fz * (faceDist + 1.8 * k), Math.atan2(fx, fz), false);
      }
      // planter by the path, tree in the back yard
      const px = -fz;
      const pz = fx;
      prop("planter", "town", u + fx * faceDist + px * 2.2, v + fz * faceDist + pz * 2.2, yaw + Math.PI / 2, true);
      prop(rnd() < 0.5 ? "tree-large" : "tree-small", "town", u - fx * (faceDist + 4.5) + px * 3.5, v - fz * (faceDist + 4.5) + pz * 3.5, rnd() * TAU, true);

      // back-yard fence run: two segments parallel behind the house, far
      // from every street band (side fences crossed streets on inner lots)
      const bx = u - fx * (hd + 6.5);
      const bz = v - fz * (hd + 6.5);
      const fyaw = xAxisYaw(px, pz);
      prop("fence-1x2", "town", bx - px * 3.5, bz - pz * 3.5, fyaw, true);
      prop("fence-1x2", "town", bx + px * 3.5, bz + pz * 3.5, fyaw, true);

      // a little street life
      if (lot % 7 === 3) {
        prop("construction-cone", "roads", u + fx * (faceDist + 4) + px * 1.2, v + fz * (faceDist + 4) + pz * 1.2, rnd() * TAU, true);
        prop("construction-cone", "roads", u + fx * (faceDist + 5.4) - px * 1.2, v + fz * (faceDist + 5.4) - pz * 1.2, rnd() * TAU, true);
      }
      if (lot === 5) prop("dumpster", "roads", u + px * (hw + 3.6), v + pz * (hw + 3.6), yaw + Math.PI, true);
    });

    // --- street furniture ------------------------------------------------
    // curved lamps outside the ring corners + two at the centre crossing
    for (const su of [-1, 1])
      for (const sv of [-1, 1]) prop("light-curved", "roads", su * (RING + 5.4), sv * (RING + 5.4), faceYaw(-su, -sv), true);
    prop("light-curved", "roads", 4.8, -4.8, faceYaw(-1, 0), true);
    prop("light-curved", "roads", -4.8, 4.8, faceYaw(1, 0), true);

    // stop signs at the ring crossroads: parked at the corner off BOTH
    // street bands (the old offset slid along the cross street, dead centre)
    const stops: [number, number, number, number][] = [
      [RING, 0, -1, 0],
      [-RING, 0, 1, 0],
      [0, RING, 0, -1],
      [0, -RING, 0, 1],
    ];
    for (const [u, v, fx, fz] of stops) {
      const su = -fz;
      const sv = fx;
      prop("road-sign-stop", "roads", u + fx * 5.2 + su * 5.6, v + fz * 5.2 + sv * 5.6, faceYaw(fx, fz), true);
    }

    // traffic light at the centre crossing
    prop("traffic-light", "roads", 4.6, 4.6, faceYaw(-1, 0), true);

    // highway board at the junction, readable from the trail
    {
      const j = this.hooks.junction;
      const nx = -j.tz;
      const nz = j.tx;
      this.props.push({
        model: "sign-highway",
        dir: "roads",
        x: j.x + nx * 7.6,
        y: j.y,
        z: j.z + nz * 7.6,
        yaw: Math.atan2(j.tz, -j.tx),
        cast: true,
      });
    }

    // power poles along the access road, crossarms across the road
    for (let d = 26; d < this.roadLen - 22; d += 42) {
      const pose = this.roadPose(d);
      const side = Math.floor(d / 42) % 2 === 0 ? 1 : -1;
      const nx = -pose.tz * side;
      const nz = pose.tx * side;
      this.props.push({
        model: "electricity-pole",
        dir: "roads",
        x: pose.x + nx * 6.4,
        y: pose.y,
        z: pose.z + nz * 6.4,
        yaw: xAxisYaw(nx, nz),
        cast: true,
      });
    }
  }

  /* ---- coordinate transforms ------------------------------------------- */

  /** City-local (u, v) → world. Local +v points junction → centre. */
  toWorld(u: number, v: number): { x: number; z: number } {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    return { x: this.cx0 + u * c + v * s, z: this.cz0 - u * s + v * c };
  }

  /** World → city-local (u, v). */
  toLocal(x: number, z: number): { u: number; v: number } {
    const dx = x - this.cx0;
    const dz = z - this.cz0;
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    return { u: dx * c - dz * s, v: dx * s + dz * c };
  }

  private readonly cx0 = TOWN_CX;
  private readonly cz0 = TOWN_CZ;

  /* ---- queries (hot paths: terrain carve / surface / bounds) ------------ */

  private readonly tmpRoad: RoadInfo = { dist: 1e9, y: 0 };

  /** Nearest access-road centreline point (dist + interpolated bed y). */
  roadInfo(x: number, z: number, out: RoadInfo = this.tmpRoad): RoadInfo {
    const pts = this.roadPts;
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    const arr = this.roadGrid.get(gridKey(cx, cz));
    let best = 1e9;
    let bi = 0;
    if (arr) {
      for (let n = 0; n < arr.length; n++) {
        const p = pts[arr[n]];
        const dx = p.x - x;
        const dz = p.z - z;
        const d = dx * dx + dz * dz;
        if (d < best) {
          best = d;
          bi = arr[n];
        }
      }
    } else {
      for (let i = 0; i < pts.length; i += 6) {
        const p = pts[i];
        const dx = p.x - x;
        const dz = p.z - z;
        const d = dx * dx + dz * dz;
        if (d < best) {
          best = d;
          bi = i;
        }
      }
    }
    const p = pts[bi];
    const t = this.roadTan[bi];
    const N = pts.length;
    const along = clamp((x - p.x) * t.x + (z - p.z) * t.z, -this.segLen, this.segLen);
    const px = p.x + t.x * along;
    const pz = p.z + t.z * along;
    out.dist = Math.hypot(x - px, z - pz);
    // bed height interpolated along the segment (central difference)
    const yNext = pts[Math.min(N - 1, bi + 1)].y;
    const yPrev = pts[Math.max(0, bi - 1)].y;
    out.y = p.y + ((yNext - yPrev) / (2 * this.segLen)) * along;
    return out;
  }

  /**
   * Terrain carve for the town: the shelf, then the road (the road wins in
   * its corridor — it cuts the terrace where it climbs). The engine applies
   * this BEFORE the railway carve, so the Jungle Express keeps right of way
   * at the level crossing.
   */
  carve(x: number, z: number, h: number): number {
    // shelf: flat inside TOWN_FLAT, blending back to the rim over TOWN_BLEND
    const d = Math.hypot(x - this.cx0, z - this.cz0);
    const k = 1 - smooth(clamp((d - TOWN_FLAT) / TOWN_BLEND, 0, 1));
    if (k > 0) h += (this.plateauY - h) * k;
    // access road: flat tile core, then a long berm blend out to the
    // surroundings — the climb reads as an embankment, never a canyon
    const ri = this.roadInfo(x, z);
    if (ri.dist < ROAD_SHOULDER + ROAD_BLEND) {
      const w = 1 - smooth(clamp((ri.dist - ROAD_CORE) / (ROAD_SHOULDER + ROAD_BLEND - ROAD_CORE), 0, 1));
      h += (ri.y - h) * w;
    }
    return h;
  }

  /** Asphalt? (access road core + town streets) — drives the surface model. */
  asphaltAt(x: number, z: number): boolean {
    if (this.roadInfo(x, z).dist < ROAD_CORE + 0.8) return true;
    const { u, v } = this.toLocal(x, z);
    return this.onStreet(u, v);
  }

  /** Inside a street's asphalt band (grid lines + spurs). */
  private onStreet(u: number, v: number): boolean {
    let du = 1e9;
    let dv = 1e9;
    for (const L of [-RING, 0, RING]) {
      du = Math.min(du, Math.abs(u - L));
      dv = Math.min(dv, Math.abs(v - L));
    }
    return (du <= 2.9 && Math.abs(v) <= RING + 2.9) || (dv <= 2.9 && Math.abs(u) <= 2 * RING + TILE + 4.5);
  }

  /** Terrain paint kind for `buildTerrain`: 0 jungle, 1 asphalt, 2 town lawn. */
  groundKind(x: number, z: number): 0 | 1 | 2 {
    if (this.roadInfo(x, z).dist < ROAD_SHOULDER + 0.4) return 1;
    if (Math.hypot(x - this.cx0, z - this.cz0) < TOWN_FLAT + 2) return 2;
    return 0;
  }

  /** Keep-out for the jungle scatter: town shelf + a road-side margin. */
  exclusion(x: number, z: number): boolean {
    if (Math.hypot(x - this.cx0, z - this.cz0) < TOWN_FLAT + 6) return true;
    return this.roadInfo(x, z).dist < 16;
  }

  /** Extra soft world bound at this point (0 = the default rim bound holds). */
  bound(x: number, z: number): number {
    if (Math.hypot(x - this.cx0, z - this.cz0) < 130) return TOWN_BOUND;
    return this.roadInfo(x, z).dist < 26 ? TOWN_BOUND : 0;
  }
}

/* -------------------------------------------------------------------------
   CitySystem — GLBs, instancing, colliders
   ------------------------------------------------------------------------- */

export interface CityHost {
  scene: THREE.Scene;
  /** One solid box per building (engine owns the physics world). */
  addSolid(x: number, z: number, hx: number, hy: number, hz: number, rotY: number): void;
}

export class CitySystem {
  private readonly protos = new Map<string, THREE.Object3D>();
  private readonly meshes: THREE.Object3D[] = [];
  private built = false;

  constructor(private readonly site: CitySite) {}

  /** Load every model the plan references; failures degrade to bare ground. */
  async load(onProgress?: (k: number) => void): Promise<void> {
    const wanted = new Map<string, "town" | "roads">();
    for (const t of this.site.tiles) wanted.set(t.model, "roads");
    for (const p of this.site.props) wanted.set(p.model, p.dir);
    for (const b of this.site.buildings) wanted.set(b.model, "town");

    const loader = new GLTFLoader();
    const entries = [...wanted];
    let done = 0;
    await Promise.all(
      entries.map(
        ([name, dir]) =>
          new Promise<void>((resolve) => {
            loader.load(
              `${dir === "town" ? TOWN_BASE : ROADS_BASE}/${name}.glb`,
              (g) => {
                this.protos.set(name, g.scene);
                onProgress?.(++done / entries.length);
                resolve();
              },
              undefined,
              () => {
                console.warn(`[jeep] city asset missing: ${dir}/${name}.glb`);
                onProgress?.(++done / entries.length);
                resolve();
              },
            );
          }),
      ),
    );
  }

  /** Build the instanced town + register the building colliders. */
  spawn(host: CityHost): void {
    if (this.built) return;
    const xfs = new Map<string, { x: number; y: number; z: number; yaw: number; roll?: number }[]>();
    const put = (model: string, x: number, y: number, z: number, yaw: number, roll?: number): void => {
      let arr = xfs.get(model);
      if (!arr) xfs.set(model, (arr = []));
      arr.push({ x, y, z, yaw, roll });
    };
    for (const t of this.site.tiles) {
      const w = this.site.toWorld(t.u, t.v);
      put(t.model, w.x, this.site.plateauY + 0.02, w.z, this.site.yaw + t.yaw);
    }
    for (const p of this.site.roadPieces) put("road-straight", p.x, p.y, p.z, p.yaw, p.roll);
    for (const p of this.site.props) put(p.model, p.x, p.y, p.z, p.yaw);
    for (const b of this.site.buildings) {
      put(b.model, b.x, b.y, b.z, b.yaw);
      host.addSolid(b.x, b.z, Math.max(0.4, b.hx - 0.45), b.colH, Math.max(0.4, b.hz - 0.45), b.rotY);
    }

    const d = new THREE.Object3D();
    for (const [model, list] of xfs) {
      const proto = this.protos.get(model);
      if (!proto) continue;
      const parts: { mesh: THREE.Mesh; cast: boolean }[] = [];
      proto.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) parts.push({ mesh: m, cast: !model.startsWith("road-") && model !== "path-long" });
      });
      for (const { mesh } of parts) {
        const im = new THREE.InstancedMesh(mesh.geometry, mesh.material as THREE.Material, list.length);
        im.receiveShadow = true;
        im.castShadow = parts[0].cast;
        for (let i = 0; i < list.length; i++) {
          const xf = list[i];
          d.position.set(xf.x, xf.y, xf.z);
          // road pieces carry a grade roll ("YXZ": roll tips the long axis
          // onto the slope before yaw orients it)
          d.rotation.set(0, xf.yaw, xf.roll ?? 0, "YXZ");
          d.scale.setScalar(TILE);
          d.updateMatrix();
          im.setMatrixAt(i, d.matrix);
        }
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        host.scene.add(im);
        this.meshes.push(im);
      }
    }
    this.built = true;
  }

  get instanceCount(): number {
    return this.meshes.length;
  }

  destroy(): void {
    for (const m of this.meshes) m.removeFromParent();
    this.meshes.length = 0;
    this.built = false;
  }
}
