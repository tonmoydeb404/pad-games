import { GUNS, SWAP_SECONDS, type GunDef } from "./gun-defs";

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
  constructor(private readonly owned: (slot: number) => boolean = () => true) {}

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
    if (slot > 0 && !this.owned(slot)) return false; // you cannot draw what you do not carry
    this.selected = slot;
    this.reloadLeft = 0; // a swap cancels a reload in progress
    this.cooldown = slot > 0 ? SWAP_SECONDS : 0;
    return true;
  }

  /** Next / previous in the cycle fists → guns → fists. */
  cycle(dir: 1 | -1 = 1): void {
    const n = GUNS.length + 1;
    for (let i = 1; i <= n; i++) if (this.select((this.selected + dir * i + n * i) % n)) return;
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
