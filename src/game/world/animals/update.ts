import type { Actor, AnimalCtx } from "./actor";
import { think } from "./brain";
import { type Contact, jeepCollision } from "./collision";
import { RESPAWN_MIN, THINK_DIST } from "./constants";
import { updateRagdoll } from "./death";
import { updateDecals } from "./decals";
import { setDormant } from "./dormant";
import { updateBar } from "./health-bar";
import { steerAndMove } from "./motion";
import { respawn } from "./spawn";
import type { JeepSnapshot } from "./types";

/** Per-frame update. Reads the jeep, mutates nothing on it directly. */
export function updateAnimals(ctx: AnimalCtx, dt: number, jeep: JeepSnapshot): void {
  ctx.t += dt;
  updateDecals(ctx, dt);

  // jeep forward/right in world space (forward = local -Z, like the engine)
  const jfx = -Math.sin(jeep.yaw);
  const jfz = -Math.cos(jeep.yaw);
  const jrx = Math.cos(jeep.yaw);
  const jrz = -Math.sin(jeep.yaw);
  const jvx = jfx * jeep.speed + jrx * jeep.lateral;
  const jvz = jfz * jeep.speed + jrz * jeep.lateral;
  // On foot the parked car is scenery: animals sense the player, who is far
  // smaller and quieter than a jeep (and quieter still when crouched).
  const foot = !!jeep.onFoot;
  const senseK = foot ? 0.55 * (jeep.stealth ?? 1) : 1;

  for (const a of ctx.actors) {
    if (a.ridden) {
      a.mixer.update(dt); // the rider's controls place it; no brain, no respawn
      continue;
    }
    const fleeR = a.fleeR * senseK;
    const aggroR = a.aggroR * (foot ? 0.8 * (jeep.stealth ?? 1) : 1);
    const dx = a.pos.x - jeep.pos.x;
    const dz = a.pos.z - jeep.pos.z;
    const dist = Math.hypot(dx, dz);
    const rr = a.radius + jeep.radius;
    if (!updateActor(ctx, a, dt, jeep, { dx, dz, dist, rr, jvx, jvz, foot })) continue;
    think(ctx, a, dt, { dx, dz, dist, rr, foot, fleeR, aggroR });
    steerAndMove(ctx, a, dt);
    updateBar(ctx, a, dist);
  }
}

/** Dead / ragdoll / stunned / asleep / collision gates. Returns true when the brain should run. */
function updateActor(
  ctx: AnimalCtx,
  a: Actor,
  dt: number,
  jeep: JeepSnapshot,
  c: Contact,
): boolean {
  const { dist } = c;
  if (a.state === "dead") {
    a.respawnT -= dt;
    if (a.respawnT <= 0) {
      // only respawn out of the jeep's range
      if (dist > RESPAWN_MIN - 5) respawn(ctx, a, jeep.pos);
      else a.respawnT = 2;
    }
    return false;
  }

  // ragdoll physics runs regardless of distance (it's brief)
  if (a.state === "ragdoll") {
    updateRagdoll(ctx, a, dt);
    a.mixer.update(dt);
    return false;
  }

  // stunned (webbed, honked at, splashed): no brain, no movement until it wears off
  if ((a.stunT ?? 0) > 0) {
    a.stunT = a.stunT! - dt;
    if (a.stunT <= 0) a.mixer.timeScale = 1;
    a.mixer.update(dt);
    a.root.position.copy(a.pos);
    return false;
  }

  if (dist > THINK_DIST) {
    setDormant(a, dist); // asleep — no mixer, no brain (and hidden when far)
    return false;
  }
  setDormant(a, 0);
  a.mixer.update(dt);
  if (jeepCollision(ctx, a, jeep, c)) return false;
  return true;
}
