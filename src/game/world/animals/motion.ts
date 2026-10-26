import type { Actor, AnimalCtx } from "./actor";
import { MODEL_FACING } from "./constants";

/** Steer yaw toward the target, follow the ground (flyer hover, frog hops) and run/charge forward. */
export function steerAndMove(ctx: AnimalCtx, a: Actor, dt: number): void {
  // steer yaw toward target (wrap-safe)
  let dy = a.targetYaw - a.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  a.yaw += dy * Math.min(1, (a.state === "flee" || a.state === "attack" ? 7 : 1.6) * dt);

  // ground follow (+ flyer hover + hop gait)
  const gy = ctx.host.terrainHeight(a.pos.x, a.pos.z);
  if (a.def.flyer) {
    a.pos.y = gy + a.def.height + 0.8 + Math.sin(ctx.t * 3.1 + a.phase) * 0.16;
  } else if (a.state === "flee" && a.def.hopper) {
    a.pos.y = gy + Math.abs(Math.sin(ctx.t * 9 + a.phase)) * (a.def.height * 0.5 + 0.1);
  } else {
    a.pos.y = gy;
  }
  if (a.state === "flee" || a.state === "attack") {
    const spd = a.def.flee * (a.state === "attack" ? 1.05 : 1);
    a.pos.x += -Math.sin(a.yaw) * spd * dt;
    a.pos.z += -Math.cos(a.yaw) * spd * dt;
    // soft world-boundary steer-back (not while charging — the jeep is there)
    const r = Math.hypot(a.pos.x, a.pos.z);
    if (r > 400 && a.state === "flee") a.targetYaw = Math.atan2(-a.pos.x, -a.pos.z) + Math.PI;
  }
  a.root.position.copy(a.pos);
  a.root.rotation.set(0, a.yaw + MODEL_FACING, 0);
}
