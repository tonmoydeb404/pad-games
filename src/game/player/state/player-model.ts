/**
 * The single source of truth for the player's survival state: identity, vitals, inventory,
 * what is held, and progression flags. Serialisable on purpose (Phase 7 saves it unchanged);
 * the HUD, controller and combat read and change it only through these functions.
 */
import { Inventory, InventoryError } from "./inventory";
import { getItemDef, weaponItemId } from "./items";
import { createVitals, heal, restoreStamina, type Vitals } from "./vitals";
import { GUNS } from "../../weapons/weapons";

export const PLAYER_SAVE_VERSION = 1;

export interface PlayerModel {
  id: string;
  vitals: Vitals;
  inventory: Inventory;
  /** item id of the tool or weapon in hand, or null for bare hands */
  held: string | null;
  flags: Record<string, boolean>;
}

export interface SavedPlayer {
  version: number;
  id: string;
  health: number;
  armor: number;
  stamina: number;
  inventory: unknown;
  held: string | null;
  flags: Record<string, boolean>;
}

/** What a new explorer starts with: every blaster (as before) and a few bandages. */
export const STARTER_KIT: readonly [string, number][] = [...GUNS.map((g): [string, number] => [weaponItemId(g.slot), 1]), ["bandage", 3]];

export function createPlayer(id = "player-1", kit: readonly [string, number][] = STARTER_KIT): PlayerModel {
  const inventory = new Inventory();
  for (const [item, qty] of kit) inventory.add(item, qty);
  return { id, vitals: createVitals(), inventory, held: null, flags: {} };
}

export type UseResult = { ok: true; healed: number } | { ok: false; reason: string };

/** Eats / applies a consumable from the inventory. Nothing is consumed unless it had an effect. */
export function useItem(p: PlayerModel, itemId: string): UseResult {
  const def = getItemDef(itemId);
  if (def.category !== "consumable" || !def.use) return { ok: false, reason: `${def.name} cannot be used` };
  if (!p.inventory.has(itemId)) return { ok: false, reason: `You have no ${def.name.toLowerCase()}` };
  if (p.vitals.dead) return { ok: false, reason: "You are down" };
  const needsHealth = !!def.use.heal && p.vitals.health < p.vitals.cfg.maxHealth;
  const needsStamina = !!def.use.stamina && p.vitals.stamina < p.vitals.cfg.maxStamina;
  if (!needsHealth && !needsStamina) return { ok: false, reason: "Nothing to restore" };
  p.inventory.remove(itemId, 1);
  const healed = needsHealth ? heal(p.vitals, def.use.heal!) : 0;
  if (def.use.stamina) restoreStamina(p.vitals, def.use.stamina);
  return { ok: true, healed };
}

/** Puts an owned tool or weapon in hand. */
export function equip(p: PlayerModel, itemId: string): boolean {
  const def = getItemDef(itemId);
  if ((def.category !== "tool" && def.category !== "weapon") || !p.inventory.has(itemId)) return false;
  p.held = itemId;
  return true;
}

export function unequip(p: PlayerModel): void {
  p.held = null;
}

/** Drops whatever is held if it is no longer carried (after a drop, transfer or loss). */
export function syncHeld(p: PlayerModel): void {
  if (p.held && !p.inventory.has(p.held)) p.held = null;
}

/** Armory slots (1–5) the player actually carries a blaster for. */
export function ownedGunSlots(p: PlayerModel): Set<number> {
  const out = new Set<number>();
  for (const s of p.inventory.slots) if (s) {
    const slot = getItemDef(s.id).gunSlot;
    if (slot) out.add(slot);
  }
  return out;
}

export function serializePlayer(p: PlayerModel): SavedPlayer {
  const v = p.vitals;
  return { version: PLAYER_SAVE_VERSION, id: p.id, health: v.health, armor: v.armor, stamina: v.stamina, inventory: p.inventory.toJSON(), held: p.held, flags: { ...p.flags } };
}

/** Validates the whole payload first; throws on anything corrupt, applying nothing. */
export function restorePlayer(data: unknown): PlayerModel {
  const d = data as Partial<SavedPlayer> | null;
  if (!d || typeof d !== "object") throw new InventoryError("player save is not an object");
  if (d.version !== PLAYER_SAVE_VERSION) throw new InventoryError(`unsupported player save version ${String(d.version)}`);
  if (typeof d.id !== "string" || d.id.length === 0) throw new InventoryError("bad player id");
  const p = createPlayer(d.id, []);
  const v = p.vitals;
  const num = (n: unknown, max: number, what: string): number => {
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > max) throw new InventoryError(`bad ${what}`);
    return n;
  };
  const health = num(d.health, v.cfg.maxHealth, "health");
  const armor = num(d.armor, v.cfg.maxArmor, "armor");
  const stamina = num(d.stamina, v.cfg.maxStamina, "stamina");
  const inventory = Inventory.fromJSON(d.inventory);
  if (d.held !== null && (typeof d.held !== "string" || !inventory.has(d.held))) throw new InventoryError("held item is not carried");
  const flags = d.flags ?? {};
  if (typeof flags !== "object" || Object.values(flags).some((f) => typeof f !== "boolean")) throw new InventoryError("bad flags");
  Object.assign(v, { health, armor, stamina, dead: health <= 0 });
  p.inventory = inventory;
  p.held = d.held ?? null;
  p.flags = { ...flags };
  return p;
}
