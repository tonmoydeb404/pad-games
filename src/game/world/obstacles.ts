/**
 * Obstacles (rocks and cacti). Placed per deterministic 900 px band, never
 * near a chasm lip, density scaling with difficulty. Circle colliders —
 * hitting one ends the run.
 */

import { Rng, hash2 } from "../core/rng";
import { difficultyAt } from "./biome";
import type { Terrain } from "./chunks";

export const OBSTACLE_BAND = 900;

export interface Obstacle {
  kind: "rock" | "cactus";
  /** center */
  x: number;
  y: number;
  /** collider radius */
  r: number;
  seed: number;
}

function bandRng(seed: number, band: number): Rng {
  return new Rng((seed ^ Math.imul(band + 7, 0x85ebca6b)) >>> 0);
}

export class ObstacleField {
  list: Obstacle[] = [];
  private doneBands = new Set<number>();
  private seed = 0;
  private terrain: Terrain | null = null;

  regenerate(seed: number, terrain: Terrain): void {
    this.seed = seed;
    this.terrain = terrain;
    this.list = [];
    this.doneBands.clear();
  }

  ensure(minX: number, maxX: number): void {
    if (!this.terrain) return;
    const b0 = Math.floor(minX / OBSTACLE_BAND);
    const b1 = Math.floor(maxX / OBSTACLE_BAND);
    for (let b = b0; b <= b1; b++) {
      if (this.doneBands.has(b)) continue;
      this.doneBands.add(b);
      this.generateBand(b);
    }
  }

  prune(centerX: number, keepBehind = 1200): void {
    const cutoff = centerX - keepBehind;
    if (this.list.length && this.list[0].x < cutoff - OBSTACLE_BAND * 2) {
      this.list = this.list.filter((o) => o.x > cutoff);
    }
  }

  private generateBand(band: number): void {
    if (!this.terrain) return;
    const rng = bandRng(this.seed, band);
    const x0 = band * OBSTACLE_BAND;
    if (band < 6) return; // spawn safety (~150 m of clear sliding)
    // Rest valleys are breathers — no obstacles to dodge in them.
    if (this.terrain.featureAt(x0 + OBSTACLE_BAND / 2) === "rest") return;
    const d = difficultyAt(x0);
    if (d <= 0) return;
    // Expected obstacles per band ramps 0 → ~1.2
    const expected = 0.65 * d;
    let count = Math.floor(expected);
    if (rng.float() < expected - count) count++;
    if (rng.float() < 0.4) count = 0; // breathing room

    for (let k = 0; k < count; k++) {
      const x = x0 + rng.range(60, OBSTACLE_BAND - 60);
      // Never right at a chasm lip.
      if (this.nearGap(x, 170)) continue;
      const kind: Obstacle["kind"] = rng.bool(0.35) ? "cactus" : "rock";
      const gy = this.terrain!.heightAt(x);
      if (kind === "rock") {
        const r = rng.range(12, 20);
        this.list.push({ kind, x, y: gy - r * 0.45, r, seed: rng.int(0, 1 << 30) });
      } else {
        this.list.push({ kind, x, y: gy - 34, r: 15, seed: rng.int(0, 1 << 30) });
      }
    }
  }

  private nearGap(x: number, margin: number): boolean {
    if (!this.terrain) return false;
    for (let dx = -margin; dx <= margin; dx += 40) {
      if (this.terrain.gapAt(x + dx)) return true;
    }
    return false;
  }

  /** First obstacle overlapping a circle at (x, y) with radius r. */
  collide(x: number, y: number, r: number): Obstacle | null {
    for (const o of this.list) {
      if (Math.abs(o.x - x) > 200) continue;
      const dx = o.x - x;
      const dy = o.y - y;
      const rr = o.r + r;
      if (dx * dx + dy * dy < rr * rr) return o;
    }
    return null;
  }

  inRange(minX: number, maxX: number): Obstacle[] {
    return this.list.filter((o) => o.x >= minX && o.x <= maxX);
  }
}

/** Deterministic silhouette jitter for a rock, used by the renderer. */
export function rockShape(o: Obstacle): number[] {
  const pts: number[] = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const jag = 0.72 + hash2(o.seed, i) * 0.5;
    pts.push(o.x + Math.cos(a) * o.r * jag, o.y + Math.sin(a) * o.r * 0.8 * jag);
  }
  return pts;
}
