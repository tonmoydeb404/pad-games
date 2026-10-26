/** Engine state: loading, callbacks, three core, trail, rail, city, water. (Internal fields are public only so the extracted engine modules can reach them.) */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { HeightGrid } from "../../../physics/ground";
import { RAPIER } from "../../../physics/physics";
import { AnimalSystem } from "../../../world/animals";
import { CitySite, CitySystem } from "../../../world/city";
import { RailPath, TrainSystem, type RailInfo } from "../../../world/train";
import type { JeepProps } from "../../assets";
import { type JeepQuality, QUALITY } from "../config/quality";
import { SAMPLES } from "../config/world-constants";
import type { Blocker } from "../types";
import { InstanceLod } from "../world/instance-lod";

export class WorldState {
  container!: HTMLElement;
  Q!: (typeof QUALITY)[JeepQuality];
  /** CC0 Kenney models (normalised geometry), null → procedural fallback. */
  props: JeepProps | null = null;
  /** Wildlife (Quaternius animal packs) — null until build() finishes loading. */
  animals: AnimalSystem | null = null;
  /** Roadkill tally for the session. */
  kills = 0;
  /** Jeep health 0..100 — animal attacks and heavy rams chip it; slow regen. */
  jeepHealth = 100;
  /** > 0 while the jeep is wrecked: disabled until the player recovers it (resetVehicle clears it). */
  wreckT = 0;
  /** Slow, shell-facing callbacks. Assign any time before/while running. */
  onProgress?: (pct: number, label: string) => void;
  onReady?: () => void;
  onPauseChange?: (paused: boolean, view: "pause" | "inventory") => void;
  /** Which menu the current pause shows. */
  pausedView: "pause" | "inventory" = "pause";
  onPadChange?: (connected: boolean, id: string) => void;
  // three core
  /** Distance culling for instanced scenery (see world/instance-lod.ts). */
  readonly lod = new InstanceLod();
  renderer: THREE.WebGLRenderer | null = null;
  scene: THREE.Scene | null = null;
  camera: THREE.PerspectiveCamera | null = null;
  composer: EffectComposer | null = null;
  sunLight: THREE.DirectionalLight | null = null;
  sky: THREE.Mesh | null = null;
  waterMat: THREE.ShaderMaterial | null = null;
  gradeShaderUniforms = { tDiffuse: { value: null } };
  // trail & terrain
  trailPts: THREE.Vector3[] = [];
  trailTan: THREE.Vector3[] = [];
  trailGrid = new Map<number, number[]>();
  /** Spacing between trail samples (getSpacedPoints → uniform). */
  segLen = 1;
  colliders: Blocker[] = [];
  /** The Jungle Express — its loop, crossings and the running consist. */
  rail!: RailPath;
  railCrossings: { x: number; z: number }[] = [];
  trains: TrainSystem | null = null;
  readonly trainBodies = new Map<number, RAPIER.RigidBody>();
  readonly tmpRailInfo: RailInfo = { dist: 0, y: 0, i: 0 };
  /** Port Marin — the town beside the jungle (site math + kit meshes). */
  city!: CitySite;
  citySystem: CitySystem | null = null;
  /** Sampled copy of the rendered terrain — physics ground truth. */
  heightGrid: HeightGrid | null = null;
  readonly stream = { c: new THREE.Vector3(-142, 0, 160), r: 26, level: 0 };
  /** Jungle ponds — frog/snake habitat, carved like the stream ford. */
  readonly ponds: { x: number; z: number; r: number; level: number }[] = [
    { x: 40, z: 60, r: 14, level: 0 },
    { x: -60, z: -140, r: 13, level: 0 },
    { x: 170, z: 150, r: 11, level: 0 },
    { x: -30, z: 130, r: 12, level: 0 },
    { x: 100, z: -60, r: 12, level: 0 },
  ];
  readonly bridgeI = Math.floor(SAMPLES * 0.63);
  readonly woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4b2c, roughness: 0.92 });
  readonly woodDark = new THREE.MeshStandardMaterial({ color: 0x4a3320, roughness: 0.95 });
  /**
   * Scatter one Quaternius pack model: one InstancedMesh per part (bark /
   * leaves share the same placement matrices). Foliage parts wind-sway; leaf
   * quads cast leaf-shaped shadows via an alpha-cut depth material.
   */
  readonly shadowDepthMats = new Map<THREE.Texture, THREE.MeshDepthMaterial>();
}
