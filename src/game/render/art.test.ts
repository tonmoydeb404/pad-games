import { describe, expect, it } from "vitest";
import { paletteAt } from "../world/biome";
import {
  BG_BASE,
  cloudLook,
  landmarkFor,
  SCENERY_SLOT,
  SPRITE_NAMES,
  sceneryAt,
  spriteTint,
  tintFor,
} from "./art";

const chan = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const lum = (c: number): number => {
  const [r, g, b] = chan(c);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};

describe("palette tinting", () => {
  it("recolours the pack's flat layers to the target (multiply by target/base)", () => {
    const target: [number, number, number] = [150, 120, 100];
    const [tr, tg, tb] = chan(tintFor(target));
    expect(Math.round((BG_BASE[0] * tr) / 255)).toBeCloseTo(target[0], -1);
    expect(Math.round((BG_BASE[1] * tg) / 255)).toBeCloseTo(target[1], -1);
    expect(Math.round((BG_BASE[2] * tb) / 255)).toBeCloseTo(target[2], -1);
  });

  it("the base colour itself maps to no change, and tints never exceed white", () => {
    expect(tintFor(BG_BASE)).toBe(0xffffff);
    expect(tintFor([255, 255, 255])).toBe(0xffffff);
    expect(tintFor([0, 0, 0])).toBe(0x000000);
  });

  it("sprites are lit by day and dim at night (as the game blends them)", () => {
    const day = paletteAt(0.32 * 90000);
    const night = paletteAt(0.9 * 90000);
    // parallax.ts: spriteTint(p, 0.42 + 0.3 * p.night)
    const dayLum = lum(spriteTint(day, 0.42 + 0.3 * day.night));
    const nightLum = lum(spriteTint(night, 0.42 + 0.3 * night.night));
    expect(dayLum).toBeGreaterThan(nightLum + 60);
    // never black — they must stay readable against the sky
    expect(nightLum).toBeGreaterThan(60);
  });

  it("clouds are bright and solid by day, pale-blue and faint at night — never a black smudge", () => {
    const day = cloudLook(paletteAt(0.32 * 90000));
    const night = cloudLook(paletteAt(0.9 * 90000));
    expect(night.alpha).toBeLessThan(day.alpha);
    expect(night.alpha).toBeGreaterThan(0.3);
    expect(lum(day.tint)).toBeGreaterThan(190);
    expect(lum(night.tint)).toBeGreaterThan(110); // the regression: it used to go near-black
    const [r, g, b] = chan(night.tint);
    expect(b).toBeGreaterThan(r); // moonlit blue
    expect(g).toBeGreaterThan(0);
  });
});

describe("landmarks and scenery placement", () => {
  it("landmarks are a pure function of the slot and cover several kinds", () => {
    const kinds = new Set<string>();
    for (let i = -3; i < 40; i++) {
      expect(landmarkFor(i)).toBe(landmarkFor(i));
      kinds.add(landmarkFor(i));
    }
    expect(kinds.size).toBeGreaterThanOrEqual(4);
    expect(kinds.has("pyramid")).toBe(true);
    for (const k of kinds) expect(SPRITE_NAMES as readonly string[]).toContain(k);
  });

  it("scenery is deterministic per seed and differs between seeds", () => {
    const a = Array.from({ length: 200 }, (_, i) => sceneryAt(i, 1234));
    const b = Array.from({ length: 200 }, (_, i) => sceneryAt(i, 1234));
    const c = Array.from({ length: 200 }, (_, i) => sceneryAt(i, 9999));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("fills about 60% of slots, with only shipped sprites, inside their slot", () => {
    const n = 5000;
    let filled = 0;
    const seen = new Set<string>();
    for (let i = 0; i < n; i++) {
      const it = sceneryAt(i, 42);
      if (!it) continue;
      filled++;
      seen.add(it.name);
      expect(SPRITE_NAMES as readonly string[]).toContain(it.name);
      expect(it.x).toBeGreaterThanOrEqual(i * SCENERY_SLOT);
      expect(it.x).toBeLessThan((i + 1) * SCENERY_SLOT);
      expect(it.heightFrac).toBeGreaterThan(0.03);
      expect(it.heightFrac).toBeLessThan(0.3);
    }
    expect(filled / n).toBeGreaterThan(0.55);
    expect(filled / n).toBeLessThan(0.69);
    expect(seen.size).toBeGreaterThanOrEqual(9); // cacti, palms, dead trees and bushes all appear
  });
});
