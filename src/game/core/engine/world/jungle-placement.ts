/** Jungle placement helpers: terrain-fit picker with min-spacing grid, and the per-model splitter. */
import type { PackModel } from "../../assets";
import { TAU } from "../../noise";
import { BOUND, CELL, gridKey } from "../config/world-constants";
import type { JeepEngine } from "../jeep-engine";

/** One jungle plant placement: position, placement scale and yaw. */
export type Plant = { x: number; z: number; y: number; sc: number; rot: number };

export type Picker = ReturnType<typeof createPicker>;
export type Splitter = ReturnType<typeof createSplitter>;

/** Terrain-fit (slope rejection) + min-spacing picker over the playfield. */
export function createPicker(eng: JeepEngine, rnd: () => number) {
  const placed = new Map<number, { x: number; z: number; r: number }[]>();
  const spaceFree = (x: number, z: number, r: number): boolean => {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let ox = -1; ox <= 1; ox++)
      for (let oz = -1; oz <= 1; oz++) {
        const arr = placed.get(gridKey(cx + ox, cz + oz));
        if (!arr) continue;
        for (const p of arr) if (Math.hypot(x - p.x, z - p.z) < r + p.r) return false;
      }
    return true;
  };
  const spaceTake = (x: number, z: number, r: number): void => {
    const k = gridKey(Math.floor(x / CELL), Math.floor(z / CELL));
    let arr = placed.get(k);
    if (!arr) {
      arr = [];
      placed.set(k, arr);
    }
    arr.push({ x, z, r });
  };
  const slopeAt = (x: number, z: number): number => {
    const e = 1.8;
    const gx = eng.terrainHeight(x + e, z) - eng.terrainHeight(x - e, z);
    const gz = eng.terrainHeight(x, z + e) - eng.terrainHeight(x, z - e);
    return Math.hypot(gx, gz) / (2 * e);
  };
  const pick = (
    minD: number,
    maxD: number,
    maxR: number,
    opts: { space?: number; slope?: number; railMin?: number } = {},
  ) => {
    for (let tries = 0; tries < 40; tries++) {
      const a = rnd() * TAU;
      const r = Math.sqrt(rnd()) * (maxR || BOUND - 6);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const info = eng.trailInfo(x, z);
      if (info.dist < minD || info.dist > maxD) continue;
      if (eng.rail.dist(x, z) < (opts.railMin ?? 9.5)) continue; // keep the railway clear
      if (eng.city.exclusion(x, z)) continue; // Port Marin and its road stay clear
      if (eng.nearWater(x, z, 0.9)) continue;
      if (opts.slope !== undefined && slopeAt(x, z) > opts.slope) continue;
      if (opts.space !== undefined) {
        if (!spaceFree(x, z, opts.space)) continue;
        spaceTake(x, z, opts.space);
      }
      return { x, z, y: eng.terrainHeight(x, z), dist: info.dist };
    }
    return null;
  };
  return pick;
}

/** Splits placements across a pack's model variants, optionally adding trunk colliders. */
export function createSplitter(e: JeepEngine) {
  /** `solid` = restitution; adds a trunk-sized collider per instance. */
  return (data: Plant[], models: PackModel[], solid?: number): void => {
    if (models.length === 0) return;
    if (solid !== undefined) {
      // Only the TRUNK is solid — measured from the model, at its real
      // (possibly bent-over) root position, not the canopy footprint.
      data.forEach((t, k) => {
        const tr = models[k % models.length].trunk ?? { x: 0, z: 0, r: 0.05 };
        const c = Math.cos(t.rot);
        const sn = Math.sin(t.rot);
        e.addCollider(
          t.x + (tr.x * c + tr.z * sn) * t.sc,
          t.z + (-tr.x * sn + tr.z * c) * t.sc,
          tr.r * t.sc + 0.08,
          solid,
          { y0: t.y },
        );
      });
    }
    models.forEach((model, mi) => {
      e.scatterPack(
        model,
        data.filter((_, k) => k % models.length === mi).map((t) => ({
          x: t.x,
          y: t.y,
          z: t.z,
          rot: t.rot,
          scale: t.sc,
        })),
        { sway: 0.028, cast: true },
      );
    });
};
}
