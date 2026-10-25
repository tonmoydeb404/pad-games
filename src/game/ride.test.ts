import { describe, expect, it } from "vitest";
import type { ActionSnapshot } from "./input/actions";
import { params } from "./core/params";
import { PlayerBody } from "./player/body";
import { CHUNK_WIDTH, Terrain } from "./world/chunks";

const STEP = 1 / 60;

function neutralInput(): ActionSnapshot {
  return {
    jumpHeld: false,
    jumpPressed: false,
    jumpReleased: false,
    boostHeld: false,
    downHeld: false,
    pausePressed: false,
    confirmPressed: false,
    backPressed: false,
    navPressed: { up: false, down: false, left: false, right: false },
    spinAxis: 0,
    anyPressed: true,
  };
}

/**
 * Scripted 60 s ride: periodic charged jumps, spins in the air, air boost.
 * Crashes are rescued (attract-mode style) so the sim keeps going. This is
 * the smoke net for the feature terrain: kickers, gap chains, rest valleys.
 */
function ride(seed: number, seconds: number): { x: number; maxY: number; maxSpeed: number } {
  const terrain = new Terrain(seed);
  const body = new PlayerBody();
  terrain.ensure(-500, 4000);
  body.reset(terrain);

  let x = 0;
  let maxY = 0;
  let maxSpeed = 0;
  for (let i = 0; i < seconds * 60; i++) {
    terrain.ensure(body.s.x - 500, body.s.x + 2500);
    const input = neutralInput();
    const phase = i % 210;
    if (body.s.grounded && phase < 20) input.jumpHeld = true; // charge
    if (phase === 20) input.jumpReleased = true; // launch
    if (!body.s.grounded) {
      input.spinAxis = phase % 210 < 110 ? 0.8 : 0;
      input.boostHeld = body.s.airTime > 0.15 && body.s.airTime < 1.2;
    }
    body.beginStep();
    const ev = body.update(STEP, input, terrain);
    if (ev.crashed) body.rescue(terrain);

    const s = body.s;
    expect(Number.isFinite(s.x)).toBe(true);
    expect(Number.isFinite(s.y)).toBe(true);
    expect(Number.isFinite(s.vx)).toBe(true);
    expect(Number.isFinite(s.vy)).toBe(true);
    x = s.x;
    maxY = Math.min(maxY, s.y);
    maxSpeed = Math.max(maxSpeed, Math.hypot(s.vx, s.vy));
  }
  return { x, maxY, maxSpeed };
}

describe("rider simulation over feature terrain", () => {
  it("survives 60 s and makes real progress across seeds", () => {
    for (const seed of [7, 4242, 987654]) {
      const { x, maxSpeed } = ride(seed, 60);
      // ~500 m of forward progress minimum — the run never stalls.
      expect(x).toBeGreaterThan(20000);
      // Physical bound: ground speed ≤ maxSpeed, launch adds ≤ jumpMax on
      // top (the airborne governor pulls it back within a step).
      expect(maxSpeed).toBeLessThan(params.maxSpeed + params.jumpMax);
    }
  });

  it("generates kickers anchored to the clamped heightfield", () => {
    // Scan several seeds: the rebalanced planner makes kickers rarer, so
    // require at least one across the batch and verify each one found.
    const seeds = [7, 4242, 987654, 123, 20260101];
    let checked = 0;
    for (const seed of seeds) {
      const terrain = new Terrain(seed);
      terrain.ensure(0, 40 * CHUNK_WIDTH);
      for (let i = 2; i < 40; i++) {
        const chunk = terrain.chunkAt(i * CHUNK_WIDTH + 1);
        if (!chunk?.kickers.length) continue;
        checked++;
        const k = chunk.kickers[0];
        // Recorded crest matches the final (post-clamp) heightfield…
        expect(Math.abs(terrain.heightAt(k.x) - k.crestY)).toBeLessThan(12);
        // …and the ramp shoulders stay within the rideable slope clamps.
        const upSlope = Math.abs(
          (terrain.heightAt(k.x - 60) - terrain.heightAt(k.x)) / 60,
        );
        const downSlope = Math.abs(
          (terrain.heightAt(k.x + 60) - terrain.heightAt(k.x)) / 60,
        );
        expect(upSlope).toBeLessThan(1.5);
        expect(downSlope).toBeLessThan(1.5);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
