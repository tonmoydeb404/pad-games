export interface WeaponDef {
  id: number;
  name: string;
  /** blaster-kit model id (public/assets/arena/blasters/<modelId>.glb) */
  modelId: string;
  damage: number;
  pellets: number;
  /** cone half-angle in radians per pellet */
  spread: number;
  /** spread while scoped (sniper) */
  scopedSpread?: number;
  /** seconds between shots */
  cooldown: number;
  magSize: number;
  reloadSeconds: number;
  range: number;
  /** damage multiplier at max range (linear falloff) */
  falloff: number;
  /** true = right-click scope (sniper) */
  scope?: boolean;
  /** true = unlimited reserve ammo (sidearm) */
  infinite?: boolean;
  /** pickup crates that grant this weapon reference it by id */
  pickup?: boolean;
}

export const WEAPONS: WeaponDef[] = [
  {
    id: 0,
    name: "Sidearm",
    modelId: "blaster-b",
    damage: 16,
    pellets: 1,
    spread: 0.01,
    cooldown: 0.26,
    magSize: 12,
    reloadSeconds: 1.0,
    range: 60,
    falloff: 0.7,
    infinite: true,
  },
  {
    id: 1,
    name: "Ripper",
    modelId: "blaster-h",
    damage: 9,
    pellets: 1,
    spread: 0.045,
    cooldown: 0.075,
    magSize: 30,
    reloadSeconds: 1.7,
    range: 40,
    falloff: 0.5,
  },
  {
    id: 2,
    name: "Longshot",
    modelId: "blaster-e",
    damage: 22,
    pellets: 1,
    spread: 0.012,
    cooldown: 0.13,
    magSize: 24,
    reloadSeconds: 1.9,
    range: 85,
    falloff: 0.65,
    pickup: true,
  },
  {
    id: 3,
    name: "Scatter",
    modelId: "blaster-l",
    damage: 10,
    pellets: 8,
    spread: 0.06,
    cooldown: 0.85,
    magSize: 6,
    reloadSeconds: 2.4,
    range: 22,
    falloff: 0.25,
    pickup: true,
  },
  {
    id: 4,
    name: "Widowmaker",
    modelId: "blaster-q",
    damage: 85,
    pellets: 1,
    spread: 0.03,
    scopedSpread: 0.001,
    cooldown: 1.4,
    magSize: 5,
    reloadSeconds: 2.6,
    range: 160,
    falloff: 1,
    scope: true,
    pickup: true,
  },
];

/** Weapons every player spawns with (pistol + SMG). */
export const STARTING_WEAPONS = [0, 1];
/** Reserve mags granted when a weapon crate is picked up. */
export const WEAPON_PICKUP_MAGS = 2;
/** Mags granted by an ammo clip pickup. */
export const AMMO_PICKUP_MAGS = 2;
