/** Procedural terrain height, surface type and water-body distance queries. */
import { RAIL_BED, RAIL_BLEND } from "../../../world/train";
import { clamp, fbm, lerp, smooth } from "../../noise";
import { ROAD_HALF, ROAD_BLEND, KICK_SHOULDER } from "../config/world-constants";
import type { JeepEngine } from "../jeep-engine";

export function baseTerrain(this: JeepEngine, x: number, z: number): number {
  let h = fbm(x * 0.0042, z * 0.0042, 4) * 26.0;
  h += fbm(x * 0.016, z * 0.016, 4) * 6.2;
  h += fbm(x * 0.07, z * 0.07, 3) * 1.1;
  const r = Math.hypot(x, z);
  h += Math.max(0, (r - 330) / 110) * 48;
  return h;
}

export function terrainHeight(this: JeepEngine, x: number, z: number): number {
  const info = this.trailInfo(x, z);
  const base = this.baseTerrain(x, z);
  let h: number;
  if (info.dist < ROAD_HALF) {
    h = info.y + this.roadDamage(x, z, info.t, info.dist);
  } else if (info.dist < ROAD_HALF + ROAD_BLEND) {
    // The bed ≈ the smoothed floor, so this blend is a long shallow
    // grassy berm (max grade stays far below 45°), not a retaining wall.
    const k = smooth((info.dist - ROAD_HALF) / ROAD_BLEND);
    const road = info.y + this.roadDamage(x, z, info.t, ROAD_HALF) * 0.6;
    h = lerp(road, base, k);
  } else {
    h = base;
  }
  // jump kickers ride the road bed, fading out just past its shoulder
  if (this.kickers.length > 0 && info.dist < ROAD_HALF + KICK_SHOULDER) {
    h += this.kickHeight(info.s) * (1 - smooth(clamp((info.dist - ROAD_HALF + 0.6) / (KICK_SHOULDER + 0.6), 0, 1)));
  }
  // Port Marin: town shelf + the paved access road (the road cuts the
  // terrace; the railway carve below keeps right of way at the crossing)
  h = this.city.carve(x, z, h);
  // railway bed: flat ballast on a smoothed embankment, level with the trail
  // where the two cross — the Jungle Express has right of way
  if (this.rail) {
    const ri = this.rail.info(x, z, this.tmpRailInfo);
    if (ri.dist < RAIL_BED + RAIL_BLEND) {
      h = lerp(ri.y, h, smooth(clamp((ri.dist - RAIL_BED) / RAIL_BLEND, 0, 1)));
    }
  }
  // carve the stream ford + pond bowls (ponds shallower than the ford)
  const sd = Math.hypot(x - this.stream.c.x, z - this.stream.c.z);
  if (sd < this.stream.r) h -= smooth(1 - sd / this.stream.r) * 1.35;
  for (const p of this.ponds) {
    const pd = Math.hypot(x - p.x, z - p.z);
    if (pd < p.r) h -= smooth(1 - pd / p.r) * 1.1;
  }
  return isFinite(h) ? h : 0;
}

export function surfaceAt(this: JeepEngine, x: number, z: number): string {
  const info = this.trailInfo(x, z);
  let inWater = false;
  let nearWater = false;
  const check = (bx: number, bz: number, br: number): void => {
    const sd = Math.hypot(x - bx, z - bz);
    if (sd < br * 0.55) inWater = true;
    else if (sd < br) nearWater = true;
  };
  check(this.stream.c.x, this.stream.c.z, this.stream.r);
  for (const p of this.ponds) check(p.x, p.z, p.r);
  if (inWater) return "water";
  // Port Marin's pavement: grippy, fast, quiet
  if (this.city.asphaltAt(x, z)) return "asphalt";
  // railway ballast: chunky gravel, a gentle rumble strip
  if (this.rail.dist(x, z) < RAIL_BED + 0.9) return "ballast";
  if (info.dist > ROAD_HALF + 2.5) return "grass";
  const rocky = info.t > 0.16 && info.t < 0.3;
  if (rocky) return "rock";
  const wet = fbm(x * 0.03 + 7, z * 0.03 - 3, 2);
  if (wet > 0.12 || nearWater) return "mud";
  return "dirt";
}

/** Distance to the nearest water body (stream or pond). */
export function waterDist(this: JeepEngine, x: number, z: number): number {
  let d = Math.hypot(x - this.stream.c.x, z - this.stream.c.z);
  for (const p of this.ponds) {
    const pd = Math.hypot(x - p.x, z - p.z);
    if (pd < d) d = pd;
  }
  return d;
}

/** True when the point sits within `frac` × radius of any water body. */
export function nearWater(this: JeepEngine, x: number, z: number, frac = 1): boolean {
  if (Math.hypot(x - this.stream.c.x, z - this.stream.c.z) < this.stream.r * frac) return true;
  for (const p of this.ponds) {
    if (Math.hypot(x - p.x, z - p.z) < p.r * frac) return true;
  }
  return false;
}
