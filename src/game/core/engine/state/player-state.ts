/** Engine state: on-foot explorer, weapons, riding and particles. (Internal fields are public only so the extracted engine modules can reach them.) */
import * as THREE from "three";
import type { JungleCharacter } from "../../../player/character";
import type { GunModel } from "../../../weapons/gun-models";
import { Armory } from "../../../weapons/weapons";
import { createPlayer, ownedGunSlots } from "../../../player/state";
import type { RideHandle, Saddle } from "../../../world/animals";
import { MELEE } from "../config/foot-constants";
import { FeelState } from "./feel-state";

export class PlayerState extends FeelState {
  // --- on-foot explorer (open world) ----------------------------------------
  /** The Kenney explorer; null when its assets failed to load. */
  explorer: JungleCharacter | null = null;
  /** True while walking the jungle; false while driving. */
  onFoot = false;
  /** The player's survival state (vitals, inventory, held item). The one source of truth for the HUD, combat and menus. */
  readonly player = createPlayer();
  readonly foot = {
    pos: new THREE.Vector3(),
    vx: 0,
    vz: 0,
    vy: 0,
    yaw: 0,
    grounded: true,
    gait: 0,
    /** smoothed gait for the animation blender */
    gaitS: 0,
    crouch: false,
    crouchK: 0,
    /** current procedural action + its progress */
    act: null as null | "punch" | "kick" | "roll",
    actT: 0,
    actDur: 0,
    actSide: 0 as 0 | 1,
    actMove: "punch" as keyof typeof MELEE,
    hitDone: false,
    /** the swing that follows when the current one ends */
    queued: null as null | "punch" | "kick",
    /** punch combo counter (jab · jab · hook) and its reset timer */
    combo: 0,
    comboT: 0,
    rollX: 0,
    rollZ: 0,
    /** dodge i-frames */
    invulnT: 0,
    /** knocked out: seconds until the walk back to the car */
    downT: 0,
    downK: 0,
    stepAcc: 0,
    stealth: 1,
  };
  /** Orbit yaw/pitch of the on-foot follow camera (stick / drag driven). */
  footCam = { yaw: 0, pitch: 0.18, dist: 4.4 };
  /** True when the parked vehicle is within ENTER_DIST of the explorer. */
  nearCar = false;
  /** Level of the jump input last frame (edge detection). */
  prevJump = false;
  // --- guns -----------------------------------------------------------------
  /** 1 right after a hit, fading to 0: drives the red screen-edge flash. */
  hurtFlash = 0;
  /** Blasters you may draw: only those you carry. */
  readonly armory = new Armory((slot) => ownedGunSlots(this.player).has(slot));
  gunModels: (GunModel | null)[] = [];
  /** Model currently in the explorer's hand (selection index). */
  heldGun = 0;
  lastWheel = 0;
  mouseFire = false;
  mouseAim = false;
  prevFire = false;
  prevReloading = false;
  /** Smoothed 0..1: gun out / aiming down the sights. */
  stanceK = 0;
  aimK = 0;
  /** Seconds the aim pose stays up after a shot or aim release. */
  gunUpT = 0;
  gunPitchS = -0.9;
  /** Recoil: the view jumps up a touch and settles back on its own (rad). */
  camKick = 0;
  /** First click on foot captures the mouse (and is not also a punch / shot). */
  lockClick = false;
  hitMarkT = 0;
  hitKill = false;
  tracers: { mesh: THREE.Mesh; life: number; max: number }[] = [];
  readonly tracerGeo = new THREE.BoxGeometry(1, 1, 1);
  readonly gv1 = new THREE.Vector3();
  readonly gv2 = new THREE.Vector3();
  readonly gv3 = new THREE.Vector3();
  readonly gv4 = new THREE.Vector3();
  /** The animal being ridden (null on your own two feet). */
  riding: RideHandle | null = null;
  rideName = "";
  /** Mount traits captured at mount time (saddle, size, voice). */
  rideSeat: Saddle = { y: 1, fwd: 0, halfW: 0.3, len: 2 };
  rideRadius = 0.8;
  rideSpecialName = "";
  rideCamDist = 3;
  rideCamLift = 0.8;
  readonly rideVec = new THREE.Vector3();
  /** Rideable animal within reach (F to mount), refreshed while walking. */
  nearRide: { h: RideHandle; name: string; dist: number } | null = null;
  rideStepT = 0;
  /** Latest analog move intent (roll direction is read from it). */
  lastMove = { x: 0, y: 0 };
  /** Mouse-down bookkeeping: a short, still click on foot is a punch. */
  clickStart = { x: 0, y: 0, t: 0, button: 0 };
  /** Rate-limited footstep splashes in water. */
  splashT = 0;
  // particles
  particlePool: { life: number; max: number; vx: number; vy: number; vz: number; s0: number; s1: number }[] = [];
  pHead = 0;
  pAttrPos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null = null;
  pAttrCol: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null = null;
  pAttrSize: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null = null;
  emitAcc = 0;
  exhaustAcc = 0;
  // atmosphere
  shafts: THREE.Mesh[] = [];
  fireflies: THREE.Points | null = null;
  ffAttr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null = null;
  readonly FF_N = 130;
  vegetation: { mesh: THREE.InstancedMesh; amp: number }[] = [];
  windMats: THREE.Material[] = [];
}
