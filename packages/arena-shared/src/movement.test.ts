import { describe, expect, it } from "vitest";
import { SIM_DT } from "./constants";
import { MAP_PICKUPS, MAP_PROPS, SPAWN_POINTS, insideSolid } from "./map";
import { rayPlayer, rayWorld } from "./raycast";
import { stepMove } from "./movement";
import type { MoveState } from "./types";

const fresh = (): MoveState => ({ x: 0, y: 0.01, z: 20, vy: 0, onGround: false });
const idle = { mx: 0, mz: 0, yaw: 0, jump: false };

describe("stepMove", () => {
  it("lands on the floor and stays there", () => {
    const s = fresh();
    for (let i = 0; i < 30; i++) stepMove(s, idle, SIM_DT);
    expect(s.onGround).toBe(true);
    expect(s.y).toBeCloseTo(0, 3);
  });

  it("moves forward (-z at yaw 0)", () => {
    const s = fresh();
    for (let i = 0; i < 30; i++) stepMove(s, { ...idle, mz: 1 }, SIM_DT);
    expect(s.z).toBeLessThan(20 - 2);
    expect(Math.abs(s.x)).toBeLessThan(1e-6);
  });

  it("is stopped by walls", () => {
    // north gallery (col 12, row 2) walking west — stops at the NW room's east wall
    const s: MoveState = { x: 0, y: 0.01, z: -19, vy: 0, onGround: false };
    for (let i = 0; i < 30; i++) stepMove(s, idle, SIM_DT);
    for (let i = 0; i < 120; i++) stepMove(s, { ...idle, mx: -1 }, SIM_DT);
    expect(s.x).toBeLessThanOrEqual(-5); // clamped at the wall face (x −6 + radius)
    expect(s.x).toBeGreaterThan(-8);
  });

  it("climbs the dais stairs with auto-step", () => {
    // north stair tile (row 10, cols 11–12), walking south (+z) toward the dais
    const s: MoveState = { x: 1, y: 0.01, z: -6.4, vy: 0, onGround: false };
    for (let i = 0; i < 30; i++) stepMove(s, idle, SIM_DT); // settle
    for (let i = 0; i < 40; i++) stepMove(s, { ...idle, mz: 1, yaw: Math.PI }, SIM_DT);
    expect(s.y).toBeGreaterThan(0.85); // dais top is 0.9
    expect(s.onGround).toBe(true);
    // and descends the far side
    for (let i = 0; i < 60; i++) stepMove(s, { ...idle, mz: 1, yaw: Math.PI }, SIM_DT);
    expect(s.z).toBeGreaterThan(2); // past the dais (z ≤ 2)
    expect(s.y).toBeLessThan(0.6);
  });

  it("is blocked by a half-wall taller than one step", () => {
    // half-wall tiles at rows 11–12, col 5 — walk east into it from x −16
    const s: MoveState = { x: -16, y: 0.01, z: 0.05, vy: 0, onGround: false };
    for (let i = 0; i < 30; i++) stepMove(s, idle, SIM_DT);
    for (let i = 0; i < 90; i++) stepMove(s, { ...idle, mx: 1, yaw: Math.PI / 2 }, SIM_DT);
    // must stop before the wall tile (x −14..−12), not climb it
    expect(s.x).toBeLessThan(-12.4);
  });

  it("is deterministic", () => {
    const run = () => {
      const s = fresh();
      for (let i = 0; i < 100; i++) stepMove(s, { mx: 1, mz: 1, yaw: i * 0.01, jump: i % 40 === 0 }, SIM_DT);
      return s;
    };
    expect(run()).toEqual(run());
  });
});

describe("map data", () => {
  it("keeps every spawn point on open floor", () => {
    for (const sp of SPAWN_POINTS) expect(insideSolid(sp[0], sp[2])).toBe(false);
  });

  it("keeps every pickup reachable on open floor", () => {
    for (const p of MAP_PICKUPS) expect(insideSolid(p.x, p.z)).toBe(false);
  });

  it("keeps dynamic props on open floor", () => {
    for (const p of MAP_PROPS) {
      if (p.target) continue; // targets hang on walls
      expect(insideSolid(p.x, p.z)).toBe(false);
    }
  });
});

describe("raycast", () => {
  it("hits a player box and is blocked by walls", () => {
    expect(rayPlayer([0, 1.6, 0], [0, 0, -1], 0, 0, -10, 50)).toBeCloseTo(9.6, 1);
    expect(rayWorld([0, 1.6, 20], [0, 0, 1], 100)).toBeLessThan(11);
  });
});
