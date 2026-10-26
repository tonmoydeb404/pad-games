/** Explorer kinematics: stamina, velocity, jump, gravity, ground follow and push-out. */
import type { JeepInputSnapshot } from "../../input";
import { tickVitals } from "../../../player/state";
import { ROLL_SPEED, FOOT_JUMP_V, FOOT_ACCEL_RATE, FOOT_BRAKE_RATE, PLAYER_RADIUS, FOOT_SKIN } from "../config/foot-constants";
import { BOUND, GRAVITY } from "../config/world-constants";
import type { JeepEngine } from "../jeep-engine";
import type { FootIntent } from "./explorer-types";

/** Advances the explorer one tick; returns the ground height under them. */
export function moveExplorer(this: JeepEngine, dt: number, snap: JeepInputSnapshot, it: FootIntent): number {
  const ex = this.explorer!;
  const f = this.foot;
  const { KO, mx, mz, top, sprinting } = it;
  // ---- stamina + health regeneration (shared vitals rules) ----------------
  const planar = Math.hypot(f.vx, f.vz);
  if (tickVitals(this.player.vitals, dt, { sprinting: sprinting && planar > 3, still: planar < 1 })) this.notify("Out of breath");

  // ---- velocity ---------------------------------------------------------
  if (f.act === "roll") {
    const p = f.actT / f.actDur;
    const rs = ROLL_SPEED * (1 - 0.55 * p);
    f.vx = f.rollX * rs;
    f.vz = f.rollZ * rs;
  } else {
    const tx = mx * top;
    const tz = mz * top;
    const braking = top < 0.05 || KO;
    const k = 1 - Math.exp(-(braking ? FOOT_BRAKE_RATE : FOOT_ACCEL_RATE) * (f.grounded ? 1 : 0.35) * dt);
    f.vx += (tx - f.vx) * k;
    f.vz += (tz - f.vz) * k;
    if (Math.abs(f.vx) < 0.02) f.vx = 0;
    if (Math.abs(f.vz) < 0.02) f.vz = 0;
  }

  // jump (edge-detected level input)
  if (snap.jump && !this.prevJump && f.grounded && !KO && f.act !== "roll") {
    f.vy = FOOT_JUMP_V * (f.crouch ? 0.8 : 1);
    f.grounded = false;
    f.crouch = false;
    ex.jump();
    this.audio.thump(0.12);
  }
  this.prevJump = snap.jump;

  // integrate + gravity
  f.pos.x += f.vx * dt;
  f.pos.z += f.vz * dt;
  f.vy -= GRAVITY * dt;
  f.pos.y += f.vy * dt;

  // ground follow (walk down slopes instead of micro-falling)
  const gh = this.groundHeight(f.pos.x, f.pos.z);
  if (f.pos.y <= gh) {
    if (!f.grounded && f.vy < -7) this.audio.thump(0.18);
    f.pos.y = gh;
    f.vy = 0;
    f.grounded = true;
  } else if (f.grounded) {
    // walked off a ledge / down a steep bank — become airborne
    if (f.pos.y > gh + 0.42) f.grounded = false;
    else {
      f.pos.y = gh;
      f.vy = 0;
    }
  }

  // static prop colliders (trunks, boulders, logs) — circle push-out
  const pushR = PLAYER_RADIUS - 0.03 + FOOT_SKIN;
  for (const b of this.colliders) {
    const dx = f.pos.x - b.x;
    const dz = f.pos.z - b.z;
    const rr = b.r + pushR;
    const d2 = dx * dx + dz * dz;
    if (d2 >= rr * rr || d2 < 1e-6) continue;
    const d = Math.sqrt(d2);
    f.pos.x += (dx / d) * (rr - d);
    f.pos.z += (dz / d) * (rr - d);
  }
  // the parked vehicle's footprint
  {
    const dx = f.pos.x - this.v.pos.x;
    const dz = f.pos.z - this.v.pos.z;
    const rr = this.carR + 0.55;
    const d = Math.hypot(dx, dz);
    if (d < rr && d > 1e-4) {
      f.pos.x += (dx / d) * (rr - d);
      f.pos.z += (dz / d) * (rr - d);
    }
  }
  // soft world edge (same radius the vehicle respects; town sector extends it)
  {
    const r = Math.hypot(f.pos.x, f.pos.z);
    const LIM = Math.max(BOUND, this.city.bound(f.pos.x, f.pos.z)) - 1.5;
    if (r > LIM) {
      const kk = LIM / r;
      f.pos.x *= kk;
      f.pos.z *= kk;
    }
  }
  return gh;
}
