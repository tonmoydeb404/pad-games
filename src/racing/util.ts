/**
 * Tiny shared math helpers for the racing module (kept dependency-free so
 * tests can import them without pulling three.js).
 */

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Shortest signed angle from a to b, radians. */
export function angleDelta(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Deterministic 32-bit hash — stable prop/challenge jitter. */
export function hash2(x: number, z: number): number {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = (h * 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

/** ms → m/s → km/h helpers. */
export const kph = (unitsPerSec: number): number => unitsPerSec * 3.6;
