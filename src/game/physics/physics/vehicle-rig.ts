import type { RAPIER } from "./rapier";
import type { PhysicsWorld } from "./physics-world";
import { rotate } from "./rotate";
import { createVehicle } from "./vehicle-build";
import { applyAirControl, applyBumpStops } from "./vehicle-assists";
import { SUSPENSION_REST, SUSPENSION_TRAVEL, type DriveIntent, type Quat, type Vec3, type VehicleSpec } from "./vehicle-types";

export class VehicleRig {
  body!: RAPIER.RigidBody;
  collider!: RAPIER.Collider;
  controller!: RAPIER.DynamicRayCastVehicleController;
  spec!: VehicleSpec;
  /** Restitution-free shell: obstacle bounce comes from the obstacle side. */
  private inertia = { x: 1, y: 1, z: 1 };
  private readonly rest = SUSPENSION_REST;
  private readonly travel = SUSPENSION_TRAVEL;
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
  build(spec: VehicleSpec, pos?: Vec3, quat?: Quat): void {
    const world = this.pw.world;
    const keepPos = pos ?? (this.body ? this.body.translation() : { x: 0, y: 2, z: 0 });
    const keepQuat = quat ?? (this.body ? this.body.rotation() : { x: 0, y: 0, z: 0, w: 1 });
    const keepVel = this.body ? this.body.linvel() : { x: 0, y: 0, z: 0 };
    if (this.controller) world.removeVehicleController(this.controller);
    if (this.body) world.removeRigidBody(this.body);
    this.spec = spec;
    const built = createVehicle(this.pw, spec, keepPos, keepQuat, keepVel);
    this.body = built.body;
    this.collider = built.collider;
    this.controller = built.controller;
    this.inertia = built.inertia;
  }

  dispose(): void {
    this.pw.world.removeVehicleController(this.controller);
    this.pw.world.removeRigidBody(this.body);
  }

  teleport(pos: Vec3, quat: Quat): void {
    this.body.setTranslation(pos, true);
    this.body.setRotation(quat, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  /** Orientation helpers (world space). */
  forward(out = { x: 0, y: 0, z: 0 }): Vec3 {
    return rotate(this.body.rotation(), 0, 0, -1, out);
  }
  right(out = { x: 0, y: 0, z: 0 }): Vec3 {
    return rotate(this.body.rotation(), 1, 0, 0, out);
  }
  up(out = { x: 0, y: 0, z: 0 }): Vec3 {
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
    applyBumpStops(c, this.body, this.spec, () => this.up(this.tmpU), this.tmpH, this.tmpC, dt);

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
    if (n === 0) applyAirControl(this.body, this.inertia, this.forward(this.tmpF), this.right(this.tmpR), dt);

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

  private readonly tmpH = { x: 0, y: 0, z: 0 };
  private readonly tmpC = { x: 0, y: 0, z: 0 };
  private readonly tmpR = { x: 0, y: 0, z: 0 };
  private readonly tmpF = { x: 0, y: 0, z: 0 };
  private readonly tmpU = { x: 0, y: 0, z: 0 };

  /** A wheel's suspension is pressed to its limit (hard landing / big hit). */
  bottomedOut(): boolean {
    for (let i = 0; i < 4; i++) {
      const len = this.controller.wheelSuspensionLength(i);
      if (len !== null && len <= this.rest - this.travel + 0.005) return true;
    }
    return false;
  }

  /** Suspension compression offset for the wheel visuals: wheel centre y − rest y. */
  wheelDrop(i: number): number {
    const len = this.controller.wheelSuspensionLength(i);
    if (len === null) return 0;
    const eq = this.spec.gravity / this.spec.spring;
    const connY = -this.spec.axleOff + this.rest - eq;
    return connY - len + this.spec.axleOff; // 0 at static ride, + = wheel lower
  }
}
