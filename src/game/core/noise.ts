/**
 * Deterministic noise + math helpers for the Jungle Jeep terrain.
 * Same pipeline as the original standalone build: order-independent value
 * noise stacked into fbm, plus a seeded mulberry32 stream.
 */

export const TAU = Math.PI * 2;

export const clamp = (v: number, a: number, b: number): number =>
  v < a ? a : v > b ? b : v;
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (t: number): number => t * t * (3 - 2 * t);
/** Framerate-independent exponential approach. */
export const damp = (a: number, b: number, l: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-l * dt));

export function hash2(i: number, j: number): number {
  let n = (i * 374761393 + j * 668265263) | 0;
  n = (n ^ (n >> 13)) | 0;
  n = (n * 1274126177) | 0;
  return ((n ^ (n >> 16)) >>> 0) / 4294967295;
}

function valueNoise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = smooth(xf);
  const v = smooth(zf);
  const a = hash2(xi, zi);
  const b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1);
  const d = hash2(xi + 1, zi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v) * 2 - 1;
}

export function fbm(x: number, z: number, oct = 4, freq = 1, amp = 1): number {
  let s = 0;
  let a = amp;
  let f = freq;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    s += valueNoise(x * f, z * f) * a;
    norm += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / (norm || 1);
}

/** Deterministic pseudo-random stream. */
export function mulberry(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
