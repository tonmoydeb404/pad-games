import type { RAPIER } from "./rapier";
import { SUSPENSION_REST, SUSPENSION_TRAVEL, type Vec3, type VehicleSpec } from "./vehicle-types";

/** Bump-stop spring (per-unit-mass accel per unit overshoot) and force cap. */
const BUMP_K = 4000;
const BUMP_CAP = 500;

/**
 * Bump stops. The controller clamps suspension travel but pushes back no
 * harder once it's reached, so a hard landing would drive the chassis into
 * the ground. Where a wheel is pressed past its limit, add a stiff
 * spring-damper along the contact normal, in proportion to the overshoot.
 */
export function applyBumpStops(
  c: RAPIER.DynamicRayCastVehicleController,
  body: RAPIER.RigidBody,
  spec: VehicleSpec,
  upOf: () => Vec3,
  tmpH: Vec3,
  tmpC: Vec3,
  dt: number,
): void {
  const m = spec.mass / 4;
  const minLen = SUSPENSION_REST - SUSPENSION_TRAVEL;
  let lin: Vec3 | null = null;
  for (let i = 0; i < 4; i++) {
    if (!c.wheelIsInContact(i)) continue;
    const hp = c.wheelHardPoint(i, tmpH);
    const cp = c.wheelContactPoint(i, tmpC);
    if (!hp || !cp) continue;
    const raw = Math.hypot(hp.x - cp.x, hp.y - cp.y, hp.z - cp.z) - spec.wheelR;
    const pen = minLen - raw;
    if (pen <= 0) continue;
    // push along the suspension axis (chassis up), like the real spring —
    // along the ground normal it would also brake the car on an incline
    const up = upOf();
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

/** In the air: nose follows the flight path and the car rights itself. */
export function applyAirControl(
  body: RAPIER.RigidBody,
  inertia: Vec3,
  f: Vec3,
  r: Vec3,
  dt: number,
): void {
  const w = body.angvel();
  const v = body.linvel();
  const pitch = Math.asin(Math.max(-1, Math.min(1, f.y)));
  const roll = Math.asin(Math.max(-1, Math.min(1, r.y)));
  const pitchRate = w.x * r.x + w.y * r.y + w.z * r.z; // about the car's right axis
  const rollRate = -(w.x * f.x + w.y * f.y + w.z * f.z); // about its back axis
  const spd = v.x * f.x + v.z * f.z;
  const dir = spd >= 0 ? 1 : -1;
  const tgtPitch = Math.atan2(v.y * dir, Math.max(Math.abs(spd), 4)) * 0.75;
  const aP = (tgtPitch - pitch) * 3.0 - pitchRate * 1.6;
  const aR = -roll * 7.0 - rollRate * 3.2;
  const tp = aP * inertia.x * dt;
  const tr = aR * inertia.z * dt;
  body.applyTorqueImpulse({ x: r.x * tp - f.x * tr, y: r.y * tp - f.y * tr, z: r.z * tp - f.z * tr }, true);
}
