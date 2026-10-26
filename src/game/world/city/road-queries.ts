import { clamp } from "../../core/noise";
import type { RoadData } from "./access-road";
import { CELL, TILE, gridKey } from "./constants";
import type { RoadInfo, RoadPiece, RoadPose } from "./types";

/** Position + tangent (with grade, `ty`) at arc distance `d` along the road. */
export function roadPoseAt(road: RoadData, d: number): RoadPose {
  const { pts, tan, segLen } = road;
  const f = clamp(d / segLen, 0, pts.length - 1);
  const i0 = Math.min(pts.length - 1, Math.floor(f));
  const i1 = Math.min(pts.length - 1, i0 + 1);
  const k = f - i0;
  const a = pts[i0];
  const b = pts[i1];
  const t = tan[i0];
  // bed grade from the two flanking samples (central difference)
  const iPrev = Math.max(0, i0 - 1);
  const iNext = Math.min(pts.length - 1, i0 + 1);
  const ty = (pts[iNext].y - pts[iPrev].y) / Math.max(1e-4, (iNext - iPrev) * segLen);
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    z: a.z + (b.z - a.z) * k,
    tx: t.x,
    ty: clamp(ty, -0.7, 0.7),
    tz: t.z,
  };
}

/** Nearest access-road centreline point (dist + interpolated bed y). */
export function roadInfoAt(road: RoadData, x: number, z: number, out: RoadInfo): RoadInfo {
  const { pts, tan, segLen } = road;
  const cx = Math.floor(x / CELL);
  const cz = Math.floor(z / CELL);
  const arr = road.grid.get(gridKey(cx, cz));
  let best = 1e9;
  let bi = 0;
  if (arr) {
    for (let n = 0; n < arr.length; n++) {
      const p = pts[arr[n]];
      const dx = p.x - x;
      const dz = p.z - z;
      const d = dx * dx + dz * dz;
      if (d < best) {
        best = d;
        bi = arr[n];
      }
    }
  } else {
    for (let i = 0; i < pts.length; i += 6) {
      const p = pts[i];
      const dx = p.x - x;
      const dz = p.z - z;
      const d = dx * dx + dz * dz;
      if (d < best) {
        best = d;
        bi = i;
      }
    }
  }
  const p = pts[bi];
  const t = tan[bi];
  const N = pts.length;
  const along = clamp((x - p.x) * t.x + (z - p.z) * t.z, -segLen, segLen);
  const px = p.x + t.x * along;
  const pz = p.z + t.z * along;
  out.dist = Math.hypot(x - px, z - pz);
  // bed height interpolated along the segment (central difference)
  const yNext = pts[Math.min(N - 1, bi + 1)].y;
  const yPrev = pts[Math.max(0, bi - 1)].y;
  out.y = p.y + ((yNext - yPrev) / (2 * segLen)) * along;
  return out;
}

/**
 * Pave it: rigid straights laid tangent to the spline (with grade roll so
 * they hug climbs), train-track style.
 */
export function pavePieces(road: RoadData): RoadPiece[] {
  const out: RoadPiece[] = [];
  const spacing = TILE * 0.99;
  for (let d = 1.5; d < road.length - 1.5; d += spacing) {
    const pose = roadPoseAt(road, d);
    out.push({
      x: pose.x,
      y: pose.y + 0.02,
      z: pose.z,
      yaw: Math.atan2(-pose.tz, pose.tx),
      roll: Math.atan(pose.ty),
    });
  }
  return out;
}
