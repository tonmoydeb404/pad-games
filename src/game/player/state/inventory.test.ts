import { describe, expect, it } from "vitest";
import { Inventory, InventoryError } from "./inventory";
import { ITEM_DEFS, getItemDef } from "./items";

describe("items", () => {
  it("have unique ids and sane stack sizes", () => {
    const ids = ITEM_DEFS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of ITEM_DEFS) expect(d.stackMax).toBeGreaterThanOrEqual(1);
  });
  it("map every gun to one weapon item", () => {
    expect(ITEM_DEFS.filter((d) => d.category === "weapon").map((d) => d.gunSlot)).toEqual([1, 2, 3, 4, 5]);
  });
  it("throws on an unknown id", () => {
    expect(() => getItemDef("nope")).toThrow(RangeError);
  });
});

describe("Inventory.add / remove", () => {
  it("stacks into existing slots first, then opens new ones", () => {
    const inv = new Inventory(4);
    expect(inv.add("wood", 30)).toBe(0);
    expect(inv.add("wood", 30)).toBe(0); // 50 + 10
    expect(inv.slots.map((s) => s?.qty ?? 0)).toEqual([50, 10, 0, 0]);
    expect(inv.count("wood")).toBe(60);
  });

  it("reports the overflow when full and changes nothing more", () => {
    const inv = new Inventory(1);
    expect(inv.add("wood", 70)).toBe(20);
    expect(inv.slots[0]).toEqual({ id: "wood", qty: 50 });
    expect(inv.add("fruit", 1)).toBe(1);
  });

  it("removes atomically: all or nothing", () => {
    const inv = new Inventory(4);
    inv.add("wood", 60);
    expect(inv.remove("wood", 61)).toBe(false);
    expect(inv.count("wood")).toBe(60);
    expect(inv.remove("wood", 55)).toBe(true);
    expect(inv.count("wood")).toBe(5);
    expect(inv.slots.filter(Boolean)).toHaveLength(1);
  });

  it.each([0, -1, 1.5, NaN, Infinity])("rejects quantity %s", (q) => {
    const inv = new Inventory();
    expect(() => inv.add("wood", q)).toThrow(InventoryError);
    expect(() => inv.remove("wood", q)).toThrow(InventoryError);
  });

  it("rejects unknown item ids", () => {
    expect(() => new Inventory().add("unobtainium", 1)).toThrow(InventoryError);
  });
});

describe("Inventory.removeAt", () => {
  it("takes from the chosen slot only, all or nothing", () => {
    const inv = new Inventory(3);
    inv.slots[0] = { id: "wood", qty: 10 };
    inv.slots[1] = { id: "wood", qty: 5 };
    expect(inv.removeAt(1, 6)).toBe(false);
    expect(inv.removeAt(1, 5)).toBe(true);
    expect(inv.slots[1]).toBeNull();
    expect(inv.slots[0]?.qty).toBe(10);
    expect(inv.removeAt(2, 1)).toBe(false); // empty slot
  });
});

describe("Inventory split / merge / transfer", () => {
  it("splits a stack into the first free slot", () => {
    const inv = new Inventory(3);
    inv.add("wood", 10);
    expect(inv.split(0, 4)).toBe(1);
    expect(inv.slots.map((s) => s?.qty ?? 0)).toEqual([6, 4, 0]);
    expect(inv.split(0, 6)).toBe(-1); // cannot move the whole stack
  });

  it("merges up to the stack limit and keeps the remainder", () => {
    const inv = new Inventory(3);
    inv.slots[0] = { id: "wood", qty: 40 };
    inv.slots[1] = { id: "wood", qty: 20 };
    expect(inv.merge(1, 0)).toBe(10);
    expect(inv.slots.map((s) => s?.qty ?? 0)).toEqual([50, 10, 0]);
    inv.slots[2] = { id: "fruit", qty: 1 };
    expect(inv.merge(2, 0)).toBe(0); // different items never merge
  });

  it("transfers without losing or duplicating items, capped by room", () => {
    const a = new Inventory(2);
    const b = new Inventory(1);
    a.add("wood", 80);
    b.add("wood", 30);
    const before = a.count("wood") + b.count("wood");
    expect(Inventory.transfer(a, b, "wood", 80)).toBe(20); // b only has room for 20
    expect(a.count("wood")).toBe(60);
    expect(b.count("wood")).toBe(50);
    expect(a.count("wood") + b.count("wood")).toBe(before);
    expect(Inventory.transfer(a, b, "wood", 5)).toBe(0);
  });
});

describe("Inventory serialisation", () => {
  it("round-trips", () => {
    const inv = new Inventory(5);
    inv.add("wood", 70);
    inv.add("bandage", 2);
    const back = Inventory.fromJSON(JSON.parse(JSON.stringify(inv)));
    expect(back.toJSON()).toEqual(inv.toJSON());
  });

  it.each([
    ["not an object", null],
    ["no slots", {}],
    ["unknown item", { slots: [{ id: "zzz", qty: 1 }] }],
    ["zero quantity", { slots: [{ id: "wood", qty: 0 }] }],
    ["over the stack limit", { slots: [{ id: "wood", qty: 51 }] }],
    ["fractional quantity", { slots: [{ id: "wood", qty: 1.5 }] }],
    ["too many slots", { slots: Array.from({ length: 300 }, () => null) }],
  ])("rejects corrupt data: %s", (_n, data) => {
    expect(() => Inventory.fromJSON(data)).toThrow(InventoryError);
  });
});
