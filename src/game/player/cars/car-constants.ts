export const BASE = "/assets/jeep/cars";

/** Target vehicle length after scaling — matched to the jeep tub (3.55) so
 *  every ride reads the same size on the trail. */
export const TARGET_LEN = 3.55;
export const MIN_SCALE = 0.85;
/** Karts need ~2.5× to reach the target; tractors ~1.8. Generous cap so all
 *  25 vehicles hit parity (uniform scale keeps proportions). */
export const MAX_SCALE = 2.5;

/** Rig-space axle offset formula: axle sits this far below the body origin. */
export const WHEEL_CONTACT = 0.92;

export const CANONICAL_WHEELS = ["wheel-front-left", "wheel-front-right", "wheel-back-left", "wheel-back-right"] as const;
