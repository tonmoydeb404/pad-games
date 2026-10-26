/**
 * Health, armor and stamina rules. Pure state + functions: animals, falls, trains and
 * future hazards all go through applyDamage; consumables go through heal.
 * Every rate is per second, so results do not depend on the frame rate.
 */

export type DamageType = "melee" | "animal" | "train" | "fall" | "hazard";

export interface VitalsConfig {
  maxHealth: number;
  maxArmor: number;
  maxStamina: number;
  /** share of eligible damage soaked up by armor while any is left */
  armorAbsorb: number;
  /** damage types armor does not help against */
  armorBypass: readonly DamageType[];
  /** seconds without damage before health regenerates, and its rate */
  healthRegenDelay: number;
  healthRegen: number;
  staminaDrain: number;
  staminaRegen: number;
  /** pause before stamina regenerates after it was used */
  staminaRest: number;
  /** a winded player can sprint again once stamina reaches this */
  windedRecover: number;
}

export const DEFAULT_VITALS: VitalsConfig = {
  maxHealth: 100,
  maxArmor: 100,
  maxStamina: 100,
  armorAbsorb: 0.6,
  armorBypass: ["fall"],
  healthRegenDelay: 7,
  healthRegen: 3,
  staminaDrain: 20,
  staminaRegen: 16,
  staminaRest: 0.9,
  windedRecover: 25,
};

export interface Vitals {
  health: number;
  armor: number;
  stamina: number;
  /** out of breath: cannot sprint until stamina recovers */
  winded: boolean;
  /** true from the hit that kills until revive(); death fires once */
  dead: boolean;
  healthRest: number;
  staminaRestLeft: number;
  readonly cfg: VitalsConfig;
}

export interface DamageResult {
  taken: number;
  absorbed: number;
  /** true only on the hit that kills */
  died: boolean;
}

export function createVitals(cfg: VitalsConfig = DEFAULT_VITALS): Vitals {
  return { health: cfg.maxHealth, armor: 0, stamina: cfg.maxStamina, winded: false, dead: false, healthRest: 0, staminaRestLeft: 0, cfg };
}

export function applyDamage(v: Vitals, amount: number, type: DamageType = "melee"): DamageResult {
  if (v.dead || !(amount > 0)) return { taken: 0, absorbed: 0, died: false };
  let absorbed = 0;
  if (v.armor > 0 && !v.cfg.armorBypass.includes(type)) {
    absorbed = Math.min(v.armor, amount * v.cfg.armorAbsorb);
    v.armor -= absorbed;
  }
  const taken = Math.min(v.health, amount - absorbed);
  v.health -= taken;
  v.healthRest = v.cfg.healthRegenDelay;
  const died = v.health <= 0;
  if (died) v.dead = true;
  return { taken, absorbed, died };
}

/** Restores health up to the maximum. Returns how much was actually restored. */
export function heal(v: Vitals, amount: number): number {
  if (v.dead || !(amount > 0)) return 0;
  const n = Math.min(amount, v.cfg.maxHealth - v.health);
  v.health += n;
  return n;
}

export function addArmor(v: Vitals, amount: number): number {
  const n = Math.max(0, Math.min(amount, v.cfg.maxArmor - v.armor));
  v.armor += n;
  return n;
}

export function restoreStamina(v: Vitals, amount: number): void {
  v.stamina = Math.min(v.cfg.maxStamina, v.stamina + Math.max(0, amount));
  if (v.winded && v.stamina >= v.cfg.windedRecover) v.winded = false;
}

/** One-off stamina cost (roll, melee). Spends what it can; returns true only if the full cost was available. */
export function spendStamina(v: Vitals, cost: number, rest = 0.7): boolean {
  const had = v.stamina >= cost;
  v.stamina = Math.max(0, v.stamina - cost);
  v.staminaRestLeft = Math.max(v.staminaRestLeft, rest);
  return had; // only sprinting leaves you winded; a spent swing just empties the bar
}

/**
 * Advance timers and regeneration by `dt` seconds. `sprinting` drains stamina; `still` regenerates
 * it faster. Returns true on the tick the player becomes winded.
 */
export function tickVitals(v: Vitals, dt: number, opts: { sprinting: boolean; still: boolean }): boolean {
  let becameWinded = false;
  if (!v.dead) {
    v.healthRest = Math.max(0, v.healthRest - dt);
    if (v.healthRest <= 0 && v.health < v.cfg.maxHealth) v.health = Math.min(v.cfg.maxHealth, v.health + v.cfg.healthRegen * dt);
  }
  if (opts.sprinting) {
    v.stamina = Math.max(0, v.stamina - v.cfg.staminaDrain * dt);
    v.staminaRestLeft = v.cfg.staminaRest;
    if (v.stamina <= 0 && !v.winded) {
      v.winded = true;
      becameWinded = true;
    }
  } else {
    v.staminaRestLeft = Math.max(0, v.staminaRestLeft - dt);
    if (v.staminaRestLeft <= 0) restoreStamina(v, v.cfg.staminaRegen * (opts.still ? 1.5 : 1) * dt);
  }
  return becameWinded;
}

/** Back on your feet with a fraction of max health. */
export function revive(v: Vitals, healthFraction: number): void {
  v.dead = false;
  v.health = Math.max(1, Math.round(v.cfg.maxHealth * healthFraction));
  v.stamina = v.cfg.maxStamina;
  v.winded = false;
  v.healthRest = 4;
  v.staminaRestLeft = 0;
}
