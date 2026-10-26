import type { JeepAction } from "./types";

/** Keys whose browser default (focus change, page scroll) must be blocked. */
export const PREVENT_KEYS = new Set([
  "Tab",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  " ",
  "Space",
]);

/**
 * Edge-triggered actions fired by a (lower-cased) key going down. "i" (inventory) is not here on purpose:
 * the engine handles it in onPauseKey so it also works while paused, and a queued action would reopen the menu.
 */
export function keyActions(k: string): JeepAction[] {
  switch (k) {
    case "c":
      return ["camera"];
    case "v":
      return ["undercam"];
    case "h":
      return ["headlights"];
    case "k":
      return ["horn", "kick"];
    case "b":
      return ["horn"];
    case "j":
      return ["punch"];
    case "t":
      return ["reload"];
    case "tab":
      return ["weaponNext"];
    case "0":
    case "1":
    case "2":
    case "3":
    case "4":
    case "5":
      return [`weapon${k}` as JeepAction];
    case "q":
      return ["roll", "special"];
    case "f":
    case "e":
      return ["enter"];
    case "r":
      return ["reset"];
    case "m":
      return ["mute"];
    default:
      return [];
  }
}
