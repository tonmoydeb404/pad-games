/** Fixed simulation step used by both client prediction and the server. */
export const SIM_DT = 1 / 60;
/** Server snapshot broadcast rate. */
export const SNAPSHOT_RATE = 20;
export const MAX_PLAYERS = 16;
export const ROOM_NAME = "arena";

export const PLAYER_RADIUS = 0.4;
export const PLAYER_HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;
export const MOVE_SPEED = 7;
export const JUMP_SPEED = 7.5;
export const GRAVITY = 22;
export const MAX_HEALTH = 100;
export const PITCH_LIMIT = Math.PI / 2 - 0.01;
/** Tallest ledge the mover climbs without jumping (stair steps). */
export const STEP_HEIGHT = 0.55;

export const RESPAWN_SECONDS = 3;
export const SPAWN_PROTECTION_SECONDS = 2;
export const KILL_LIMIT = 20;
export const ROUND_SECONDS = 300;
export const INTERMISSION_SECONDS = 8;
export const MAX_COMMANDS_PER_MESSAGE = 8;
/** Max lag-compensation rewind. */
export const MAX_REWIND_MS = 200;

/** Player armour: soaks damage before health, no regeneration. */
export const MAX_ARMOR = 50;

/** Grenades (see physics/grenades.ts for the ballistic parameters). */
export const GRENADE_START = 2;
export const GRENADE_MAX = 3;
export const GRENADE_FUSE = 2.2;
export const GRENADE_SPEED = 16;
export const GRENADE_RADIUS = 7;
export const GRENADE_DAMAGE = 85;
export const GRENADE_PICKUP_GIVE = 1;

/** Prop respawn after being destroyed (explosive barrels, breakable targets). */
export const PROP_RESPAWN_SECONDS = 15;
/** Explosive barrel health (bullet damage that sets it off). */
export const BARREL_HEALTH = 30;
/** Breakable target health. */
export const TARGET_HEALTH = 60;

/** Player rigs + palette tints (multiplies the kit's shared colormap). */
export interface SkinDef {
  name: string;
  /** multiplier tint applied to the character texture */
  tint: number;
  /** true = the orc rig */
  orc: boolean;
}

export const SKINS: SkinDef[] = [
  { name: "Raider", tint: 0xffffff, orc: false },
  { name: "Squire", tint: 0xb9c6d8, orc: false },
  { name: "Ember", tint: 0xffb37f, orc: false },
  { name: "Verdant", tint: 0xb8e6a3, orc: false },
  { name: "Warlord", tint: 0xffc48f, orc: true },
  { name: "Wraith", tint: 0x9fb8c9, orc: true },
];

/** Cache-busting version baked into asset URLs (bump when the packs change). */
export const ASSET_VERSION = "v1";
