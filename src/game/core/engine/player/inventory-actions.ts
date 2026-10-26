/** Inventory actions the menu calls. Rules live in player/state; this only applies their side effects to the world. */
import { equip, getItemDef, ownedGunSlots, pickConsumable, syncHeld, unequip, useItem } from "../../../player/state";
import type { JeepEngine } from "../jeep-engine";

/** Eat / apply a consumable. Returns a message for the menu. */
export function useInventoryItem(this: JeepEngine, itemId: string): string {
  const r = useItem(this.player, itemId);
  if (!r.ok) return r.reason;
  this.input.rumble(0.2, 80);
  return r.healed > 0 ? `+${Math.round(r.healed)} health` : "Used";
}

/** Put a carried blaster in hand, or holster it if it already is. */
export function equipInventoryItem(this: JeepEngine, itemId: string): string {
  const def = getItemDef(itemId);
  if (def.category !== "weapon" || !def.gunSlot) return `${def.name} cannot be equipped yet`;
  if (this.foot.downT > 0 || this.riding) return "Not now";
  if (this.armory.selected === def.gunSlot) {
    this.armory.select(0);
    unequip(this.player);
    this.onWeaponChanged();
    return `${def.name} holstered`;
  }
  if (!this.armory.select(def.gunSlot) || !equip(this.player, itemId)) return `You do not carry a ${def.name}`;
  this.onWeaponChanged();
  return `${def.name} in hand`;
}

/** Throw away `qty` of the stack in `slot` (there are no world pickups yet, so it is gone for good). */
export function discardInventoryItem(this: JeepEngine, slot: number, qty: number): string {
  const stack = this.player.inventory.slots[slot];
  if (!stack || !this.player.inventory.removeAt(slot, Math.min(qty, stack.qty))) return "Nothing to discard";
  syncHeld(this.player);
  // a blaster that is no longer carried cannot stay drawn
  if (this.armory.selected > 0 && !ownedGunSlots(this.player).has(this.armory.selected)) {
    this.armory.select(0);
    this.onWeaponChanged();
  }
  return `Discarded ${getItemDef(stack.id).name.toLowerCase()}`;
}

/** G / d-pad left: use the most fitting consumable without opening the menu. */
export function quickUse(this: JeepEngine): void {
  const id = pickConsumable(this.player);
  if (!id) {
    this.notify(this.player.vitals.dead ? "You are down" : "Nothing to use");
    return;
  }
  this.notify(`${getItemDef(id).name}: ${this.useInventoryItem(id)}`);
}
