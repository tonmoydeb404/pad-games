export { Inventory, InventoryError, type SavedInventory, type Stack } from "./inventory";
export { ITEM_DEFS, getItemDef, isItemId, weaponItemId, type ItemCategory, type ItemDef, type ItemUse } from "./items";
export {
  PLAYER_SAVE_VERSION, STARTER_KIT, createPlayer, equip, ownedGunSlots, pickConsumable, restorePlayer, serializePlayer, syncHeld, unequip, useItem,
  type PlayerModel, type SavedPlayer, type UseResult,
} from "./player-model";
export {
  DEFAULT_VITALS, addArmor, applyDamage, createVitals, heal, restoreStamina, revive, spendStamina, tickVitals,
  type DamageResult, type DamageType, type Vitals, type VitalsConfig,
} from "./vitals";
