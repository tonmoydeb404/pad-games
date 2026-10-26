/**
 * Deterministic stand-in world for the Port Marin tests — a rim bowl like the
 * engine's baseTerrain, a circular trail and a circular railway. The real
 * engine feeds CitySite the same query shapes (CityHooks), so a green run
 * means the geometry contracts hold in the game.
 */
import { smooth } from "../../core/noise";
import { CitySite } from "./city-site";
import type { CityTile } from "./types";

/** Rim bowl: flat jungle floor inside r=330, rising +48 by r=440. */
export const base = (x: number, z: number): number =>
  Math.max(0, (Math.hypot(x, z) - 330) / 110) * 48 + 3 * Math.sin(x * 0.011) * Math.cos(z * 0.013);

export const TRAIL_R = 250;
export const TRAIL_LIFT = 0.9;
export const RAIL_R = 315;
/** The real rail bed rides a heavily smoothed terrain — a mild lift here. */
export const RAIL_Y = 2.4;

export const trailBed = (x: number, z: number): number => base(x, z) + TRAIL_LIFT;

export function makeSite(): CitySite {
  // junction on the stand-in trail, south-east (like the engine's pick)
  const a = (-39 * Math.PI) / 180;
  const jx = Math.cos(a) * TRAIL_R;
  const jz = Math.sin(a) * TRAIL_R;
  return CitySite.build({
    base,
    junction: { x: jx, z: jz, y: trailBed(jx, jz), tx: -Math.sin(a), tz: Math.cos(a) },
    trailNear: (x, z) => {
      const d = Math.abs(Math.hypot(x, z) - TRAIL_R);
      return d < 18 ? { y: trailBed(x, z), w: smooth(1 - d / 18) } : null;
    },
    railNear: (x, z) => {
      const d = Math.abs(Math.hypot(x, z) - RAIL_R);
      return d < 22 ? { y: RAIL_Y, w: smooth(1 - d / 22) } : null;
    },
  });
}

export const site = makeSite();

/** Rotate a kit-space direction by a tile's resolved yaw. */
const rot = (x: number, z: number, yaw: number): [number, number] => [
  x * Math.cos(yaw) + z * Math.sin(yaw),
  -x * Math.sin(yaw) + z * Math.cos(yaw),
];

/** The faces of a tile that must meet a neighbour's face. */
export function tileLinks(t: CityTile): [number, number][] {
  switch (t.model) {
    case "road-crossroad":
      return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, z]) => rot(x, z, t.yaw));
    case "road-bend":
      return [[1, 0], [0, -1]].map(([x, z]) => rot(x, z, t.yaw));
    case "road-end":
      return [[1, 0]].map(([x, z]) => rot(x, z, t.yaw));
    default: // straights + the gate zebra
      return [[1, 0], [-1, 0]].map(([x, z]) => rot(x, z, t.yaw));
  }
}
