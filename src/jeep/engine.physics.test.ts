import { describe, expect, it } from "vitest";
import { CAR_CATALOG } from "./cars";
import { autopilot, makeEngine } from "./engineHarness";

describe("jeep engine on Rapier (headless)", () => {
  it("rides the real terrain for a long drive without sinking or floating", async () => {
    const e = await makeEngine();
    const st = autopilot(e, 40, 30);
    const c = st.clearance;
    expect(c.length).toBeGreaterThan(1500);
    // ride height is ~0.92; a full bottom-out on a landing is ~0.62 (0.3 of travel).
    // Below that the chassis would be in the ground — it measured 0.34 before the bump stops.
    expect(Math.min(...c)).toBeGreaterThan(0.6); // never underneath the surface
    expect(Math.max(...c)).toBeLessThan(1.3); // never hovering above it
    expect(st.minUp).toBeGreaterThan(0.6);
    expect(st.progress).toBeGreaterThan(0.2); // actually made progress along the trail
  });

  it("jump kickers launch the car and it lands on its wheels", async () => {
    const e = await makeEngine();
    const st = autopilot(e, 35, 30);
    expect(st.flights).toBeGreaterThanOrEqual(1);
    expect(st.airTicks).toBeGreaterThan(20);
    expect(st.minUp).toBeGreaterThan(0.6); // no flip
    e.v.throttle = 0;
    e.v.brake = 1;
    for (let i = 0; i < 240; i++) e.updateVehicle(1 / 60);
    expect(e.rig.contacts).toBeGreaterThanOrEqual(3);
    expect(e.rig.up().y).toBeGreaterThan(0.9);
  });

  for (const id of ["race", "garbage-truck", "tractor", "kart-oobi"]) {
    it(`${id} handles the trail without flipping`, async () => {
      const e = await makeEngine();
      e.perf = { ...CAR_CATALOG.find((c) => c.id === id)!.perf };
      e.rebuildRig();
      e.resetVehicle(Math.floor(1400 * 0.01));
      for (let i = 0; i < 60; i++) e.updateVehicle(1 / 60);
      const st = autopilot(e, 30, 46.8 * e.perf.speed * 0.75);
      expect(st.minUp).toBeGreaterThan(0.6);
      expect(st.progress).not.toBeNaN();
    }, 30000);
  }

  describe("obstacles", () => {
    /** Place trunks relative to the car's start pose; drive straight ahead. */
    async function trunkRun(trunks: { ahead: number; side: number; r: number }[]) {
      const e = await makeEngine();
      const v = e.v;
      // a straight, flat-ish run: reset onto the trail and keep its heading
      const fx = -Math.sin(v.yaw);
      const fz = -Math.cos(v.yaw);
      const rx = Math.cos(v.yaw);
      const rz = -Math.sin(v.yaw);
      const x0 = v.pos.x;
      const z0 = v.pos.z;
      for (const t of trunks) e.addCollider(x0 + fx * t.ahead + rx * t.side, z0 + fz * t.ahead + rz * t.side, t.r, 0.24);
      let hits = 0;
      let maxImpact = 0;
      const orig = e.collisionFx.bind(e);
      e.collisionFx = (i: number, nx: number, nz: number) => {
        hits++;
        maxImpact = Math.max(maxImpact, i);
        orig(i, nx, nz);
      };
      let maxAlong = 0;
      let minUp = 1;
      v.steerTarget = 0;
      for (let k = 0; k < 60 * 5; k++) {
        v.throttle = v.speed < 14 ? 1 : 0;
        e.updateVehicle(1 / 60);
        maxAlong = Math.max(maxAlong, (v.pos.x - x0) * fx + (v.pos.z - z0) * fz);
        minUp = Math.min(minUp, e.rig.up().y);
      }
      return { hits, maxImpact, maxAlong, minUp, speed: v.speed };
    }

    it("a trunk dead ahead stops the car; it never drives through", async () => {
      const r = await trunkRun([{ ahead: 22, side: 0, r: 0.5 }]);
      expect(r.hits).toBeGreaterThanOrEqual(1);
      expect(r.maxAlong).toBeLessThan(22.5);
      expect(r.minUp).toBeGreaterThan(0.6);
    });

    it("the car fits through a gap wider than itself, and not through a narrower one", async () => {
      // trunks of r=0.4 either side: clear gaps of 3.0 (> car width 1.9) and 1.2 (< 1.9)
      const wide = await trunkRun([
        { ahead: 22, side: -1.9, r: 0.4 },
        { ahead: 22, side: 1.9, r: 0.4 },
      ]);
      expect(wide.hits).toBe(0);
      expect(wide.maxAlong).toBeGreaterThan(40);
      const narrow = await trunkRun([
        { ahead: 22, side: -1.0, r: 0.4 },
        { ahead: 22, side: 1.0, r: 0.4 },
      ]);
      expect(narrow.hits).toBeGreaterThanOrEqual(1);
      expect(narrow.maxAlong).toBeLessThan(22.5);
    });
  });

  describe("crash haptics", () => {
    async function crash(speed: number, side: number) {
      const e = await makeEngine();
      const v = e.v;
      const fx = -Math.sin(v.yaw);
      const fz = -Math.cos(v.yaw);
      const rx = Math.cos(v.yaw);
      const rz = -Math.sin(v.yaw);
      e.addCollider(v.pos.x + fx * 20 + rx * side, v.pos.z + fz * 20 + rz * side, 0.5, 0.24);
      const crashes: number[] = [];
      const rumbles: number[] = [];
      const orig = e.collisionFx.bind(e);
      e.collisionFx = (i: number, a: number, b: number) => {
        crashes.push(i);
        orig(i, a, b);
      };
      e.input.rumble = (strength: number) => rumbles.push(strength);
      v.steerTarget = 0;
      for (let k = 0; k < 60 * 14; k++) {
        v.throttle = v.speed < speed ? 1 : 0;
        e.updateVehicle(1 / 60);
        e.time += 1 / 60;
      }
      return { crashes, rumbles };
    }

    it("every crash rumbles the pad, harder the faster you hit", async () => {
      const first: number[] = [];
      for (const speed of [2, 5, 15, 30]) {
        const r = await crash(speed, 0);
        expect(r.crashes.length).toBeGreaterThanOrEqual(1);
        expect(r.rumbles.length).toBeGreaterThanOrEqual(1);
        first.push(r.rumbles[0]);
      }
      for (let i = 1; i < first.length; i++) expect(first[i]).toBeGreaterThanOrEqual(first[i - 1]);
      expect(first[0]).toBeGreaterThan(0.3); // even a nudge is felt
      expect(first[first.length - 1]).toBeGreaterThan(0.9); // a hard hit is full strength
    });

    it("a glancing hit rumbles too", async () => {
      const r = await crash(15, 1.3);
      expect(r.crashes.length).toBeGreaterThanOrEqual(1);
      expect(r.rumbles[0]).toBeGreaterThan(0.6);
    });

    it("pressing against an obstacle does not re-fire the full crash effect every tick", async () => {
      const r = await crash(10, 0);
      expect(r.crashes.length).toBeLessThanOrEqual(4); // the hit and a rebound or two — not ~70
      // later contact is light scrape rumble, not full-strength hits
      expect(Math.max(...r.rumbles.slice(6))).toBeLessThan(0.7);
    });
  });

  it("folds a wildlife-style speed change (v.speed edit) into the rigid body", async () => {
    const e = await makeEngine();
    const v = e.v;
    v.throttle = 1;
    for (let i = 0; i < 180; i++) e.updateVehicle(1 / 60);
    const before = v.speed;
    expect(before).toBeGreaterThan(15);
    v.throttle = 0;
    v.speed *= 0.3; // what AnimalHost.onJeepImpact does
    e.updateVehicle(1 / 60);
    expect(v.speed).toBeLessThan(before * 0.4);
    expect(v.speed).toBeGreaterThan(before * 0.2);
  });
});
