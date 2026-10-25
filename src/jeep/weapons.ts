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

interface Slot {
  mag: number;
  reserve: number;
}

export class Armory {
  /** 0 = fists, otherwise the GunDef.slot. */
  selected = 0;
  /** Seconds until the next shot is allowed (also covers the swap delay). */
  cooldown = 0;
  /** > 0 while reloading: seconds left. */
  reloadLeft = 0;
  private slots: Slot[] = GUNS.map((g) => ({ mag: g.magSize, reserve: g.reserveMags * g.magSize }));

  /** The equipped gun, or null with fists out. */
  get gun(): GunDef | null {
    return this.selected > 0 ? GUNS[this.selected - 1] : null;
  }

  private get state(): Slot | null {
    return this.selected > 0 ? this.slots[this.selected - 1] : null;
  }

  get mag(): number {
    return this.state?.mag ?? 0;
  }

  /** Spare rounds (Infinity for the sidearm). */
  get reserve(): number {
    const g = this.gun;
    if (!g) return 0;
    return g.infinite ? Infinity : this.state!.reserve;
  }

  get reloading(): boolean {
    return this.reloadLeft > 0;
  }

  /** Switch to `slot` (0 = fists). Returns true if the selection changed. */
  select(slot: number): boolean {
    if (slot < 0 || slot > GUNS.length || slot === this.selected) return false;
    this.selected = slot;
    this.reloadLeft = 0; // a swap cancels a reload in progress
    this.cooldown = slot > 0 ? SWAP_SECONDS : 0;
    return true;
  }

  /** Next / previous in the cycle fists → guns → fists. */
  cycle(dir: 1 | -1 = 1): void {
    const n = GUNS.length + 1;
    this.select((this.selected + dir + n) % n);
  }

  update(dt: number): void {
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloadLeft > 0) {
      this.reloadLeft -= dt;
      if (this.reloadLeft <= 0) this.finishReload();
    }
  }

  canFire(): boolean {
    return !!this.gun && this.cooldown <= 0 && !this.reloading && this.mag > 0;
  }

  /**
   * Pull the trigger. Returns true when a shot went off (the caller spawns
   * the pellets). An empty magazine starts the reload by itself.
   */
  fire(): boolean {
    const g = this.gun;
    const s = this.state;
    if (!g || !s || this.reloading || this.cooldown > 0) return false;
    if (s.mag <= 0) {
      this.reload();
      return false;
    }
    s.mag--;
    this.cooldown = g.cooldown;
    if (s.mag === 0) this.reload();
    return true;
  }

  /** Start a reload if one is useful. Returns true when it started. */
  reload(): boolean {
    const g = this.gun;
    const s = this.state;
    if (!g || !s || this.reloading || s.mag >= g.magSize) return false;
    if (!g.infinite && s.reserve <= 0) return false;
    this.reloadLeft = g.reloadSeconds;
    return true;
  }

  private finishReload(): void {
    const g = this.gun;
    const s = this.state;
    if (!g || !s) return;
    const need = g.magSize - s.mag;
    const take = g.infinite ? need : Math.min(need, s.reserve);
    s.mag += take;
    if (!g.infinite) s.reserve -= take;
    this.reloadLeft = 0;
  }

  /** Total rounds left for the equipped gun (mag + reserve). */
  get dry(): boolean {
    return !!this.gun && this.mag <= 0 && this.reserve <= 0;
  }

  /** Refill every magazine and the reserve. Returns true if anything was actually topped up. */
  resupply(): boolean {
    let changed = false;
    GUNS.forEach((g, i) => {
      const full = g.reserveMags * g.magSize;
      if (this.slots[i].mag !== g.magSize || this.slots[i].reserve !== full) changed = true;
      this.slots[i].mag = g.magSize;
      this.slots[i].reserve = full;
    });
    this.reloadLeft = 0;
    return changed;
  }
}

/** Damage of one pellet at `dist` metres: linear falloff to `falloff` at max range. */
export function damageAt(g: GunDef, dist: number): number {
  const t = Math.min(1, Math.max(0, dist / g.range));
  return g.damage * (1 - (1 - g.falloff) * t);
}
