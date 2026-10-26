import { TILE_LINKS } from "./kit-data";

/** Rotate a kit-space direction by `yaw` about Y (three.js convention). */
function rotDir(x: number, z: number, yaw: number): [number, number] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [x * c + z * s, -x * s + z * c];
}

/**
 * Find the quarter-turn that lines a piece's connection set up with the
 * faces the street plan requires. Throws when nothing fits — a layout bug,
 * not a runtime condition.
 */
export function resolveTileYaw(model: string, want: [number, number][]): number {
  const links = TILE_LINKS[model];
  if (!links) throw new Error(`no connection table for ${model}`);
  // quarter-turn rotations pick up ~1e-16 epsilon and -0 — quantize
  const q = (v: number): number => Number(v.toFixed(4)) + 0;
  const key = (dirs: [number, number][]): string =>
    dirs.map(([x, z]) => `${q(x)},${q(z)}`)
      .sort()
      .join("|");
  const wantKey = key(want);
  for (let k = 0; k < 4; k++) {
    const yaw = (k * Math.PI) / 2;
    if (key(links.map(([x, z]) => rotDir(x, z, yaw))) === wantKey) return yaw;
  }
  throw new Error(`${model} cannot face [${wantKey}]`);
}
