import type * as THREE from "three";
import type { RailPath } from "./rail-path";

/** Optional pull toward another bed (the trail at level crossings). */
export interface RailNear {
  y: number;
  /** 0..1 blend weight. */
  w: number;
}

export interface RailInfo {
  dist: number;
  /** Bed height at the nearest centreline point. */
  y: number;
  i: number;
}

export interface RailPose {
  x: number;
  y: number;
  z: number;
  /** Unit tangent (3D — includes grade). */
  tx: number;
  ty: number;
  tz: number;
}

export interface TrainHost {
  scene: THREE.Scene;
  rail: RailPath;
  /** Level crossings with the jeep trail — the loco whistles on approach. */
  crossings: { x: number; z: number }[];
  /** One pooled smoke particle (engine's particle system). */
  puff(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: string, size: number, life: number): void;
  /** Steam whistle (audio already attenuates by distance to the jeep). */
  whistle(gain: number): void;
  /** The train just rammed the jeep — `closing` is the relative speed. */
  onRam(closing: number, nx: number, nz: number): void;
  /** Kinematic box colliders, one per car (engine owns the Rapier world). */
  addBox(id: number, hx: number, hy: number, hz: number): void;
  moveBox(id: number, x: number, y: number, z: number, qx: number, qy: number, qz: number, qw: number): void;
  removeBox(id: number): void;
  /** Camera right axis, for stereo panning. */
  camRight(out: THREE.Vector3): THREE.Vector3;
}
