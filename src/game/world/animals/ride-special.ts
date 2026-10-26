import { clamp } from "../../core/noise";
import type { Actor, AnimalCtx } from "./actor";
import { CALLS } from "./calls";
import { melee } from "./combat";
import { GRAVITY } from "./constants";
import { specialOf } from "./specials";
import type { AnimalCall, RideHandle, RideSpecialResult } from "./types";

/**
 * The species' special move: a speed burst, a leap, a cone/area strike that
 * damages / shoves / stuns / scares nearby animals, or a heal for the rider.
 * Each has its own cooldown; the result tells the engine what to show.
 */
export function rideSpecial(ctx: AnimalCtx, h: RideHandle): RideSpecialResult {
  const a = h as Actor;
  const spec = specialOf(a.def);
  const c = CALLS[a.def.file] ?? { kind: "grunt" as AnimalCall, text: "Grrr!" };
  const pitch = clamp(1.6 - Math.log10(a.def.mass + 1) * 0.35, 0.55, 1.6);
  if ((a.specialCd ?? 0) > 0) {
    return { ready: false, name: spec.name, text: spec.name, cdLeft: a.specialCd!, heal: 0, shake: 0, thud: 0, call: null };
  }
  a.specialCd = spec.cd;
  const hx = -Math.sin(a.yaw);
  const hz = -Math.cos(a.yaw);
  const strike = (): void => {
    const hit = spec.hit;
    if (!hit) return;
    const fx = { stun: hit.stun ?? 0, scare: !!hit.scare };
    if (hit.kind === "aoe") {
      melee(ctx, a.pos.x, a.pos.z, hx, hz, hit.range, -1, hit.dmg, hit.knock, fx);
    } else {
      const dir = hit.kind === "back" ? -1 : 1;
      melee(ctx, a.pos.x + hx * dir * a.radius * 0.5, a.pos.z + hz * dir * a.radius * 0.5, hx * dir, hz * dir, hit.range, hit.arc ?? 0.4, hit.dmg, hit.knock, fx);
    }
    ctx.host.burst(a.pos.x, a.pos.y + 0.2, a.pos.z, 10 + Math.floor(Math.min(a.def.height, 8) * 3), 0x8a7a5f, 3, 0.12);
  };
  if (spec.boost) {
    a.rideBoostT = spec.boost.dur;
    a.rideBoostMult = spec.boost.mult;
  }
  if (spec.leap) {
    // launches from the ground or from mid-hop alike (a frog is hopping most of the time)
    a.rideVy = Math.max(a.rideVy ?? 0, Math.sqrt(2 * GRAVITY * spec.leap.up));
    a.rideAirY = Math.max(a.rideAirY ?? 0, 0.001);
    a.rideLeapSpeed = spec.leap.fwd;
  }
  if (spec.hit) {
    if (spec.hit.onLand && spec.leap) a.onLand = strike;
    else strike();
  }
  return {
    ready: true,
    name: spec.name,
    text: spec.text,
    cdLeft: 0,
    heal: spec.heal ?? 0,
    shake: spec.shake,
    thud: spec.thud,
    call: spec.call ? { kind: c.kind, pitch } : null,
  };
}
