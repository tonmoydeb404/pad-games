import { describe, expect, it } from "vitest";
import {
  CHUNK_POINTS,
  CHUNK_WIDTH,
  FeaturePlanner,
  Terrain,
} from "./chunks";

/** Two worlds from the same seed must be pixel-identical. */
describe("world generation determinism", () => {  it("same seed → identical terrain, gaps, rough, kickers and features", () => {
    const a = new Terrain(12345);
    const b = new Terrain(12345);
    a.ensure(0, 40 * CHUNK_WIDTH);
    b.ensure(0, 40 * CHUNK_WIDTH);
    for (let k = 0; k < 500; k++) {
      const x = k * 5280; // spread across the ensured range
      expect(a.heightAt(x)).toBe(b.heightAt(x));
      expect(a.slopeAt(x)).toBe(b.slopeAt(x));
    }
    expect(a.gapsInRange(0, 40 * CHUNK_WIDTH)).toEqual(
      b.gapsInRange(0, 40 * CHUNK_WIDTH),
    );
    expect(a.roughInRange(0, 40 * CHUNK_WIDTH)).toEqual(
      b.roughInRange(0, 40 * CHUNK_WIDTH),
    );
    expect(a.kickersInRange(0, 40 * CHUNK_WIDTH)).toEqual(
      b.kickersInRange(0, 40 * CHUNK_WIDTH),
    );
    for (let i = 0; i < 40; i++) {
      expect(a.chunkAt(i * CHUNK_WIDTH + 1)?.feature).toBe(
        b.chunkAt(i * CHUNK_WIDTH + 1)?.feature,
      );
    }
  });

  it("different seeds → different terrain", () => {
    const a = new Terrain(1);
    const b = new Terrain(2);
    a.ensure(0, 4 * CHUNK_WIDTH);
    b.ensure(0, 4 * CHUNK_WIDTH);
    const sample = 3 * CHUNK_WIDTH + 137;
    expect(a.heightAt(sample)).not.toBe(b.heightAt(sample));
  });

  it("chunk samples stay finite and slope-clamped", () => {
    const t = new Terrain(777);
    t.ensure(0, 8 * CHUNK_WIDTH);
    for (let i = 0; i < 8; i++) {
      const c = t.chunkAt(i * CHUNK_WIDTH + 1)!;
      expect(c.heights.length).toBe(CHUNK_POINTS);
      for (let k = 1; k < CHUNK_POINTS; k++) {
        const dy = c.heights[k] - c.heights[k - 1];
        expect(dy).toBeGreaterThanOrEqual(-0.35 * c.dx - 1e-3);
        expect(dy).toBeLessThanOrEqual(0.85 * c.dx + 1e-3);
      }
    }
  });
});

/** The planner's pacing promises, probed across seeds. */
describe("feature planner pacing", () => {
  const SEEDS = [1, 42, 999, 20260101, 87654321];

  it("never more than PITY_CHUNKS gentle chunks between set-pieces", () => {
    for (const seed of SEEDS) {
      const planner = new FeaturePlanner(seed);
      let run = 0;
      for (let i = 2; i <= 80; i++) {
        const kind = planner.kindAt(i);
        if (kind === "plain" || kind === "rest") {
          run++;
          expect(run).toBeLessThanOrEqual(5);
        } else {
          run = 0;
        }
      }
    }
  });

  it("every set-piece is followed by a gentle chunk (breathing room)", () => {
    for (const seed of SEEDS) {
      const planner = new FeaturePlanner(seed);
      let prev: string | null = null;
      for (let i = 2; i <= 80; i++) {
        const kind = planner.kindAt(i);
        const prevFeature =
          prev !== null && prev !== "plain" && prev !== "rest";
        if (prevFeature) {
          expect(kind === "plain" || kind === "rest").toBe(true);
        }
        prev = kind;
      }
    }
  });

  it("set-pieces stay the minority — the run is mostly smooth carving", () => {
    for (const seed of SEEDS) {
      const planner = new FeaturePlanner(seed);
      let features = 0;
      let total = 0;
      for (let i = 2; i <= 80; i++) {
        total++;
        const kind = planner.kindAt(i);
        if (kind !== "plain" && kind !== "rest") features++;
      }
      expect(features / total).toBeLessThan(0.55);
    }
  });

  it("never places gap-heavy chunks back-to-back", () => {
    for (const seed of SEEDS) {
      const planner = new FeaturePlanner(seed);
      let prev: string | null = null;
      for (let i = 2; i <= 80; i++) {
        const kind = planner.kindAt(i);
        if (prev === "gap" || prev === "gapChain") {
          expect(kind === "gap" || kind === "gapChain").toBe(false);
        }
        prev = kind;
      }
    }
  });

  it("features depend only on (seed, index), not call order", () => {
    for (const seed of SEEDS) {
      const jumped = new FeaturePlanner(seed);
      const walked = new FeaturePlanner(seed);
      const late = jumped.kindAt(50);
      // Asking directly for a late chunk must match the incremental walk.
      for (let i = 2; i <= 50; i++) walked.kindAt(i);
      expect(late).toBe(walked.kindAt(50));
    }
  });
});

/**
 * The carve line must read as a few long, smooth curves — never chop.
 * On plain chunks, the slope may only change gradually between adjacent
 * samples. (Set-piece chunks — kickers, rough ripples, gap lips — are
 * intentional geometry and excluded here.)
 */
describe("terrain smoothness", () => {
  const STEP = 12;

  function slopeOver(t: Terrain, x: number): number {
    return (t.heightAt(x + 6) - t.heightAt(x - 6)) / 12;
  }

  it("plain chunks are smooth and curvy: slope drifts slowly, never jitters", () => {
    for (const seed of [7, 4242, 987654]) {
      const t = new Terrain(seed);
      const x0 = 20 * CHUNK_WIDTH;
      const x1 = 45 * CHUNK_WIDTH;
      t.ensure(x0 - 500, x1 + 500);
      let checked = 0;
      let prev = slopeOver(t, x0);
      for (let x = x0 + STEP; x < x1; x += STEP) {
        // Skip windows that reach into a set-piece chunk — kickers, rough
        // ripples and gap lips are intentional geometry.
        const plain =
          t.chunkAt(x - 12)?.feature === "plain" &&
          t.chunkAt(x + 12)?.feature === "plain";
        if (!plain) {
          prev = slopeOver(t, x);
          continue;
        }
        const s = slopeOver(t, x);
        expect(Math.abs(s - prev)).toBeLessThan(0.05);
        prev = s;
        checked++;
      }
      expect(checked).toBeGreaterThan(500);
    }
  });

  it("rolling slopes stay carveable — no wall-like ascents on plain chunks", () => {
    for (const seed of [7, 4242]) {
      const t = new Terrain(seed);
      t.ensure(20 * CHUNK_WIDTH, 45 * CHUNK_WIDTH);
      let steepest = 0;
      for (let x = 20 * CHUNK_WIDTH; x < 45 * CHUNK_WIDTH; x += STEP) {
        if (t.chunkAt(x + 1)?.feature !== "plain") continue;
        steepest = Math.max(steepest, Math.abs(slopeOver(t, x)));
      }
      // gentle rolling: even the steepest plain-ground pitch stays mellow
      expect(steepest).toBeLessThan(0.6);
    }
  });
});
