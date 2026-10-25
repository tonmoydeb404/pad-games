/**
 * Racing engine — free roam on the Kenney Racing Kit.
 *
 * Owns the renderer, the Rapier world, the instanced tile world, the player
 * car, cameras, challenges, minimap and audio. Same lifecycle as the jeep
 * engine: construct → attach() → build() → start() (user gesture) → destroy().
 *
 * Conventions: units are metres/seconds, the car drives toward -Z, tiles sit
 * with their road surface flush at y = 0 (the kit's 0.2 m slab is sunk), the
 * grass is a single physics slab at y = 0.
 */
import * as THREE from "three";
import { RacingAudio } from "./audio";
import { loadCar, type CarRig } from "./cars";
import { ChallengeSystem, type ChallengeEvent } from "./challenges";
import { CarEffects } from "./effects";
import { RacingInput } from "./input";
import { MiniMap } from "./minimap";
import { IDLE_INTENT, PhysicsWorld, VehicleRig, initPhysics, type DriveIntent, type VehicleSpec } from "./physics";
import { CELL, TILES, dirVec, loadTile, rotYOf, rotatedSize, tileCenter, type LoadedTile, type Rot } from "./tiles";
import { buildWorld, cellKey, type WorldMap } from "./track";
import { clamp, kph, lerp } from "./util";

export type RacingQuality = "low" | "medium" | "high";
export type CameraMode = "chase" | "far" | "hood";

export interface HudFrame {
  speedKph: number;
  surface: "road" | "grass";
  airborne: boolean;
  boost: boolean;
  tokens: number;
  tokenTotal: number;
  /** Drift score building in the current zone (0 when outside). */
  drift: number;
  inZone: boolean;
}

const GRAVITY = 20;
const MAX_SPEED = 62;
const MAX_REV = 16;
/** The kit's asphalt top sits 0.1 m above its base — sunk so it is flush with the physics ground at y = 0. */
const ROAD_T = 0.1;
const FIXED_DT = 1 / 60;
const MAX_SUBSTEPS = 4;
const WORLD_HALF = 480;

const damp = (cur: number, tgt: number, rate: number, dt: number): number => lerp(cur, tgt, 1 - Math.exp(-rate * dt));

const SURFACE = {
  road: { grip: 1.0, drag: 1.0, accel: 1.0, top: 1.0 },
  grass: { grip: 0.62, drag: 2.6, accel: 0.62, top: 0.55 },
} as const;

export interface RacingEngineOptions {
  container: HTMLElement;
}

export class RacingEngine {
  onProgress: ((pct: number, label: string) => void) | null = null;
  onReady: (() => void) | null = null;
  onPauseChange: ((paused: boolean) => void) | null = null;
  onPadChange: ((connected: boolean, id: string) => void) | null = null;
  onHud: ((hud: HudFrame) => void) | null = null;
  onToast: ((text: string) => void) | null = null;

  readonly input = new RacingInput();
  readonly audio = new RacingAudio();
  quality: RacingQuality = "high";
  cameraMode: CameraMode = "chase";

  private readonly container: HTMLElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(62, 1, 0.5, 1400);
  private sun = new THREE.DirectionalLight(0xfff0d0, 2.2);
  private resizeObs: ResizeObserver | null = null;
  private raf = 0;
  private lastT = 0;
  private acc = 0;
  private time = 0;
  private hudT = 0;
  private mapT = 0;

  private map!: WorldMap;
  private pw: PhysicsWorld | null = null;
  private rig: VehicleRig | null = null;
  private car: CarRig | null = null;
  private carId = "race-car-white";
  private challenges!: ChallengeSystem;
  private miniMap: MiniMap | null = null;
  private minimapCanvas: HTMLCanvasElement | null = null;
  private tokenMeshes = new Map<string, THREE.Mesh>();
  private boostMats: THREE.MeshBasicMaterial[] = [];

  private started = false;
  private paused = false;
  private built = false;
  private destroyed = false;

  // vehicle state
  private pos = new THREE.Vector3();
  private quat = new THREE.Quaternion();
  private prevPos = new THREE.Vector3();
  private prevQuat = new THREE.Quaternion();
  private renderPos = new THREE.Vector3();
  private renderQuat = new THREE.Quaternion();
  private yaw = 0;
  private speed = 0;
  private lateral = 0;
  private steer = 0;
  private steerAngle = 0;
  private airborne = false;
  private noContact = 0;
  private overturnT = 0;
  private boostT = 0;
  private drift = 0;
  private surface: "road" | "grass" = "road";
  private lastGood = { x: 0, y: 1, z: 0, yaw: 0 };
  private wheelSpin = 0;
  private wheelBaseY: number[] = [];
  private camYaw = 0;
  private camLook = new THREE.Vector3();
  private orbit = 0;
  private lookYaw = 0;

  // visual dynamics (weight transfer, camera shake) + ground effects
  private effects: CarEffects | null = null;
  private visPrevSpeed = 0;
  private visPrevYaw = 0;
  private longAcc = 0;
  private yawRate = 0;
  private bodyPitch = 0;
  private bodyRoll = 0;
  private readonly shake = new THREE.Vector3();

  constructor(opts: RacingEngineOptions) {
    this.container = opts.container;
  }

  /* ---- lifecycle ------------------------------------------------------- */

  attach(): void {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = "block";
    this.container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.input.onConnectChange = (c, id) => this.onPadChange?.(c, id);
    this.input.attach();

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(this.container);
    this.resize();

    this.buildSky();
    this.applyQuality();
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private resize(): void {
    if (!this.renderer) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs?.disconnect();
    this.input.detach();
    this.input.onConnectChange = null;
    this.audio.dispose();
    this.effects?.dispose();
    this.rig?.dispose();
    this.pw?.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        // geometries are shared with the tile cache — only free per-engine ones
        const mat = m.material;
        if (!Array.isArray(mat) && (mat as THREE.Material & { userData: { own?: boolean } }).userData.own) mat.dispose();
      }
    });
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
    this.renderer = null;
  }

  /* ---- scene ----------------------------------------------------------- */

  private buildSky(): void {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 256;
    const g = c.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "#2b5fa8");
    grad.addColorStop(0.55, "#8fc0e8");
    grad.addColorStop(1, "#f6d9a8");
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = tex;
    this.scene.fog = new THREE.Fog(0xcfe0ea, 220, 620);

    this.scene.add(new THREE.HemisphereLight(0xbfdcff, 0x3d5a2c, 1.15));
    this.sun.position.set(120, 180, 60);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -70;
    sc.right = 70;
    sc.top = 70;
    sc.bottom = -70;
    sc.near = 10;
    sc.far = 520;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
  }

  setQuality(q: RacingQuality): void {
    this.quality = q;
    this.applyQuality();
  }

  private applyQuality(): void {
    const r = this.renderer;
    if (!r) return;
    const q = this.quality;
    r.shadowMap.enabled = q !== "low";
    const size = q === "high" ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    r.setPixelRatio(q === "low" ? 1 : Math.min(window.devicePixelRatio, q === "high" ? 2 : 1.5));
    this.resize();
  }

  /** Build the world, physics and the first car. */
  async build(): Promise<void> {
    this.onProgress?.(2, "Waking physics");
    await initPhysics();
    this.map = buildWorld();
    this.challenges = new ChallengeSystem(this.map);
    this.challenges.onEvent = (e) => this.onChallenge(e);
    const pw = new PhysicsWorld(GRAVITY);
    this.pw = pw;
    pw.addGround(WORLD_HALF);

    // ground slab
    const gtex = this.grassTexture();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2),
      new THREE.MeshLambertMaterial({ map: gtex, color: 0xffffff }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    ground.material.userData.own = true;
    this.scene.add(ground);

    // tiles
    const ids = [...new Set(this.map.placements.map((p) => p.tile))];
    const loaded = new Map<string, LoadedTile>();
    let done = 0;
    await Promise.all(
      ids.map(async (id) => {
        const t = await loadTile(id);
        if (t) loaded.set(id, t);
        done++;
        this.onProgress?.(5 + (done / ids.length) * 65, "Laying the track");
      }),
    );
    if (this.destroyed) return;
    this.placeTiles(pw, loaded);
    this.buildDecor();

    this.onProgress?.(78, "Building the garage");
    await this.setCar(this.carId, true);
    if (this.destroyed) return;
    this.effects = new CarEffects(this.scene);

    this.miniMap = new MiniMap(this.map);
    this.resetToSpawn();
    this.built = true;
    this.onProgress?.(100, "Ready");
    this.onReady?.();
  }

  private grassTexture(): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = "#4f8a3c";
    g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 260; i++) {
      const v = Math.random();
      g.fillStyle = v > 0.5 ? "rgba(90,150,60,0.55)" : "rgba(40,90,35,0.5)";
      g.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(WORLD_HALF / 4, WORLD_HALF / 4);
    t.anisotropy = 4;
    return t;
  }

  private placeTiles(pw: PhysicsWorld, loaded: Map<string, LoadedTile>): void {
    const byTile = new Map<string, typeof this.map.placements>();
    for (const p of this.map.placements) {
      if (!loaded.has(p.tile)) continue;
      (byTile.get(p.tile) ?? byTile.set(p.tile, []).get(p.tile)!).push(p);
    }
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(CELL, CELL, CELL);
    const up = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();

    for (const [id, list] of byTile) {
      const tile = loaded.get(id)!;
      const def = TILES[id];
      const isRoad = def.sockets.length > 0;
      const dy = isRoad ? -ROAD_T : 0;
      for (const part of tile.parts) {
        const inst = new THREE.InstancedMesh(part.geometry, part.material, list.length);
        inst.castShadow = def.shadow === true;
        inst.receiveShadow = true;
        inst.frustumCulled = false;
        list.forEach((p, i) => {
          const { w, d } = rotatedSize(def.w, def.d, p.rot as Rot);
          const c = tileCenter(p.gx, p.gz, w, d);
          pos.set(c.x, dy, c.z);
          q.setFromAxisAngle(up, rotYOf(p.rot as Rot));
          m4.compose(pos, q, s);
          inst.setMatrixAt(i, m4);
        });
        inst.instanceMatrix.needsUpdate = true;
        this.scene.add(inst);
      }

      for (const p of list) {
        const { w, d } = rotatedSize(def.w, def.d, p.rot as Rot);
        const c = tileCenter(p.gx, p.gz, w, d);
        const rotY = rotYOf(p.rot as Rot);
        if (def.collider.kind === "trimesh") {
          for (const part of tile.parts) {
            const g = part.geometry.clone();
            if (dy !== 0) g.translate(0, dy / CELL, 0);
            pw.addTrimesh(g, c.x, c.z, rotY, CELL, 1.0);
            g.dispose();
          }
        }
        const cos = Math.cos(rotY);
        const sin = Math.sin(rotY);
        for (const pc of def.propColliders ?? []) {
          const wx = c.x + pc.x * cos + pc.z * sin;
          const wz = c.z - pc.x * sin + pc.z * cos;
          if (pc.kind === "box") pw.addBox(wx, pc.h / 2, wz, pc.hw, pc.h / 2, pc.hd, rotY);
          else pw.addCylinder(wx, pc.h / 2, wz, pc.r, pc.h / 2);
        }
      }
    }
  }

  /** Boost pads, speed-trap gates, drift rings and collectible tokens. */
  private buildDecor(): void {
    // boost pads
    for (const b of this.map.boost) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 });
      mat.userData.own = true;
      this.boostMats.push(mat);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 7), mat);
      m.rotation.x = -Math.PI / 2;
      const f = dirVec(b.dir);
      m.rotation.z = Math.atan2(f.x, -f.z) * -1;
      m.position.set((b.gx + 0.5) * CELL, 0.06, (b.gz + 0.5) * CELL);
      this.scene.add(m);
    }
    // speed-trap gates
    const gateMat = new THREE.MeshLambertMaterial({ color: 0xfbbf24, emissive: 0x6b4a00 });
    gateMat.userData.own = true;
    for (const t of this.map.challenges.traps) {
      const cx = (t.gx + 0.5) * CELL;
      const cz = (t.gz + 0.5) * CELL;
      const alongZ = t.dir === 0 || t.dir === 2;
      const half = 5.4;
      const grp = new THREE.Group();
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 0.5), gateMat);
        post.position.set(side * half, 3, 0);
        grp.add(post);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.5, 0.7, 0.5), gateMat);
      bar.position.y = 6;
      grp.add(bar);
      grp.position.set(cx, 0, cz);
      grp.rotation.y = alongZ ? 0 : Math.PI / 2;
      this.scene.add(grp);
    }
    // drift zone rings
    for (const z of this.map.challenges.driftZones) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xfb923c, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
      mat.userData.own = true;
      const ring = new THREE.Mesh(new THREE.RingGeometry(z.r - 1.2, z.r, 64), mat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(z.x, 0.07, z.z);
      this.scene.add(ring);
    }
    // tokens
    const tokMat = new THREE.MeshLambertMaterial({ color: 0xfacc15, emissive: 0x8a6a00 });
    tokMat.userData.own = true;
    const tokGeo = new THREE.TorusGeometry(0.9, 0.28, 10, 24);
    for (const t of this.map.challenges.tokens) {
      const m = new THREE.Mesh(tokGeo, tokMat);
      m.position.set(t.x, t.y + 1.4, t.z);
      m.castShadow = true;
      this.scene.add(m);
      this.tokenMeshes.set(t.id, m);
    }
  }

  /* ---- car ------------------------------------------------------------- */

  /** Swap the player car (menu selection or before first build). */
  async setCar(id: string, initial = false): Promise<void> {
    const rig = await loadCar(id);
    if (!rig || this.destroyed) return;
    if (this.car) this.scene.remove(this.car.root);
    this.carId = id;
    this.car = rig;
    this.wheelBaseY = rig.wheels.map((w) => w.steer.position.y);
    rig.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = false;
      }
    });
    this.scene.add(rig.root);

    const spec = this.vehicleSpec(rig);
    if (!this.pw) return;
    if (this.rig) this.rig.build(spec);
    else {
      this.rig = new VehicleRig(this.pw, spec, { x: 0, y: 2, z: 0 });
    }
    if (!initial) this.resetToSpawn();
  }

  get currentCar(): string {
    return this.carId;
  }

  private vehicleSpec(rig: CarRig): VehicleSpec {
    const P = rig.spec.perf;
    return {
      mass: P.mass,
      length: rig.dims.length,
      width: rig.dims.width,
      wheelR: rig.dims.wheelR,
      axleOff: rig.dims.axleOff,
      wheels: rig.dims.wheels,
      spring: P.spring,
      damp: P.damp,
      comY: rig.dims.comY,
      gravity: GRAVITY,
      restitution: 0.15,
    };
  }

  private setPose(x: number, y: number, z: number, yaw: number): void {
    const rig = this.rig;
    if (!rig) return;
    const q = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
    rig.teleport({ x, y, z }, q);
    this.pos.set(x, y, z);
    this.quat.set(q.x, q.y, q.z, q.w);
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
    this.yaw = yaw;
    this.camYaw = yaw;
    this.speed = 0;
    this.lateral = 0;
    this.steer = 0;
    this.boostT = 0;
    this.overturnT = 0;
    this.noContact = 0;
    this.visPrevSpeed = 0;
    this.visPrevYaw = yaw;
    this.longAcc = this.yawRate = 0;
    this.effects?.clear();
  }

  resetToSpawn(): void {
    const s = this.map.spawn;
    const f = dirVec(s.dir);
    const yaw = Math.atan2(-f.x, -f.z);
    const h = (this.car?.dims.axleOff ?? 0.5) + 0.7;
    this.setPose((s.gx + 0.5) * CELL, h, (s.gz + 0.5) * CELL, yaw);
    this.lastGood = { x: (s.gx + 0.5) * CELL, y: h, z: (s.gz + 0.5) * CELL, yaw };
  }

  /** Back to the last safe road position. */
  resetCar(): void {
    const g = this.lastGood;
    this.setPose(g.x, g.y, g.z, g.yaw);
    this.input.rumble(0.25, 120);
  }

  /* ---- control --------------------------------------------------------- */

  /** Begin driving (must run inside the Start button's click handler). */
  start(): void {
    this.audio.start();
    this.started = true;
    this.setPaused(false);
  }

  setPaused(p: boolean): void {
    if (p === this.paused) return;
    this.paused = p;
    this.onPauseChange?.(p);
  }

  get isPaused(): boolean {
    return this.paused;
  }

  setMinimapCanvas(c: HTMLCanvasElement | null): void {
    this.minimapCanvas = c;
  }

  setMuted(m: boolean): void {
    this.audio.setMuted(m);
  }

  get muted(): boolean {
    return this.audio.isMuted;
  }

  cycleCamera(): CameraMode {
    this.cameraMode = this.cameraMode === "chase" ? "far" : this.cameraMode === "far" ? "hood" : "chase";
    return this.cameraMode;
  }

  private notify(text: string): void {
    this.onToast?.(text);
  }

  private onChallenge(e: ChallengeEvent): void {
    if (e.kind === "trap") {
      this.notify(e.passed ? `Speed trap ${e.kph} km/h — cleared (${e.target})` : `Speed trap ${e.kph} km/h — need ${e.target}`);
      if (e.passed) this.audio.chime();
      else this.audio.blip(330, 0.14, "square");
    } else if (e.kind === "drift-bank") {
      this.notify(`Drift +${e.score}  ·  best ${e.best}`);
      this.audio.chime();
    } else {
      this.notify(`Token ${e.collected}/${e.total}`);
      this.audio.blip(1040, 0.1);
      const m = this.tokenMeshes.get(e.id);
      if (m) m.visible = false;
    }
  }

  /* ---- loop ------------------------------------------------------------ */

  private frame = (now: number): void => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, Math.max(0, (now - this.lastT) / 1000));
    this.lastT = now;
    this.update(dt);
    this.renderer?.render(this.scene, this.camera);
  };

  private update(dt: number): void {
    const inp = this.input.sample();
    for (const a of this.input.consumeActions()) {
      if (a === "pause" && this.started) this.setPaused(!this.paused);
      else if (a === "camera") this.notify(`Camera: ${this.cycleCamera()}`);
      else if (a === "reset" && this.started && this.built) this.resetCar();
      else if (a === "mute") this.setMuted(!this.audio.isMuted);
    }
    // horn sounds only while held, and never while paused or before the start
    this.audio.horn(inp.horn && this.started && !this.paused);
    if (!this.built || !this.rig || !this.pw) {
      this.orbitCamera(dt);
      return;
    }
    this.time += dt;

    const live = this.started && !this.paused;
    if (live) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= FIXED_DT && steps < MAX_SUBSTEPS) {
        this.prevPos.copy(this.pos);
        this.prevQuat.copy(this.quat);
        this.step(FIXED_DT, inp);
        this.acc -= FIXED_DT;
        steps++;
      }
      if (steps === MAX_SUBSTEPS) this.acc = 0;
      const a = clamp(this.acc / FIXED_DT, 0, 1);
      this.renderPos.lerpVectors(this.prevPos, this.pos, a);
      this.renderQuat.slerpQuaternions(this.prevQuat, this.quat, a);

      if (this.overturnT > 3) {
        this.resetCar();
        this.notify("Auto-recovered");
      }
      if (this.pos.y < -25 || Math.abs(this.pos.x) > WORLD_HALF - 10 || Math.abs(this.pos.z) > WORLD_HALF - 10) {
        this.resetCar();
        this.notify("Back on track");
      }
    } else {
      this.renderPos.copy(this.pos);
      this.renderQuat.copy(this.quat);
    }

    this.syncCar(dt, live, inp);
    if (this.renderer) this.effects?.setPointScale(this.renderer.domElement.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360)));
    if (this.started && live) this.followCamera(dt, inp.lookX, inp.lookY);
    else this.orbitCamera(dt);

    // sun + shadow follow the car
    this.sun.target.position.copy(this.renderPos);
    this.sun.position.set(this.renderPos.x + 120, 180, this.renderPos.z + 60);

    // animate decor
    for (const [id, m] of this.tokenMeshes) {
      if (!m.visible) continue;
      m.rotation.y += dt * 2.2;
      m.position.y += Math.sin(this.time * 2 + id.length) * 0.003;
    }
    const pulse = 0.6 + Math.sin(this.time * 6) * 0.25;
    for (const m of this.boostMats) m.opacity = pulse;

    // audio
    if (this.audio.started) {
      this.audio.update({
        speed: this.speed,
        maxSpeed: MAX_SPEED,
        throttle: live ? inp.throttle : 0,
        drift: this.drift,
        airborne: this.airborne,
        offRoad: this.surface === "grass",
      });
    }
    this.input.update(dt, { speed: Math.abs(this.speed), maxSpeed: MAX_SPEED, rough: this.surface === "grass" ? 0.7 : 0.1 });

    // minimap + HUD
    this.mapT += dt;
    if (this.mapT > 0.06 && this.miniMap && this.minimapCanvas) {
      this.mapT = 0;
      this.miniMap.update(
        this.minimapCanvas,
        { x: this.pos.x, z: this.pos.z, yaw: this.yaw },
        {
          tokens: this.challenges.tokens.map((t) => ({ x: t.x, z: t.z, taken: this.challenges.collected.has(t.id) })),
          traps: this.challenges.traps.map((t) => ({ x: (t.gx + 0.5) * CELL, z: (t.gz + 0.5) * CELL })),
        },
      );
    }
    this.hudT += dt;
    if (this.hudT > 0.1) {
      this.hudT = 0;
      const zone = this.challenges.activeZone(this.pos.x, this.pos.z);
      this.onHud?.({
        speedKph: Math.round(kph(Math.abs(this.speed))),
        surface: this.surface,
        airborne: this.airborne,
        boost: this.boostT > 0,
        tokens: this.challenges.collected.size,
        tokenTotal: this.challenges.tokenCount,
        drift: zone ? this.challenges.liveDrift(zone.id) : 0,
        inZone: !!zone,
      });
    }
  }

  /** One fixed physics tick: intents → Rapier → read back. */
  private step(dt: number, inp: ReturnType<RacingInput["sample"]>): void {
    const rig = this.rig!;
    const pw = this.pw!;
    const car = this.car!;
    const P = car.spec.perf;

    const sp = rig.speeds();
    this.speed = sp.forward;
    this.lateral = sp.lateral;

    // surface under the car
    const gx = Math.floor(this.pos.x / CELL);
    const gz = Math.floor(this.pos.z / CELL);
    const k = cellKey(gx, gz);
    const onRoad = this.map.road.has(k) || (this.map.deck.has(k) && this.pos.y > 2);
    this.surface = onRoad ? "road" : "grass";
    const S = SURFACE[this.surface];

    // boost pads
    if (!this.airborne) {
      for (const b of this.map.boost) {
        const dx = this.pos.x - (b.gx + 0.5) * CELL;
        const dz = this.pos.z - (b.gz + 0.5) * CELL;
        if (dx * dx + dz * dz < 6 * 6 && this.boostT < 0.6) {
          this.boostT = 1.6;
          this.audio.boost();
          this.input.rumble(0.5, 260);
          this.notify("Boost!");
        }
      }
    }
    const boosting = this.boostT > 0;
    this.boostT = Math.max(0, this.boostT - dt);

    const top = MAX_SPEED * P.speed * S.top * (boosting ? 1.3 : 1);
    const throttle = inp.throttle;
    const brake = inp.brake;
    this.steer = clamp(damp(this.steer, inp.steer * (1 - 0.5 * clamp(Math.abs(this.speed) / top, 0, 1)), P.steer, dt), -1, 1);

    const air = this.airborne;
    const fw = rig.forward();
    const slope = clamp(fw.y / Math.max(0.1, Math.hypot(fw.x, fw.z)), -1.6, 1.6);
    const traction = clamp(1.06 - Math.abs(slope) * 0.8, 0.25, 1);
    const sgn = Math.sign(this.speed);

    let drive = 0;
    let brakeA = 0;
    if (throttle > 0.01 && !air) {
      if (this.speed < -0.3) brakeA += throttle * 34 * S.grip * traction;
      else drive += throttle * P.accel * S.accel * traction * (1 - clamp(Math.max(this.speed, 0) / top, 0, 1) * 0.75);
    }
    if (brake > 0.01 && !air) {
      if (this.speed > 0.4) brakeA += brake * P.brake * S.grip * traction;
      else drive -= brake * 18 * S.accel * traction;
    }
    if (boosting && !air) drive += 38;
    if (inp.handbrake && !air) brakeA += clamp(Math.abs(this.speed) * 2.2, 0, 9);
    if (!air && Math.abs(this.speed) < 0.6 && throttle < 0.02 && brake < 0.02) brakeA += 10;

    let resist = -(this.speed * 0.3 * S.drag * 0.6) * (air ? 0.12 : 1);
    resist -= sgn * 0.35 * S.drag * (air ? 0 : 1);
    if (this.speed > top) {
      drive = Math.min(drive, 0);
      resist -= (this.speed - top) * 6;
    }
    if (this.speed < -MAX_REV && drive < 0) drive = 0;

    const grip = S.grip * P.grip;
    const turnRate =
      this.steer * 1.0 * P.agility * clamp(Math.abs(this.speed) / 3.2, 0, 1) * Math.sign(this.speed || 1) * (air ? 0.12 : 1);
    const yawTarget = turnRate * clamp(1.4 - (Math.abs(this.speed) / top) * 0.7, 0.55, 1.4) * (inp.handbrake ? 1.4 : 1);
    const wb = Math.max(1.5, Math.abs(car.dims.wheels[2].z - car.dims.wheels[0].z));
    const vs = Math.abs(this.speed) < 1.5 ? 1.5 * (this.speed < 0 ? -1 : 1) : this.speed;
    this.steerAngle = clamp(Math.atan((yawTarget * wb) / vs), -0.55, 0.55);
    const sideGrip = clamp(grip, 0.3, 1.6);

    const intent: DriveIntent = {
      ...IDLE_INTENT,
      driveAccel: isFinite(drive) ? drive : 0,
      brakeAccel: brakeA,
      steerAngle: this.steerAngle,
      grip: clamp(grip, 0.4, 1.6),
      sideGrip,
      rearSideGrip: sideGrip * (inp.handbrake ? 0.28 : 1),
      yawTarget: Math.abs(this.steer) > 0.05 ? yawTarget : null,
      resist: isFinite(resist) ? resist : 0,
    };

    const velY0 = rig.body.linvel().y;
    rig.drive(intent, dt);
    pw.step(dt);

    // read back
    const t = rig.body.translation();
    const r = rig.body.rotation();
    this.pos.set(t.x, t.y, t.z);
    this.quat.set(r.x, r.y, r.z, r.w);
    const f = rig.forward();
    this.yaw = Math.atan2(-f.x, -f.z);
    this.noContact = rig.contacts === 0 ? this.noContact + 1 : 0;
    const wasAir = this.airborne;
    this.airborne = this.noContact >= 3;
    const up = rig.up();
    if (up.y < 0.45) this.overturnT += dt;
    else this.overturnT = Math.max(0, this.overturnT - dt * 2);

    // landing thump
    if (wasAir && !this.airborne) {
      const impact = Math.abs(rig.body.linvel().y - velY0);
      if (impact > 6) this.input.rumble(clamp(impact / 22, 0.25, 1), 220);
    }
    // remember the last safe road spot
    if (onRoad && !this.airborne && up.y > 0.8 && Math.abs(this.pos.y) < 8) {
      this.lastGood = { x: this.pos.x, y: this.pos.y + 0.3, z: this.pos.z, yaw: this.yaw };
    }

    // drift amount
    this.drift = !this.airborne && Math.abs(this.speed) > 8 ? clamp(Math.abs(this.lateral) / 9, 0, 1) : 0;
    this.challenges.update(dt, {
      x: this.pos.x,
      z: this.pos.z,
      speed: this.speed,
      drift: this.drift,
      grounded: !this.airborne,
    });
  }

  /** Mesh follows the interpolated body; wheels spin, steer and settle. */
  private syncCar(dt: number, live: boolean, inp: ReturnType<RacingInput["sample"]>): void {
    const car = this.car;
    const rig = this.rig;
    if (!car || !rig) return;
    car.root.position.copy(this.renderPos);
    car.root.quaternion.copy(this.renderQuat);
    const scale = car.root.scale.x || 1;
    this.wheelSpin -= (live ? this.speed : 0) * dt;
    car.wheels.forEach((w, i) => {
      w.spin.rotation.x = this.wheelSpin / w.radius;
      w.steer.rotation.y = w.front ? this.steerAngle * 0.9 : 0;
      const drop = clamp(rig.wheelDrop(i), -0.2, 0.2);
      // 3 cm of tyre squash so the wheels read as planted, not perched
      w.steer.position.y = this.wheelBaseY[i] + (drop - 0.03) / scale;
    });

    // weight transfer: squat on throttle, dive on the brakes, roll in corners
    if (live && dt > 0) {
      this.longAcc = damp(this.longAcc, clamp((this.speed - this.visPrevSpeed) / dt, -45, 45), 10, dt);
      this.yawRate = damp(this.yawRate, clamp(angleDiff(this.yaw, this.visPrevYaw) / dt, -3, 3), 12, dt);
      this.visPrevSpeed = this.speed;
      this.visPrevYaw = this.yaw;
    }
    const pitchT = this.airborne ? 0 : clamp(this.longAcc * 0.0022, -0.06, 0.06);
    const rollT = this.airborne ? 0 : -clamp(this.speed * this.yawRate * 0.0032, -0.09, 0.09);
    this.bodyPitch = damp(this.bodyPitch, pitchT, 9, dt);
    this.bodyRoll = damp(this.bodyRoll, rollT, 9, dt);
    const body = car.root.children[0];
    if (body) {
      body.rotation.x = this.bodyPitch;
      body.rotation.z = this.bodyRoll;
    }

    // contact shadows, tyre smoke, dust, skid marks
    if (this.effects) {
      const contacts = [0, 1, 2, 3].map((i) => {
        if (!rig.controller.wheelIsInContact(i)) return null;
        const c = rig.controller.wheelContactPoint(i);
        return c ? { x: c.x, y: c.y, z: c.z } : null;
      });
      this.effects.update({
        dt: live ? dt : 0,
        contacts,
        yaw: this.yaw,
        speed: this.speed,
        throttle: live ? inp.throttle : 0,
        handbrake: live && inp.handbrake,
        drift: this.drift,
        onGrass: this.surface === "grass",
        airborne: this.airborne,
        body: this.renderPos,
        length: car.dims.length,
        width: car.dims.width,
      });
    }
  }

  /* ---- cameras --------------------------------------------------------- */

  private orbitCamera(dt: number): void {
    this.orbit += dt * 0.35;
    const p = this.car ? this.renderPos : this.pos;
    const r = 9;
    this.camera.position.set(p.x + Math.sin(this.orbit) * r, p.y + 3.2, p.z + Math.cos(this.orbit) * r);
    this.camera.lookAt(p.x, p.y + 0.7, p.z);
    this.camera.fov = 48;
    this.camera.updateProjectionMatrix();
  }

  private followCamera(dt: number, lookX: number, lookY: number): void {
    const p = this.renderPos;
    this.camera.position.sub(this.shake); // remove last frame's shake before easing
    this.camYaw += angleDiff(this.yaw, this.camYaw) * (1 - Math.exp(-5 * dt));
    this.lookYaw = damp(this.lookYaw, -lookX * 1.4, 6, dt);
    const yaw = this.camYaw + this.lookYaw;
    const speedK = clamp(Math.abs(this.speed) / MAX_SPEED, 0, 1);

    let dist = 8.5;
    let height = 3.1;
    if (this.cameraMode === "far") {
      dist = 13;
      height = 5.2;
    }
    if (this.cameraMode === "hood") {
      dist = -0.6;
      height = 1.2;
    }
    dist += speedK * 1.5;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const tx = p.x + sin * dist;
    const tz = p.z + cos * dist;
    const ty = p.y + height - lookY * 1.5;
    const k = this.cameraMode === "hood" ? 1 : 1 - Math.exp(-9 * dt);
    this.camera.position.x = lerp(this.camera.position.x, tx, k);
    this.camera.position.y = lerp(this.camera.position.y, ty, k);
    this.camera.position.z = lerp(this.camera.position.z, tz, k);
    // never dip below the ground
    this.camera.position.y = Math.max(this.camera.position.y, 0.6);
    const ahead = this.cameraMode === "hood" ? 20 : 6;
    this.camLook.set(p.x - sin * ahead, p.y + 1.0, p.z - cos * ahead);
    // speed rumble, rougher off-road and under boost
    const amp = ((this.surface === "grass" ? 0.05 : 0.006) + (this.boostT > 0 ? 0.03 : 0)) * speedK;
    this.shake.set(Math.sin(this.time * 47) * amp, Math.sin(this.time * 61) * amp, Math.sin(this.time * 53) * amp);
    this.camera.position.add(this.shake);
    this.camera.lookAt(this.camLook);
    // lean into the corner
    this.camera.rotateZ(-clamp(this.yawRate, -1.5, 1.5) * speedK * 0.06);
    const fov = 60 + speedK * 16 + (this.boostT > 0 ? 8 : 0);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = lerp(this.camera.fov, fov, 1 - Math.exp(-4 * dt));
      this.camera.updateProjectionMatrix();
    }
  }
}

/** Shortest signed angle from `b` to `a`. */
function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
