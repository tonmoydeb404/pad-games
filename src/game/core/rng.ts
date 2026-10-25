/**
 * Deterministic, seedable randomness. Everything about the world
 * (terrain, gaps, obstacles, pickups, weather) is derived from a single
 * numeric seed, which gives us the daily challenge and fair leaderboards.
 */

/** Fast, tiny PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Order-independent hash of two ints -> [0, 1). Used by value noise. */
export function hash2(a: number, b: number): number {
  let h = (a ^ 0x9e3779b1) >>> 0;
  h = Math.imul(h ^ (b + 0x85ebca6b), 0xc2b2ae35);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Convenience wrapper around mulberry32 with common sampling helpers. */
export class Rng {
  readonly seed: number;
  private next: () => number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.next = mulberry32(this.seed);
  }

  float(): number {
    return this.next();
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  bool(p = 0.5): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.min(arr.length - 1, Math.floor(this.next() * arr.length))];
  }
}

/** Stable numeric seed for the daily challenge, based on the local date. */
export function dailySeedFor(date: Date = new Date()): number {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return hashString(`dune-glide/${y}-${m}-${d}`);
}

/**
 * Smooth 1D value noise. Values are derived from (seed, lattice index) via a
 * hash, so sampling order never matters — fully deterministic.
 */
export class Noise1D {
  private cache = new Map<number, number>();

  constructor(readonly seed: number) {}

  private lattice(i: number): number {
    let v = this.cache.get(i);
    if (v === undefined) {
      v = hash2(this.seed, i);
      this.cache.set(i, v);
    }
    return v;
  }

  /** Smooth noise in [0, 1). */
  sample(x: number): number {
    const i = Math.floor(x);
    const t = x - i;
    const s = t * t * (3 - 2 * t);
    return this.lattice(i) * (1 - s) + this.lattice(i + 1) * s;
  }

  /** Fractal Brownian motion, normalized to [0, 1). */
  fbm(x: number, octaves = 4, lacunarity = 2.13, gain = 0.5): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += this.sample(x * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}
