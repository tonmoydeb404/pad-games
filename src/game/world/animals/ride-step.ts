import type { Actor } from "./actor";
import { play } from "./animation";
import { clamp } from "../../core/noise";
import { GRAVITY, MODEL_FACING } from "./constants";
import { JUMP_HEIGHT, rideRampTime, rideTopSpeed } from "./ride-stats";
import type { AnimalCtx } from "./actor";
import type { RideHandle } from "./types";

/**
 * Drive a ridden animal with its own character: it turns at a rate set by
 * its size (a rat pivots, a T-Rex swings round), and speed BUILDS steadily
 * the longer you hold forward — walk, trot, canter, gallop — taking longer
 * for heavier animals (see rideTopSpeed / rideRampTime). It plays its own
 * move clip retimed to the pace and keeps its gait quirks (frog hops, wasp
 * hovers). Slides along static colliders. Returns where its origin now is.
 */
export function rideStep(
  ctx: AnimalCtx,
  h: RideHandle,
  dt: number,
  targetYaw: number,
  speedFrac: number,
  jumpHeld = false,
): { x: number; y: number; z: number; yaw: number; speed: number } {
  const a = h as Actor;
  const def = a.def;
  if ((a.specialCd ?? 0) > 0) a.specialCd = Math.max(0, a.specialCd! - dt);

  const top = rideTopSpeed(def);
  const boosted = (a.rideBoostT ?? 0) > 0;
  if (boosted) a.rideBoostT = a.rideBoostT! - dt;
  const air = (a.rideAirY ?? 0) > 0.001 || (a.rideVy ?? 0) > 0;
  // a special-move boost drives forward on its own; otherwise the stick sets the target
  const want = boosted ? top * (a.rideBoostMult ?? 1) : top * clamp(speedFrac, 0, 1.1);
  // constant acceleration: speed climbs linearly to the target over the ramp
  // time (so it visibly keeps increasing), and braking is much quicker
  const accel = (top / rideRampTime(def)) * (boosted ? 3 : 1);
  const cur = a.rideSpeed ?? 0;
  let spd = cur + clamp(want - cur, -accel * 2.5 * dt, accel * dt);
  // a leap keeps its forward speed until it lands
  if (air && (a.rideLeapSpeed ?? 0) > 0) spd = Math.max(spd, a.rideLeapSpeed!);
  a.rideSpeed = spd < 0.03 && want === 0 ? 0 : spd;
  const moving = spd > 0.25;

  if (speedFrac > 0.04 || boosted) {
    let d = targetYaw - a.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    // turn rate falls with mass; a standstill pivot is slower than on the move
    const turn = clamp(9.5 - Math.log10(def.mass + 1) * 2.1, 2.2, 8) * (moving ? 1 : 0.75);
    a.yaw += clamp(d, -turn * dt, turn * dt);
  }

  // A frog travels in real hops: it launches whenever it is on the ground and
  // being steered, and only covers ground while airborne — the rider is lifted
  // by exactly the same arc as the body, so they stay level.
  if (def.hopper && speedFrac > 0.04 && !air) {
    a.rideVy = Math.sqrt(2 * GRAVITY * def.height * 0.35);
    a.rideAirY = 0.001;
  }
  const inAir = (a.rideAirY ?? 0) > 0.001 || (a.rideVy ?? 0) > 0;
  const ms = def.hopper ? (inAir ? spd * 1.6 : 0) : spd;
  if (ms > 0.25) {
    const nx = a.pos.x - Math.sin(a.yaw) * ms * dt;
    const nz = a.pos.z - Math.cos(a.yaw) * ms * dt;
    const r = a.radius * 0.8;
    if (!ctx.host.blocked(nx, a.pos.z, r)) a.pos.x = nx;
    if (!ctx.host.blocked(a.pos.x, nz, r)) a.pos.z = nz;
    const rad = Math.hypot(a.pos.x, a.pos.z);
    if (rad > 400) {
      a.pos.x *= 400 / rad;
      a.pos.z *= 400 / rad;
    }
  }

  // vertical: jump / leap arc under gravity (flyers climb instead)
  let airY = a.rideAirY ?? 0;
  let vy = a.rideVy ?? 0;
  if (airY > 0.001 || vy > 0) {
    vy -= GRAVITY * dt;
    airY += vy * dt;
    if (airY <= 0) {
      airY = 0;
      vy = 0;
      a.rideLeapSpeed = 0;
      const land = a.onLand;
      a.onLand = null;
      land?.();
    }
  }
  a.rideAirY = airY;
  a.rideVy = vy;

  // animation: hoppers keep their idle pose (the arc is the hop, so the body never
  // drifts off from the rider); everything else plays its own run clip at pace
  if (def.hopper) {
    if (a.current !== a.actions.idle) play(a, "idle", 0.1, 0.7);
  } else {
    if (moving !== a.rideMoving) {
      a.rideMoving = moving;
      play(a, moving ? "move" : "idle", 0.2, 1);
    }
    if (moving && a.current) a.current.timeScale = clamp(0.35 + 0.75 * (spd / def.flee), 0.4, 1.7);
  }

  const gy = ctx.host.terrainHeight(a.pos.x, a.pos.z);
  if (def.flyer) {
    a.rideAlt = clamp((a.rideAlt ?? 0) + (jumpHeld ? 9 : -6) * dt, 0, 16);
    a.pos.y = gy + def.height + 0.8 + Math.sin(ctx.t * 3.1 + a.phase) * 0.16 + a.rideAlt;
  } else a.pos.y = gy + airY;
  a.root.position.copy(a.pos);
  a.root.rotation.set(0, a.yaw + MODEL_FACING, 0);
  return { x: a.pos.x, y: a.pos.y, z: a.pos.z, yaw: a.yaw, speed: a.rideSpeed };
}

/** Jump off the ground with this species' own jump height. False when already airborne (or a flyer). */
export function rideJump(h: RideHandle): boolean {
  const a = h as Actor;
  if (a.def.flyer) return false;
  if ((a.rideAirY ?? 0) > 0.001 || (a.rideVy ?? 0) > 0) return false;
  a.rideVy = Math.sqrt(2 * GRAVITY * (JUMP_HEIGHT[a.def.file] ?? 1));
  a.rideAirY = 0.001;
  return true;
}
