import type { CarPerf } from "./car-types";

/** The jeep — the physics baseline; 1.0 / stock values are its handling. */
export const JEEP_PERF: CarPerf = {
  speed: 1.0,
  accel: 1.0,
  brake: 1.0,
  steer: 10,
  agility: 1.0,
  grip: 1.0,
  mass: 1.0,
  offroad: 0,
  roll: 1.0,
  spring: 130,
  damp: 11,
};
