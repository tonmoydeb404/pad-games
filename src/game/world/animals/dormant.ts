import type { Actor } from "./actor";
import { HIDE_DIST } from "./constants";

/**
 * Far animals are asleep (no brain, no mixer). Past HIDE_DIST they also leave the scene graph's
 * per-frame work: hidden, and their skeleton is no longer matrix-updated. The wake distance is
 * a little shorter so an animal on the boundary doesn't flicker.
 */
export function setDormant(a: Actor, dist: number): void {
  const root = a.root;
  if (root.visible && dist > HIDE_DIST) {
    root.visible = false;
    root.matrixWorldAutoUpdate = false;
  } else if (!root.visible && dist < HIDE_DIST - 20) {
    root.visible = true;
    root.matrixWorldAutoUpdate = true;
  }
}
