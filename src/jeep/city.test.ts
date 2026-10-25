/**
 * Port Marin site tests — the street plan, the access-road bed and the
 * terrain carve, all against a deterministic stand-in world (a rim bowl
 * like the engine's baseTerrain, a circular trail and a circular railway).
 * The real engine feeds CitySite the same query shapes (CityHooks), so a
 * green run here means the geometry contracts hold in the game.
 */
import { describe, expect, it } from "vitest";
import { smooth } from "./noise";
import { CitySite, RING, TILE, TOWN_BOUND, TOWN_CX, TOWN_CZ, TOWN_FLAT, type CityTile } from "./city";

/* --- the stand-in world -------------------------------------------------- */

/** Rim bowl: flat jungle floor inside r=330, rising +48 by r=440. */
const base = (x: number, z: number): number =>
  Math.max(0, (Math.hypot(x, z) - 330) / 110) * 48 + 3 * Math.sin(x * 0.011) * Math.cos(z * 0.013);

const TRAIL_R = 250;
const TRAIL_LIFT = 0.9;
const RAIL_R = 315;
/** The real rail bed rides a heavily smoothed terrain — a mild lift here. */
const RAIL_Y = 2.4;

const trailBed = (x: number, z: number): number => base(x, z) + TRAIL_LIFT;

function makeSite(): CitySite {
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

const site = makeSite();

/** Rotate a kit-space direction by a tile's resolved yaw. */
const rot = (x: number, z: number, yaw: number): [number, number] => [
  x * Math.cos(yaw) + z * Math.sin(yaw),
  -x * Math.sin(yaw) + z * Math.cos(yaw),
];

/** The faces of a tile that must meet a neighbour's face. */
function tileLinks(t: CityTile): [number, number][] {
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

/* --- tests --------------------------------------------------------------- */

describe("CitySite street plan", () => {
  it("connects every street face to exactly one neighbour (one open gate face)", () => {
    const edges = new Map<string, number>();
    for (const t of site.tiles) {
      for (const [dx, dz] of tileLinks(t)) {
        const w = site.toWorld(t.u + (dx * TILE) / 2, t.v + (dz * TILE) / 2);
        const k = `${Math.round(w.x * 4)}:${Math.round(w.z * 4)}`;
        edges.set(k, (edges.get(k) ?? 0) + 1);
      }
    }
    const counts = [...edges.values()];
    expect(counts.filter((n) => n > 2)).toEqual([]); // no face meets two tiles
    expect(counts.filter((n) => n === 1).length).toBe(1); // only the gate is open
  });

  it("lays a real town: ring, cross streets, spurs, 20 lots", () => {
    expect(site.buildings.length).toBe(20);
    const byModel = new Map<string, number>();
    for (const t of site.tiles) byModel.set(t.model, (byModel.get(t.model) ?? 0) + 1);
    expect(byModel.get("road-crossroad")).toBe(5); // centre + 4 ring junctions
    expect(byModel.get("road-bend")).toBe(4); // ring corners
    expect(byModel.get("road-end")).toBe(3); // three culs-de-sac (south is the gate)
    expect(byModel.get("road-crossing")).toBe(1); // the gate zebra
  });

  it("keeps yard fences and stop signs out of the street asphalt bands", () => {
    const inStreetBand = (x: number, z: number): boolean => {
      const { u, v } = site.toLocal(x, z);
      let du = 1e9;
      let dv = 1e9;
      for (const L of [-RING, 0, RING]) {
        du = Math.min(du, Math.abs(u - L));
        dv = Math.min(dv, Math.abs(v - L));
      }
      // spur + gate arms reach one tile beyond the ring
      const armU = dv <= 2.9 && Math.abs(u) <= 2 * RING + TILE + 4.5;
      const armV = du <= 2.9 && Math.abs(v) <= 2 * RING + TILE + 4.5;
      return armU || armV;
    };
    const fences = site.props.filter((p) => p.model === "fence-1x2");
    expect(fences.length).toBeGreaterThanOrEqual(40); // two per lot
    for (const f of fences) expect(inStreetBand(f.x, f.z)).toBe(false);
    const stops = site.props.filter((p) => p.model === "road-sign-stop");
    expect(stops.length).toBe(4);
    for (const s of stops) expect(inStreetBand(s.x, s.z)).toBe(false);
  });

  it("keeps every building on the shelf, clear of streets and of each other", () => {
    for (const b of site.buildings) {
      expect(Math.hypot(b.x - TOWN_CX, b.z - TOWN_CZ)).toBeLessThan(TOWN_FLAT - 2);
    }
    for (let i = 0; i < site.buildings.length; i++) {
      for (let k = i + 1; k < site.buildings.length; k++) {
        const a = site.buildings[i];
        const b = site.buildings[k];
        const ox = Math.abs(a.x - b.x) - (a.hx + b.hx);
        const oz = Math.abs(a.z - b.z) - (a.hz + b.hz);
        expect(Math.max(ox, oz)).toBeGreaterThan(-0.2); // no overlapping footprints
      }
    }
    // no house reaches into the street asphalt band
    for (const b of site.buildings) {
      const { u, v } = site.toLocal(b.x, b.z);
      let du = 1e9;
      let dv = 1e9;
      for (const L of [-RING, 0, RING]) {
        du = Math.min(du, Math.abs(u - L));
        dv = Math.min(dv, Math.abs(v - L));
      }
      expect(Math.max(du - 2.9 - b.hx, dv - 2.9 - b.hz)).toBeGreaterThan(0.4);
    }
  });
});

describe("CitySite access road", () => {
  it("starts at the trail bed and ends on the town shelf", () => {
    const first = site.roadInfo(site.junction.x, site.junction.z);
    expect(first.dist).toBeLessThan(1.5);
    expect(first.y).toBeCloseTo(trailBed(site.junction.x, site.junction.z), 1);

    const gate = site.toWorld(0, -44);
    const gi = site.roadInfo(gate.x, gate.z);
    expect(gi.y).toBeCloseTo(site.plateauY, 1);
  });

  it("meets the railway bed at the level crossing", () => {
    const ci = site.roadInfo(site.crossing.x, site.crossing.z);
    expect(ci.dist).toBeLessThan(1.5);
    // the sleepers must kiss the asphalt — the crossing is pinned to the bed
    expect(Math.abs(ci.y - RAIL_Y)).toBeLessThan(0.35);
    // …and the crossing sits on the ring
    expect(Math.abs(Math.hypot(site.crossing.x, site.crossing.z) - RAIL_R)).toBeLessThan(6);
  });

  it("holds drivable grades over its whole length", () => {
    let worst = 0;
    for (let d = 0; d < site.roadLength - 4; d += 2) {
      const a = site.roadPose(d);
      const b = site.roadPose(d + 4);
      worst = Math.max(worst, Math.abs(b.y - a.y) / 4);
    }
    expect(worst).toBeLessThan(0.36); // < ~20°
  });

  it("carves the shelf flat, the road to its bed, and nothing else", () => {
    const h0 = 12.3;
    expect(site.carve(TOWN_CX, TOWN_CZ, h0)).toBeCloseTo(site.plateauY, 4);
    const midStreet = site.toWorld(0, -20);
    expect(site.carve(midStreet.x, midStreet.z, h0)).toBeCloseTo(site.plateauY, 4);
    const roadMid = site.roadPose(site.roadLength / 2);
    expect(site.carve(roadMid.x, roadMid.z, h0)).toBeCloseTo(roadMid.y, 2);
    // far outside shelf + road (beyond the trail, off-corridor): untouched
    const far = site.toWorld(150, 60);
    expect(site.carve(far.x, far.z, h0)).toBeCloseTo(h0, 6);
    // no cliffs along the road corridor
    let prev = site.roadInfo(site.junction.x, site.junction.z).y;
    for (let d = 2; d < site.roadLength; d += 2) {
      const p = site.roadPose(d);
      const y = site.roadInfo(p.x, p.z).y;
      expect(Math.abs(y - prev)).toBeLessThan(1.4); // ≤ ~35° between samples (actual: gentle)
      prev = y;
    }
  });
});

describe("CitySite queries", () => {
  it("marks streets and the access road as asphalt, lots as not", () => {
    const street = site.toWorld(0, -12);
    expect(site.asphaltAt(street.x, street.z)).toBe(true);
    expect(site.asphaltAt(site.toWorld(13, 22).x, site.toWorld(13, 22).z)).toBe(false);
    const roadMid = site.roadPose(site.roadLength / 2);
    expect(site.asphaltAt(roadMid.x, roadMid.z)).toBe(true);
  });

  it("extends the world bound through the town sector only", () => {
    expect(site.bound(TOWN_CX, TOWN_CZ)).toBe(TOWN_BOUND);
    expect(site.bound(0, 0)).toBe(0);
    const roadMid = site.roadPose(site.roadLength / 2);
    expect(site.bound(roadMid.x, roadMid.z)).toBe(TOWN_BOUND);
  });

  it("keeps the jungle scatter out of town and off the road", () => {
    expect(site.exclusion(TOWN_CX, TOWN_CZ)).toBe(true);
    const roadMid = site.roadPose(site.roadLength / 2);
    expect(site.exclusion(roadMid.x, roadMid.z)).toBe(true);
    expect(site.exclusion(0, 0)).toBe(false);
  });

  it("round-trips city-local coordinates", () => {
    for (const [u, v] of [[13, 22], [-46, 14], [0, -44], [32, 32], [-31.5, 7.25]]) {
      const w = site.toWorld(u, v);
      const l = site.toLocal(w.x, w.z);
      expect(l.u).toBeCloseTo(u, 6);
      expect(l.v).toBeCloseTo(v, 6);
    }
  });
});
