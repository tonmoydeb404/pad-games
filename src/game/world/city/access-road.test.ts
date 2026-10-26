/** Port Marin access road: bed endpoints, level crossing, grades, terrain carve. */
import { describe, expect, it } from "vitest";
import { TOWN_CX, TOWN_CZ } from "./constants";
import { RAIL_R, RAIL_Y, site, trailBed } from "./test-world";

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
