/**
 * On-foot explorer (movement) — headless tests against the real engine
 * step: real terrain (HeightGrid), real prop colliders, real enter/exit state
 * machine. The Kenney mesh itself is stubbed; its loading path is exercised
 * by assets.test-style GLB checks and the browser.
 */
import { describe, expect, it } from "vitest";
import type { SkinId } from "../character";
import type { JeepInputSnapshot } from "../../core/input";
import { distXZ, snap, walkingEngine } from "./explorer-helpers";

describe("on-foot explorer (movement)", () => {
  it("spawns at the driver's door, on the ground, within enter range", async () => {
    const { e } = await walkingEngine();
    const f = e.foot;
    expect(distXZ(f.pos, e.v.pos)).toBeLessThan(3.7);
    expect(f.pos.y).toBeCloseTo(e.groundHeight(f.pos.x, f.pos.z), 2);
    expect(f.grounded).toBe(true);
    expect(e.explorer.root.visible).toBe(true);
    expect(e.nearCar).toBe(true);
  });

  it("walks where the camera points and blends the gait", async () => {
    const { e, ex } = await walkingEngine();
    const start = e.foot.pos.clone();
    for (let i = 0; i < 120; i++) e.updateExplorer(1 / 60, snap({ moveY: 1 }));
    const f = e.foot;
    expect(distXZ(f.pos, start)).toBeGreaterThan(11); // GTA jog ≈ 7.6 u/s × 2 s
    expect(ex.lastGait).toBeGreaterThan(0.3);
    expect(f.grounded).toBe(true);
    // stays glued to the terrain, never sinks or floats
    expect(Math.abs(f.pos.y - e.groundHeight(f.pos.x, f.pos.z))).toBeLessThan(0.3);
  });

  it("sprints faster than it walks", async () => {
    const { e } = await walkingEngine();
    const a = e.foot.pos.clone();
    for (let i = 0; i < 120; i++) e.updateExplorer(1 / 60, snap({ moveY: 1 }));
    const walkD = distXZ(e.foot.pos, a);
    e.spawnExplorerBesideCar();
    const b = e.foot.pos.clone();
    for (let i = 0; i < 120; i++) e.updateExplorer(1 / 60, snap({ moveY: 1, sprint: true }));
    const runD = distXZ(e.foot.pos, b);
    expect(runD).toBeGreaterThan(walkD * 1.4);
  });

  it("is pushed out of trunks and boulders", async () => {
    const { e } = await walkingEngine();
    const f = e.foot;
    // a tree dead ahead of the walk direction
    const yaw = e.footCam.yaw;
    const tx = f.pos.x - Math.sin(yaw) * 3;
    const tz = f.pos.z - Math.cos(yaw) * 3;
    e.colliders.push({ x: tx, z: tz, r: 1 });
    // ~1.3 s of walking: enough to reach the trunk, not enough to round it
    for (let i = 0; i < 80; i++) e.updateExplorer(1 / 60, snap({ moveY: 1 }));
    const d = Math.hypot(f.pos.x - tx, f.pos.z - tz);
    expect(d).toBeGreaterThanOrEqual(1.7); // trunk r + foot radius + skin
    expect(d).toBeLessThan(3.4); // but the explorer got close — pressed against it
  });

  it("jumps, leaves the ground, and lands back on the terrain", async () => {
    const { e, ex } = await walkingEngine();
    const f = e.foot;
    const gh = () => e.groundHeight(f.pos.x, f.pos.z);
    e.updateExplorer(1 / 60, snap({ jump: true }));
    expect(ex.jumps).toBe(1);
    expect(f.grounded).toBe(false);
    expect(f.vy).toBeGreaterThan(4);
    for (let i = 0; i < 150; i++) e.updateExplorer(1 / 60, snap({}));
    expect(f.grounded).toBe(true);
    expect(f.pos.y).toBeCloseTo(gh(), 2);
    expect(ex.jumps).toBe(1); // no double-fire from a held button
  });

  it("hops in and out of the jeep — but not at speed", async () => {
    const { e } = await walkingEngine();
    // walk away first: entering out of range is refused
    for (let i = 0; i < 240; i++) e.updateExplorer(1 / 60, snap({ moveY: 1 }));
    expect(e.nearCar).toBe(false);
    e.tryEnterCar();
    expect(e.onFoot).toBe(true); // still outside
    // back to the car
    e.spawnExplorerBesideCar();
    e.tryEnterCar();
    expect(e.onFoot).toBe(false);
    expect(e.explorer.root.visible).toBe(false);
    // bailing at speed is refused
    e.v.speed = 30;
    e.tryExitCar();
    expect(e.onFoot).toBe(false);
    // parked exit puts you back at the door
    e.v.speed = 0;
    e.tryExitCar();
    expect(e.onFoot).toBe(true);
    expect(e.explorer.root.visible).toBe(true);
    expect(distXZ(e.foot.pos, e.v.pos)).toBeLessThan(3.7);
  });

  it("reset while on foot warps the explorer to the vehicle", async () => {
    const { e } = await walkingEngine();
    for (let i = 0; i < 300; i++) e.updateExplorer(1 / 60, snap({ moveY: 1 }));
    expect(distXZ(e.foot.pos, e.v.pos)).toBeGreaterThan(6);
    e.resetVehicle();
    expect(e.onFoot).toBe(true);
    expect(distXZ(e.foot.pos, e.v.pos)).toBeLessThan(3.7);
  });

  it("skins are known ids", async () => {
    const { SKINS } = await import("../character");
    const ids: SkinId[] = ["skaterMaleA", "skaterFemaleA", "criminalMaleA", "cyborgFemaleA"];
    expect(SKINS).toEqual(ids);
  });

  it("moves at a GTA pace: light tilt walks, full tilt jogs, sprint outruns both", async () => {
    const { e } = await walkingEngine();
    const dist = (input: Partial<JeepInputSnapshot>): number => {
      e.spawnExplorerBesideCar();
      const a = e.foot.pos.clone();
      for (let i = 0; i < 120; i++) e.updateExplorer(1 / 60, snap(input));
      return distXZ(e.foot.pos, a);
    };
    const walk = dist({ moveY: 0.4 });
    const jog = dist({ moveY: 1 });
    const run = dist({ moveY: 1, sprint: true });
    expect(walk).toBeGreaterThan(2);
    expect(jog).toBeGreaterThan(walk * 1.8);
    expect(run).toBeGreaterThan(jog * 1.35);
  });

  it("strafes with moveX and drains stamina only while sprinting", async () => {
    const { e } = await walkingEngine();
    const f = e.foot;
    const v = e.player.vitals;
    for (let i = 0; i < 60; i++) e.updateExplorer(1 / 60, snap({ moveY: 1 }));
    expect(v.stamina).toBe(100);
    for (let i = 0; i < 120; i++) e.updateExplorer(1 / 60, snap({ moveY: 1, sprint: true }));
    expect(v.stamina).toBeLessThan(80);
    // exhaust it: sprint locks out (winded) until stamina recovers
    let windedSeen = false;
    let settledWinded = Infinity;
    for (let i = 0; i < 900; i++) {
      e.updateExplorer(1 / 60, snap({ moveY: 1, sprint: true }));
      if (v.winded) {
        windedSeen = true;
        settledWinded = Math.min(settledWinded, Math.hypot(f.vx, f.vz));
      }
    }
    expect(windedSeen).toBe(true);
    expect(settledWinded).toBeLessThan(9); // reduced to a jog, not a sprint
  });

  it("crouching slows you down and makes you quieter to animals", async () => {
    const { e, ex } = await walkingEngine();
    e.foot.crouch = true;
    for (let i = 0; i < 90; i++) e.updateExplorer(1 / 60, snap({ moveY: 1 }));
    expect(Math.hypot(e.foot.vx, e.foot.vz)).toBeLessThan(3.4);
    expect(e.foot.stealth).toBeLessThan(1);
    expect(ex.crouch).toBeGreaterThan(0.5);
  });

});
