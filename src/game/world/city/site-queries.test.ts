/** Port Marin site queries: asphalt, world bound, scatter exclusion, transforms. */
import { describe, expect, it } from "vitest";
import { TOWN_BOUND, TOWN_CX, TOWN_CZ } from "./constants";
import { site } from "./test-world";

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
