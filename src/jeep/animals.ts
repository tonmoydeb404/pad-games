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
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { clamp, mulberry } from "./noise";

const BASE = "/assets/jeep/animals";
/** World-units² beyond which an animal's brain and mixer sleep. */
const THINK_DIST = 220;
const CALM_DIST = 58;
const GRAVITY = 22;
/** Impact speed (u/s) that kills. Heavy animals need a proper wallop. */
const DIE_AT = { light: 4.2, medium: 5.0, heavy: 8.0 };
const JEEP_MASS = 1900;
const MAX_DECALS = 26;
/**
 * Quaternius models are authored facing +Z; engine headings move along −Z
 * (like the jeep). Measured bind-pose boxes: every pack is long-axis Z, so a
 * single half-turn fixes the whole menagerie.
 */
const MODEL_FACING = Math.PI;
/** Killed animals reappear this fast (s), out of the jeep's range. */
const RESPAWN_MIN = 55;
const RESPAWN_DELAY = 4;
/** Dinosaurs are authored at natural size, then multiplied — they stay giants (size policy: see displayHeight). */
const SIZE_MULT = 4.5;

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

const NATURAL_DEFS: AnimalDef[] = [
  // ---- trail-corridor mammals — the wildlife you actually meet on the loop ----
  { name: "Deer", file: "Deer", height: 1.5, mass: 120, flee: 9.5, tier: "medium", temper: "skittish", hp: 70, atk: 0, points: 250, band: "corridor", count: 6 },
  { name: "Stag", file: "Stag", height: 1.75, mass: 200, flee: 9.0, tier: "medium", temper: "skittish", hp: 85, atk: 0, points: 250, band: "corridor", count: 5 },
  { name: "Fox", file: "Fox", height: 0.55, mass: 8, flee: 8.5, tier: "light", temper: "calm", hp: 25, atk: 0, points: 100, band: "corridor", count: 6 },
  { name: "Wolf", file: "Wolf", height: 0.8, mass: 45, flee: 9.0, tier: "light", temper: "fierce", hp: 45, atk: 12, points: 100, band: "corridor", count: 5 },
  { name: "Husky", file: "Husky", height: 0.55, mass: 26, flee: 8.5, tier: "light", temper: "calm", hp: 30, atk: 0, points: 100, band: "corridor", count: 4 },
  { name: "ShibaInu", file: "ShibaInu", height: 0.45, mass: 10, flee: 7.5, tier: "light", temper: "calm", hp: 22, atk: 0, points: 100, band: "corridor", count: 5 },
  { name: "Horse", file: "Horse", height: 1.65, mass: 500, flee: 11, tier: "heavy", temper: "skittish", hp: 120, atk: 0, points: 400, band: "corridor", count: 3 },
  { name: "Horse_White", file: "Horse_White", height: 1.65, mass: 500, flee: 11, tier: "heavy", temper: "skittish", hp: 120, atk: 0, points: 400, band: "corridor", count: 2 },
  { name: "Donkey", file: "Donkey", height: 1.45, mass: 350, flee: 8.0, tier: "medium", temper: "skittish", hp: 95, atk: 0, points: 250, band: "corridor", count: 3 },
  { name: "Alpaca", file: "Alpaca", height: 1.1, mass: 150, flee: 7.5, tier: "medium", temper: "skittish", hp: 65, atk: 0, points: 250, band: "corridor", count: 4 },
  { name: "Cow", file: "Cow", height: 1.45, mass: 600, flee: 6.5, tier: "heavy", temper: "skittish", hp: 140, atk: 0, points: 400, band: "corridor", count: 4 },
  { name: "Bull", file: "Bull", height: 1.55, mass: 800, flee: 7.0, tier: "heavy", temper: "fierce", hp: 260, atk: 26, points: 400, band: "corridor", count: 3 },
  // ---- stream critters ----
  { name: "Frog", file: "Frog", height: 0.22, mass: 0.5, flee: 3.2, tier: "light", temper: "skittish", hp: 10, atk: 0, hopper: true, points: 100, band: "stream", count: 6 },
  { name: "Snake", file: "Snake", height: 0.25, mass: 3, flee: 2.6, tier: "light", temper: "calm", hp: 15, atk: 0, points: 100, band: "stream", count: 4 },
  { name: "Snake_angry", file: "Snake_angry", height: 0.25, mass: 3, flee: 2.6, tier: "light", temper: "fierce", hp: 30, atk: 9, points: 150, band: "stream", count: 2 },
  { name: "Rat", file: "Rat", height: 0.18, mass: 0.5, flee: 4.2, tier: "light", temper: "skittish", hp: 8, atk: 0, points: 100, band: "stream", count: 5 },
  { name: "Spider", file: "Spider", height: 0.3, mass: 1, flee: 2.2, tier: "light", temper: "fierce", hp: 26, atk: 7, points: 100, band: "stream", count: 4 },
  // ---- deep jungle dinos ----
  { name: "Trex", file: "Trex", height: 3.6, mass: 4000, flee: 5.5, tier: "heavy", temper: "fierce", hp: 450, atk: 42, points: 500, band: "deep", count: 2 },
  { name: "Velociraptor", file: "Velociraptor", height: 1.1, mass: 150, flee: 8.5, tier: "medium", temper: "fierce", hp: 110, atk: 16, points: 500, band: "deep", count: 6 },
  { name: "Triceratops", file: "Triceratops", height: 1.5, mass: 900, flee: 5.0, tier: "heavy", temper: "calm", hp: 230, atk: 0, points: 500, band: "deep", count: 4 },
  { name: "Stegosaurus", file: "Stegosaurus", height: 1.8, mass: 1500, flee: 4.0, tier: "heavy", temper: "calm", hp: 300, atk: 0, points: 500, band: "deep", count: 4 },
  { name: "Apatosaurus", file: "Apatosaurus", height: 2.8, mass: 3000, flee: 3.5, tier: "heavy", temper: "calm", hp: 340, atk: 0, points: 500, band: "deep", count: 2 },
  { name: "Parasaurolophus", file: "Parasaurolophus", height: 1.7, mass: 800, flee: 5.5, tier: "heavy", temper: "calm", hp: 190, atk: 0, points: 500, band: "deep", count: 4 },
  // ---- anywhere ----
  { name: "Wasp", file: "Wasp", height: 0.35, mass: 0.2, flee: 6.0, tier: "light", temper: "fierce", hp: 12, atk: 5, flyer: true, points: 150, band: "any", count: 6 },
];

/**
 * On-screen size policy (rider = 1.72 m):
 *  - dinosaurs stay big (authored size × SIZE_MULT) — they are giants;
 *  - normal animals that can already carry a rider (deer, stag, horses, donkey,
 *    cow, bull) keep their regular, natural size;
 *  - small animals are scaled up only as far as a rider fits (RIDEABLE_HEIGHT).
 */
const DINOSAURS = new Set(["Trex", "Velociraptor", "Triceratops", "Stegosaurus", "Apatosaurus", "Parasaurolophus"]);
const RIDEABLE_HEIGHT: Record<string, number> = {
  Alpaca: 1.5,
  Wolf: 1.5,
  Husky: 1.4,
  ShibaInu: 1.3,
  Fox: 1.4,
  Frog: 1.1,
  Snake: 1.0,
  Snake_angry: 1.0,
  Rat: 1.2,
  Spider: 1.2,
  Wasp: 1.4,
};

/** Final on-screen height (m) for a species. */
function displayHeight(d: AnimalDef): number {
  if (DINOSAURS.has(d.file)) return d.height * SIZE_MULT;
  return Math.max(d.height, RIDEABLE_HEIGHT[d.file] ?? 0);
}

/** The shipped population. */
const DEFS: AnimalDef[] = NATURAL_DEFS.map((d) => ({ ...d, height: displayHeight(d) }));

/** Display name tweaks after the table (keeps the table terse). */
for (const d of DEFS) {
  if (d.file === "Horse_White") d.name = "White Horse";
  if (d.file === "Snake_angry") d.name = "Angry Snake";
}

interface Clips {
  idle: THREE.AnimationClip | null;
  eat: THREE.AnimationClip | null;
  move: THREE.AnimationClip | null;
  death: THREE.AnimationClip | null;
  react: THREE.AnimationClip | null;
}

function pickClips(all: THREE.AnimationClip[]): Clips {
  const find = (re: RegExp, avoid?: RegExp): THREE.AnimationClip | null =>
    all.find((c) => re.test(c.name) && !(avoid && avoid.test(c.name))) ?? null;
  return {
    idle: find(/idle/i, /headlow|hitreact/i) ?? find(/flying/i),
    eat: find(/eating/i),
    move: find(/gallop(?!.*jump)|run|flying/i) ?? find(/walk/i) ?? find(/jump/i),
    death: find(/death/i),
    react: find(/hitreact/i),
  };
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

/**
 * Riding top speed (u/s): each species' flee speed boosted to a real gallop,
 * with a floor so even the smallest mounts aren't painfully slow. The order
 * between species is kept (a horse still outruns a T-Rex).
 */
const RIDE_SPEED_BOOST = 1.7;
const RIDE_MIN_TOP = 5.5;
function rideTopSpeed(def: AnimalDef): number {
  return Math.max(def.flee * RIDE_SPEED_BOOST, RIDE_MIN_TOP);
}
/** Seconds of holding forward to reach top speed: light animals get going quickly, giants take a while. */
function rideRampTime(def: AnimalDef): number {
  return clamp(1.8 + Math.log10(def.mass + 1) * 0.9, 2, 6.5);
}

/** Jump height (m) per species while ridden — every animal jumps like itself. */
const JUMP_HEIGHT: Record<string, number> = {
  Deer: 2.4, Stag: 2.4, Fox: 1.8, Wolf: 1.8, Husky: 1.5, ShibaInu: 1.3,
  Horse: 2.0, Horse_White: 2.0, Donkey: 1.4, Alpaca: 1.4, Cow: 0.9, Bull: 1.0,
  Frog: 4.5, Snake: 0.8, Snake_angry: 0.8, Rat: 1.5, Spider: 2.5,
  Trex: 1.5, Velociraptor: 3.0, Triceratops: 1.0, Stegosaurus: 0.8, Apatosaurus: 0.5, Parasaurolophus: 1.4,
};

/** A species' special move — one button, its own cooldown. */
interface Special {
  name: string;
  text: string;
  cd: number;
  shake: number;
  thud: number;
  /** also plays the species' call */
  call?: boolean;
  heal?: number;
  /** burst of speed (multiplier of top speed, seconds) */
  boost?: { mult: number; dur: number };
  /** launch into the air: peak height (m) and the forward speed held until landing */
  leap?: { up: number; fwd: number };
  /** damage/knock/stun/scare area: "cone" ahead, "back" behind, "aoe" all around */
  hit?: { kind: "cone" | "back" | "aoe"; range: number; arc?: number; dmg: number; knock: number; stun?: number; scare?: boolean; onLand?: boolean };
}
const sp = (name: string, text: string, cd: number, rest: Partial<Special> = {}): Special => ({ name, text, cd, shake: 0.12, thud: 0.35, ...rest });
const SPECIALS: Record<string, Special> = {
  Deer: sp("Bound", "Leap!", 3, { leap: { up: 4.5, fwd: 11 } }),
  Stag: sp("Antler Charge", "Charge!", 7, { call: true, boost: { mult: 1.8, dur: 2.5 }, hit: { kind: "cone", range: 5, arc: 0.5, dmg: 28, knock: 6 }, shake: 0.3 }),
  Fox: sp("Pounce", "Pounce!", 4, { leap: { up: 2, fwd: 15 }, hit: { kind: "cone", range: 4, arc: 0.2, dmg: 20, knock: 3, onLand: true } }),
  Wolf: sp("Lunge Bite", "Bite!", 4, { leap: { up: 1.2, fwd: 19 }, hit: { kind: "cone", range: 5, arc: 0.2, dmg: 30, knock: 3, onLand: true } }),
  Husky: sp("Sled Sprint", "Sprint!", 8, { boost: { mult: 1.9, dur: 4 } }),
  ShibaInu: sp("Alarm Bark", "Woof!", 6, { call: true, hit: { kind: "aoe", range: 14, dmg: 0, knock: 0, stun: 1.2, scare: true } }),
  Horse: sp("Gallop Burst", "Hyah!", 7, { call: true, boost: { mult: 1.7, dur: 3 } }),
  Horse_White: sp("Gallop Burst", "Hyah!", 7, { call: true, boost: { mult: 1.7, dur: 3 } }),
  Donkey: sp("Rear Kick", "Kick!", 3, { hit: { kind: "back", range: 4.5, arc: 0.1, dmg: 38, knock: 9 }, shake: 0.25, thud: 0.6 }),
  Alpaca: sp("Spit", "Ptooey!", 3, { hit: { kind: "cone", range: 12, arc: 0.85, dmg: 5, knock: 1, stun: 2.5 } }),
  Cow: sp("Fresh Milk", "Mooo~ +30 HP", 20, { call: true, heal: 30 }),
  Bull: sp("Charge", "Charge!", 7, { call: true, boost: { mult: 2, dur: 3 }, hit: { kind: "cone", range: 5, arc: 0.5, dmg: 45, knock: 8 }, shake: 0.35 }),
  Frog: sp("Mega Leap", "Boing!", 5, { leap: { up: 9, fwd: 6 }, hit: { kind: "aoe", range: 8, dmg: 18, knock: 4, stun: 2, onLand: true }, shake: 0.3 }),
  Snake: sp("Venom Bite", "Bite!", 3, { hit: { kind: "cone", range: 5, arc: 0.4, dmg: 40, knock: 1 } }),
  Snake_angry: sp("Venom Bite", "BITE!", 3, { hit: { kind: "cone", range: 5, arc: 0.4, dmg: 60, knock: 1 } }),
  Rat: sp("Scurry", "Scurry!", 6, { boost: { mult: 2.2, dur: 2.5 } }),
  Spider: sp("Web Shot", "Thwip!", 5, { hit: { kind: "cone", range: 18, arc: 0.8, dmg: 0, knock: 0, stun: 4 } }),
  Wasp: sp("Sting Dive", "Sting!", 4, { boost: { mult: 2.2, dur: 1.5 }, hit: { kind: "cone", range: 6, arc: 0.4, dmg: 35, knock: 3 } }),
  Trex: sp("Mighty Roar", "ROOOAAR!", 10, { call: true, hit: { kind: "aoe", range: 40, dmg: 0, knock: 3, stun: 1.5, scare: true }, shake: 0.8, thud: 0.8 }),
  Velociraptor: sp("Pounce", "Pounce!", 5, { leap: { up: 3, fwd: 20 }, hit: { kind: "aoe", range: 7, dmg: 45, knock: 5, onLand: true }, shake: 0.3 }),
  Triceratops: sp("Horn Charge", "Charge!", 8, { call: true, boost: { mult: 1.7, dur: 3 }, hit: { kind: "cone", range: 9, arc: 0.5, dmg: 60, knock: 10 }, shake: 0.4 }),
  Stegosaurus: sp("Tail Swipe", "Swipe!", 5, { hit: { kind: "aoe", range: 14, dmg: 55, knock: 9 }, shake: 0.4, thud: 0.6 }),
  Apatosaurus: sp("Ground Stomp", "STOMP!", 9, { call: true, hit: { kind: "aoe", range: 40, dmg: 40, knock: 14, stun: 2 }, shake: 1, thud: 1 }),
  Parasaurolophus: sp("Sonic Honk", "HOOONK!", 7, { call: true, hit: { kind: "aoe", range: 35, dmg: 0, knock: 12, stun: 2, scare: true }, shake: 0.4 }),
};
function specialOf(def: AnimalDef): Special {
  return SPECIALS[def.file] ?? sp("Roar", "Grr!", 8, { call: true });
}

/** What each species says (the "horn"), and how it is written on screen. */
const CALLS: Record<string, { kind: AnimalCall; text: string }> = {
  Deer: { kind: "bleat", text: "Bleat!" },
  Stag: { kind: "bellow", text: "Bellow!" },
  Fox: { kind: "yip", text: "Yip yip!" },
  Wolf: { kind: "howl", text: "Awoooo!" },
  Husky: { kind: "bark", text: "Woof woof!" },
  ShibaInu: { kind: "bark", text: "Woof!" },
  Horse: { kind: "neigh", text: "Neigh!" },
  Horse_White: { kind: "neigh", text: "Neigh!" },
  Donkey: { kind: "bray", text: "Hee-haw!" },
  Alpaca: { kind: "hum", text: "Hmmm~" },
  Cow: { kind: "moo", text: "Moooo!" },
  Bull: { kind: "bellow", text: "BELLOW!" },
  Frog: { kind: "croak", text: "Ribbit!" },
  Snake: { kind: "hiss", text: "Hissss!" },
  Snake_angry: { kind: "hiss", text: "HISSSS!" },
  Rat: { kind: "squeak", text: "Squeak!" },
  Spider: { kind: "chitter", text: "Skrrrt!" },
  Trex: { kind: "roar", text: "ROOOAAR!" },
  Velociraptor: { kind: "screech", text: "SKREEE!" },
  Triceratops: { kind: "grunt", text: "Hwonk!" },
  Stegosaurus: { kind: "grunt", text: "Rrrmph!" },
  Apatosaurus: { kind: "trumpet", text: "Brooom!" },
  Parasaurolophus: { kind: "honk", text: "Hoooonk!" },
  Wasp: { kind: "buzz", text: "Bzzzzz!" },
};

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

/**
 * Find the back from the bind-pose vertices: take the middle of the body
 * (clear of head, neck, tail), bin it across its width, and sit on the lowest
 * of the central column tops — so a ridge of plates or a single spike never
 * lifts the seat, but the rider never ends up inside the body either.
 */
/** Load-time estimate (cheap, vertices only). The precise surface measurement runs when a rider mounts. */
export function measureSaddle(scene: THREE.Object3D, scale: number, height: number, useSurface = false): Saddle {
  const tris: number[] = [];
  return saddleFromPoints(collectBodyPoints(scene, scale, false, useSurface ? tris : undefined), height, useSurface ? tris : undefined);
}

/**
 * Body vertices in the model's own frame (+Z forward), scaled to world size.
 * `posed` reads the skinned/animated vertices (what you actually see); the
 * bind pose can sit noticeably lower than the idle animation.
 */
function collectBodyPoints(scene: THREE.Object3D, scale: number, posed: boolean, trisOut?: number[]): number[] {
  scene.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(scene.matrixWorld).invert();
  const toRoot = new THREE.Matrix4();
  const pts: number[] = [];
  const v = new THREE.Vector3();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    if (/horn|antler/i.test(m.name)) return; // sweeping antlers aren't part of the back
    const pos = m.geometry.getAttribute("position");
    if (!pos) return;
    // model frame: relative to the root, so the actor's own yaw/translation drop out
    toRoot.multiplyMatrices(inv, m.matrixWorld);
    // every vertex, transformed once (skinned meshes: the animated position)
    const vp = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      if (posed && typeof m.getVertexPosition === "function") m.getVertexPosition(i, v);
      else v.fromBufferAttribute(pos, i);
      v.applyMatrix4(toRoot).multiplyScalar(scale);
      vp[i * 3] = v.x;
      vp[i * 3 + 1] = v.y;
      vp[i * 3 + 2] = v.z;
    }
    const step = Math.max(1, Math.floor(pos.count / 6000));
    for (let i = 0; i < pos.count; i += step) {
      const x = vp[i * 3];
      const y = vp[i * 3 + 1];
      const z = vp[i * 3 + 2];
      if (Number.isFinite(x + y + z)) pts.push(x, y, z);
    }
    if (trisOut) {
      const idx = m.geometry.getIndex();
      const n = idx ? idx.count : pos.count;
      for (let t = 0; t + 2 < n; t += 3) {
        for (let k = 0; k < 3; k++) {
          const vi = idx ? idx.getX(t + k) : t + k;
          trisOut.push(vp[vi * 3], vp[vi * 3 + 1], vp[vi * 3 + 2]);
        }
      }
    }
  });
  return pts;
}

/**
 * Height of the back along the body's centreline: where each triangle crosses
 * the x = 0 plane, the highest crossing per slice of the seat band. Reads a
 * flat-topped box (no vertices mid-back) and a round ridge equally well. The
 * 40th percentile across slices ignores plates/spines that only occupy some
 * slices, so a stegosaurus is ridden on its back, not its plate tips.
 */
function centerlineTop(tris: number[], z0: number, z1: number): number | null {
  const SLICES = 12;
  const tops = new Array<number>(SLICES).fill(-Infinity);
  const dz = Math.max(z1 - z0, 1e-6);
  const cy: number[] = [];
  const cz: number[] = [];
  for (let i = 0; i + 8 < tris.length; i += 9) {
    // where the triangle's edges cross the x = 0 plane (0 or 2 points)
    cy.length = 0;
    cz.length = 0;
    for (let e = 0; e < 3; e++) {
      const a = i + e * 3;
      const b = i + ((e + 1) % 3) * 3;
      const xa = tris[a];
      const xb = tris[b];
      if ((xa > 0 && xb > 0) || (xa < 0 && xb < 0) || xa === xb) continue;
      const t = xa / (xa - xb);
      cy.push(tris[a + 1] + (tris[b + 1] - tris[a + 1]) * t);
      cz.push(tris[a + 2] + (tris[b + 2] - tris[a + 2]) * t);
    }
    if (cy.length < 2) continue;
    // the crossing is a segment: a big flat quad covers many slices, so fill each
    // slice the segment spans (an edge-only test would credit just one of them)
    const za = Math.min(cz[0], cz[1]);
    const zb = Math.max(cz[0], cz[1]);
    if (zb < z0 || za > z1) continue;
    const k0 = Math.max(0, Math.floor(((Math.max(za, z0) - z0) / dz) * SLICES));
    const k1 = Math.min(SLICES - 1, Math.floor(((Math.min(zb, z1) - z0) / dz) * SLICES));
    for (let k = k0; k <= k1; k++) {
      const zs = Math.min(zb, Math.max(za, z0 + ((k + 0.5) / SLICES) * dz));
      const f = zb - za < 1e-6 ? 0 : (zs - cz[0]) / (cz[1] - cz[0]);
      const y = cy[0] + (cy[1] - cy[0]) * f;
      if (y > tops[k]) tops[k] = y;
    }
  }
  const have = tops.filter((y) => y > -Infinity).sort((p1, p2) => p1 - p2);
  if (have.length < 3) return null;
  return have[Math.floor((have.length - 1) * 0.4)];
}

function saddleFromPoints(pts: number[], height: number, tris?: number[]): Saddle {
  // no readable geometry (should not happen): sit at a plausible height
  if (pts.length < 9) return { y: height * 0.6, fwd: 0, halfW: 0.3, len: height };
  let zmin = Infinity;
  let zmax = -Infinity;
  for (let i = 2; i < pts.length; i += 3) {
    zmin = Math.min(zmin, pts[i]);
    zmax = Math.max(zmax, pts[i]);
  }
  const len = Math.max(zmax - zmin, 0.1);
  // Where is the torso? Head, neck and tail drag the middle of the whole body
  // toward the shoulders, so find it from the FEET instead: the points near the
  // ground cluster under the front and rear legs, and the seat belongs midway
  // between the rearmost and foremost of them. Legless/odd bodies (snake, wasp)
  // fall back to the middle of the body.
  let ymin0 = Infinity;
  let ymax0 = -Infinity;
  for (let i = 1; i < pts.length; i += 3) {
    ymin0 = Math.min(ymin0, pts[i]);
    ymax0 = Math.max(ymax0, pts[i]);
  }
  const footLimit = ymin0 + (ymax0 - ymin0) * 0.22;
  const footZ: number[] = [];
  for (let i = 0; i < pts.length; i += 3) if (pts[i + 1] <= footLimit) footZ.push(pts[i + 2]);
  footZ.sort((p1, p2) => p1 - p2);
  // percentiles, not extremes: a tail lying along the ground (rat) or a trailing
  // limb must not drag the torso centre backwards
  const fz0 = footZ.length ? footZ[Math.floor(footZ.length * 0.15)] : 0;
  const fz1 = footZ.length ? footZ[Math.min(footZ.length - 1, Math.floor(footZ.length * 0.85))] : 0;
  const haveFeet = footZ.length >= 12 && fz1 - fz0 > len * 0.2;
  const zc = haveFeet ? (fz0 + fz1) / 2 : zmin + len * 0.5;
  const z0 = zc - len * 0.13;
  const z1 = zc + len * 0.13;
  // Low-poly bodies are a few big flat quads — there are no vertices mid-back,
  // so per-column tops read gaps as dips. Use the height of the upper vertices
  // of the mid-body instead: a high percentile ignores a lone spike or plate
  // ridge but lands on the real back of a flat-topped barrel.
  const ys: number[] = [];
  let maxY = -Infinity;
  for (let i = 0; i < pts.length; i += 3) {
    if (pts[i + 2] < z0 || pts[i + 2] > z1) continue;
    ys.push(pts[i + 1]);
    maxY = Math.max(maxY, pts[i + 1]);
  }
  if (!ys.length) return { y: height * 0.6, fwd: 0, halfW: 0.3, len };
  const upper = ys.filter((y) => y > maxY * 0.5).sort((p1, p2) => p1 - p2);
  const vertexY = upper[Math.min(upper.length - 1, Math.floor(upper.length * 0.7))];
  // prefer the real surface under the rider; the vertex percentile is the fallback
  const surfaceY = tris ? centerlineTop(tris, z0, z1) : null;
  const y = surfaceY !== null && surfaceY > maxY * 0.4 ? surfaceY : vertexY;
  // width where the body is actually solid (above the belly line)
  let wmin = Infinity;
  let wmax = -Infinity;
  for (let i = 0; i < pts.length; i += 3) {
    if (pts[i + 2] < z0 || pts[i + 2] > z1 || pts[i + 1] < y * 0.55) continue;
    wmin = Math.min(wmin, pts[i]);
    wmax = Math.max(wmax, pts[i]);
  }
  return { y, fwd: (z0 + z1) / 2, halfW: isFinite(wmin) ? (wmax - wmin) / 2 : 0.3, len };
}

type State = "idle" | "flee" | "attack" | "ragdoll" | "dead";

interface Actor {
  def: AnimalDef;
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  clips: Clips;
  actions: Partial<Record<"idle" | "eat" | "move" | "death" | "react", THREE.AnimationAction>>;
  current: THREE.AnimationAction | null;
  state: State;
  stateT: number;
  pos: THREE.Vector3;
  yaw: number;
  targetYaw: number;
  /** horizontal knockback (ragdoll) */
  vel: THREE.Vector3;
  vy: number;
  angVel: THREE.Vector3;
  bounces: number;
  bled: boolean;
  respawnT: number;
  radius: number;
  idleTimer: number;
  /** timer while grazing (returns to idle when it hits 0) */
  eatT: number;
  /** timer while flinching from a survivable bump */
  reactT: number;
  /** invulnerability frames after a hit — one contact, one damage event */
  hitCd: number;
  /** current / maximum hit points */
  hp: number;
  maxHp: number;
  /** seconds left before a fierce animal may strike again */
  coolT: number;
  /** seconds left showing the health bar after taking damage */
  hurtT: number;
  /** personal space — skittish individuals panic at wildly different ranges */
  fleeR: number;
  /** fierce: how close the jeep may get before it charges */
  aggroR: number;
  /** floating health bar (created lazily on first damage) */
  bar: { group: THREE.Group; fg: THREE.Sprite; w: number } | null;
  phase: number;
  /** Being ridden — the engine places it, the brain stays off. */
  ridden?: boolean;
  rideMoving?: boolean;
  /** Smoothed ground speed while ridden (mass-weighted inertia). */
  rideSpeed?: number;
  /** Height above the ground while jumping / leaping, and vertical speed. */
  rideAirY?: number;
  rideVy?: number;
  /** Special-move state: speed boost, forward speed held during a leap, landing effect, cooldown. */
  rideBoostT?: number;
  rideBoostMult?: number;
  rideLeapSpeed?: number;
  onLand?: (() => void) | null;
  specialCd?: number;
  /** Altitude a ridden flyer has climbed above its hover height. */
  rideAlt?: number;
  /** Seconds left stunned (webbed, honked at, splashed): no brain, no movement. */
  stunT?: number;
  saddle: Saddle;
}

export class AnimalSystem {
  private actors: Actor[] = [];
  private prototypes = new Map<string, { scene: THREE.Group; clips: Clips; scale: number; saddle: Saddle }>();
  private decals: { mesh: THREE.Mesh; life: number }[] = [];
  private decalGeo = new THREE.CircleGeometry(1, 14);
  private decalMat = new THREE.MeshBasicMaterial({
    color: 0x5c1210,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
  });
  private t = 0;

  constructor(
    private host: AnimalHost,
  ) {}

  /** Load every species GLB. Progress reports 0..1 across the pack. */
  async load(onProgress?: (k: number) => void): Promise<void> {
    const loader = new GLTFLoader();
    let done = 0;
    await Promise.all(
      DEFS.map(
        (def) =>
          new Promise<void>((resolve) => {
            loader.load(
              `${BASE}/${def.file}.glb`,
              (gltf) => {
                // natural height at bind pose → uniform normalize scale
                const box = new THREE.Box3().setFromObject(gltf.scene);
                const size = new THREE.Vector3();
                box.getSize(size);
                const natural = Math.max(size.y, 1e-4);
                const scene = gltf.scene;
                // Generous bounding sphere (bind-pose union + pose margin) so
                // skinned meshes frustum-cull correctly — bind-pose bounds are
                // wrong once bones move, and disabling culling entirely would
                // render the whole population every frame.
                const union = new THREE.Box3();
                const tmp = new THREE.Box3();
                const sphereCenter = new THREE.Vector3();
                scene.updateMatrixWorld(true);
                scene.traverse((o) => {
                  const m = o as THREE.Mesh;
                  if (m.isMesh && m.geometry) {
                    m.castShadow = true;
                    m.receiveShadow = false;
                    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
                    tmp.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
                    union.union(tmp);
                  }
                });
                const sphereRadius = Math.max(union.getSize(sphereCenter).length(), 0.5);
                union.getCenter(sphereCenter);
                scene.traverse((o) => {
                  const m = o as THREE.Mesh;
                  if (m.isMesh && m.geometry) {
                    m.geometry.boundingSphere = new THREE.Sphere(sphereCenter.clone(), sphereRadius);
                  }
                });
                this.prototypes.set(def.file, {
                  scene,
                  clips: pickClips(gltf.animations),
                  scale: def.height / natural,
                  saddle: (() => {
                    const sd = measureSaddle(scene, def.height / natural, def.height);
                    // a coiled/flat body can measure at or below the ground — never seat below a sliver of height
                    sd.y = Math.max(sd.y, def.height * 0.12);
                    return sd;
                  })(),
                });
                done++;
                onProgress?.(done / DEFS.length);
                resolve();
              },
              undefined,
              () => {
                console.warn(`[animals] failed to load ${def.file}.glb — species skipped`);
                done++;
                onProgress?.(done / DEFS.length);
                resolve();
              },
            );
          }),
      ),
    );
  }

  /** Scatter the population (seeded — the jungle is the same every drive). */
  spawnAll(seed = 20261): void {
    const rnd = mulberry(seed);
    for (const def of DEFS) {
      const proto = this.prototypes.get(def.file);
      if (!proto) continue;
      for (let i = 0; i < def.count; i++) {
        const spot = this.findSpot(def, rnd);
        if (!spot) continue;
        this.actors.push(this.makeActor(def, proto, spot.x, spot.z, rnd));
      }
    }
  }

  /** How many animals of a species made it into the world. */
  countOf(file: string): number {
    return this.actors.filter((a) => a.def.file === file).length;
  }

  /**
   * Teleport the n-th animal of a species to a spot (debug views, tests).
   * Returns false when there is no such animal.
   */
  place(file: string, ordinal: number, x: number, z: number): boolean {
    const a = this.actors.filter((a2) => a2.def.file === file)[ordinal];
    if (!a) return false;
    const y = this.host.terrainHeight(x, z);
    a.pos.set(x, a.def.flyer ? y + a.def.height + 0.8 : y, z);
    a.root.position.copy(a.pos);
    a.root.rotation.set(0, a.yaw + MODEL_FACING, 0);
    a.bounces = 0;
    a.hp = a.maxHp;
    a.hurtT = 0;
    a.coolT = 0;
    this.enterState(a, "idle");
    return true;
  }

  /** Behaviour state of the n-th animal of a species (debug views, tests). */
  stateOf(file: string, ordinal = 0): string | null {
    const a = this.actors.filter((a2) => a2.def.file === file)[ordinal];
    return a?.state ?? null;
  }

  /** World position of the n-th animal of a species (debug views, tests). */
  debugPos(file: string, ordinal = 0): { x: number; z: number } | null {
    const a = this.actors.filter((a2) => a2.def.file === file)[ordinal];
    return a ? { x: a.pos.x, z: a.pos.z } : null;
  }

  private makeActor(def: AnimalDef, proto: { scene: THREE.Group; clips: Clips; scale: number; saddle: Saddle }, x: number, z: number, rnd: () => number): Actor {
    const root = cloneSkinned(proto.scene) as THREE.Group;
    root.scale.setScalar(proto.scale);
    const mixer = new THREE.AnimationMixer(root);
    const clip = (c: THREE.AnimationClip | null): THREE.AnimationAction | undefined =>
      c ? mixer.clipAction(c) : undefined;
    const actions = {
      idle: clip(proto.clips.idle),
      eat: clip(proto.clips.eat),
      move: clip(proto.clips.move),
      death: clip(proto.clips.death),
      react: clip(proto.clips.react),
    };
    if (actions.idle) actions.idle.setLoop(THREE.LoopRepeat, Infinity);
    if (actions.move) actions.move.setLoop(THREE.LoopRepeat, Infinity);
    if (actions.eat) actions.eat.setLoop(THREE.LoopRepeat, Infinity);
    if (actions.death) {
      actions.death.setLoop(THREE.LoopOnce, 1);
      actions.death.clampWhenFinished = true; // hold the collapsed pose
    }
    if (actions.react) {
      actions.react.setLoop(THREE.LoopOnce, 1);
      actions.react.clampWhenFinished = true; // hold the flinch until we crossfade away
    }
    const y = this.host.terrainHeight(x, z);
    const pos = new THREE.Vector3(x, def.flyer ? y + def.height + 0.8 : y, z);
    const yaw = rnd() * Math.PI * 2;
    root.position.copy(pos);
    root.rotation.set(0, yaw + MODEL_FACING, 0);
    this.host.scene.add(root);
    const actor: Actor = {
      def,
      root,
      mixer,
      clips: proto.clips,
      actions,
      current: null,
      state: "idle",
      stateT: 0,
      pos,
      yaw,
      targetYaw: yaw,
      vel: new THREE.Vector3(),
      vy: 0,
      angVel: new THREE.Vector3(),
      bounces: 0,
      bled: false,
      respawnT: 0,
      radius: Math.max(0.35, def.height * 0.38),
      idleTimer: 2 + rnd() * 6,
      eatT: 0,
      reactT: 0,
      hitCd: 0,
      hp: def.hp,
      maxHp: def.hp,
      coolT: 0,
      hurtT: 0,
      // personal space: some individuals let you drive right past
      fleeR:
        def.temper === "calm" ? 4 + rnd() * 8 :
        def.temper === "fierce" ? 6 + rnd() * 10 :
        8 + rnd() * 18,
      aggroR: 10 + rnd() * 8,
      bar: null,
      phase: rnd() * Math.PI * 2,
      saddle: proto.saddle,
    };
    this.play(actor, "idle", 0.2, 0.9 + rnd() * 0.25);
    return actor;
  }

  private play(a: Actor, key: "idle" | "eat" | "move" | "death" | "react", fade = 0.22, timeScale = 1): void {
    const next = a.actions[key];
    if (!next || next === a.current) {
      if (next) next.timeScale = timeScale;
      return;
    }
    next.reset();
    next.timeScale = timeScale;
    next.setEffectiveWeight(1);
    next.fadeIn(fade);
    a.current?.fadeOut(fade);
    a.current = next;
    next.play();
  }

  /**
   * Off-trail spot for a species band; null after giving up. Band spots are
   * seeded along the trail (the corridor is where encounters happen). With
   * `opts.jeep`, the spot must also sit in the jeep-distance window so
   * respawns pop out of sight but nearby.
   */
  private findSpot(
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
        const p = this.host.waterSpawnPoint(rnd);
        x = p.x;
        z = p.z;
      } else {
        // propose relative to the trail — blind world sampling would waste
        // almost every try for trail-hugging bands
        const off = def.band === "deep" ? 70 : 10;
        const p = this.host.trailSpawnPoint(rnd, off, def.band === "deep" ? 130 : 55);
        x = p.x;
        z = p.z;
      }
      if (Math.hypot(x, z) > 400) continue;
      const td = this.host.trailDist(x, z);
      const sd = this.host.waterDist(x, z);
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
      if (this.host.blocked(x, z, def.height * 0.6 + 0.8)) continue;
      if (opts?.jeep) {
        const jd = Math.hypot(x - opts.jeep.x, z - opts.jeep.z);
        if (jd < (opts.minD ?? RESPAWN_MIN) || jd > (opts.maxD ?? 150)) continue;
      }
      return { x, z };
    }
    return null;
  }

  /** Floating health bar (sprites auto-billboard toward the camera). */
  private barMats = {
    bg: new THREE.SpriteMaterial({ color: 0x0d0f0d, depthTest: false, transparent: true, opacity: 0.85 }),
    fg: new THREE.SpriteMaterial({ color: 0xe5484d, depthTest: false }),
  };

  private ensureBar(a: Actor): void {
    if (a.bar) return;
    const w = a.def.height * 1.1 + 0.5;
    const h = Math.max(0.12, a.def.height * 0.055);
    const bg = new THREE.Sprite(this.barMats.bg);
    bg.scale.set(w + 0.08, h + 0.04, 1);
    bg.renderOrder = 10;
    const fg = new THREE.Sprite(this.barMats.fg);
    // anchor the fill's LEFT edge: scaling now depletes right→left only
    fg.center.set(0, 0.5);
    fg.scale.set(w, h, 1);
    fg.renderOrder = 11;
    const group = new THREE.Group();
    group.add(bg, fg);
    group.visible = false;
    this.host.scene.add(group);
    a.bar = { group, fg, w };
  }

  /** Per-frame update. Reads the jeep, mutates nothing on it directly. */
  update(dt: number, jeep: JeepSnapshot): void {
    this.t += dt;
    this.updateDecals(dt);

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

    for (const a of this.actors) {
      if (a.ridden) {
        a.mixer.update(dt); // the rider's controls place it; no brain, no respawn
        continue;
      }
      const fleeR = a.fleeR * senseK;
      const aggroR = a.aggroR * (foot ? 0.8 * (jeep.stealth ?? 1) : 1);
      const dx = a.pos.x - jeep.pos.x;
      const dz = a.pos.z - jeep.pos.z;
      const dist = Math.hypot(dx, dz);

      if (a.state === "dead") {
        a.respawnT -= dt;
        if (a.respawnT <= 0) {
          // only respawn out of the jeep's range
          if (dist > RESPAWN_MIN - 5) this.respawn(a, jeep.pos);
          else a.respawnT = 2;
        }
        continue;
      }

      // ragdoll physics runs regardless of distance (it's brief)
      if (a.state === "ragdoll") {
        this.updateRagdoll(a, dt);
        a.mixer.update(dt);
        continue;
      }

      // stunned (webbed, honked at, splashed): no brain, no movement until it wears off
      if ((a.stunT ?? 0) > 0) {
        a.stunT = a.stunT! - dt;
        if (a.stunT <= 0) a.mixer.timeScale = 1;
        a.mixer.update(dt);
        a.root.position.copy(a.pos);
        continue;
      }

      if (dist > THINK_DIST) continue; // asleep — no mixer, no brain
      a.mixer.update(dt);

      // ---- collision with the jeep ----
      const rr = a.radius + jeep.radius;
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
              this.kill(a, nx, nz, approach, !mounted);
              continue;
            }
            // survivable wallop — hurt, shove clear, fight or flight
            const push = rr + 0.05 - dist;
            a.pos.x += nx * push;
            a.pos.z += nz * push;
            if (!mounted) this.host.onJeepImpact(clamp(1 - (a.def.mass * 0.9) / JEEP_MASS, 0.82, 0.99));
            this.enterState(a, a.def.temper === "fierce" ? "attack" : "flee");
            if (a.actions.react) {
              this.play(a, "react", 0.05, 1.5);
              a.reactT = 0.9;
            }
            this.host.thump(clamp(approach / 16, 0.25, 0.8));
            this.host.rumble(clamp(0.2 + a.def.mass / 3000, 0.2, 0.8), 160);
          } else {
            // slow bump — chips health, shoves the animal aside
            a.hp -= (4 + approach * 0.5) * power;
            a.hurtT = 5;
            a.hitCd = 0.4;
            if (a.hp <= 0) {
              this.kill(a, nx, nz, Math.max(approach, dieAt), !mounted);
              continue;
            }
            const push = rr + 0.05 - dist;
            a.pos.x += nx * push;
            a.pos.z += nz * push;
            this.enterState(a, a.def.temper === "fierce" ? "attack" : "flee");
            if (a.actions.react) {
              this.play(a, "react", 0.05, 1.4);
              a.reactT = 0.9;
            }
            this.host.thump(clamp(approach / 14, 0.08, 0.4));
            if (a.def.tier !== "light") this.host.rumble(0.2, 90);
          }
        }
      }

      // ---- brain ----
      a.stateT += dt;
      if (a.coolT > 0) a.coolT -= dt;
      if (a.hurtT > 0) a.hurtT -= dt;
      if (a.hitCd > 0) a.hitCd -= dt;
      // flinch from a survivable bump → back to running/charging
      if (a.reactT > 0) {
        a.reactT -= dt;
        if (a.reactT <= 0 && (a.state === "flee" || a.state === "attack")) {
          this.play(a, "move", 0.3, a.state === "attack" ? 1.15 : 1);
        }
      }
      if (a.state === "idle") {
        if (a.eatT > 0) {
          a.eatT -= dt;
          if (a.eatT <= 0) this.play(a, "idle", 0.4);
        } else {
          a.idleTimer -= dt;
          if (a.idleTimer <= 0) {
            a.idleTimer = 4 + Math.random() * 7;
            a.targetYaw = a.yaw + (Math.random() - 0.5) * 2.4;
            if (a.actions.eat && Math.random() < 0.45) {
              this.play(a, "eat", 0.4, 0.9 + Math.random() * 0.3);
              a.eatT = 3.2 + Math.random() * 2.6;
            }
          }
        }
        // temperament decides: panic early (skittish), tolerate a close pass
        // (calm), or hold ground and charge (fierce, when healthy)
        const badlyHurt = a.hp <= a.maxHp * 0.3;
        if (a.def.temper === "fierce" && !badlyHurt) {
          if (a.coolT <= 0 && dist < aggroR) this.enterState(a, "attack");
        } else if (a.hurtT > 0 && dist < fleeR * 2) {
          // wildlife stands its ground — only an animal that has been hit
          // (or a badly wounded fierce one) runs; nothing bolts at the sight of you
          this.enterState(a, "flee");
        }
      } else if (a.state === "flee") {
        if (dist > CALM_DIST) {
          this.enterState(a, "idle");
        } else {
          // run away, gently steering around the jeep's exact heading
          const away = Math.atan2(-dx, -dz);
          a.targetYaw = away + Math.sin(this.t * 2.1 + a.phase) * 0.5;
        }
      } else if (a.state === "attack") {
        // charge the jeep; strike on contact, then back off for a moment
        if (dist > aggroR * 2.4 || (a.def.temper !== "fierce" && a.stateT > 6)) {
          this.enterState(a, "idle");
        } else {
          // charge: steer straight at the jeep
          a.targetYaw = Math.atan2(dx, dz);
          if (dist < rr + 0.5 && a.coolT <= 0 && foot) {
            const inv = 1 / Math.max(dist, 1e-5);
            this.host.onAnimalAttackFoot?.(a.def.atk, -dx * inv, -dz * inv);
            a.coolT = 1.6 + Math.random() * 1.4;
            this.enterState(a, "idle");
            if (a.actions.react) {
              this.play(a, "react", 0.08, 1.6);
              a.reactT = 0.8;
            }
          } else if (dist < rr + 0.5 && a.coolT <= 0) {
            const strikeKeep = clamp(1 - (a.def.mass * 0.7) / JEEP_MASS, 0.5, 0.98);
            const inv = 1 / Math.max(dist, 1e-5);
            this.host.onAnimalAttack(a.def.atk, strikeKeep, -dx * inv, -dz * inv);
            a.coolT = 2.2 + Math.random() * 1.8;
            this.enterState(a, "idle");
            if (a.actions.react) {
              this.play(a, "react", 0.08, 1.6);
              a.reactT = 0.8;
            }
          }
        }
      }

      // steer yaw toward target (wrap-safe)
      let dy = a.targetYaw - a.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      a.yaw += dy * Math.min(1, (a.state === "flee" || a.state === "attack" ? 7 : 1.6) * dt);

      // ground follow (+ flyer hover + hop gait)
      const gy = this.host.terrainHeight(a.pos.x, a.pos.z);
      if (a.def.flyer) {
        a.pos.y = gy + a.def.height + 0.8 + Math.sin(this.t * 3.1 + a.phase) * 0.16;
      } else if (a.state === "flee" && a.def.hopper) {
        a.pos.y = gy + Math.abs(Math.sin(this.t * 9 + a.phase)) * (a.def.height * 0.5 + 0.1);
      } else {
        a.pos.y = gy;
      }
      if (a.state === "flee" || a.state === "attack") {
        const spd = a.def.flee * (a.state === "attack" ? 1.05 : 1);
        a.pos.x += -Math.sin(a.yaw) * spd * dt;
        a.pos.z += -Math.cos(a.yaw) * spd * dt;
        // soft world-boundary steer-back (not while charging — the jeep is there)
        const r = Math.hypot(a.pos.x, a.pos.z);
        if (r > 400 && a.state === "flee") a.targetYaw = Math.atan2(-a.pos.x, -a.pos.z) + Math.PI;
      }
      a.root.position.copy(a.pos);
      a.root.rotation.set(0, a.yaw + MODEL_FACING, 0);

      // ---- health bar (only visible shortly after taking damage) ----
      if (a.hurtT > 0 && a.hp > 0 && dist < THINK_DIST) {
        this.ensureBar(a);
        const bar = a.bar!;
        bar.group.visible = true;
        bar.group.position.set(a.pos.x, a.pos.y + a.def.height + 0.45, a.pos.z);
        // keep the fill's left edge pinned to the bar's left end, whatever
        // direction the camera looks from (screen-right axis)
        const cr = this.host.camRight(this.tmpV2);
        bar.fg.position.set(-cr.x * bar.w * 0.5, -cr.y * bar.w * 0.5, -cr.z * bar.w * 0.5);
        bar.fg.scale.x = bar.w * clamp(a.hp / a.maxHp, 0, 1);
      } else if (a.bar) {
        a.bar.group.visible = false;
      }
    }
  }

  /* ---- riding -------------------------------------------------------------- */

  /** Nearest living animal within `range` (edge to point) — any species can be ridden. */
  findRideable(x: number, z: number, range: number): RideHandle | null {
    let best: Actor | null = null;
    let bestD = range;
    for (const a of this.actors) {
      if (a.ridden || a.state === "dead" || a.state === "ragdoll") continue;
      const d = Math.hypot(a.pos.x - x, a.pos.z - z) - a.radius;
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    return best;
  }

  rideInfo(h: RideHandle): RideInfo {
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
  private remeasureSaddle(a: Actor): void {
    // Always measure the idle clip's first frame, whatever the animal was doing
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

  startRide(h: RideHandle): void {
    const a = h as Actor;
    this.remeasureSaddle(a);
    a.ridden = true;
    a.rideMoving = false;
    a.rideSpeed = 0;
    a.state = "idle";
    a.hurtT = 0;
    a.eatT = 0;
    this.play(a, "idle", 0.25, 0.95);
  }

  /** The mount answers the horn key: a short flinch-free vocal flourish. */
  rideCall(h: RideHandle): void {
    const a = h as Actor;
    if (a.actions.react && !a.rideMoving) {
      this.play(a, "react", 0.08, 1.4);
      a.reactT = 0.7;
    }
  }

  /**
   * Drive a ridden animal with its own character: it turns at a rate set by
   * its size (a rat pivots, a T-Rex swings round), and speed BUILDS steadily
   * the longer you hold forward — walk, trot, canter, gallop — taking longer
   * for heavier animals (see rideTopSpeed / rideRampTime). It plays its own
   * move clip retimed to the pace and keeps its gait quirks (frog hops, wasp
   * hovers). Slides along static colliders. Returns where its origin now is.
   */
  rideStep(
    h: RideHandle,
    dt: number,
    targetYaw: number,
    speedFrac: number,
    jumpHeld = false,
  ): { x: number; y: number; z: number; yaw: number; speed: number } {
    const a = h as Actor;
    const def = a.def;
    if ((a.specialCd ?? 0) > 0) a.specialCd = Math.max(0, a.specialCd! - dt);

    const top = rideTopSpeed(def);
    const boosted = (a.rideBoostT ?? 0) > 0;
    if (boosted) a.rideBoostT = a.rideBoostT! - dt;
    const air = (a.rideAirY ?? 0) > 0.001 || (a.rideVy ?? 0) > 0;
    // a special-move boost drives forward on its own; otherwise the stick sets the target
    const want = boosted ? top * (a.rideBoostMult ?? 1) : top * clamp(speedFrac, 0, 1.1);
    // constant acceleration: speed climbs linearly to the target over the ramp
    // time (so it visibly keeps increasing), and braking is much quicker
    const accel = (top / rideRampTime(def)) * (boosted ? 3 : 1);
    const cur = a.rideSpeed ?? 0;
    let spd = cur + clamp(want - cur, -accel * 2.5 * dt, accel * dt);
    // a leap keeps its forward speed until it lands
    if (air && (a.rideLeapSpeed ?? 0) > 0) spd = Math.max(spd, a.rideLeapSpeed!);
    a.rideSpeed = spd < 0.03 && want === 0 ? 0 : spd;
    const moving = spd > 0.25;

    if (speedFrac > 0.04 || boosted) {
      let d = targetYaw - a.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      // turn rate falls with mass; a standstill pivot is slower than on the move
      const turn = clamp(9.5 - Math.log10(def.mass + 1) * 2.1, 2.2, 8) * (moving ? 1 : 0.75);
      a.yaw += clamp(d, -turn * dt, turn * dt);
    }

    // A frog travels in real hops: it launches whenever it is on the ground and
    // being steered, and only covers ground while airborne — the rider is lifted
    // by exactly the same arc as the body, so they stay level.
    if (def.hopper && speedFrac > 0.04 && !air) {
      a.rideVy = Math.sqrt(2 * GRAVITY * def.height * 0.35);
      a.rideAirY = 0.001;
    }
    const inAir = (a.rideAirY ?? 0) > 0.001 || (a.rideVy ?? 0) > 0;
    const ms = def.hopper ? (inAir ? spd * 1.6 : 0) : spd;
    if (ms > 0.25) {
      const nx = a.pos.x - Math.sin(a.yaw) * ms * dt;
      const nz = a.pos.z - Math.cos(a.yaw) * ms * dt;
      const r = a.radius * 0.8;
      if (!this.host.blocked(nx, a.pos.z, r)) a.pos.x = nx;
      if (!this.host.blocked(a.pos.x, nz, r)) a.pos.z = nz;
      const rad = Math.hypot(a.pos.x, a.pos.z);
      if (rad > 400) {
        a.pos.x *= 400 / rad;
        a.pos.z *= 400 / rad;
      }
    }

    // vertical: jump / leap arc under gravity (flyers climb instead)
    let airY = a.rideAirY ?? 0;
    let vy = a.rideVy ?? 0;
    if (airY > 0.001 || vy > 0) {
      vy -= GRAVITY * dt;
      airY += vy * dt;
      if (airY <= 0) {
        airY = 0;
        vy = 0;
        a.rideLeapSpeed = 0;
        const land = a.onLand;
        a.onLand = null;
        land?.();
      }
    }
    a.rideAirY = airY;
    a.rideVy = vy;

    // animation: hoppers keep their idle pose (the arc is the hop, so the body never
    // drifts off from the rider); everything else plays its own run clip at pace
    if (def.hopper) {
      if (a.current !== a.actions.idle) this.play(a, "idle", 0.1, 0.7);
    } else {
      if (moving !== a.rideMoving) {
        a.rideMoving = moving;
        this.play(a, moving ? "move" : "idle", 0.2, 1);
      }
      if (moving && a.current) a.current.timeScale = clamp(0.35 + 0.75 * (spd / def.flee), 0.4, 1.7);
    }

    const gy = this.host.terrainHeight(a.pos.x, a.pos.z);
    if (def.flyer) {
      a.rideAlt = clamp((a.rideAlt ?? 0) + (jumpHeld ? 9 : -6) * dt, 0, 16);
      a.pos.y = gy + def.height + 0.8 + Math.sin(this.t * 3.1 + a.phase) * 0.16 + a.rideAlt;
    } else a.pos.y = gy + airY;
    a.root.position.copy(a.pos);
    a.root.rotation.set(0, a.yaw + MODEL_FACING, 0);
    return { x: a.pos.x, y: a.pos.y, z: a.pos.z, yaw: a.yaw, speed: a.rideSpeed };
  }

  /** Jump off the ground with this species' own jump height. False when already airborne (or a flyer). */
  rideJump(h: RideHandle): boolean {
    const a = h as Actor;
    if (a.def.flyer) return false;
    if ((a.rideAirY ?? 0) > 0.001 || (a.rideVy ?? 0) > 0) return false;
    a.rideVy = Math.sqrt(2 * GRAVITY * (JUMP_HEIGHT[a.def.file] ?? 1));
    a.rideAirY = 0.001;
    return true;
  }

  /**
   * The species' special move: a speed burst, a leap, a cone/area strike that
   * damages / shoves / stuns / scares nearby animals, or a heal for the rider.
   * Each has its own cooldown; the result tells the engine what to show.
   */
  rideSpecial(h: RideHandle): RideSpecialResult {
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
        this.melee(a.pos.x, a.pos.z, hx, hz, hit.range, -1, hit.dmg, hit.knock, fx);
      } else {
        const dir = hit.kind === "back" ? -1 : 1;
        this.melee(a.pos.x + hx * dir * a.radius * 0.5, a.pos.z + hz * dir * a.radius * 0.5, hx * dir, hz * dir, hit.range, hit.arc ?? 0.4, hit.dmg, hit.knock, fx);
      }
      this.host.burst(a.pos.x, a.pos.y + 0.2, a.pos.z, 10 + Math.floor(Math.min(a.def.height, 8) * 3), 0x8a7a5f, 3, 0.12);
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

  endRide(h: RideHandle): void {
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
    this.play(a, "idle", 0.3, 0.95);
  }

  /** Closest living animal inside `range` and in front of (ox,oz) — melee soft-lock. */
  nearestTarget(
    ox: number,
    oz: number,
    dirX: number,
    dirZ: number,
    range: number,
    minDot: number,
  ): { x: number; z: number } | null {
    let best: { x: number; z: number } | null = null;
    let bestD = range;
    for (const a of this.actors) {
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
    const out = { hits: 0, kills: 0, heavy: false };
    for (const a of this.actors) {
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
        if (this.hurt(a, dmg, nx, nz, knock)) {
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
      if (fx?.scare) this.enterState(a, "flee");
    }
    return out;
  }

  /**
   * Shared damage step for fists and bullets: hit points, knock-back, blood,
   * and the animal's reaction (fight or flight by temperament). Returns true
   * when the hit killed it.
   */
  private hurt(a: Actor, dmg: number, nx: number, nz: number, knock: number): boolean {
    a.hp -= dmg;
    a.hurtT = 5;
    a.hitCd = 0.25;
    if (a.hp <= 0) {
      this.kill(a, nx, nz, 7 + knock * 1.4, false);
      return true;
    }
    const push = knock / (1 + a.def.mass / 60);
    a.pos.x += nx * push;
    a.pos.z += nz * push;
    this.host.burst(a.pos.x, a.pos.y + a.def.height * 0.55, a.pos.z, 4 + Math.floor(a.def.height * 2), 0x8f1a12, 1.8, 0.1);
    this.enterState(a, a.def.temper === "fierce" || (a.hp > a.maxHp * 0.6 && a.def.atk > 0) ? "attack" : "flee");
    if (a.actions.react) {
      this.play(a, "react", 0.05, 1.5);
      a.reactT = 0.7;
    }
    return false;
  }

  /**
   * Distance along a ray to the nearest living animal's body, or null. Each
   * body is an ellipsoid fitted to the model (length from the measured
   * back, height from the def), turned to the animal's heading.
   */
  private rayActor(
    a: Actor, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  ): number | null {
    const def = a.def;
    const half = {
      f: Math.max(a.saddle.len * 0.5, a.radius),
      u: Math.max(def.height * 0.5, 0.15),
      s: Math.max(a.saddle.halfW * 1.15, def.height * 0.16, 0.15),
    };
    // into the animal's frame: side (x), up (y), heading (z)
    const hx = -Math.sin(a.yaw);
    const hz = -Math.cos(a.yaw);
    const sx = Math.cos(a.yaw);
    const sz = -Math.sin(a.yaw);
    const cx = a.pos.x;
    const cy = a.pos.y + def.height * 0.5;
    const cz = a.pos.z;
    const px = ox - cx;
    const py = oy - cy;
    const pz = oz - cz;
    const o = [(px * sx + pz * sz) / half.s, py / half.u, (px * hx + pz * hz) / half.f];
    const d = [(dx * sx + dz * sz) / half.s, dy / half.u, (dx * hx + dz * hz) / half.f];
    const A = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    const B = 2 * (o[0] * d[0] + o[1] * d[1] + o[2] * d[2]);
    const C = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - 1;
    const disc = B * B - 4 * A * C;
    if (disc < 0 || A < 1e-9) return null;
    const t = (-B - Math.sqrt(disc)) / (2 * A);
    if (t >= 0) return t;
    const t2 = (-B + Math.sqrt(disc)) / (2 * A);
    return t2 >= 0 ? 0 : null; // origin inside the body: point blank
  }

  /** Nearest living, un-ridden animal on a ray within `maxT`. */
  private nearestOnRay(
    ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number,
  ): { a: Actor; t: number } | null {
    let best: Actor | null = null;
    let bestT = maxT;
    for (const a of this.actors) {
      if (a.ridden || a.state === "dead" || a.state === "ragdoll") continue;
      // cheap reject: the ray must pass within the body's bounding sphere
      const rx = a.pos.x - ox;
      const ry = a.pos.y + a.def.height * 0.5 - oy;
      const rz = a.pos.z - oz;
      const along = rx * dx + ry * dy + rz * dz;
      const reach = Math.max(a.saddle.len * 0.5, a.def.height) + 1;
      if (along < -reach || along > maxT + reach) continue;
      const perp2 = rx * rx + ry * ry + rz * rz - along * along;
      if (perp2 > reach * reach) continue;
      const t = this.rayActor(a, ox, oy, oz, dx, dy, dz);
      if (t !== null && t < bestT) {
        bestT = t;
        best = a;
      }
    }
    return best ? { a: best, t: bestT } : null;
  }

  /** Distance to the animal under a ray without hurting it (aim assist, crosshair colour). */
  probe(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): number | null {
    return this.nearestOnRay(ox, oy, oz, dx, dy, dz, maxT)?.t ?? null;
  }

  /**
   * Fire one pellet along a ray (unit `dir`) up to `maxT` metres. The nearest
   * animal on the line takes `dmg` (+ knock-back along the shot); returns where
   * it hit, or null on a miss. `dmg` may be a function of the hit distance (range
   * falloff). Animals being ridden are not targets.
   */
  shoot(
    ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
    maxT: number, dmg: number | ((t: number) => number), knock: number,
  ): { t: number; dmg: number; killed: boolean; heavy: boolean; name: string } | null {
    const hit = this.nearestOnRay(ox, oy, oz, dx, dy, dz, maxT);
    if (!hit) return null;
    const inv = 1 / Math.max(Math.hypot(dx, dz), 1e-5);
    const dealt = typeof dmg === "function" ? dmg(hit.t) : dmg;
    const killed = this.hurt(hit.a, dealt, dx * inv, dz * inv, knock);
    return { t: hit.t, dmg: dealt, killed, heavy: hit.a.def.tier === "heavy", name: hit.a.def.name };
  }

  private enterState(a: Actor, s: State): void {
    if (a.state === s) return;
    a.state = s;
    a.stateT = 0;
    if (s !== "idle") a.eatT = 0;
    if (s === "idle") this.play(a, "idle", 0.35, 0.95);
    if (s === "flee") this.play(a, "move", 0.18, 1.0 + Math.random() * 0.15);
    if (s === "attack") this.play(a, "move", 0.15, 1.15);
  }

  /** Lethal hit: momentum exchange + ragdoll launch. */
  private kill(a: Actor, nx: number, nz: number, approach: number, byJeep = true): void {
    a.stunT = 0;
    a.mixer.timeScale = 1;
    const def = a.def;
    // heavy animals bleed speed off the jeep (and hurt it)
    const keep = clamp(1 - (def.mass * 1.5) / JEEP_MASS, 0.15, 0.985);
    if (byJeep) {
      this.host.onJeepImpact(keep);
      if (def.tier === "heavy") this.host.onHeavyImpact(approach);
    }
    this.host.onKill(def.name, def.points);

    // gore at the bumper
    this.host.burst(a.pos.x, a.pos.y + def.height * 0.45, a.pos.z, 10 + Math.floor(def.height * 6), 0x8f1a12, 3.2, 0.14);
    this.host.thump(clamp(0.3 + def.mass / 2400, 0.3, 1));
    this.host.rumble(clamp(0.25 + def.mass / 2600, 0.25, 0.9), 200);

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
    this.enterState(a, "ragdoll");
    if (a.def.flyer) this.play(a, "death", 0.05, 0.4); // wasp: crumple mid-air, slow
  }

  private updateRagdoll(a: Actor, dt: number): void {
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
      this.tmpQ.setFromAxisAngle(this.tmpV.copy(a.angVel).divideScalar(w), w * dt);
      a.root.quaternion.premultiply(this.tmpQ);
    }

    const gy = this.host.terrainHeight(a.pos.x, a.pos.z);
    if (a.pos.y <= gy) {
      a.pos.y = gy;
      if (!a.bled) {
        a.bled = true;
        this.host.burst(a.pos.x, gy + 0.12, a.pos.z, 12, 0x6e1410, 2.2, 0.12);
        this.addDecal(a.pos.x, gy, a.pos.z, 0.3 + a.def.height * 0.28);
      }
      if (a.vy < -3 && a.bounces < 2) {
        a.vy = -a.vy * 0.32;
        a.vel.x *= 0.55;
        a.vel.z *= 0.55;
        a.angVel.multiplyScalar(0.55);
        a.bounces++;
        this.host.burst(a.pos.x, gy + 0.1, a.pos.z, 6, 0x8a7a5f, 1.6, 0.1); // dust
      } else {
        this.settle(a);
        return;
      }
    }
    a.root.position.copy(a.pos);
  }

  /** Body at rest: play the authored Death collapse (if any) and start the respawn clock. */
  private settle(a: Actor): void {
    a.state = "dead";
    a.respawnT = RESPAWN_DELAY + Math.random() * 4;
    a.vel.set(0, 0, 0);
    a.angVel.set(0, 0, 0);
    if (a.actions.death) {
      // death clip from the current (tumbled) pose — reads as the final collapse
      this.play(a, "death", 0.08, 1.5);
    } else if (a.current) {
      // no death clip (snake): hold the flop pose instead of snapping to rest
      a.current.paused = true;
    }
  }

  /** Bring an animal back 60–150 m from the jeep, on a band-valid spot. */
  private respawn(a: Actor, jeepPos: THREE.Vector3): void {
    const proto = this.prototypes.get(a.def.file);
    if (!proto) return;
    const spot = this.findSpot(a.def, mulberry((Math.random() * 1e9) | 0), {
      jeep: jeepPos,
      minD: RESPAWN_MIN,
      maxD: 150,
    });
    if (!spot) {
      a.respawnT = 3; // cramped jungle — try again shortly
      return;
    }
    const y = this.host.terrainHeight(spot.x, spot.z);
    a.pos.set(spot.x, a.def.flyer ? y + a.def.height + 0.8 : y, spot.z);
    a.root.position.copy(a.pos);
    a.root.rotation.set(0, a.yaw + MODEL_FACING, 0);
    a.bounces = 0;
    a.bled = false;
    a.hp = a.maxHp;
    a.hurtT = 0;
    a.coolT = 0;
    this.enterState(a, "idle");
    a.idleTimer = 1 + Math.random() * 3;
  }

  // ---- gore decals ----

  private addDecal(x: number, y: number, z: number, r: number): void {
    let slot = this.decals.find((d) => d.life <= 0);
    if (!slot) {
      if (this.decals.length >= MAX_DECALS) {
        slot = this.decals.reduce((m, d) => (d.life < m.life ? d : m), this.decals[0]);
      } else {
        const mesh = new THREE.Mesh(this.decalGeo, this.decalMat.clone());
        mesh.rotation.x = -Math.PI / 2;
        mesh.renderOrder = 2;
        this.host.scene.add(mesh);
        slot = { mesh, life: 0 };
        this.decals.push(slot);
      }
    }
    slot.mesh.visible = true;
    slot.mesh.position.set(x, y + 0.035, z);
    slot.mesh.scale.setScalar(r);
    (slot.mesh.material as THREE.MeshBasicMaterial).opacity = 0.78;
    slot.life = 26;
  }

  private updateDecals(dt: number): void {
    for (const d of this.decals) {
      if (d.life <= 0) continue;
      d.life -= dt;
      const mat = d.mesh.material as THREE.MeshBasicMaterial;
      if (d.life < 6) mat.opacity = 0.78 * Math.max(0, d.life / 6);
      if (d.life <= 0) d.mesh.visible = false;
    }
  }

  destroy(): void {
    for (const a of this.actors) {
      this.host.scene.remove(a.root);
      if (a.bar) this.host.scene.remove(a.bar.group);
      a.mixer.stopAllAction();
    }
    this.actors = [];
    for (const d of this.decals) this.host.scene.remove(d.mesh);
    this.decals = [];
    this.decalGeo.dispose();
    this.decalMat.dispose();
  }

  private tmpQ = new THREE.Quaternion();
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
}
