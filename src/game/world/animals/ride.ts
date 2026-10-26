import type { Actor, AnimalCtx } from "./actor";
import { play } from "./animation";
import { clamp } from "../../core/noise";
import { CALLS } from "./calls";
import { JUMP_HEIGHT, rideTopSpeed } from "./ride-stats";
import { collectBodyPoints } from "./saddle";
import { saddleFromPoints } from "./saddle-fit";
import { specialOf } from "./specials";
import type { AnimalCall, RideHandle, RideInfo } from "./types";

/** Nearest living animal within `range` (edge to point) — any species can be ridden. */
export function findRideable(ctx: AnimalCtx, x: number, z: number, range: number): RideHandle | null {
  let best: Actor | null = null;
  let bestD = range;
  for (const a of ctx.actors) {
    if (a.ridden || a.state === "dead" || a.state === "ragdoll") continue;
    const d = Math.hypot(a.pos.x - x, a.pos.z - z) - a.radius;
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

export function rideInfo(h: RideHandle): RideInfo {
  const a = h as Actor;
  const c = CALLS[a.def.file] ?? { kind: "grunt" as AnimalCall, text: "Grrr!" };
  return {
    name: a.def.name,
    height: a.def.height,
    topSpeed: rideTopSpeed(a.def),
    mass: a.def.mass,
    radius: a.radius,
    x: a.pos.x,
    y: a.pos.y,
    z: a.pos.z,
    yaw: a.yaw,
    speed: a.rideSpeed ?? 0,
    hp: a.hp,
    maxHp: a.maxHp,
    seat: a.saddle,
    call: { kind: c.kind, text: c.text, pitch: clamp(1.6 - Math.log10(a.def.mass + 1) * 0.35, 0.55, 1.6) },
    jumpHeight: a.def.flyer ? 0 : (JUMP_HEIGHT[a.def.file] ?? 1),
    special: {
      name: specialOf(a.def).name,
      text: specialOf(a.def).text,
      cd: specialOf(a.def).cd,
      cdLeft: Math.max(0, a.specialCd ?? 0),
    },
  };
}

/** Re-measure the back from the animal's current (idle-animated) skeleton, not the bind pose. */
function remeasureSaddle(a: Actor): void {
  // (grazing, fleeing, mid-blend): the seat is then the same every time.
  const idle = a.actions.idle;
  if (idle) {
    for (const act of [a.actions.eat, a.actions.move, a.actions.react, a.actions.death]) act?.stop();
    idle.reset().setEffectiveWeight(1).play();
    a.current = idle;
  }
  a.mixer.update(0);
  const tris: number[] = [];
  const sd = saddleFromPoints(collectBodyPoints(a.root, a.root.scale.x, true, tris), a.def.height, tris);
  sd.y = Math.max(sd.y, a.def.height * 0.12);
  a.saddle = sd;
}

export function startRide(h: RideHandle): void {
  const a = h as Actor;
  remeasureSaddle(a);
  a.ridden = true;
  a.rideMoving = false;
  a.rideSpeed = 0;
  a.state = "idle";
  a.hurtT = 0;
  a.eatT = 0;
  play(a, "idle", 0.25, 0.95);
}

/** The mount answers the horn key: a short flinch-free vocal flourish. */
export function rideCall(h: RideHandle): void {
  const a = h as Actor;
  if (a.actions.react && !a.rideMoving) {
    play(a, "react", 0.08, 1.4);
    a.reactT = 0.7;
  }
}

export function endRide(h: RideHandle): void {
  const a = h as Actor;
  a.ridden = false;
  a.rideBoostT = 0;
  a.rideLeapSpeed = 0;
  a.onLand = null;
  a.rideAlt = 0;
  a.rideAirY = 0;
  a.rideVy = 0;
  a.rideMoving = false;
  a.rideSpeed = 0;
  a.targetYaw = a.yaw;
  a.state = "idle";
  a.idleTimer = 3;
  play(a, "idle", 0.3, 0.95);
}
