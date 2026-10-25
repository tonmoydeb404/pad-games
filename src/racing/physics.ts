/**
 * Rapier physics for Racing — world, static colliders, vehicle rig.
 *
 * The free-roam world is finite and static, so unlike the jeep's streamed
 * terrain this world builds all colliders once at boot:
 *   - one big ground box at y = 0 carries every flat road tile and all grass;
 *   - ramps, bumps and bridge decks become trimesh colliders built from the
 *     same baked geometry that renders (a few dozen meshes — cheap);
 *   - props (barriers, posts, buildings) are primitive boxes/cylinders from
 *     the tile catalog specs.
 * The car is the jeep's proven dynamic body + raycast-vehicle controller
 * (sprung suspension, per-wheel friction, arcade intents). Engine conventions
 * apply: the vehicle drives toward -Z, local +X is right, +Y up, units are
 * metres and seconds, gravity is engine-set.
 */
import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";

export { RAPIER };

let ready: Promise<void> | null = null;
/** Load the WASM module once (the compat build embeds it — no asset config). */
export function initPhysics(): Promise<void> {
  return (ready ??= RAPIER.init());
}

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
  groundAt(x: number, z: number, fromY = 300): number | null {
    const hit = this.world.castRay(new RAPIER.Ray({ x, y: fromY, z }, { x: 0, y: -1, z: 0 }), fromY + 500, true);
    return hit ? fromY - hit.timeOfImpact : null;
  }

  /* ---- static world ---------------------------------------------------- */

  /** The world floor: one slab under everything, top at y = 0. */
  addGround(half: number): void {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(half, 1, half)
        .setTranslation(0, -1, 0)
        .setFriction(1.0),
      body,
    );
  }

  addBox(
    cx: number,
    cy: number,
    cz: number,
    hw: number,
    hh: number,
    hl: number,
    rotY: number,
    friction = 0.6,
  ): void {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy, cz).setRotation({ x: 0, y: Math.sin(rotY / 2), z: 0, w: Math.cos(rotY / 2) }),
    );
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(hw, hh, hl).setFriction(friction), body);
  }

  addCylinder(cx: number, cy: number, cz: number, r: number, halfHeight: number): void {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy, cz));
    this.world.createCollider(RAPIER.ColliderDesc.cylinder(halfHeight, r).setFriction(0.5), body);
  }

  /**
   * Trimesh collider from baked tile geometry. `rotY` quarter-turns match the
   * placement; vertices scale by CELL (tile geometries bake in native units).
   */
  addTrimesh(
    geometry: THREE.BufferGeometry,
    x: number,
    z: number,
    rotY: number,
    scale: number,
    friction = 1.0,
  ): void {
    const pos = geometry.getAttribute("position");
    const verts = new Float32Array(pos.count * 3);
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i) * scale;
      const vy = pos.getY(i) * scale;
      const vz = pos.getZ(i) * scale;
      verts[i * 3] = x + vx * cos + vz * sin;
      verts[i * 3 + 1] = vy;
      verts[i * 3 + 2] = z - vx * sin + vz * cos;
    }
    const indices = new Uint32Array(geometry.index ? geometry.index.array : triangulate(pos.count));
    // vertices are baked world-offset, so the fixed body sits at the origin
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.world.createCollider(
      RAPIER.ColliderDesc.trimesh(verts, indices).setFriction(friction),
      body,
    );
  }

  dispose(): void {
    this.events.free();
    this.world.free();
  }
}

/** Fallback indices for non-indexed geometry (grid triangles). */
function triangulate(count: number): Uint32Array {
  const triCount = Math.floor(count / 3);
  const out = new Uint32Array(triCount * 3);
  for (let i = 0; i < triCount; i++) {
    out[i * 3] = i * 3;
    out[i * 3 + 1] = i * 3 + 1;
    out[i * 3 + 2] = i * 3 + 2;
  }
  return out;
}

/* -------------------------------------------------------------------------
   Vehicle (ported from the jeep's rig — proven on Rapier headless)
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
  /** ω² of the body bounce. */
  spring: number;
  /** Legacy damping coefficient: ζ = damp / (2·√spring). */
  damp: number;
  /** Local height of the centre of mass (negative = below the origin). */
  comY: number;
  gravity: number;
  /** Shell bounciness. */
  restitution?: number;
}

/** What the engine asks of the car each tick (arcade-level intents). */
export interface DriveIntent {
  /** Net drive acceleration along the heading (u/s², signed). */
  driveAccel: number;
  /** Extra braking deceleration through the tyres (always ≥ 0). */
  brakeAccel: number;
  /** Front wheel angle, radians (+ = turn left). */
  steerAngle: number;
  /** Friction multipliers (surface × surface state). */
  grip: number;
  sideGrip: number;
  rearSideGrip: number;
  /** Target yaw rate, rad/s (+ = left) for the stability assist; null = none. */
  yawTarget: number | null;
  /** Resistive deceleration along the heading, u/s² (already signed). */
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

const BUMP_K = 4000;
const BUMP_CAP = 500;

export class VehicleRig {
  body!: RAPIER.RigidBody;
  collider!: RAPIER.Collider;
  controller!: RAPIER.DynamicRayCastVehicleController;
  spec!: VehicleSpec;
  private inertia = { x: 1, y: 1, z: 1 };
  private readonly rest = 0.3;
  private readonly travel = 0.16;
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
        .setAngularDamping(0.2),
    );
    const hh = 0.32;
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(spec.width / 2 - 0.05, hh, spec.length / 2 - 0.1)
        .setTranslation(0, 0.1, 0)
        .setDensity(0)
        .setFriction(0.25)
        .setRestitution(spec.restitution ?? 0.1)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(spec.mass * 6),
      this.body,
    );
    const w = spec.width;
    const h = 0.9;
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
    const k = spec.spring / 4;
    const eq = spec.gravity / spec.spring;
    const zeta = Math.min(0.9, Math.max(0.25, spec.damp / (2 * Math.sqrt(spec.spring))));
    const dW = (zeta * 2 * Math.sqrt(spec.spring)) / 4;
    for (let i = 0; i < 4; i++) {
      const wheel = spec.wheels[i];
      const connY = -spec.axleOff + this.rest - eq;
      c.addWheel({ x: wheel.x, y: connY, z: wheel.z }, { x: 0, y: -1, z: 0 }, { x: 1, y: 0, z: 0 }, this.rest, spec.wheelR);
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

  /** Apply arcade intents, then advance the vehicle controller (before step). */
  drive(intent: DriveIntent, dt: number): void {
    const c = this.controller;
    const m = this.spec.mass;
    const fe = (intent.driveAccel * m) / 4;
    for (let i = 0; i < 4; i++) {
      c.setWheelEngineForce(i, fe);
      c.setWheelBrake(i, 0);
      c.setWheelSteering(i, i < 2 ? intent.steerAngle : 0);
      c.setWheelFrictionSlip(i, 10.5 * intent.grip);
      c.setWheelSideFrictionStiffness(i, (i < 2 ? intent.sideGrip : intent.rearSideGrip) * 1.0);
    }
    c.updateVehicle(dt);

    let n = 0;
    for (let i = 0; i < 4; i++) if (c.wheelIsInContact(i)) n++;
    this.contacts = n;
    this.bumpStops(dt);

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

    if (intent.resist !== 0) {
      const f = this.forward(this.tmpF);
      const fl = Math.hypot(f.x, f.z) || 1;
      this.body.applyImpulse({ x: (f.x / fl) * intent.resist * m * dt, y: 0, z: (f.z / fl) * intent.resist * m * dt }, true);
    }

    if (n === 0) this.airControl(dt);

    if (intent.yawTarget !== null && n >= 3) {
      const up = this.up(this.tmpU);
      const wv = this.body.angvel();
      const wy = wv.x * up.x + wv.y * up.y + wv.z * up.z;
      const k = 8;
      const dw = (intent.yawTarget - wy) * Math.min(1, k * dt);
      const I = this.inertia.y;
      this.body.applyTorqueImpulse({ x: up.x * dw * I, y: up.y * dw * I, z: up.z * dw * I }, true);
    }
  }

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
      const up = this.up(this.tmpU);
      lin ??= body.linvel();
      const wv = body.angvel();
      const com = body.worldCom();
      const rx = cp.x - com.x;
      const ry = cp.y - com.y;
      const rz = cp.z - com.z;
      const vx = lin.x + (wv.y * rz - wv.z * ry);
      const vy = lin.y + (wv.z * rx - wv.x * rz);
      const vz = lin.z + (wv.x * ry - wv.y * rx);
      const closing = -(vx * up.x + vy * up.y + vz * up.z);
      const a = Math.min(BUMP_CAP, Math.max(0, BUMP_K * pen + 2 * Math.sqrt(BUMP_K) * closing));
      const j = a * m * dt;
      body.applyImpulseAtPoint({ x: up.x * j, y: up.y * j, z: up.z * j }, cp, true);
      lin = null;
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
    const wv = this.body.angvel();
    const v = this.body.linvel();
    const pitch = Math.asin(Math.max(-1, Math.min(1, f.y)));
    const roll = Math.asin(Math.max(-1, Math.min(1, r.y)));
    const pitchRate = wv.x * r.x + wv.y * r.y + wv.z * r.z;
    const rollRate = -(wv.x * f.x + wv.y * f.y + wv.z * f.z);
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

  /** Suspension compression offset for the wheel visuals (0 at ride height). */
  wheelDrop(i: number): number {
    const len = this.controller.wheelSuspensionLength(i);
    if (len === null) return 0;
    const eq = this.spec.gravity / this.spec.spring;
    const connY = -this.spec.axleOff + this.rest - eq;
    return connY - len + this.spec.axleOff;
  }
}

export function rotate(
  q: { x: number; y: number; z: number; w: number },
  x: number,
  y: number,
  z: number,
  out: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  const tx = 2 * (q.y * z - q.z * y);
  const ty = 2 * (q.z * x - q.x * z);
  const tz = 2 * (q.x * y - q.y * x);
  out.x = x + q.w * tx + (q.y * tz - q.z * ty);
  out.y = y + q.w * ty + (q.z * tx - q.x * tz);
  out.z = z + q.w * tz + (q.x * ty - q.y * tx);
  return out;
}
