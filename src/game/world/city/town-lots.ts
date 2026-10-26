import { clamp, mulberry, TAU } from "../../core/noise";
import { TILE } from "./constants";
import { BUILDING_DIMS } from "./kit-data";
import { addProp, faceYaw, xAxisYaw, type TownCtx } from "./placement";

/**
 * 20 building lots with fenced yards: two houses per interior quadrant
 * fronting the ring streets, side strips outside the ring and four outer
 * corners. Deterministic via mulberry(7) — the tests pin the results.
 */
export function layoutLots(ctx: TownCtx): void {
  const rnd = mulberry(7);
  const prop = (
    model: string,
    dir: "town" | "roads",
    u: number,
    v: number,
    yaw: number,
    cast: boolean,
  ): void => addProp(ctx, model, dir, u, v, yaw, cast);

  // --- building lots ---------------------------------------------------
  // [u, v, face] — face points from the lot toward its street.
  const F = 0.7071;
  const LOTS: [number, number, number, number][] = [
    // interior quadrants — two houses each, fronting the ring streets
    [13, 22, 0, 1], [22, 13, 1, 0],
    [-13, 22, 0, 1], [-22, 13, -1, 0],
    [13, -22, 0, -1], [22, -13, 1, 0],
    [-13, -22, 0, -1], [-22, -13, -1, 0],
    // side strips outside the ring
    [46, 14, -1, 0], [46, -14, -1, 0],
    [-46, 14, 1, 0], [-46, -14, 1, 0],
    [14, 46, 0, -1], [-14, 46, 0, -1],
    [14, -46, 0, 1], [-14, -46, 0, 1],
    // outer corners, facing the ring corner
    [46, 46, -F, -F], [-46, 46, F, -F],
    [46, -46, -F, F], [-46, -46, F, F],
  ];

  // deterministic shuffle of the building types
  const types = Object.keys(BUILDING_DIMS);
  for (let i = types.length - 1; i > 0; i--) {
    const k = Math.floor(rnd() * (i + 1));
    [types[i], types[k]] = [types[k], types[i]];
  }

  LOTS.forEach(([u, v, fx, fz], lot) => {
    const model = types[lot % types.length];
    const [w, d, h] = BUILDING_DIMS[model];
    const yaw = faceYaw(fx, fz);
    const w0 = ctx.toWorld(u, v);

    // collision: axis-aligned houses keep their rotated AABB; the four
    // diagonal corner houses collide as the rotated box itself
    const diagonal = Math.abs(fx) > 0.5 && Math.abs(fz) > 0.5;
    const c = Math.abs(Math.cos(yaw));
    const s = Math.abs(Math.sin(yaw));
    const hw = (w / 2) * TILE;
    const hd = (d / 2) * TILE;
    ctx.buildings.push({
      model,
      x: w0.x,
      y: ctx.plateauY,
      z: w0.z,
      yaw,
      hx: diagonal ? hw : c * hw + s * hd,
      hz: diagonal ? hd : s * hw + c * hd,
      rotY: diagonal ? yaw : 0,
      colH: clamp((h * TILE) / 2, 2.6, 3.4),
    });

    // front path: two slabs from the door toward the street
    const faceDist = (diagonal ? (hw + hd) * 0.9 : Math.max(hw, hd)) + 1.6;
    for (let k = 0; k < 2; k++) {
      prop("path-long", "town", u + fx * (faceDist + 1.8 * k), v + fz * (faceDist + 1.8 * k), Math.atan2(fx, fz), false);
    }
    // planter by the path, tree in the back yard
    const px = -fz;
    const pz = fx;
    prop("planter", "town", u + fx * faceDist + px * 2.2, v + fz * faceDist + pz * 2.2, yaw + Math.PI / 2, true);
    prop(rnd() < 0.5 ? "tree-large" : "tree-small", "town", u - fx * (faceDist + 4.5) + px * 3.5, v - fz * (faceDist + 4.5) + pz * 3.5, rnd() * TAU, true);

    // back-yard fence run: two segments parallel behind the house, far
    // from every street band (side fences crossed streets on inner lots)
    const bx = u - fx * (hd + 6.5);
    const bz = v - fz * (hd + 6.5);
    const fyaw = xAxisYaw(px, pz);
    prop("fence-1x2", "town", bx - px * 3.5, bz - pz * 3.5, fyaw, true);
    prop("fence-1x2", "town", bx + px * 3.5, bz + pz * 3.5, fyaw, true);

    // a little street life
    if (lot % 7 === 3) {
      prop("construction-cone", "roads", u + fx * (faceDist + 4) + px * 1.2, v + fz * (faceDist + 4) + pz * 1.2, rnd() * TAU, true);
      prop("construction-cone", "roads", u + fx * (faceDist + 5.4) - px * 1.2, v + fz * (faceDist + 5.4) - pz * 1.2, rnd() * TAU, true);
    }
    if (lot === 5) prop("dumpster", "roads", u + px * (hw + 3.6), v + pz * (hw + 3.6), yaw + Math.PI, true);
  });
}
