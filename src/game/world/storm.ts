/**
 * The Wall: a sandstorm front that chases the rider down the run.
 *
 * Director model: it activates some distance into the run, then rubber-bands —
 * its speed steps up through difficulty tiers as the run gets longer, it
 * falls back while the rider is airborne (a good air buys breathing room),
 * and it surges when far enough behind to be off-screen. If it reaches the
 * rider, the run ends.
 */

import { params } from "../core/params";

export interface StormState {
  active: boolean;
  caught: boolean;
  escapedTier: boolean;
}

export class StormWall {
  active = false;
  caught = false;
  x = 0;
  tier = 0;
  /** Distance (m) the run had reached when the wall was activated. */
  private sinceM = 0;
  /** Set for one update when a new tier kicks in (for a warning toast). */
  tierUp = false;

  reset(): void {
    this.active = false;
    this.caught = false;
    this.tierUp = false;
    this.x = 0;
    this.tier = 0;
    this.sinceM = 0;
  }

  /**
   * Advance the wall. `playerX`/`distanceM` are the rider's position and run
   * distance; `airborne` lets a good air buy breathing room.
   */
  update(dt: number, playerX: number, distanceM: number, airborne: boolean): void {
    this.tierUp = false;
    if (this.caught) return;

    if (!this.active) {
      if (distanceM >= params.stormStartM) {
        this.active = true;
        this.sinceM = distanceM;
        this.tier = 0;
        this.x = playerX - 2200;
      }
      return;
    }

    // Tier follows elapsed run distance since the wall spawned.
    const wanted = Math.min(
      params.stormTierSpeeds.length - 1,
      Math.floor((distanceM - this.sinceM) / 350),
    );
    if (wanted > this.tier) {
      this.tier = wanted;
      this.tierUp = true;
    }

    let speed = params.stormTierSpeeds[this.tier];
    const behind = playerX - this.x;
    // Surge when far behind (off-screen), hold back while the rider flies.
    if (behind > 1200) speed *= params.stormCatchupMult;
    if (airborne && behind < params.stormHoldbackPx + 220) speed *= 0.45;

    this.x += speed * dt;
    if (this.x >= playerX - 10) {
      this.x = playerX - 10;
      this.caught = true;
    }
  }

  /** Headroom in front of the wall (px) — negative means caught. */
  gapPx(playerX: number): number {
    return playerX - this.x;
  }

  /** 0..1 closeness for rendering and audio intensity. */
  proximity(playerX: number): number {
    if (!this.active) return 0;
    return Math.max(0, Math.min(1, 1 - this.gapPx(playerX) / 1400));
  }
}
