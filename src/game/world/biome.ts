/**
 * World mood: difficulty ramp with distance and the time-of-day palette
 * cycle. Pure functions of x so terrain generation, rendering and the UI all
 * agree deterministically.
 */

export type RGB = [number, number, number];

export function lerpRGB(a: RGB, b: RGB, t: number): RGB {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

export function rgbNum(c: RGB): number {
  return ((Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2])) >>> 0;
}

export function rgbCss(c: RGB): string {
  return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
}

export interface Palette {
  skyTop: RGB;
  skyMid: RGB;
  skyHor: RGB;
  sun: RGB;
  glow: RGB;
  duneFar: RGB;
  duneMid: RGB;
  duneNear: RGB;
  sand: RGB;
  sandRidge: RGB;
  sandShade: RGB;
  /** 0 day .. 1 night (star & moon alpha) */
  night: number;
}

const DAWN: Palette = {
  skyTop: [31, 47, 94],
  skyMid: [160, 106, 146],
  skyHor: [255, 185, 138],
  sun: [255, 217, 168],
  glow: [255, 158, 110],
  duneFar: [124, 86, 120],
  duneMid: [93, 63, 98],
  duneNear: [64, 44, 74],
  sand: [201, 141, 104],
  sandRidge: [237, 185, 138],
  sandShade: [150, 96, 74],
  night: 0.25,
};

const DAY: Palette = {
  skyTop: [61, 143, 214],
  skyMid: [124, 194, 236],
  skyHor: [223, 240, 248],
  sun: [255, 246, 204],
  glow: [255, 233, 168],
  duneFar: [201, 144, 106],
  duneMid: [169, 114, 84],
  duneNear: [138, 88, 68],
  sand: [233, 180, 131],
  sandRidge: [255, 217, 166],
  sandShade: [176, 126, 88],
  night: 0,
};

const SUNSET: Palette = {
  skyTop: [58, 39, 87],
  skyMid: [194, 96, 109],
  skyHor: [255, 178, 102],
  sun: [255, 158, 94],
  glow: [255, 138, 74],
  duneFar: [116, 67, 88],
  duneMid: [87, 48, 72],
  duneNear: [60, 34, 56],
  sand: [192, 126, 92],
  sandRidge: [237, 160, 108],
  sandShade: [138, 87, 65],
  night: 0.1,
};

const NIGHT: Palette = {
  skyTop: [7, 11, 28],
  skyMid: [23, 32, 63],
  skyHor: [44, 58, 99],
  sun: [232, 239, 255],
  glow: [170, 184, 232],
  duneFar: [35, 44, 72],
  duneMid: [26, 33, 56],
  duneNear: [18, 23, 40],
  sand: [70, 80, 122],
  sandRidge: [107, 122, 176],
  sandShade: [46, 54, 84],
  night: 1,
};

const PHASES: Palette[] = [DAWN, DAY, SUNSET, NIGHT];

/** Distance for one full dawn → day → sunset → night cycle. */
export const DAY_CYCLE_PX = 90000;

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}function mixPalette(a: Palette, b: Palette, t: number): Palette {
  return {
    skyTop: lerpRGB(a.skyTop, b.skyTop, t),
    skyMid: lerpRGB(a.skyMid, b.skyMid, t),
    skyHor: lerpRGB(a.skyHor, b.skyHor, t),
    sun: lerpRGB(a.sun, b.sun, t),
    glow: lerpRGB(a.glow, b.glow, t),
    duneFar: lerpRGB(a.duneFar, b.duneFar, t),
    duneMid: lerpRGB(a.duneMid, b.duneMid, t),
    duneNear: lerpRGB(a.duneNear, b.duneNear, t),
    sand: lerpRGB(a.sand, b.sand, t),
    sandRidge: lerpRGB(a.sandRidge, b.sandRidge, t),
    sandShade: lerpRGB(a.sandShade, b.sandShade, t),
    night: a.night + (b.night - a.night) * t,
  };
}

/**
 * Interpolated palette at world x. Each phase holds, then blends to next.
 * The blend parameter is quantized and memoized — called every frame, and
 * mixPalette allocates, so the cache also keeps steady-state GC quiet.
 * The returned object is shared: treat it as read-only.
 */
const PALETTE_STEPS = 128;
let paletteKey = -1;
let paletteCache: Palette | null = null;

export function paletteAt(x: number): Palette {
  const t = (((x / DAY_CYCLE_PX) % 1) + 1) % 1;
  const seg = t * PHASES.length;
  const key = Math.round(seg * PALETTE_STEPS);
  if (key === paletteKey && paletteCache) return paletteCache;

  const i = Math.floor(seg) % PHASES.length;
  const local = seg - Math.floor(seg);
  const blend = 0.3;
  let out: Palette;
  if (local < blend) {
    const prev = PHASES[(i + PHASES.length - 1) % PHASES.length];
    out = mixPalette(prev, PHASES[i], smoothstep(local / blend));
  } else {
    out = PHASES[i];
  }
  paletteKey = key;
  paletteCache = out;
  return out;
}

/**
 * 0 at spawn → 1 at max difficulty, in smooth bands: every ~8 km the ramp
 * briefly eases (a planned breather) so the tension curve breathes instead
 * of climbing in a straight line. Warmup keeps the first km gentle.
 */
const RELIEF_START_PX = 12000;
const RELIEF_PERIOD_PX = 320000; // 8 km at 40 px/m

export function difficultyAt(x: number): number {
  const base = Math.min(1, Math.max(0, (x - 2400) / 26000));
  if (base <= 0) return 0;
  if (x < RELIEF_START_PX) return base;
  const phase = (((x - RELIEF_START_PX) / RELIEF_PERIOD_PX) % 1 + 1) % 1;
  // First 30% of each period eases up to 15% — a valley between climbs.
  const relief = phase < 0.3 ? Math.sin((phase / 0.3) * Math.PI) : 0;
  return Math.min(1, Math.max(0, base * (1 - 0.15 * relief)));
}

/** Spawn-area easing, separate from difficulty (used by terrain). */
export function warmupAt(x: number): number {
  return Math.min(1, Math.max(0, x / 1400));
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
