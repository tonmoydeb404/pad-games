import * as THREE from "three";
import { clamp, smooth } from "../../core/noise";
import { CELL, ROAD_SAMPLES, gridKey } from "./constants";
import type { CityHooks } from "./types";

/** The sampled access road: spline points, tangents, spacing and spatial hash. */
export interface RoadData {
  pts: THREE.Vector3[];
  tan: THREE.Vector3[];
  segLen: number;
  length: number;
  grid: Map<number, number[]>;
  /** Where the road crosses the railway (level crossing) + its arc distance. */
  crossing: { x: number; z: number };
  crossingArc: number;
}

/**
 * The access road: a Catmull-Rom from the trail junction to the town gate
 * (local (0, −44), the outer face of the gate-arm zebra tile). Bed heights
 * are the smoothed base terrain — the climb over the rim stays, the noise
 * goes — pulled level with the trail at the mouth, the railway at the
 * level crossing, and the shelf at the gate.
 */
export function buildAccessRoad(
  hooks: CityHooks,
  gate: { x: number; z: number },
  plateauY: number,
): RoadData {
  const j = hooks.junction;
  const dx = gate.x - j.x;
  const dz = gate.z - j.z;
  const len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len;
  const nz = dx / len;
  const lerpPt = (t: number, side: number): THREE.Vector3 =>
    new THREE.Vector3(j.x + dx * t + nx * side, 0, j.z + dz * t + nz * side);
  // gentle S — with 8-unit rigid tiles the road must sweep, not wiggle
  const ctrl = [
    new THREE.Vector3(j.x, 0, j.z),
    lerpPt(0.25, 3.5),
    lerpPt(0.55, -3),
    lerpPt(0.8, 1.5),
    new THREE.Vector3(gate.x, 0, gate.z),
  ];

  const curve = new THREE.CatmullRomCurve3(ctrl, false, "catmullrom", 0.5);
  const pts = curve.getSpacedPoints(ROAD_SAMPLES); // open curve: both ends kept
  const N = pts.length;
  const segLen = curve.getLength() / (N - 1);
  const length = segLen * (N - 1);
  const tan: THREE.Vector3[] = [];
  const grid = new Map<number, number[]>();

  // bed: wide smoothing of the base (grades a road can hold), then pulls
  const WIN = 34;
  const raw = new Float32Array(N);
  for (let i = 0; i < N; i++) raw[i] = hooks.base(pts[i].x, pts[i].z) + 0.15;
  const y = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let k = -WIN; k <= WIN; k++) s += raw[clamp(i + k, 0, N - 1)];
    y[i] = s / (2 * WIN + 1);
  }
  let bestRailW = 0;
  let bestRailI = 0;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const near = hooks.trailNear(pts[i].x, pts[i].z);
    if (near) y[i] += (near.y - y[i]) * near.w;
    const rail = hooks.railNear(pts[i].x, pts[i].z);
    if (rail) {
      y[i] += (rail.y - y[i]) * rail.w;
      if (rail.w > bestRailW) {
        bestRailW = rail.w;
        bestRailI = i;
      }
    }
    // into town: meet the shelf before the gate tile
    y[i] += (plateauY - y[i]) * smooth(clamp((t - 0.68) / 0.26, 0, 1));
  }
  // grade limiter: pulls target beds that can sit a few units off the local
  // profile (the rail on its embankment, the shelf in its hollow) — cap the
  // slope at ~0.33 (18°) sample-to-sample, pinned at both ends so the mouth
  // stays glued to the trail and the gate to the shelf
  {
    const MAXG = 0.33;
    const step = MAXG * segLen;
    for (let i = 1; i < N; i++) y[i] = clamp(y[i], y[i - 1] - step, y[i - 1] + step);
    for (let i = N - 2; i >= 0; i--) y[i] = clamp(y[i], y[i + 1] - step, y[i + 1] + step);
  }
  // re-pin the level crossing: the sleepers must kiss the asphalt, so the
  // crossing samples land exactly on the rail bed (the limiter may have
  // shaved them toward the profile); a 5-tap settles the joint
  {
    const rail = hooks.railNear(pts[bestRailI].x, pts[bestRailI].z);
    if (rail) {
      for (let i = 0; i < N; i++) {
        const d = Math.abs(i - bestRailI) * segLen;
        if (d <= 2.6) y[i] = y[i] + (rail.y - y[i]) * (1 - d / 2.6);
      }
    }
  }
  // settle pull kinks (5-tap)
  const y2 = Float32Array.from(y);
  for (let i = 2; i < N - 2; i++) y[i] = (y2[i - 2] + 4 * y2[i - 1] + 6 * y2[i] + 4 * y2[i + 1] + y2[i + 2]) / 16;

  for (let i = 0; i < N; i++) {
    pts[i].y = y[i];
    tan.push(
      new THREE.Vector3(
        pts[Math.min(N - 1, i + 1)].x - pts[i].x,
        0,
        pts[Math.min(N - 1, i + 1)].z - pts[i].z,
      ).normalize(),
    );
    // spatial hash for O(1) nearest-sample queries
    const cx = Math.floor(pts[i].x / CELL);
    const cz = Math.floor(pts[i].z / CELL);
    for (let ox = -1; ox <= 1; ox++)
      for (let oz = -1; oz <= 1; oz++) {
        const k = gridKey(cx + ox, cz + oz);
        let arr = grid.get(k);
        if (!arr) grid.set(k, (arr = []));
        arr.push(i);
      }
  }
  const cp = pts[bestRailI];
  return { pts, tan, segLen, length, grid, crossing: { x: cp.x, z: cp.z }, crossingArc: bestRailI * segLen };
}
