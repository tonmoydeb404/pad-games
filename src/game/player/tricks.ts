/**
 * Tricks, combos and score — banked-chain model.
 *
 * Trick points accumulate as an *unbanked chain* while it's alive; a clean
 * landing banks them into the score, a rough landing loses them, and a crash
 * throws them away. Each trick in the chain bumps the multiplier. Sunstones
 * score directly (they're pickups, not tricks). Grinds tick meters into a
 * session that pays out once when it ends.
 */

import type { TrickLog } from "../core/types";

export interface TrickToast {
  name: string;
  points: number;
}

const GRAB_TICK = 0.25;
const GRAB_POINTS_PER_TICK = 15;
const BIG_AIR_TIME = 2.2;
const BIG_AIR_POINTS = 250;
/** Landing bonus is only paid from a genuinely high jump. */
const LANDING_BONUS_AIR_TIME = 1.1;
const CLEAN_LAND_POINTS = 50;
const SPIN_POINTS = 150;
const PICKUP_POINTS = 75;
const MAX_MULTIPLIER = 8;
/** Chain points paid per meter of grind. */
const GRIND_POINTS_PER_METER = 10;

export class TrickTracker {
  score = 0;
  multiplier = 1;
  maxCombo = 1;
  spins = 0;
  cleanLandings = 0;
  roughLandings = 0;
  tricks: TrickLog[] = [];

  /** Unbanked trick points — banked on a clean landing, lost on a rough one. */
  chain = 0;

  private grabTimer = 0;
  private grabbing = false;

  reset(): void {
    this.score = 0;
    this.multiplier = 1;
    this.maxCombo = 1;
    this.spins = 0;
    this.cleanLandings = 0;
    this.roughLandings = 0;
    this.tricks = [];
    this.chain = 0;
    this.grabTimer = 0;
    this.grabbing = false;
  }

  /** Called on landing. Returns toasts to show. */
  onLanding(
    quality: "clean" | "rough",
    spins: number,
    airTime: number,
    grabPoints = 0,
  ): TrickToast[] {
    const toasts: TrickToast[] = [];

    if (grabPoints > 0) {
      const name = "Sand Grab";
      this.tricks.push({ name, points: grabPoints });
      toasts.push({ name, points: grabPoints });
      this.chain += grabPoints * this.multiplier;
      this.bumpCombo();
    }

    if (spins > 0) {
      this.spins += spins;
      const points = Math.round(SPIN_POINTS * spins);
      const name = `${spins * 360}° Spin`;
      this.tricks.push({ name, points });
      toasts.push({ name, points });
      this.chain += points * this.multiplier;
      this.bumpCombo();
    }

    if (airTime >= BIG_AIR_TIME) {
      const points = BIG_AIR_POINTS;
      this.tricks.push({ name: "Big Air", points });
      toasts.push({ name: "Big Air", points });
      this.chain += points * this.multiplier;
      this.bumpCombo();
    }

    if (quality === "clean") {
      this.cleanLandings++;
      // The bonus (and its toast) is only for sticking a landing from real
      // height; low clean landings still keep speed and protect the combo.
      if (airTime >= LANDING_BONUS_AIR_TIME) {
        this.chain += CLEAN_LAND_POINTS;
        toasts.push({ name: "Clean Landing", points: CLEAN_LAND_POINTS });
      }
      // Bank everything the chain earned in the air.
      const banked = Math.round(this.chain);
      if (banked > 0) {
        this.score += banked;
        toasts.push({ name: "Banked", points: banked });
      }
      this.chain = 0;
    } else {
      this.roughLandings++;
      const lost = Math.round(this.chain);
      this.chain = 0;
      this.multiplier = 1;
      if (lost > 0) {
        toasts.push({ name: "Chain Lost", points: 0 });
      }
    }

    return toasts;
  }

  /** Crash: the unbanked chain goes with it. */
  loseChain(): void {
    this.chain = 0;
  }

  private bumpCombo(): void {
    this.multiplier = Math.min(MAX_MULTIPLIER, this.multiplier + 1);
    this.maxCombo = Math.max(this.maxCombo, this.multiplier);
  }

  /** Grab: hold jump mid-air. Returns points earned this step (0 most steps). */
  updateGrab(dt: number, grabHeld: boolean): number {
    if (!grabHeld) {
      this.grabbing = false;
      this.grabTimer = 0;
      return 0;
    }
    this.grabbing = true;
    this.grabTimer += dt;
    if (this.grabTimer >= GRAB_TICK) {
      this.grabTimer -= GRAB_TICK;
      const points = Math.round(GRAB_POINTS_PER_TICK * this.multiplier);
      this.chain += points;
      return points;
    }
    return 0;
  }

  get isGrabbing(): boolean {
    return this.grabbing;
  }

  /** Sunstones pay directly — they're coins, not tricks. */
  addPickup(): TrickToast {
    const points = Math.round(PICKUP_POINTS * this.multiplier);
    this.score += points;
    return { name: "Sunstone", points };
  }

  /** Raw distance points (no multiplier). */
  addDistance(meters: number): void {
    this.score += Math.max(0, meters);
  }

  /** End a grind with its ridden meters: chain the payout once, bump combo. */
  endGrindSession(meters: number): TrickToast | null {
    const points = Math.round(meters * GRIND_POINTS_PER_METER);
    if (points <= 0) return null;
    const name = meters >= 100 ? "Long Grind" : "Grind";
    this.tricks.push({ name, points });
    this.chain += points * this.multiplier;
    this.bumpCombo();
    return { name, points };
  }

  addBoost(body: { boost: number }, amount: number): void {
    body.boost = Math.min(1, body.boost + amount);
  }
}
