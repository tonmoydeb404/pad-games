import { describe, expect, it } from "vitest";
import { InventoryError } from "./inventory";
import { applyDamage } from "./vitals";
import { createPlayer, equip, ownedGunSlots, restorePlayer, serializePlayer, syncHeld, unequip, useItem } from "./player-model";

describe("starter kit", () => {
  it("carries all five blasters and some bandages", () => {
    const p = createPlayer();
    expect([...ownedGunSlots(p)].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(p.inventory.count("bandage")).toBe(3);
  });
});

describe("useItem", () => {
  it("heals and consumes exactly one", () => {
    const p = createPlayer();
    applyDamage(p.vitals, 40);
    expect(useItem(p, "bandage")).toEqual({ ok: true, healed: 25 });
    expect(p.vitals.health).toBe(85);
    expect(p.inventory.count("bandage")).toBe(2);
  });

  it("does not waste an item when there is nothing to restore", () => {
    const p = createPlayer();
    expect(useItem(p, "bandage")).toEqual({ ok: false, reason: "Nothing to restore" });
    expect(p.inventory.count("bandage")).toBe(3);
  });

  it("refuses items you do not have, non-consumables, and use while down", () => {
    const p = createPlayer();
    applyDamage(p.vitals, 40);
    expect(useItem(p, "fruit").ok).toBe(false);
    expect(useItem(p, "gun-1").ok).toBe(false);
    applyDamage(p.vitals, 500);
    expect(useItem(p, "bandage").ok).toBe(false);
    expect(p.inventory.count("bandage")).toBe(3);
  });
});

describe("equipment", () => {
  it("only equips owned tools and weapons", () => {
    const p = createPlayer();
    expect(equip(p, "axe")).toBe(false); // not carried
    expect(equip(p, "bandage")).toBe(false); // not a tool or weapon
    expect(equip(p, "gun-2")).toBe(true);
    expect(p.held).toBe("gun-2");
    unequip(p);
    expect(p.held).toBeNull();
  });

  it("lets go of an item that is no longer carried", () => {
    const p = createPlayer();
    equip(p, "gun-3");
    p.inventory.remove("gun-3", 1);
    syncHeld(p);
    expect(p.held).toBeNull();
    expect(ownedGunSlots(p).has(3)).toBe(false);
  });
});

describe("save / restore", () => {
  it("round-trips through JSON", () => {
    const p = createPlayer("p9");
    applyDamage(p.vitals, 33);
    p.inventory.add("wood", 12);
    equip(p, "gun-1");
    p.flags.metTheTrain = true;
    const back = restorePlayer(JSON.parse(JSON.stringify(serializePlayer(p))));
    expect(serializePlayer(back)).toEqual(serializePlayer(p));
  });

  const good = () => JSON.parse(JSON.stringify(serializePlayer(createPlayer())));
  it.each([
    ["wrong version", (d: Record<string, unknown>) => (d.version = 99)],
    ["negative health", (d: Record<string, unknown>) => (d.health = -1)],
    ["health above max", (d: Record<string, unknown>) => (d.health = 1000)],
    ["NaN stamina", (d: Record<string, unknown>) => (d.stamina = NaN)],
    ["held item not carried", (d: Record<string, unknown>) => (d.held = "axe")],
    ["bad flags", (d: Record<string, unknown>) => (d.flags = { a: 1 })],
    ["corrupt inventory", (d: Record<string, unknown>) => (d.inventory = { slots: [{ id: "x", qty: 1 }] })],
  ])("rejects %s and applies nothing", (_n, corrupt) => {
    const d = good();
    corrupt(d);
    expect(() => restorePlayer(d)).toThrow(InventoryError);
  });

  it("rejects non-objects", () => {
    expect(() => restorePlayer(null)).toThrow(InventoryError);
    expect(() => restorePlayer("save")).toThrow(InventoryError);
  });
});
