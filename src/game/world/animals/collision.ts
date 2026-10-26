import type { Actor, AnimalCtx } from "./actor";
import { play } from "./animation";
import { clamp } from "../../core/noise";
import { DIE_AT, JEEP_MASS } from "./constants";
import { kill } from "./death";
import { enterState } from "./states";
import type { JeepSnapshot } from "./types";

/** Sensed offsets from the jeep (or explorer) to one animal. */
export interface Contact {
  dx: number;
  dz: number;
  dist: number;
  /** Combined body radii. */
  rr: number;
  /** Jeep velocity in world space. */
  jvx: number;
  jvz: number;
  foot: boolean;
}

/** Jeep/mount contact: damage, shove, flinch. Returns true when it killed the animal. */
export function jeepCollision(ctx: AnimalCtx, a: Actor, jeep: JeepSnapshot, c: Contact): boolean {
  const { dx, dz, dist, rr, jvx, jvz, foot } = c;
  const mounted = jeep.mountMass !== undefined;
  if ((!foot || mounted) && dist < rr + 0.4) {
    const nx = dx / Math.max(dist, 1e-5);
    const nz = dz / Math.max(dist, 1e-5);
    // how fast the jeep closes along the jeep→animal axis
    const approach = jvx * nx + jvz * nz;
    if (approach > 0.4 && a.hitCd <= 0) {
      // a ridden mount hits as hard as its own weight allows
      const power = mounted ? clamp(Math.sqrt(jeep.mountMass! / 800), 0.4, 3) : 1;
      const dieAt = DIE_AT[a.def.tier] / clamp(power, 0.6, 1.6);
      const hitDmg = (8 + approach * 1.4) * power;
      if (approach > dieAt) {
        a.hp -= hitDmg;
        a.hurtT = 5;
        a.hitCd = 0.4;
        if (a.hp <= 0) {
          kill(ctx, a, nx, nz, approach, !mounted);
          return true;
        }
        // survivable wallop — hurt, shove clear, fight or flight
        const push = rr + 0.05 - dist;
        a.pos.x += nx * push;
        a.pos.z += nz * push;
        if (!mounted) ctx.host.onJeepImpact(clamp(1 - (a.def.mass * 0.9) / JEEP_MASS, 0.82, 0.99));
        enterState(a, a.def.temper === "fierce" ? "attack" : "flee");
        if (a.actions.react) {
          play(a, "react", 0.05, 1.5);
          a.reactT = 0.9;
        }
        ctx.host.thump(clamp(approach / 16, 0.25, 0.8));
        ctx.host.rumble(clamp(0.2 + a.def.mass / 3000, 0.2, 0.8), 160);
      } else {
        // slow bump — chips health, shoves the animal aside
        a.hp -= (4 + approach * 0.5) * power;
        a.hurtT = 5;
        a.hitCd = 0.4;
        if (a.hp <= 0) {
          kill(ctx, a, nx, nz, Math.max(approach, dieAt), !mounted);
          return true;
        }
        const push = rr + 0.05 - dist;
        a.pos.x += nx * push;
        a.pos.z += nz * push;
        enterState(a, a.def.temper === "fierce" ? "attack" : "flee");
        if (a.actions.react) {
          play(a, "react", 0.05, 1.4);
          a.reactT = 0.9;
        }
        ctx.host.thump(clamp(approach / 14, 0.08, 0.4));
        if (a.def.tier !== "light") ctx.host.rumble(0.2, 90);
      }
    }
  }
  return false;
}
