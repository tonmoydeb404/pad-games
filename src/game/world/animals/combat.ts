import type { Actor, AnimalCtx } from "./actor";
import { play } from "./animation";
import { kill } from "./death";
import { enterState } from "./states";

/** Closest living animal inside `range` and in front of (ox,oz) — melee soft-lock. */
export function nearestTarget(
  ctx: AnimalCtx,
  ox: number,
  oz: number,
  dirX: number,
  dirZ: number,
  range: number,
  minDot: number,
): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null;
  let bestD = range;
  for (const a of ctx.actors) {
    if (a.ridden || a.state === "dead" || a.state === "ragdoll") continue;
    const dx = a.pos.x - ox;
    const dz = a.pos.z - oz;
    const d = Math.hypot(dx, dz);
    if (d > bestD || d < 1e-4) continue;
    if ((dx * dirX + dz * dirZ) / d < minDot) continue;
    bestD = d;
    best = { x: a.pos.x, z: a.pos.z };
  }
  return best;
}

/**
 * A fist / boot swing from the explorer. Every living animal inside the
 * `range` cone (half-angle given as `arcCos`) takes `dmg`, is shoved back
 * by `knock`, and either dies (ragdoll launch, like a ram) or turns on /
 * runs from the attacker according to temperament.
 */
export function melee(
  ctx: AnimalCtx,
  ox: number,
  oz: number,
  dirX: number,
  dirZ: number,
  range: number,
  arcCos: number,
  dmg: number,
  knock: number,
  fx?: { stun?: number; scare?: boolean },
): { hits: number; kills: number; heavy: boolean } {
  const out = { hits: 0, kills: 0, heavy: false };
  for (const a of ctx.actors) {
    if (a.ridden || a.state === "dead" || a.state === "ragdoll") continue;
    const dx = a.pos.x - ox;
    const dz = a.pos.z - oz;
    const dist = Math.hypot(dx, dz);
    if (dist > range + a.radius) continue;
    const inv = 1 / Math.max(dist, 1e-5);
    const nx = dx * inv;
    const nz = dz * inv;
    // anything touching the attacker is in the cone; otherwise check the arc
    if (dist > a.radius + 0.6 && nx * dirX + nz * dirZ < arcCos) continue;
    out.hits++;
    if (a.def.tier === "heavy") out.heavy = true;
    if (dmg > 0) {
      if (hurt(ctx, a, dmg, nx, nz, knock)) {
        out.kills++;
        continue;
      }
    } else {
      // a shove / scare / stun with no damage: nobody is "hit", but they are moved
      const push = knock / (1 + a.def.mass / 60);
      a.pos.x += nx * push;
      a.pos.z += nz * push;
    }
    if (fx?.stun) {
      a.stunT = Math.max(a.stunT ?? 0, fx.stun);
      a.mixer.timeScale = 0.12; // frozen mid-motion while stunned
    }
    if (fx?.scare) enterState(a, "flee");
  }
  return out;
}

/**
 * Shared damage step for fists and bullets: hit points, knock-back, blood,
 * and the animal's reaction (fight or flight by temperament). Returns true
 * when the hit killed it.
 */
export function hurt(ctx: AnimalCtx, a: Actor, dmg: number, nx: number, nz: number, knock: number): boolean {
  a.hp -= dmg;
  a.hurtT = 5;
  a.hitCd = 0.25;
  if (a.hp <= 0) {
    kill(ctx, a, nx, nz, 7 + knock * 1.4, false);
    return true;
  }
  const push = knock / (1 + a.def.mass / 60);
  a.pos.x += nx * push;
  a.pos.z += nz * push;
  ctx.host.burst(a.pos.x, a.pos.y + a.def.height * 0.55, a.pos.z, 4 + Math.floor(a.def.height * 2), 0x8f1a12, 1.8, 0.1);
  enterState(a, a.def.temper === "fierce" || (a.hp > a.maxHp * 0.6 && a.def.atk > 0) ? "attack" : "flee");
  if (a.actions.react) {
    play(a, "react", 0.05, 1.5);
    a.reactT = 0.7;
  }
  return false;
}
