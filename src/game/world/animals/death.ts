import type { Actor, AnimalCtx } from "./actor";
import { clamp } from "../../core/noise";
import { GRAVITY, JEEP_MASS, RESPAWN_DELAY } from "./constants";
import { addDecal } from "./decals";
import { play } from "./animation";
import { enterState } from "./states";

/** Lethal hit: momentum exchange + ragdoll launch. */
export function kill(ctx: AnimalCtx, a: Actor, nx: number, nz: number, approach: number, byJeep = true): void {
  a.stunT = 0;
  a.mixer.timeScale = 1;
  const def = a.def;
  // heavy animals bleed speed off the jeep (and hurt it)
  const keep = clamp(1 - (def.mass * 1.5) / JEEP_MASS, 0.15, 0.985);
  if (byJeep) {
    ctx.host.onJeepImpact(keep);
    if (def.tier === "heavy") ctx.host.onHeavyImpact(approach);
  }
  ctx.host.onKill(def.name, def.points);

  // gore at the bumper
  ctx.host.burst(a.pos.x, a.pos.y + def.height * 0.45, a.pos.z, 10 + Math.floor(def.height * 6), 0x8f1a12, 3.2, 0.14);
  ctx.host.thump(clamp(0.3 + def.mass / 2400, 0.3, 1));
  ctx.host.rumble(clamp(0.25 + def.mass / 2600, 0.25, 0.9), 200);

  // ragdoll launch — light things fly, heavy things slump
  const massK = clamp(JEEP_MASS / (JEEP_MASS + def.mass * 2.2), 0.18, 1);
  const launch = clamp(approach * 0.85 * massK + 2.5, 3, 30);
  const up = clamp(approach * 0.5 * massK + 1.6, 1.2, 6 + def.height * 1.5);
  a.vel.set(nx * launch + (Math.random() - 0.5) * 2.5, 0, nz * launch + (Math.random() - 0.5) * 2.5);
  a.vy = up;
  const spin = clamp(launch * 0.55, 2, 14) / (1 + def.height * 0.35);
  a.angVel.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(spin);
  a.bounces = 0;
  a.bled = false;
  if (a.bar) a.bar.group.visible = false;
  // freeze the pose at the hit moment so the tumble reads as ragdoll
  if (a.current) a.current.paused = true;
  enterState(a, "ragdoll");
  if (a.def.flyer) play(a, "death", 0.05, 0.4); // wasp: crumple mid-air, slow
}

export function updateRagdoll(ctx: AnimalCtx, a: Actor, dt: number): void {
  a.stateT += dt;
  a.vy -= GRAVITY * dt;
  a.pos.x += a.vel.x * dt;
  a.pos.y += a.vy * dt;
  a.pos.z += a.vel.z * dt;
  a.vel.x *= 1 - Math.min(0.5 * dt, 0.5);
  a.vel.z *= 1 - Math.min(0.5 * dt, 0.5);

  // tumble
  const w = a.angVel.length();
  if (w > 0.01) {
    ctx.tmpQ.setFromAxisAngle(ctx.tmpV.copy(a.angVel).divideScalar(w), w * dt);
    a.root.quaternion.premultiply(ctx.tmpQ);
  }

  const gy = ctx.host.terrainHeight(a.pos.x, a.pos.z);
  if (a.pos.y <= gy) {
    a.pos.y = gy;
    if (!a.bled) {
      a.bled = true;
      ctx.host.burst(a.pos.x, gy + 0.12, a.pos.z, 12, 0x6e1410, 2.2, 0.12);
      addDecal(ctx, a.pos.x, gy, a.pos.z, 0.3 + a.def.height * 0.28);
    }
    if (a.vy < -3 && a.bounces < 2) {
      a.vy = -a.vy * 0.32;
      a.vel.x *= 0.55;
      a.vel.z *= 0.55;
      a.angVel.multiplyScalar(0.55);
      a.bounces++;
      ctx.host.burst(a.pos.x, gy + 0.1, a.pos.z, 6, 0x8a7a5f, 1.6, 0.1); // dust
    } else {
      settle(a);
      return;
    }
  }
  a.root.position.copy(a.pos);
}

/** Body at rest: play the authored Death collapse (if any) and start the respawn clock. */
function settle(a: Actor): void {
  a.state = "dead";
  a.respawnT = RESPAWN_DELAY + Math.random() * 4;
  a.vel.set(0, 0, 0);
  a.angVel.set(0, 0, 0);
  if (a.actions.death) {
    // death clip from the current (tumbled) pose — reads as the final collapse
    play(a, "death", 0.08, 1.5);
  } else if (a.current) {
    // no death clip (snake): hold the flop pose instead of snapping to rest
    a.current.paused = true;
  }
}
