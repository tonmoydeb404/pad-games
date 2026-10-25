/**
 * Chunked terrain. Each chunk is a pre-sampled heightfield derived from
 * seeded layered noise; chunks are generated ahead of the player and dropped
 * behind. Difficulty ramps slope, amplitude, gaps and rough patches.
 */

import { params } from "../core/params";
import { Rng, Noise1D } from "../core/rng";
import { clamp, difficultyAt, warmupAt } from "./biome";

export interface Gap {
  x0: number;
  x1: number;
}

export interface RoughZone {
  x0: number;
  x1: number;
}

/** A grindable rail: a taut line strung above the terrain with a slight sag. */
export interface Rail {
  x0: number;
  x1: number;
  /** Height of the line at both posts (the line is level between them). */
  y: number;
  /** Mid-span dip (px), cosmetic + a touch of ride feel. */
  sag: number;
  /** Height above the ground at generation time (used to re-anchor). */
  lift: number;
}

/** Ground material at a point. Salt pans are slick and fast; rock is rough. */
export type SurfaceMaterial = "sand" | "salt" | "rock";

/** A kicker ramp's crest — the launch point for ballistic orb trails. */
export interface Kicker {
  x: number;
  crestY: number;
}

/**
 * Per-chunk set-pieces, chosen by a deterministic planner (see
 * FeaturePlanner). "Feature" chunks are the challenge beats; "plain" and
 * "rest" give the run room to breathe between them.
 */
export type ChunkFeature = "plain" | "rest" | "kicker" | "rough" | "gap" | "gapChain";

export interface Chunk {
  index: number;
  x0: number;
  x1: number;
  dx: number;
  feature: ChunkFeature;
  heights: Float32Array;
  gaps: Gap[];
  rough: RoughZone[];
  kickers: Kicker[];
  /** Grind rail strung over this chunk, if any. */
  rail: Rail | null;
  /** Slick salt-pan span in this chunk, if any. */
  salt: { x0: number; x1: number } | null;
}

export const CHUNK_DX = 12;
export const CHUNK_POINTS = 220;
export const CHUNK_WIDTH = CHUNK_DX * CHUNK_POINTS;

function chunkRng(seed: number, index: number): Rng {
  return new Rng((seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0);
}

function smoothstep01(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Steepest uphill slope (y decreases): guarantees the rider always accelerates.
 */
const MAX_ASCENT = -0.35;
/** Steepest downhill slope (y increases): keeps landings judgeable. */
const MAX_DESCENT = 0.85;

/**
 * Deterministic set-piece planner. Walks a virtual chain from chunk 2 so any
 * chunk's feature depends only on (seed, index) — never on generation order.
 * Keeps the run smooth: set-pieces are the minority, every set-piece is
 * followed by at least one gentle chunk, and pity only forces a beat after
 * PITY_CHUNKS gentle chunks. Gap-heavy chunks never repeat back-to-back.
 */
const PITY_CHUNKS = 5;export class FeaturePlanner {
  private cache = new Map<number, ChunkFeature>();

  constructor(private seed: number) {}

  kindAt(index: number): ChunkFeature {
    if (index < 2) return "plain"; // spawn chunks stay gentle
    for (let i = 2; i <= index; i++) {
      if (!this.cache.has(i)) this.cache.set(i, this.decide(i));
    }
    return this.cache.get(index)!;
  }

  private decide(index: number): ChunkFeature {
    const prev = this.cache.get(index - 1) ?? "plain";
    // Chunks since the last challenge beat.
    let run = 0;
    for (let i = index - 1; i >= 2; i--) {
      const k = this.cache.get(i);
      if (!k || (k !== "plain" && k !== "rest")) break;
      run++;
    }

    const rng = new Rng((this.seed ^ Math.imul(index + 91, 0x85ebca6b)) >>> 0);
    const d = difficultyAt(index * CHUNK_WIDTH);
    const forbidGap = prev === "gap" || prev === "gapChain";

    // A set-piece is always followed by at least one gentle chunk.
    if (run === 0) return rng.bool(0.6) ? "plain" : "rest";

    const mustFeature = run >= PITY_CHUNKS;
    // Weighted feature table; set-pieces stay the minority so carving —
    // not launching — is the default rhythm. Weights ramp with difficulty.
    const table: Array<[ChunkFeature, number]> = [
      ["kicker", 0.35 + 0.55 * d],
      ["rest", 1.5],
      ["rough", d > 0.25 ? 0.6 : 0],
      ["gap", !forbidGap && d > 0.08 ? 0.4 + 0.9 * d : 0],
      ["gapChain", !forbidGap && d > 0.5 ? 0.25 + 0.7 * d : 0],
      ["plain", 2.2],
    ];
    if (mustFeature) {
      for (const entry of table) {
        if (entry[0] === "plain" || entry[0] === "rest") entry[1] = 0;
      }
    }

    let total = 0;
    for (const [, w] of table) total += w;
    if (total <= 0) return "kicker"; // e.g. pity + gap-forbidden at low d
    let roll = rng.float() * total;
    for (const [kind, w] of table) {
      roll -= w;
      if (roll < 0) return kind;
    }
    return "kicker";
  }
}

/**
 * Analytic height (fallback before a chunk exists).
 *
 * The profile is a handful of LONG, slow swells over a steady descent —
 * the carve line should read as a few big curves, never as chop. All
 * frequency content lives at 400 px+ wavelengths; short-wavelength noise is
 * deliberately absent so the slope changes gradually everywhere (the slope
 * clamps below then almost never bind).
 */
export function analyticHeight(noise: Noise1D, x: number): number {
  const d = difficultyAt(x);
  const w = warmupAt(x);
  const slope = params.baseSlope * (1 + 0.25 * d) * (0.8 + 0.2 * w);

  // Primary swell: one big breathing curve, 1.9–2.6 km wavelength.
  const wl1 = 2600 - 700 * d;
  const amp1 = (56 + 96 * d) * (0.18 + 0.82 * w);
  // Secondary swell: a slower counter-curve at ~1/4 the weight, so hills
  // feel composed rather than repetitive.
  const wl2 = 1100 - 200 * d;
  const amp2 = amp1 * 0.22;
  // A whisper of texture so the line never feels machine-made — strictly
  // low-amplitude, still a 430 px wave (no perceptible up-down jitter).
  const amp3 = amp1 * 0.06;

  const s1 = noise.sample(x / wl1) - 0.5;
  const s2 = noise.sample(x / wl2 + 37.7) - 0.5;
  const s3 = noise.sample(x / 430 + 91.3) - 0.5;
  return x * slope + s1 * 2 * amp1 + s2 * 2 * amp2 + s3 * 2 * amp3;
}

/** Deterministically build one chunk of the heightfield. */
export function generateChunk(
  index: number,
  seed: number,
  noise: Noise1D,
  planner: FeaturePlanner,
): Chunk {
  const rng = chunkRng(seed, index);
  const feature = planner.kindAt(index);
  const x0 = index * CHUNK_WIDTH;
  const heights = new Float32Array(CHUNK_POINTS);
  for (let i = 0; i < CHUNK_POINTS; i++) {
    heights[i] = analyticHeight(noise, x0 + i * CHUNK_DX);
  }

  const gaps: Gap[] = [];
  const rough: RoughZone[] = [];
  const kickers: Kicker[] = [];
  const x1 = x0 + CHUNK_WIDTH;
  const d = difficultyAt(x0 + CHUNK_WIDTH / 2);

  // --- set-piece geometry (exclusive per chunk, planned ahead of time) ----
  if (feature === "gap") {
    const gw = Math.min(300, 100 + 110 * d + rng.range(0, 50));
    const gx0 = x0 + rng.range(480, CHUNK_WIDTH - 620 - gw);
    const gap = { x0: gx0, x1: gx0 + gw };
    gaps.push(gap);
    // Flatten approach and landing strips so takeoff/landing are fair.
    flattenAround(heights, x0, gap.x0 - 20, 230);
    flattenAround(heights, x0, gap.x1 + 20, 230);
  } else if (feature === "gapChain") {
    // 2–3 chasms in one chunk, each with fair approach/landing strips.
    const n = rng.int(2, 3);
    const segment = CHUNK_WIDTH / n;
    for (let k = 0; k < n; k++) {
      const gw = Math.min(240, 90 + 90 * d + rng.range(0, 40));
      const gx0 =
        x0 + segment * k + segment * 0.3 + rng.range(0, segment * 0.2);
      const gap = { x0: gx0, x1: gx0 + gw };
      gaps.push(gap);
      flattenAround(heights, x0, gap.x0 - 20, 200);
      flattenAround(heights, x0, gap.x1 + 20, 200);
    }
  } else if (feature === "kicker") {
    const crest = applyKicker(heights, x0, rng, d);
    if (crest) kickers.push(crest);
  } else if (feature === "rough") {
    const rz0 = x0 + rng.range(240, CHUNK_WIDTH * 0.55);
    const rz1 = rz0 + rng.range(360, 950);
    rough.push({ x0: rz0, x1: rz1 });
    for (let i = 0; i < CHUNK_POINTS; i++) {
      const x = x0 + i * CHUNK_DX;
      if (x >= rz0 && x <= rz1) {
        // Smooth ripple: bumpy to ride, gentle enough to stay landable.
        const ripple = Math.sin(x / 19) * 7 + Math.sin(x / 47 + 1.3) * 5;
        const edge = Math.min(1, Math.min(x - rz0, rz1 - x) / 120);
        heights[i] += ripple * edge;
      }
    }
  } else if (feature === "rest") {
    applyRest(heights);
  }

  // --- gentle spawn slope -------------------------------------------------
  if (index === 0) {
    for (let i = 0; i < CHUNK_POINTS; i++) {
      const x = x0 + i * CHUNK_DX;
      const w = clamp(x / 900, 0, 1);
      const flat = analyticHeight(noise, 0) + x * params.baseSlope * 0.7;
      heights[i] = flat * (1 - w) + heights[i] * w;
    }
  }

  // --- overlays: salt pans & grind rails (never on set-piece chunks) ------
  let rail: Rail | null = null;
  let salt: { x0: number; x1: number } | null = null;
  if (feature === "plain" || feature === "rest") {
    const ovRng = new Rng((seed ^ Math.imul(index + 311, 0x27d4eb2f)) >>> 0);
    const dHere = difficultyAt(x0 + CHUNK_WIDTH / 2);

    // Salt pan: a slick fast patch across the middle of calm chunks. Ramps
    // in after the spawn area so the first kilometre teaches base handling.
    if (index >= 4 && ovRng.bool(0.16 + 0.2 * dHere)) {
      const pad = CHUNK_WIDTH * 0.16;
      salt = { x0: x0 + pad, x1: x0 + CHUNK_WIDTH - pad };
      // Iron the pan flat along the CHORD between its endpoints: the global
      // descent keeps flowing (no S-kink against the hill), only local
      // bumps are smoothed out, with a wide ease in and out.
      const iStart = Math.round((salt.x0 - x0) / CHUNK_DX);
      const iEnd = Math.round((salt.x1 - x0) / CHUNK_DX);
      const hA = heights[iStart];
      const hB = heights[iEnd];
      for (let i = iStart; i <= iEnd; i++) {
        const t = (i - iStart) / (iEnd - iStart);
        const chord = hA + (hB - hA) * t;
        const w = smoothstep01(Math.min(1, Math.min(t, 1 - t) * 3)) * 0.85;
        heights[i] = heights[i] * (1 - w) + chord * w;
      }
    }

    // Grind rail: strung over rest valleys (mostly) — the calm chunks are
    // where a line can be read and ridden without a set-piece competing.
    const railChance = feature === "rest" ? 0.5 : 0.1 + 0.15 * dHere;
    if (index >= 3 && ovRng.bool(railChance)) {
      const m0 = x0 + CHUNK_WIDTH * 0.2;
      const m1 = x0 + CHUNK_WIDTH * 0.8;
      const lift = 64 + 26 * ovRng.float();
      const sag = 10 + 6 * ovRng.float();
      // Anchor to the highest ground anywhere along the span so the line
      // never dives into a mid-span hill.
      rail = {
        x0: m0,
        x1: m1,
        y: highestGroundBetween(heights, x0, m0, m1) - lift - sag,
        sag,
        lift,
      };
    }
  }

  return { index, x0, x1, dx: CHUNK_DX, feature, heights, gaps, rough, kickers, rail, salt };
}

/** Highest ground within [a, b] of a chunk's heights (smallest y, y-down). */
function highestGroundBetween(
  heights: Float32Array,
  x0: number,
  a: number,
  b: number,
): number {
  const i0 = Math.max(0, Math.floor((a - x0) / CHUNK_DX));
  const i1 = Math.min(CHUNK_POINTS - 1, Math.ceil((b - x0) / CHUNK_DX));
  let best = heights[i0];
  for (let i = i0 + 1; i <= i1; i++) {
    if (heights[i] < best) best = heights[i];
  }
  return best;
}

/**
 * Kicker ramp: a smooth bump whose far side launches the rider. Rise and
 * fall widths keep the profile under the terrain slope clamps so the shape
 * survives clampSlopes intact. Returns the crest (launch point).
 */
function applyKicker(
  heights: Float32Array,
  x0: number,
  rng: Rng,
  d: number,
): Kicker | null {
  const A = 55 + 55 * d + rng.range(0, 20);
  // smoothstep peaks at slope 1.5*A/W — keep it under the clamps.
  const upW = Math.ceil(A / 0.22 / CHUNK_DX) * CHUNK_DX;
  const downW = Math.ceil(A / 0.54 / CHUNK_DX) * CHUNK_DX;
  const total = upW + downW;
  const margin = 500;
  if (total > CHUNK_WIDTH - margin * 2) return null;
  const kx0 = x0 + rng.range(margin, CHUNK_WIDTH - margin - total);
  const crestIndex = Math.round((kx0 + upW - x0) / CHUNK_DX);

  for (let i = 0; i < CHUNK_POINTS; i++) {
    const x = x0 + i * CHUNK_DX;
    if (x < kx0 || x > kx0 + total) continue;
    let bump: number;
    if (x <= kx0 + upW) {
      bump = A * smoothstep01((x - kx0) / upW);
    } else {
      bump = A * (1 - smoothstep01((x - kx0 - upW) / downW));
    }
    heights[i] -= bump; // up is negative y
  }
  return { x: kx0 + upW, crestY: heights[crestIndex] };
}

/**
 * Rest valley: ease the middle of the chunk toward the straight line
 * between its own ends — a calm, surprise-free stretch between beats.
 * Anchored to the final sample so the chunk seam stays continuous.
 */
function applyRest(heights: Float32Array): void {
  const i0 = Math.round(CHUNK_POINTS * 0.15);
  const i1 = CHUNK_POINTS - 1;
  const span = (i1 - i0) * CHUNK_DX;
  const slope = clamp(
    (heights[i1] - heights[i0]) / span,
    MAX_ASCENT * 0.7,
    MAX_DESCENT * 0.55,
  );
  const yA = heights[i0];
  for (let i = i0; i <= i1; i++) {
    const t = (i - i0) / (i1 - i0);
    const target = yA + slope * (i - i0) * CHUNK_DX;
    const w = smoothstep01(t);
    heights[i] = heights[i] * (1 - w) + target * w;
  }
}

/** Ease heights toward the edge value near a gap so lips land smoothly. */
function flattenAround(
  heights: Float32Array,
  chunkX0: number,
  center: number,
  range: number,
): void {
  const edgeIndex = Math.round((center - chunkX0) / CHUNK_DX);
  if (edgeIndex < 0 || edgeIndex >= CHUNK_POINTS) return;
  const edgeH = heights[edgeIndex];
  const span = Math.ceil(range / CHUNK_DX);
  for (let k = -span; k <= span; k++) {
    const i = edgeIndex + k;
    if (i < 0 || i >= CHUNK_POINTS) continue;
    const t = 1 - Math.abs(k) / (span + 1);
    const s = t * t * (3 - 2 * t);
    heights[i] = heights[i] * (1 - s) + edgeH * s;
  }
}

/**
 * Steepest uphill slope (y decreases): guarantees the rider always
 * accelerates. Steepest downhill (MAX_DESCENT) keeps landings judgeable.
 * Both live above FeaturePlanner, next to the kicker geometry that must
 * respect them.
 */

export class Terrain {
  private chunks = new Map<number, Chunk>();
  private noise: Noise1D;
  private planner: FeaturePlanner;

  constructor(public seed: number) {
    this.noise = new Noise1D((seed ^ 0x51ab3f7) >>> 0);
    this.planner = new FeaturePlanner(seed);
  }

  regenerate(seed: number): void {
    this.seed = seed;
    this.noise = new Noise1D((seed ^ 0x51ab3f7) >>> 0);
    this.planner = new FeaturePlanner(seed);
    this.chunks.clear();
  }

  private chunkIndexAt(x: number): number {
    return Math.floor(x / CHUNK_WIDTH);
  }

  chunkAt(x: number): Chunk | undefined {
    return this.chunks.get(this.chunkIndexAt(x));
  }

  /** Generate any chunks covering [minX, maxX]. */
  ensure(minX: number, maxX: number): void {
    const i0 = this.chunkIndexAt(minX);
    const i1 = this.chunkIndexAt(maxX);
    for (let i = i0; i <= i1; i++) {
      if (!this.chunks.has(i)) {
        const chunk = generateChunk(i, this.seed, this.noise, this.planner);
        // Clamp slopes, chained from the previous chunk for seam-free dunes.
        const prev = this.chunks.get(i - 1);
        const anchor = prev
          ? prev.heights[CHUNK_POINTS - 1]
          : analyticHeight(this.noise, i * CHUNK_WIDTH - CHUNK_DX);
        this.clampSlopes(chunk, anchor);
        // Kicker crests were recorded pre-clamp — re-anchor them to the
        // clamped heightfield so trails launch from the true lip.
        for (const k of chunk.kickers) {
          const ci = Math.round((k.x - chunk.x0) / chunk.dx);
          k.crestY = chunk.heights[Math.min(CHUNK_POINTS - 1, Math.max(0, ci))];
        }
        // Rails are likewise anchored pre-clamp; re-anchor to the highest
        // clamped ground under the span so the kiss distance stays honest.
        if (chunk.rail) {
          const r = chunk.rail;
          r.y = highestGroundBetween(chunk.heights, chunk.x0, r.x0, r.x1) - r.lift - r.sag;
        }
        this.chunks.set(i, chunk);
      }
    }
  }

  /** Rideability guarantee: ascent never steeper than MAX_ASCENT. */
  private clampSlopes(chunk: Chunk, anchorY: number): void {
    let prev = anchorY;
    for (let i = 0; i < CHUNK_POINTS; i++) {
      const minY = prev + MAX_ASCENT * chunk.dx;
      const maxY = prev + MAX_DESCENT * chunk.dx;
      let h = chunk.heights[i];
      if (h < minY) h = minY;
      if (h > maxY) h = maxY;
      chunk.heights[i] = h;
      prev = h;
    }
  }

  /** Drop chunks far behind the camera. */
  prune(centerX: number, keepBehind = 1600): void {
    const minIndex = this.chunkIndexAt(centerX - keepBehind);
    for (const key of this.chunks.keys()) {
      if (key < minIndex) this.chunks.delete(key);
    }
  }

  /** Ground height at x (linear between samples; chunk data if present). */
  heightAt(x: number): number {
    const index = this.chunkIndexAt(x);
    const chunk = this.chunks.get(index);
    if (!chunk) return analyticHeight(this.noise, x);
    const local = (x - chunk.x0) / chunk.dx;
    const i = Math.floor(local);
    if (i < 0) return chunk.heights[0];
    if (i < CHUNK_POINTS - 1) {
      const t = local - i;
      return chunk.heights[i] * (1 - t) + chunk.heights[i + 1] * t;
    }
    // Last half-step of the chunk: continue into the next chunk's first
    // sample so the interpolated slope stays continuous across seams.
    const t = local - (CHUNK_POINTS - 1);
    const next = this.chunks.get(index + 1);
    const h0 = chunk.heights[CHUNK_POINTS - 1];
    if (t <= 0 || !next) return h0;
    return h0 * (1 - t) + next.heights[0] * t;
  }

  /** dy/dx of the terrain at x (finite difference). */
  slopeAt(x: number): number {
    return (this.heightAt(x + 3) - this.heightAt(x - 3)) / 6;
  }

  gapAt(x: number): Gap | null {
    const chunk = this.chunks.get(this.chunkIndexAt(x));
    if (!chunk) return null;
    for (const g of chunk.gaps) {
      if (x > g.x0 && x < g.x1) return g;
    }
    return null;
  }

  roughAt(x: number): boolean {
    const chunk = this.chunks.get(this.chunkIndexAt(x));
    if (!chunk) return false;
    for (const r of chunk.rough) {
      if (x > r.x0 && x < r.x1) return true;
    }
    return false;
  }

  /** The grind rail over this x, if any (null outside its span). */
  railAt(x: number): Rail | null {
    const chunk = this.chunks.get(this.chunkIndexAt(x));
    const rail = chunk?.rail;
    if (!rail || x < rail.x0 || x > rail.x1) return null;
    return rail;
  }

  /** Line height of a rail at x, including the mid-span sag. */
  railYAt(rail: Rail, x: number): number {
    const t = clamp((x - rail.x0) / (rail.x1 - rail.x0), 0, 1);
    return rail.y + Math.sin(t * Math.PI) * rail.sag;
  }

  /** Ground material at x: rock on rough zones, salt pans, else sand. */
  surfaceAt(x: number): SurfaceMaterial {
    if (this.roughAt(x)) return "rock";
    const chunk = this.chunks.get(this.chunkIndexAt(x));
    const salt = chunk?.salt;
    if (salt && x >= salt.x0 && x <= salt.x1) return "salt";
    return "sand";
  }

  /** Set-piece kind at x (falls back to "plain" for ungenerated chunks). */
  featureAt(x: number): ChunkFeature {
    return this.chunks.get(this.chunkIndexAt(x))?.feature ?? "plain";
  }

  /** All kicker crests within [minX, maxX] (for orb trails). */
  kickersInRange(minX: number, maxX: number): Kicker[] {
    const out: Kicker[] = [];
    const i0 = this.chunkIndexAt(minX);
    const i1 = this.chunkIndexAt(maxX);
    for (let i = i0; i <= i1; i++) {
      const chunk = this.chunks.get(i);
      if (!chunk) continue;
      for (const k of chunk.kickers) {
        if (k.x >= minX && k.x <= maxX) out.push(k);
      }
    }
    return out;
  }

  /** All gaps within [minX, maxX] (for rendering). */
  gapsInRange(minX: number, maxX: number): Gap[] {
    const out: Gap[] = [];
    const i0 = this.chunkIndexAt(minX);
    const i1 = this.chunkIndexAt(maxX);
    for (let i = i0; i <= i1; i++) {
      const chunk = this.chunks.get(i);
      if (!chunk) continue;
      for (const g of chunk.gaps) out.push(g);
    }
    return out;
  }

  roughInRange(minX: number, maxX: number): RoughZone[] {
    const out: RoughZone[] = [];
    const i0 = this.chunkIndexAt(minX);
    const i1 = this.chunkIndexAt(maxX);
    for (let i = i0; i <= i1; i++) {
      const chunk = this.chunks.get(i);
      if (!chunk) continue;
      for (const r of chunk.rough) out.push(r);
    }
    return out;
  }

  /** All rails overlapping [minX, maxX] (for rendering). */
  railsInRange(minX: number, maxX: number): Rail[] {
    const out: Rail[] = [];
    const i0 = this.chunkIndexAt(minX);
    const i1 = this.chunkIndexAt(maxX);
    for (let i = i0; i <= i1; i++) {
      const rail = this.chunks.get(i)?.rail;
      if (rail && rail.x1 >= minX && rail.x0 <= maxX) out.push(rail);
    }
    return out;
  }

  /** Kill height inside a gap: falling this far below the rim is a fall. */
  gapKillY(gap: Gap): number {
    return Math.min(this.heightAt(gap.x0), this.heightAt(gap.x1)) + 300;
  }
}
