import type { Saddle } from "./types";

/**
 * Height of the back along the body's centreline: where each triangle crosses
 * the x = 0 plane, the highest crossing per slice of the seat band. Reads a
 * flat-topped box (no vertices mid-back) and a round ridge equally well. The
 * 40th percentile across slices ignores plates/spines that only occupy some
 * slices, so a stegosaurus is ridden on its back, not its plate tips.
 */
function centerlineTop(tris: number[], z0: number, z1: number): number | null {
  const SLICES = 12;
  const tops = new Array<number>(SLICES).fill(-Infinity);
  const dz = Math.max(z1 - z0, 1e-6);
  const cy: number[] = [];
  const cz: number[] = [];
  for (let i = 0; i + 8 < tris.length; i += 9) {
    // where the triangle's edges cross the x = 0 plane (0 or 2 points)
    cy.length = 0;
    cz.length = 0;
    for (let e = 0; e < 3; e++) {
      const a = i + e * 3;
      const b = i + ((e + 1) % 3) * 3;
      const xa = tris[a];
      const xb = tris[b];
      if ((xa > 0 && xb > 0) || (xa < 0 && xb < 0) || xa === xb) continue;
      const t = xa / (xa - xb);
      cy.push(tris[a + 1] + (tris[b + 1] - tris[a + 1]) * t);
      cz.push(tris[a + 2] + (tris[b + 2] - tris[a + 2]) * t);
    }
    if (cy.length < 2) continue;
    // the crossing is a segment: a big flat quad covers many slices, so fill each
    // slice the segment spans (an edge-only test would credit just one of them)
    const za = Math.min(cz[0], cz[1]);
    const zb = Math.max(cz[0], cz[1]);
    if (zb < z0 || za > z1) continue;
    const k0 = Math.max(0, Math.floor(((Math.max(za, z0) - z0) / dz) * SLICES));
    const k1 = Math.min(SLICES - 1, Math.floor(((Math.min(zb, z1) - z0) / dz) * SLICES));
    for (let k = k0; k <= k1; k++) {
      const zs = Math.min(zb, Math.max(za, z0 + ((k + 0.5) / SLICES) * dz));
      const f = zb - za < 1e-6 ? 0 : (zs - cz[0]) / (cz[1] - cz[0]);
      const y = cy[0] + (cy[1] - cy[0]) * f;
      if (y > tops[k]) tops[k] = y;
    }
  }
  const have = tops.filter((y) => y > -Infinity).sort((p1, p2) => p1 - p2);
  if (have.length < 3) return null;
  return have[Math.floor((have.length - 1) * 0.4)];
}

export function saddleFromPoints(pts: number[], height: number, tris?: number[]): Saddle {
  // no readable geometry (should not happen): sit at a plausible height
  if (pts.length < 9) return { y: height * 0.6, fwd: 0, halfW: 0.3, len: height };
  let zmin = Infinity;
  let zmax = -Infinity;
  for (let i = 2; i < pts.length; i += 3) {
    zmin = Math.min(zmin, pts[i]);
    zmax = Math.max(zmax, pts[i]);
  }
  const len = Math.max(zmax - zmin, 0.1);
  // Where is the torso? Head, neck and tail drag the middle of the whole body
  // toward the shoulders, so find it from the FEET instead: the points near the
  // ground cluster under the front and rear legs, and the seat belongs midway
  // between the rearmost and foremost of them. Legless/odd bodies (snake, wasp)
  // fall back to the middle of the body.
  let ymin0 = Infinity;
  let ymax0 = -Infinity;
  for (let i = 1; i < pts.length; i += 3) {
    ymin0 = Math.min(ymin0, pts[i]);
    ymax0 = Math.max(ymax0, pts[i]);
  }
  const footLimit = ymin0 + (ymax0 - ymin0) * 0.22;
  const footZ: number[] = [];
  for (let i = 0; i < pts.length; i += 3) if (pts[i + 1] <= footLimit) footZ.push(pts[i + 2]);
  footZ.sort((p1, p2) => p1 - p2);
  // percentiles, not extremes: a tail lying along the ground (rat) or a trailing
  // limb must not drag the torso centre backwards
  const fz0 = footZ.length ? footZ[Math.floor(footZ.length * 0.15)] : 0;
  const fz1 = footZ.length ? footZ[Math.min(footZ.length - 1, Math.floor(footZ.length * 0.85))] : 0;
  const haveFeet = footZ.length >= 12 && fz1 - fz0 > len * 0.2;
  const zc = haveFeet ? (fz0 + fz1) / 2 : zmin + len * 0.5;
  const z0 = zc - len * 0.13;
  const z1 = zc + len * 0.13;
  // Low-poly bodies are a few big flat quads — there are no vertices mid-back,
  // so per-column tops read gaps as dips. Use the height of the upper vertices
  // of the mid-body instead: a high percentile ignores a lone spike or plate
  // ridge but lands on the real back of a flat-topped barrel.
  const ys: number[] = [];
  let maxY = -Infinity;
  for (let i = 0; i < pts.length; i += 3) {
    if (pts[i + 2] < z0 || pts[i + 2] > z1) continue;
    ys.push(pts[i + 1]);
    maxY = Math.max(maxY, pts[i + 1]);
  }
  if (!ys.length) return { y: height * 0.6, fwd: 0, halfW: 0.3, len };
  const upper = ys.filter((y) => y > maxY * 0.5).sort((p1, p2) => p1 - p2);
  const vertexY = upper[Math.min(upper.length - 1, Math.floor(upper.length * 0.7))];
  // prefer the real surface under the rider; the vertex percentile is the fallback
  const surfaceY = tris ? centerlineTop(tris, z0, z1) : null;
  const y = surfaceY !== null && surfaceY > maxY * 0.4 ? surfaceY : vertexY;
  // width where the body is actually solid (above the belly line)
  let wmin = Infinity;
  let wmax = -Infinity;
  for (let i = 0; i < pts.length; i += 3) {
    if (pts[i + 2] < z0 || pts[i + 2] > z1 || pts[i + 1] < y * 0.55) continue;
    wmin = Math.min(wmin, pts[i]);
    wmax = Math.max(wmax, pts[i]);
  }
  return { y, fwd: (z0 + z1) / 2, halfW: isFinite(wmin) ? (wmax - wmin) / 2 : 0.3, len };
}
