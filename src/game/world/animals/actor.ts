import * as THREE from "three";
import type { Clips } from "./clips";
import type { AnimalDef, AnimalHost, Saddle } from "./types";

export type ClipKey = "idle" | "eat" | "move" | "death" | "react";

/** A loaded species: the template every placed animal is cloned from. */
export interface Prototype {
  scene: THREE.Group;
  clips: Clips;
  scale: number;
  saddle: Saddle;
}

export type State = "idle" | "flee" | "attack" | "ragdoll" | "dead";

export interface Actor {
  def: AnimalDef;
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  clips: Clips;
  actions: Partial<Record<ClipKey, THREE.AnimationAction>>;
  current: THREE.AnimationAction | null;
  state: State;
  stateT: number;
  pos: THREE.Vector3;
  yaw: number;
  targetYaw: number;
  /** horizontal knockback (ragdoll) */
  vel: THREE.Vector3;
  vy: number;
  angVel: THREE.Vector3;
  bounces: number;
  bled: boolean;
  respawnT: number;
  radius: number;
  idleTimer: number;
  /** timer while grazing (returns to idle when it hits 0) */
  eatT: number;
  /** timer while flinching from a survivable bump */
  reactT: number;
  /** invulnerability frames after a hit — one contact, one damage event */
  hitCd: number;
  /** current / maximum hit points */
  hp: number;
  maxHp: number;
  /** seconds left before a fierce animal may strike again */
  coolT: number;
  /** seconds left showing the health bar after taking damage */
  hurtT: number;
  /** personal space — skittish individuals panic at wildly different ranges */
  fleeR: number;
  /** fierce: how close the jeep may get before it charges */
  aggroR: number;
  /** floating health bar (created lazily on first damage) */
  bar: { group: THREE.Group; fg: THREE.Sprite; w: number } | null;
  phase: number;
  /** Being ridden — the engine places it, the brain stays off. */
  ridden?: boolean;
  rideMoving?: boolean;
  /** Smoothed ground speed while ridden (mass-weighted inertia). */
  rideSpeed?: number;
  /** Height above the ground while jumping / leaping, and vertical speed. */
  rideAirY?: number;
  rideVy?: number;
  /** Special-move state: speed boost, forward speed held during a leap, landing effect, cooldown. */
  rideBoostT?: number;
  rideBoostMult?: number;
  rideLeapSpeed?: number;
  onLand?: (() => void) | null;
  specialCd?: number;
  /** Altitude a ridden flyer has climbed above its hover height. */
  rideAlt?: number;
  /** Seconds left stunned (webbed, honked at, splashed): no brain, no movement. */
  stunT?: number;
  saddle: Saddle;
}

/** Shared mutable state of one AnimalSystem; the behaviour modules take it as their first argument. */
export interface AnimalCtx {
  host: AnimalHost;
  actors: Actor[];
  prototypes: Map<string, Prototype>;
  decals: { mesh: THREE.Mesh; life: number }[];
  decalGeo: THREE.CircleGeometry;
  decalMat: THREE.MeshBasicMaterial;
  /** Floating health bar sprites (they auto-billboard toward the camera). */
  barMats: { bg: THREE.SpriteMaterial; fg: THREE.SpriteMaterial };
  t: number;
  tmpQ: THREE.Quaternion;
  tmpV: THREE.Vector3;
  tmpV2: THREE.Vector3;
}

export function createCtx(host: AnimalHost): AnimalCtx {
  return {
    host,
    actors: [],
    prototypes: new Map(),
    decals: [],
    decalGeo: new THREE.CircleGeometry(1, 14),
    decalMat: new THREE.MeshBasicMaterial({
      color: 0x5c1210,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    }),
    barMats: {
      bg: new THREE.SpriteMaterial({ color: 0x0d0f0d, depthTest: false, transparent: true, opacity: 0.85 }),
      fg: new THREE.SpriteMaterial({ color: 0xe5484d, depthTest: false }),
    },
    t: 0,
    tmpQ: new THREE.Quaternion(),
    tmpV: new THREE.Vector3(),
    tmpV2: new THREE.Vector3(),
  };
}
