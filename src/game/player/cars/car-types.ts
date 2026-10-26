import type * as THREE from "three";

export interface CarSpec {
  id: string;
  label: string;
  /** Driving character — see CarPerf. Every field is a multiplier vs the
   *  jeep baseline unless noted. */
  perf: CarPerf;
}

/**
 * Per-vehicle driving stats (GTA-style). The jeep's profile is the physics
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

export interface CarWheel {
  /** Re-centred meshes, ready to drop into the rig's spin group. */
  parts: CarPart[];
  /** Rig-space x/z (mirrored + scaled). y is the rig's axle line. */
  x: number;
  z: number;
  /** Scaled wheel radius (model radius × scale). */
  radius: number;
}

export interface LoadedCar {
  spec: CarSpec;
  /** Body meshes, positioned for identity transform under the rig. */
  parts: CarPart[];
  wheels: CarWheel[]; // order: FL, FR, RL, RR (engine wheel order)
  /** Scaled footprint, rig space. */
  length: number;
  track: number;
  /** Suspension solver radius (avg of front/rear, scaled). */
  wheelR: number;
  /** Height of the body's midline above its ground plane (scaled). */
  bodyH: number;
}

export interface RawWheel {
  parts: CarPart[];
  x: number;
  z: number;
  radius: number;
}
