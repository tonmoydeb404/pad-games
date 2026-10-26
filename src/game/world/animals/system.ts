/**
 * Wildlife for Jungle Jeep — Quaternius animal packs (all CC0 1.0, see
 * public/assets/jeep/CREDITS.md):
 *
 *   Ultimate Animated Animals (Jul 2021) — 12 mammals
 *   Dinosaur Animated Pack (Dec 2018)    — 6 dinos
 *   Easy Animated Enemy Pack (Jan 2019)  — 6 critters
 *
 * Every species ships as a self-contained .glb with skinned mesh + clips
 * (Idle / Gallop|Run / Walk / Death …). Models load once as prototypes; each
 * placed animal is a SkeletonUtils.clone with its own AnimationMixer.
 *
 * Behaviour is deliberately simple and readable at driving speed:
 *   idle → (jeep close) → flee → hit → ragdoll-lite → dead → respawn.
 *
 * "Ragdoll-lite" death: launch velocity from the impact, arcade gravity,
 * terrain bounces, whole-body tumble, then the authored Death clip plays as
 * the body settles (species without one — snake — just flop to rest).
 * Light gore: a red particle burst plus a decal where the body lands.
 *
 * The module is engine-agnostic: the JeepEngine feeds terrain queries and
 * feedback hooks and applies the returned momentum changes to its vehicle.
 */
import { type AnimalCtx, createCtx } from "./actor";
import { melee, nearestTarget } from "./combat";
import { MODEL_FACING } from "./constants";
import { destroyAnimals } from "./destroy";
import { loadPrototypes } from "./loader";
import { probe, shoot } from "./raycast";
import { endRide, findRideable, rideCall, rideInfo, startRide } from "./ride";
import { rideSpecial } from "./ride-special";
import { rideJump, rideStep } from "./ride-step";
import { spawnAll } from "./spawn";
import { enterState } from "./states";
import { updateAnimals } from "./update";
import type { AnimalHost, JeepSnapshot, RideHandle, RideInfo, RideSpecialResult } from "./types";

export class AnimalSystem {
  private ctx: AnimalCtx;

  constructor(host: AnimalHost) {
    this.ctx = createCtx(host);
  }

  /** Load every species GLB. Progress reports 0..1 across the pack. */
  load(onProgress?: (k: number) => void): Promise<void> {
    return loadPrototypes(this.ctx, onProgress);
  }

  /** Scatter the population (seeded — the jungle is the same every drive). */
  spawnAll(seed = 20261): void {
    spawnAll(this.ctx, seed);
  }

  /** Total live actors (profiler / tests). */
  get count(): number {
    return this.ctx.actors.length;
  }

  /** How many animals of a species made it into the world. */
  countOf(file: string): number {
    return this.ctx.actors.filter((a) => a.def.file === file).length;
  }

  /**
   * Teleport the n-th animal of a species to a spot (debug views, tests).
   * Returns false when there is no such animal.
   */
  place(file: string, ordinal: number, x: number, z: number): boolean {
    const a = this.ctx.actors.filter((a2) => a2.def.file === file)[ordinal];
    if (!a) return false;
    const y = this.ctx.host.terrainHeight(x, z);
    a.pos.set(x, a.def.flyer ? y + a.def.height + 0.8 : y, z);
    a.root.position.copy(a.pos);
    a.root.rotation.set(0, a.yaw + MODEL_FACING, 0);
    a.bounces = 0;
    a.hp = a.maxHp;
    a.hurtT = 0;
    a.coolT = 0;
    enterState(a, "idle");
    return true;
  }

  /** Behaviour state of the n-th animal of a species (debug views, tests). */
  stateOf(file: string, ordinal = 0): string | null {
    const a = this.ctx.actors.filter((a2) => a2.def.file === file)[ordinal];
    return a?.state ?? null;
  }

  /** World position of the n-th animal of a species (debug views, tests). */
  debugPos(file: string, ordinal = 0): { x: number; z: number } | null {
    const a = this.ctx.actors.filter((a2) => a2.def.file === file)[ordinal];
    return a ? { x: a.pos.x, z: a.pos.z } : null;
  }

  /** Per-frame update. Reads the jeep, mutates nothing on it directly. */
  update(dt: number, jeep: JeepSnapshot): void {
    updateAnimals(this.ctx, dt, jeep);
  }

  /* ---- riding ---- */

  /** Nearest living animal within `range` (edge to point) — any species can be ridden. */
  findRideable(x: number, z: number, range: number): RideHandle | null {
    return findRideable(this.ctx, x, z, range);
  }

  rideInfo(h: RideHandle): RideInfo {
    return rideInfo(h);
  }

  startRide(h: RideHandle): void {
    startRide(h);
  }

  /** The mount answers the horn key: a short flinch-free vocal flourish. */
  rideCall(h: RideHandle): void {
    rideCall(h);
  }

  /** Drive a ridden animal with its own character (see ride-step). Returns where its origin now is. */
  rideStep(
    h: RideHandle,
    dt: number,
    targetYaw: number,
    speedFrac: number,
    jumpHeld = false,
  ): { x: number; y: number; z: number; yaw: number; speed: number } {
    return rideStep(this.ctx, h, dt, targetYaw, speedFrac, jumpHeld);
  }

  /** Jump off the ground with this species' own jump height. False when already airborne (or a flyer). */
  rideJump(h: RideHandle): boolean {
    return rideJump(h);
  }

  /** The species' special move; the result tells the engine what to show. */
  rideSpecial(h: RideHandle): RideSpecialResult {
    return rideSpecial(this.ctx, h);
  }

  endRide(h: RideHandle): void {
    endRide(h);
  }

  /* ---- combat ---- */

  /** Closest living animal inside `range` and in front of (ox,oz) — melee soft-lock. */
  nearestTarget(
    ox: number,
    oz: number,
    dirX: number,
    dirZ: number,
    range: number,
    minDot: number,
  ): { x: number; z: number } | null {
    return nearestTarget(this.ctx, ox, oz, dirX, dirZ, range, minDot);
  }

  /** A fist / boot swing from the explorer: damage, shove, kill or scare every animal in the cone. */
  melee(
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
    return melee(this.ctx, ox, oz, dirX, dirZ, range, arcCos, dmg, knock, fx);
  }

  /** Distance to the animal under a ray without hurting it (aim assist, crosshair colour). */
  probe(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): number | null {
    return probe(this.ctx, ox, oy, oz, dx, dy, dz, maxT);
  }

  /** Fire one pellet along a ray; `dmg` may be a function of the hit distance (range falloff). */
  shoot(
    ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
    maxT: number, dmg: number | ((t: number) => number), knock: number,
  ): { t: number; dmg: number; killed: boolean; heavy: boolean; name: string } | null {
    return shoot(this.ctx, ox, oy, oz, dx, dy, dz, maxT, dmg, knock);
  }

  destroy(): void {
    destroyAnimals(this.ctx);
  }
}
