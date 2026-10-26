import * as THREE from "three";
import { mulberry } from "../../core/noise";
import type { Actor, AnimalCtx } from "./actor";
import { makeActor } from "./actor-factory";
import { MODEL_FACING, RESPAWN_MIN } from "./constants";
import { enterState } from "./states";
import { DEFS } from "./species";
import type { AnimalDef } from "./types";

/** Scatter the population (seeded — the jungle is the same every drive). */
export function spawnAll(ctx: AnimalCtx, seed = 20261): void {
  const rnd = mulberry(seed);
  for (const def of DEFS) {
    const proto = ctx.prototypes.get(def.file);
    if (!proto) continue;
    for (let i = 0; i < def.count; i++) {
      const spot = findSpot(ctx, def, rnd);
      if (!spot) continue;
      ctx.actors.push(makeActor(ctx, def, proto, spot.x, spot.z, rnd));
    }
  }
}

/**
 * Off-trail spot for a species band; null after giving up. Band spots are
 * seeded along the trail (the corridor is where encounters happen). With
 * `opts.jeep`, the spot must also sit in the jeep-distance window so
 * respawns pop out of sight but nearby.
 */
export function findSpot(
  ctx: AnimalCtx,
  def: AnimalDef,
  rnd: () => number,
  opts?: { jeep?: THREE.Vector3; minD?: number; maxD?: number },
): { x: number; z: number } | null {
  for (let tries = 0; tries < 40; tries++) {
    let x: number;
    let z: number;
    if (def.band === "any") {
      x = (rnd() - 0.5) * 780;
      z = (rnd() - 0.5) * 780;
    } else if (def.band === "stream") {
      // propose along a pond/stream shore, then let the band check verify
      const p = ctx.host.waterSpawnPoint(rnd);
      x = p.x;
      z = p.z;
    } else {
      // propose relative to the trail — blind world sampling would waste
      // almost every try for trail-hugging bands
      const off = def.band === "deep" ? 70 : 10;
      const p = ctx.host.trailSpawnPoint(rnd, off, def.band === "deep" ? 130 : 55);
      x = p.x;
      z = p.z;
    }
    if (Math.hypot(x, z) > 400) continue;
    const td = ctx.host.trailDist(x, z);
    const sd = ctx.host.waterDist(x, z);
    let ok: boolean;
    switch (def.band) {
      case "stream":
        ok = sd < 42 && td > 8;
        break;
      case "deep":
        ok = td > 70 && sd > 50;
        break;
      case "corridor":
        ok = td >= 10 && td <= 55;
        break;
      default:
        ok = td > 12;
    }
    if (!ok) continue;
    if (ctx.host.blocked(x, z, def.height * 0.6 + 0.8)) continue;
    if (opts?.jeep) {
      const jd = Math.hypot(x - opts.jeep.x, z - opts.jeep.z);
      if (jd < (opts.minD ?? RESPAWN_MIN) || jd > (opts.maxD ?? 150)) continue;
    }
    return { x, z };
  }
  return null;
}

/** Bring an animal back 60–150 m from the jeep, on a band-valid spot. */
export function respawn(ctx: AnimalCtx, a: Actor, jeepPos: THREE.Vector3): void {
  const proto = ctx.prototypes.get(a.def.file);
  if (!proto) return;
  const spot = findSpot(ctx, a.def, mulberry((Math.random() * 1e9) | 0), {
    jeep: jeepPos,
    minD: RESPAWN_MIN,
    maxD: 150,
  });
  if (!spot) {
    a.respawnT = 3; // cramped jungle — try again shortly
    return;
  }
  const y = ctx.host.terrainHeight(spot.x, spot.z);
  a.pos.set(spot.x, a.def.flyer ? y + a.def.height + 0.8 : y, spot.z);
  a.root.position.copy(a.pos);
  a.root.rotation.set(0, a.yaw + MODEL_FACING, 0);
  a.bounces = 0;
  a.bled = false;
  a.hp = a.maxHp;
  a.hurtT = 0;
  a.coolT = 0;
  enterState(a, "idle");
  a.idleTimer = 1 + Math.random() * 3;
}
