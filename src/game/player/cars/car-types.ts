import type * as THREE from "three";

/**
 * Per-vehicle driving stats (GTA-style); every field is a multiplier vs the jeep unless noted. The jeep's profile is the physics
 * baseline — 1.0 / stock values reproduce its current handling exactly.
 */
export interface CarPerf {
  /** Top speed × MAX_SPEED (jeep = 1.0 = 46.8 u/s). */
  speed: number;
  /** Engine force — acceleration and reverse-drive strength. */
  accel: number;
  /** Braking force (higher = shorter stops). */
  brake: number;
  /** Steering responsiveness — damp rate toward steer input (jeep 10). */
  steer: number;
  /** Cornering agility — yaw-rate multiplier at speed. */
  agility: number;
  /** Lateral grip — higher = tighter line, less slip. */
  grip: number;
  /** Relative mass — plows through obstacles when heavy, bounces when light;
   *  also scales animal-strike damage taken. */
  mass: number;
  /** Off-road aptitude: 0 = jeep baseline, +1 tractor (shrugs off mud), negative
   *  = street tyers (sports cars suffer off the trail). */
  offroad: number;
  /** Body-roll tendency in corners (tall vehicles lean more). */
  roll: number;
  /** Suspension spring rate (jeep 130) — soft = wallowy, stiff = sporty. */
  spring: number;
  /** Suspension damping (jeep 11). */
  damp: number;
}

export interface CarPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}
