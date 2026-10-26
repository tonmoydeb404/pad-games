/**
 * On-foot explorer (combat) — headless tests against the real engine
 * step: real terrain (HeightGrid), real prop colliders, real enter/exit state
 * machine. The Kenney mesh itself is stubbed; its loading path is exercised
 * by assets.test-style GLB checks and the browser.
 */
import { describe, expect, it } from "vitest";
import { distXZ, snap, walkingEngine } from "./explorer-helpers";

describe("on-foot explorer (combat)", () => {
  it("punches: swings, lands the hit on the timeline, and chains a combo", async () => {
    const { e, ex } = await walkingEngine();
    const swings: number[] = [];
    e.animals = {
      melee: (...a: number[]) => {
        swings.push(a[6]); // dmg
        return { hits: 1, kills: 0, heavy: false };
      },
      nearestTarget: () => null,
      findRideable: () => null,
    };
    e.startAction("punch");
    expect(e.foot.act).toBe("punch");
    for (let i = 0; i < 6; i++) e.updateExplorer(1 / 60, snap());
    expect(swings.length).toBe(0); // the fist hasn't arrived yet
    for (let i = 0; i < 20; i++) e.updateExplorer(1 / 60, snap());
    expect(swings.length).toBe(1);
    expect(ex.action).toBeNull();
    // second + third punches are a combo ending in a harder hook
    for (let n = 0; n < 2; n++) {
      e.startAction("punch");
      for (let i = 0; i < 40; i++) e.updateExplorer(1 / 60, snap());
    }
    expect(swings.length).toBe(3);
    expect(swings[2]).toBeGreaterThan(swings[0]);
  });

  it("dodge-rolls: moves fast, is invulnerable, costs stamina", async () => {
    const { e } = await walkingEngine();
    const f = e.foot;
    const a = f.pos.clone();
    e.lastMove.y = 1;
    e.startAction("roll");
    expect(f.act).toBe("roll");
    expect(f.invulnT).toBeGreaterThan(0.3);
    const s0 = e.player.vitals.stamina;
    e.hurtPlayer(20, 1, 0);
    expect(e.player.vitals.health).toBe(100); // i-frames
    for (let i = 0; i < 45; i++) e.updateExplorer(1 / 60, snap());
    expect(distXZ(f.pos, a)).toBeGreaterThan(3);
    expect(e.player.vitals.stamina).toBeLessThan(s0 + 1);
    expect(f.act).toBeNull();
  });

  it("animals can hurt the explorer; a knockout keeps you down until you get up at the jeep", async () => {
    const { e } = await walkingEngine();
    const f = e.foot;
    e.hurtPlayer(30, 1, 0);
    expect(e.player.vitals.health).toBe(70);
    expect(f.vx).toBeGreaterThan(3); // knocked back
    f.invulnT = 0;
    e.hurtPlayer(500, 1, 0);
    expect(e.player.vitals.health).toBe(0);
    expect(e.player.vitals.dead).toBe(true);
    expect(f.downT).toBeGreaterThan(0);
    for (let i = 0; i < 60 * 10; i++) e.updateExplorer(1 / 60, snap());
    expect(f.downT).toBeGreaterThan(0); // no auto-recover: still down after ten seconds
    (e.input as unknown as { consumeActions: () => string[] }).consumeActions = () => ["enter"];
    e.handleActions();
    expect(f.downT).toBe(0);
    expect(e.player.vitals.dead).toBe(false);
    expect(e.player.vitals.health).toBe(60);
    expect(distXZ(f.pos, e.v.pos)).toBeLessThan(3.7);
  });

});
