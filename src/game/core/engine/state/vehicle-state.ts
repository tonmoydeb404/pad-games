/** Engine state: vehicle dynamics, meshes, and Rapier. (Internal fields are public only so the extracted engine modules can reach them.) */
import * as THREE from "three";
import { PhysicsWorld, PropStreamer, TerrainStreamer, VehicleRig } from "../../../physics/physics";
import { JEEP_PERF, type CarPerf } from "../../../player/cars";
import type { SkinId } from "../../../player/character";
import type { WheelState } from "../types";
import { WorldState } from "./world-state";

export class VehicleState extends WorldState {
  // vehicle
  v = {
    pos: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    lateral: 0,
    steer: 0,
    steerTarget: 0,
    throttle: 0,
    brake: 0,
    handbrake: false,
    rpm: 800,
    airborne: false,
    overturnT: 0,
    surface: "dirt",
    lastGoodIdx: 0,
    lap: 0,
    prevT: 0,
    progress: 0,
    dive: 0,
    squat: 0,
    bodyRoll: 0,
    bumpImpulse: 0,
    vibr: 0,
    /** Vertical velocity (units/s, +up) and body angular rates (rad/s). */
    vy: 0,
    pitchV: 0,
    rollV: 0,
  };
  // jeep meshes
  jeep: THREE.Group | null = null;
  bodyGroup: THREE.Group | null = null;
  wheels: WheelState[] = [];
  springs: THREE.Group[] = [];
  springParts: { coil: THREE.Object3D | null; rod: THREE.Object3D | null }[] = [];
  speedoNeedle: THREE.Object3D | null = null;
  tachoNeedle: THREE.Object3D | null = null;
  axleF: THREE.Group | null = null;
  axleR: THREE.Group | null = null;
  steerWheelObj: THREE.Object3D | null = null;
  headlights: THREE.SpotLight[] = [];
  headlampMeshes: THREE.Mesh[] = [];
  brakeMeshes: THREE.Mesh[] = [];
  reverseMeshes: THREE.Mesh[] = [];
  roofLamps: THREE.Mesh[] = [];
  headlightsOn = false;
  readonly wheelPos = [
    new THREE.Vector3(-0.86, 0, -1.28),
    new THREE.Vector3(0.86, 0, -1.28),
    new THREE.Vector3(-0.86, 0, 1.32),
    new THREE.Vector3(0.86, 0, 1.32),
  ];
  /** Suspension solver constants, per active vehicle (jeep: 0.5 / 0.42). */
  wheelR = 0.5;
  axleOff = 0.42;
  /** Vehicle collision radius + track width for roll/articulation maths. */
  carR = 1.3;
  track = 1.72;
  /** Vehicle footprint (collision slab + wheelbase maths). */
  carLen = 3.55;
  carWid = 1.9;
  // --- Rapier (src/game/physics/physics.ts) ---
  pw: PhysicsWorld | null = null;
  rig: VehicleRig | null = null;
  terrainStream: TerrainStreamer | null = null;
  propStream: PropStreamer | null = null;
  /** Orientation straight from the rigid body (render interpolation source). */
  readonly physQuat = new THREE.Quaternion();
  readonly prevQuat = new THREE.Quaternion();
  readonly currQuat = new THREE.Quaternion();
  /** Cosmetic braking-dive / cornering-roll, layered on the physical attitude. */
  readonly cosQuat = new THREE.Quaternion();
  readonly cosEuler = new THREE.Euler();
  readonly physEuler = new THREE.Euler();
  /** Speed/lateral as last written from the body — external edits show as a delta. */
  syncF = 0;
  syncL = 0;
  /** Kicker lips, as trail sample indices. */
  kickers: number[] = [];
  exhaustZ = 1.72;
  /** Driving character of the jeep. */
  perf: CarPerf = { ...JEEP_PERF };
  skin: SkinId = "skaterMaleA";
}
