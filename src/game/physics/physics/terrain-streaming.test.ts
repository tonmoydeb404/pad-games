import { beforeAll, describe, expect, it } from "vitest";
import { initPhysics, PhysicsWorld, TerrainStreamer } from "./index";
import { DT, grid } from "./test-helpers";

beforeAll(async () => {
  await initPhysics();
});

describe("terrain streaming", () => {
  it("heightfield chunks reproduce the lattice surface exactly", () => {
    const fn = (x: number, z: number) => Math.sin(x * 0.05) * 3 + Math.cos(z * 0.07) * 2 + x * 0.01;
    const pw = new PhysicsWorld(20);
    const g = grid(fn);
    const ts = new TerrainStreamer(pw, g, 32, 1);
    ts.update(10, -30, true);
    pw.step(DT);
    for (const [x, z] of [[3.3, -7.1], [-41.2, 18.8], [60.4, -80.4], [-70.5, -120.1], [0.7, 0.2]]) {
      expect(pw.groundAt(x, z)).toBeCloseTo(g.sample(x, z), 2);
    }
  });

  it("loads chunks around the car and drops them behind", () => {
    const pw = new PhysicsWorld(20);
    const g = grid(() => 0);
    const ts = new TerrainStreamer(pw, g, 32, 1);
    ts.update(-300, -300, true);
    const first = ts.loaded;
    expect(first).toBeGreaterThanOrEqual(4);
    expect(first).toBeLessThanOrEqual(9);
    ts.update(300, 300);
    pw.step(DT);
    expect(pw.groundAt(300, 300)).toBeCloseTo(0, 2);
    expect(pw.groundAt(-300, -300)).toBeNull(); // far chunk was retired
    expect(ts.loaded).toBeLessThanOrEqual(9);
  });
});

