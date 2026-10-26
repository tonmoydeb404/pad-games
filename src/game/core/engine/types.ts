import type * as THREE from "three";

export interface WheelState {
  holder: THREE.Group;
  steerG: THREE.Group;
  spin: THREE.Object3D;
  base: THREE.Vector3;
  comp: number;
  compV: number;
  contact: number;
  angle: number;
  front: boolean;
  groundY?: number;
}

/** Footprint the wildlife steers around (the car's own collision is Rapier's). */
export interface Blocker {
  x: number;
  z: number;
  r: number;
}
