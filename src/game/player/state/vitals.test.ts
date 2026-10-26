import { describe, expect, it } from "vitest";
import { addArmor, applyDamage, createVitals, heal, revive, spendStamina, tickVitals } from "./vitals";

describe("damage", () => {
  it("reduces health and starts the regen delay", () => {
    const v = createVitals();
    expect(applyDamage(v, 30, "animal")).toEqual({ taken: 30, absorbed: 0, died: false });
    expect(v.health).toBe(70);
    expect(v.healthRest).toBeGreaterThan(0);
  });

  it("armor soaks a share of eligible damage and wears down", () => {
    const v = createVitals();
    addArmor(v, 50);
    const r = applyDamage(v, 20, "animal");
    expect(r.absorbed).toBeCloseTo(12);
    expect(r.taken).toBeCloseTo(8);
    expect(v.armor).toBeCloseTo(38);
  });

  it("armor does not help against falls", () => {
    const v = createVitals();
    addArmor(v, 50);
    expect(applyDamage(v, 20, "fall").absorbed).toBe(0);
    expect(v.armor).toBe(50);
  });

  it("death fires once and later damage is ignored", () => {
    const v = createVitals();
    expect(applyDamage(v, 500).died).toBe(true);
    expect(v.health).toBe(0);
    expect(applyDamage(v, 10).died).toBe(false);
    expect(v.dead).toBe(true);
  });

  it("ignores zero, negative and NaN damage", () => {
    const v = createVitals();
    for (const n of [0, -5, NaN]) expect(applyDamage(v, n).taken).toBe(0);
    expect(v.health).toBe(100);
  });
});

describe("healing", () => {
  it("clamps to the maximum and reports what it restored", () => {
    const v = createVitals();
    applyDamage(v, 10);
    expect(heal(v, 50)).toBe(10);
    expect(v.health).toBe(100);
  });
  it("cannot heal the dead; revive brings them back", () => {
    const v = createVitals();
    applyDamage(v, 500);
    expect(heal(v, 50)).toBe(0);
    revive(v, 0.6);
    expect(v.dead).toBe(false);
    expect(v.health).toBe(60);
  });
});

describe("stamina", () => {
  it("drains while sprinting and becomes winded exactly once", () => {
    const v = createVitals();
    let winded = 0;
    for (let i = 0; i < 400; i++) if (tickVitals(v, 1 / 60, { sprinting: true, still: false })) winded++;
    expect(v.stamina).toBe(0);
    expect(v.winded).toBe(true);
    expect(winded).toBe(1);
  });

  it("regenerates after the rest delay and clears winded at the threshold", () => {
    const v = createVitals();
    for (let i = 0; i < 400; i++) tickVitals(v, 1 / 60, { sprinting: true, still: false });
    for (let i = 0; i < 60 * 2; i++) tickVitals(v, 1 / 60, { sprinting: false, still: false });
    expect(v.stamina).toBeGreaterThan(10);
    for (let i = 0; i < 60 * 6; i++) tickVitals(v, 1 / 60, { sprinting: false, still: false });
    expect(v.winded).toBe(false);
  });

  it("is frame-rate independent", () => {
    const run = (dt: number) => {
      const v = createVitals();
      for (let t = 0; t < 1.5 - 1e-9; t += dt) tickVitals(v, dt, { sprinting: true, still: false });
      for (let t = 0; t < 2 - 1e-9; t += dt) tickVitals(v, dt, { sprinting: false, still: true });
      return v.stamina;
    };
    expect(run(1 / 30)).toBeCloseTo(run(1 / 120), 0);
  });

  it("spendStamina reports whether the full cost was available", () => {
    const v = createVitals();
    v.stamina = 5;
    expect(spendStamina(v, 8)).toBe(false);
    expect(v.stamina).toBe(0);
    expect(v.winded).toBe(false);
  });

  it("health regenerates only after the delay", () => {
    const v = createVitals();
    applyDamage(v, 30);
    tickVitals(v, 3, { sprinting: false, still: true });
    expect(v.health).toBe(70);
    tickVitals(v, 10, { sprinting: false, still: true });
    expect(v.health).toBeGreaterThan(70);
  });
});
