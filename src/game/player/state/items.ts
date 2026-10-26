/** Item definitions: pure data, keyed by stable string IDs that saves and recipes refer to. */
import { GUNS } from "../../weapons/weapons";

export type ItemCategory = "resource" | "consumable" | "tool" | "weapon";

export interface ItemUse {
  /** health restored on use */
  heal?: number;
  /** stamina restored on use */
  stamina?: number;
}

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  stackMax: number;
  use?: ItemUse;
  /** weapon items: the Armory slot (1–5) this item puts in your hands */
  gunSlot?: number;
}

const BASE: ItemDef[] = [
  { id: "wood", name: "Wood", description: "Chopped branches and logs. Building and fuel.", category: "resource", stackMax: 50 },
  { id: "fruit", name: "Jungle fruit", description: "Sweet and juicy. Eaten raw.", category: "consumable", stackMax: 20, use: { heal: 8, stamina: 15 } },
  { id: "raw-meat", name: "Raw meat", description: "Best cooked before you eat it.", category: "resource", stackMax: 20 },
  { id: "cooked-meat", name: "Cooked meat", description: "Hot, filling and safe.", category: "consumable", stackMax: 20, use: { heal: 30, stamina: 25 } },
  { id: "fish", name: "Fish", description: "Fresh from the stream.", category: "resource", stackMax: 20 },
  { id: "bandage", name: "Bandage", description: "Stops the bleeding and patches you up.", category: "consumable", stackMax: 10, use: { heal: 25 } },
  { id: "axe", name: "Axe", description: "For chopping trees.", category: "tool", stackMax: 1 },
  { id: "fishing-rod", name: "Fishing rod", description: "For catching fish at the water's edge.", category: "tool", stackMax: 1 },
];

/** One weapon item per gun, so what you carry is what the Armory may select. */
const WEAPONS: ItemDef[] = GUNS.map((g) => ({
  id: weaponItemId(g.slot),
  name: g.name,
  description: `${g.magSize}-round ${g.auto ? "automatic" : "semi-automatic"} blaster.`,
  category: "weapon",
  stackMax: 1,
  gunSlot: g.slot,
}));

export function weaponItemId(gunSlot: number): string {
  return `gun-${gunSlot}`;
}

export const ITEM_DEFS: readonly ItemDef[] = [...BASE, ...WEAPONS];

const BY_ID = new Map(ITEM_DEFS.map((d) => [d.id, d]));

export const isItemId = (id: string): boolean => BY_ID.has(id);

export function getItemDef(id: string): ItemDef {
  const d = BY_ID.get(id);
  if (!d) throw new RangeError(`unknown item id "${id}"`);
  return d;
}
