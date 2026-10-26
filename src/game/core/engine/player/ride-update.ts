/** Per-tick riding control. */
import type { JeepInputSnapshot } from "../../input";
import { clamp } from "../../noise";
import { RIDE_WALK, RIDE_TROT, RIDE_GALLOP, ENTER_DIST } from "../config/foot-constants";
import type { JeepEngine } from "../jeep-engine";

/**
 * Steer the mount. The animal keeps its own character — top speed, inertia,
 * turning circle, gait clip (see AnimalSystem.rideStep) — and the rider sits
 * on its measured back: pelvis on the saddle line, legs straddling the flanks
 * on slim mounts or stretched out forward on wide / low ones, so no part of
 * the body ends up inside the animal.
 */
export function updateRiding(this: JeepEngine, dt: number, snap: JeepInputSnapshot): void {
  const ex = this.explorer;
  const an = this.animals;
  const h = this.riding;
  const f = this.foot;
  if (!ex || !an || !h) return;

  const ix = snap.moveX;
  const iy = snap.moveY;
  const rawMag = Math.hypot(ix, iy);
  const mag = Math.min(1, rawMag);
  const yaw = this.footCam.yaw;
  let targetYaw = f.yaw;
  if (rawMag > 0.05) {
    const mx = (-Math.sin(yaw) * iy + Math.cos(yaw) * ix) / rawMag;
    const mz = (-Math.cos(yaw) * iy - Math.sin(yaw) * ix) / rawMag;
    targetYaw = Math.atan2(-mx, -mz);
  }
  // light tilt walks, full tilt trots, sprint gallops — fractions of THIS animal's top speed
  let frac = mag < 0.05 ? 0 : mag < 0.55 ? RIDE_WALK * (mag / 0.55) : RIDE_WALK + (RIDE_TROT - RIDE_WALK) * ((mag - 0.55) / 0.45);
  if (snap.sprint && mag > 0.5) frac = RIDE_GALLOP;
  // Space jumps with THIS animal's own jump height (a flyer climbs while it is held)
  if (snap.jump && !this.prevJump && an.rideJump(h)) this.audio.thump(0.18);
  this.prevJump = snap.jump;
  const body = an.rideStep(h, dt, targetYaw, frac, snap.jump);

  // the seat: along the heading from the origin, on top of the back
  const seat = this.rideSeat;
  const hx = -Math.sin(body.yaw);
  const hz = -Math.cos(body.yaw);
  f.pos.set(body.x + hx * seat.fwd, body.y + seat.y, body.z + hz * seat.fwd);
  f.yaw = body.yaw;
  f.vx = hx * body.speed;
  f.vz = hz * body.speed;
  f.vy = 0;
  f.grounded = true;
  f.gait = f.gaitS = 0;
  f.stealth = 1;

  // posture: straddle a slim back, stretch the legs forward on a wide or low one
  const forward = clamp(Math.max((0.95 - seat.y) / 0.45, (seat.halfW - 0.38) / 0.35), 0, 1);
  const spread = clamp((seat.halfW - 0.15) / 0.4, 0, 1);
  ex.setGait(0);
  ex.setSpeed(0);
  ex.setCrouch(0);
  ex.setDown(0);
  ex.setAction(null, 0);
  ex.setSeated(1, forward, spread);
  // pelvis sits ~8 cm above the saddle line
  // …and centre the PELVIS (not the root) on the seat: rotate its offset by the heading
  const ho = ex.hipOffset?.() ?? { x: 0, z: 0 };
  const cyw = Math.cos(f.yaw);
  const syw = Math.sin(f.yaw);
  ex.root.position.set(
    f.pos.x - (ho.x * cyw + ho.z * syw),
    f.pos.y + 0.08 - ex.hipHeight(),
    f.pos.z - (-ho.x * syw + ho.z * cyw),
  );
  ex.root.rotation.set(0, f.yaw, 0);
  ex.update(dt);

  // hoofbeats at the animal's own cadence (small animals patter, giants thud)
  if (body.speed > 0.5) {
    this.rideStepT -= dt;
    if (this.rideStepT <= 0) {
      const pace = clamp(body.speed / Math.max(1, an.rideInfo(h).topSpeed), 0.1, 1.1);
      this.rideStepT = clamp((0.62 - pace * 0.4) * (0.6 + seat.len * 0.25), 0.16, 0.9);
      this.audio.step(this.surfaceAt(body.x, body.z), clamp(0.5 + seat.len * 0.3, 0.6, 1.4));
    }
  }
  this.nearCar = Math.hypot(f.pos.x - this.v.pos.x, f.pos.z - this.v.pos.z) < ENTER_DIST;
  this.nearRide = null;
}
