import type * as THREE from "three";

/**
 * Level crossings between two closed, arc-length-sampled loops (both may end
 * with a duplicated first point). Returns deduped crossing points.
 */
export function findCrossings(a: THREE.Vector3[], b: THREE.Vector3[]): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  const test = (p: { x: number; z: number }): boolean => {
    for (const q of out) if (Math.hypot(q.x - p.x, q.z - p.z) < 4) return false;
    return true;
  };
  const seg = (i: number, n: number) => (i + 1) % n;
  for (let i = 0; i < a.length; i++) {
    const a0 = a[i];
    const a1 = a[seg(i, a.length)];
    const ax = a1.x - a0.x;
    const az = a1.z - a0.z;
    const alen2 = ax * ax + az * az;
    if (alen2 < 1e-8) continue;
    for (let j = 0; j < b.length; j++) {
      const b0 = b[j];
      const b1 = b[seg(j, b.length)];
      const bx = b1.x - b0.x;
      const bz = b1.z - b0.z;
      // quick reject: either endpoint outside the other segment's disc
      const blen2 = bx * bx + bz * bz;
      if (blen2 < 1e-8) continue;
      const den = ax * bz - az * bx;
      if (Math.abs(den) < 1e-9) continue;
      const ex = b0.x - a0.x;
      const ez = b0.z - a0.z;
      const u = (ex * bz - ez * bx) / den;
      const v = (ex * az - ez * ax) / den;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const p = { x: a0.x + u * ax, z: a0.z + u * az };
      if (test(p)) out.push(p);
    }
  }
  return out;
}
