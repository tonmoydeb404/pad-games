import { TAU } from "../../core/noise";
import { RAIL_RING } from "./constants";

export function buildRailCtrl(): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k < RAIL_RING.points; k++) {
    const a = (k / RAIL_RING.points) * TAU;
    let r = RAIL_RING.base;
    for (const dip of RAIL_RING.dips) {
      let dA = a - dip.at;
      dA = ((dA + Math.PI) % TAU + TAU) % TAU - Math.PI; // wrap to [-π, π)
      r -= dip.depth * Math.exp(-((dA / dip.width) ** 2));
    }
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}
