import type * as THREE from "three";
import type { CarPerf } from "../../../player/cars";
import type { DriveIntent, PhysicsWorld, VehicleRig } from "../../../physics/physics";

/** Per-tick values computed by the arcade layer and shared by the later vehicle-tick phases. */
export interface TickCtx {
  dt: number;
  pw: PhysicsWorld;
  rig: VehicleRig;
  jeep: THREE.Group;
  P: CarPerf;
  /** Un-dented top speed of the active vehicle. */
  topBase: number;
  /** Surface response under the car (grip/drag/accel/rough). */
  S: { grip: number; drag: number; accel: number; rough: number };
  surf: string;
  /** Rig forward vector before the physics step. */
  fw: { x: number; y: number; z: number };
  /** Net acceleration, for the cosmetic dive/squat. */
  a: number;
  turnRate: number;
  intent: DriveIntent;
}

/** What the physics step reports back. */
export interface StepResult {
  vy0: number;
  t: { x: number; y: number; z: number };
  linAfter: { x: number; y: number; z: number };
}
