import { EYE_HEIGHT, PLAYER_HEIGHT, PLAYER_RADIUS } from "./constants";
import { MAP_BOXES } from "./map";
import type { Vec3 } from "./types";

/** Slab test. Returns entry distance along a unit-length `dir`, or null. */
export function rayBox(o: Vec3, d: Vec3, min: Vec3, max: Vec3, maxDist: number): number | null {
  let tmin = 0;
  let tmax = maxDist;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < min[i] || o[i] > max[i]) return null;
    } else {
      let t1 = (min[i] - o[i]) / d[i];
      let t2 = (max[i] - o[i]) / d[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

export function rayWorld(o: Vec3, d: Vec3, maxDist: number): number {
  let best = maxDist;
  for (const b of MAP_BOXES) {
    const t = rayBox(o, d, b.min, b.max, best);
    if (t !== null && t < best) best = t;
  }
  return best;
}

/** Ray vs a player's bounding box at feet position (x,y,z). */
export function rayPlayer(o: Vec3, d: Vec3, x: number, y: number, z: number, maxDist: number): number | null {
  return rayBox(o, d, [x - PLAYER_RADIUS, y, z - PLAYER_RADIUS], [x + PLAYER_RADIUS, y + PLAYER_HEIGHT, z + PLAYER_RADIUS], maxDist);
}

export function eyePos(x: number, y: number, z: number): Vec3 {
  return [x, y + EYE_HEIGHT, z];
}

export function aimDir(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}
