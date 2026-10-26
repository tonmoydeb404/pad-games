import { beforeAll, describe, expect, it } from "vitest";
import { initPhysics } from "./index";
import { world } from "./test-helpers";

beforeAll(async () => {
  await initPhysics();
});

describe("vehicle on terrain", () => {
  it("settles at ride height without jitter", () => {
    const w = world(() => 0);
    const r = w.run(3, () => ({}));
    const last = r[r.length - 1];
    expect(last.clear).toBeGreaterThan(0.88);
    expect(last.clear).toBeLessThan(0.98);
    expect(last.contacts).toBe(4);
    const ys = r.slice(90).map((q) => q.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.01);
  });

  it("a hard landing bottoms out on its bump stops instead of sinking into the ground", () => {
    // dropped from 6 units: ~15 u/s at impact, far beyond what 0.3 of travel can absorb alone
    const w = world(() => 0, { start: { x: 0, y: 6.5, z: 0 } });
    const r = w.run(3, () => ({}));
    expect(Math.min(...r.map((f) => f.clear))).toBeGreaterThan(0.5); // chassis never reaches the ground
    const last = r[r.length - 1];
    expect(last.clear).toBeGreaterThan(0.88);
    expect(last.clear).toBeLessThan(0.98);
    expect(last.up).toBeGreaterThan(0.99);
  });

  it("hard braking from speed stops the car without pitching it over", () => {
    for (const speed of [25, 45]) {
      const w = world(() => 0, { speed });
      const r = w.run(4, (_t, rig) => ({ brakeAccel: rig.speeds().forward > 0.2 ? 30 : 0 }));
      expect(Math.min(...r.map((f) => f.up))).toBeGreaterThan(0.93); // < ~21° of nose dive
      expect(r[r.length - 1].fwd).toBeLessThan(0.5);
      expect(r[r.length - 1].contacts).toBe(4);
      // and it actually brakes at about the commanded rate (not a skid-less instant stop)
      const stopT = r.findIndex((f) => f.fwd < 1) / 60;
      expect(stopT).toBeGreaterThan((speed / 30) * 0.8);
      expect(stopT).toBeLessThan((speed / 30) * 1.4);
    }
  });

  it("drives toward -Z under positive drive acceleration", () => {
    const w = world(() => 0);
    const r = w.run(3, () => ({ driveAccel: 12 }));
    const last = r[r.length - 1];
    expect(last.fwd).toBeGreaterThan(20);
    expect(last.z).toBeLessThan(-20);
    expect(Math.abs(last.x)).toBeLessThan(1);
    expect(last.up).toBeGreaterThan(0.99);
  });

  it("rides a steady climb and descent without sinking or floating", () => {
    const slope = Math.tan(0.26);
    for (const dir of [1, -1]) {
      const w = world((_x, z) => -z * slope * dir, { speed: 22 });
      const r = w.run(5, (_t, rig) => ({ driveAccel: rig.speeds().forward < 22 ? 12 : 0 }));
      for (const f of r.slice(120)) {
        expect(f.clear).toBeGreaterThan(0.75); // never underneath the surface
        expect(f.clear).toBeLessThan(1.15); // never floating
        expect(f.contacts).toBeGreaterThanOrEqual(3);
      }
      expect(r[r.length - 1].up).toBeGreaterThan(0.95);
    }
  });

  it("launches off a ramp, flies, lands on its wheels and settles", () => {
    const slope = Math.tan(0.3);
    const top = 20 * slope;
    const ground = (_x: number, z: number) => (z > -40 ? 0 : z > -60 ? (-40 - z) * slope : top);
    const w = world(ground, { speed: 32 });
    const r = w.run(7, () => ({}));
    const airFrames = r.filter((f) => f.contacts === 0).length;
    expect(airFrames).toBeGreaterThan(15);
    expect(Math.max(...r.map((f) => f.clear))).toBeGreaterThan(1.8);
    const last = r[r.length - 1];
    expect(last.contacts).toBeGreaterThanOrEqual(3);
    expect(last.up).toBeGreaterThan(0.97);
    expect(last.clear).toBeLessThan(1.05);
  });

  it("steers at speed with the yaw assist and stays on its wheels", () => {
    for (const speed of [12, 25, 40]) {
      const L = 2.6;
      const target = 0.8;
      const w = world(() => 0, { speed });
      const r = w.run(4, (_t, rig) => ({
        driveAccel: rig.speeds().forward < speed ? 8 : 0,
        steerAngle: Math.min(0.55, Math.atan((target * L) / Math.max(speed, 1.5))),
        yawTarget: target,
      }));
      const steady = r.slice(150);
      const meanYaw = steady.reduce((a, f) => a + f.wy, 0) / steady.length;
      expect(meanYaw).toBeGreaterThan(target * 0.6); // + = left, matches steerAngle sign
      expect(meanYaw).toBeLessThan(target * 1.4);
      expect(Math.min(...r.map((f) => f.up))).toBeGreaterThan(0.85); // no rollover
      expect(Math.max(...r.map((f) => Math.abs(f.lat)))).toBeLessThan(speed * 0.45);
    }
  });
});

