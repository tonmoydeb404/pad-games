import { beforeAll, describe, expect, it } from "vitest";
import { HeightGrid } from "./ground";
import {
  IDLE_INTENT,
  initPhysics,
  PhysicsWorld,
  PropStreamer,
  TerrainStreamer,
  VehicleRig,
  type DriveIntent,
  type VehicleSpec,
} from "./physics";

const SPEC: VehicleSpec = {
  mass: 1000,
  length: 3.55,
  width: 1.9,
  wheelR: 0.5,
  axleOff: 0.42,
  wheels: [
    { x: -0.86, z: -1.28 },
    { x: 0.86, z: -1.28 },
    { x: -0.86, z: 1.32 },
    { x: 0.86, z: 1.32 },
  ],
  spring: 130,
  damp: 11,
  comY: -0.3,
  gravity: 20,
};
const DT = 1 / 60;

beforeAll(async () => {
  await initPhysics();
});

function grid(fn: (x: number, z: number) => number, size = 800, seg = 400): HeightGrid {
  const n = seg + 1;
  const H = new Float32Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) H[j * n + i] = fn(-size / 2 + (i * size) / seg, -size / 2 + (j * size) / seg);
  return new HeightGrid(size, seg, H);
}

interface Row {
  t: number;
  x: number;
  y: number;
  z: number;
  fwd: number;
  lat: number;
  wy: number;
  up: number;
  contacts: number;
  clear: number;
}

interface World {
  pw: PhysicsWorld;
  rig: VehicleRig;
  props: PropStreamer;
  g: HeightGrid;
  run: (secs: number, intent: (t: number, rig: VehicleRig) => Partial<DriveIntent>) => Row[];
}

function world(
  fn: (x: number, z: number) => number,
  opts: { start?: { x: number; y: number; z: number }; speed?: number; spec?: VehicleSpec } = {},
): World {
  const pw = new PhysicsWorld(20);
  const g = grid(fn);
  const ts = new TerrainStreamer(pw, g, 32, 1);
  const props = new PropStreamer(pw);
  const start = opts.start ?? { x: 0, y: 0, z: 0 };
  start.y = (opts.start ? start.y : g.sample(start.x, start.z) + 0.95) as number;
  ts.update(start.x, start.z, true);
  const rig = new VehicleRig(pw, opts.spec ?? SPEC, start);
  if (opts.speed) rig.body.setLinvel({ x: 0, y: 0, z: -opts.speed }, true);
  const run: World["run"] = (secs, intent) => {
    const rows: Row[] = [];
    for (let t = 0; t < secs; t += DT) {
      const p0 = rig.body.translation();
      ts.update(p0.x, p0.z);
      props.update(p0.x, p0.z);
      rig.drive({ ...IDLE_INTENT, ...intent(t, rig) }, DT);
      pw.step(DT);
      const p = rig.body.translation();
      const s = rig.speeds();
      rows.push({
        t,
        x: p.x,
        y: p.y,
        z: p.z,
        fwd: s.forward,
        lat: s.lateral,
        wy: rig.body.angvel().y,
        up: rig.up().y,
        contacts: rig.contacts,
        clear: p.y - g.sample(p.x, p.z),
      });
    }
    return rows;
  };
  return { pw, rig, props, g, run };
}

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
