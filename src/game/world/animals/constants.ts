/** Tuning numbers shared by the wildlife modules. */
export const BASE = "/assets/jeep/animals";
/** World-units² beyond which an animal's brain and mixer sleep. */
export const THINK_DIST = 220;
export const CALM_DIST = 58;
export const GRAVITY = 22;
/** Impact speed (u/s) that kills. Heavy animals need a proper wallop. */
export const DIE_AT = { light: 4.2, medium: 5.0, heavy: 8.0 };
export const JEEP_MASS = 1900;
export const MAX_DECALS = 26;
/**
 * Quaternius models are authored facing +Z; engine headings move along −Z
 * (like the jeep). Measured bind-pose boxes: every pack is long-axis Z, so a
 * single half-turn fixes the whole menagerie.
 */
export const MODEL_FACING = Math.PI;
/** Killed animals reappear this fast (s), out of the jeep's range. */
export const RESPAWN_MIN = 55;
export const RESPAWN_DELAY = 4;
/** Dinosaurs are authored at natural size, then multiplied — they stay giants (size policy: see displayHeight). */
export const SIZE_MULT = 4.5;
