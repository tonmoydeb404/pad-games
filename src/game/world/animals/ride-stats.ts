import { clamp } from "../../core/noise";
import type { AnimalDef } from "./types";

/**
 * Riding top speed (u/s): each species' flee speed boosted to a real gallop,
 * with a floor so even the smallest mounts aren't painfully slow. The order
 * between species is kept (a horse still outruns a T-Rex).
 */
const RIDE_SPEED_BOOST = 1.7;
const RIDE_MIN_TOP = 5.5;
export function rideTopSpeed(def: AnimalDef): number {
  return Math.max(def.flee * RIDE_SPEED_BOOST, RIDE_MIN_TOP);
}
/** Seconds of holding forward to reach top speed: light animals get going quickly, giants take a while. */
export function rideRampTime(def: AnimalDef): number {
  return clamp(1.8 + Math.log10(def.mass + 1) * 0.9, 2, 6.5);
}

/** Jump height (m) per species while ridden — every animal jumps like itself. */
export const JUMP_HEIGHT: Record<string, number> = {
  Deer: 2.4, Stag: 2.4, Fox: 1.8, Wolf: 1.8, Husky: 1.5, ShibaInu: 1.3,
  Horse: 2.0, Horse_White: 2.0, Donkey: 1.4, Alpaca: 1.4, Cow: 0.9, Bull: 1.0,
  Frog: 4.5, Snake: 0.8, Snake_angry: 0.8, Rat: 1.5, Spider: 2.5,
  Trex: 1.5, Velociraptor: 3.0, Triceratops: 1.0, Stegosaurus: 0.8, Apatosaurus: 0.5, Parasaurolophus: 1.4,
};
