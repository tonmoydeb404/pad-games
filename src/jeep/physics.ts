/**
 * Rapier physics for Jungle Jeep — world, streamed colliders, vehicle rig.
 *
 * Designed for an open world: nothing here assumes the map is finite or that
 * everything exists at once.
 *   - Terrain collision is a set of heightfield CHUNKS, created around the car
 *     and dropped behind it (`TerrainStreamer`). Chunks are cut from the same
 *     height lattice as the rendered mesh, and Rapier's heightfield uses the
 *     same cell diagonal as three's PlaneGeometry, so wheels touch exactly the
 *     surface you see.
 *   - Props (trunks, boulders, logs) are registered as cheap definitions in a
 *     spatial hash and only become Rapier colliders while the car is near
 *     (`PropStreamer`) — a world with 100k trees costs the same as one with 100.
 *   - The car is a dynamic body with a raycast-vehicle controller (suspension,
 *     friction, steering). The engine feeds it arcade-level intents (drive
 *     acceleration, steering target, grip) and stays out of the physics.
 *
 * Conventions match the engine's rig space: the vehicle drives toward -Z,
 * local +X is right, +Y is up. Gravity and units are the engine's (u, s).
 */
import RAPIER from "@dimforge/rapier3d-compat";
import type { HeightGrid } from "./ground";

export { RAPIER };

let ready: Promise<void> | null = null;
/** Load the WASM module once (the compat build embeds it — no asset config). */
export function initPhysics(): Promise<void> {
  return (ready ??= RAPIER.init());
}

/** Bump-stop spring (per-unit-mass accel per unit overshoot) and force cap. */
const BUMP_K = 4000;
const BUMP_CAP = 500;

export class PhysicsWorld {
  readonly world: RAPIER.World;
  readonly events = new RAPIER.EventQueue(true);

  constructor(gravity: number) {
    this.world = new RAPIER.World({ x: 0, y: -gravity, z: 0 });
  }

  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step(this.events);
  }

  /** Highest solid surface under (x, z), or null. Debug/tests/camera. */
  groundAt(x: number, z: number, fromY = 500): number | null {
    const hit = this.world.castRay(new RAPIER.Ray({ x, y: fromY, z }, { x: 0, y: -1, z: 0 }), fromY + 500, true);
    return hit ? fromY - hit.timeOfImpact : null;
  }

  dispose(): void {
    this.events.free();
    this.world.free();
  }
}

/* -------------------------------------------------------------------------
   Terrain chunks
   ------------------------------------------------------------------------- */

export class TerrainStreamer {
  private readonly chunks = new Map<number, RAPIER.Collider>();
  private lastCx = NaN;
  private lastCz = NaN;
  private readonly step: number;

  /**
   * @param cells   lattice cells per chunk side (collider per chunk)
   * @param radius  chunks kept around the car, each way (1 = 3×3)
   */
  constructor(
    private readonly pw: PhysicsWorld,
    private readonly grid: HeightGrid,
    private readonly cells = 32,
    private readonly radius = 1,
  ) {
    this.step = grid.size / grid.seg;
  }

  get loaded(): number {
    return this.chunks.size;
  }

  private key(cx: number, cz: number): number {
    return (cx + 1024) * 4096 + (cz + 1024);
  }

  private add(cx: number, cz: number): void {
    const g = this.grid;
    const i0 = cx * this.cells;
    const j0 = cz * this.cells;
    if (i0 < 0 || j0 < 0 || i0 >= g.seg || j0 >= g.seg) return;
    const nx = Math.min(this.cells, g.seg - i0);
    const nz = Math.min(this.cells, g.seg - j0);
    const n = g.seg + 1;
    // Rapier layout: heights[ix * (nz + 1) + iz] — first index runs along x
    const H = new Float32Array((nx + 1) * (nz + 1));
    for (let ix = 0; ix <= nx; ix++)
      for (let iz = 0; iz <= nz; iz++) H[ix * (nz + 1) + iz] = g.heights[(j0 + iz) * n + (i0 + ix)];
    const sx = nx * this.step;
    const sz = nz * this.step;
    const desc = RAPIER.ColliderDesc.heightfield(nx, nz, H, { x: sx, y: 1, z: sz })
      .setTranslation(-g.size / 2 + i0 * this.step + sx / 2, 0, -g.size / 2 + j0 * this.step + sz / 2)
      .setFriction(0.9);
    this.chunks.set(this.key(cx, cz), this.pw.world.createCollider(desc));
  }

  /** Call every tick — cheap unless the car crossed a chunk border. */
  update(x: number, z: number, force = false): void {
    const size = this.cells * this.step;
    const cx = Math.floor((x + this.grid.size / 2) / size);
    const cz = Math.floor((z + this.grid.size / 2) / size);
    if (!force && cx === this.lastCx && cz === this.lastCz) return;
    this.lastCx = cx;
    this.lastCz = cz;
    const r = this.radius;
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        const k = this.key(cx + dx, cz + dz);
        if (!this.chunks.has(k)) this.add(cx + dx, cz + dz);
      }
    for (const [k, col] of this.chunks) {
      const kx = Math.floor(k / 4096) - 1024;
      const kz = (k % 4096) - 1024;
      if (Math.abs(kx - cx) > r + 1 || Math.abs(kz - cz) > r + 1) {
        this.pw.world.removeCollider(col, false);
        this.chunks.delete(k);
      }
    }
  }
}

/* -------------------------------------------------------------------------
   Props (trunks, boulders, logs)
   ------------------------------------------------------------------------- */

export type PropShape =
  | { kind: "cylinder"; halfHeight: number; radius: number }
  | { kind: "ball"; radius: number }
  /** Horizontal capsule along local X (cylinder part is 2·halfLen long). */
  | { kind: "log"; halfLen: number; radius: number }
  /** Axis-aligned-then-yawed box (city buildings). */
  | { kind: "box"; hx: number; hy: number; hz: number };

export interface PropDef {
  shape: PropShape;
  /** Centre of the shape. */
  x: number;
  y: number;
  z: number;
  /** Heading about Y (radians) — logs. */
  rotY?: number;
  /** Bounciness 0..1. */
  e: number;
}

export class PropStreamer {
  private readonly cell = 32;
  private readonly defs = new Map<number, PropDef[]>();
  private readonly live = new Map<PropDef, RAPIER.Collider>();
  private count = 0;

  constructor(private readonly pw: PhysicsWorld) {}

  get total(): number {
    return this.count;
  }
  get active(): number {
    return this.live.size;
  }

  private key(cx: number, cz: number): number {
    return (cx + 2048) * 8192 + (cz + 2048);
  }

  add(def: PropDef): void {
    const k = this.key(Math.floor(def.x / this.cell), Math.floor(def.z / this.cell));
    let arr = this.defs.get(k);
    if (!arr) this.defs.set(k, (arr = []));
    arr.push(def);
    this.count++;
  }

  private make(def: PropDef): RAPIER.Collider {
    const s = def.shape;
    let desc: RAPIER.ColliderDesc;
    if (s.kind === "cylinder") desc = RAPIER.ColliderDesc.cylinder(s.halfHeight, s.radius);
    else if (s.kind === "ball") desc = RAPIER.ColliderDesc.ball(s.radius);
    else if (s.kind === "box") {
      const h = (def.rotY ?? 0) / 2;
      desc = RAPIER.ColliderDesc.cuboid(s.hx, s.hy, s.hz).setRotation({
        x: 0,
        y: Math.sin(h),
        z: 0,
        w: Math.cos(h),
      });
    } else {
      // capsules stand along Y; lay it along X (Rz 90°) then yaw it (Ry)
      const h = (def.rotY ?? 0) / 2;
      const a = Math.SQRT1_2;
      const qy = { x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) };
      const qz = { x: 0, y: 0, z: a, w: a };
      desc = RAPIER.ColliderDesc.capsule(s.halfLen, s.radius).setRotation({
        x: qy.w * qz.x + qy.y * qz.z - qy.z * qz.y + qy.x * qz.w,
        y: qy.w * qz.y + qy.z * qz.x - qy.x * qz.z + qy.y * qz.w,
        z: qy.w * qz.z + qy.x * qz.y - qy.y * qz.x + qy.z * qz.w,
        w: qy.w * qz.w - qy.x * qz.x - qy.y * qz.y - qy.z * qz.z,
      });
    }
    desc.setTranslation(def.x, def.y, def.z).setRestitution(def.e).setFriction(0.35);
    return this.pw.world.createCollider(desc);
  }

  /** Activate props within `radius` of (x, z); retire those beyond radius+margin. */
  update(x: number, z: number, radius = 90): void {
    const c0x = Math.floor((x - radius) / this.cell);
    const c1x = Math.floor((x + radius) / this.cell);
    const c0z = Math.floor((z - radius) / this.cell);
    const c1z = Math.floor((z + radius) / this.cell);
    const r2 = radius * radius;
    for (let cx = c0x; cx <= c1x; cx++)
      for (let cz = c0z; cz <= c1z; cz++) {
        const arr = this.defs.get(this.key(cx, cz));
        if (!arr) continue;
        for (const d of arr) {
          if (this.live.has(d)) continue;
          const dx = d.x - x;
          const dz = d.z - z;
          if (dx * dx + dz * dz <= r2) this.live.set(d, this.make(d));
        }
      }
    const keep = (radius + 40) * (radius + 40);
    for (const [d, col] of this.live) {
      const dx = d.x - x;
      const dz = d.z - z;
      if (dx * dx + dz * dz > keep) {
        this.pw.world.removeCollider(col, false);
        this.live.delete(d);
      }
    }
  }
}

/* -------------------------------------------------------------------------
   Vehicle
   ------------------------------------------------------------------------- */

export interface VehicleSpec {
  mass: number;
  length: number;
  width: number;
  wheelR: number;
  /** Wheel centre sits this far below the body origin at rest. */
  axleOff: number;
  /** FL FR RL RR, body frame (x right, z back). */
  wheels: { x: number; z: number }[];
  /** ω² of the body bounce (jeep 130). */
  spring: number;
  /** Legacy damping coefficient: ζ = damp / (2·√spring). */
  damp: number;
  /** Local height of the centre of mass (negative = below the origin). */
  comY: number;
  gravity: number;
  /** Shell bounciness (heavy vehicles plow, light ones ricochet). */
  restitution?: number;
}

/** What the engine asks of the car each tick (arcade-level intents). */
export interface DriveIntent {
  /** Net drive acceleration along the heading (u/s², already includes engine,
   *  reverse and brake blending; negative = decelerate). */
  driveAccel: number;
  /** Extra braking deceleration through the tyres (always ≥ 0). */
  brakeAccel: number;
  /** Front wheel angle, radians (+ = turn left, nose toward -x). */
  steerAngle: number;
  /** Friction multipliers (surface × car × damage). */
  grip: number;
  sideGrip: number;
  rearSideGrip: number;
  /** Target yaw rate, rad/s (+ = left) for the stability assist; null = none. */
  yawTarget: number | null;
  /** Resistive deceleration along the heading, u/s² (already signed vs speed). */
  resist: number;
}

export const IDLE_INTENT: DriveIntent = {
  driveAccel: 0,
  brakeAccel: 0,
  steerAngle: 0,
  grip: 1,
  sideGrip: 1,
  rearSideGrip: 1,
  yawTarget: null,
  resist: 0,
};

export class VehicleRig {
  body!: RAPIER.RigidBody;
  collider!: RAPIER.Collider;
  controller!: RAPIER.DynamicRayCastVehicleController;
  spec!: VehicleSpec;
  /** Restitution-free shell: obstacle bounce comes from the obstacle side. */
  private inertia = { x: 1, y: 1, z: 1 };
  private readonly rest = 0.45;
  private readonly travel = 0.3;
  /** Wheels in contact after the last step. */
  contacts = 0;

  constructor(
    private readonly pw: PhysicsWorld,
    spec: VehicleSpec,
    pos = { x: 0, y: 2, z: 0 },
    quat = { x: 0, y: 0, z: 0, w: 1 },
  ) {
    this.build(spec, pos, quat);
  }

  /** (Re)build the body for a new vehicle, keeping position/orientation. */
  build(spec: VehicleSpec, pos?: { x: number; y: number; z: number }, quat?: { x: number; y: number; z: number; w: number }): void {
    const world = this.pw.world;
    const keepPos = pos ?? (this.body ? this.body.translation() : { x: 0, y: 2, z: 0 });
    const keepQuat = quat ?? (this.body ? this.body.rotation() : { x: 0, y: 0, z: 0, w: 1 });
    const keepVel = this.body ? this.body.linvel() : { x: 0, y: 0, z: 0 };
    if (this.controller) world.removeVehicleController(this.controller);
    if (this.body) world.removeRigidBody(this.body);
    this.spec = spec;

    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(keepPos.x, keepPos.y, keepPos.z)
        .setRotation(keepQuat)
        .setLinvel(keepVel.x, keepVel.y, keepVel.z)
        .setCanSleep(false)
        .setCcdEnabled(true)
        .setAngularDamping(0.15),
    );
    // slab shell: sits above the wheels, slightly shorter than the footprint
    const hh = 0.5;
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(spec.width / 2 - 0.05, hh, spec.length / 2 - 0.1)
        .setTranslation(0, 0.2, 0)
        .setDensity(0)
        .setFriction(0.25)
        .setRestitution(spec.restitution ?? 0.1)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(spec.mass * 6), // report even gentle contact (Δv ≈ 0.1/tick)
      this.body,
    );
    // box inertia about the (lowered) COM; a touch generous for stability
    const w = spec.width;
    const h = 1.4;
    const l = spec.length;
    const m = spec.mass;
    this.inertia = { x: (m * (h * h + l * l)) / 12, y: (m * (w * w + l * l)) / 12, z: (m * (w * w + h * h)) / 12 };
    this.body.setAdditionalMassProperties(
      m,
      { x: 0, y: spec.comY, z: 0 },
      { x: this.inertia.x * 1.25, y: this.inertia.y * 1.25, z: this.inertia.z * 1.25 },
      { x: 0, y: 0, z: 0, w: 1 },
      true,
    );

    const c = world.createVehicleController(this.body);
    this.controller = c;
    const k = spec.spring / 4; // mass-normalised per-wheel stiffness
    const eq = spec.gravity / spec.spring; // static compression
    const zeta = Math.min(0.9, Math.max(0.25, spec.damp / (2 * Math.sqrt(spec.spring))));
    const dW = (zeta * 2 * Math.sqrt(spec.spring)) / 4;
    for (let i = 0; i < 4; i++) {
      const w = spec.wheels[i];
      // connection point so the wheel centre rests at -axleOff when compressed by `eq`
      const connY = -spec.axleOff + this.rest - eq;
      c.addWheel({ x: w.x, y: connY, z: w.z }, { x: 0, y: -1, z: 0 }, { x: 1, y: 0, z: 0 }, this.rest, spec.wheelR);
      c.setWheelSuspensionStiffness(i, k);
      c.setWheelSuspensionCompression(i, dW * 0.9);
      c.setWheelSuspensionRelaxation(i, dW * 1.1);
      c.setWheelMaxSuspensionTravel(i, this.travel);
      c.setWheelMaxSuspensionForce(i, m * spec.gravity * 12);
      c.setWheelFrictionSlip(i, 10.5);
      c.setWheelSideFrictionStiffness(i, 1);
    }
  }

  dispose(): void {
    this.pw.world.removeVehicleController(this.controller);
    this.pw.world.removeRigidBody(this.body);
  }

  teleport(pos: { x: number; y: number; z: number }, quat: { x: number; y: number; z: number; w: number }): void {
    this.body.setTranslation(pos, true);
    this.body.setRotation(quat, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  /** Orientation helpers (world space). */
  forward(out = { x: 0, y: 0, z: 0 }): { x: number; y: number; z: number } {
    return rotate(this.body.rotation(), 0, 0, -1, out);
  }
  right(out = { x: 0, y: 0, z: 0 }): { x: number; y: number; z: number } {
    return rotate(this.body.rotation(), 1, 0, 0, out);
  }
  up(out = { x: 0, y: 0, z: 0 }): { x: number; y: number; z: number } {
    return rotate(this.body.rotation(), 0, 1, 0, out);
  }

  /** Forward / lateral speed over the ground plane (u/s). */
  speeds(): { forward: number; lateral: number } {
    const v = this.body.linvel();
    const f = this.forward();
    const r = this.right();
    const fl = Math.hypot(f.x, f.z) || 1;
    const rl = Math.hypot(r.x, r.z) || 1;
    return {
      forward: (v.x * f.x + v.z * f.z) / fl,
      lateral: (v.x * r.x + v.z * r.z) / rl,
    };
  }

  /** Apply arcade intents, then advance the vehicle controller (call before world.step). */
  drive(intent: DriveIntent, dt: number): void {
    const c = this.controller;
    const m = this.spec.mass;
    // drive force through all four wheels (4×4). Braking is NOT done at the
    // wheels: a hard brake there acts well below the centre of mass and
    // pitches the car over its nose. It's applied through the COM below.
    const fe = (intent.driveAccel * m) / 4;
    for (let i = 0; i < 4; i++) {
      c.setWheelEngineForce(i, fe);
      c.setWheelBrake(i, 0);
      c.setWheelSteering(i, i < 2 ? intent.steerAngle : 0);
      c.setWheelFrictionSlip(i, 10.5 * intent.grip);
      c.setWheelSideFrictionStiffness(i, (i < 2 ? intent.sideGrip : intent.rearSideGrip) * 1.0);
    }
    c.updateVehicle(dt);

    // contacts after the ray-casts
    let n = 0;
    for (let i = 0; i < 4; i++) if (c.wheelIsInContact(i)) n++;
    this.contacts = n;
    this.bumpStops(dt);

    // braking: decelerate along the heading, never past standstill, in
    // proportion to how many wheels are actually gripping
    if (intent.brakeAccel > 0 && n > 0) {
      const f = this.forward(this.tmpF);
      const fl = Math.hypot(f.x, f.z) || 1;
      const hx = f.x / fl;
      const hz = f.z / fl;
      const lin = this.body.linvel();
      const vf = lin.x * hx + lin.z * hz;
      const dv = Math.min(intent.brakeAccel * dt * (n / 4), Math.abs(vf));
      const s = vf >= 0 ? -1 : 1;
      this.body.applyImpulse({ x: hx * dv * s * m, y: 0, z: hz * dv * s * m }, true);
    }

    // resistance (rolling, drag, roughness) acts along the heading
    if (intent.resist !== 0) {
      const f = this.forward(this.tmpF);
      const fl = Math.hypot(f.x, f.z) || 1;
      this.body.applyImpulse({ x: (f.x / fl) * intent.resist * m * dt, y: 0, z: (f.z / fl) * intent.resist * m * dt }, true);
    }

    // In the air: the nose gently follows the flight path and the car rights
    // itself — wheels-first landings, but it still tips off a lip.
    if (n === 0) this.airControl(dt);

    // yaw stability assist: pull the yaw rate toward the target (grounded only)
    if (intent.yawTarget !== null && n >= 3) {
      const up = this.up(this.tmpU);
      const w = this.body.angvel();
      const wy = w.x * up.x + w.y * up.y + w.z * up.z; // rate about the car's up
      const k = 7; // 1/s — authority of the assist
      const dw = (intent.yawTarget - wy) * Math.min(1, k * dt);
      const I = this.inertia.y;
      this.body.applyTorqueImpulse({ x: up.x * dw * I, y: up.y * dw * I, z: up.z * dw * I }, true);
    }
  }

  /**
   * Bump stops. The controller clamps suspension travel but pushes back no
   * harder once it's reached, so a hard landing would drive the chassis into
   * the ground. Where a wheel is pressed past its limit, add a stiff
   * spring-damper along the contact normal, in proportion to the overshoot.
   */
  private bumpStops(dt: number): void {
    const c = this.controller;
    const m = this.spec.mass / 4;
    const minLen = this.rest - this.travel;
    const body = this.body;
    let lin: { x: number; y: number; z: number } | null = null;
    for (let i = 0; i < 4; i++) {
      if (!c.wheelIsInContact(i)) continue;
      const hp = c.wheelHardPoint(i, this.tmpH);
      const cp = c.wheelContactPoint(i, this.tmpC);
      if (!hp || !cp) continue;
      const raw = Math.hypot(hp.x - cp.x, hp.y - cp.y, hp.z - cp.z) - this.spec.wheelR;
      const pen = minLen - raw;
      if (pen <= 0) continue;
      // push along the suspension axis (chassis up), like the real spring —
      // along the ground normal it would also brake the car on an incline
      const up = this.up(this.tmpU);
      lin ??= body.linvel();
      const w = body.angvel();
      const com = body.worldCom();
      const rx = cp.x - com.x;
      const ry = cp.y - com.y;
      const rz = cp.z - com.z;
      const vx = lin.x + (w.y * rz - w.z * ry);
      const vy = lin.y + (w.z * rx - w.x * rz);
      const vz = lin.z + (w.x * ry - w.y * rx);
      const closing = -(vx * up.x + vy * up.y + vz * up.z);
      // critically damped both ways, so it absorbs the landing instead of
      // throwing the car back up; never pulls (a ≥ 0)
      const a = Math.min(BUMP_CAP, Math.max(0, BUMP_K * pen + 2 * Math.sqrt(BUMP_K) * closing));
      const j = a * m * dt;
      body.applyImpulseAtPoint({ x: up.x * j, y: up.y * j, z: up.z * j }, cp, true);
      lin = null; // velocity changed — re-read for the next wheel
    }
  }

  private readonly tmpH = { x: 0, y: 0, z: 0 };
  private readonly tmpC = { x: 0, y: 0, z: 0 };

  /** A wheel's suspension is pressed to its limit (hard landing / big hit). */
  bottomedOut(): boolean {
    for (let i = 0; i < 4; i++) {
      const len = this.controller.wheelSuspensionLength(i);
      if (len !== null && len <= this.rest - this.travel + 0.005) return true;
    }
    return false;
  }

  private airControl(dt: number): void {
    const f = this.forward(this.tmpF);
    const r = this.right(this.tmpR);
    const w = this.body.angvel();
    const v = this.body.linvel();
    const pitch = Math.asin(Math.max(-1, Math.min(1, f.y)));
    const roll = Math.asin(Math.max(-1, Math.min(1, r.y)));
    const pitchRate = w.x * r.x + w.y * r.y + w.z * r.z; // about the car's right axis
    const rollRate = -(w.x * f.x + w.y * f.y + w.z * f.z); // about its back axis
    const spd = v.x * f.x + v.z * f.z;
    const dir = spd >= 0 ? 1 : -1;
    const tgtPitch = Math.atan2(v.y * dir, Math.max(Math.abs(spd), 4)) * 0.75;
    const aP = (tgtPitch - pitch) * 3.0 - pitchRate * 1.6;
    const aR = -roll * 7.0 - rollRate * 3.2;
    const tp = aP * this.inertia.x * dt;
    const tr = aR * this.inertia.z * dt;
    this.body.applyTorqueImpulse({ x: r.x * tp - f.x * tr, y: r.y * tp - f.y * tr, z: r.z * tp - f.z * tr }, true);
  }

  private readonly tmpR = { x: 0, y: 0, z: 0 };
  private readonly tmpF = { x: 0, y: 0, z: 0 };
  private readonly tmpU = { x: 0, y: 0, z: 0 };

  /** Suspension compression offset for the wheel visuals: wheel centre y − rest y. */
  wheelDrop(i: number): number {
    const len = this.controller.wheelSuspensionLength(i);
    if (len === null) return 0;
    const eq = this.spec.gravity / this.spec.spring;
    const connY = -this.spec.axleOff + this.rest - eq;
    return connY - len + this.spec.axleOff; // 0 at static ride, + = wheel lower
  }
}

export function rotate(
  q: { x: number; y: number; z: number; w: number },
  x: number,
  y: number,
  z: number,
  out: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  // v' = v + 2·w·(q×v) + 2·q×(q×v)
  const tx = 2 * (q.y * z - q.z * y);
  const ty = 2 * (q.z * x - q.x * z);
  const tz = 2 * (q.x * y - q.y * x);
  out.x = x + q.w * tx + (q.y * tz - q.z * ty);
  out.y = y + q.w * ty + (q.z * tx - q.x * tz);
  out.z = z + q.w * tz + (q.x * ty - q.y * tx);
  return out;
}
