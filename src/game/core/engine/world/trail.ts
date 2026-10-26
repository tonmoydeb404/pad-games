/** Trail spline queries, road damage, jump kickers and prop colliders. */
import { clamp, fbm, smooth, TAU } from "../../noise";
import { SAMPLES, CELL, gridKey, KICK_H, KICK_RISE, KICK_FALL } from "../config/world-constants";
import type { JeepEngine } from "../jeep-engine";

export function trailInfo(this: JeepEngine, x: number, z: number): { dist: number; y: number; i: number; t: number; s: number } {
  const cx = Math.floor(x / CELL);
  const cz = Math.floor(z / CELL);
  const arr = this.trailGrid.get(gridKey(cx, cz));
  let best = 1e9;
  let bi = 0;
  if (arr) {
    for (let n = 0; n < arr.length; n++) {
      const i = arr[n];
      const p = this.trailPts[i];
      const dx = p.x - x;
      const dz = p.z - z;
      const d = dx * dx + dz * dz;
      if (d < best) {
        best = d;
        bi = i;
      }
    }
  } else {
    for (let i = 0; i < SAMPLES; i += 7) {
      const p = this.trailPts[i];
      const dx = p.x - x;
      const dz = p.z - z;
      const d = dx * dx + dz * dz;
      if (d < best) {
        best = d;
        bi = i;
      }
    }
  }
  this.tmpInfo.dist = Math.sqrt(best);
  this.tmpInfo.i = bi;
  // Bed height INTERPOLATED along the segment. The raw nearest-sample value
  // is a staircase (~1.2-unit steps): all four wheel probes then read the
  // same step, the sampled grade collapses to zero, and the jeep never
  // pitches on slopes. Central-difference along the tangent restores the
  // true local grade at the query point.
  const bp = this.trailPts[bi];
  const bt = this.trailTan[bi];
  const along = clamp((x - bp.x) * bt.x + (z - bp.z) * bt.z, -this.segLen, this.segLen);
  const yNext = this.trailPts[(bi + 1) % SAMPLES].y;
  const yPrev = this.trailPts[(bi - 1 + SAMPLES) % SAMPLES].y;
  this.tmpInfo.y = bp.y + ((yNext - yPrev) / (2 * this.segLen)) * along;
  this.tmpInfo.t = bi / SAMPLES;
  // fractional sample position along the trail (for kickers)
  this.tmpInfo.s = bi + along / this.segLen;
  return this.tmpInfo;
}

export function roadDamage(this: JeepEngine, x: number, z: number, t: number, dist: number): number {
  let d = 0;
  const across = dist;
  // shallow wheel ruts + mild washboard — a rideable track, not a wash-out
  const rut =
    Math.exp(-Math.pow((across - 1.55) / 0.75, 2)) * 0.5 +
    Math.exp(-Math.pow((across - 0.15) / 0.6, 2)) * 0.12;
  d -= rut * (0.14 + 0.1 * Math.sin(t * TAU * 17.0));
  d += fbm(x * 0.12, z * 0.12, 3) * 0.16;
  d += fbm(x * 0.42, z * 0.42, 2) * 0.06;
  const ph = fbm(x * 0.055 + 41, z * 0.055 - 17, 2);
  if (ph > 0.42) d -= (ph - 0.42) * 0.8;
  const rocky = clamp((t - 0.16) / 0.06, 0, 1) * clamp((0.3 - t) / 0.06, 0, 1);
  d += fbm(x * 0.3, z * 0.3, 3) * 0.34 * rocky;
  return d;
}

/** Height of the jump kickers at fractional trail position `s`, 0 elsewhere. */
export function kickHeight(this: JeepEngine, s: number): number {
  let h = 0;
  for (const k of this.kickers) {
    let u = (s - k) * this.segLen; // world units past the lip (negative = approach)
    if (u > SAMPLES * this.segLen * 0.5) u -= SAMPLES * this.segLen;
    else if (u < -SAMPLES * this.segLen * 0.5) u += SAMPLES * this.segLen;
    if (u <= -KICK_RISE || u >= KICK_FALL) continue;
    h += KICK_H * (u < 0 ? smooth((u + KICK_RISE) / KICK_RISE) : 1 - smooth(u / KICK_FALL));
  }
  return h;
}

/**
 * Choose kicker sites: the straightest, driest stretches near a few fixed
 * fractions of the lap (clear of the start line, bridge, ford and ponds).
 */
export function pickKickers(this: JeepEngine): void {
  const out: number[] = [];
  for (const f of [0.1, 0.37, 0.5, 0.79]) {
    const centre = Math.floor(f * SAMPLES);
    let best = -1;
    let bestCurve = 1e9;
    for (let i = centre - 40; i <= centre + 40; i += 2) {
      const idx = (i + SAMPLES) % SAMPLES;
      const p = this.trailPts[idx];
      if (this.nearWater(p.x, p.z, 1.9)) continue;
      // straightness over the run-up and landing (~±45 units)
      const a = this.trailTan[(idx - 38 + SAMPLES) % SAMPLES];
      const b = this.trailTan[(idx + 12) % SAMPLES];
      const curve = Math.hypot(a.x - b.x, a.z - b.z);
      if (curve < bestCurve) {
        bestCurve = curve;
        best = idx;
      }
    }
    if (best >= 0 && bestCurve < 0.35) out.push(best);
  }
  this.kickers = out;
}

/**
 * Register a solid obstacle with the physics world (streamed in/out around
 * the car — see PropStreamer). Round by default; pass `bx/bz` for a capsule
 * (fallen log). `height` is how far the solid part rises above its base: a
 * trunk is "tall" (the canopy above is NOT solid), a boulder is not — a jump
 * clears it.
 */
export function addCollider(
  this: JeepEngine,
  x: number,
  z: number,
  r: number,
  e = 0.4,
  o: { bx?: number; bz?: number; height?: number; y0?: number } = {},
): void {
  const y0 = o.y0 ?? this.groundHeight(x, z);
  const height = o.height ?? 40;
  const props = this.propStream;
  if (o.bx !== undefined && o.bz !== undefined) {
    const dx = o.bx - x;
    const dz = o.bz - z;
    const len = Math.hypot(dx, dz);
    props?.add({
      shape: { kind: "log", halfLen: len / 2, radius: r },
      x: (x + o.bx) / 2,
      y: y0 + height - r,
      z: (z + o.bz) / 2,
      rotY: Math.atan2(-dz, dx),
      e,
    });
    this.colliders.push({ x, z, r: r + 0.6 }, { x: o.bx, z: o.bz, r: r + 0.6 });
  } else if (height >= 20) {
    // trunk: a tall post rooted a little below the surface
    props?.add({ shape: { kind: "cylinder", halfHeight: 7, radius: r }, x, y: y0 + 6.5, z, e });
    this.colliders.push({ x, z, r });
  } else {
    props?.add({ shape: { kind: "ball", radius: r }, x, y: y0 + height - r, z, e });
    this.colliders.push({ x, z, r });
  }
}

/** Terrain height exactly as rendered (falls back to the analytic form). */
export function groundHeight(this: JeepEngine, x: number, z: number): number {
  return this.heightGrid ? this.heightGrid.sample(x, z) : this.terrainHeight(x, z);
}
