import { RING, TILE } from "./constants";
import { resolveTileYaw } from "./tile-yaw";
import type { CityTile } from "./types";

/**
 * Ring road at ±RING with cross streets on the axes, three cul-de-sac
 * spurs (the fourth, south, is the gate arm the access road feeds) and the
 * gate zebra. Each piece is rotated onto the faces the plan requires.
 */
export function layoutTiles(): CityTile[] {
  const tiles: CityTile[] = [];
  const LINES = [-RING, 0, RING];

  const addTile = (model: string, u: number, v: number, want: [number, number][]): void => {
    tiles.push({ model, u, v, yaw: resolveTileYaw(model, want) });
  };
  const NS: [number, number][] = [
    [0, 1],
    [0, -1],
  ];
  const EW: [number, number][] = [
    [1, 0],
    [-1, 0],
  ];
  const ALL: [number, number][] = [...NS, ...EW];

  for (const u of LINES) {
    for (let v = -RING; v <= RING; v += TILE) {
      const corner = Math.abs(u) === RING && Math.abs(v) === RING;
      if (corner) {
        // bend joining the two inward street ends at this corner
        addTile("road-bend", u, v, [
          [-Math.sign(u), 0],
          [0, -Math.sign(v)],
        ]);
      } else if (v === 0 || Math.abs(v) === RING) {
        // true intersection (u is already on a grid line here)
        addTile("road-crossroad", u, v, ALL);
      } else {
        addTile("road-straight", u, v, NS);
      }
    }
  }
  for (const v of LINES) {
    for (let u = -RING + TILE; u <= RING - TILE; u += TILE) {
      if (u === 0) continue; // intersections already laid by the N-S pass
      addTile("road-straight", u, v, EW);
    }
  }
  // cul-de-sac spurs off three ring crossroads (south = the gate arm)
  const spur = (su: number, sv: number, du: number, dv: number): void => {
    addTile("road-straight", su + du * TILE, sv + dv * TILE, du !== 0 ? EW : NS);
    addTile("road-end", su + du * 2 * TILE, sv + dv * 2 * TILE, [[-du, -dv]]);
  };
  spur(RING, 0, 1, 0);
  spur(-RING, 0, -1, 0);
  spur(0, RING, 0, 1);
  // the gate arm: zebra crossing, then the access road takes over
  addTile("road-crossing", 0, -RING - TILE, NS);
  return tiles;
}
