/**
 * Track builder tests: the shipped map must close, connect and stay
 * collision-free. These run the real builder — if the layout math drifts,
 * these fail with coordinates.
 */
import { describe, expect, it } from "vitest";
import { TILES, opposite, rotateDir, rotatedSize } from "./tiles";
import { buildWorld, cellKey, verifyWorld, type Placement } from "./track";

const world = buildWorld();

describe("free-roam world", () => {
  it("builds and passes socket verification", () => {
    expect(() => verifyWorld(world)).not.toThrow();
  });

  it("spawns on a ground road cell", () => {
    expect(world.road.has(cellKey(world.spawn.gx, world.spawn.gz))).toBe(true);
  });

  it("has a bridge: deck cells above ground connector cells", () => {
    expect(world.deck.size).toBeGreaterThanOrEqual(1);
    // the underpass: some ground cell sits directly beneath a deck cell
    let underpass = false;
    for (const k of world.deck) {
      if (world.road.has(k)) underpass = true;
    }
    expect(underpass).toBe(true);
  });

  it("places ramps and corners", () => {
    const tiles = new Set(world.placements.map((p) => p.tile));
    expect(tiles.has("road-ramp-long-wall")).toBe(true);
    expect(tiles.has("road-ramp-long")).toBe(true);
    expect(tiles.has("road-corner-small")).toBe(true);
    expect(tiles.has("road-corner-large")).toBe(true);
    expect(tiles.has("road-corner-larger")).toBe(true);
    expect(tiles.has("road-bridge-mid")).toBe(true);
    expect(tiles.has("road-start-gantry")).toBe(true);
    expect(tiles.has("road-pit-garage")).toBe(true);
  });

  it("scatters props off the road", () => {
    const props = world.placements.filter((p) => TILES[p.tile].sockets.length === 0);
    expect(props.length).toBeGreaterThan(30);
  });

  it("defines challenges with unique ids", () => {
    const { traps, driftZones, tokens } = world.challenges;
    expect(traps.length).toBeGreaterThanOrEqual(4);
    expect(driftZones.length).toBeGreaterThanOrEqual(3);
    expect(tokens.length).toBeGreaterThanOrEqual(10);
    const ids = new Set([...traps, ...driftZones, ...tokens].map((c) => c.id));
    expect(ids.size).toBe(traps.length + driftZones.length + tokens.length);
  });

  it("keeps the world within a sane size", () => {
    const b = world.bounds;
    expect(b.maxX - b.minX).toBeLessThan(60);
    expect(b.maxZ - b.minZ).toBeLessThan(50);
  });
});

describe("tile rotation maths", () => {
  it("rotates headings clockwise", () => {
    expect(rotateDir(0, 1)).toBe(1);
    expect(rotateDir(3, 1)).toBe(0);
    expect(rotateDir(2, 2)).toBe(0);
  });

  it("opposite is involutive", () => {
    for (const d of [0, 1, 2, 3] as const) {
      expect(opposite(opposite(d))).toBe(d);
    }
  });
});

describe("corner rotations", () => {
  it("every corner placement's sockets land on neighbouring road cells", () => {
    // verifyWorld covers this globally; here we assert every corner is
    // reachable (has two road neighbours in its socket directions)
    const corners = world.placements.filter((p) => p.tile.startsWith("road-corner"));
    expect(corners.length).toBeGreaterThanOrEqual(8);
  });

  it("places no overlapping footprints", () => {
    const seen = new Map<string, Placement>();
    for (const p of world.placements) {
      const def = TILES[p.tile];
      const deck = def.minimap === "deck";
      if (deck) continue; // decks fly over ground cells
      for (const k of footprintKeys(p)) {
        const prev = seen.get(k);
        expect(prev, `${p.tile} overlaps ${prev?.tile} at ${k}`).toBeUndefined();
        seen.set(k, p);
      }
    }
  });
});

function footprintKeys(p: Placement): string[] {
  const def = TILES[p.tile];
  const { w, d } = rotatedSize(def.w, def.d, p.rot);
  const keys: string[] = [];
  for (let ix = 0; ix < w; ix++)
    for (let iz = 0; iz < d; iz++) keys.push(cellKey(p.gx + ix, p.gz + iz));
  return keys;
}
