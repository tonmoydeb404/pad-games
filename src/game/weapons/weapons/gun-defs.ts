/**
 * On-foot guns — Kenney "Blaster Kit" (CC0) toy blasters, tuned for hunting
 * the jungle's wildlife. Stat shape follows the Arena game's weapon table
 * (packages/arena-shared/src/weapons.ts); damage is rescaled to the animals'
 * hit points (fox 25 … T-Rex 450).
 *
 * Slot 0 is bare fists (the melee moves); slots 1–5 are the guns. `Armory`
 * is the pure state machine — selection, magazines, reserve, cooldown and
 * reload timing — with no rendering, so it is unit-tested on its own.
 */

export interface GunDef {
  /** Number-row key / slot (1–5). */
  slot: number;
  name: string;
  /** Blaster Kit model under /assets/jeep/blasters/<model>.glb */
  model: string;
  /** Damage per pellet at point-blank. */
  damage: number;
  pellets: number;
  /** Cone half-angle (rad) per pellet, aiming down the sights. */
  spread: number;
  /** Multiplier on `spread` when shooting from the hip. */
  hipSpread: number;
  /** Seconds between shots. */
  cooldown: number;
  /** Hold the trigger to keep firing. */
  auto: boolean;
  magSize: number;
  /** Spare magazines carried (the sidearm is unlimited). */
  reserveMags: number;
  infinite?: boolean;
  reloadSeconds: number;
  range: number;
  /** Damage multiplier at max range (linear falloff). */
  falloff: number;
  /** Knock-back (m) on a light animal. */
  knock: number;
  /** Camera kick per shot (rad). */
  recoil: number;
  /** Right-mouse zoom: field of view while aiming. */
  zoomFov: number;
  /** Full-screen scope overlay while aiming. */
  scope?: boolean;
  /** Voice for the shot sound (see JeepAudio.gunshot). */
  sound: "pistol" | "smg" | "rifle" | "shotgun" | "sniper";
}

export const GUNS: GunDef[] = [
  {
    slot: 1, name: "Sidearm", model: "blaster-b",
    damage: 16, pellets: 1, spread: 0.008, hipSpread: 3, cooldown: 0.26, auto: false,
    magSize: 12, reserveMags: 4, infinite: true, reloadSeconds: 1.0, range: 70, falloff: 0.7,
    knock: 0.6, recoil: 0.012, zoomFov: 46, sound: "pistol",
  },
  {
    slot: 2, name: "Ripper", model: "blaster-h",
    damage: 9, pellets: 1, spread: 0.02, hipSpread: 2.6, cooldown: 0.085, auto: true,
    magSize: 30, reserveMags: 4, reloadSeconds: 1.7, range: 50, falloff: 0.5,
    knock: 0.3, recoil: 0.008, zoomFov: 48, sound: "smg",
  },
  {
    slot: 3, name: "Longshot", model: "blaster-e",
    damage: 24, pellets: 1, spread: 0.005, hipSpread: 3.5, cooldown: 0.14, auto: true,
    magSize: 24, reserveMags: 3, reloadSeconds: 1.9, range: 110, falloff: 0.65,
    knock: 0.9, recoil: 0.014, zoomFov: 40, sound: "rifle",
  },
  {
    slot: 4, name: "Scatter", model: "blaster-l",
    damage: 11, pellets: 8, spread: 0.05, hipSpread: 1.3, cooldown: 0.85, auto: false,
    magSize: 6, reserveMags: 3, reloadSeconds: 2.4, range: 28, falloff: 0.25,
    knock: 1.6, recoil: 0.04, zoomFov: 50, sound: "shotgun",
  },
  {
    slot: 5, name: "Widowmaker", model: "blaster-q",
    damage: 90, pellets: 1, spread: 0.0008, hipSpread: 14, cooldown: 1.3, auto: false,
    magSize: 5, reserveMags: 3, reloadSeconds: 2.6, range: 220, falloff: 1,
    knock: 2.6, recoil: 0.05, zoomFov: 16, scope: true, sound: "sniper",
  },
];

/** Time to bring a different weapon up (s). */
export const SWAP_SECONDS = 0.35;


/** Damage of one pellet at `dist` metres: linear falloff to `falloff` at max range. */
export function damageAt(g: GunDef, dist: number): number {
  const t = Math.min(1, Math.max(0, dist / g.range));
  return g.damage * (1 - (1 - g.falloff) * t);
}

