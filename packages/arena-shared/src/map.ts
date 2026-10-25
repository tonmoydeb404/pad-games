import type { Box, Vec3 } from "./types";

/**
 * The dungeon is authored as a tile grid — one source of truth that generates
 * the render placements (MAP_TILES), the collision boxes (MAP_BOXES), and the
 * prop/pickup/decor tables. TILE world units per cell; models from the Kenney
 * Mini Dungeon kit are 1-unit modules scaled 2× to fill a tile.
 *
 * Legend:
 *   `#` wall          `g` gate (window, solid)   `.` floor
 *   `o` wall-opening (doorway)                    `c` column
 *   `d` dais block (0.9 high, jumpable)           `s` stairs (ascend toward the dais)
 *   `h` half-wall cover (1.1 high, jumpable)      `r` rocks (1.0 high, jumpable)
 *
 * Layout: central hall with a 2×2 dais + four stairs, an open field around it
 * (rows 9–14), four quadrant rooms, and north/south galleries linking them.
 */
export const GRID: string[] = [
  "########################",
  "####gg###......###gg####",
  "##......#......#......##",
  "##......#......#......##",
  "##......o......o......##",
  "##......o......o......##",
  "##......#......#......##",
  "##......#......#......##",
  "####oo###......###oo####",
  "#......r........r......#",
  "#.........cssc.........#",
  "#....h....sdds....h....#",
  "#....h....sdds....h....#",
  "#.........cssc.........#",
  "#......r........r......#",
  "####oo###......###oo####",
  "##......#......#......##",
  "##......#......#......##",
  "##......o......o......##",
  "##......o......o......##",
  "##......#......#......##",
  "##......#......#......##",
  "####gg###......###gg####",
  "########################",
];

export const TILE = 2;
export const GRID_W = GRID[0].length;
export const GRID_H = GRID.length;
/** World half-extent (48×48 units). */
export const MAP_HALF = (GRID_W * TILE) / 2;

export const cellX = (col: number): number => -MAP_HALF + (col + 0.5) * TILE;
export const cellZ = (row: number): number => -MAP_HALF + (row + 0.5) * TILE;

const WALL_H = 2.2; // wall.glb is 1.1 tall, scaled 2×
const DAIS_H = 0.9;
const STAIR_RISE = 0.45; // two collider steps per stair tile
const ROCK_H = 1.0;
const HALF_H = 1.1;

// Fallback box-art palette (used only when GLB assets fail to load).
const C_STONE = 0x767d88;
const C_DARK = 0x565d68;
const C_DIRT = 0x7a6a50;
const C_ROCK = 0x6d7a6d;
const C_STAIR = 0x7d766c;

const isWall = (c: string | undefined): boolean => c === "#" || c === "g";
const at = (row: number, col: number): string => (GRID[row] ? (GRID[row][col] ?? "#") : "#");

export interface TileModel {
  /** dungeon model id (public/assets/arena/dungeon/<model>.glb) */
  model: string;
  x: number;
  y: number;
  z: number;
  ry: number;
  sx: number;
  sy: number;
  sz: number;
  /** fallback colour for the box-art renderer */
  color: number;
}

/** Stairs models ascend toward their local -z (Kenney orientation). */
export const STAIRS_MODEL_HIGH_TOWARD = -1; // -1 → high side at local -z

/** rotation about Y that points local -z along (dx, dz) */
function face(dx: number, dz: number): number {
  // local -z maps to (sin ry · 1, cos ry · 1)·(-1)… solve: ry = atan2(-dx, -dz)
  return Math.atan2(-dx, -dz);
}

/** Render placements for every grid cell (floors are instanced by the renderer). */
export const MAP_TILES: TileModel[] = [];
for (let row = 0; row < GRID_H; row++) {
  for (let col = 0; col < GRID_W; col++) {
    const c = at(row, col);
    const x = cellX(col);
    const z = cellZ(row);
    const t = (model: string, y: number, ry = 0, sy = 2, color = C_STONE): void => {
      MAP_TILES.push({ model, x, y, z, ry, sx: 2, sy, sz: 2, color });
    };
    switch (c) {
      case "#":
        t("wall", 0);
        break;
      case "g":
        t("wall", 0);
        // barred window set into the wall gap
        MAP_TILES.push({ model: "gate", x, y: 0.12, z, ry: 0, sx: 2.5, sy: 2.5, sz: 2.5, color: C_DARK });
        break;
      case "o": {
        // doorway arch — rotate to run along the wall it interrupts
        const alongX = isWall(at(row, col - 1)) || isWall(at(row, col + 1));
        t("wall-opening", 0, alongX ? 0 : Math.PI / 2);
        break;
      }
      case "d":
        t("dirt", 0, 0, 1, C_DIRT); // dirt block is 0.9 tall → dais top at 0.9
        break;
      case "s": {
        // ascend toward the neighbouring dais tile
        let dx = 0;
        let dz = 0;
        if (at(row + 1, col) === "d") dz = 1;
        else if (at(row - 1, col) === "d") dz = -1;
        else if (at(row, col + 1) === "d") dx = 1;
        else dx = -1;
        t("stairs", 0, face(dx, dz), 1, C_STAIR);
        break;
      }
      case "c":
        t("column", 0, 0, 1, C_STONE);
        break;
      case "h":
        t("wall-half", 0, 0, HALF_H, C_DARK); // 1.1 tall
        break;
      case "r":
        t("rocks", 0, 0, 1, C_ROCK);
        break;
      default:
        t("floor", -0.001, ((row * 7 + col * 13) % 4) * (Math.PI / 2), 2, C_STONE);
        // deterministic floor-detail sprinkle
        if ((row * 31 + col * 17) % 11 === 0) {
          MAP_TILES.push({ model: "floor-detail", x, y: 0, z, ry: ((row + col) % 4) * (Math.PI / 2), sx: 2, sy: 2, sz: 2, color: C_STONE });
        }
        break;
    }
  }
}

/** Axis-aligned collision boxes (also the fallback renderer's geometry). */
export const MAP_BOXES: Box[] = [
  { min: [-MAP_HALF, -1, -MAP_HALF], max: [MAP_HALF, 0, MAP_HALF], color: 0x3a4256 },
];

const solidBox = (min: [number, number, number], max: [number, number, number], color: number): void => {
  MAP_BOXES.push({ min, max, color });
};

for (let row = 0; row < GRID_H; row++) {
  for (let col = 0; col < GRID_W; col++) {
    const c = at(row, col);
    const x0 = -MAP_HALF + col * TILE;
    const z0 = -MAP_HALF + row * TILE;
    const x1 = x0 + TILE;
    const z1 = z0 + TILE;
    switch (c) {
      case "#":
      case "g":
        solidBox([x0, 0, z0], [x1, WALL_H, z1], C_STONE);
        break;
      case "d":
        solidBox([x0, 0, z0], [x1, DAIS_H, z1], C_DIRT);
        break;
      case "c":
        solidBox([x0 + 0.5, 0, z0 + 0.5], [x1 - 0.5, WALL_H, z1 - 0.5], C_STONE);
        break;
      case "h":
        solidBox([x0, 0, z0], [x1, HALF_H, z1], C_DARK);
        break;
      case "r":
        solidBox([x0 + 0.1, 0, z0 + 0.1], [x1 - 0.1, ROCK_H, z1 - 0.1], C_ROCK);
        break;
      case "s": {
        // two collider steps rising toward the dais (climbed via auto-step)
        let dx = 0;
        let dz = 0;
        if (at(row + 1, col) === "d") dz = 1;
        else if (at(row - 1, col) === "d") dz = -1;
        else if (at(row, col + 1) === "d") dx = 1;
        else dx = -1;
        const along = Math.abs(dx) === 1;
        for (let k = 0; k < 2; k++) {
          const top = STAIR_RISE * (k + 1);
          // step k covers fraction [k/2, (k+1)/2] of the tile from the low end
          const lo = k / 2;
          const hi = (k + 1) / 2;
          const f0 = dx < 0 || dz < 0 ? 1 - hi : lo;
          const f1 = dx < 0 || dz < 0 ? 1 - lo : hi;
          const min: [number, number, number] = along ? [x0 + f0 * TILE, 0, z0] : [x0, 0, z0 + f0 * TILE];
          const max: [number, number, number] = along ? [x0 + f1 * TILE, top, z1] : [x1, top, z0 + f1 * TILE];
          solidBox(min, max, C_STAIR);
        }
        break;
      }
      default:
        break;
    }
  }
}

/** Respawn locations (12+, on open floor). */
export const SPAWN_POINTS: Vec3[] = [
  [-15, 0.01, -15],
  [15, 0.01, -15],
  [-15, 0.01, 15],
  [15, 0.01, 15],
  [1, 0.01, -19],
  [1, 0.01, 19],
  [-19, 0.01, -3],
  [19, 0.01, -3],
  [1, 0.01, -7],
  [1, 0.01, 7],
  [-13, 0.01, -3],
  [13, 0.01, 5],
];

/* -------------------------------------------------------------------------
   Props — dynamic rigid bodies (server-authoritative) + breakables
   ------------------------------------------------------------------------- */

export type PropKind = "crate" | "barrel" | "pot" | "chair" | "table" | "chest" | "target";

export interface PropDef {
  kind: PropKind;
  /** render model: dungeon kit for furniture, blaster kit for crates/targets */
  model: string;
  x: number;
  /** rest height (base of the prop sits here) */
  y: number;
  z: number;
  ry: number;
  scale: number;
  /** explosive barrel */
  explosive?: boolean;
  /** breakable target (static until broken) */
  target?: boolean;
}

const P = (
  kind: PropKind,
  model: string,
  col: number,
  row: number,
  ry = 0,
  extra: Partial<PropDef> = {},
): PropDef => ({
  kind,
  model,
  x: cellX(col),
  z: cellZ(row),
  y: 0,
  ry,
  scale: 2,
  ...extra,
});

/** small deterministic jitter so clusters don't look stamped */
const J = (col: number, row: number, dx: number, dz: number): { x: number; z: number } => ({
  x: cellX(col) + dx,
  z: cellZ(row) + dz,
});

export const MAP_PROPS: PropDef[] = [
  // hall field — crate cover
  P("crate", "crate-medium", 16, 10, 0.3),
  P("crate", "crate-medium", 15, 14, -0.2),
  P("crate", "crate-small", 7, 10, 0),
  P("crate", "crate-small", 8, 14, 0),
  P("crate", "crate-wide", 13, 9, 0.5),
  P("crate", "crate-wide", 11, 15, -0.5),
  // explosive barrels flanking the hall approaches
  P("barrel", "barrel", 9, 9, 0, { explosive: true }),
  P("barrel", "barrel", 14, 15, 0, { explosive: true }),
  // hall furniture
  P("table", "table", 9, 12, Math.PI / 2),
  P("table", "table", 14, 12, Math.PI / 2),
  P("chair", "chair", 9, 11, 0.9),
  P("chair", "chair", 14, 13, -2.2),
  P("pot", "pot", 13, 9, 0),
  P("pot", "pot", 10, 15, 0),
  // north-west room — grenade cache
  P("table", "table", 5, 4, 0),
  P("chair", "chair", 4, 3, 0.8),
  P("chair", "chair", 6, 4, -2.4),
  P("crate", "crate-small", 2, 7, 0),
  P("crate", "crate-small", 2, 6, 0),
  P("chest", "chest", 7, 6, 0.5),
  P("pot", "pot", 2, 2, 0),
  // north-east room — rifle crate
  P("crate", "crate-medium", 17, 3, 0),
  P("crate", "crate-medium", 18, 3, 0),
  P("crate", "crate-medium", 17, 4, 0),
  P("table", "table", 20, 6, Math.PI / 2),
  P("chair", "chair", 20, 5, 0.6),
  P("pot", "pot", 20, 2, 0),
  P("barrel", "barrel", 16, 7, 0, { explosive: true }),
  // south-west room — shotgun crate
  P("chest", "chest", 6, 18, -0.4),
  P("crate", "crate-small", 3, 16, 0),
  P("crate", "crate-small", 2, 16, 0),
  P("table", "table", 5, 21, 0.3),
  P("chair", "chair", 4, 21, 0.2),
  P("chair", "chair", 6, 20, -2.8),
  P("pot", "pot", 2, 13, 0),
  P("barrel", "barrel", 7, 16, 0, { explosive: true }),
  // south-east room — sniper nest
  P("table", "table", 18, 21, 0),
  P("chair", "chair", 17, 21, 0.4),
  P("chair", "chair", 19, 20, -2.6),
  P("crate", "crate-medium", 21, 14, 0),
  P("crate", "crate-medium", 20, 14, 0),
  P("crate", "crate-medium", 20, 13, 0),
  P("pot", "pot", 21, 21, 0),
  // breakable targets (static until shot)
  P("target", "target-large", 12, 1, 0, { target: true }),
  P("target", "target-large", 12, 22, Math.PI, { target: true }),
  P("target", "target-small", 1, 12, Math.PI / 2, { target: true }),
  P("target", "target-small", 22, 12, -Math.PI / 2, { target: true }),
];

// table/chair clusters get a touch of jitter; everything else stays put
for (const p of MAP_PROPS) {
  if (p.kind === "chair") {
    const j = J(Math.round((p.x + MAP_HALF) / TILE - 0.5), Math.round((p.z + MAP_HALF) / TILE - 0.5), 0.35, -0.3);
    p.x = j.x;
    p.z = j.z;
  }
}

// targets hang at head height on the adjacent wall; everything else rests on the floor
for (const p of MAP_PROPS) {
  if (p.target) {
    p.y = 1.05;
    // pull against the wall behind the anchor tile
    const row = Math.round((p.z + MAP_HALF) / TILE - 0.5);
    const col = Math.round((p.x + MAP_HALF) / TILE - 0.5);
    const behind = 0.55;
    if (isWall(at(row - 1, col))) p.z = cellZ(row) - behind;
    else if (isWall(at(row + 1, col))) p.z = cellZ(row) + behind;
    else if (isWall(at(row, col - 1))) p.x = cellX(col) - behind;
    else if (isWall(at(row, col + 1))) p.x = cellX(col) + behind;
  }
}

/* -------------------------------------------------------------------------
   Pickups — server-authoritative spawn/respawn points
   ------------------------------------------------------------------------- */

export type PickupKind = "health" | "armor" | "ammo" | "grenade" | "weapon";

export interface PickupDef {
  kind: PickupKind;
  /** for kind "weapon": WEAPONS id granted */
  weapon?: number;
  x: number;
  y: number;
  z: number;
  /** render model id */
  model: string;
  /** seconds until it reappears */
  respawn: number;
}

export const PICKUP_RESPAWN: Record<PickupKind, number> = {
  health: 15,
  armor: 25,
  ammo: 10,
  grenade: 12,
  weapon: 20,
};

const pk = (kind: PickupKind, col: number, row: number, extra: Partial<PickupDef> = {}): PickupDef => ({
  kind,
  x: cellX(col),
  y: 0.55,
  z: cellZ(row),
  model: kind === "weapon" ? "blaster-e" : kind,
  respawn: PICKUP_RESPAWN[kind],
  ...extra,
});

export const MAP_PICKUPS: PickupDef[] = [
  pk("health", 12, 11.5, { y: 1.45 }), // dais centre — the contested prize
  pk("health", 3, 3),
  pk("health", 20, 3),
  pk("health", 3, 20),
  pk("health", 20, 20),
  pk("armor", 4, 12),
  pk("armor", 19, 12),
  pk("ammo", 13, 2),
  pk("ammo", 10, 21),
  pk("ammo", 2, 9),
  pk("ammo", 21, 14),
  pk("grenade", 7, 7),
  pk("grenade", 17, 17),
  pk("weapon", 16, 2, { weapon: 2, model: "blaster-e" }), // Longshot — NE room
  pk("weapon", 2, 21, { weapon: 3, model: "blaster-l" }), // Scatter — SW room
  pk("weapon", 16, 21, { weapon: 4, model: "blaster-q" }), // Widowmaker — SE room
];

/* -------------------------------------------------------------------------
   Decor — banners (torch-light anchors), traps, coins (pure client FX)
   ------------------------------------------------------------------------- */

export interface DecorDef {
  model: string;
  x: number;
  y: number;
  z: number;
  ry: number;
  /** warm point light anchored here */
  light?: boolean;
  /** client-side spin/bob */
  spin?: boolean;
}

export const MAP_DECOR: DecorDef[] = [
  // banners on room walls facing the galleries/field
  { model: "banner", x: cellX(2), y: 1.55, z: cellZ(8) + 0.95, ry: 0, light: true },
  { model: "banner", x: cellX(7), y: 1.55, z: cellZ(8) + 0.95, ry: 0, light: true },
  { model: "banner", x: cellX(16), y: 1.55, z: cellZ(8) + 0.95, ry: 0, light: true },
  { model: "banner", x: cellX(21), y: 1.55, z: cellZ(8) + 0.95, ry: 0, light: true },
  { model: "banner", x: cellX(2), y: 1.55, z: cellZ(15) - 0.95, ry: Math.PI, light: true },
  { model: "banner", x: cellX(7), y: 1.55, z: cellZ(15) - 0.95, ry: Math.PI, light: true },
  { model: "banner", x: cellX(16), y: 1.55, z: cellZ(15) - 0.95, ry: Math.PI, light: true },
  { model: "banner", x: cellX(21), y: 1.55, z: cellZ(15) - 0.95, ry: Math.PI, light: true },
  { model: "banner", x: cellX(8) + 0.95, y: 1.55, z: cellZ(2), ry: Math.PI / 2, light: true },
  { model: "banner", x: cellX(15) - 0.95, y: 1.55, z: cellZ(2), ry: -Math.PI / 2, light: true },
  { model: "banner", x: cellX(8) + 0.95, y: 1.55, z: cellZ(21), ry: Math.PI / 2, light: true },
  { model: "banner", x: cellX(15) - 0.95, y: 1.55, z: cellZ(21), ry: -Math.PI / 2, light: true },
  // spike traps in the galleries
  { model: "trap", x: cellX(11), y: 0, z: cellZ(2), ry: 0 },
  { model: "trap", x: cellX(13), y: 0, z: cellZ(21), ry: 0 },
  { model: "trap", x: cellX(3), y: 0, z: cellZ(6), ry: 0 },
  { model: "trap", x: cellX(20), y: 0, z: cellZ(17), ry: 0 },
  // coins on the dais (pure FX)
  { model: "coin", x: -1, y: 1.15, z: -1, ry: 0, spin: true },
  { model: "coin", x: 1, y: 1.15, z: -1, ry: 0, spin: true },
  { model: "coin", x: -1, y: 1.15, z: 1, ry: 0, spin: true },
  { model: "coin", x: 1, y: 1.15, z: 1, ry: 0, spin: true },
];

/** True if the point is inside a solid static box (test helper). */
export function insideSolid(x: number, z: number, y = 0.01): boolean {
  for (const b of MAP_BOXES) {
    if (b.min[1] > y || b.max[1] < y + 0.1) continue;
    if (x > b.min[0] && x < b.max[0] && z > b.min[2] && z < b.max[2]) return true;
  }
  return false;
}
