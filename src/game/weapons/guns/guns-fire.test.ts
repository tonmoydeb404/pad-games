/**
 * On-foot guns through the real engine step: drawing a gun, pulling the
 * trigger (ammo, cooldown, pellets, hit-scan against animals / terrain /
 * trunks), reloading, melee being disabled while armed, and holstering when
 * hopping in the jeep. Animals and the Kenney rig are stubbed.
 */
import { describe, expect, it } from "vitest";
import { GUNS } from "../weapons";
import { armedEngine, run } from "./guns-helpers";

describe("on-foot guns (firing)", () => {
  it("draws a gun by number, swaps, cycles back to fists, and equips with a short delay", async () => {
    const { e, calls } = await armedEngine();
    expect(e.armory.gun).toBeNull();
    e.switchWeapon(3);
    expect(e.armory.gun?.name).toBe("Longshot");
    expect(calls).toContain("gun");
    e.switchWeapon(0);
    expect(e.armory.gun).toBeNull();
    expect(calls[calls.length - 1]).not.toBe("gun");
    // the cycle key walks fists → 1 → 2 …
    e.switchWeapon(-1);
    expect(e.armory.selected).toBe(1);
    e.switchWeapon(-1);
    expect(e.armory.selected).toBe(2);
  });

  it("firing spends a round, respects the fire rate, and shoots along the camera ray", async () => {
    const { e, shots, calls } = await armedEngine();
    e.switchWeapon(1); // sidearm: semi-auto, 12 rounds
    run(e, 30); // swap delay
    expect(e.armory.mag).toBe(12);
    run(e, 1, { fire: true });
    expect(e.armory.mag).toBe(11);
    expect(shots).toHaveLength(1);
    expect(calls.filter((c) => c.startsWith("gunshot")).length).toBe(1);
    expect(calls).toContain("gunshot:pistol");
    // the ray points down the camera's -Z line, starting in front of the player
    expect(shots[0].d[2]).toBeLessThan(-0.99);
    expect(Math.abs(shots[0].d[0])).toBeLessThan(0.05);
    expect(shots[0].o[2]).toBeLessThan(e.camera.position.z);
    // holding the trigger on a semi-auto doesn't machine-gun
    run(e, 40, { fire: true });
    expect(e.armory.mag).toBe(11);
    // release and pull again: another shot
    run(e, 5);
    run(e, 1, { fire: true });
    expect(e.armory.mag).toBe(10);
  });

  it("an automatic gun keeps firing while the trigger is held, at its own rate", async () => {
    const { e, shots } = await armedEngine();
    e.switchWeapon(2); // Ripper: 0.085 s
    run(e, 30);
    run(e, 60, { fire: true }); // 1 s
    expect(shots.length).toBeGreaterThanOrEqual(10);
    expect(shots.length).toBeLessThanOrEqual(13);
  });

  it("the shotgun throws eight pellets in a spread; each is a separate ray", async () => {
    const { e, shots } = await armedEngine();
    e.switchWeapon(4);
    run(e, 30);
    run(e, 1, { fire: true });
    expect(shots).toHaveLength(8);
    const xs = new Set(shots.map((s) => s.d[0].toFixed(4)));
    expect(xs.size).toBeGreaterThan(4); // genuinely different directions
    for (const s of shots) expect(s.maxT).toBeLessThanOrEqual(GUNS[3].range);
  });

  it("aiming tightens the spread compared to firing from the hip", async () => {
    const spreadOf = async (aim: boolean): Promise<number> => {
      const { e, shots } = await armedEngine();
      e.switchWeapon(4);
      run(e, 30);
      for (let i = 0; i < 12; i++) {
        run(e, 1, { fire: true, aim });
        run(e, 60);
      }
      const ys = shots.map((s) => s.d[0]);
      const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
      return Math.sqrt(ys.reduce((a, b) => a + (b - mean) ** 2, 0) / ys.length);
    };
    expect(await spreadOf(true)).toBeLessThan(await spreadOf(false));
  });

  it("bullets stop at terrain and at trunks", async () => {
    const { e, shots } = await armedEngine();
    e.switchWeapon(3);
    run(e, 30);
    // a wide trunk 12 m dead ahead of the muzzle line
    const f = e.foot.pos;
    e.colliders.push({ x: f.x, z: f.z - 12, r: 2 });
    run(e, 1, { fire: true });
    const t = shots[shots.length - 1].maxT;
    expect(t).toBeGreaterThan(6);
    expect(t).toBeLessThan(15); // stopped by the trunk, not the 110 m range
    // straight into the ground
    e.rayWorld(f.x, f.y + 2, f.z, 0, -1, 0, 50);
    expect(e.rayWorld(f.x, f.y + 2, f.z, 0, -1, 0, 50)).toBeGreaterThan(1.5);
    expect(e.rayWorld(f.x, f.y + 2, f.z, 0, -1, 0, 50)).toBeLessThan(2.6);
  });

});
