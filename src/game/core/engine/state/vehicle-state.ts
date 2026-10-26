/** Engine state: vehicle dynamics, meshes, Kenney car swap and Rapier. (Internal fields are public only so the extracted engine modules can reach them.) */
import * as THREE from "three";
import { PhysicsWorld, PropStreamer, TerrainStreamer, VehicleRig } from "../../../physics/physics";
import { JEEP_PERF, type CarPerf, type LoadedCar } from "../../../player/cars";
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
  // --- Kenney Car Kit vehicle swap (src/game/player/cars.ts) ----------------------
  /** Requested vehicle id from the shell (loaded once the world exists). */
  vehicleId!: string | null;
  /** Active Kenney car; null = classic procedural jeep. */
  activeCar: LoadedCar | null = null;
  /** Mount point for the active car's body meshes (child of bodyGroup). */
  readonly carBody = new THREE.Group();
  /** The jeep's own body visuals live here while a Kenney car is active. */
  readonly jeepBodyStash = new THREE.Group();
  /** Jeep wheel visuals (per wheel) stashed while a car is active. */
  jeepWheelStash: THREE.Object3D[][] = [];
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
  /** Driving character of the active vehicle (jeep = baseline). */
  perf: CarPerf = { ...JEEP_PERF };
  headlightHome: { light: THREE.SpotLight; pos: THREE.Vector3; target: THREE.Vector3 }[] = [];
  skin: SkinId = "skaterMaleA";
  vehicleSerial = 0;
}
