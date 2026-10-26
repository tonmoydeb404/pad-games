/** Engine state: jeep materials, crash debris and camera. (Internal fields are public only so the extracted engine modules can reach them.) */
import * as THREE from "three";
import type { CarPart } from "../../../player/cars";
import { VehicleState } from "./vehicle-state";

export class FeelState extends VehicleState {
  // --- crash debris (Kenney Car Kit debris parts) ---------------------------
  debrisParts: CarPart[] = [];
  readonly debrisPool: {
    grp: THREE.Group;
    vx: number;
    vy: number;
    vz: number;
    rx: number;
    ry: number;
    life: number;
  }[] = [];
  debrisHead = 0;

  // camera
  camMode = 0;
  camState = {
    dist: 8.2,
    targetDist: 8.2,
    yawOff: 0,
    pitchOff: 0,
    orbitYaw: 0.9,
    orbitPitch: 0.35,
    orbitDist: 8.0,
    pos: new THREE.Vector3(),
    look: new THREE.Vector3(),
    /** game-feel: decaying trauma 0..1; shake = trauma² (smooth sin noise). */
    trauma: 0,
    headX: 0,
    headY: 0,
  };
  /** Transient FOV punch on hard landings, decays back to rest. */
  fovKick = 0;
  /** Brief slow-motion on big impacts (hit-stop flavour). */
  slowmoT = 0;
  readonly camV1 = new THREE.Vector3();
  readonly camV2 = new THREE.Vector3();
  readonly camQ = new THREE.Quaternion();
  readonly camE = new THREE.Euler();
  readonly M = {
    redGloss: new THREE.MeshPhysicalMaterial({ color: 0xaa120c, roughness: 0.18, metalness: 0.62, clearcoat: 0.85, clearcoatRoughness: 0.12 }),
    redDark: new THREE.MeshPhysicalMaterial({ color: 0x71120c, roughness: 0.28, metalness: 0.55, clearcoat: 0.5 }),
    blackMatte: new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.88, metalness: 0.12 }),
    blackSemi: new THREE.MeshStandardMaterial({ color: 0x1b1e22, roughness: 0.45, metalness: 0.55 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x121316, roughness: 0.97 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x6a6f76, roughness: 0.5, metalness: 0.85 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xd8dde5, roughness: 0.1, metalness: 1.0 }),
    dirtySteel: new THREE.MeshStandardMaterial({ color: 0x52504a, roughness: 0.78, metalness: 0.65 }),
    mudMat: new THREE.MeshStandardMaterial({ color: 0x3e2e1e, roughness: 0.99 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x9ec4d8,
      roughness: 0.04,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
    }),
    mirror: new THREE.MeshStandardMaterial({ color: 0xe4ecf4, roughness: 0.05, metalness: 1.0 }),
    lampGlass: new THREE.MeshStandardMaterial({
      color: 0xfff4d8,
      roughness: 0.12,
      metalness: 0.1,
      emissive: 0xffe9b0,
      emissiveIntensity: 0.15,
    }),
    reflector: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.12, metalness: 1.0 }),
    amber: new THREE.MeshStandardMaterial({ color: 0xff9b2a, roughness: 0.3, emissive: 0xff7a00, emissiveIntensity: 0.06 }),
    brake: new THREE.MeshStandardMaterial({ color: 0x9b1710, roughness: 0.3, emissive: 0xff2010, emissiveIntensity: 0.05 }),
    reverse: new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0.02 }),
    seat: new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.94 }),
    seatTrim: new THREE.MeshStandardMaterial({ color: 0x8a1a12, roughness: 0.8 }),
    yellowFog: new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.15, metalness: 0.2, emissive: 0xff8800, emissiveIntensity: 0.35 }),
    winchCable: new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.4, metalness: 0.9 }),
    needleMat: new THREE.MeshStandardMaterial({ color: 0xff2200, roughness: 0.2, emissive: 0xff2200, emissiveIntensity: 0.8 }),
    shackleRed: new THREE.MeshStandardMaterial({ color: 0xd01515, roughness: 0.25, metalness: 0.7 }),
    dash: new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.85 }),
  };
}
