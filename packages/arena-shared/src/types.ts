export type Vec3 = [number, number, number];

export interface Box {
  min: Vec3;
  max: Vec3;
  /** kept for the box-art fallback renderer */
  color: number;
}

/** One fixed-step input command (SIM_DT long). */
export interface InputCommand {
  seq: number;
  /** strafe right = +1 */
  mx: number;
  /** forward = +1 */
  mz: number;
  yaw: number;
  pitch: number;
  jump: boolean;
  fire: boolean;
  reload: boolean;
  /** weapon id to switch to, or -1 */
  weapon: number;
  /** throw a grenade this step */
  throw: boolean;
  /** scoped in (sniper) — tightens server-side spread */
  zoom: boolean;
}

/** Kinematic state shared by prediction and authority. */
export interface MoveState {
  x: number;
  y: number;
  z: number;
  vy: number;
  onGround: boolean;
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  color: number;
  x: number;
  y: number;
  z: number;
  vy: number;
  og: boolean;
  yaw: number;
  pitch: number;
  hp: number;
  armor: number;
  alive: boolean;
  weapon: number;
  /** bitmask of owned weapons (bit i = WEAPONS[i]) */
  weapons: number;
  ammo: number;
  reserve: number;
  grenades: number;
  skin: number;
  kills: number;
  deaths: number;
  /** last input seq the server processed (for reconciliation) */
  ack: number;
}

/** A dynamic prop that is awake (or recently settled) — interpolated client-side. */
export interface PropSnapshot {
  /** index into MAP_PROPS */
  i: number;
  x: number;
  y: number;
  z: number;
  /** yaw only — crates/barrels mostly rotate about Y; cheap and stable */
  ry: number;
}

export interface GrenadeSnapshot {
  id: number;
  x: number;
  y: number;
  z: number;
}

export interface Snapshot {
  t: number;
  phase: "playing" | "intermission";
  /** seconds left in current phase */
  timeLeft: number;
  players: PlayerSnapshot[];
  props: PropSnapshot[];
  grenades: GrenadeSnapshot[];
  /** MAP_PICKUPS indices currently unavailable (taken / respawning) */
  pickupsTaken: number[];
  /** MAP_PROPS indices currently destroyed */
  propsGone: number[];
}

export interface KillEvent {
  killer: string;
  victim: string;
  weapon: number;
  /** victim position + killing impulse direction (ragdoll FX) */
  x: number;
  y: number;
  z: number;
  ix: number;
  iy: number;
  iz: number;
}

export interface ShotEvent {
  shooter: string;
  from: Vec3;
  /** one end point per pellet */
  to: Vec3[];
  weapon: number;
}

/** Grenade detonation (FX + audio hook). */
export interface ExplosionEvent {
  x: number;
  y: number;
  z: number;
}

/** A pickup was collected (chime/FX hook; authoritative state rides the snapshot). */
export interface PickupEvent {
  playerId: string;
  /** index into MAP_PICKUPS */
  i: number;
  kind: string;
}

/** A prop was destroyed (fragments FX hook). */
export interface PropBrokenEvent {
  /** index into MAP_PROPS */
  i: number;
  x: number;
  y: number;
  z: number;
  /** true = explosive barrel detonation */
  explosive: boolean;
}

/** Client -> server input batch. */
export interface InputMessage {
  cmds: InputCommand[];
  /** Server time (ms) the shooter was rendering remote players at; used for lag compensation. */
  rt: number;
}

export interface WelcomeMessage {
  id: string;
  color: number;
  serverTime: number;
}

// Client -> server messages
export const MSG_INPUT = "input";
// Server -> client messages
export const MSG_SNAPSHOT = "snap";
export const MSG_KILL = "kill";
export const MSG_SHOT = "shot";
export const MSG_HIT = "hit"; // you hit someone
export const MSG_DAMAGED = "dmg"; // you were damaged
export const MSG_WELCOME = "welcome"; //
export const MSG_EXPLOSION = "boom"; // grenade went off
export const MSG_PICKUP = "pickup"; // someone grabbed a pickup
export const MSG_PROP_BROKEN = "pbrk"; // a prop broke (fragments FX)
