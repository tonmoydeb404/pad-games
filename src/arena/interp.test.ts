import { describe, expect, it } from "vitest";
import type { Snapshot } from "@pad/arena-shared";
import { interpolate } from "./interp";

describe("interpolate", () => {
  it("lerps position between snapshots", () => {
    const mk = (t: number, x: number): Snapshot => ({
      t, phase: "playing", timeLeft: 1,
      players: [{ id: "a", name: "a", color: 0, x, y: 0, z: 0, vy: 0, og: true, yaw: 0, pitch: 0, hp: 100, alive: true, weapon: 0, kills: 0, deaths: 0, ack: 0, ammo: 1 }],
    });
    const out = interpolate([mk(0, 0), mk(100, 10)], 25);
    expect(out[0].x).toBeCloseTo(2.5);
  });
});
