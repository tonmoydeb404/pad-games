/** RailPath geometry: closed loop, gentle grades, curve radius, arc-length poses. */
import { describe, expect, it } from "vitest";
import { RAIL_SAMPLES } from "./constants";
import type { RailPose } from "./types";
import { flat } from "./test-helpers";

describe("RailPath", () => {
  const rail = flat();

  it("closes seamlessly and samples uniformly", () => {
    expect(rail.pts.length).toBe(RAIL_SAMPLES);
    const wrap = rail.pts[RAIL_SAMPLES - 1].distanceTo(rail.pts[0]);
    expect(Math.abs(wrap - rail.segLen) / rail.segLen).toBeLessThan(0.01);
    for (let i = 0; i < RAIL_SAMPLES; i++) {
      const p = rail.pts[i];
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      expect(Number.isFinite(p.z)).toBe(true);
    }
  });

  it("keeps grades gentle and curve radii long enough for the consist", () => {
    let maxGrade = 0;
    let minR = 1e9;
    for (let i = 0; i < RAIL_SAMPLES; i++) {
      const a = rail.pts[(i - 1 + RAIL_SAMPLES) % RAIL_SAMPLES];
      const b = rail.pts[i];
      const c = rail.pts[(i + 1) % RAIL_SAMPLES];
      maxGrade = Math.max(maxGrade, Math.abs(c.y - b.y) / rail.segLen);
      const ab = Math.hypot(b.x - a.x, b.z - a.z);
      const bc = Math.hypot(c.x - b.x, c.z - b.z);
      const ac = Math.hypot(c.x - a.x, c.z - a.z);
      const area2 = Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z));
      if (area2 > 1e-9) minR = Math.min(minR, (ab * bc * ac) / (2 * area2));
    }
    expect(maxGrade).toBeLessThan(0.06); // ≈ 3.4°
    expect(minR).toBeGreaterThan(90); // the consist is 34.5u long
  });

  it("queries the nearest point exactly on the centreline", () => {
    for (const i of [0, 100, 450, 800]) {
      const p = rail.pts[i];
      const info = rail.info(p.x, p.z);
      expect(info.dist).toBeLessThan(0.01);
      expect(Math.abs(info.y - p.y)).toBeLessThan(0.05);
    }
    // lateral offset reads as distance
    const p = rail.pts[200];
    const t = rail.tan[200];
    const info = rail.info(p.x - t.z * 10, p.z + t.x * 10);
    expect(Math.abs(info.dist - 10)).toBeLessThan(0.05);
  });

  it("poses wrap and advance by arc length", () => {
    const a: RailPose = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
    const b: RailPose = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
    rail.pose(0, a);
    rail.pose(rail.length, b);
    expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(0.05);
    rail.pose(50, a);
    rail.pose(0, b);
    // chord ≈ arc over 50u at these radii
    expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeGreaterThan(49.5);
    expect(Math.hypot(a.tx, a.ty, a.tz)).toBeCloseTo(1, 5);
  });
});
