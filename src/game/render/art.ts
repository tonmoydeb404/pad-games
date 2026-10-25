/**
 * Scenery art — Kenney "Background Elements Remastered" (CC0), served from
 * /assets/dune. This module owns three things:
 *   1. loading the textures (`loadSceneArt`) — failures resolve to null so the
 *      game still runs, just with plainer scenery;
 *   2. palette tinting — the pack's background layers are single-colour
 *      silhouettes meant to be recoloured, and its sprites are fixed daytime
 *      colours, so both are tinted from the day/night + biome palette;
 *   3. deterministic placement of landmarks and roadside scenery, as pure
 *      functions of a slot index (same distances look the same for every
 *      rider and seed — see ParallaxView).
 */

import { Assets, type Texture } from "pixi.js";
import { hash2 } from "../core/rng";
import { lerpRGB, type Palette, type RGB } from "../world/biome";

const BASE = "/assets/dune";

export const SPRITE_NAMES = [
  "sun",
  "moon",
  "moonFull",
  "cloud1",
  "cloud2",
  "cloud3",
  "cloud4",
  "cloud5",
  "cloud6",
  "cloud7",
  "cloud8",
  "cactus1",
  "cactus2",
  "cactus3",
  "treePalm",
  "treeDead",
  "bush1",
  "bush2",
  "bush3",
  "bush4",
  "bushOrange1",
  "bushOrange2",
  "pyramid",
  "pyramidMayan",
  "tower",
  "towerAlt",
  "towerSmall",
  "castleSmall",
  "castleSmallAlt",
] as const;
export type SpriteName = (typeof SPRITE_NAMES)[number];

export const BG_NAMES = ["mountains", "hills", "hillsLarge"] as const;
export type BgName = (typeof BG_NAMES)[number];

/** Sprites are the pack's @2x art — draw them at half size for 1:1 on retina. */
export const SPRITE_SCALE = 0.5;

export interface SceneArt {
  sprites: Record<SpriteName, Texture>;
  bg: Record<BgName, Texture>;
}

/** Load every texture once. Resolves null (with a warning) if anything fails. */
export async function loadSceneArt(): Promise<SceneArt | null> {
  try {
    const spriteUrls = SPRITE_NAMES.map((n) => `${BASE}/sprites/${n}.png`);
    const bgUrls = BG_NAMES.map((n) => `${BASE}/bg/${n}.png`);
    const loaded = (await Assets.load([...spriteUrls, ...bgUrls])) as Record<string, Texture>;
    const sprites = {} as Record<SpriteName, Texture>;
    const bg = {} as Record<BgName, Texture>;
    SPRITE_NAMES.forEach((n, i) => {
      sprites[n] = loaded[spriteUrls[i]];
    });
    BG_NAMES.forEach((n, i) => {
      bg[n] = loaded[bgUrls[i]];
    });
    for (const t of [...Object.values(sprites), ...Object.values(bg)]) {
      if (!t) throw new Error("missing texture");
      t.source.scaleMode = "linear";
    }
    return { sprites, bg };
  } catch (err) {
    console.warn("[dune-glide] scenery art failed to load — using plain dunes", err);
    return null;
  }
}

/* -------------------------------------------------------------------------
   Tinting
   ------------------------------------------------------------------------- */

/** Colour of every background layer in the pack (they are one flat tone). */
export const BG_BASE: RGB = [183, 231, 250];

const toNum = (r: number, g: number, b: number): number =>
  (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);

/**
 * Pixi tint that recolours a flat `base`-coloured texture to `target`.
 * Tint multiplies per channel, so channel = target / base (capped at 1: a
 * target lighter than the base in some channel just reaches the base's own
 * brightness there).
 */
export function tintFor(target: RGB, base: RGB = BG_BASE): number {
  const c = (t: number, b: number): number => Math.min(255, Math.max(0, (255 * t) / b));
  return toNum(c(target[0], base[0]), c(target[1], base[1]), c(target[2], base[2]));
}

/** Atmosphere: blend a layer colour toward the horizon haze (0 = none, 1 = all haze). */
export function hazed(color: RGB, p: Palette, amount: number): RGB {
  return lerpRGB(color, p.skyHor, amount);
}

/**
 * Tint for the pack's full-colour sprites: neutral white in daylight, drawn
 * toward the palette's near-dune tone so sprites sit in the same light as the
 * ground — warm at dawn/dusk, dark blue at night.
 */
export function spriteTint(p: Palette, amount = 0.4): number {
  const c = lerpRGB([255, 255, 255], p.duneNear, amount);
  return toNum(c[0], c[1], c[2]);
}

/**
 * Cloud tint + opacity: bright and fairly solid by day; at night pale
 * moonlit blue and faint (multiplying a white cloud by the dark night sky
 * colour would turn it into a black smudge).
 */
export function cloudLook(p: Palette): { tint: number; alpha: number } {
  const day = lerpRGB([255, 255, 255], p.skyMid, 0.3 + 0.35 * p.night);
  const c = lerpRGB(day, [150, 160, 205], Math.min(1, p.night * 0.75));
  return { tint: toNum(c[0], c[1], c[2]), alpha: 0.95 - 0.5 * p.night };
}

/* -------------------------------------------------------------------------
   Placement
   ------------------------------------------------------------------------- */

export type LandmarkName = Extract<SpriteName, "pyramid" | "pyramidMayan" | "tower" | "towerAlt" | "castleSmall" | "castleSmallAlt">;
const LANDMARKS: LandmarkName[] = ["pyramid", "pyramidMayan", "tower", "castleSmall", "pyramid", "towerAlt", "castleSmallAlt", "pyramidMayan"];

/** Which landmark stands in slot `i` (a pure function of the slot). */
export function landmarkFor(i: number): LandmarkName {
  return LANDMARKS[((i % LANDMARKS.length) + LANDMARKS.length) % LANDMARKS.length];
}

export type SceneryName = Extract<
  SpriteName,
  "cactus1" | "cactus2" | "cactus3" | "treePalm" | "treeDead" | "bush1" | "bush2" | "bush3" | "bush4" | "bushOrange1" | "bushOrange2"
>;

interface Weighted {
  name: SceneryName;
  w: number;
  /** Displayed height as a fraction of screen height. */
  h: number;
}
const SCENERY: Weighted[] = [
  { name: "cactus1", w: 3, h: 0.1 },
  { name: "cactus2", w: 3, h: 0.115 },
  { name: "cactus3", w: 2, h: 0.08 },
  { name: "treePalm", w: 2, h: 0.19 },
  { name: "treeDead", w: 1.5, h: 0.17 },
  { name: "bush1", w: 2, h: 0.045 },
  { name: "bush2", w: 2, h: 0.05 },
  { name: "bush3", w: 1.5, h: 0.045 },
  { name: "bush4", w: 1.5, h: 0.05 },
  { name: "bushOrange1", w: 1.5, h: 0.045 },
  { name: "bushOrange2", w: 1.5, h: 0.05 },
];
const SCENERY_TOTAL = SCENERY.reduce((a, s) => a + s.w, 0);

export interface SceneryItem {
  /** Position in the parallax layer's own coordinate space (px). */
  x: number;
  name: SceneryName;
  /** Display height as a fraction of screen height. */
  heightFrac: number;
  flip: boolean;
}

/** One slot every this many layer-pixels; ~60 % of slots hold something. */
export const SCENERY_SLOT = 340;
const SCENERY_FILL = 0.62;

/** The scenery in slot `i`, or null for an empty slot. Pure and deterministic. */
export function sceneryAt(i: number, seed: number): SceneryItem | null {
  if (hash2(i, seed ^ 0x51ed) > SCENERY_FILL) return null;
  let r = hash2(i, seed ^ 0x9a1) * SCENERY_TOTAL;
  let pick = SCENERY[0];
  for (const s of SCENERY) {
    if (r < s.w) {
      pick = s;
      break;
    }
    r -= s.w;
  }
  const size = 0.85 + hash2(i, seed ^ 0x3c7) * 0.35;
  return {
    x: i * SCENERY_SLOT + hash2(i, seed ^ 0x77b) * SCENERY_SLOT * 0.8,
    name: pick.name,
    heightFrac: pick.h * size,
    flip: hash2(i, seed ^ 0xf11) < 0.5,
  };
}
