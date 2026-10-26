import type * as THREE from "three";

export type AnimalTier = "light" | "medium" | "heavy";
export type SpawnBand = "corridor" | "stream" | "deep" | "any";
/** How the species reacts to the jeep. */
export type Temper = "skittish" | "calm" | "fierce";

export interface AnimalDef {
  name: string;
  file: string;
  /** Target on-screen height in meters — models normalize to this. */
  height: number;
  /** Physics mass in kg — drives momentum transfer, launch and jeep damage. */
  mass: number;
  /** Flee/charge speed (u/s). */
  flee: number;
  tier: AnimalTier;
  temper: Temper;
  /** Hit points — the jeep needs several solid hits for anything tough. */
  hp: number;
  /** Damage dealt per attack strike (fierce species only). */
  atk: number;
  /** Hovers (wasp). */
  flyer?: boolean;
  /** Hop gait while fleeing (frog). */
  hopper?: boolean;
  points: number;
  band: SpawnBand;
  count: number;
}

/** Momentum/feedback surface the host (JeepEngine) provides. */
export interface AnimalHost {
  scene: THREE.Scene;
  terrainHeight(x: number, z: number): number;
  /** Perpendicular distance from the trail spline (0 = on the road). */
  trailDist(x: number, z: number): number;
  /** Distance from the stream centre. */
  waterDist(x: number, z: number): number;
  /** Propose a random spot near a random water body (pond/stream shore). */
  waterSpawnPoint(r: () => number): { x: number; z: number };
  /**
   * Propose a random spot `offMin..offMax` meters off the trail (band seeding —
   * far more efficient than blind world sampling for trail-hugging bands).
   */
  trailSpawnPoint(r: () => number, offMin: number, offMax: number): { x: number; z: number };
  /** True when a static collider (tree, rock, log) occupies the spot. */
  blocked(x: number, z: number, r: number): boolean;
  /** Impact particle burst (blood, dust…). */
  burst(x: number, y: number, z: number, n: number, color: number, spread: number, size: number): void;
  /** Kill registered — HUD counter, notify, score. */
  onKill(name: string, points: number): void;
  /** Jeep rammed a heavy animal — damage, slow-mo, rumble, trauma. */
  onHeavyImpact(approach: number): void;
  /** Jeep keeps this fraction of its speed after the hit (module computes). */
  onJeepImpact(keep: number): void;
  /** A fierce animal struck the jeep: apply damage + knockback + feedback. */
  onAnimalAttack(dmg: number, keep: number, nx: number, nz: number): void;
  /** A fierce animal struck the player on foot (n = direction away from the animal). */
  onAnimalAttackFoot?(dmg: number, nx: number, nz: number): void;
  /** Camera right axis (screen-right) — health bars anchor against it. */
  camRight(out: THREE.Vector3): THREE.Vector3;
  thump(strength: number): void;
  rumble(strength: number, ms: number): void;
}

/**
 * What the module needs to read from whoever the animals are reacting to each
 * frame: the vehicle while driving, the explorer while on foot (`onFoot`).
 */
export interface JeepSnapshot {
  pos: THREE.Vector3;
  speed: number;
  lateral: number;
  yaw: number;
  /** Vehicle body radius (varies with the selected car). */
  radius: number;
  /** The player is walking: animals sense and fight the explorer, not the parked car. */
  onFoot?: boolean;
  /** On foot: how noticeable the player is (crouching < 1 < sprinting). */
  stealth?: number;
  /** The player rides this animal: its mass turns it into a battering ram like the jeep. */
  mountMass?: number;
}

export interface RideInfo {
  name: string;
  height: number;
  /** The species' own top speed (u/s). */
  topSpeed: number;
  mass: number;
  radius: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Current ground speed. */
  speed: number;
  hp: number;
  maxHp: number;
  seat: Saddle;
  call: { kind: AnimalCall; text: string; pitch: number };
  /** Jump height (m) — 0 for a flyer, which climbs while the jump key is held. */
  jumpHeight: number;
  special: { name: string; text: string; cd: number; cdLeft: number };
}

/** What `rideSpecial` reports back so the engine can add the feel (sound, shake, heal). */
export interface RideSpecialResult {
  ready: boolean;
  name: string;
  text: string;
  cdLeft: number;
  heal: number;
  shake: number;
  thud: number;
  call: { kind: AnimalCall; pitch: number } | null;
}

/** Opaque handle to an animal (see AnimalSystem.findRideable). */
export type RideHandle = object;

/** Synth voice the audio engine plays when a rider hits the horn key. */
export type AnimalCall =
  | "bark" | "yip" | "howl" | "neigh" | "bray" | "moo" | "bellow" | "bleat" | "hum"
  | "croak" | "hiss" | "squeak" | "chitter" | "buzz" | "roar" | "screech" | "trumpet" | "honk" | "grunt";

/** Where a rider sits on a species: measured from the model's real back. */
export interface Saddle {
  /** Top of the back above the animal's feet (m, after scaling). */
  y: number;
  /** Seat offset along the heading from the animal's origin. */
  fwd: number;
  /** Half the body width at the saddle — decides straddle vs legs-forward. */
  halfW: number;
  /** Body length. */
  len: number;
}
