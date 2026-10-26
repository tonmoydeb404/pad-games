/** Fixed-tick vehicle update: the arcade layer (driver + surface intents) and the phase pipeline. */
import type { DriveIntent } from "../../../physics/physics";
import { clamp, damp, lerp } from "../../noise";
import { MAX_SPEED, MAX_REV, SURFACE } from "../config/world-constants";
import type { JeepEngine } from "../jeep-engine";
import type { TickCtx } from "./tick-types";

/**
 * One fixed tick. The engine decides *what the driver and the surface ask
 * of the car* (throttle, brakes, steering target, grip, drag — the arcade
 * layer, tuned per vehicle); Rapier decides what actually happens: wheel
 * suspension, gravity, slopes, jumps, and collisions with trunks, boulders
 * and logs.
 */
export function updateVehicle(this: JeepEngine, dt: number): void {
  const ctx = this.computeIntent(dt);
  if (!ctx) return;
  const step = this.stepWorld(ctx);
  if (!step) return;
  this.readBack(ctx, step);
  this.applyAttitude(ctx);
  this.updateGauges(ctx);
  this.emitExhaustSmoke();
  this.emitTireSpray(ctx);
  this.trackProgress(ctx);
}

/** What the driver and the surface ask of the car this tick (null while the rig is not built). */
export function computeIntent(this: JeepEngine, dt: number): TickCtx | null {
  const v = this.v;
  const pw = this.pw;
  const rig = this.rig;
  const jeep = this.jeep;
  if (!pw || !rig || !jeep) return null;
  // health: slow regen; a hurt jeep underperforms (dents = 1 - health/100)
  this.jeepHealth = Math.min(100, this.jeepHealth + dt * 1.1);
  const dent = (100 - this.jeepHealth) / 100;
  // per-vehicle performance (GTA-style profiles, jeep = baseline)
  const P = this.perf;
  const topBase = MAX_SPEED * P.speed;
  const maxRev = MAX_REV * clamp(P.speed, 0.5, 1);
  const topSpeed = topBase * (1 - 0.45 * dent);
  const body = rig.body;

  // Outside systems (wildlife strikes) edit v.speed / v.lateral between
  // ticks — fold any such change into the rigid body's velocity.
  {
    const dF = v.speed - this.syncF;
    const dL = v.lateral - this.syncL;
    if (Math.abs(dF) > 1e-3 || Math.abs(dL) > 1e-3) {
      const f = rig.forward();
      const r = rig.right();
      const fl = Math.hypot(f.x, f.z) || 1;
      const rl = Math.hypot(r.x, r.z) || 1;
      const lin = body.linvel();
      body.setLinvel(
        { x: lin.x + (f.x / fl) * dF + (r.x / rl) * dL, y: lin.y, z: lin.z + (f.z / fl) * dF + (r.z / rl) * dL },
        true,
      );
    }
  }
  const sp0 = rig.speeds();
  v.speed = sp0.forward;
  v.lateral = sp0.lateral;

  const speedFactor = 1 - clamp(Math.abs(v.speed) / topBase, 0, 1) * 0.45;
  v.steer = clamp(damp(v.steer, v.steerTarget * speedFactor, P.steer, dt), -1, 1);

  // open-world streaming: collision exists only near the car
  this.terrainStream?.update(v.pos.x, v.pos.z);
  this.propStream?.update(v.pos.x, v.pos.z, 90);

  const surf = this.surfaceAt(v.pos.x, v.pos.z);
  v.surface = surf;
  // surface effects blend toward good/bad by the vehicle's off-road
  // aptitude: tractors shrug off mud, street tyers drown in it
  const S0 = SURFACE[surf] ?? SURFACE.dirt;
  let S = S0;
  if (P.offroad !== 0) {
    const GOOD = { grip: 1.0, drag: SURFACE.dirt.drag, accel: 1.0, rough: SURFACE.dirt.rough };
    const BAD = { grip: 0.55, drag: 1.2, accel: 0.6, rough: 0.7 };
    const tgt = P.offroad > 0 ? GOOD : BAD;
    const k = Math.min(1, Math.abs(P.offroad)) * 0.55;
    const kr = Math.min(1, Math.abs(P.offroad)) * 0.4;
    S = {
      grip: lerp(S0.grip, tgt.grip, k),
      drag: lerp(S0.drag, tgt.drag, k),
      accel: lerp(S0.accel, tgt.accel, k),
      rough: lerp(S0.rough, tgt.rough, kr),
    };
  }

  // Grade under the car, from its actual attitude (+ = nose up, climbing).
  // Gravity along the slope is Rapier's job now; this only fades traction.
  const fw = rig.forward();
  const slope = clamp(fw.y / Math.max(0.1, Math.hypot(fw.x, fw.z)), -1.6, 1.6);
  const traction = clamp(1.06 - Math.abs(slope) * 0.95, 0.18, 1.0);

  // --- intents ----------------------------------------------------------
  // Airborne: wheels bite nothing — no engine, brakes or rolling friction,
  // only a little air drag, so a jump carries its momentum.
  const air = v.airborne;
  const gnd = air ? 0 : 1;
  const sgn = Math.sign(v.speed);
  const engineForce = v.throttle * 22.5 * P.accel * S.accel * traction * (1 - 0.4 * dent);
  let drive = 0; // signed acceleration along the heading (+ = forward)
  let brakeA = 0; // tyre braking, always ≥ 0
  if (v.throttle > 0.01 && !air) {
    if (v.speed < -0.3) brakeA += v.throttle * 30.0 * P.accel * S.grip * traction;
    else drive += engineForce * (1 - clamp(Math.max(v.speed, 0) / topBase, 0, 1) * 0.75);
  }
  if (v.brake > 0.01 && !air) {
    if (v.speed > 0.4) brakeA += v.brake * 30.0 * P.brake * S.grip * traction;
    else drive -= v.brake * 16.0 * P.accel * S.accel * traction;
  }
  if (v.handbrake && !air) brakeA += clamp(Math.abs(v.speed) * 3, 0, 10);
  // parked: hold on slopes instead of creeping away
  if (!air && Math.abs(v.speed) < 0.6 && v.throttle < 0.02 && v.brake < 0.02) brakeA += 10;
  // speed caps
  let resist = -(v.speed * 0.35 * S.drag * 0.6) * (air ? 0.12 : 1);
  resist -= sgn * 0.42 * S.drag * gnd;
  resist -= sgn * Math.abs(v.speed) * S.rough * 0.16 * gnd;
  if (v.speed > topSpeed) {
    drive = Math.min(drive, 0);
    resist -= (v.speed - topSpeed) * 6;
  }
  if (v.speed < -maxRev && drive < 0) drive = 0;
  if (!isFinite(drive) || !isFinite(resist)) {
    drive = 0;
    resist = 0;
  }

  // steering: a target yaw rate (as the old arcade model) realised through
  // the front wheels' angle, with a stability assist so the response stays
  // crisp on loose ground. Weak in the air.
  const grip = S.grip * P.grip;
  const turnRate = v.steer * 0.95 * P.agility * clamp(Math.abs(v.speed) / 3.2, 0, 1) * Math.sign(v.speed || 1) * (1 - 0.3 * dent) * (air ? 0.12 : 1);
  const yawTarget = turnRate * clamp(1.4 - (Math.abs(v.speed) / topBase) * 0.6, 0.6, 1.4) * (v.handbrake ? 1.35 : 1);
  const wheelbase = Math.max(1.5, Math.abs(this.wheels[2].base.z - this.wheels[0].base.z));
  const vs = Math.abs(v.speed) < 1.5 ? 1.5 * (v.speed < 0 ? -1 : 1) : v.speed;
  const steerAngle = clamp(Math.atan((yawTarget * wheelbase) / vs), -0.55, 0.55);
  const sideGrip = clamp(grip, 0.3, 1.5);

  const intent: DriveIntent = {
    driveAccel: drive,
    brakeAccel: brakeA,
    steerAngle,
    grip: clamp(grip, 0.4, 1.5),
    sideGrip,
    rearSideGrip: sideGrip * (v.handbrake ? 0.3 : 1),
    yawTarget: Math.abs(v.steer) > 0.05 ? yawTarget : null,
    resist,
  };
  const a = drive + resist - sgn * brakeA; // net, for cosmetic dive/squat
  return { dt, pw, rig, jeep, P, topBase, S, surf, fw, a, turnRate, intent };
}
