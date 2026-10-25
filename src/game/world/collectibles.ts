/**
 * Sunstone pickups. Placed per deterministic 1400 px band: either a line
 * following the terrain, an arc bridging a chasm (hinting the jump line),
 * or — on kicker chunks — a ballistic trail along the ramp's launch arc.
 */

import { Rng } from "../core/rng";
import { params } from "../core/params";
import { difficultyAt } from "./biome";
import type { Kicker, Terrain } from "./chunks";

export const ORB_BAND = 1400;
export const ORB_RADIUS = 12;
export const ORB_COLLECT = 34;

export interface Orb {
  x: number;
  y: number;
  taken: boolean;
  phase: number;
}

export class OrbField {
  list: Orb[] = [];
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
    const b0 = Math.floor(minX / ORB_BAND);
    const b1 = Math.floor(maxX / ORB_BAND);
    for (let b = b0; b <= b1; b++) {
      if (this.doneBands.has(b)) continue;
      this.doneBands.add(b);
      this.generateBand(b);
    }
  }

  prune(centerX: number, keepBehind = 1200): void {
    const cutoff = centerX - keepBehind;
    if (this.list.length && this.list[0].x < cutoff - ORB_BAND * 2) {
      this.list = this.list.filter((o) => !o.taken && o.x > cutoff);
    }
  }

  private generateBand(band: number): void {
    if (!this.terrain) return;
    const rng = new Rng((this.seed ^ Math.imul(band + 13, 0xc2b2ae35)) >>> 0);
    if (band < 1) return;
    const bandX = band * ORB_BAND;

    // A kicker chunk offers its launch-arc trail instead of a ground line —
    // the orbs trace the intended jump, teaching the risk/reward line.
    const kickers = this.terrain.kickersInRange(bandX, bandX + ORB_BAND);
    if (kickers.length > 0 && rng.bool(0.8)) {
      this.trailFromKicker(kickers[0], rng);
      return;
    }

    if (!rng.bool(0.6)) return;
    const n = rng.int(4, 7);
    const spacing = rng.range(64, 84);
    const x0 = bandX + rng.range(160, ORB_BAND - 160 - n * spacing);
    if (this.terrain.gapAt(x0) || this.terrain.gapAt(x0 + n * spacing)) {
      // Skip lines that would cross a chasm at ground level — the arc
      // pattern handles gaps instead.
      const gap = this.findGap(x0 - 200, x0 + n * spacing + 200);
      if (!gap) return;
      this.arcOverGap(gap.x0, gap.x1, rng);
      return;
    }
    const hover = rng.range(60, 130);
    for (let i = 0; i < n; i++) {
      const x = x0 + i * spacing;
      this.list.push({
        x,
        y: this.terrain!.heightAt(x) - hover,
        taken: false,
        phase: rng.float() * Math.PI * 2,
      });
    }
  }

  /**
   * Orbs along the ballistic arc a rider launches off a kicker crest —
   * deterministic from the same seed as the terrain that made the ramp.
   */
  private trailFromKicker(k: Kicker, rng: Rng): void {
    const d = difficultyAt(k.x);
    const speed = 520 + 380 * d; // plausible crest speed
    const angle = -0.55 - 0.25 * rng.float(); // upward launch, y-down world
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const n = rng.int(5, 7);
    const t0 = 0.12;
    const tEnd = 0.62;
    for (let i = 0; i < n; i++) {
      const t = t0 + ((tEnd - t0) * i) / (n - 1);
      this.list.push({
        x: k.x + vx * t,
        y: k.crestY + vy * t + 0.5 * params.gravity * t * t,
        taken: false,
        phase: rng.float() * Math.PI * 2,
      });
    }
  }

  private findGap(minX: number, maxX: number) {
    if (!this.terrain) return null;
    const step = 60;
    for (let x = minX; x <= maxX; x += step) {
      const g = this.terrain.gapAt(x);
      if (g) return g;
    }
    return null;
  }

  private arcOverGap(x0: number, x1: number, rng: Rng): void {
    if (!this.terrain) return;
    const n = 6;
    const apex = rng.range(120, 210);
    const yStart = this.terrain.heightAt(x0) - 70;
    const yEnd = this.terrain.heightAt(x1) - 70;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = x0 + (x1 - x0) * t;
      const lift = Math.sin(t * Math.PI) * apex;
      this.list.push({
        x,
        y: Math.min(yStart, yEnd) - lift,
        taken: false,
        phase: rng.float() * Math.PI * 2,
      });
    }
  }

  inRange(minX: number, maxX: number): Orb[] {
    return this.list.filter((o) => !o.taken && o.x >= minX && o.x <= maxX);
  }
}
