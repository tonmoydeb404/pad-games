import { describe, expect, it } from "vitest";
import { Armory, GUNS, SWAP_SECONDS, damageAt } from "./weapons";

describe("Armory", () => {
  it("starts with fists; selecting a gun equips it after a short swap delay", () => {
    const a = new Armory();
    expect(a.gun).toBeNull();
    expect(a.fire()).toBe(false);
    expect(a.select(2)).toBe(true);
    expect(a.gun?.name).toBe("Ripper");
    expect(a.fire()).toBe(false); // still bringing it up
    a.update(SWAP_SECONDS + 0.01);
    expect(a.fire()).toBe(true);
    expect(a.select(2)).toBe(false); // already equipped
    expect(a.select(99)).toBe(false);
  });

  it("cycles fists → guns → fists in both directions", () => {
    const a = new Armory();
    for (let i = 1; i <= GUNS.length; i++) {
      a.cycle(1);
      expect(a.selected).toBe(i);
    }
    a.cycle(1);
    expect(a.selected).toBe(0);
    a.cycle(-1);
    expect(a.selected).toBe(GUNS.length);
  });

  it("respects each gun's fire rate and uses up the magazine", () => {
    const a = new Armory();
    a.select(1); // sidearm: 12 rounds, 0.26 s
    a.update(1);
    expect(a.mag).toBe(12);
    expect(a.fire()).toBe(true);
    expect(a.fire()).toBe(false); // cooling down
    a.update(0.27);
    expect(a.fire()).toBe(true);
    expect(a.mag).toBe(10);
  });

  it("empties, auto-reloads from the reserve, and the sidearm never runs dry", () => {
    const a = new Armory();
    a.select(4); // shotgun: 6 shells, 18 spare
    a.update(1);
    for (let i = 0; i < 6; i++) {
      expect(a.fire()).toBe(true);
      a.update(1);
      if (i < 5) expect(a.reloading).toBe(false);
    }
    expect(a.mag).toBe(0);
    expect(a.reloading).toBe(true); // auto-started on the last shell
    expect(a.fire()).toBe(false); // can't shoot mid-reload
    a.update(GUNS[3].reloadSeconds + 0.01);
    expect(a.mag).toBe(6);
    expect(a.reserve).toBe(12);

    // burn the whole shotgun supply: it ends dry
    for (let n = 0; n < 40; n++) {
      a.update(3);
      a.fire();
    }
    expect(a.dry).toBe(true);
    expect(a.reload()).toBe(false);

    // the sidearm reloads forever
    const b = new Armory();
    b.select(1);
    b.update(1);
    for (let n = 0; n < 200; n++) {
      b.update(2);
      b.fire();
    }
    expect(b.dry).toBe(false);
    expect(b.reserve).toBe(Infinity);
  });

  it("manual reload tops up a part-empty magazine only when it helps; a swap cancels it", () => {
    const a = new Armory();
    a.select(2);
    a.update(1);
    expect(a.reload()).toBe(false); // already full
    a.fire();
    a.update(1);
    expect(a.reload()).toBe(true);
    expect(a.reloading).toBe(true);
    a.select(3);
    expect(a.reloading).toBe(false);
    a.select(2);
    a.update(1);
    expect(a.mag).toBe(29); // the cancelled reload gave nothing
  });

  it("resupply refills every gun", () => {
    const a = new Armory();
    a.select(5);
    a.update(1);
    a.fire();
    expect(a.resupply()).toBe(true);
    expect(a.resupply()).toBe(false); // already full: nothing to report
    expect(a.mag).toBe(5);
    expect(a.reserve).toBe(15);
  });

  it("damage falls off linearly with range", () => {
    const g = GUNS[3]; // shotgun, falloff 0.25 at 28 m
    expect(damageAt(g, 0)).toBe(g.damage);
    expect(damageAt(g, g.range)).toBeCloseTo(g.damage * 0.25);
    expect(damageAt(g, g.range * 5)).toBeCloseTo(g.damage * 0.25);
    expect(damageAt(g, g.range / 2)).toBeCloseTo(g.damage * 0.625);
    // the sniper doesn't lose punch at distance
    expect(damageAt(GUNS[4], 200)).toBe(GUNS[4].damage);
  });

  it("only draws guns you carry, and cycling skips the rest", () => {
    const carried = new Set([1, 4]);
    const a = new Armory((slot) => carried.has(slot));
    expect(a.select(2)).toBe(false);
    expect(a.selected).toBe(0);
    expect(a.select(4)).toBe(true);
    a.cycle(1); // 4 → (5 not owned) → fists
    expect(a.selected).toBe(0);
    a.cycle(1);
    expect(a.selected).toBe(1);
    a.cycle(-1);
    expect(a.selected).toBe(0);
  });
});
