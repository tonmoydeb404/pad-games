/**
 * Slot-based inventory with stackable items. All rules live here, never in UI components.
 * Quantities are integers ≥ 1; an unknown item id or an invalid quantity throws
 * `InventoryError` (a programming error), while "not enough" / "no room" are normal results.
 */
import { getItemDef, isItemId } from "./items";

export interface Stack {
  id: string;
  qty: number;
}

export interface SavedInventory {
  slots: (Stack | null)[];
}

export class InventoryError extends Error {}

const MAX_SLOTS = 256;

function checkQty(qty: number): void {
  if (!Number.isInteger(qty) || qty < 1) throw new InventoryError(`invalid quantity ${qty}`);
}
function checkId(id: string): void {
  if (!isItemId(id)) throw new InventoryError(`unknown item id "${id}"`);
}

export class Inventory {
  readonly slots: (Stack | null)[];

  constructor(size = 24) {
    if (!Number.isInteger(size) || size < 1 || size > MAX_SLOTS) throw new InventoryError(`invalid size ${size}`);
    this.slots = Array.from({ length: size }, () => null);
  }

  get size(): number {
    return this.slots.length;
  }

  count(id: string): number {
    return this.slots.reduce((n, s) => (s?.id === id ? n + s.qty : n), 0);
  }

  has(id: string, qty = 1): boolean {
    return this.count(id) >= qty;
  }

  /** How many more of `id` fit right now. */
  room(id: string): number {
    checkId(id);
    const max = getItemDef(id).stackMax;
    return this.slots.reduce((n, s) => n + (s === null ? max : s.id === id ? max - s.qty : 0), 0);
  }

  canAdd(id: string, qty: number): boolean {
    checkQty(qty);
    return this.room(id) >= qty;
  }

  /** Adds as many as fit (existing stacks first). Returns how many did NOT fit. */
  add(id: string, qty: number): number {
    checkId(id);
    checkQty(qty);
    const max = getItemDef(id).stackMax;
    let left = qty;
    for (const s of this.slots) {
      if (left === 0) break;
      if (s?.id === id && s.qty < max) {
        const n = Math.min(left, max - s.qty);
        s.qty += n;
        left -= n;
      }
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (this.slots[i] === null) {
        const n = Math.min(left, max);
        this.slots[i] = { id, qty: n };
        left -= n;
      }
    }
    return left;
  }

  /** Removes exactly `qty` or nothing at all. Returns whether it did. */
  remove(id: string, qty: number): boolean {
    checkId(id);
    checkQty(qty);
    if (this.count(id) < qty) return false;
    let left = qty;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (s?.id !== id) continue;
      const n = Math.min(left, s.qty);
      s.qty -= n;
      left -= n;
      if (s.qty === 0) this.slots[i] = null;
    }
    return true;
  }

  /** Removes `qty` from one specific slot, or nothing if it holds fewer. Returns whether it did. */
  removeAt(slot: number, qty: number): boolean {
    checkQty(qty);
    const s = this.slots[slot];
    if (!s || s.qty < qty) return false;
    s.qty -= qty;
    if (s.qty === 0) this.slots[slot] = null;
    return true;
  }

  /** Moves `qty` from `slot` into the first free slot. Returns the new slot, or -1 when it cannot split. */
  split(slot: number, qty: number): number {
    checkQty(qty);
    const s = this.slots[slot];
    const free = this.slots.indexOf(null);
    if (!s || qty >= s.qty || free < 0) return -1;
    s.qty -= qty;
    this.slots[free] = { id: s.id, qty };
    return free;
  }

  /** Merges slot `from` into slot `to` (same item). Moves what fits and returns the amount moved. */
  merge(from: number, to: number): number {
    const a = this.slots[from];
    const b = this.slots[to];
    if (from === to || !a || !b || a.id !== b.id) return 0;
    const n = Math.min(a.qty, getItemDef(b.id).stackMax - b.qty);
    a.qty -= n;
    b.qty += n;
    if (a.qty === 0) this.slots[from] = null;
    return n;
  }

  swap(a: number, b: number): void {
    [this.slots[a], this.slots[b]] = [this.slots[b], this.slots[a]];
  }

  /** Moves up to `qty` of `id` between inventories without losing or duplicating any. Returns the amount moved. */
  static transfer(from: Inventory, to: Inventory, id: string, qty: number): number {
    checkId(id);
    checkQty(qty);
    const n = Math.min(qty, from.count(id), to.room(id));
    if (n === 0) return 0;
    from.remove(id, n);
    to.add(id, n);
    return n;
  }

  toJSON(): SavedInventory {
    return { slots: this.slots.map((s) => (s ? { id: s.id, qty: s.qty } : null)) };
  }

  /** Validates before applying anything; throws InventoryError on corrupt data. */
  static fromJSON(data: unknown): Inventory {
    const slots = (data as SavedInventory | null)?.slots;
    if (!Array.isArray(slots) || slots.length < 1 || slots.length > MAX_SLOTS) throw new InventoryError("bad slot list");
    const inv = new Inventory(slots.length);
    slots.forEach((s, i) => {
      if (s === null) return;
      if (typeof s !== "object" || typeof s.id !== "string" || !isItemId(s.id)) throw new InventoryError(`bad stack in slot ${i}`);
      if (!Number.isInteger(s.qty) || s.qty < 1 || s.qty > getItemDef(s.id).stackMax) throw new InventoryError(`bad quantity in slot ${i}`);
      inv.slots[i] = { id: s.id, qty: s.qty };
    });
    return inv;
  }
}
