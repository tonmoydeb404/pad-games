import type { Actor, AnimalCtx } from "./actor";
import { play } from "./animation";
import { clamp } from "../../core/noise";
import { CALM_DIST, JEEP_MASS } from "./constants";
import { enterState } from "./states";

/** What an animal senses about whoever it reacts to this frame. */
export interface Sense {
  dx: number;
  dz: number;
  dist: number;
  rr: number;
  foot: boolean;
  fleeR: number;
  aggroR: number;
}

/** Timers, temperament and the idle/flee/attack decisions. */
export function think(ctx: AnimalCtx, a: Actor, dt: number, s: Sense): void {
  const { dx, dz, dist, rr, foot, fleeR, aggroR } = s;
  a.stateT += dt;
  if (a.coolT > 0) a.coolT -= dt;
  if (a.hurtT > 0) a.hurtT -= dt;
  if (a.hitCd > 0) a.hitCd -= dt;
  // flinch from a survivable bump → back to running/charging
  if (a.reactT > 0) {
    a.reactT -= dt;
    if (a.reactT <= 0 && (a.state === "flee" || a.state === "attack")) {
      play(a, "move", 0.3, a.state === "attack" ? 1.15 : 1);
    }
  }
  if (a.state === "idle") {
    if (a.eatT > 0) {
      a.eatT -= dt;
      if (a.eatT <= 0) play(a, "idle", 0.4);
    } else {
      a.idleTimer -= dt;
      if (a.idleTimer <= 0) {
        a.idleTimer = 4 + Math.random() * 7;
        a.targetYaw = a.yaw + (Math.random() - 0.5) * 2.4;
        if (a.actions.eat && Math.random() < 0.45) {
          play(a, "eat", 0.4, 0.9 + Math.random() * 0.3);
          a.eatT = 3.2 + Math.random() * 2.6;
        }
      }
    }
    // temperament decides: panic early (skittish), tolerate a close pass
    // (calm), or hold ground and charge (fierce, when healthy)
    const badlyHurt = a.hp <= a.maxHp * 0.3;
    if (a.def.temper === "fierce" && !badlyHurt) {
      if (a.coolT <= 0 && dist < aggroR) enterState(a, "attack");
    } else if (a.hurtT > 0 && dist < fleeR * 2) {
      // wildlife stands its ground — only an animal that has been hit
      // (or a badly wounded fierce one) runs; nothing bolts at the sight of you
      enterState(a, "flee");
    }
  } else if (a.state === "flee") {
    if (dist > CALM_DIST) {
      enterState(a, "idle");
    } else {
      // run away, gently steering around the jeep's exact heading
      const away = Math.atan2(-dx, -dz);
      a.targetYaw = away + Math.sin(ctx.t * 2.1 + a.phase) * 0.5;
    }
  } else if (a.state === "attack") {
    // charge the jeep; strike on contact, then back off for a moment
    if (dist > aggroR * 2.4 || (a.def.temper !== "fierce" && a.stateT > 6)) {
      enterState(a, "idle");
    } else {
      // charge: steer straight at the jeep
      a.targetYaw = Math.atan2(dx, dz);
      if (dist < rr + 0.5 && a.coolT <= 0 && foot) {
        const inv = 1 / Math.max(dist, 1e-5);
        ctx.host.onAnimalAttackFoot?.(a.def.atk, -dx * inv, -dz * inv);
        a.coolT = 1.6 + Math.random() * 1.4;
        enterState(a, "idle");
        if (a.actions.react) {
          play(a, "react", 0.08, 1.6);
          a.reactT = 0.8;
        }
      } else if (dist < rr + 0.5 && a.coolT <= 0) {
        const strikeKeep = clamp(1 - (a.def.mass * 0.7) / JEEP_MASS, 0.5, 0.98);
        const inv = 1 / Math.max(dist, 1e-5);
        ctx.host.onAnimalAttack(a.def.atk, strikeKeep, -dx * inv, -dz * inv);
        a.coolT = 2.2 + Math.random() * 1.8;
        enterState(a, "idle");
        if (a.actions.react) {
          play(a, "react", 0.08, 1.6);
          a.reactT = 0.8;
        }
      }
    }
  }
}
