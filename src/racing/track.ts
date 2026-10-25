/**
 * The free-roam world: a hand-authored layout expressed as a driven path.
 *
 * The authoring model mirrors how the kit snaps together: a "pen" walks cell
 * to cell (`straight`, `turn`, `bridge`, `jump`) and each step derives the
 * tile, its quarter-turn rotation and its grid rect from the geometry measured
 * in `tiles.ts`. Rotation maths lives entirely in tiles.ts
 * (rotateDir/rotateAnchor) — one source of truth.
 *
 * The layout (grid cells, +X east, +Z south; N = -Z):
 *   - outer circuit (clockwise): start/finish straight west, bridge overpass
 *     on the east straight, jump-ramp alley on the south straight, pit lane
 *     and grandstands outside the west straight;
 *   - underpass connector: a north–south road crossing beneath the bridge;
 *   - inner drift loop inscribed in the circuit (cornerSmall chain);
 *   - drift lot west of the circuit (tents, pylon slalom, tokens).
 *
 * Loop closure is asserted (the builder throws with coordinates), and
 * `verifyWorld()` re-checks every socket + overlap, so authoring mistakes
 * fail loudly in tests instead of rendering a broken road.
 */
import {
  CELL,
  Dir,
  E,
  N,
  Rot,
  S,
  TILES,
  W,
  dirVec,
  opposite,
  rotateAnchor,
  rotateDir,
  rotatedSize,
} from "./tiles";

export interface Placement {
  tile: string;
  /** Min-corner grid cell of the (rotated) footprint. */
  gx: number;
  gz: number;
  rot: Rot;
}

export interface BoostPad {
  gx: number;
  gz: number;
  dir: Dir;
}

export interface Mark {
  gx: number;
  gz: number;
  dir: Dir;
}

export interface SpeedTrapSpec {
  id: string;
  gx: number;
  gz: number;
  dir: Dir;
  /** km/h to beat. */
  target: number;
}

export interface DriftZoneSpec {
  id: string;
  /** Zone centre, world metres. */
  x: number;
  z: number;
  /** Radius, world metres. */
  r: number;
}

export interface TokenSpec {
  id: string;
  x: number;
  z: number;
  /** Height above ground (bridge/air tokens). */
  y: number;
}

export interface WorldMap {
  placements: Placement[];
  boost: BoostPad[];
  marks: Record<string, Mark>;
  /** Drivable ground road cells ("x,z"), pit lane + connector included. */
  road: Set<string>;
  /** Elevated bridge deck cells ("x,z") — drivable, above the ground. */
  deck: Set<string>;
  challenges: {
    traps: SpeedTrapSpec[];
    driftZones: DriftZoneSpec[];
    tokens: TokenSpec[];
  };
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  spawn: Mark;
}

export const cellKey = (x: number, z: number): string => `${x},${z}`;

interface Pen {
  /** Cell the vehicle occupies as the next piece begins. */
  x: number;
  z: number;
  dir: Dir;
}

/* -------------------------------------------------------------------------
   Builder
   ------------------------------------------------------------------------- */

class WorldBuilder {
  readonly placements: Placement[] = [];
  readonly boost: BoostPad[] = [];
  readonly marks: Record<string, Mark> = {};
  readonly road = new Set<string>();
  readonly deck = new Set<string>();
  /** Ground cells reserved by road pieces (deck flies over them). */
  private occupied = new Set<string>();
  private deckOccupied = new Set<string>();
  /** Cells reserved by props (never on road/deck). */
  private propCells = new Set<string>();

  mark(name: string, pen: Pen, dx = 0, dz = 0): void {
    this.marks[name] = { gx: pen.x + dx, gz: pen.z + dz, dir: pen.dir };
  }

  private cellsOf(tileId: string, gx: number, gz: number, r: Rot): { x: number; z: number }[] {
    const def = TILES[tileId];
    const { w, d } = rotatedSize(def.w, def.d, r);
    const cells: { x: number; z: number }[] = [];
    for (let ix = 0; ix < w; ix++)
      for (let iz = 0; iz < d; iz++) cells.push({ x: gx + ix, z: gz + iz });
    return cells;
  }

  /** Reserve + record a road placement (deck pieces fly over ground roads). */
  private put(p: Placement, cells: { x: number; z: number }[], deck: boolean): void {
    for (const c of cells) {
      const k = cellKey(c.x, c.z);
      if (deck) {
        if (this.deckOccupied.has(k)) throw new Error(`[racing] deck overlap at ${k} (${p.tile})`);
        this.deckOccupied.add(k);
        this.deck.add(k);
      } else {
        if (this.occupied.has(k)) throw new Error(`[racing] ground overlap at ${k} (${p.tile})`);
        this.occupied.add(k);
        this.road.add(k);
      }
    }
    this.placements.push(p);
  }

  /**
   * Place a straight drivable piece so traffic enters through the piece's
   * low/native-N edge: `rot = opposite(dir)` for plain straights and
   * ground-facing ramps/bridge ramps alike.
   */
  piece(pen: Pen, tileId: string, opts: { deck?: boolean; mark?: string } = {}): void {
    const def = TILES[tileId];
    if (!def.sockets.includes(N)) throw new Error(`[racing] ${tileId} is not a straight piece`);
    if (def.w !== 1) throw new Error(`[racing] ${tileId}: straight pieces are width-1`);
    const rot = opposite(pen.dir) as Rot;
    const len = def.d; // native length runs along the heading
    const fwd = dirVec(pen.dir);
    const cells: { x: number; z: number }[] = [];
    for (let i = 0; i < len; i++) cells.push({ x: pen.x + fwd.x * i, z: pen.z + fwd.z * i });
    const gx = Math.min(...cells.map((c) => c.x));
    const gz = Math.min(...cells.map((c) => c.z));
    this.put({ tile: tileId, gx, gz, rot }, cells, opts.deck === true);
    pen.x += fwd.x * len;
    pen.z += fwd.z * len;
    if (opts.mark) this.mark(opts.mark, { ...pen }, -fwd.x, -fwd.z);
  }

  /** Standalone placement at an explicit min-corner + rotation. */
  placeAt(tileId: string, gx: number, gz: number, rot: Rot, opts: { deck?: boolean } = {}): void {
    this.put({ tile: tileId, gx, gz, rot }, this.cellsOf(tileId, gx, gz, rot), opts.deck === true);
  }

  /** Standalone prop placement, centred on a cell, checked off-road. */
  prop(tileId: string, gx: number, gz: number, rot: Rot = 0): void {
    const def = TILES[tileId];
    if (def.sockets.length > 0) throw new Error(`[racing] ${tileId} is road, not a prop`);
    const cells = this.cellsOf(tileId, gx, gz, rot);
    for (const c of cells) {
      const k = cellKey(c.x, c.z);
      if (this.occupied.has(k) || this.deckOccupied.has(k) || this.propCells.has(k)) {
        throw new Error(`[racing] prop ${tileId} overlaps at ${k}`);
      }
      this.propCells.add(k);
    }
    this.placements.push({ tile: tileId, gx, gz, rot });
  }

  /** True when a ground cell is reserved by any road, deck or prop. */
  reserved(k: string): boolean {
    return this.occupied.has(k) || this.deckOccupied.has(k) || this.propCells.has(k);
  }

  /** Run `n` cells of straight road, preferring 2-cell tiles. */
  straight(pen: Pen, n: number, opts: { deck?: boolean; style?: "plain" | "lane" | "arrows" } = {}): void {
    let left = n;
    let i = 0;
    while (left > 0) {
      let tileId = "road-straight";
      if (left >= 2) {
        tileId =
          opts.style === "lane" && i % 3 === 1
            ? "road-straight-long-mid"
            : opts.style === "arrows" && i % 4 === 2
              ? "road-straight-arrow"
              : "road-straight-long";
      }
      this.piece(pen, tileId, { deck: opts.deck });
      left -= TILES[tileId].d; // native d = covered length (rotation preserves it)
      i++;
    }
  }

  /**
   * Quarter-turn corner. Rotations (derived from the native N↔E sockets):
   *   left  turn at heading D → rot = opposite(D), native entry edge N;
   *   right turn at heading D → rot = (D+1) % 4,  native entry edge E.
   * The rect is anchored so the entry-edge anchor cell equals the cursor;
   * the cursor emerges on the exit edge's adjacent cell.
   */
  turn(pen: Pen, turn: "left" | "right", size: 1 | 2 | 3, mark?: string): void {
    const tileId = size === 1 ? "road-corner-small" : size === 2 ? "road-corner-large" : "road-corner-larger";
    const def = TILES[tileId];
    const r: Rot = (turn === "left" ? opposite(pen.dir) : (pen.dir + 1) % 4) as Rot;
    const nativeEntry = turn === "left" ? { x: 0, z: 0 } : { x: def.w - 1, z: def.d - 1 };
    const nativeExit = turn === "left" ? { x: def.w, z: def.d - 1 } : { x: 0, z: -1 };
    const entryA = rotateAnchor(nativeEntry.x, nativeEntry.z, def.w, def.d, r);
    const exitA = rotateAnchor(nativeExit.x, nativeExit.z, def.w, def.d, r);
    const gx = pen.x - entryA.x;
    const gz = pen.z - entryA.z;
    this.put({ tile: tileId, gx, gz, rot: r }, this.cellsOf(tileId, gx, gz, r), false);
    pen.x = gx + exitA.x;
    pen.z = gz + exitA.z;
    pen.dir = rotateDir(pen.dir, turn === "left" ? 3 : 1) as Dir;
    if (mark) this.mark(mark, pen);
  }

  /**
   * Bridge run: a walled ground ramp up (2 cells, asphalt rises 5 m), `mids`
   * flat deck cells at 5 m, and the mirrored ramp down. The kit's
   * "bridge-start" piece is a flat deck cap, not a ramp — the ramps are the
   * long ramp pieces.
   */
  bridge(pen: Pen, mids: number): void {
    this.piece(pen, "road-ramp-long-wall", { mark: "bridge-up" });
    for (let i = 0; i < mids; i++) {
      this.piece(pen, "road-bridge-mid", { deck: true, mark: i === 0 ? "bridge-deck" : undefined });
    }
    // descent: native low edge (N) faces the heading, so rot = heading
    const tileId = "road-ramp-long-wall";
    const def = TILES[tileId];
    const fwd = dirVec(pen.dir);
    const cells: { x: number; z: number }[] = [];
    for (let i = 0; i < def.d; i++) cells.push({ x: pen.x + fwd.x * i, z: pen.z + fwd.z * i });
    const gx = Math.min(...cells.map((c) => c.x));
    const gz = Math.min(...cells.map((c) => c.z));
    this.put({ tile: tileId, gx, gz, rot: pen.dir as Rot }, cells, false);
    this.mark("bridge-down", pen);
    pen.x += fwd.x * def.d;
    pen.z += fwd.z * def.d;
  }

  /** Jump: ramp up (walls), a `gap`-cell void, landing ramp facing it. */
  jump(pen: Pen, gap: number): void {
    this.piece(pen, "road-ramp-long-wall", { mark: "jump-up" });
    const fwd = dirVec(pen.dir);
    // the void: `gap` cells of grass, then the landing ramp whose high edge
    // faces the gap (native low edge N, rotated to the heading of travel)
    pen.x += fwd.x * gap;
    pen.z += fwd.z * gap;
    const tileId = "road-ramp-long";
    const rot = pen.dir as Rot;
    const def = TILES[tileId];
    const cells: { x: number; z: number }[] = [];
    for (let i = 0; i < def.d; i++) cells.push({ x: pen.x + fwd.x * i, z: pen.z + fwd.z * i });
    const gx = Math.min(...cells.map((c) => c.x));
    const gz = Math.min(...cells.map((c) => c.z));
    this.put({ tile: tileId, gx, gz, rot }, cells, false);
    this.mark("jump-down", pen);
    pen.x += fwd.x * def.d;
    pen.z += fwd.z * def.d;
  }

  boostPad(pen: Pen, back = 0): void {
    const fwd = dirVec(pen.dir);
    this.boost.push({ gx: pen.x - fwd.x * back, gz: pen.z - fwd.z * back, dir: pen.dir });
  }

  finish(spawn: Mark, bounds: WorldMap["bounds"]): WorldMap {
    return {
      placements: this.placements,
      boost: this.boost,
      marks: this.marks,
      road: this.road,
      deck: this.deck,
      bounds,
      spawn,
      challenges: { traps: [], driftZones: [], tokens: [] },
    };
  }
}

/* -------------------------------------------------------------------------
   The layout
   -------------------------------------------------------------------------
   Worked-out geometry (cells). Outer circuit, clockwise from the start
   cursor (20,30) heading N:
     N run 9 (start/finish)  → NE corner(2)  → E run 9 (bridge ramps x26..27 / 29..30, deck x28)
     → SE corner(2)          → S run 8 (jump at z23..28)
     → SW corner(2)          → W run 8                     → NW corner(3)
   Closure: X: 2+9+2-2-8-3 = 0, Z: -9+2+8+2-3 = 0 ✓
 ------------------------------------------------------------------------- */

/** Build the free-roam world. Deterministic; pure data out. */
export function buildWorld(): WorldMap {
  const b = new WorldBuilder();

  /* ---- outer circuit --------------------------------------------------- */
  const pen: Pen = { x: 20, z: 30, dir: N };
  b.mark("start-cursor", pen);
  // start straight, carved around the gantry + grid-marking tiles:
  // 3 plain, gantry (2), grid (2) = 9
  b.straight(pen, 3);
  b.piece(pen, "road-start-gantry", { mark: "gantry" });
  b.piece(pen, "road-start-positions");
  b.mark("start-straight", { ...pen, dir: N }, 0, 4); // mid-run, heading N
  b.turn(pen, "right", 2, "corner-ne");
  b.straight(pen, 4);
  b.boostPad(pen, 0);
  b.bridge(pen, 1);
  b.straight(pen, 1);
  b.turn(pen, "right", 2, "corner-se");
  b.straight(pen, 1);
  b.boostPad(pen, 0);
  b.jump(pen, 2);
  b.straight(pen, 1);
  b.mark("south-straight", pen);
  b.turn(pen, "right", 2, "corner-sw");
  b.straight(pen, 9);
  b.mark("west-straight", { ...pen, dir: pen.dir }, 4, 0);
  b.turn(pen, "right", 3, "corner-nw");

  const startMark = b.marks["start-cursor"];
  if (pen.x !== startMark.gx || pen.z !== startMark.gz || pen.dir !== N) {
    throw new Error(
      `[racing] outer loop does not close: cursor (${pen.x},${pen.z}@${pen.dir}) vs start (${startMark.gx},${startMark.gz})`,
    );
  }

  const spawn: Mark = {
    gx: b.marks["start-straight"].gx,
    gz: b.marks["start-straight"].gz,
    dir: N,
  };

  /* ---- underpass connector (north–south, under the bridge) ------------- */
  // the middle deck cell's column — the ground beneath it stays free, so the
  // connector crosses the bridge there. Bumpered road-ends terminate it on
  // both sides (no junctions in v1).
  const deckCols = [...b.deck].map((k) => Number(k.split(",")[0])).sort((a, z) => a - z);
  const crossX = deckCols[Math.floor(deckCols.length / 2)] ?? 26;
  b.placeAt("road-end", crossX, 22, 0); // south terminator (open side faces N)
  const cpen: Pen = { x: crossX, z: 21, dir: N };
  b.straight(cpen, 14);
  b.placeAt("road-end", crossX, 7, 2); // north terminator (open side faces S)
  b.mark("connector-south", { x: crossX, z: 20, dir: N });
  b.mark("connector-north", { x: crossX, z: 9, dir: N });

  /* ---- inner drift loop (inscribed, clockwise) --------------------------- */
  // rectangle cols 23–31 / rows 23–31 inside the circuit; walk-derived
  // closure: 6 per side, 1×1 right corners
  const ipen: Pen = { x: crossX + 3, z: 24, dir: S };
  b.straight(ipen, 6);
  b.turn(ipen, "right", 1, "inner-se");
  b.straight(ipen, 6);
  b.turn(ipen, "right", 1, "inner-sw");
  b.straight(ipen, 6);
  b.turn(ipen, "right", 1, "inner-nw");
  b.straight(ipen, 6);
  b.turn(ipen, "right", 1, "inner-ne");
  if (ipen.x !== crossX + 3 || ipen.z !== 24) {
    throw new Error(`[racing] inner loop does not close: (${ipen.x},${ipen.z})`);
  }
  b.mark("inner-center", { x: crossX - 1, z: 27, dir: N });

  /* ---- pit plaza (outside the west wall) -------------------------------- */
  // pit lane column 18, parallel to the start straight; garages face the track
  const ppen: Pen = { x: 18, z: 27, dir: N };
  b.straight(ppen, 1);
  b.piece(ppen, "road-pit-garage");
  b.straight(ppen, 2);
  b.piece(ppen, "road-pit-garage");
  b.straight(ppen, 1);
  b.placeAt("road-end", 18, 28, 0); // south cap (open side faces N)
  b.placeAt("road-end", 18, 21, 2); // north cap (open side faces S)
  b.mark("pit-lane", { x: 18, z: 25, dir: N });

  /* ---- drift lot (west, beyond the pit) --------------------------------- */
  b.mark("lot-gate", { x: 13, z: 27, dir: W });
  b.mark("lot-center", { x: 10, z: 30, dir: W });

  /* ---- dressing ---------------------------------------------------------- */
  dressWorld(b);

  const bounds = computeBounds(b.placements);
  const world = b.finish(spawn, bounds);
  verifyWorld(world);
  world.challenges = buildChallenges(world);
  return world;
}

/* -------------------------------------------------------------------------
   Dressing: hand-placed props + a deterministic tree scatter
   ------------------------------------------------------------------------- */

function dressWorld(b: WorldBuilder): void {
  // Decor never aborts the build: a prop that doesn't fit its cell is dropped.
  const put = (tile: string, gx: number, gz: number, rot: Rot = 0): void => {
    try {
      b.prop(tile, gx, gz, rot);
    } catch {
      // occupied — skip
    }
  };
  // grandstands + fences west of the pit lane (col 18)
  put("grand-stand", 15, 23, 1);
  put("grand-stand", 15, 25, 1);
  for (const z of [22, 24, 26]) put("fence-straight", 17, z, 1);
  // gantry flags + banner towers between the pit lane and the start straight (col 20)
  put("flag-checkers", 19, 24, 0);
  put("flag-checkers", 19, 27, 0);
  put("banner-tower-green", 19, 22, 0);
  put("banner-tower-red", 19, 30, 0);
  for (const z of [23, 26, 29, 32]) put("light-post-modern", 19, z, 0);
  // billboards outside the corners
  put("billboard-low", 18, 19, 2);
  put("billboard-low", 37, 20, 3);
  put("billboard-low", 37, 34, 0);
  put("billboard-low", 22, 36, 1);
  // barriers outside the east side (corners + jump landing)
  for (const z of [24, 25, 30, 31]) put("barrier-red", 36, z, 1);
  put("barrier-white", 35, 26, 1);
  put("barrier-white", 35, 28, 1);
  // bridge approaches: radar speed displays
  put("radar-equipment", 24, 20, 0);
  put("radar-equipment", 31, 20, 2);
  // connector dressing
  const crossX = b.marks["connector-south"].gx;
  put("light-post-large", crossX - 1, 12, 0);
  put("light-post-large", crossX + 1, 16, 0);
  put("banner-tower-green", crossX - 1, 8, 0);
  put("pylon", crossX + 1, 10, 0);
  // drift lot: tents, slalom cones, round grandstand
  put("tent-long", 11, 23, 0);
  put("tent", 11, 33, 0);
  put("grand-stand-round", 4, 27, 0);
  const cones: [number, number][] = [
    [12, 29], [11, 30], [10, 31], [9, 31], [8, 30], [8, 29], [9, 28], [11, 28],
  ];
  for (const [x, z] of cones) put("pylon", x, z, 0);
  // trees — deterministic scatter, kept off every reserved cell
  scatterTrees(b);
}

/** Small deterministic LCG so the scatter is stable across runs. */
function scatterTrees(b: WorldBuilder): void {
  let seed = 0x5f3759df;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  const bounds = { minX: 2, minZ: 4, maxX: 42, maxZ: 38 };
  let placed = 0;
  for (let attempt = 0; attempt < 900 && placed < 42; attempt++) {
    const x = bounds.minX + Math.floor(rnd() * (bounds.maxX - bounds.minX));
    const z = bounds.minZ + Math.floor(rnd() * (bounds.maxZ - bounds.minZ));
    if (nearAnyRoad(b, x, z, 2)) continue;
    try {
      b.prop(rnd() > 0.6 ? "tree-large" : "tree-small", x, z, Math.floor(rnd() * 4) as Rot);
      placed++;
    } catch {
      // occupied — skip
    }
  }
}

/** True when any cell within Chebyshev distance `r` of (x,z) is reserved. */
function nearAnyRoad(b: WorldBuilder, x: number, z: number, r: number): boolean {
  for (let dx = -r; dx <= r; dx++)
    for (let dz = -r; dz <= r; dz++) {
      if (b.reserved(cellKey(x + dx, z + dz))) return true;
    }
  return false;
}

/* -------------------------------------------------------------------------
   Challenges (free-roam activities, all derived from map data)
   ------------------------------------------------------------------------- */

function buildChallenges(map: Omit<WorldMap, "challenges">): WorldMap["challenges"] {
  const w = (gx: number, gz: number) => ({ x: (gx + 0.5) * CELL, z: (gz + 0.5) * CELL });
  const deckCell = [...map.deck][0] ?? "0,0";
  const [dx, dz] = deckCell.split(",").map(Number);
  const deckH = 5.0;
  // the outer circuit's east column (the jump ramps' column)
  const eastX = map.marks["jump-up"]?.gx ?? 33;
  const conn = map.marks["connector-south"] ?? { gx: 28, gz: 20, dir: N as Dir };
  const connN = map.marks["connector-north"] ?? { gx: 28, gz: 9, dir: N as Dir };
  const innerC = map.marks["inner-center"] ?? { gx: 26, gz: 27, dir: N as Dir };

  const traps: SpeedTrapSpec[] = [
    { id: "trap-start", gx: 20, gz: 23, dir: N, target: 140 },
    { id: "trap-bridge", gx: dx, gz: dz, dir: E, target: 150 },
    { id: "trap-connector", gx: conn.gx, gz: connN.gz + 5, dir: N, target: 130 },
    { id: "trap-west", gx: 26, gz: 33, dir: W, target: 150 },
  ];

  const driftZones: DriftZoneSpec[] = [
    { id: "drift-inner-ne", ...w(29, 24), r: 16 },
    { id: "drift-inner-sw", ...w(23, 30), r: 16 },
    { id: "drift-lot", ...w(10, 30), r: 30 },
    { id: "drift-jump", ...w(eastX + 1, 26), r: 14 },
  ];

  const tokens: TokenSpec[] = [
    // bridge deck pair (elevated)
    { id: "tok-bridge-1", ...w(dx, dz), y: deckH },
    { id: "tok-bridge-2", ...w(dx + 1, dz), y: 3.8 }, // on the descent ramp
    // mid-air over the jump gap
    { id: "tok-air", ...w(eastX, 27), y: 4.5 },
    // pit lane + start
    { id: "tok-pit-1", ...w(18, 23), y: 1 },
    { id: "tok-pit-2", ...w(18, 25), y: 1 },
    { id: "tok-start", ...w(20, 22), y: 1 },
    // connector ends
    { id: "tok-conn-s", ...w(conn.gx, conn.gz), y: 1 },
    { id: "tok-conn-n", ...w(connN.gx, connN.gz), y: 1 },
    // inner loop
    { id: "tok-inner", ...w(innerC.gx, innerC.gz), y: 1 },
    // drift lot ring
    { id: "tok-lot-1", ...w(12, 29), y: 1 },
    { id: "tok-lot-2", ...w(10, 32), y: 1 },
    { id: "tok-lot-3", ...w(8, 30), y: 1 },
    { id: "tok-lot-4", ...w(10, 28), y: 1 },
  ];
  return { traps, driftZones, tokens };
}

/* -------------------------------------------------------------------------
   Verification
   ------------------------------------------------------------------------- */

/**
 * Re-check every road socket: each connected edge must open onto a cell that
 * belongs to a road/deck placement (deck edges accept deck or ground cells —
 * the bridge rides above the connector). Throws on the first offender.
 */
export function verifyWorld(map: WorldMap): void {
  const cells = new Set<string>([...map.road, ...map.deck]);
  for (const p of map.placements) {
    const def = TILES[p.tile];
    for (const socket of def.sockets) {
      // lane anchor just outside the piece, in native footprint space (same
      // lanes WorldBuilder.turn() walks: N at x=0, E on the last row)
      const nx = socket === E ? def.w : socket === W ? -1 : 0;
      const nz = socket === N ? -1 : socket === S ? def.d : def.d - 1;
      const a = rotateAnchor(nx, nz, def.w, def.d, p.rot);
      const k = cellKey(p.gx + Math.floor(a.x), p.gz + Math.floor(a.z));
      // jump ramps deliberately open onto the airborne gap
      if (!cells.has(k) && !p.tile.startsWith("road-ramp-long")) {
        throw new Error(`[racing] ${p.tile} @${p.gx},${p.gz}: socket ${socket} opens onto nothing at ${k}`);
      }
    }
  }
}

function computeBounds(placements: Placement[]): WorldMap["bounds"] {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const p of placements) {
    const def = TILES[p.tile];
    const { w, d } = rotatedSize(def.w, def.d, p.rot);
    minX = Math.min(minX, p.gx);
    minZ = Math.min(minZ, p.gz);
    maxX = Math.max(maxX, p.gx + w);
    maxZ = Math.max(maxZ, p.gz + d);
  }
  return { minX, minZ, maxX, maxZ };
}

/** World-space position of a grid cell's centre. */
export function cellWorld(gx: number, gz: number): { x: number; z: number } {
  return { x: (gx + 0.5) * CELL, z: (gz + 0.5) * CELL };
}
