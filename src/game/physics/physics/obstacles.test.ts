import { beforeAll, describe, expect, it } from "vitest";
import { initPhysics, PhysicsWorld, PropStreamer, TerrainStreamer } from "./index";
import { DT, grid, world } from "./test-helpers";

beforeAll(async () => {
  await initPhysics();
});

describe("obstacles", () => {
  const trunk = (x: number, z: number, r = 0.5) => ({
    shape: { kind: "cylinder" as const, halfHeight: 7, radius: r },
    x,
    y: 6.5,
    z,
    e: 0.24,
  });

  it("stops against a trunk instead of driving through it", () => {
    const w = world(() => 0, { speed: 20 });
    w.props.add(trunk(0, -30));
    const r = w.run(4, () => ({}));
    expect(Math.min(...r.map((f) => f.z))).toBeGreaterThan(-30 + 0.5); // never crosses the trunk
    expect(Math.abs(r[r.length - 1].fwd)).toBeLessThan(6);
    expect(Math.min(...r.map((f) => f.up))).toBeGreaterThan(0.8);
  });

  it("passes beside a trunk that the old fat collider would have blocked", () => {
    // trunk 2.4 units off the car's line: clear for a 1.9-wide car, blocked by a 1.3+0.9 disc
    const w = world(() => 0, { speed: 15 });
    w.props.add(trunk(2.4, -30, 0.4));
    const r = w.run(4, () => ({ driveAccel: 4 }));
    expect(r[r.length - 1].z).toBeLessThan(-45);
    expect(Math.abs(r[r.length - 1].fwd)).toBeGreaterThan(12);
  });

  it("clears a low boulder when airborne over it", () => {
    const slope = Math.tan(0.3);
    const top = 20 * slope;
    const ground = (_x: number, z: number) => (z > -40 ? 0 : z > -60 ? (-40 - z) * slope : top);
    const w = world(ground, { speed: 34 });
    // boulder on the flat just past the lip, below the flight path
    w.props.add({ shape: { kind: "ball", radius: 0.9 }, x: 0, y: top + 0.3, z: -72, e: 0.5 });
    const r = w.run(5, () => ({}));
    expect(r.some((f) => f.z < -85)).toBe(true);
  });

  it("log capsule blocks along its real axis, not at a blob in the middle", () => {
    const pw = new PhysicsWorld(20);
    const g = grid(() => 0);
    const ts = new TerrainStreamer(pw, g, 32, 1);
    const props = new PropStreamer(pw);
    ts.update(0, 0, true);
    // log along +X (rotY = 0), 8 long, centred at the origin
    props.add({ shape: { kind: "log", halfLen: 3.6, radius: 0.4 }, x: 0, y: 0.6, z: 0, rotY: 0, e: 0.5 });
    props.update(0, 0);
    pw.step(DT);
    const hit = (x: number, z: number) => pw.groundAt(x, z, 5) !== null && (pw.groundAt(x, z, 5) as number) > 0.5;
    expect(hit(3.5, 0)).toBe(true); // far end of the log
    expect(hit(-3.5, 0)).toBe(true);
    expect(hit(0, 3.5)).toBe(false); // across the log there's nothing
  });

  it("streams props in and out with the car", () => {
    const pw = new PhysicsWorld(20);
    const props = new PropStreamer(pw);
    for (let i = 0; i < 2000; i++) props.add({ shape: { kind: "ball", radius: 0.3 }, x: (i % 50) * 20, y: 0, z: Math.floor(i / 50) * 20, e: 0.2 });
    props.update(0, 0, 60);
    expect(props.total).toBe(2000);
    expect(props.active).toBeGreaterThan(0);
    expect(props.active).toBeLessThan(60);
    props.update(900, 700, 60);
    expect(props.active).toBeLessThan(60);
  });
});

