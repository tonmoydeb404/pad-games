/** Port Marin street plan: connectivity, lot counts, street-band clearance. */
import { describe, expect, it } from "vitest";
import { RING, TILE, TOWN_CX, TOWN_CZ, TOWN_FLAT } from "./constants";
import { site, tileLinks } from "./test-world";

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
