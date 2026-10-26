import type { CityBuilding, CityProp } from "./types";

/** What the layout passes need from the site: the shelf height + transforms. */
export interface TownCtx {
  plateauY: number;
  toWorld(u: number, v: number): { x: number; z: number };
  props: CityProp[];
  buildings: CityBuilding[];
}

/** Yaw so a kit −Z front faces `f`. */
export const faceYaw = (fx: number, fz: number): number => Math.atan2(-fx, -fz);
/** Yaw so the kit +X axis points along `d`. */
export const xAxisYaw = (dx: number, dz: number): number => Math.atan2(-dz, dx);

/** Place a prop at city-local (u, v) (default height: the shelf). */
export function addProp(
  ctx: TownCtx,
  model: string,
  dir: "town" | "roads",
  u: number,
  v: number,
  yaw: number,
  cast: boolean,
  y = ctx.plateauY,
): void {
  const w = ctx.toWorld(u, v);
  ctx.props.push({ model, dir, x: w.x, y, z: w.z, yaw, cast });
}
