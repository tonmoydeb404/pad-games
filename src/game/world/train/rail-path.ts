import * as THREE from "three";
import { clamp, TAU } from "../../core/noise";
import { CELL, RAIL_SAMPLES, gridKey } from "./constants";
import { buildRailCtrl } from "./rail-ctrl";
import type { RailInfo, RailNear, RailPose } from "./types";

export class RailPath {
  private readonly grid: Map<number, number[]>;
  private readonly tmpInfo: RailInfo = { dist: 0, y: 0, i: 0 };

  private constructor(
    readonly pts: THREE.Vector3[],
    readonly tan: THREE.Vector3[],
    readonly segLen: number,
    readonly length: number,
  ) {
    // spatial hash for O(1) nearest-sample queries
    this.grid = new Map();
    for (let i = 0; i < pts.length; i++) {
      const cx = Math.floor(pts[i].x / CELL);
      const cz = Math.floor(pts[i].z / CELL);
      for (let ox = -1; ox <= 1; ox++)
        for (let oz = -1; oz <= 1; oz++) {
          const k = gridKey(cx + ox, cz + oz);
          let arr = this.grid.get(k);
          if (!arr) this.grid.set(k, (arr = []));
          arr.push(i);
        }
    }
  }

  /**
   * @param base  terrain height field the bed is smoothed from
   * @param near  another bed to stay level with (the trail at crossings)
   */
  static build(base: (x: number, z: number) => number, near?: (x: number, z: number) => RailNear | null): RailPath {
    const ctrl = buildRailCtrl().map((p) => new THREE.Vector3(p[0], 0, p[1]));
    const curve = new THREE.CatmullRomCurve3(ctrl, true, "catmullrom", 0.5);
    const pts = curve.getSpacedPoints(RAIL_SAMPLES);
    pts.length = RAIL_SAMPLES; // getSpacedPoints repeats the first point
    const segLen = Math.max(0.2, pts[0].distanceTo(pts[1]));

    // Bed profile: wide smoothing of the base terrain (grades trains can
    // climb), plus gentle periodic harmonics so the line rolls. Periodic in
    // t so the closed loop stays seamless.
    const WIN = 110; // ≈ ±250 world units of smoothing
    const raw = new Float32Array(RAIL_SAMPLES);
    for (let i = 0; i < RAIL_SAMPLES; i++) raw[i] = base(pts[i].x, pts[i].z) + 0.9;
    for (let i = 0; i < RAIL_SAMPLES; i++) {
      let s = 0;
      for (let k = -WIN; k <= WIN; k++) s += raw[(i + k + RAIL_SAMPLES) % RAIL_SAMPLES];
      const t = i / RAIL_SAMPLES;
      const harm = 2.2 * Math.sin(TAU * 3 * t + 0.9) + 1.4 * Math.sin(TAU * 7 * t + 2.6);
      pts[i].y = s / (2 * WIN + 1) + harm;
    }
    // stay level with the trail through the crossings
    if (near) {
      for (let i = 0; i < RAIL_SAMPLES; i++) {
        const n = near(pts[i].x, pts[i].z);
        if (n) pts[i].y = pts[i].y + (n.y - pts[i].y) * n.w;
      }
    }

    // horizontal tangents
    const tan: THREE.Vector3[] = [];
    for (let i = 0; i < RAIL_SAMPLES; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % RAIL_SAMPLES];
      tan.push(new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize());
    }
    return new RailPath(pts, tan, segLen, segLen * RAIL_SAMPLES);
  }

  /** Nearest centreline point (dist + interpolated bed height) — no allocs. */
  info(x: number, z: number, out: RailInfo = this.tmpInfo): RailInfo {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    const arr = this.grid.get(gridKey(cx, cz));
    let best = 1e9;
    let bi = 0;
    if (arr) {
      for (let n = 0; n < arr.length; n++) {
        const p = this.pts[arr[n]];
        const dx = p.x - x;
        const dz = p.z - z;
        const d = dx * dx + dz * dz;
        if (d < best) {
          best = d;
          bi = arr[n];
        }
      }
    } else {
      for (let i = 0; i < RAIL_SAMPLES; i += 5) {
        const p = this.pts[i];
        const dx = p.x - x;
        const dz = p.z - z;
        const d = dx * dx + dz * dz;
        if (d < best) {
          best = d;
          bi = i;
        }
      }
    }
    const p = this.pts[bi];
    const t = this.tan[bi];
    const along = clamp((x - p.x) * t.x + (z - p.z) * t.z, -this.segLen, this.segLen);
    const px = p.x + t.x * along;
    const pz = p.z + t.z * along;
    out.dist = Math.hypot(x - px, z - pz);
    out.i = bi;
    // bed height interpolated along the segment (central difference, like the trail)
    const yNext = this.pts[(bi + 1) % RAIL_SAMPLES].y;
    const yPrev = this.pts[(bi - 1 + RAIL_SAMPLES) % RAIL_SAMPLES].y;
    out.y = p.y + ((yNext - yPrev) / (2 * this.segLen)) * along;
    return out;
  }

  dist(x: number, z: number): number {
    return this.info(x, z, this.tmpInfo).dist;
  }

  private samplePos(d: number, out: THREE.Vector3): THREE.Vector3 {
    const f = ((d % this.length) + this.length) % this.length;
    const i0 = Math.floor(f / this.segLen) % RAIL_SAMPLES;
    const k = f / this.segLen - Math.floor(f / this.segLen);
    const a = this.pts[i0];
    const b = this.pts[(i0 + 1) % RAIL_SAMPLES];
    return out.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
  }

  /** Pose at arc distance `d` (wraps). Tangent is the 3D chord over ±2.5u. */
  pose(d: number, out: RailPose): RailPose {
    this.samplePos(d, this.tmpA);
    out.x = this.tmpA.x;
    out.y = this.tmpA.y;
    out.z = this.tmpA.z;
    this.samplePos(d - 2.5, this.tmpB);
    this.samplePos(d + 2.5, this.tmpC);
    const tx = this.tmpC.x - this.tmpB.x;
    const ty = this.tmpC.y - this.tmpB.y;
    const tz = this.tmpC.z - this.tmpB.z;
    const l = Math.hypot(tx, ty, tz) || 1;
    out.tx = tx / l;
    out.ty = ty / l;
    out.tz = tz / l;
    return out;
  }

  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpC = new THREE.Vector3();
}
