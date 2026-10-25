/**
 * Jungle Jeep — 3D off-road driving engine (three.js, fully procedural).
 *
 * Ported from the original standalone single-file build. The engine lives
 * entirely outside React: it owns its canvas, HUD DOM and input sources, and
 * only slow state changes cross back to the shell through callbacks.
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { loadJeepProps, type JeepProps, type PackModel } from "./assets";
import { AnimalSystem, type AnimalHost } from "./animals";
import { loadCar, loadDebrisParts, JEEP_PERF, WHEEL_CONTACT, type CarPart, type CarPerf, type LoadedCar } from "./cars";
import type { RideHandle, RideInfo, Saddle } from "./animals";
import { loadJungleCharacter, type JungleCharacter, type SkinId } from "./character";
import { JeepAudio } from "./audio";
import { loadAllGunModels, type GunModel } from "./gunmodels";
import { Armory, damageAt, type GunDef } from "./weapons";
import { animalHitRumble, JeepInput, type JeepInputSnapshot } from "./input";
import { HeightGrid } from "./ground";
import {
  initPhysics,
  PhysicsWorld,
  PropStreamer,
  RAPIER,
  TerrainStreamer,
  VehicleRig,
  type DriveIntent,
  type VehicleSpec,
} from "./physics";
import {
  RailPath,
  RAIL_BED,
  RAIL_BLEND,
  findCrossings,
  TrainSystem,
  type RailInfo,
  type TrainHost,
} from "./train";
import { CitySite, CitySystem, JUNCTION_T, type CityHost } from "./city";
import { clamp, damp, fbm, hash2, lerp, mulberry, smooth, TAU } from "./noise";

export type JeepQuality = "low" | "medium" | "high";

const QUALITY: Record<
  JeepQuality,
  {
    pixelRatio: number;
    shadow: number;
    trees: number;
    palms: number;
    bushes: number;
    ferns: number;
    grass: number;
    rocks: number;
    far: number;
    particles: number;
    terrainSeg: number;
    shadowsOn: boolean;
  }
> = {
  low: { pixelRatio: 1.0, shadow: 1024, trees: 300, palms: 70, bushes: 240, ferns: 300, grass: 800, rocks: 160, far: 420, particles: 180, terrainSeg: 190, shadowsOn: true },
  medium: { pixelRatio: 1.4, shadow: 2048, trees: 460, palms: 100, bushes: 360, ferns: 480, grass: 1300, rocks: 260, far: 560, particles: 300, terrainSeg: 270, shadowsOn: true },
  high: { pixelRatio: 2.0, shadow: 4096, trees: 640, palms: 130, bushes: 520, ferns: 720, grass: 1900, rocks: 360, far: 750, particles: 420, terrainSeg: 340, shadowsOn: true },
};

export interface JeepOptions {
  container: HTMLElement;
  quality?: JeepQuality;
  /** Kenney Car Kit vehicle id (see src/jeep/cars.ts); null = classic jeep. */
  vehicleId?: string | null;
}

const WORLD = 1000;
const BOUND = 440;
const ROAD_HALF = 4.3;
/** Berm/embankment width — the road blends to the jungle floor over this run. */
const ROAD_BLEND = 24.0;
/** Distance from the road centreline where big trees may stand (past the berm). */
const TREE_LINE = ROAD_HALF + ROAD_BLEND;

// Hand-placed control points: irregular closed circuit with switchbacks,
// a narrow section, a wide clearing, a rocky climb, a river dip and a bridge.
// Track height is NOT authored here any more — it is derived from the smoothed
// base terrain in the constructor, so the road always rides the jungle floor.
const CTRL: [number, number][] = [
  [0, -250],
  [88, -238],
  [158, -186],
  [196, -104],
  [236, -34],
  [214, 40],
  [150, 72],
  [112, 132],
  [158, 196],
  [96, 246],
  [6, 254],
  [-78, 222],
  [-142, 160],
  [-126, 84],
  [-192, 34],
  [-236, -42],
  [-176, -96],
  [-206, -166],
  [-142, -214],
  [-66, -250],
];

const SAMPLES = 1400;
const CELL = 26;
const gridKey = (cx: number, cz: number): number => cx * 4096 + cz;

const MAX_SPEED = 46.8;
const MAX_REV = 13.5;

/** World gravity (units/s²). ~2.3× real-scale — heavier than reality reads as
 *  "planted" at arcade speeds, like GTA's tuned-up gravity. */
const GRAVITY = 20;
/** Suspension visuals: rest compression and full travel (wheel/spring meshes). */
const SUSP_REST = 0.16;
const SUSP_TRAVEL = 0.3;

/** Jump kickers on the trail: ramp up, short lip, ramp down (world units). */
const KICK_H = 3.4;
const KICK_RISE = 19;
const KICK_FALL = 8;
/** Lateral run over which a kicker fades out past the road edge — wide enough
 *  that clipping its flank doesn't tip the car. */
const KICK_SHOULDER = 10;

const SURFACE: Record<string, { grip: number; drag: number; accel: number; rough: number }> = {
  dirt: { grip: 1.0, drag: 0.55, accel: 1.0, rough: 0.4 },
  mud: { grip: 0.68, drag: 0.95, accel: 0.75, rough: 0.5 },
  rock: { grip: 0.88, drag: 0.7, accel: 0.88, rough: 0.9 },
  grass: { grip: 0.8, drag: 0.75, accel: 0.85, rough: 0.55 },
  water: { grip: 0.65, drag: 1.4, accel: 0.65, rough: 0.45 },
  asphalt: { grip: 1.08, drag: 0.45, accel: 1.06, rough: 0.12 },
  ballast: { grip: 0.86, drag: 0.66, accel: 0.92, rough: 0.72 },
};

const MODES = ["chase", "cockpit", "orbit", "under", "wheel"] as const;
type CamMode = (typeof MODES)[number];
const MODE_LABEL: Record<CamMode, string> = {
  chase: "Chase camera",
  cockpit: "Driver view",
  orbit: "Inspection orbit",
  under: "Undercarriage camera",
  wheel: "Front wheel camera",
};

/* --- on-foot explorer (open world) --------------------------------------- */
const FOOT_WALK = 3.4; // u/s — light stick tilt
const FOOT_JOG = 7.6; // u/s — full stick / WASD (GTA's default pace)
const FOOT_RUN = 12.8; // u/s sprint (burns stamina)
const FOOT_CROUCH = 0.42; // speed multiplier while crouched
const FOOT_ACCEL_RATE = 9; // 1/s — exponential approach to the intent velocity
const FOOT_BRAKE_RATE = 14; // 1/s — stopping is snappier than starting
const FOOT_TURN = 14; // 1/s — how fast the explorer faces the move dir
const FOOT_JUMP_V = 8.2; // initial upward velocity (GRAVITY pulls back)
const STAMINA_DRAIN = 20; // /s while sprinting
const STAMINA_REGEN = 16; // /s after a short rest
const PLAYER_RADIUS = 0.45;
/** Melee moves: timeline length, the fraction of it where the hit lands, reach. */
const MELEE = {
  punch: { dur: 0.4, hit: 0.38, range: 1.9, arc: 0.3, dmg: 12, knock: 1.2, cost: 3 },
  hook: { dur: 0.52, hit: 0.44, range: 2.0, arc: 0.3, dmg: 22, knock: 2.6, cost: 6 },
  kick: { dur: 0.62, hit: 0.46, range: 2.3, arc: 0.45, dmg: 26, knock: 3.4, cost: 8 },
} as const;
/** How close you must be (edge of the animal) to climb on. */
const RIDE_REACH = 2.6;
/** Fractions of the mount's top speed. */
const RIDE_WALK = 0.26;
const RIDE_TROT = 0.58;
const RIDE_GALLOP = 1;
const ROLL_DUR = 0.62;
const ROLL_SPEED = 11;
const ROLL_COST = 16;
/** Horizontal distance from the vehicle that allows hopping in. */
const ENTER_DIST = 3.7;
/** Can't bail out above this forward speed. */
const EXIT_MAX_SPEED = 3.4;
/** Push the explorer out of trunks/boulders with this much margin. */
const FOOT_SKIN = 0.32;

const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/* -------------------------------------------------------------------------
   Scoped HUD styles (prefix jj-) so the engine owns its DOM like the
   original standalone build, without leaking anything globally.
   ------------------------------------------------------------------------- */
const HUD_CSS = `
.jj-root { position:absolute; inset:0; overflow:hidden; }
.jj-root canvas { display:block; }
.jj-root [hidden] { display:none !important; }
.jj-grade, .jj-vig { position:absolute; inset:0; pointer-events:none; }
.jj-grade { z-index:10; mix-blend-mode:soft-light; background:
  radial-gradient(130% 100% at 50% 42%, transparent 50%, rgba(18,14,4,.40) 100%),
  radial-gradient(65% 42% at 72% 10%, rgba(255,200,100,.18), transparent 60%),
  linear-gradient(180deg, rgba(255,230,170,.08), rgba(30,50,20,.08)); }
.jj-vig { z-index:11; background:radial-gradient(110% 85% at 50% 50%, transparent 55%, rgba(4,8,2,.52) 100%); }
.jj-hud { position:absolute; inset:0; z-index:20; pointer-events:none; opacity:0; transition:opacity .7s ease; }
.jj-hud.on { opacity:1; }
.jj-panel { background:rgba(10,14,10,.46); border:1px solid rgba(255,255,255,.14); border-radius:14px;
  backdrop-filter:blur(9px); -webkit-backdrop-filter:blur(9px); box-shadow:0 8px 26px rgba(0,0,0,.3);
  color:#f3efe6; font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
.jj-speedo { position:absolute; right:calc(22px + env(safe-area-inset-right,0px)); bottom:calc(22px + env(safe-area-inset-bottom,0px)); padding:14px 20px 12px; min-width:168px; text-align:right; }
.jj-spd { font-size:44px; font-weight:800; line-height:.92; letter-spacing:-.03em; font-variant-numeric:tabular-nums; }
.jj-spdu { font-size:11px; letter-spacing:.22em; color:rgba(243,239,230,.62); margin-top:5px; }
.jj-gears { display:flex; gap:6px; justify-content:flex-end; margin-top:11px; }
.jj-gears div { font-size:11px; font-weight:800; color:rgba(255,255,255,.26); width:20px; text-align:center; }
.jj-gears div.on { color:#ff7a5c; }
.jj-bars { margin-top:11px; display:grid; gap:5px; }
.jj-bwrap { height:5px; background:rgba(255,255,255,.11); border-radius:3px; overflow:hidden; }
.jj-bwrap i { display:block; height:100%; width:0%; border-radius:3px; transition:width .08s linear; }
.jj-thr i { background:#78d18a; } .jj-brk i { background:#ef5b45; }
.jj-hp i { background:#78d18a; }
.jj-brow { display:flex; align-items:center; gap:7px; }
.jj-blbl { font-size:9px; font-weight:800; letter-spacing:.16em; color:rgba(243,239,230,.62); width:20px; text-align:left; flex:none; }
.jj-topleft { position:absolute; left:calc(22px + env(safe-area-inset-left,0px)); top:calc(20px + env(safe-area-inset-top,0px)); padding:12px 16px; font-size:12.5px; line-height:1.75; min-width:180px; }
.jj-topleft .k { color:rgba(243,239,230,.62); display:inline-block; min-width:74px; }
.jj-topleft .v { font-weight:700; }
.jj-dot { display:inline-block; width:7px; height:7px; border-radius:50%; background:rgba(255,255,255,.2); margin-right:6px; vertical-align:middle; }
.jj-dot.on { background:#ffd479; box-shadow:0 0 9px #ffd479; }
.jj-notice { position:absolute; left:50%; top:34px; transform:translateX(-50%); padding:9px 20px; font-size:13px;
  font-weight:700; letter-spacing:.08em; text-transform:uppercase; opacity:0; transition:opacity .35s; }
.jj-notice.show { opacity:1; }
.jj-tip { position:absolute; left:50%; bottom:26px; transform:translateX(-50%); padding:10px 20px; font-size:12.5px;
  color:rgba(243,239,230,.62); opacity:0; transition:opacity .5s; text-align:center; }
.jj-tip.show { opacity:1; } .jj-tip b { color:#f3efe6; }
.jj-weapon { position:absolute; right:calc(22px + env(safe-area-inset-right,0px)); bottom:calc(172px + env(safe-area-inset-bottom,0px)); padding:10px 16px; min-width:168px; text-align:right; }
.jj-weapon .n { font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:rgba(243,239,230,.55); }
.jj-weapon .a { font-size:26px; font-weight:800; line-height:1.1; font-variant-numeric:tabular-nums; }
.jj-weapon .a small { font-size:13px; font-weight:700; opacity:.55; }
.jj-weapon .a.low { color:#ff8a70; }
.jj-weapon .r { height:3px; margin-top:7px; border-radius:2px; background:rgba(255,255,255,.12); overflow:hidden; }
.jj-weapon .r i { display:block; height:100%; width:0; background:#ffb84a; }
.jj-weapon .k { margin-top:6px; font-size:10.5px; color:rgba(243,239,230,.4); }
.jj-xhair { position:absolute; left:50%; top:50%; width:0; height:0; pointer-events:none; z-index:21; --s:10px; }
.jj-xhair i { position:absolute; background:#fff; box-shadow:0 0 3px rgba(0,0,0,.85); opacity:0; transition:opacity .12s; }
.jj-xhair::before { content:""; position:absolute; left:-2px; top:-2px; width:4px; height:4px; border-radius:50%; background:#fff; box-shadow:0 0 3px rgba(0,0,0,.9); }
.jj-xhair.target::before { background:#ff5a45; }
.jj-xhair.target i { background:#ff5a45; }
.jj-xhair i:nth-child(1) { width:2px; height:9px; left:-1px; top:calc(-9px - var(--s)); }
.jj-xhair i:nth-child(2) { width:2px; height:9px; left:-1px; top:var(--s); }
.jj-xhair i:nth-child(3) { width:9px; height:2px; top:-1px; left:calc(-9px - var(--s)); }
.jj-xhair i:nth-child(4) { width:9px; height:2px; top:-1px; left:var(--s); }
.jj-xhair.aim i { opacity:1; }
.jj-xhair b { position:absolute; left:-13px; top:-13px; width:26px; height:26px; opacity:0; transition:opacity .15s; }
.jj-xhair b::before, .jj-xhair b::after { content:""; position:absolute; left:12px; top:-2px; width:2px; height:30px; background:#ff5a45; box-shadow:0 0 4px #000; transform:rotate(45deg); }
.jj-xhair b::after { transform:rotate(-45deg); }
.jj-xhair b.on { opacity:1; transition:none; }
.jj-xhair b.kill::before, .jj-xhair b.kill::after { background:#fff; }
.jj-scope { position:absolute; inset:0; pointer-events:none; z-index:19;
  background:radial-gradient(circle at 50% 50%, transparent 0, transparent 30vmin, #000 30.4vmin); }
.jj-scope::before, .jj-scope::after { content:""; position:absolute; background:rgba(0,0,0,.7); }
.jj-scope::before { left:50%; top:calc(50% - 30vmin); width:1px; height:60vmin; }
.jj-scope::after { top:50%; left:calc(50% - 30vmin); height:1px; width:60vmin; }
.jj-warn { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); padding:14px 26px; font-size:15px;
  font-weight:700; color:#ffd0c4; border-color:rgba(226,69,47,.5); background:rgba(60,12,6,.6); opacity:0; transition:opacity .3s; }
.jj-warn.show { opacity:1; }
.jj-compass { position:absolute; left:50%; top:calc(18px + env(safe-area-inset-top,0px)); transform:translateX(-50%); padding:6px 16px; font-size:12px;
  letter-spacing:.18em; font-weight:700; color:rgba(243,239,230,.62); }
.jj-pad { position:absolute; left:calc(22px + env(safe-area-inset-left,0px)); bottom:calc(22px + env(safe-area-inset-bottom,0px)); padding:8px 14px; font-size:11px; letter-spacing:.14em;
  text-transform:uppercase; color:rgba(243,239,230,.55); }
.jj-prompt { position:absolute; left:50%; bottom:84px; transform:translateX(-50%); padding:10px 22px; font-size:14px;
  font-weight:800; letter-spacing:.06em; color:#eaffea; border-color:rgba(120,209,138,.45);
  background:rgba(12,42,18,.62); box-shadow:0 0 24px rgba(80,200,110,.25); }
.jj-count { position:absolute; left:50%; top:36%; transform:translate(-50%,-50%); z-index:25; pointer-events:none;
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  font-size:clamp(72px,14vw,140px); font-weight:900; color:#fff; letter-spacing:-.03em;
  text-shadow:0 8px 44px rgba(0,0,0,.65), 0 0 34px rgba(255,150,60,.4); opacity:0; }
.jj-count.jj-pop { animation:jj-pop 1s cubic-bezier(.2,.8,.3,1) forwards; }
@keyframes jj-pop { 0% { opacity:0; transform:translate(-50%,-50%) scale(1.9); } 14% { opacity:1; transform:translate(-50%,-50%) scale(1); } 72% { opacity:1; } 100% { opacity:0; transform:translate(-50%,-50%) scale(.92); } }
.jj-time-best .v { font-variant-numeric:tabular-nums; }
.jj-touch { position:absolute; inset:0; z-index:22; pointer-events:none; }
.jj-tbtn { position:absolute; pointer-events:auto; width:74px; height:74px; border-radius:50%;
  background:rgba(255,255,255,.09); border:1px solid rgba(255,255,255,.14); backdrop-filter:blur(6px);
  display:flex; align-items:center; justify-content:center; font-size:20px; font-weight:800; color:#f3efe6;
  user-select:none; -webkit-user-select:none; touch-action:none; }
.jj-tbtn:active { background:rgba(226,69,47,.55); }
`;

interface WheelState {
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
interface Blocker {
  x: number;
  z: number;
  r: number;
}

export class JeepEngine {
  private container: HTMLElement;
  private Q: (typeof QUALITY)[JeepQuality];
  /** CC0 Kenney models (normalised geometry), null → procedural fallback. */
  private props: JeepProps | null = null;

  /** Wildlife (Quaternius animal packs) — null until build() finishes loading. */
  private animals: AnimalSystem | null = null;
  /** Roadkill tally for the session. */
  private kills = 0;
  /** Jeep health 0..100 — animal attacks and heavy rams chip it; slow regen. */
  private jeepHealth = 100;
  /** Wrecked countdown: jeep disabled until it recovers. */
  private wreckT = 0;

  /** Slow, shell-facing callbacks. Assign any time before/while running. */
  onProgress?: (pct: number, label: string) => void;
  onReady?: () => void;
  onPauseChange?: (paused: boolean) => void;
  onPadChange?: (connected: boolean, id: string) => void;

  // three core
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private composer: EffectComposer | null = null;
  private sunLight: THREE.DirectionalLight | null = null;
  private sky: THREE.Mesh | null = null;
  private waterMat: THREE.ShaderMaterial | null = null;
  private gradeShaderUniforms = { tDiffuse: { value: null } };

  // trail & terrain
  private trailPts: THREE.Vector3[] = [];
  private trailTan: THREE.Vector3[] = [];
  private trailGrid = new Map<number, number[]>();
  /** Spacing between trail samples (getSpacedPoints → uniform). */
  private segLen = 1;
  private colliders: Blocker[] = [];
  /** The Jungle Express — its loop, crossings and the running consist. */
  private rail!: RailPath;
  private railCrossings: { x: number; z: number }[] = [];
  private trains: TrainSystem | null = null;
  private readonly trainBodies = new Map<number, RAPIER.RigidBody>();
  private readonly tmpRailInfo: RailInfo = { dist: 0, y: 0, i: 0 };
  /** Port Marin — the town beside the jungle (site math + kit meshes). */
  private city!: CitySite;
  private citySystem: CitySystem | null = null;
  /** Sampled copy of the rendered terrain — physics ground truth. */
  private heightGrid: HeightGrid | null = null;
  private readonly stream = { c: new THREE.Vector3(-142, 0, 160), r: 26, level: 0 };
  /** Jungle ponds — frog/snake habitat, carved like the stream ford. */
  private readonly ponds: { x: number; z: number; r: number; level: number }[] = [
    { x: 40, z: 60, r: 14, level: 0 },
    { x: -60, z: -140, r: 13, level: 0 },
    { x: 170, z: 150, r: 11, level: 0 },
    { x: -30, z: 130, r: 12, level: 0 },
    { x: 100, z: -60, r: 12, level: 0 },
  ];

  /** Distance to the nearest water body (stream or pond). */
  private waterDist(x: number, z: number): number {
    let d = Math.hypot(x - this.stream.c.x, z - this.stream.c.z);
    for (const p of this.ponds) {
      const pd = Math.hypot(x - p.x, z - p.z);
      if (pd < d) d = pd;
    }
    return d;
  }

  /** True when the point sits within `frac` × radius of any water body. */
  private nearWater(x: number, z: number, frac = 1): boolean {
    if (Math.hypot(x - this.stream.c.x, z - this.stream.c.z) < this.stream.r * frac) return true;
    for (const p of this.ponds) {
      if (Math.hypot(x - p.x, z - p.z) < p.r * frac) return true;
    }
    return false;
  }
  private readonly bridgeI = Math.floor(SAMPLES * 0.63);

  // vehicle
  private v = {
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
  private jeep: THREE.Group | null = null;
  private bodyGroup: THREE.Group | null = null;
  private wheels: WheelState[] = [];
  private springs: THREE.Group[] = [];
  private springParts: { coil: THREE.Object3D | null; rod: THREE.Object3D | null }[] = [];
  private speedoNeedle: THREE.Object3D | null = null;
  private tachoNeedle: THREE.Object3D | null = null;
  private axleF: THREE.Group | null = null;
  private axleR: THREE.Group | null = null;
  private steerWheelObj: THREE.Object3D | null = null;
  private headlights: THREE.SpotLight[] = [];
  private headlampMeshes: THREE.Mesh[] = [];
  private brakeMeshes: THREE.Mesh[] = [];
  private reverseMeshes: THREE.Mesh[] = [];
  private roofLamps: THREE.Mesh[] = [];
  private headlightsOn = false;
  private readonly wheelPos = [
    new THREE.Vector3(-0.86, 0, -1.28),
    new THREE.Vector3(0.86, 0, -1.28),
    new THREE.Vector3(-0.86, 0, 1.32),
    new THREE.Vector3(0.86, 0, 1.32),
  ];

  // --- Kenney Car Kit vehicle swap (src/jeep/cars.ts) ----------------------
  /** Requested vehicle id from the shell (loaded once the world exists). */
  private readonly vehicleId: string | null;
  /** Active Kenney car; null = classic procedural jeep. */
  private activeCar: LoadedCar | null = null;
  /** Mount point for the active car's body meshes (child of bodyGroup). */
  private readonly carBody = new THREE.Group();
  /** The jeep's own body visuals live here while a Kenney car is active. */
  private readonly jeepBodyStash = new THREE.Group();
  /** Jeep wheel visuals (per wheel) stashed while a car is active. */
  private jeepWheelStash: THREE.Object3D[][] = [];
  /** Suspension solver constants, per active vehicle (jeep: 0.5 / 0.42). */
  private wheelR = 0.5;
  private axleOff = 0.42;
  /** Vehicle collision radius + track width for roll/articulation maths. */
  private carR = 1.3;
  private track = 1.72;
  /** Vehicle footprint (collision slab + wheelbase maths). */
  private carLen = 3.55;
  private carWid = 1.9;
  // --- Rapier (src/jeep/physics.ts) ---
  private pw: PhysicsWorld | null = null;
  private rig: VehicleRig | null = null;
  private terrainStream: TerrainStreamer | null = null;
  private propStream: PropStreamer | null = null;
  /** Orientation straight from the rigid body (render interpolation source). */
  private readonly physQuat = new THREE.Quaternion();
  private readonly prevQuat = new THREE.Quaternion();
  private readonly currQuat = new THREE.Quaternion();
  /** Cosmetic braking-dive / cornering-roll, layered on the physical attitude. */
  private readonly cosQuat = new THREE.Quaternion();
  private readonly cosEuler = new THREE.Euler();
  private readonly physEuler = new THREE.Euler();
  /** Speed/lateral as last written from the body — external edits show as a delta. */
  private syncF = 0;
  private syncL = 0;
  /** Kicker lips, as trail sample indices. */
  private kickers: number[] = [];
  private exhaustZ = 1.72;
  /** Driving character of the active vehicle (jeep = baseline). */
  private perf: CarPerf = { ...JEEP_PERF };
  private headlightHome: { light: THREE.SpotLight; pos: THREE.Vector3; target: THREE.Vector3 }[] = [];

  // --- crash debris (Kenney Car Kit debris parts) ---------------------------
  private debrisParts: CarPart[] = [];
  private readonly debrisPool: {
    grp: THREE.Group;
    vx: number;
    vy: number;
    vz: number;
    rx: number;
    ry: number;
    life: number;
  }[] = [];
  private debrisHead = 0;

  // camera
  private camMode = 0;
  private camState = {
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
  private fovKick = 0;
  /** Brief slow-motion on big impacts (hit-stop flavour). */
  private slowmoT = 0;
  private readonly camV1 = new THREE.Vector3();
  private readonly camV2 = new THREE.Vector3();
  private readonly camQ = new THREE.Quaternion();
  private readonly camE = new THREE.Euler();

  // --- on-foot explorer (open world) ----------------------------------------
  /** The Kenney explorer; null when its assets failed to load. */
  private explorer: JungleCharacter | null = null;
  /** True while walking the jungle; false while driving. */
  private onFoot = false;
  private readonly foot = {
    pos: new THREE.Vector3(),
    vx: 0,
    vz: 0,
    vy: 0,
    yaw: 0,
    grounded: true,
    gait: 0,
    /** smoothed gait for the animation blender */
    gaitS: 0,
    health: 100,
    stamina: 100,
    /** exhausted: can't sprint until stamina recovers */
    winded: false,
    /** seconds before stamina / health start recovering */
    staminaRest: 0,
    healthRest: 0,
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
  private footCam = { yaw: 0, pitch: 0.18, dist: 4.4 };
  /** True when the parked vehicle is within ENTER_DIST of the explorer. */
  private nearCar = false;
  /** Level of the jump input last frame (edge detection). */
  private prevJump = false;
  // --- guns -----------------------------------------------------------------
  private readonly armory = new Armory();
  private gunModels: (GunModel | null)[] = [];
  /** Model currently in the explorer's hand (selection index). */
  private heldGun = 0;
  private lastWheel = 0;
  private mouseFire = false;
  private mouseAim = false;
  private prevFire = false;
  private prevReloading = false;
  /** Smoothed 0..1: gun out / aiming down the sights. */
  private stanceK = 0;
  private aimK = 0;
  /** Seconds the aim pose stays up after a shot or aim release. */
  private gunUpT = 0;
  private gunPitchS = -0.9;
  /** Recoil: the view jumps up a touch and settles back on its own (rad). */
  private camKick = 0;
  /** First click on foot captures the mouse (and is not also a punch / shot). */
  private lockClick = false;
  private hitMarkT = 0;
  private hitKill = false;
  private tracers: { mesh: THREE.Mesh; life: number; max: number }[] = [];
  private readonly tracerGeo = new THREE.BoxGeometry(1, 1, 1);
  private readonly gv1 = new THREE.Vector3();
  private readonly gv2 = new THREE.Vector3();
  private readonly gv3 = new THREE.Vector3();
  private readonly gv4 = new THREE.Vector3();
  /** The animal being ridden (null on your own two feet). */
  private riding: RideHandle | null = null;
  private rideName = "";
  /** Mount traits captured at mount time (saddle, size, voice). */
  private rideSeat: Saddle = { y: 1, fwd: 0, halfW: 0.3, len: 2 };
  private rideRadius = 0.8;
  private rideSpecialName = "";
  private rideCamDist = 3;
  private rideCamLift = 0.8;
  private readonly rideVec = new THREE.Vector3();
  /** Rideable animal within reach (F to mount), refreshed while walking. */
  private nearRide: { h: RideHandle; name: string; dist: number } | null = null;
  private rideStepT = 0;
  /** Latest analog move intent (roll direction is read from it). */
  private lastMove = { x: 0, y: 0 };
  /** Mouse-down bookkeeping: a short, still click on foot is a punch. */
  private clickStart = { x: 0, y: 0, t: 0, button: 0 };
  /** Rate-limited footstep splashes in water. */
  private splashT = 0;

  // particles
  private particlePool: { life: number; max: number; vx: number; vy: number; vz: number; s0: number; s1: number }[] = [];
  private pHead = 0;
  private pAttrPos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null = null;
  private pAttrCol: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null = null;
  private pAttrSize: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null = null;
  private emitAcc = 0;
  private exhaustAcc = 0;

  // atmosphere
  private shafts: THREE.Mesh[] = [];
  private fireflies: THREE.Points | null = null;
  private ffAttr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null = null;
  private readonly FF_N = 130;
  private vegetation: { mesh: THREE.InstancedMesh; amp: number }[] = [];
  private windMats: THREE.Material[] = [];

  // loop / lifecycle
  private started = false;
  private paused = false;
  private destroyed = false;
  private time = 0;
  private lastT = 0;
  private rafId = 0;
  private dragging = false;
  private lastDragX = 0;
  private lastDragY = 0;

  // fixed-timestep simulation (physics-tuning): constant dt keeps the spring
  // suspension stable at any frame rate; rendering interpolates between ticks.
  private static readonly FIXED_DT = 1 / 60;
  private static readonly MAX_SUBSTEPS = 4;
  private acc = 0;
  private readonly prevPos = new THREE.Vector3();
  private readonly currPos = new THREE.Vector3();
  /** Interpolated render position (camera + visual emitters follow this). */
  private readonly renderPos = new THREE.Vector3();

  // game feel / events
  /** Airtime accumulator (seconds with no wheel contact). */
  private airT = 0;
  private noContactTicks = 0;
  /** Consecutive ticks the chassis has been touching something solid. */
  private contactTicks = 0;
  private lastImpact = 0;
  private lastScrape = 0;
  private lastBottomOut = 0;

  // countdown & lap timing (ux)
  private countdownT = 0;
  private lastCountNum = 4;
  private lapStartT = 0;
  private lapTimes: number[] = [];
  private bestLap = 0;

  // HUD DOM
  private root: HTMLDivElement | null = null;
  private styleEl: HTMLStyleElement | null = null;
  private el: Record<string, HTMLElement | null> = {};
  private gearEls: HTMLElement[] = [];

  readonly input = new JeepInput();
  readonly audio = new JeepAudio();

  private readonly tmpInfo = { dist: 999, y: 0, i: 0, t: 0, s: 0 };
  private readonly tmpColor = new THREE.Color();
  private readonly tmpVec = new THREE.Vector3();
  private readonly upVec = new THREE.Vector3();

  constructor(opts: JeepOptions) {
    this.container = opts.container;
    this.Q = QUALITY[opts.quality ?? "high"];
    this.vehicleId = opts.vehicleId ?? null;

    // trail spline + samples + spatial hash (pure math, fast)
    const curvePts = CTRL.map((p) => new THREE.Vector3(p[0], 0, p[1]));
    const trail = new THREE.CatmullRomCurve3(curvePts, true, "catmullrom", 0.5);
    this.trailPts = trail.getSpacedPoints(SAMPLES);
    for (let i = 0; i <= SAMPLES; i++) {
      const a = this.trailPts[i];
      const b = this.trailPts[(i + 1) % SAMPLES];
      this.trailTan.push(new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize());
    }
    this.segLen = Math.max(0.2, this.trailPts[0].distanceTo(this.trailPts[1]));
    // Road height = smoothed base terrain (kills the generator's short-wavelength
    // noise) + a designed rolling-hills profile. The base alone measures ≈1°
    // grade at p50 / 4° max at ring scale — a billiard table that left the jeep
    // glued level — so three detuned harmonics add 5–15° crests and dips.
    // Periodic in t, so the closed loop stays seamless.
    {
      const raw = new Float32Array(SAMPLES + 1);
      for (let i = 0; i <= SAMPLES; i++) {
        raw[i] = this.baseTerrain(this.trailPts[i].x, this.trailPts[i].z) + 0.9;
      }
      const WIN = 46; // ≈ ±52 world units of smoothing along the track
      const hill = (i: number): number => {
        const t = (i % SAMPLES) / SAMPLES;
        return (
          4.0 * Math.sin(TAU * 5 * t + 0.7) +
          3.0 * Math.sin(TAU * 9 * t + 2.1) +
          2.2 * Math.sin(TAU * 14 * t + 4.4)
        );
      };
      for (let i = 0; i <= SAMPLES; i++) {
        let s = 0;
        for (let k = -WIN; k <= WIN; k++) s += raw[(i + k + SAMPLES) % SAMPLES];
        this.trailPts[i].y = s / (2 * WIN + 1) + hill(i);
      }
    }
    for (let i = 0; i < SAMPLES; i++) {
      const p = this.trailPts[i];
      const cx = Math.floor(p.x / CELL);
      const cz = Math.floor(p.z / CELL);
      for (let ox = -1; ox <= 1; ox++)
        for (let oz = -1; oz <= 1; oz++) {
          const k = gridKey(cx + ox, cz + oz);
          let arr = this.trailGrid.get(k);
          if (!arr) {
            arr = [];
            this.trailGrid.set(k, arr);
          }
          arr.push(i);
        }
    }
    this.pickKickers();

    // railway loop around the trail: bed heights smoothed off the base terrain
    // (wide window — trains hate grades), pulled level with the trail bed
    // through the level crossings so both cross at grade
    this.rail = RailPath.build(
      (x, z) => this.baseTerrain(x, z),
      (x, z) => {
        const ti = this.trailInfo(x, z);
        return ti.dist < 26 ? { y: ti.y + 0.1, w: smooth(1 - ti.dist / 26) } : null;
      },
    );
    this.railCrossings = findCrossings(this.rail.pts, this.trailPts);

    // Port Marin: the town beside the jungle. Its shelf and access road
    // carve the terrain (terrainHeight consults it from here on), so the
    // site exists before any mesh or asset does — pure math, like the rail.
    this.city = CitySite.build({
      base: (x, z) => this.baseTerrain(x, z),
      junction: (() => {
        const i = Math.floor(SAMPLES * JUNCTION_T);
        const p = this.trailPts[i];
        const t = this.trailTan[i];
        return { x: p.x, z: p.z, y: p.y, tx: t.x, tz: t.z };
      })(),
      trailNear: (x, z) => {
        const ti = this.trailInfo(x, z);
        return ti.dist < 18 ? { y: ti.y, w: smooth(1 - ti.dist / 18) } : null;
      },
      railNear: (x, z) => {
        const ri = this.rail.info(x, z, this.tmpRailInfo);
        return ri.dist < 22 ? { y: ri.y, w: smooth(1 - ri.dist / 22) } : null;
      },
    });

    // water levels sit on the finished terrain (city carve included)
    this.stream.level = this.terrainHeight(this.stream.c.x, this.stream.c.z) + 0.62;
    for (const p of this.ponds) p.level = this.terrainHeight(p.x, p.z) + 0.55;

    this.input.onConnectChange = (c, id) => {
      this.updatePadChip(c, id);
      this.onPadChange?.(c, id);
    };
  }

  /* =====================================================================
     TRAIL & TERRAIN FUNCTIONS
     ===================================================================== */

  private trailInfo(x: number, z: number): { dist: number; y: number; i: number; t: number; s: number } {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    const arr = this.trailGrid.get(gridKey(cx, cz));
    let best = 1e9;
    let bi = 0;
    if (arr) {
      for (let n = 0; n < arr.length; n++) {
        const i = arr[n];
        const p = this.trailPts[i];
        const dx = p.x - x;
        const dz = p.z - z;
        const d = dx * dx + dz * dz;
        if (d < best) {
          best = d;
          bi = i;
        }
      }
    } else {
      for (let i = 0; i < SAMPLES; i += 7) {
        const p = this.trailPts[i];
        const dx = p.x - x;
        const dz = p.z - z;
        const d = dx * dx + dz * dz;
        if (d < best) {
          best = d;
          bi = i;
        }
      }
    }
    this.tmpInfo.dist = Math.sqrt(best);
    this.tmpInfo.i = bi;
    // Bed height INTERPOLATED along the segment. The raw nearest-sample value
    // is a staircase (~1.2-unit steps): all four wheel probes then read the
    // same step, the sampled grade collapses to zero, and the jeep never
    // pitches on slopes. Central-difference along the tangent restores the
    // true local grade at the query point.
    const bp = this.trailPts[bi];
    const bt = this.trailTan[bi];
    const along = clamp((x - bp.x) * bt.x + (z - bp.z) * bt.z, -this.segLen, this.segLen);
    const yNext = this.trailPts[(bi + 1) % SAMPLES].y;
    const yPrev = this.trailPts[(bi - 1 + SAMPLES) % SAMPLES].y;
    this.tmpInfo.y = bp.y + ((yNext - yPrev) / (2 * this.segLen)) * along;
    this.tmpInfo.t = bi / SAMPLES;
    // fractional sample position along the trail (for kickers)
    this.tmpInfo.s = bi + along / this.segLen;
    return this.tmpInfo;
  }

  private roadDamage(x: number, z: number, t: number, dist: number): number {
    let d = 0;
    const across = dist;
    // shallow wheel ruts + mild washboard — a rideable track, not a wash-out
    const rut =
      Math.exp(-Math.pow((across - 1.55) / 0.75, 2)) * 0.5 +
      Math.exp(-Math.pow((across - 0.15) / 0.6, 2)) * 0.12;
    d -= rut * (0.14 + 0.1 * Math.sin(t * TAU * 17.0));
    d += fbm(x * 0.12, z * 0.12, 3) * 0.16;
    d += fbm(x * 0.42, z * 0.42, 2) * 0.06;
    const ph = fbm(x * 0.055 + 41, z * 0.055 - 17, 2);
    if (ph > 0.42) d -= (ph - 0.42) * 0.8;
    const rocky = clamp((t - 0.16) / 0.06, 0, 1) * clamp((0.3 - t) / 0.06, 0, 1);
    d += fbm(x * 0.3, z * 0.3, 3) * 0.34 * rocky;
    return d;
  }

  private baseTerrain(x: number, z: number): number {
    let h = fbm(x * 0.0042, z * 0.0042, 4) * 26.0;
    h += fbm(x * 0.016, z * 0.016, 4) * 6.2;
    h += fbm(x * 0.07, z * 0.07, 3) * 1.1;
    const r = Math.hypot(x, z);
    h += Math.max(0, (r - 330) / 110) * 48;
    return h;
  }

  /** Height of the jump kickers at fractional trail position `s`, 0 elsewhere. */
  private kickHeight(s: number): number {
    let h = 0;
    for (const k of this.kickers) {
      let u = (s - k) * this.segLen; // world units past the lip (negative = approach)
      if (u > SAMPLES * this.segLen * 0.5) u -= SAMPLES * this.segLen;
      else if (u < -SAMPLES * this.segLen * 0.5) u += SAMPLES * this.segLen;
      if (u <= -KICK_RISE || u >= KICK_FALL) continue;
      h += KICK_H * (u < 0 ? smooth((u + KICK_RISE) / KICK_RISE) : 1 - smooth(u / KICK_FALL));
    }
    return h;
  }

  /**
   * Choose kicker sites: the straightest, driest stretches near a few fixed
   * fractions of the lap (clear of the start line, bridge, ford and ponds).
   */
  private pickKickers(): void {
    const out: number[] = [];
    for (const f of [0.1, 0.37, 0.5, 0.79]) {
      const centre = Math.floor(f * SAMPLES);
      let best = -1;
      let bestCurve = 1e9;
      for (let i = centre - 40; i <= centre + 40; i += 2) {
        const idx = (i + SAMPLES) % SAMPLES;
        const p = this.trailPts[idx];
        if (this.nearWater(p.x, p.z, 1.9)) continue;
        // straightness over the run-up and landing (~±45 units)
        const a = this.trailTan[(idx - 38 + SAMPLES) % SAMPLES];
        const b = this.trailTan[(idx + 12) % SAMPLES];
        const curve = Math.hypot(a.x - b.x, a.z - b.z);
        if (curve < bestCurve) {
          bestCurve = curve;
          best = idx;
        }
      }
      if (best >= 0 && bestCurve < 0.35) out.push(best);
    }
    this.kickers = out;
  }

  private terrainHeight(x: number, z: number): number {
    const info = this.trailInfo(x, z);
    const base = this.baseTerrain(x, z);
    let h: number;
    if (info.dist < ROAD_HALF) {
      h = info.y + this.roadDamage(x, z, info.t, info.dist);
    } else if (info.dist < ROAD_HALF + ROAD_BLEND) {
      // The bed ≈ the smoothed floor, so this blend is a long shallow
      // grassy berm (max grade stays far below 45°), not a retaining wall.
      const k = smooth((info.dist - ROAD_HALF) / ROAD_BLEND);
      const road = info.y + this.roadDamage(x, z, info.t, ROAD_HALF) * 0.6;
      h = lerp(road, base, k);
    } else {
      h = base;
    }
    // jump kickers ride the road bed, fading out just past its shoulder
    if (this.kickers.length > 0 && info.dist < ROAD_HALF + KICK_SHOULDER) {
      h += this.kickHeight(info.s) * (1 - smooth(clamp((info.dist - ROAD_HALF + 0.6) / (KICK_SHOULDER + 0.6), 0, 1)));
    }
    // Port Marin: town shelf + the paved access road (the road cuts the
    // terrace; the railway carve below keeps right of way at the crossing)
    h = this.city.carve(x, z, h);
    // railway bed: flat ballast on a smoothed embankment, level with the trail
    // where the two cross — the Jungle Express has right of way
    if (this.rail) {
      const ri = this.rail.info(x, z, this.tmpRailInfo);
      if (ri.dist < RAIL_BED + RAIL_BLEND) {
        h = lerp(ri.y, h, smooth(clamp((ri.dist - RAIL_BED) / RAIL_BLEND, 0, 1)));
      }
    }
    // carve the stream ford + pond bowls (ponds shallower than the ford)
    const sd = Math.hypot(x - this.stream.c.x, z - this.stream.c.z);
    if (sd < this.stream.r) h -= smooth(1 - sd / this.stream.r) * 1.35;
    for (const p of this.ponds) {
      const pd = Math.hypot(x - p.x, z - p.z);
      if (pd < p.r) h -= smooth(1 - pd / p.r) * 1.1;
    }
    return isFinite(h) ? h : 0;
  }

  private surfaceAt(x: number, z: number): string {
    const info = this.trailInfo(x, z);
    let inWater = false;
    let nearWater = false;
    const check = (bx: number, bz: number, br: number): void => {
      const sd = Math.hypot(x - bx, z - bz);
      if (sd < br * 0.55) inWater = true;
      else if (sd < br) nearWater = true;
    };
    check(this.stream.c.x, this.stream.c.z, this.stream.r);
    for (const p of this.ponds) check(p.x, p.z, p.r);
    if (inWater) return "water";
    // Port Marin's pavement: grippy, fast, quiet
    if (this.city.asphaltAt(x, z)) return "asphalt";
    // railway ballast: chunky gravel, a gentle rumble strip
    if (this.rail.dist(x, z) < RAIL_BED + 0.9) return "ballast";
    if (info.dist > ROAD_HALF + 2.5) return "grass";
    const rocky = info.t > 0.16 && info.t < 0.3;
    if (rocky) return "rock";
    const wet = fbm(x * 0.03 + 7, z * 0.03 - 3, 2);
    if (wet > 0.12 || nearWater) return "mud";
    return "dirt";
  }

  /**
   * Register a solid obstacle with the physics world (streamed in/out around
   * the car — see PropStreamer). Round by default; pass `bx/bz` for a capsule
   * (fallen log). `height` is how far the solid part rises above its base: a
   * trunk is "tall" (the canopy above is NOT solid), a boulder is not — a jump
   * clears it.
   */
  private addCollider(
    x: number,
    z: number,
    r: number,
    e = 0.4,
    o: { bx?: number; bz?: number; height?: number; y0?: number } = {},
  ): void {
    const y0 = o.y0 ?? this.groundHeight(x, z);
    const height = o.height ?? 40;
    const props = this.propStream;
    if (o.bx !== undefined && o.bz !== undefined) {
      const dx = o.bx - x;
      const dz = o.bz - z;
      const len = Math.hypot(dx, dz);
      props?.add({
        shape: { kind: "log", halfLen: len / 2, radius: r },
        x: (x + o.bx) / 2,
        y: y0 + height - r,
        z: (z + o.bz) / 2,
        rotY: Math.atan2(-dz, dx),
        e,
      });
      this.colliders.push({ x, z, r: r + 0.6 }, { x: o.bx, z: o.bz, r: r + 0.6 });
    } else if (height >= 20) {
      // trunk: a tall post rooted a little below the surface
      props?.add({ shape: { kind: "cylinder", halfHeight: 7, radius: r }, x, y: y0 + 6.5, z, e });
      this.colliders.push({ x, z, r });
    } else {
      props?.add({ shape: { kind: "ball", radius: r }, x, y: y0 + height - r, z, e });
      this.colliders.push({ x, z, r });
    }
  }
  /** Terrain height exactly as rendered (falls back to the analytic form). */
  private groundHeight(x: number, z: number): number {
    return this.heightGrid ? this.heightGrid.sample(x, z) : this.terrainHeight(x, z);
  }

  /* =====================================================================
     RENDERER / SCENE
     ===================================================================== */

  private initRenderer(): void {
    const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.15, this.Q.far * 2.4);
    camera.position.set(0, 6, 12);
    this.camera = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.Q.pixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.shadowMap.enabled = this.Q.shadowsOn;
    // PCFSoftShadowMap was removed in this three version (falls back with a
    // console warning) — use PCF directly.
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = renderer;
    this.root?.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x8fb377, 0.0026);
    this.scene = scene;

    scene.add(new THREE.HemisphereLight(0xb8d8f8, 0x47702a, 1.15));
    scene.add(new THREE.AmbientLight(0xffe0b8, 0.45));

    const sun = new THREE.DirectionalLight(0xffd898, 3.2);
    sun.position.set(120, 110, -70);
    sun.castShadow = this.Q.shadowsOn;
    sun.shadow.mapSize.set(this.Q.shadow, this.Q.shadow);
    const S = 68;
    sun.shadow.camera.left = -S;
    sun.shadow.camera.right = S;
    sun.shadow.camera.top = S;
    sun.shadow.camera.bottom = -S;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 340;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.045;
    scene.add(sun);
    scene.add(sun.target);
    this.sunLight = sun;

    // procedural sky dome
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uSun: { value: new THREE.Vector3(0.62, 0.52, -0.4).normalize() },
      },
      vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
      varying vec3 vP; uniform float uTime; uniform vec3 uSun;
      float h(vec2 p){ return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5453); }
      float n2(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      void main(){
        vec3 d=normalize(vP);
        float y=clamp(d.y*0.5+0.5,0.0,1.0);
        vec3 low=vec3(0.88,0.78,0.55);
        vec3 mid=vec3(0.42,0.65,0.88);
        vec3 top=vec3(0.15,0.35,0.72);
        vec3 c = mix(low, mid, smoothstep(0.44,0.58,y));
        c = mix(c, top, smoothstep(0.55,0.92,y));
        float sun=max(dot(d,normalize(uSun)),0.0);
        c += vec3(1.0,0.82,0.48)*pow(sun,32.0)*0.45;
        c += vec3(1.0,0.88,0.65)*pow(sun,5.0)*0.10;
        vec2 uv = d.xz/max(d.y,0.16)*0.45 + vec2(uTime*0.0035, uTime*0.0016);
        float cl = n2(uv)*0.55 + n2(uv*2.1+3.1)*0.3 + n2(uv*4.3-1.7)*0.15;
        cl = smoothstep(0.56,0.86,cl)*smoothstep(0.02,0.30,d.y);
        c = mix(c, vec3(0.97,0.95,0.92), cl*0.55);
        c = min(c, vec3(1.0));
        gl_FragColor=vec4(c,1.0);
      }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 32, 20), skyMat);
    sky.frustumCulled = false;
    scene.add(sky);
    this.sky = sky;

    // post: bloom + warm jungle grade
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.28, 0.85, 0.88),
    );
    const grade = new ShaderPass({
      uniforms: this.gradeShaderUniforms,
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
      uniform sampler2D tDiffuse; varying vec2 vUv;
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        vec3 col = c.rgb;
        col = pow(col, vec3(0.92,0.96,1.04));
        col += vec3(0.038,0.025,0.006) * (1.0 - smoothstep(0.0,0.50,dot(col,vec3(0.333))));
        col *= vec3(1.06,1.03,0.94);
        col = mix(col, col*col*(3.0-2.0*col), 0.30);
        col = mix(vec3(dot(col,vec3(0.333))), col, 1.22);
        vec2 uvc = vUv - 0.5;
        float vig = 1.0 - dot(uvc,uvc)*0.45;
        col *= vig;
        gl_FragColor = vec4(col, c.a);
      }`,
    });
    composer.addPass(grade);
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  /* =====================================================================
     WORLD BUILDERS
     ===================================================================== */

  private buildTerrain(): void {
    const scene = this.scene;
    if (!scene) return;
    const seg = this.Q.terrainSeg;
    const geo = new THREE.PlaneGeometry(WORLD, WORLD, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const heights = new Float32Array(pos.count);
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const cMud = new THREE.Color(0x553820),
      cDirt = new THREE.Color(0x8a6a42),
      cGrass = new THREE.Color(0x54992f),
      cGrass2 = new THREE.Color(0x428a26),
      cMeadow = new THREE.Color(0x6fb441),
      cRock = new THREE.Color(0x787568),
      cBallast = new THREE.Color(0x807c6e),
      cAsphalt = new THREE.Color(0x45464b),
      cLawn = new THREE.Color(0x7fa14e),
      cWet = new THREE.Color(0x2a1e12);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = this.terrainHeight(x, z);
      pos.setY(i, y);
      heights[i] = y;
      const info = this.trailInfo(x, z);
      const n = fbm(x * 0.09, z * 0.09, 2);
      if (info.dist < ROAD_HALF + 1.4) {
        const wet = fbm(x * 0.03 + 7, z * 0.03 - 3, 2);
        c.copy(wet > 0.12 ? cMud : cDirt).offsetHSL(0, 0, n * 0.05);
        if (info.t > 0.16 && info.t < 0.3) c.lerp(cRock, 0.5);
      } else if (info.dist < ROAD_HALF + ROAD_BLEND) {
        const k = (info.dist - ROAD_HALF - 1.4) / (ROAD_BLEND - 1.4);
        c.copy(cDirt).lerp(cGrass, clamp(k, 0, 1)).offsetHSL(0, 0, n * 0.05);
      } else {
        const patch = fbm(x * 0.028 + 11, z * 0.028 - 5, 3);
        c.copy(n > 0 ? cGrass : cGrass2).offsetHSL(n * 0.02, 0.03, n * 0.06);
        if (patch > 0.1) c.lerp(cMeadow, clamp((patch - 0.1) * 1.6, 0, 0.55));
        const micro = fbm(x * 0.33, z * 0.33, 2);
        c.offsetHSL(0, micro * 0.04, micro * 0.05);
        if (y > 34) c.lerp(cRock, clamp((y - 34) / 24, 0, 0.85));
      }
      // railway ballast: gravel over the bed, fading into the surroundings
      const ri = this.rail.info(x, z, this.tmpRailInfo);
      if (ri.dist < RAIL_BED + RAIL_BLEND) {
        // gravel identity only needs to own the strip around the track —
        // let the outer bench read as sparse ground so the corridor doesn't
        // look like a second dirt road
        c.lerp(cBallast, 1 - smooth(clamp((ri.dist - 3.2) / 5.3, 0, 1)));
      }
      // Port Marin: asphalt over the streets and access road, kept lawn
      // across the town shelf
      const gk = this.city.groundKind(x, z);
      if (gk === 1) c.lerp(cAsphalt, 0.88);
      else if (gk === 2) c.lerp(cLawn, 0.5);      const sd = Math.hypot(x - this.stream.c.x, z - this.stream.c.z);
      if (sd < this.stream.r) c.lerp(cWet, smooth(1 - sd / this.stream.r) * 0.8);
      for (const p of this.ponds) {
        const pd = Math.hypot(x - p.x, z - p.z);
        if (pd < p.r) c.lerp(cWet, smooth(1 - pd / p.r) * 0.8);
      }
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    this.heightGrid = new HeightGrid(WORLD, seg, heights);
    const terrain = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.02 }),
    );
    terrain.receiveShadow = true;
    scene.add(terrain);
  }

  private buildWater(): void {
    const scene = this.scene;
    if (!scene) return;
    const waterMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; varying vec3 vW; uniform float uTime;
      void main(){ vUv=uv; vec3 p=position;
        p.y += sin(p.x*0.9+uTime*1.6)*0.035 + cos(p.z*1.1-uTime*1.2)*0.03;
        vec4 w=modelMatrix*vec4(p,1.0); vW=w.xyz;
        gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `varying vec2 vUv; varying vec3 vW; uniform float uTime;
      float h(vec2 p){return fract(sin(dot(p,vec2(27.1,61.7)))*43758.5453);}
      float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
      void main(){
        float d=length(vUv-0.5)*2.0;
        float rip = n2(vW.xz*1.4+vec2(uTime*0.5,uTime*0.32))*0.6 + n2(vW.xz*3.3-uTime*0.4)*0.4;
        vec3 col = mix(vec3(0.12,0.22,0.18), vec3(0.28,0.48,0.42), rip);
        col += vec3(0.65,0.80,0.70)*pow(rip,5.0)*0.65;
        float spec = pow(max(rip*0.8+0.2, 0.0), 12.0)*0.35;
        col += vec3(1.0,0.95,0.8)*spec;
        float a = (0.72 + rip*0.18) * smoothstep(1.0,0.68,d);
        gl_FragColor=vec4(col,a);
      }`,
    });
    this.waterMat = waterMat;
    const addWater = (x: number, z: number, r: number, level: number): void => {
      const g = new THREE.CircleGeometry(r * 1.02, 40);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, waterMat);
      m.position.set(x, level, z);
      m.renderOrder = 2;
      scene.add(m);
    };
    addWater(this.stream.c.x, this.stream.c.z, this.stream.r, this.stream.level);
    for (const p of this.ponds) addWater(p.x, p.z, p.r, p.level);
  }

  private readonly woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4b2c, roughness: 0.92 });
  private readonly woodDark = new THREE.MeshStandardMaterial({ color: 0x4a3320, roughness: 0.95 });

  private buildBridge(): void {
    const scene = this.scene;
    if (!scene) return;
    const i = this.bridgeI;
    const p = this.trailPts[i];
    const t = this.trailTan[i];
    const g = new THREE.Group();
    g.position.copy(p);
    g.position.y += 0.05;
    g.rotation.y = Math.atan2(t.x, t.z);
    const plankG = new THREE.BoxGeometry(ROAD_HALF * 2.05, 0.16, 0.62);
    for (let k = -16; k <= 16; k++) {
      const m = new THREE.Mesh(plankG, k % 2 ? this.woodMat : this.woodDark);
      m.position.set(0, 0.1, k * 0.68);
      m.rotation.z = (hash2(k, 3) - 0.5) * 0.02;
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    const railG = new THREE.BoxGeometry(0.16, 0.16, 22.5);
    const postG = new THREE.BoxGeometry(0.2, 0.95, 0.2);
    for (const s of [-1, 1]) {
      const r = new THREE.Mesh(railG, this.woodMat);
      r.position.set(s * (ROAD_HALF - 0.15), 0.92, 0);
      r.castShadow = true;
      g.add(r);
      for (let k = -5; k <= 5; k++) {
        const po = new THREE.Mesh(postG, this.woodDark);
        po.position.set(s * (ROAD_HALF - 0.15), 0.5, k * 2.1);
        po.castShadow = true;
        g.add(po);
      }
    }
    const beamG = new THREE.BoxGeometry(0.3, 0.3, 23);
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(beamG, this.woodDark);
      b.position.set(s * 3.1, -0.08, 0);
      g.add(b);
    }
    scene.add(g);
  }

  private makeSignTexture(text: string, sub: string): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 160;
    const x = c.getContext("2d");
    if (!x) throw new Error("no 2d ctx");
    x.fillStyle = "#c9a24a";
    x.fillRect(0, 0, 256, 160);
    x.fillStyle = "rgba(90,60,25,0.25)";
    for (let i = 0; i < 200; i++) {
      x.fillRect(Math.random() * 256, Math.random() * 160, Math.random() * 20, 1);
    }
    x.strokeStyle = "#4c3517";
    x.lineWidth = 8;
    x.strokeRect(6, 6, 244, 148);
    x.fillStyle = "#3a2810";
    x.textAlign = "center";
    x.font = "bold 40px sans-serif";
    x.fillText(text, 128, 80);
    if (sub) {
      x.font = "500 20px sans-serif";
      x.fillText(sub, 128, 114);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  private buildSigns(): void {
    const scene = this.scene;
    if (!scene) return;
    const specs: { t: number; txt: string; sub: string }[] = [
      { t: 0.02, txt: "BASE CAMP", sub: "trail start" },
      { t: 0.19, txt: "ROCKY CLIMB", sub: "low gear" },
      { t: 0.4, txt: "DEEP RUTS", sub: "slow down" },
      { t: 0.55, txt: "CLEARING", sub: "scenic" },
      { t: 0.63, txt: "BRIDGE", sub: "one vehicle" },
      { t: 0.71, txt: "WATER", sub: "ford ahead" },
      { t: 0.86, txt: "SWITCHBACK", sub: "sharp bends" },
    ];
    // the turn-off to Port Marin (just past the access-road mouth)
    specs.push({ t: JUNCTION_T + 0.007, txt: "PORT MARIN", sub: "paved road" });
    const postG = new THREE.CylinderGeometry(0.09, 0.11, 2.3, 7);
    for (const s of specs) {
      const i = Math.floor(s.t * SAMPLES) % SAMPLES;
      const p = this.trailPts[i];
      const tan = this.trailTan[i];
      const side = new THREE.Vector3(-tan.z, 0, tan.x).multiplyScalar(ROAD_HALF + 1.5);
      const g = new THREE.Group();
      const px = p.x + side.x;
      const pz = p.z + side.z;
      if (this.rail.dist(px, pz) < 9.5) continue; // never on the railway bed
      g.position.set(px, this.terrainHeight(px, pz), pz);
      g.rotation.y = Math.atan2(tan.x, tan.z) + Math.PI / 2;
      const post = new THREE.Mesh(postG, this.woodDark);
      post.position.y = 1.15;
      post.castShadow = true;
      g.add(post);
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.94, 0.07),
        [
          this.woodDark,
          this.woodDark,
          this.woodDark,
          this.woodDark,
          new THREE.MeshStandardMaterial({ map: this.makeSignTexture(s.txt, s.sub), roughness: 0.85 }),
          this.woodDark,
        ],
      );
      board.position.y = 2.05;
      board.castShadow = true;
      g.add(board);
      scene.add(g);
    }

    // level-crossing warnings: both trail approaches to every rail crossing,
    // posted on the side away from the rails
    for (const c of this.railCrossings) {
      let bi = 0;
      let best = 1e9;
      for (let i = 0; i < SAMPLES; i++) {
        const d = (this.trailPts[i].x - c.x) ** 2 + (this.trailPts[i].z - c.z) ** 2;
        if (d < best) {
          best = d;
          bi = i;
        }
      }
      for (const off of [-14, 14]) {
        const i = (bi + off + SAMPLES) % SAMPLES;
        const p = this.trailPts[i];
        const tan = this.trailTan[i];
        let sideX = -tan.z;
        let sideZ = tan.x;
        // flip to the far side if this one faces the rails
        if (this.rail.dist(p.x + sideX * 8, p.z + sideZ * 8) < this.rail.dist(p.x - sideX * 8, p.z - sideZ * 8)) {
          sideX = -sideX;
          sideZ = -sideZ;
        }
        const px = p.x + sideX * (ROAD_HALF + 1.5);
        const pz = p.z + sideZ * (ROAD_HALF + 1.5);
        if (this.rail.dist(px, pz) < 9.5) continue;
        const g = new THREE.Group();
        g.position.set(px, this.terrainHeight(px, pz), pz);
        g.rotation.y = Math.atan2(tan.x, tan.z) + Math.PI / 2;
        const post = new THREE.Mesh(postG, this.woodDark);
        post.position.y = 1.15;
        post.castShadow = true;
        g.add(post);
        const board = new THREE.Mesh(
          new THREE.BoxGeometry(1.5, 0.94, 0.07),
          [
            this.woodDark,
            this.woodDark,
            this.woodDark,
            this.woodDark,
            new THREE.MeshStandardMaterial({ map: this.makeSignTexture("CROSSING", "express line"), roughness: 0.85 }),
            this.woodDark,
          ],
        );
        board.position.y = 2.05;
        board.castShadow = true;
        g.add(board);
        scene.add(g);
      }
    }
  }

  private buildLogs(rnd: () => number): void {
    const scene = this.scene;
    if (!scene) return;
    const logG = new THREE.CylinderGeometry(0.34, 0.42, 5.2, 8);
    logG.rotateZ(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0x54402a, roughness: 0.95 });
    const count = 26;
    const im = new THREE.InstancedMesh(logG, mat, count);
    im.castShadow = true;
    im.receiveShadow = true;
    const d = new THREE.Object3D();
    for (let k = 0; k < count; k++) {
      // retry until clear of the railway — a log across the rails would sit
      // in the Express's path (and look like a collapsed log train)
      let x = 0;
      let z = 0;
      for (let tries = 0; tries < 24; tries++) {
        const i = Math.floor(rnd() * SAMPLES);
        const p = this.trailPts[i];
        const tan = this.trailTan[i];
        const off = (ROAD_HALF + 2.0 + rnd() * 4.0) * (rnd() < 0.5 ? -1 : 1);
        x = p.x - tan.z * off;
        z = p.z + tan.x * off;
        if (this.rail.dist(x, z) > 9.5) break;
      }
      d.position.set(x, this.terrainHeight(x, z) + 0.3, z);
      d.rotation.set((rnd() - 0.5) * 0.25, rnd() * TAU, (rnd() - 0.5) * 0.2);
      const lsc = 0.7 + rnd() * 0.8;
      d.scale.setScalar(lsc);
      d.updateMatrix();
      im.setMatrixAt(k, d.matrix);
      // fallen logs: a capsule along the trunk axis (not a blob at its middle)
      const ry = d.rotation.y;
      const hl = 2.6 * lsc - 0.4 * lsc;
      this.addCollider(x + Math.cos(ry) * hl, z - Math.sin(ry) * hl, 0.4 * lsc, 0.52, {
        bx: x - Math.cos(ry) * hl,
        bz: z + Math.sin(ry) * hl,
        height: 0.3 + 0.42 * lsc,
      });
    }
    scene.add(im);
  }

  /* ------------------------------------------------------------------ */

  /**
   * Scatter one Quaternius pack model: one InstancedMesh per part (bark /
   * leaves share the same placement matrices). Foliage parts wind-sway; leaf
   * quads cast leaf-shaped shadows via an alpha-cut depth material.
   */
  private readonly shadowDepthMats = new Map<THREE.Texture, THREE.MeshDepthMaterial>();

  private scatterPack(
    model: PackModel,
    placements: { x: number; y: number; z: number; rot: number; scale: number }[],
    opts: { sway?: number; cast?: boolean; tint?: boolean } = {},
  ): void {
    const scene = this.scene;
    if (!scene || placements.length === 0) return;
    const d = new THREE.Object3D();
    const col = new THREE.Color();
    for (const part of model.parts) {
      const mat = part.material as THREE.MeshStandardMaterial;
      const alphaBlend = !!mat.transparent || !!mat.alphaTest;
      const im = new THREE.InstancedMesh(part.geometry, part.material, placements.length);
      im.receiveShadow = true;
      placements.forEach((p, i) => {
        d.position.set(p.x, p.y, p.z);
        d.rotation.set(0, p.rot, 0);
        d.scale.setScalar(p.scale);
        d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
        if (opts.tint !== false) {
          const hv = hash2(i, 5);
          // near-white tint so instance colour variation never muddies the art
          col.setHSL(0.28 + (hv - 0.5) * 0.035, 0.22, 0.8 + hv * 0.15);
          im.setColorAt(i, col);
        }
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();

      const wantsShadow = (opts.cast ?? true) && this.Q.shadowsOn;
      if (wantsShadow) {
        if (alphaBlend) {
          // leaf quads: cut out the alpha holes in the shadow pass too
          const map = mat.map;
          if (map) {
            let dm = this.shadowDepthMats.get(map);
            if (!dm) {
              dm = new THREE.MeshDepthMaterial({
                depthPacking: THREE.RGBADepthPacking,
                map,
                alphaTest: 0.5,
              });
              this.shadowDepthMats.set(map, dm);
            }
            im.customDepthMaterial = dm;
            im.castShadow = true;
          }
        } else {
          im.castShadow = true;
        }
      }

      const sway = opts.sway ?? 0;
      if (sway > 0 && this.isFoliagePart(part.material)) {
        this.addWindSway(part.material, sway);
        this.vegetation.push({ mesh: im, amp: sway });
      }
      scene.add(im);
    }
  }

  private isFoliagePart(mat: THREE.Material): boolean {
    return /leaf|leaves|flower|grass|petal|plant|fruit/i.test(mat.name);
  }

  /* ------------------------------------------------------------------ */

  private addWindSway(mat: THREE.Material, amp: number): void {
    if (this.windMats.includes(mat)) return; // shared materials across models
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = { value: 0 };
      sh.vertexShader = `uniform float uTime;\n` + sh.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec4 ipos = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
        float sway = sin(uTime*1.4 + ipos.x*0.35 + ipos.z*0.27) + sin(uTime*2.3 + ipos.z*0.5)*0.5;
        transformed.x += sway * ${amp.toFixed(4)} * max(transformed.y, 0.0);
        transformed.z += sway * ${amp.toFixed(4)} * 0.6 * max(transformed.y, 0.0);
      #endif`,
      );
      (mat.userData as { uTime?: { value: number } }).uTime = sh.uniforms.uTime as { value: number };
    };
    mat.needsUpdate = true;
    this.windMats.push(mat);
  }

  private addInstanced(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    count: number,
    placer: (d: THREE.Object3D, i: number) => boolean,
    cast = true,
  ): THREE.InstancedMesh | null {
    const scene = this.scene;
    if (!scene || count <= 0) return null;
    const im = new THREE.InstancedMesh(geo, mat, count);
    im.castShadow = cast && this.Q.shadowsOn;
    im.receiveShadow = true;
    const d = new THREE.Object3D();
    let n = 0;
    for (let i = 0; i < count; i++) {
      if (placer(d, i)) {
        d.updateMatrix();
        im.setMatrixAt(n++, d.matrix);
      }
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
    // Instance-aware bounds so frustum culling never drops visible plants.
    im.computeBoundingSphere();
    scene.add(im);
    return im;
  }

  private buildJungle(): void {
    const scene = this.scene;
    if (!scene) return;
    const rnd = mulberry(1337);
    // --- placement helpers: terrain-fit (slope rejection) + min-spacing grid.
    // Together these keep the jungle evenly distributed and rooted where it
    // belongs instead of clumping into impassable walls of green.
    const placed = new Map<number, { x: number; z: number; r: number }[]>();
    const spaceFree = (x: number, z: number, r: number): boolean => {
      const cx = Math.floor(x / CELL);
      const cz = Math.floor(z / CELL);
      for (let ox = -1; ox <= 1; ox++)
        for (let oz = -1; oz <= 1; oz++) {
          const arr = placed.get(gridKey(cx + ox, cz + oz));
          if (!arr) continue;
          for (const p of arr) if (Math.hypot(x - p.x, z - p.z) < r + p.r) return false;
        }
      return true;
    };
    const spaceTake = (x: number, z: number, r: number): void => {
      const k = gridKey(Math.floor(x / CELL), Math.floor(z / CELL));
      let arr = placed.get(k);
      if (!arr) {
        arr = [];
        placed.set(k, arr);
      }
      arr.push({ x, z, r });
    };
    const slopeAt = (x: number, z: number): number => {
      const e = 1.8;
      const gx = this.terrainHeight(x + e, z) - this.terrainHeight(x - e, z);
      const gz = this.terrainHeight(x, z + e) - this.terrainHeight(x, z - e);
      return Math.hypot(gx, gz) / (2 * e);
    };
    const pick = (
      minD: number,
      maxD: number,
      maxR: number,
      opts: { space?: number; slope?: number; railMin?: number } = {},
    ) => {
      for (let tries = 0; tries < 40; tries++) {
        const a = rnd() * TAU;
        const r = Math.sqrt(rnd()) * (maxR || BOUND - 6);
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        const info = this.trailInfo(x, z);
        if (info.dist < minD || info.dist > maxD) continue;
        if (this.rail.dist(x, z) < (opts.railMin ?? 9.5)) continue; // keep the railway clear
        if (this.city.exclusion(x, z)) continue; // Port Marin and its road stay clear
        if (this.nearWater(x, z, 0.9)) continue;
        if (opts.slope !== undefined && slopeAt(x, z) > opts.slope) continue;
        if (opts.space !== undefined) {
          if (!spaceFree(x, z, opts.space)) continue;
          spaceTake(x, z, opts.space);
        }
        return { x, z, y: this.terrainHeight(x, z), dist: info.dist };
      }
      return null;
    };

    // --- Quaternius pack vegetation (all trees/bushes/flowers/grass/rocks).
    const props = this.props;
    if (!props) {
      console.warn("[jeep] CC0 Quaternius pack missing — jungle vegetation skipped");
    } else {
      // trees: maples (canopy) with a dead-tree undergrowth share
      const treeData: { x: number; z: number; y: number; sc: number; rot: number }[] = [];
      for (let i = 0; i < this.Q.trees; i++) {
        const s = pick(TREE_LINE + 1.5, 999, BOUND - 4, { space: 8, slope: 0.5, railMin: 14 });
        if (s)
          treeData.push({
            ...s,
            sc: 7.5 + rnd() * 6.5, // placement scale = model height in world units
            rot: rnd() * TAU,
          });
      }
      const treeDeadCount = Math.floor(this.Q.trees * 0.16);
      const deadData: { x: number; z: number; y: number; sc: number; rot: number }[] = [];
      for (let i = 0; i < treeDeadCount; i++) {
        const s = pick(TREE_LINE + 0.5, 999, BOUND - 4, { space: 6.5, slope: 0.55 });
        if (s)
          deadData.push({
            ...s,
            sc: 5.0 + rnd() * 5.5,
            rot: rnd() * TAU,
          });
      }
      /** `solid` = restitution; adds a trunk-sized collider per instance. */
      const splitByModel = (
        data: { x: number; z: number; y: number; sc: number; rot: number }[],
        models: PackModel[],
        solid?: number,
      ): void => {
        if (models.length === 0) return;
        if (solid !== undefined) {
          // Only the TRUNK is solid — measured from the model, at its real
          // (possibly bent-over) root position, not the canopy footprint.
          data.forEach((t, k) => {
            const tr = models[k % models.length].trunk ?? { x: 0, z: 0, r: 0.05 };
            const c = Math.cos(t.rot);
            const sn = Math.sin(t.rot);
            this.addCollider(
              t.x + (tr.x * c + tr.z * sn) * t.sc,
              t.z + (-tr.x * sn + tr.z * c) * t.sc,
              tr.r * t.sc + 0.08,
              solid,
              { y0: t.y },
            );
          });
        }
        models.forEach((model, mi) => {
          this.scatterPack(
            model,
            data.filter((_, k) => k % models.length === mi).map((t) => ({
              x: t.x,
              y: t.y,
              z: t.z,
              rot: t.rot,
              scale: t.sc,
            })),
            { sway: 0.028, cast: true },
          );
        });
      };
      splitByModel(treeData, props.trees, 0.24);
      splitByModel(deadData, props.dead, 0.3);

      // palms along the trail shoulder
      const palmData: { x: number; z: number; y: number; sc: number; rot: number }[] = [];
      for (let i = 0; i < this.Q.palms; i++) {
        const s = pick(TREE_LINE + 1.0, 999, BOUND - 8, { space: 7.5, slope: 0.45 });
        if (s)
          palmData.push({
            ...s,
            sc: 7.0 + rnd() * 4.5,
            rot: rnd() * TAU,
          });
      }
      splitByModel(palmData, props.palms, 0.28);

      // birches: sparse, lighter silhouette accents
      const birchData: { x: number; z: number; y: number; sc: number; rot: number }[] = [];
      for (let i = 0; i < Math.floor(this.Q.trees * 0.12); i++) {
        const s = pick(TREE_LINE + 5, 999, BOUND - 6, { space: 9, slope: 0.45 });
        if (s) birchData.push({ ...s, sc: 8.0 + rnd() * 3.0, rot: rnd() * TAU });
      }
      splitByModel(birchData, props.birches, 0.3);

      // pines: a tall far ring, framing the playfield
      const pineData: { x: number; z: number; y: number; sc: number; rot: number }[] = [];
      for (let i = 0; i < Math.floor(this.Q.trees * 0.35); i++) {
        const s = pick(ROAD_HALF + 45, 999, BOUND - 10, { space: 11, slope: 0.55 });
        if (s) pineData.push({ ...s, sc: 12 + rnd() * 8, rot: rnd() * TAU });
      }
      splitByModel(pineData, props.pines, 0.24);

      // bushes — spread evenly through the whole jungle
      const bushData: { x: number; z: number; y: number; sc: number; rot: number }[] = [];
      for (let i = 0; i < this.Q.bushes; i++) {
        const s = pick(TREE_LINE - 2, 999, BOUND - 3, { space: 3.4, slope: 0.5 });
        if (s)
          bushData.push({
            ...s,
            sc: 0.9 + rnd() * 1.1,
            rot: rnd() * TAU,
          });
      }
      splitByModel(bushData, props.bushes);

      // flower clumps instead of the old procedural ferns — everywhere, evenly
      const flowerData: { x: number; z: number; y: number; sc: number; rot: number }[] = [];
      for (let i = 0; i < this.Q.ferns; i++) {
        const s = pick(TREE_LINE, 999, BOUND - 3, { space: 2.6, slope: 0.45 });
        if (s)
          flowerData.push({
            ...s,
            sc: 0.45 + rnd() * 0.6,
            rot: rnd() * TAU,
          });
      }
      splitByModel(flowerData, props.flowers);

      // plant sprigs: low undergrowth everywhere
      const plantData: { x: number; z: number; y: number; sc: number; rot: number }[] = [];
      for (let i = 0; i < 200; i++) {
        const s = pick(TREE_LINE, 999, BOUND - 3, { space: 2.4, slope: 0.45 });
        if (s) plantData.push({ ...s, sc: 0.5 + rnd() * 0.6, rot: rnd() * TAU });
      }
      splitByModel(plantData, props.plants);

      // grass clumps astride the trail and across the jungle floor
      const grassData: { x: number; z: number; y: number; sc: number; rot: number }[] = [];
      for (let i = 0; i < this.Q.grass; i++) {
        const s = pick(TREE_LINE, 999, BOUND - 2, { space: 2.0, slope: 0.5 });
        if (s)
          grassData.push({
            ...s,
            sc: 0.5 + rnd() * 0.7,
            rot: rnd() * TAU,
          });
      }
      // Grass_Large_Extruded reads heavy at distance — use it sparingly
      const grassModels = props.grass;
      grassModels.forEach((model, mi) => {
        const share = model === grassModels[1] ? Math.floor(grassData.length * 0.2) : Math.floor(grassData.length * 0.4);
        const sub = grassData
          .filter((_, k) => k % grassModels.length === mi)
          .slice(0, share)
          .map((g) => ({ x: g.x, y: g.y, z: g.z, rot: g.rot, scale: g.sc }));
        this.scatterPack(model, sub, { sway: 0.05, cast: false });
      });

      // rocks — big ones far out with colliders, small ones on the trail
      const rockFar: { x: number; z: number; y: number; sc: number; rot: number }[] = [];
      const rockNear: { x: number; z: number; y: number; sc: number; rot: number }[] = [];
      for (let i = 0; i < Math.floor(this.Q.rocks * 0.6); i++) {
        const s = pick(TREE_LINE, 999, BOUND - 3, { space: 4.5, slope: 0.8 });
        if (s) rockFar.push({ ...s, sc: 0.8 + rnd() * 2.6, rot: rnd() * TAU });
      }
      for (let i = 0; i < Math.floor(this.Q.rocks * 0.4); i++) {
        const s = pick(0.5, ROAD_HALF + 4, BOUND - 3);
        if (s) {
          const onRoad = s.dist < ROAD_HALF;
          rockNear.push({ ...s, sc: onRoad ? 0.16 + rnd() * 0.22 : 0.3 + rnd() * 0.9, rot: rnd() * TAU });
        }
      }
      // boulders really bounce — solid up to ~their height, so a jump can clear one
      for (const r of rockFar) if (r.sc > 1.2) this.addCollider(r.x, r.z, r.sc * 0.7, 0.58, { y0: r.y, height: r.sc * 0.85 });
      props.rocks.forEach((model, mi) => {
        const sub = [
          ...rockFar.filter((_, k) => k % props.rocks.length === mi),
          ...rockNear.filter((_, k) => k % props.rocks.length === mi),
        ].map((r) => ({ x: r.x, y: r.y, z: r.z, rot: r.rot, scale: r.sc }));
        this.scatterPack(model, sub, { sway: 0, cast: true, tint: false });
      });

      // petals: ground confetti (small, cheap, no shadows)
      const petalData: { x: number; z: number; y: number; sc: number; rot: number }[] = [];
      for (let i = 0; i < 240; i++) {
        const s = pick(TREE_LINE, 999, BOUND - 3, { space: 1.4 });
        if (s) petalData.push({ ...s, sc: 0.25 + rnd() * 0.25, rot: rnd() * TAU });
      }
      splitByModel(petalData, props.petals);
    }
    // --- exposed roots
    const rootG = new THREE.TorusGeometry(0.8, 0.13, 5, 9, Math.PI);
    const rootM = new THREE.MeshStandardMaterial({ color: 0x4a3a26, roughness: 0.95 });
    this.addInstanced(
      rootG,
      rootM,
      120,
      (d) => {
        const s = pick(ROAD_HALF - 0.6, ROAD_HALF + 2.2, BOUND - 3);
        if (!s) return false;
        d.position.set(s.x, s.y - 0.05, s.z);
        d.rotation.set(0, rnd() * TAU, 0);
        const sc = 0.6 + rnd() * 1.1;
        d.scale.setScalar(sc);
        return true;
      },
      false,
    );

    // --- distant jungle silhouette bands
    for (let b = 0; b < 3; b++) {
      const r = 470 + b * 90;
      const g = new THREE.CylinderGeometry(r, r, 60 + b * 26, 48, 1, true);
      const m = new THREE.Mesh(
        g,
        new THREE.MeshBasicMaterial({
          color: 0x5c7a63,
          transparent: true,
          opacity: 0.7 - b * 0.16,
          fog: true,
          depthWrite: false,
          side: THREE.BackSide,
        }),
      );
      m.material.color.setHSL(0.32, 0.14 - b * 0.03, 0.3 + b * 0.09);
      m.position.y = 18 + b * 12;
      m.renderOrder = -1;
      scene.add(m);
    }
  }

  /* ------------------------------------------------------------------ */

  private buildLightShafts(): void {
    const scene = this.scene;
    if (!scene) return;
    const rnd = mulberry(4242);
    const geo = new THREE.PlaneGeometry(3.4, 26);
    const sunDir = new THREE.Vector3(0.62, 0.52, -0.4).normalize();
    for (let i = 0; i < 26; i++) {
      const a = rnd() * TAU;
      const r = 30 + rnd() * (BOUND - 60);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = this.terrainHeight(x, z);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffe9b0,
        transparent: true,
        opacity: 0.035 + rnd() * 0.05,
        fog: false,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y + 11 + rnd() * 5, z);
      m.lookAt(x + sunDir.x * 10, y + 11 + sunDir.y * 10, z + sunDir.z * 10);
      m.rotateX(Math.PI / 2);
      m.rotation.z = rnd() * 0.4 - 0.2;
      m.renderOrder = 5;
      m.userData = { base: mat.opacity, ph: rnd() * TAU };
      scene.add(m);
      this.shafts.push(m);
    }
  }

  private buildFireflies(): void {
    const scene = this.scene;
    if (!scene) return;
    const rnd = mulberry(777);
    const pos = new Float32Array(this.FF_N * 3);
    const dat: { x: number; y: number; z: number; ph: number; sp: number; amp: number }[] = [];
    for (let i = 0; i < this.FF_N; i++) {
      const a = rnd() * TAU;
      const r = 20 + rnd() * (BOUND - 50);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = this.terrainHeight(x, z);
      dat.push({ x, y: y + 0.8 + rnd() * 3.4, z, ph: rnd() * TAU, sp: 0.4 + rnd() * 0.8, amp: 0.5 + rnd() * 1.2 });
      pos[i * 3] = dat[i].x;
      pos[i * 3 + 1] = dat[i].y;
      pos[i * 3 + 2] = dat[i].z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.ffAttr = geo.attributes.position;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `uniform float uTime; varying float vTw;
      void main(){
        vec4 mv=modelViewMatrix*vec4(position,1.0);
        vTw=0.55+0.45*sin(uTime*2.2+position.x*3.1+position.z*1.7);
        gl_PointSize=(2.6+vTw*3.2)*140.0/max(-mv.z,1.0);
        gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying float vTw;
      void main(){
        vec2 d=gl_PointCoord-0.5; float r=length(d);
        if(r>0.5) discard;
        float a=smoothstep(0.5,0.0,r);
        vec3 col=mix(vec3(1.0,0.85,0.35), vec3(0.75,1.0,0.45), vTw*0.5);
        gl_FragColor=vec4(col, a*vTw*0.9); }`,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.userData = dat;
    scene.add(pts);
    this.fireflies = pts;
  }

  private updateAtmosphere(dt: number): void {
    for (const s of this.shafts) {
      const mat = s.material as THREE.MeshBasicMaterial;
      mat.opacity =
        (s.userData.base as number) * (0.75 + 0.25 * Math.sin(this.time * 0.5 + (s.userData.ph as number)));
    }
    if (this.fireflies && this.ffAttr) {
      (this.fireflies.material as THREE.ShaderMaterial).uniforms.uTime.value = this.time;
      const dat = this.fireflies.userData as { x: number; y: number; z: number; ph: number; sp: number; amp: number }[];
      for (let i = 0; i < this.FF_N; i++) {
        const d = dat[i];
        this.ffAttr.setXYZ(
          i,
          d.x + Math.sin(this.time * d.sp + d.ph) * d.amp,
          d.y + Math.sin(this.time * d.sp * 1.4 + d.ph * 2.0) * 0.55,
          d.z + Math.cos(this.time * d.sp * 0.8 + d.ph) * d.amp,
        );
      }
      this.ffAttr.needsUpdate = true;
    }
    void dt;
  }

  /* =====================================================================
     JEEP MODEL
     ===================================================================== */

  private readonly M = {
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

  private plateTexture(): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 96;
    const x = c.getContext("2d");
    if (!x) throw new Error("no 2d ctx");
    x.fillStyle = "#e9e6dc";
    x.fillRect(0, 0, 256, 96);
    x.strokeStyle = "#20242a";
    x.lineWidth = 6;
    x.strokeRect(5, 5, 246, 86);
    x.fillStyle = "#1b2027";
    x.font = "bold 52px monospace";
    x.textAlign = "center";
    x.fillText("JGL-4X4", 128, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private buildWheel(): THREE.Group {
    const M = this.M;
    const g = new THREE.Group();
    const R = 0.5;
    const W = 0.34;
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(R, R, W, 22, 1, false), M.rubber);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    tire.receiveShadow = true;
    g.add(tire);
    for (const s of [-1, 1]) {
      const sw = new THREE.Mesh(new THREE.TorusGeometry(R * 0.94, 0.055, 6, 20), M.rubber);
      sw.rotation.y = Math.PI / 2;
      sw.position.x = s * W * 0.5;
      g.add(sw);
    }
    const blockG = new THREE.BoxGeometry(W * 0.3, 0.085, 0.135);
    const rows = 3;
    const per = 17;
    const im = new THREE.InstancedMesh(blockG, M.rubber, rows * per);
    im.castShadow = true;
    const d = new THREE.Object3D();
    let n = 0;
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < per; i++) {
        const a = (i / per) * TAU + r * 0.22;
        d.position.set((r - 1) * W * 0.31, Math.cos(a) * (R + 0.015), Math.sin(a) * (R + 0.015));
        d.rotation.set(-a + (r - 1) * 0.22, 0, 0);
        d.updateMatrix();
        im.setMatrixAt(n++, d.matrix);
      }
    }
    im.instanceMatrix.needsUpdate = true;
    g.add(im);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.62, R * 0.62, W * 0.92, 16), M.blackSemi);
    rim.rotation.z = Math.PI / 2;
    g.add(rim);
    for (const s of [-1, 1]) {
      const face = new THREE.Mesh(new THREE.CircleGeometry(R * 0.62, 16), M.blackSemi);
      face.rotation.y = (s * Math.PI) / 2;
      face.position.x = s * (W * 0.47);
      g.add(face);
      for (let k = 0; k < 5; k++) {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.03, R * 0.5, 0.09), M.steel);
        sp.position.set(s * (W * 0.5), Math.cos((k / 5) * TAU) * R * 0.3, Math.sin((k / 5) * TAU) * R * 0.3);
        sp.rotation.x = (k / 5) * TAU;
        g.add(sp);
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10), M.chrome);
      hub.rotation.z = Math.PI / 2;
      hub.position.x = s * (W * 0.52);
      g.add(hub);
      for (let k = 0; k < 5; k++) {
        const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.035, 6), M.chrome);
        nut.rotation.z = Math.PI / 2;
        nut.position.set(s * (W * 0.54), Math.cos((k / 5) * TAU) * 0.16, Math.sin((k / 5) * TAU) * 0.16);
        g.add(nut);
      }
    }
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.46, R * 0.46, 0.035, 18), M.dirtySteel);
    disc.rotation.z = Math.PI / 2;
    g.add(disc);
    const cal = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.1), M.shackleRed);
    cal.position.set(0, R * 0.36, 0.06);
    g.add(cal);
    return g;
  }

  private buildUndercarriage(): THREE.Group {
    const M = this.M;
    const u = new THREE.Group();
    const rail = new THREE.BoxGeometry(0.16, 0.2, 3.85);
    for (const s of [-1, 1]) {
      const r = new THREE.Mesh(rail, M.dirtySteel);
      r.position.set(s * 0.52, -0.3, 0);
      r.castShadow = true;
      u.add(r);
    }
    for (const z of [-1.45, -0.55, 0.35, 1.35]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.12, 0.14), M.dirtySteel);
      c.position.set(0, -0.3, z);
      u.add(c);
    }
    const gb = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.72), M.blackSemi);
    gb.position.set(0, -0.34, -0.35);
    gb.castShadow = true;
    u.add(gb);
    const tc = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.42), M.steel);
    tc.position.set(-0.06, -0.38, 0.12);
    u.add(tc);
    const dsF = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.15, 8), M.chrome);
    dsF.rotation.x = Math.PI / 2;
    dsF.position.set(0, -0.42, -1.05);
    u.add(dsF);
    const dsR = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 8), M.chrome);
    dsR.rotation.x = Math.PI / 2;
    dsR.position.set(0, -0.42, 0.95);
    u.add(dsR);
    const ft = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.28, 0.74), M.dirtySteel);
    ft.position.set(0.02, -0.36, 0.92);
    ft.castShadow = true;
    u.add(ft);
    const pipe1 = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 2.1, 8), M.steel);
    pipe1.rotation.x = Math.PI / 2;
    pipe1.position.set(0.42, -0.4, -0.55);
    u.add(pipe1);
    const muff = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.62, 10), M.dirtySteel);
    muff.rotation.z = Math.PI / 2;
    muff.position.set(0.5, -0.4, 0.62);
    u.add(muff);
    const pipe2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8), M.steel);
    pipe2.rotation.x = Math.PI / 2;
    pipe2.position.set(0.62, -0.4, 1.2);
    u.add(pipe2);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.062, 0.22, 10), M.chrome);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(0.62, -0.4, 1.72);
    u.add(tip);
    const sp1 = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.05, 0.85), M.blackMatte);
    sp1.position.set(0, -0.46, -1.3);
    u.add(sp1);
    const sp2 = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.05, 0.7), M.blackMatte);
    sp2.position.set(0, -0.5, -0.3);
    u.add(sp2);
    const mud = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.03, 3.4), M.mudMat);
    mud.position.set(0, -0.24, 0);
    u.add(mud);
    return u;
  }

  private buildAxle(isFront: boolean): THREE.Group {
    const M = this.M;
    const g = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 1.78, 10), M.dirtySteel);
    tube.rotation.z = Math.PI / 2;
    tube.castShadow = true;
    g.add(tube);
    const diff = new THREE.Mesh(new THREE.SphereGeometry(0.215, 12, 10), M.dirtySteel);
    diff.position.set(isFront ? -0.08 : 0.06, 0, isFront ? -0.06 : 0.06);
    diff.scale.set(1, 1, 0.85);
    diff.castShadow = true;
    g.add(diff);
    const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.09, 12), M.steel);
    cover.rotation.x = Math.PI / 2;
    cover.position.set(diff.position.x, 0, isFront ? -0.24 : 0.26);
    g.add(cover);
    for (const s of [-1, 1]) {
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.16, 10), M.blackSemi);
      hub.rotation.z = Math.PI / 2;
      hub.position.x = s * 0.86;
      g.add(hub);
    }
    for (const s of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 1.05), M.dirtySteel);
      leaf.position.set(s * 0.55, 0.05, 0);
      g.add(leaf);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.62), M.steel);
      arm.position.set(s * 0.62, -0.06, isFront ? 0.34 : -0.34);
      arm.rotation.x = isFront ? -0.16 : 0.16;
      g.add(arm);
    }
    return g;
  }

  private buildSpring(): THREE.Group {
    const M = this.M;
    const g = new THREE.Group();
    const coil = new THREE.Group();
    const ringG = new THREE.TorusGeometry(0.105, 0.021, 5, 12);
    for (let i = 0; i < 7; i++) {
      const r = new THREE.Mesh(ringG, M.steel);
      r.rotation.x = Math.PI / 2;
      r.position.y = i * 0.055;
      coil.add(r);
    }
    coil.name = "coil";
    g.add(coil);
    const shockBody = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 8), M.redDark);
    shockBody.position.y = 0.1;
    g.add(shockBody);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 8), M.chrome);
    rod.position.y = 0.3;
    rod.name = "rod";
    g.add(rod);
    return g;
  }

  private buildInterior(): THREE.Group {
    const M = this.M;
    const g = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.05, 2.0), M.blackMatte);
    floor.position.set(0, 0.06, 0.3);
    g.add(floor);
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.34, 0.3), M.dash);
    dash.position.set(0, 0.52, -0.72);
    g.add(dash);
    const dashTop = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.42), M.blackMatte);
    dashTop.position.set(0, 0.7, -0.8);
    dashTop.rotation.x = -0.12;
    g.add(dashTop);
    const grabBar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.38, 8), M.chrome);
    grabBar.rotation.z = Math.PI / 2;
    grabBar.position.set(0.42, 0.64, -0.6);
    g.add(grabBar);
    const cbBox = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.18), M.blackSemi);
    cbBox.position.set(0, 0.44, -0.62);
    g.add(cbBox);
    const cbDial = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 8), M.chrome);
    cbDial.rotation.x = Math.PI / 2;
    cbDial.position.set(-0.06, 0.44, -0.52);
    g.add(cbDial);
    let dialIdx = 0;
    for (const dx of [-0.1, 0.14]) {
      const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.03, 14), M.blackSemi);
      dial.rotation.x = Math.PI / 2 + 0.16;
      dial.position.set(-0.42 + dx, 0.58, -0.58);
      g.add(dial);
      const face = new THREE.Mesh(
        new THREE.CircleGeometry(0.072, 14),
        new THREE.MeshStandardMaterial({ color: 0x0e1114, emissive: 0x2a6b4a, emissiveIntensity: 0.35, roughness: 0.5 }),
      );
      face.rotation.set(-0.16, 0, 0);
      face.position.set(-0.42 + dx, 0.58, -0.56);
      g.add(face);
      const needlePiv = new THREE.Group();
      needlePiv.name = dialIdx === 0 ? "speedoNeedle" : "tachoNeedle";
      needlePiv.position.set(-0.42 + dx, 0.58, -0.555);
      needlePiv.rotation.set(-0.16, 0, 0);
      const needleMesh = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.055, 0.005), M.needleMat);
      needleMesh.position.set(0, 0.025, 0);
      needlePiv.add(needleMesh);
      g.add(needlePiv);
      dialIdx++;
    }
    const rvmArm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 6), M.blackMatte);
    rvmArm.position.set(0, 1.22, -0.92);
    rvmArm.rotation.x = 0.4;
    g.add(rvmArm);
    const rvm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.09, 0.03), M.mirror);
    rvm.position.set(0, 1.18, -0.9);
    g.add(rvm);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 8), M.blackSemi);
    col.position.set(-0.42, 0.44, -0.42);
    col.rotation.x = 0.72;
    g.add(col);
    const sw = new THREE.Group();
    sw.name = "steeringWheel";
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.026, 7, 22), M.blackMatte);
    sw.add(rim);
    for (let k = 0; k < 3; k++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.175, 0.018), M.blackSemi);
      sp.rotation.z = (k / 3) * TAU;
      sp.position.set(Math.sin((k / 3) * TAU) * -0.09, Math.cos((k / 3) * TAU) * 0.09, 0);
      sw.add(sp);
    }
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 12), M.redDark);
    boss.rotation.x = Math.PI / 2;
    sw.add(boss);
    sw.position.set(-0.42, 0.6, -0.29);
    sw.rotation.x = -0.85;
    g.add(sw);
    for (const sx of [-0.42, 0.42]) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.14, 0.52), M.seat);
      base.position.set(sx, 0.3, 0.16);
      base.castShadow = true;
      g.add(base);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.66, 0.13), M.seat);
      back.position.set(sx, 0.62, 0.44);
      back.rotation.x = -0.16;
      back.castShadow = true;
      g.add(back);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.1), M.seatTrim);
      trim.position.set(sx, 0.86, 0.41);
      g.add(trim);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.14), M.seat);
      head.position.set(sx, 1.0, 0.44);
      g.add(head);
    }
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.14, 0.46), M.seat);
    bench.position.set(0, 0.3, 1.02);
    g.add(bench);
    const benchBack = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.5, 0.12), M.seat);
    benchBack.position.set(0, 0.56, 1.26);
    g.add(benchBack);
    const lev = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 0.34, 7), M.chrome);
    lev.position.set(-0.02, 0.35, -0.12);
    lev.rotation.x = -0.22;
    g.add(lev);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), M.blackMatte);
    knob.position.set(-0.02, 0.52, -0.16);
    g.add(knob);
    const lev2 = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.022, 0.26, 7), M.steel);
    lev2.position.set(0.12, 0.31, -0.02);
    lev2.rotation.x = -0.3;
    g.add(lev2);
    for (let k = 0; k < 3; k++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.13), M.steel);
      p.position.set(-0.62 + k * 0.14, 0.16, -0.6);
      p.rotation.x = -0.34;
      g.add(p);
    }
    const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.24, 6), M.blackMatte);
    hb.position.set(0.14, 0.36, 0.06);
    hb.rotation.x = -0.7;
    g.add(hb);
    return g;
  }

  private buildJeep(): void {
    const scene = this.scene;
    const M = this.M;
    if (!scene) return;
    const jeep = new THREE.Group();
    this.jeep = jeep;
    const bodyGroup = new THREE.Group();
    this.bodyGroup = bodyGroup;
    jeep.add(bodyGroup);

    const tub = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.62, 3.55), M.redGloss);
    tub.position.set(0, 0.16, 0);
    tub.castShadow = true;
    tub.receiveShadow = true;
    bodyGroup.add(tub);
    const tubLower = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.3, 3.45), M.redDark);
    tubLower.position.set(0, -0.16, 0);
    tubLower.castShadow = true;
    bodyGroup.add(tubLower);
    for (const s of [-1, 1]) {
      const rock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 2.6), M.blackMatte);
      rock.position.set(s * 0.88, -0.24, 0.05);
      rock.castShadow = true;
      bodyGroup.add(rock);
      const mud = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 2.4), M.mudMat);
      mud.position.set(s * 0.93, -0.3, 0.05);
      bodyGroup.add(mud);
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 1.5), M.blackSemi);
      step.position.set(s * 0.98, -0.4, 0.05);
      step.castShadow = true;
      bodyGroup.add(step);
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 3.4), M.blackMatte);
      seam.position.set(s * 0.87, 0.3, 0);
      bodyGroup.add(seam);
    }

    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.16, 1.18), M.redGloss);
    hood.position.set(0, 0.5, -1.3);
    hood.rotation.x = -0.035;
    hood.castShadow = true;
    bodyGroup.add(hood);
    const bulge = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.09, 0.8), M.redGloss);
    bulge.position.set(0, 0.58, -1.34);
    bulge.castShadow = true;
    bodyGroup.add(bulge);
    for (const s of [-1, 1]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.02, 1.15), M.blackMatte);
      line.position.set(s * 0.46, 0.585, -1.3);
      bodyGroup.add(line);
      const latch = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.06), M.chrome);
      latch.position.set(s * 0.62, 0.52, -1.86);
      bodyGroup.add(latch);
    }
    const cowl = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.16, 0.24), M.redDark);
    cowl.position.set(0, 0.56, -0.7);
    bodyGroup.add(cowl);

    for (const s of [-1, 1]) {
      const latchB = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.04), M.blackSemi);
      latchB.position.set(s * 0.84, 0.46, -1.3);
      bodyGroup.add(latchB);
      const latchT = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 6), M.chrome);
      latchT.rotation.z = Math.PI / 2;
      latchT.position.set(s * 0.84, 0.52, -1.3);
      bodyGroup.add(latchT);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.12), M.rubber);
      pad.position.set(s * 0.35, 0.59, -1.4);
      bodyGroup.add(pad);
    }

    // grille
    const grilleBacking = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.48, 0.02), M.blackMatte);
    grilleBacking.position.set(0, 0.34, -1.93);
    bodyGroup.add(grilleBacking);
    const grillePanel = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.52, 0.1), M.blackMatte);
    grillePanel.position.set(0, 0.34, -1.9);
    grillePanel.castShadow = true;
    bodyGroup.add(grillePanel);
    for (let k = 0; k < 7; k++) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.06), M.redDark);
      slot.position.set(-0.54 + k * 0.18, 0.34, -1.945);
      bodyGroup.add(slot);
    }
    const grilleFrame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 0.06), M.redGloss);
    grilleFrame.position.set(0, 0.34, -1.86);
    bodyGroup.add(grilleFrame);

    // headlights
    for (const s of [-1, 1]) {
      const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.14, 16), M.blackSemi);
      housing.rotation.x = Math.PI / 2;
      housing.position.set(s * 0.56, 0.4, -1.9);
      bodyGroup.add(housing);
      const refl = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 10, 0, TAU, 0, Math.PI / 2), M.reflector);
      refl.rotation.x = Math.PI / 2;
      refl.position.set(s * 0.56, 0.4, -1.9);
      bodyGroup.add(refl);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.168, 18), M.lampGlass.clone());
      lens.position.set(s * 0.56, 0.4, -1.975);
      lens.rotation.y = Math.PI;
      this.headlampMeshes.push(lens);
      bodyGroup.add(lens);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.022, 6, 18), M.chrome);
      ring.position.set(s * 0.56, 0.4, -1.96);
      bodyGroup.add(ring);
      const ind = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.06), M.amber);
      ind.position.set(s * 0.3, 0.56, -1.93);
      bodyGroup.add(ind);
      const sl = new THREE.SpotLight(0xffe6b8, 0, 58, 0.55, 0.42, 1.3);
      sl.position.set(s * 0.56, 0.4, -2.0);
      sl.target.position.set(s * 0.5, -0.9, -16);
      bodyGroup.add(sl);
      bodyGroup.add(sl.target);
      this.headlights.push(sl);
    }

    // bull bar + fog lights
    const bar = new THREE.Group();
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 7, 18, Math.PI), M.blackMatte);
    hoop.position.set(0, 0.34, -2.1);
    hoop.castShadow = true;
    bar.add(hoop);
    const vbar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.9, 8), M.blackMatte);
    vbar.position.set(0, 0.1, -2.1);
    bar.add(vbar);
    for (const s of [-1, 1]) {
      const stay = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.55, 8), M.blackMatte);
      stay.position.set(s * 0.36, 0, -2.1);
      bar.add(stay);
      const link = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.36, 8), M.blackMatte);
      link.rotation.x = Math.PI / 2;
      link.position.set(s * 0.36, -0.18, -1.96);
      bar.add(link);
      const fogPod = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 12), M.blackMatte);
      fogPod.rotation.x = Math.PI / 2;
      fogPod.position.set(s * 0.28, 0.18, -2.12);
      bar.add(fogPod);
      const fogLens = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), M.yellowFog);
      fogLens.position.set(s * 0.28, 0.18, -2.162);
      fogLens.rotation.y = Math.PI;
      bar.add(fogLens);
    }
    bodyGroup.add(bar);

    // winch
    const winchBody = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.16, 0.2), M.blackSemi);
    winchBody.position.set(0, 0.06, -2.08);
    bodyGroup.add(winchBody);
    const winchDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.26, 12), M.winchCable);
    winchDrum.rotation.z = Math.PI / 2;
    winchDrum.position.set(0, 0.06, -2.08);
    bodyGroup.add(winchDrum);
    const solenoidBox = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.14), M.blackMatte);
    solenoidBox.position.set(0, 0.19, -2.08);
    bodyGroup.add(solenoidBox);
    const fairlead = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.05), M.chrome);
    fairlead.position.set(0, 0.06, -2.19);
    bodyGroup.add(fairlead);
    const winchHook = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.016, 6, 12), M.chrome);
    winchHook.position.set(0, 0.02, -2.22);
    winchHook.rotation.y = Math.PI / 2;
    bodyGroup.add(winchHook);

    // bumpers + shackles
    const fb = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.24, 0.28), M.blackMatte);
    fb.position.set(0, -0.02, -1.96);
    fb.castShadow = true;
    bodyGroup.add(fb);
    const rb = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.24, 0.26), M.blackMatte);
    rb.position.set(0, -0.02, 1.9);
    rb.castShadow = true;
    bodyGroup.add(rb);
    for (const s of [-1, 1]) {
      const fSh = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.02, 6, 12), M.shackleRed);
      fSh.position.set(s * 0.66, -0.02, -2.12);
      fSh.rotation.y = Math.PI / 2;
      bodyGroup.add(fSh);
      const rSh = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.02, 6, 12), M.shackleRed);
      rSh.position.set(s * 0.66, -0.02, 2.05);
      rSh.rotation.y = Math.PI / 2;
      bodyGroup.add(rSh);
    }

    // fenders
    for (let i = 0; i < 4; i++) {
      const p = this.wheelPos[i];
      const arch = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.075, 6, 14, Math.PI), M.blackMatte);
      arch.position.set(p.x * 1.03, 0.06, p.z);
      arch.rotation.y = Math.PI / 2;
      arch.castShadow = true;
      bodyGroup.add(arch);
      const flare = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 1.3), M.blackMatte);
      flare.position.set(p.x * 1.06, 0.24, p.z);
      bodyGroup.add(flare);
      const well = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.42, 12, 1, true), M.blackMatte);
      well.rotation.z = Math.PI / 2;
      well.position.set(p.x * 0.8, 0.02, p.z);
      (well.material as THREE.MeshStandardMaterial).side = THREE.BackSide;
      bodyGroup.add(well);
    }
    for (const s of [-1, 1]) {
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.02), M.rubber);
      flap.position.set(s * 0.88, -0.22, 1.64);
      bodyGroup.add(flap);
    }

    // windshield
    const wsAngle = -0.3;
    const wsFrame = new THREE.Group();
    const fTop = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.09, 0.09), M.blackSemi);
    fTop.position.set(0, 1.28, -0.98);
    wsFrame.add(fTop);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.86, 0.09), M.blackSemi);
      side.position.set(s * 0.8, 0.9, -0.87);
      side.rotation.x = wsAngle;
      wsFrame.add(side);
    }
    const fBot = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.09), M.blackSemi);
    fBot.position.set(0, 0.6, -0.76);
    wsFrame.add(fBot);
    wsFrame.children.forEach((c) => (c.castShadow = true));
    bodyGroup.add(wsFrame);
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.56, 0.8), M.glass);
    ws.position.set(0, 0.94, -0.885);
    ws.rotation.x = wsAngle;
    ws.renderOrder = 3;
    bodyGroup.add(ws);
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.02, 0.02), M.blackMatte);
      w.position.set(s * 0.35, 0.63, -0.8);
      w.rotation.z = s * 0.22;
      bodyGroup.add(w);
    }

    // roll cage
    const cageM = M.blackSemi;
    const cage = new THREE.Group();
    const tube = (len: number, r = 0.05) => new THREE.CylinderGeometry(r, r, len, 8);
    for (const s of [-1, 1]) {
      const hoopV = new THREE.Mesh(tube(1.05), cageM);
      hoopV.position.set(s * 0.8, 0.86, 0.62);
      cage.add(hoopV);
      const rearStay = new THREE.Mesh(tube(1.25), cageM);
      rearStay.position.set(s * 0.8, 0.86, 1.35);
      rearStay.rotation.x = 0.42;
      cage.add(rearStay);
      const roofRail = new THREE.Mesh(tube(1.75), cageM);
      roofRail.rotation.x = Math.PI / 2;
      roofRail.position.set(s * 0.8, 1.36, -0.2);
      cage.add(roofRail);
      const diag = new THREE.Mesh(tube(0.9), cageM);
      diag.position.set(s * 0.8, 0.95, 0.15);
      diag.rotation.x = -0.9;
      cage.add(diag);
    }
    const hoopTop = new THREE.Mesh(tube(1.6), cageM);
    hoopTop.rotation.z = Math.PI / 2;
    hoopTop.position.set(0, 1.38, 0.62);
    cage.add(hoopTop);
    const roofFront = new THREE.Mesh(tube(1.6), cageM);
    roofFront.rotation.z = Math.PI / 2;
    roofFront.position.set(0, 1.32, -0.98);
    cage.add(roofFront);
    const roofMid = new THREE.Mesh(tube(1.6, 0.04), cageM);
    roofMid.rotation.z = Math.PI / 2;
    roofMid.position.set(0, 1.37, -0.2);
    cage.add(roofMid);
    cage.children.forEach((c) => (c.castShadow = true));
    bodyGroup.add(cage);

    // roof light bar
    const lbBase = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.1, 0.12), M.blackMatte);
    lbBase.position.set(0, 1.46, -0.92);
    lbBase.castShadow = true;
    bodyGroup.add(lbBase);
    for (let k = 0; k < 4; k++) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.07, 12), M.lampGlass.clone());
      l.rotation.x = Math.PI / 2;
      l.position.set(-0.42 + k * 0.28, 1.46, -1.0);
      this.roofLamps.push(l);
      bodyGroup.add(l);
    }

    // mirrors
    for (const s of [-1, 1]) {
      const armM = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.26, 6), M.blackSemi);
      armM.position.set(s * 0.92, 0.98, -0.86);
      armM.rotation.z = s * 1.0;
      bodyGroup.add(armM);
      const shell = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.13), M.blackMatte);
      shell.position.set(s * 1.06, 1.0, -0.86);
      bodyGroup.add(shell);
      const mir = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.11), M.mirror);
      mir.position.set(s * 1.02, 1.0, -0.855);
      mir.rotation.y = ((s * Math.PI) / 2) * 1.0 + (s < 0 ? 0.2 : -0.2);
      bodyGroup.add(mir);
    }

    // doors
    for (const s of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.44, 1.18), M.redGloss);
      door.position.set(s * 0.855, 0.4, -0.08);
      door.castShadow = true;
      bodyGroup.add(door);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.2), M.chrome);
      handle.position.set(s * 0.92, 0.48, 0.22);
      bodyGroup.add(handle);
      for (const dz of [-0.52, 0.42]) {
        const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.1, 7), M.blackSemi);
        hinge.position.set(s * 0.9, 0.4, dz);
        bodyGroup.add(hinge);
      }
      const winF = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.44), M.glass);
      winF.position.set(s * 0.855, 0.94, -0.08);
      winF.rotation.y = Math.PI / 2;
      winF.renderOrder = 3;
      bodyGroup.add(winF);
    }

    // rear
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.72, 0.1), M.redGloss);
    tail.position.set(0, 0.28, 1.78);
    tail.castShadow = true;
    bodyGroup.add(tail);
    const tailSeam = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.02, 0.02), M.blackMatte);
    tailSeam.position.set(0, 0.6, 1.84);
    bodyGroup.add(tailSeam);
    for (const s of [-1, 1]) {
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.07), M.brake.clone());
      bl.position.set(s * 0.66, 0.4, 1.845);
      this.brakeMeshes.push(bl);
      bodyGroup.add(bl);
      const rl = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.06), M.reverse.clone());
      rl.position.set(s * 0.66, 0.18, 1.845);
      this.reverseMeshes.push(rl);
      bodyGroup.add(rl);
    }
    const spare = this.buildWheel();
    spare.scale.setScalar(0.94);
    spare.rotation.y = Math.PI / 2;
    spare.position.set(0.06, 0.52, 2.1);
    bodyGroup.add(spare);
    const carrier = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.42), M.blackMatte);
    carrier.position.set(0.06, 0.52, 1.94);
    bodyGroup.add(carrier);
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.46, 0.17),
      new THREE.MeshStandardMaterial({ map: this.plateTexture(), roughness: 0.6 }),
    );
    plate.position.set(-0.56, 0.06, 1.845);
    bodyGroup.add(plate);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.035, 14), M.chrome);
    cap.rotation.z = Math.PI / 2;
    cap.position.set(-0.88, 0.28, 1.1);
    bodyGroup.add(cap);

    // antenna
    const antBase = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.12, 8), M.blackSemi);
    antBase.position.set(0.86, 0.64, 1.76);
    bodyGroup.add(antBase);
    const antWhip = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 1.45, 6), M.steel);
    antWhip.position.set(0.86, 1.4, 1.76);
    antWhip.rotation.z = -0.08;
    bodyGroup.add(antWhip);
    const antTip = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), M.chrome);
    antTip.position.set(0.81, 2.12, 1.76);
    bodyGroup.add(antTip);

    // snorkel
    const snork = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.3, 10), M.blackMatte);
    snork.position.set(0.86, 0.86, -1.32);
    bodyGroup.add(snork);
    const snorkHead = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.24, 10), M.blackMatte);
    snorkHead.position.set(0.86, 1.56, -1.32);
    snorkHead.rotation.x = -0.35;
    bodyGroup.add(snorkHead);
    const snorkCap = new THREE.Mesh(new THREE.CircleGeometry(0.09, 10), M.blackSemi);
    snorkCap.position.set(0.86, 1.66, -1.36);
    snorkCap.rotation.x = -0.35;
    bodyGroup.add(snorkCap);

    // interior + undercarriage
    const interior = this.buildInterior();
    interior.position.set(0, -0.12, -0.1);
    bodyGroup.add(interior);
    this.steerWheelObj = interior.getObjectByName("steeringWheel") ?? null;
    // Cache per-frame animated nodes once (performance: no getObjectByName in the hot loop).
    this.speedoNeedle = interior.getObjectByName("speedoNeedle") ?? null;
    this.tachoNeedle = interior.getObjectByName("tachoNeedle") ?? null;
    bodyGroup.add(this.buildUndercarriage());

    // axles
    this.axleF = this.buildAxle(true);
    this.axleF.position.set(0, -0.42, -1.28);
    jeep.add(this.axleF);
    this.axleR = this.buildAxle(false);
    this.axleR.position.set(0, -0.42, 1.32);
    jeep.add(this.axleR);

    // wheels + springs
    for (let i = 0; i < 4; i++) {
      const holder = new THREE.Group();
      const steerG = new THREE.Group();
      const spin = this.buildWheel();
      spin.name = "spin";
      steerG.add(spin);
      holder.add(steerG);
      holder.position.copy(this.wheelPos[i]);
      holder.position.y = -0.42;
      jeep.add(holder);
      this.wheels.push({
        holder,
        steerG,
        spin,
        base: this.wheelPos[i].clone(),
        comp: 0,
        compV: 0,
        contact: 0,
        angle: 0,
        front: i < 2,
      });
      const sp = this.buildSpring();
      sp.position.set(this.wheelPos[i].x * 0.72, -0.42, this.wheelPos[i].z);
      jeep.add(sp);
      this.springs.push(sp);
      this.springParts.push({
        coil: sp.getObjectByName("coil") ?? null,
        rod: sp.getObjectByName("rod") ?? null,
      });
    }

    // --- Kenney car swap rig -------------------------------------------------
    // The car body mounts into bodyGroup (inheriting the vibration shake).
    // The jeep's own body visuals are moved into jeepBodyStash — hidden —
    // only while a Kenney car is active (see applyVehicleVisuals). The
    // interior and the headlight SpotLights always stay in bodyGroup; the
    // stock light transforms are remembered for the restore path.
    for (const sl of this.headlights) {
      this.headlightHome.push({
        light: sl,
        pos: sl.position.clone(),
        target: sl.target.position.clone(),
      });
    }
    jeep.add(this.jeepBodyStash);
    bodyGroup.add(this.carBody);

    scene.add(jeep);
  }

  /* =====================================================================
     VEHICLE SWAP — Kenney Car Kit (src/jeep/cars.ts)
     ===================================================================== */

  /**
   * Swap the visible vehicle. `null` restores the classic jeep. Loads the
   * model on first use (then cached); resolves false when unavailable.
   */
  async setVehicle(id: string | null): Promise<boolean> {
    const serial = ++this.vehicleSerial;
    if (!id) {
      if (serial === this.vehicleSerial) this.applyVehicleVisuals(null);
      this.notify("Jungle Jeep");
      return true;
    }
    const car = await loadCar(id);
    if (!car) {
      this.notify("Vehicle unavailable");
      return false;
    }
    if (serial === this.vehicleSerial) this.applyVehicleVisuals(car);
    this.notify(car.spec.label);
    return true;
  }

  /** Change the explorer's skin (character select); resolves once applied. */
  async setSkin(id: SkinId): Promise<void> {
    this.skin = id;
    await this.explorer?.setSkin(id);
  }
  private skin: SkinId = "skaterMaleA";

  private vehicleSerial = 0;

  /** Currently selected vehicle id (null = jeep) — for the shell's UI. */
  get vehicle(): string | null {
    return this.activeCar?.spec.id ?? null;
  }

  private applyVehicleVisuals(car: LoadedCar | null): void {
    const jeep = this.jeep;
    const bodyGroup = this.bodyGroup;
    if (!jeep || !bodyGroup || car === this.activeCar) return;

    // Stash the jeep's wheel visuals on first swap so they can be restored.
    if (this.jeepWheelStash.length === 0) {
      for (const w of this.wheels) this.jeepWheelStash.push(w.spin.children.slice());
    }

    // --- wheels: swap spin visuals + move holders to the car's footprint
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i];
      w.spin.clear();
      if (car) {
        const cw = car.wheels[i];
        if (cw) {
          for (const p of cw.parts) {
            const m = new THREE.Mesh(p.geometry, p.material);
            m.castShadow = true;
            m.receiveShadow = true;
            w.spin.add(m);
          }
          // base.y = per-wheel lift so wheels of different radii (tractors)
          // all touch the ground despite the shared axle height
          w.base.set(cw.x, cw.radius - this.wheelR, cw.z);
          w.holder.position.set(cw.x, -this.axleOff + w.base.y, cw.z);
        }
      } else {
        for (const obj of this.jeepWheelStash[i] ?? []) w.spin.add(obj);
        w.holder.position.set(this.wheelPos[i].x, -this.axleOff, this.wheelPos[i].z);
      }
      w.base.set(w.holder.position.x, 0, w.holder.position.z);
    }

    // --- body: stash jeep visuals (seats/interior included — they are
    // jeep-only dressing), mount the car's
    if (car) {
      if (!this.activeCar) {
        for (const child of [...bodyGroup.children]) {
          if (child === this.carBody) continue;
          if (this.headlightHome.some((h) => h.light === child || h.light.target === child)) continue;
          this.jeepBodyStash.add(child);
        }
        this.jeepBodyStash.visible = false;
      }
      this.carBody.clear();
      for (const p of car.parts) {
        const m = new THREE.Mesh(p.geometry, p.material);
        m.castShadow = true;
        m.receiveShadow = true;
        this.carBody.add(m);
      }
      // The model's own ground plane sits exactly on the wheel-contact plane.
      this.carBody.position.y = -WHEEL_CONTACT;
    } else {
      this.carBody.clear();
      if (this.activeCar) {
        // Restore stashed jeep body visuals (keeps their local transforms).
        while (this.jeepBodyStash.children.length > 0) {
          bodyGroup.add(this.jeepBodyStash.children[0]);
        }
        this.jeepBodyStash.visible = false;
      }
    }

    // --- jeep-only dressing: springs + axles hide under a car body
    for (const sp of this.springs) sp.visible = !car;
    if (this.axleF) this.axleF.visible = !car;
    if (this.axleR) this.axleR.visible = !car;

    // --- suspension/collision constants per vehicle
    if (car) {
      this.wheelR = car.wheelR;
      this.axleOff = WHEEL_CONTACT - car.wheelR;
      this.carR = Math.max(0.9, car.length * 0.37);
      this.track = Math.max(1.0, car.track);
      this.carLen = car.length;
      this.carWid = car.track + 0.4;
      this.exhaustZ = car.length * 0.48;
      this.perf = car.spec.perf;
    } else {
      this.wheelR = 0.5;
      this.axleOff = 0.42;
      this.carR = 1.3;
      this.track = 1.72;
      this.carLen = 3.55;
      this.carWid = 1.9;
      this.exhaustZ = 1.72;
      this.perf = { ...JEEP_PERF };
    }

    // --- headlights follow the vehicle's nose
    const fz = car ? -car.length / 2 : 0;
    const fy = car ? car.bodyH * 0.55 - WHEEL_CONTACT : 0;
    this.headlightHome.forEach((h, i) => {
      const sx = i === 0 ? -1 : 1;
      if (car) {
        h.light.position.set(sx * this.track * 0.32, fy, fz - 0.08);
        h.light.target.position.set(sx * this.track * 0.3, fy - 1.2, fz - 14);
      } else {
        h.light.position.copy(h.pos);
        h.light.target.position.copy(h.target);
      }
    });

    this.activeCar = car;
    for (const w of this.wheels) {
      w.comp = 0.16;
      w.compV = 0;
    }
    this.rebuildRig();
  }

  /**
   * Clone of the classic jeep (body + wheels, shared geometry) for the
   * start-screen turntable. The rig is lifted so the wheels touch y = 0,
   * matching the loader's car convention. Null before the world exists or
   * while nothing is built yet.
   */
  getJeepPreviewRig(): THREE.Group | null {
    const bodyGroup = this.bodyGroup;
    if (!this.jeep || !bodyGroup) return null;

    const rig = new THREE.Group();
    const mounted = new Set<THREE.Object3D>([this.carBody]);
    for (const h of this.headlightHome) {
      mounted.add(h.light);
      mounted.add(h.light.target);
    }
    const addClone = (child: THREE.Object3D): void => {
      if (mounted.has(child)) return;
      rig.add(child.clone(true));
    };
    // the jeep body lives in bodyGroup (jeep active) or the stash (car active)
    for (const child of bodyGroup.children) addClone(child);
    for (const child of this.jeepBodyStash.children) addClone(child);
    // wheels likewise (spin groups vs stash)
    for (let i = 0; i < 4; i++) {
      const src = this.jeepWheelStash.length > 0 ? this.jeepWheelStash[i] : (this.wheels[i]?.spin.children ?? []);
      for (const obj of src) {
        const clone = obj.clone(true);
        clone.position.set(this.wheelPos[i].x, -0.42, this.wheelPos[i].z);
        rig.add(clone);
      }
    }

    const outer = new THREE.Group();
    outer.add(rig);
    rig.position.y = 0.92; // wheel bottoms (r 0.5 at axle −0.42) land on y 0
    return outer;
  }

  /* =====================================================================
     CRASH DEBRIS — Kenney Car Kit debris parts
     ===================================================================== */

  /** Fetch the debris models and build the mesh pool (once, best-effort). */
  private async initDebris(): Promise<void> {
    try {
      const parts = await loadDebrisParts();
      if (parts.length === 0 || !this.scene || this.destroyed) return;
      this.debrisParts = parts;
      for (let i = 0; i < 22; i++) {
        const grp = new THREE.Group();
        grp.visible = false;
        this.scene.add(grp);
        this.debrisPool.push({ grp, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, life: 0 });
      }
    } catch {
      // debris is pure juice — silently skip when the pack is missing
    }
  }

  /** Toss a burst of debris parts at a crash point. power ≈ impact speed. */
  private spawnDebris(x: number, y: number, z: number, power: number): void {
    if (this.debrisPool.length === 0 || this.debrisParts.length === 0) return;
    const n = Math.min(5, 1 + Math.floor(power / 1.6));
    for (let k = 0; k < n; k++) {
      const d = this.debrisPool[this.debrisHead];
      this.debrisHead = (this.debrisHead + 1) % this.debrisPool.length;
      // pick a fresh part each spawn (the pool reuses groups, not meshes)
      const p = this.debrisParts[(Math.random() * this.debrisParts.length) | 0];
      d.grp.clear();
      const m = new THREE.Mesh(p.geometry, p.material);
      m.castShadow = true;
      d.grp.add(m);
      d.grp.position.set(x + (Math.random() - 0.5) * 0.6, y + Math.random() * 0.5, z + (Math.random() - 0.5) * 0.6);
      d.grp.rotation.set(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU);
      const sp = 1.5 + Math.random() * power * 0.45;
      d.vx = (Math.random() - 0.5) * sp * 1.6;
      d.vy = 2 + Math.random() * sp * 0.8;
      d.vz = (Math.random() - 0.5) * sp * 1.6;
      d.rx = (Math.random() - 0.5) * 9;
      d.ry = (Math.random() - 0.5) * 9;
      d.life = 1.5;
      d.grp.scale.setScalar(0.9 + Math.random() * 0.5);
      d.grp.visible = true;
    }
  }

  private updateDebris(dt: number): void {
    for (const d of this.debrisPool) {
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) {
        d.grp.visible = false;
        continue;
      }
      d.vy -= 7.5 * dt;
      d.grp.position.x += d.vx * dt;
      d.grp.position.y += d.vy * dt;
      d.grp.position.z += d.vz * dt;
      d.grp.rotation.x += d.rx * dt;
      d.grp.rotation.y += d.ry * dt;
      const gh = this.terrainHeight(d.grp.position.x, d.grp.position.z);
      if (d.grp.position.y < gh + 0.06 && d.vy < 0) {
        d.grp.position.y = gh + 0.06;
        d.vy *= -0.35;
        d.vx *= 0.6;
        d.vz *= 0.6;
        d.rx *= 0.5;
        d.ry *= 0.5;
      }
      if (d.life < 0.4) d.grp.scale.setScalar(Math.max(0.01, d.grp.scale.x * (1 - dt * 2.4)));
    }
  }

  /* =====================================================================
     VEHICLE PHYSICS
     ===================================================================== */

  /** Vehicle constants → physics spec (per car; the jeep is the baseline). */
  private vehicleSpec(): VehicleSpec {
    return {
      mass: 1000 * this.perf.mass,
      length: this.carLen,
      width: this.carWid,
      wheelR: this.wheelR,
      axleOff: this.axleOff,
      wheels: this.wheels.map((w) => ({ x: w.base.x, z: w.base.z })),
      spring: this.perf.spring,
      damp: this.perf.damp,
      // tall vehicles carry their weight higher → lean and tip more
      comY: -0.55 + 0.25 * this.perf.roll,
      gravity: GRAVITY,
      // heavy vehicles plow through, light ones ricochet
      restitution: clamp(0.3 / this.perf.mass, 0.05, 0.5),
    };
  }

  /** (Re)build the rigid body + vehicle controller for the active vehicle. */
  private rebuildRig(): void {
    if (!this.pw || this.wheels.length < 4) return;
    const spec = this.vehicleSpec();
    if (this.rig) this.rig.build(spec);
    else {
      const v = this.v;
      this.physEuler.set(0, v.yaw, 0, "YXZ");
      const q = this.physQuat.setFromEuler(this.physEuler);
      this.terrainStream?.update(v.pos.x, v.pos.z, true);
      this.rig = new VehicleRig(this.pw, spec, { x: v.pos.x, y: v.pos.y, z: v.pos.z }, { x: q.x, y: q.y, z: q.z, w: q.w });
    }
  }

  resetVehicle(toIndex?: number): void {
    const v = this.v;
    const i = ((toIndex !== undefined ? toIndex : v.lastGoodIdx) % SAMPLES + SAMPLES) % SAMPLES;
    const p = this.trailPts[i];
    const t = this.trailTan[i];
    v.pos.set(p.x, this.groundHeight(p.x, p.z) + 0.95, p.z);
    v.yaw = Math.atan2(-t.x, -t.z);
    v.speed = 0;
    v.lateral = 0;
    v.pitch = 0;
    v.roll = 0;
    v.overturnT = 0;
    v.dive = 0;
    v.squat = 0;
    v.bodyRoll = 0;
    v.vy = 0;
    v.airborne = false;
    this.airT = 0;
    this.noContactTicks = 0;
    this.syncF = 0;
    this.syncL = 0;
    for (const w of this.wheels) {
      w.comp = 0.16;
      w.compV = 0;
    }
    this.physEuler.set(0, v.yaw, 0, "YXZ");
    this.physQuat.setFromEuler(this.physEuler);
    this.prevQuat.copy(this.physQuat);
    this.currQuat.copy(this.physQuat);
    this.terrainStream?.update(v.pos.x, v.pos.z, true);
    this.propStream?.update(v.pos.x, v.pos.z);
    if (!this.rig) this.rebuildRig();
    const q = this.physQuat;
    this.rig?.teleport({ x: v.pos.x, y: v.pos.y, z: v.pos.z }, { x: q.x, y: q.y, z: q.z, w: q.w });
    this.jeep?.position.copy(v.pos);
    this.jeep?.quaternion.copy(this.physQuat);
    this.jeepHealth = 100; // fresh jeep after a recovery
    this.wreckT = 0;
    if (this.onFoot) this.spawnExplorerBesideCar(); // the walk home is a chore
    this.notify(this.onFoot ? "Warped to your vehicle" : "Vehicle reset to trail");
  }

  /**
   * `resetVehicle` at an arbitrary spot (the trail, but also Port Marin).
   * Same settle sequence: fresh body state, physics teleport, meshes synced.
   */
  warpTo(x: number, z: number, yaw: number): void {
    const v = this.v;
    v.pos.set(x, this.groundHeight(x, z) + 0.95, z);
    v.yaw = yaw;
    v.speed = 0;
    v.lateral = 0;
    v.pitch = 0;
    v.roll = 0;
    v.overturnT = 0;
    v.dive = 0;
    v.squat = 0;
    v.bodyRoll = 0;
    v.vy = 0;
    v.airborne = false;
    this.airT = 0;
    this.noContactTicks = 0;
    this.syncF = 0;
    this.syncL = 0;
    for (const w of this.wheels) {
      w.comp = 0.16;
      w.compV = 0;
    }
    this.physEuler.set(0, v.yaw, 0, "YXZ");
    this.physQuat.setFromEuler(this.physEuler);
    this.prevQuat.copy(this.physQuat);
    this.currQuat.copy(this.physQuat);
    this.terrainStream?.update(v.pos.x, v.pos.z, true);
    this.propStream?.update(v.pos.x, v.pos.z);
    if (!this.rig) this.rebuildRig();
    const q = this.physQuat;
    this.rig?.teleport({ x: v.pos.x, y: v.pos.y, z: v.pos.z }, { x: q.x, y: q.y, z: q.z, w: q.w });
    this.jeep?.position.copy(v.pos);
    this.jeep?.quaternion.copy(this.physQuat);
    this.jeepHealth = 100;
    this.wreckT = 0;
  }

  /** `?warp=…` dev/tooling hook (see applyWarp); null when unavailable. */
  private readWarpParam(): string | null {
    try {
      return new URLSearchParams(window.location.search).get("warp");
    } catch {
      return null;
    }
  }

  /** Spawn the jeep at a Port Marin vantage point for inspection. */
  applyWarp(kind: string): void {
    const target = (() => {
      if (kind === "road") {
        const p = this.city.roadPose(14);
        return { x: p.x, z: p.z, yaw: Math.atan2(-p.tx, -p.tz) };
      }
      if (kind === "crossing") {
        const p = this.city.roadPose(this.city.crossingArc);
        return { x: this.city.crossing.x, z: this.city.crossing.z, yaw: Math.atan2(-p.tx, -p.tz) };
      }
      if (kind === "city" || kind === "aerial") {
        const g = this.city.toWorld(0, -14);
        const c = this.city.toWorld(0, 0);
        return { x: g.x, z: g.z, yaw: Math.atan2(-(c.x - g.x), -(c.z - g.z)) };
      }
      return null;
    })();
    if (!target) return;
    this.warpTo(target.x, target.z, target.yaw);
    this.notify(`Warp: ${kind}`);
  }

  restart(): void {
    this.resetVehicle(Math.floor(SAMPLES * 0.01));
    this.v.lap = 0;
    this.v.prevT = 0.01;
    // re-arm the optional loop clock (mid-session restart)
    this.lapStartT = -1;
    this.lapTimes = [];
  }

  /** Impact feedback (sound, shake, sparks, debris) for a hit of `impact` u/s. */
  private collisionFx(impact: number, nx: number, nz: number): void {
    const v = this.v;
    v.bumpImpulse = Math.min(1, v.bumpImpulse + impact * 0.09);
    // light vehicles rattle their driver more; heavy ones shrug it off
    const massShake = clamp(1.15 - 0.35 * (this.perf.mass - 1), 0.45, 1.3);
    this.addTrauma(Math.min(0.55, impact * 0.05 * massShake));
    if (impact > 5.5) this.slowmoT = 0.09;
    this.audio.thump(impact * 0.3);
    this.input.rumble(clamp(0.3 + impact * 0.08, 0.3, 1), 120 + clamp(impact * 25, 0, 300));
    for (let k = 0; k < 4; k++) {
      this.spawnParticle(
        v.pos.x - nx * 1.3 + (Math.random() - 0.5),
        v.pos.y - 0.2 + Math.random() * 0.7,
        v.pos.z - nz * 1.3 + (Math.random() - 0.5),
        nx * 2 + (Math.random() - 0.5) * 1.6,
        1.2 + Math.random() * 1.4,
        nz * 2 + (Math.random() - 0.5) * 1.6,
        "#a8946a",
        0.14,
        0.6,
        0.6,
      );
    }
    if (impact > 2.2) this.spawnDebris(v.pos.x - nx * 1.1, v.pos.y - 0.3, v.pos.z - nz * 1.1, impact);
    if (impact > 4) this.notify("Ouch! Watch the obstacles");
  }

  /**
   * One fixed tick. The engine decides *what the driver and the surface ask
   * of the car* (throttle, brakes, steering target, grip, drag — the arcade
   * layer, tuned per vehicle); Rapier decides what actually happens: wheel
   * suspension, gravity, slopes, jumps, and collisions with trunks, boulders
   * and logs.
   */
  private updateVehicle(dt: number): void {
    const v = this.v;
    const pw = this.pw;
    const rig = this.rig;
    const jeep = this.jeep;
    if (!pw || !rig || !jeep) return;
    // health: slow regen; a hurt jeep underperforms (dents = 1 - health/100)
    this.jeepHealth = Math.min(100, this.jeepHealth + dt * 1.1);
    const dent = (100 - this.jeepHealth) / 100;
    // per-vehicle performance (GTA-style profiles, jeep = baseline)
    const P = this.perf;
    const topBase = MAX_SPEED * P.speed;
    const maxRev = MAX_REV * clamp(P.speed, 0.5, 1);
    const topSpeed = topBase * (1 - 0.45 * dent);
    const body = rig.body;

    // Outside systems (wildlife strikes) edit v.speed / v.lateral between
    // ticks — fold any such change into the rigid body's velocity.
    {
      const dF = v.speed - this.syncF;
      const dL = v.lateral - this.syncL;
      if (Math.abs(dF) > 1e-3 || Math.abs(dL) > 1e-3) {
        const f = rig.forward();
        const r = rig.right();
        const fl = Math.hypot(f.x, f.z) || 1;
        const rl = Math.hypot(r.x, r.z) || 1;
        const lin = body.linvel();
        body.setLinvel(
          { x: lin.x + (f.x / fl) * dF + (r.x / rl) * dL, y: lin.y, z: lin.z + (f.z / fl) * dF + (r.z / rl) * dL },
          true,
        );
      }
    }
    const sp0 = rig.speeds();
    v.speed = sp0.forward;
    v.lateral = sp0.lateral;

    const speedFactor = 1 - clamp(Math.abs(v.speed) / topBase, 0, 1) * 0.45;
    v.steer = clamp(damp(v.steer, v.steerTarget * speedFactor, P.steer, dt), -1, 1);

    // open-world streaming: collision exists only near the car
    this.terrainStream?.update(v.pos.x, v.pos.z);
    this.propStream?.update(v.pos.x, v.pos.z, 90);

    const surf = this.surfaceAt(v.pos.x, v.pos.z);
    v.surface = surf;
    // surface effects blend toward good/bad by the vehicle's off-road
    // aptitude: tractors shrug off mud, street tyers drown in it
    const S0 = SURFACE[surf] ?? SURFACE.dirt;
    let S = S0;
    if (P.offroad !== 0) {
      const GOOD = { grip: 1.0, drag: SURFACE.dirt.drag, accel: 1.0, rough: SURFACE.dirt.rough };
      const BAD = { grip: 0.55, drag: 1.2, accel: 0.6, rough: 0.7 };
      const tgt = P.offroad > 0 ? GOOD : BAD;
      const k = Math.min(1, Math.abs(P.offroad)) * 0.55;
      const kr = Math.min(1, Math.abs(P.offroad)) * 0.4;
      S = {
        grip: lerp(S0.grip, tgt.grip, k),
        drag: lerp(S0.drag, tgt.drag, k),
        accel: lerp(S0.accel, tgt.accel, k),
        rough: lerp(S0.rough, tgt.rough, kr),
      };
    }

    // Grade under the car, from its actual attitude (+ = nose up, climbing).
    // Gravity along the slope is Rapier's job now; this only fades traction.
    const fw = rig.forward();
    const slope = clamp(fw.y / Math.max(0.1, Math.hypot(fw.x, fw.z)), -1.6, 1.6);
    const traction = clamp(1.06 - Math.abs(slope) * 0.95, 0.18, 1.0);

    // --- intents ----------------------------------------------------------
    // Airborne: wheels bite nothing — no engine, brakes or rolling friction,
    // only a little air drag, so a jump carries its momentum.
    const air = v.airborne;
    const gnd = air ? 0 : 1;
    const sgn = Math.sign(v.speed);
    const engineForce = v.throttle * 22.5 * P.accel * S.accel * traction * (1 - 0.4 * dent);
    let drive = 0; // signed acceleration along the heading (+ = forward)
    let brakeA = 0; // tyre braking, always ≥ 0
    if (v.throttle > 0.01 && !air) {
      if (v.speed < -0.3) brakeA += v.throttle * 30.0 * P.accel * S.grip * traction;
      else drive += engineForce * (1 - clamp(Math.max(v.speed, 0) / topBase, 0, 1) * 0.75);
    }
    if (v.brake > 0.01 && !air) {
      if (v.speed > 0.4) brakeA += v.brake * 30.0 * P.brake * S.grip * traction;
      else drive -= v.brake * 16.0 * P.accel * S.accel * traction;
    }
    if (v.handbrake && !air) brakeA += clamp(Math.abs(v.speed) * 3, 0, 10);
    // parked: hold on slopes instead of creeping away
    if (!air && Math.abs(v.speed) < 0.6 && v.throttle < 0.02 && v.brake < 0.02) brakeA += 10;
    // speed caps
    let resist = -(v.speed * 0.35 * S.drag * 0.6) * (air ? 0.12 : 1);
    resist -= sgn * 0.42 * S.drag * gnd;
    resist -= sgn * Math.abs(v.speed) * S.rough * 0.16 * gnd;
    if (v.speed > topSpeed) {
      drive = Math.min(drive, 0);
      resist -= (v.speed - topSpeed) * 6;
    }
    if (v.speed < -maxRev && drive < 0) drive = 0;
    if (!isFinite(drive) || !isFinite(resist)) {
      drive = 0;
      resist = 0;
    }

    // steering: a target yaw rate (as the old arcade model) realised through
    // the front wheels' angle, with a stability assist so the response stays
    // crisp on loose ground. Weak in the air.
    const grip = S.grip * P.grip;
    const turnRate = v.steer * 0.95 * P.agility * clamp(Math.abs(v.speed) / 3.2, 0, 1) * Math.sign(v.speed || 1) * (1 - 0.3 * dent) * (air ? 0.12 : 1);
    const yawTarget = turnRate * clamp(1.4 - (Math.abs(v.speed) / topBase) * 0.6, 0.6, 1.4) * (v.handbrake ? 1.35 : 1);
    const wheelbase = Math.max(1.5, Math.abs(this.wheels[2].base.z - this.wheels[0].base.z));
    const vs = Math.abs(v.speed) < 1.5 ? 1.5 * (v.speed < 0 ? -1 : 1) : v.speed;
    const steerAngle = clamp(Math.atan((yawTarget * wheelbase) / vs), -0.55, 0.55);
    const sideGrip = clamp(grip, 0.3, 1.5);

    const intent: DriveIntent = {
      driveAccel: drive,
      brakeAccel: brakeA,
      steerAngle,
      grip: clamp(grip, 0.4, 1.5),
      sideGrip,
      rearSideGrip: sideGrip * (v.handbrake ? 0.3 : 1),
      yawTarget: Math.abs(v.steer) > 0.05 ? yawTarget : null,
      resist,
    };
    const a = drive + resist - sgn * brakeA; // net, for cosmetic dive/squat

    // --- step the world -----------------------------------------------------
    const linBefore = body.linvel();
    const vy0 = linBefore.y;
    const vxBefore = linBefore.x;
    const vzBefore = linBefore.z;
    rig.drive(intent, dt);
    pw.step(dt);

    // boundary (extended through the Port Marin sector so the town is drivable)
    {
      const t = body.translation();
      const r = Math.hypot(t.x, t.z);
      const bound = Math.max(BOUND, this.city.bound(t.x, t.z));
      if (r > bound) {
        const k = bound / r;
        body.setTranslation({ x: t.x * k, y: t.y, z: t.z * k }, true);
        const lin = body.linvel();
        body.setLinvel({ x: lin.x * 0.4, y: lin.y, z: lin.z * 0.4 }, true);
      }
    }
    const t = body.translation();
    if (!isFinite(t.x) || !isFinite(t.y) || !isFinite(t.z)) {
      this.resetVehicle();
      return;
    }

    // collisions: Rapier resolved them; work out how hard the car was hit.
    // The contact-force events say THAT something touched the chassis and
    // roughly how hard; the speed actually lost says how much it mattered.
    let eventImpact = 0;
    pw.events.drainContactForceEvents((ev) => {
      const dir = ev.maxForceDirection();
      if (Math.abs(dir.y) > 0.7) return; // ground / landing — onLand handles it
      eventImpact = Math.max(eventImpact, (ev.totalForceMagnitude() * dt) / (1000 * P.mass));
    });
    const linAfter = body.linvel();
    const dvx = linAfter.x - vxBefore;
    const dvz = linAfter.z - vzBefore;
    const dvLoss = Math.hypot(dvx, dvz);
    if (eventImpact > 0) {
      this.contactTicks++;
      // never report more than the speed the car actually shed (plus a little)
      const impact = Math.min(eventImpact, dvLoss + 0.2);
      // push direction = how the car's horizontal velocity changed
      let nx = dvx;
      let nz = dvz;
      if (dvLoss > 1e-4) {
        nx /= dvLoss;
        nz /= dvLoss;
      } else {
        nx = -fw.x;
        nz = -fw.z;
      }
      const fresh = this.contactTicks === 1 || impact > this.lastImpact * 2;
      if (fresh && impact > 0.6) {
        // the moment of a crash: the full treatment, once
        this.collisionFx(impact, nx, nz);
        this.lastImpact = impact;
      } else if (this.time - this.lastScrape > 0.18) {
        // pressing / sliding along something: a light, rate-limited rumble
        this.lastScrape = this.time;
        this.input.rumble(clamp(0.16 + impact * 0.1, 0.16, 0.45), 110);
        this.addTrauma(0.03);
      }
    } else {
      this.contactTicks = 0;
      this.lastImpact = 0;
    }

    // --- read state back ------------------------------------------------------
    v.pos.set(t.x, t.y, t.z);
    const q = body.rotation();
    this.physQuat.set(q.x, q.y, q.z, q.w);
    const f = rig.forward();
    v.yaw = Math.atan2(-f.x, -f.z);
    this.physEuler.setFromQuaternion(this.physQuat, "YXZ");
    v.pitch = this.physEuler.x;
    v.roll = this.physEuler.z;
    const sp = rig.speeds();
    v.speed = sp.forward;
    v.lateral = sp.lateral;
    v.vy = linAfter.y;
    this.syncF = v.speed;
    this.syncL = v.lateral;
    const fx = -Math.sin(v.yaw);
    const fz = -Math.cos(v.yaw);

    // suspension → wheel/spring visuals
    const REST = SUSP_REST;
    const TRAVEL = SUSP_TRAVEL;
    const ctrl = rig.controller;
    let maxImpact = 0;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      const prev = w.comp;
      const target = clamp(REST + rig.wheelDrop(i), 0, TRAVEL);
      w.comp = damp(w.comp, target, 40, dt);
      w.compV = (w.comp - prev) / dt;
      w.contact = ctrl.wheelIsInContact(i) ? 1 : 0;
      const cp = w.contact ? ctrl.wheelContactPoint(i) : null;
      w.groundY = cp ? cp.y : undefined;
      const delta = Math.abs(w.comp - prev);
      if (delta > maxImpact) maxImpact = delta;
    }

    // airtime + landing (game-feel: layered feedback on on_land)
    const contacts = rig.contacts;
    if (contacts === 0) {
      this.airT += dt;
      this.noContactTicks++;
    } else {
      if (this.noContactTicks > 0) {
        const impactVy = Math.max(0, -vy0);
        if (this.airT > 0.18 || impactVy > 9) this.onLand(this.airT, impactVy);
      }
      this.noContactTicks = 0;
      this.airT = 0;
    }
    // a single bumpy tick off the ground isn't flight: wait ~3 ticks
    v.airborne = this.noContactTicks >= 3;

    // suspension bottomed out — small thud + shake (rate-limited)
    if (rig.bottomedOut() && vy0 < -4 && this.time - this.lastBottomOut > 0.45) {
      this.lastBottomOut = this.time;
      this.audio.thud(0.35);
      this.addTrauma(0.14);
      this.input.rumble(0.35, 140);
    }

    v.bumpImpulse = damp(v.bumpImpulse, 0, 6, dt);
    if (maxImpact > 0.012) v.bumpImpulse = Math.min(1, v.bumpImpulse + maxImpact * 3.2);
    // rough ground feeds a little continuous trauma into the camera
    if (v.bumpImpulse > 0.18) this.addTrauma(v.bumpImpulse * 0.016);

    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      w.angle -= (v.speed / this.wheelR) * dt * (v.handbrake && !v.airborne ? 0.12 : 1);
    }

    // cosmetic attitude on top of the physical one: braking dive, cornering roll
    v.dive = damp(v.dive, clamp(-a * 0.011, -0.09, 0.09), 5.0, dt);
    v.bodyRoll = damp(v.bodyRoll, clamp(turnRate * Math.abs(v.speed) * 0.028 * this.perf.roll, -0.14, 0.14), 5.0, dt);
    v.vibr = damp(v.vibr, (v.throttle * 0.4 + 0.25) * (1 - clamp(Math.abs(v.speed) / 6, 0, 0.8)), 5, dt);
    this.cosQuat.setFromEuler(this.cosEuler.set(v.dive, 0, v.bodyRoll, "YXZ"));

    // apply transform
    jeep.position.copy(v.pos);
    jeep.quaternion.copy(this.physQuat).multiply(this.cosQuat);
    const vib = v.vibr * 0.0045;
    if (this.bodyGroup) {
      this.bodyGroup.position.y = Math.sin(this.time * 46) * vib;
      this.bodyGroup.rotation.z = Math.sin(this.time * 37) * vib * 0.5;
    }

    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      w.holder.position.y = -this.axleOff + w.base.y + (w.comp - REST);
      w.holder.position.x = w.base.x;
      w.holder.position.z = w.base.z;
      if (w.front) w.steerG.rotation.y = v.steer * 0.55;
      w.spin.rotation.x = w.angle;
      const spr = this.springs[i];
      const part = this.springParts[i];
      const compRatio = clamp(w.comp / TRAVEL, 0, 1);
      spr.position.y = -this.axleOff + (w.comp - REST) * 0.5;
      if (part.coil) part.coil.scale.y = lerp(1.0, 0.62, compRatio);
      if (part.rod) part.rod.position.y = lerp(0.34, 0.2, compRatio);
    }
    if (this.axleF && this.axleR) {
      const artF = Math.atan2(this.wheels[1].comp - this.wheels[0].comp, this.track);
      const artR = Math.atan2(this.wheels[3].comp - this.wheels[2].comp, this.track);
      this.axleF.position.y = -this.axleOff + ((this.wheels[0].comp + this.wheels[1].comp) / 2 - REST);
      this.axleR.position.y = -this.axleOff + ((this.wheels[2].comp + this.wheels[3].comp) / 2 - REST);
      this.axleF.rotation.z = clamp(artF, -0.3, 0.3);
      this.axleR.rotation.z = clamp(artR, -0.3, 0.3);
    }

    // rpm & lights — engine character follows the vehicle's own top speed
    const targetRpm = 780 + (Math.abs(v.speed) / topBase) * 4200 + v.throttle * 1400;
    v.rpm = damp(v.rpm, targetRpm, 4.5, dt);
    const braking = (v.brake > 0.05 && v.speed > 0.2) || (v.throttle > 0.05 && v.speed < -0.3);
    for (const m of this.brakeMeshes) (m.material as THREE.MeshStandardMaterial).emissiveIntensity = braking ? 1.7 : 0.05;
    const reversing = v.speed < -0.2;
    for (const m of this.reverseMeshes) (m.material as THREE.MeshStandardMaterial).emissiveIntensity = reversing ? 1.4 : 0.02;
    if (this.steerWheelObj) this.steerWheelObj.rotation.z = -v.steer * 2.8;
    if (this.speedoNeedle) this.speedoNeedle.rotation.z = -0.5 - (Math.abs(v.speed) / topBase) * 3.8;
    if (this.tachoNeedle) this.tachoNeedle.rotation.z = -0.5 - clamp((v.rpm - 780) / 5000, 0, 1) * 3.8;

    // exhaust smoke
    if (this.bodyGroup && Math.random() < (v.throttle > 0.05 ? 0.85 : 0.28)) {
      this.tmpVec.set(0.5, -0.35, this.exhaustZ).applyMatrix4(this.bodyGroup.matrixWorld);
      this.spawnParticle(
        this.tmpVec.x,
        this.tmpVec.y,
        this.tmpVec.z,
        (Math.random() - 0.5) * 0.2,
        0.35 + Math.random() * 0.3,
        (Math.random() - 0.5) * 0.2 + v.speed * 0.08,
        0x555555,
        0.08,
        0.32,
        0.55,
      );
    }

    // tire spray
    if (Math.abs(v.speed) > 2.5 && (surf === "dirt" || surf === "mud")) {
      for (let i = 2; i < 4; i++) {
        const w = this.wheels[i];
        if (w.contact && Math.random() < 0.65) {
          this.tmpVec.set(w.base.x, -this.axleOff + w.base.y + (w.comp - 0.16), w.base.z).applyMatrix4(jeep.matrixWorld);
          this.spawnParticle(
            this.tmpVec.x + (Math.random() - 0.5) * 0.3,
            this.tmpVec.y,
            this.tmpVec.z + (Math.random() - 0.5) * 0.3,
            -fx * v.speed * 0.18 + (Math.random() - 0.5) * 1.1,
            0.7 + Math.random() * 1.0,
            -fz * v.speed * 0.18 + (Math.random() - 0.5) * 1.1,
            surf === "mud" ? 0x423220 : 0x725434,
            0.14,
            0.42,
            0.4,
          );
        }
      }
    }

    // overturn detection & progress
    if (rig.up().y < 0.45) v.overturnT += dt;
    else v.overturnT = Math.max(0, v.overturnT - dt * 2);

    const info = this.trailInfo(v.pos.x, v.pos.z);
    if (info.dist < ROAD_HALF + 1.0) {
      v.lastGoodIdx = info.i;
      const t = info.t;
      if (v.prevT > 0.85 && t < 0.15) this.completeLap();
      if (v.prevT < 0.15 && t > 0.85) v.lap = Math.max(0, v.lap - 1);
      v.prevT = t;
      v.progress = t;
    }

    // sustained gamepad rumble from speed & roughness
    this.input.update(dt, { speed: Math.abs(v.speed), maxSpeed: MAX_SPEED, rough: S.rough });
  }

  /** game-feel: decaying trauma 0..1 — shake = trauma². Hits add, never reset. */
  private addTrauma(amount: number): void {
    this.camState.trauma = Math.min(1, this.camState.trauma + amount);
  }

  /** Layered landing feedback: thud + rumble + shake + FOV punch + dust. */
  private onLand(air: number, impactVy = 0): void {
    const sev = clamp(Math.max(air / 1.1, impactVy / 16), 0.15, 1.4);
    this.audio.thud(0.4 + sev * 0.5);
    this.input.rumble(Math.min(1, 0.35 + sev * 0.55), 200 + sev * 200);
    this.addTrauma(0.18 + sev * 0.4);
    this.fovKick = 2.5 + sev * 5;
    const v = this.v;
    for (let i = 0; i < 8; i++) {
      this.spawnParticle(
        v.pos.x + (Math.random() - 0.5) * 2.4,
        v.pos.y - 0.5 + Math.random() * 0.3,
        v.pos.z + (Math.random() - 0.5) * 2.4,
        (Math.random() - 0.5) * 3,
        0.8 + Math.random() * 1.6,
        (Math.random() - 0.5) * 3,
        "#8a7648",
        0.2,
        0.9,
        0.7,
      );
    }
    if (air > 0.85) this.notify(`Big air — ${air.toFixed(1)}s!`);
    if (impactVy > 20) this.damageJeep((impactVy - 20) * 1.6 / Math.max(0.8, this.perf.mass));
    if (sev > 0.55) {
      this.spawnDebris(v.pos.x, v.pos.y - 0.4, v.pos.z, 2.5 + sev * 3);
    }
  }

  /** Lap timing hook — fires when the loop start line is crossed. */
  private completeLap(): void {
    const v = this.v;
    if (this.lapStartT < 0) {
      // open world: the first crossing arms the optional loop clock
      v.lap++;
      this.lapStartT = this.time;
      this.notify("Loop started — time the trail!");
      return;
    }
    v.lap++;
    const now = this.time;
    const lapTime = now - this.lapStartT;
    this.lapStartT = now;
    if (lapTime > 5) {
      this.lapTimes.push(lapTime);
      let msg = `Lap ${v.lap} — ${JeepEngine.fmtTime(lapTime)}`;
      if (!this.bestLap || lapTime < this.bestLap) {
        this.bestLap = lapTime;
        this.saveBestLap();
        msg += " · NEW BEST!";
        this.input.rumble(0.5, 160);
      }
      this.notify(msg);
    }
  }

  private static fmtTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s - m * 60;
    return `${m}:${sec.toFixed(2).padStart(5, "0")}`;
  }

  private loadBestLap(): void {
    try {
      const raw = window.localStorage.getItem("jj_best_lap");
      const n = raw ? Number(raw) : 0;
      this.bestLap = isFinite(n) && n > 0 ? n : 0;
    } catch {
      this.bestLap = 0;
    }
  }

  private saveBestLap(): void {
    try {
      window.localStorage.setItem("jj_best_lap", String(this.bestLap));
    } catch {
      // storage unavailable — best lap stays session-only
    }
  }

  /* =====================================================================
     PARTICLES
     ===================================================================== */

  private initParticles(): void {
    const scene = this.scene;
    if (!scene) return;
    const N = this.Q.particles;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const siz = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3 + 1] = -9999;
      siz[i] = 0;
      this.particlePool.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, s0: 1, s1: 2 });
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(siz, 1));
    this.pAttrPos = geo.attributes.position;
    this.pAttrCol = geo.attributes.color;
    this.pAttrSize = geo.attributes.size;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      vertexShader: `attribute float size; varying vec3 vC; varying float vA;
      void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.0);
        vA = size>0.001?1.0:0.0;
        gl_PointSize = size*300.0/max(-mv.z,1.0);
        gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA;
      void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d);
        if(r>0.5) discard;
        float a=smoothstep(0.5,0.05,r)*0.55*vA;
        gl_FragColor=vec4(vC,a); }`,
    });
    const particles = new THREE.Points(geo, mat);
    particles.frustumCulled = false;
    scene.add(particles);
  }

  private spawnParticle(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    color: number | string,
    s0: number, s1: number, life: number,
  ): void {
    if (!this.pAttrPos || !this.pAttrCol || !this.pAttrSize) return;
    const i = this.pHead;
    this.pHead = (this.pHead + 1) % this.particlePool.length;
    const p = this.particlePool[i];
    p.life = life;
    p.max = life;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.s0 = s0;
    p.s1 = s1;
    this.pAttrPos.setXYZ(i, x, y, z);
    this.tmpColor.set(color);
    this.pAttrCol.setXYZ(i, this.tmpColor.r, this.tmpColor.g, this.tmpColor.b);
    this.pAttrSize.setX(i, s0);
  }

  private updateParticles(dt: number): void {
    const pos = this.pAttrPos;
    const size = this.pAttrSize;
    const col = this.pAttrCol;
    if (!pos || !size || !col) return;
    for (let i = 0; i < this.particlePool.length; i++) {
      const p = this.particlePool[i];
      if (p.life <= 0) {
        if (size.getX(i) !== 0) size.setX(i, 0);
        continue;
      }
      p.life -= dt;
      const k = 1 - clamp(p.life / p.max, 0, 1);
      pos.setXYZ(i, pos.getX(i) + p.vx * dt, pos.getY(i) + p.vy * dt, pos.getZ(i) + p.vz * dt);
      p.vy -= 1.6 * dt;
      p.vx *= 0.985;
      p.vz *= 0.985;
      size.setX(i, p.life > 0 ? lerp(p.s0, p.s1, k) * (1 - k * 0.55) : 0);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    size.needsUpdate = true;
  }

  private emitWheelFX(dt: number): void {
    const v = this.v;
    const rp = this.renderPos;
    const spd = Math.abs(v.speed);
    this.emitAcc += dt;
    const rate = 0.045 / clamp(0.25 + spd / 8, 0.25, 3);
    if (this.emitAcc < rate) return;
    this.emitAcc = 0;
    if (spd < 0.6 && v.throttle < 0.2) return;
    const cy = Math.cos(v.yaw);
    const sy = Math.sin(v.yaw);
    for (let i = 2; i < 4; i++) {
      const w = this.wheels[i];
      if (!w.contact) continue;
      const lx = w.base.x * 1.1;
      const lz = w.base.z + 0.35;
      const wx = rp.x + lx * cy + lz * sy;
      const wz = rp.z - lx * sy + lz * cy;
      const gy = w.groundY ?? this.terrainHeight(wx, wz);
      const surf = this.surfaceAt(wx, wz);
      let col = "#a08a63";
      let s0 = 0.35;
      let s1 = 1.5;
      let life = 1.1;
      let vy = 0.9;
      if (surf === "mud") { col = "#4a3a24"; s0 = 0.25; s1 = 0.9; life = 0.8; vy = 1.5; }
      else if (surf === "water") { col = "#9fb6a8"; s0 = 0.2; s1 = 0.85; life = 0.6; vy = 2.4; }
      else if (surf === "grass") { col = "#6f7f4a"; s0 = 0.25; s1 = 1.0; life = 0.7; vy = 0.8; }
      else if (surf === "rock") { col = "#8d8880"; s0 = 0.28; s1 = 1.1; life = 0.8; vy = 0.9; }
      else if (surf === "asphalt") { col = "#77777a"; s0 = 0.18; s1 = 0.65; life = 0.45; vy = 0.6; }
      const intensity = clamp(spd / 8 + v.throttle * 0.6, 0, 1.4);
      this.spawnParticle(
        wx + (Math.random() - 0.5) * 0.3, gy + 0.16, wz + (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.9 - sy * v.speed * 0.16,
        vy * (0.4 + Math.random() * 0.7) * intensity,
        (Math.random() - 0.5) * 0.9 - cy * v.speed * 0.16,
        col, s0, s1 * intensity, life,
      );
    }
    if (this.surfaceAt(rp.x, rp.z) === "water" && spd > 1) {
      for (let i = 0; i < 2; i++) {
        const w = this.wheels[i];
        const lx = w.base.x;
        const lz = w.base.z;
        const wx = rp.x + lx * cy + lz * sy;
        const wz = rp.z - lx * sy + lz * cy;
        this.spawnParticle(
          wx, this.stream.level + 0.1, wz,
          (Math.random() - 0.5) * 2.4, 2.2 + Math.random() * 2.2, (Math.random() - 0.5) * 2.4,
          "#c6d8cd", 0.18, 0.7, 0.55,
        );
      }
      this.audio.splash();
      this.input.rumble(0.25, 120);
    }
  }

  private emitExhaust(dt: number): void {
    const v = this.v;
    const rp = this.renderPos;
    this.exhaustAcc += dt;
    if (this.exhaustAcc < 0.14) return;
    this.exhaustAcc = 0;
    const cy = Math.cos(v.yaw);
    const sy = Math.sin(v.yaw);
    const lx = 0.62;
    const lz = 1.85;
    const wx = rp.x + lx * cy + lz * sy;
    const wz = rp.z - lx * sy + lz * cy;
    const amount = 0.28 + v.throttle * 0.5;
    if (Math.random() > amount) return;
    this.spawnParticle(
      wx, rp.y - 0.35, wz,
      (Math.random() - 0.5) * 0.25 - sy * v.speed * 0.1,
      0.5 + Math.random() * 0.4,
      (Math.random() - 0.5) * 0.25 - cy * v.speed * 0.1,
      "#8f9490", 0.16, 0.85, 1.4,
    );

    // dented jeep smokes from the bonnet
    const dent = (100 - this.jeepHealth) / 100;
    if (dent > 0.35 && Math.random() < dent * 0.85) {
      this.spawnParticle(
        rp.x - sy * 1.55, rp.y + 0.78, rp.z - cy * 1.55,
        (Math.random() - 0.5) * 0.3,
        1.1 + Math.random() * 0.7,
        (Math.random() - 0.5) * 0.3,
        dent > 0.7 ? "#2e2e2e" : "#4b4b47",
        0.2, 1.15, 1.6,
      );
    }
  }

  /* =====================================================================
     CAMERA
     ===================================================================== */

  private safeAboveTerrain(p: THREE.Vector3, margin = 0.9): THREE.Vector3 {
    const h = this.terrainHeight(p.x, p.z);
    if (p.y < h + margin) p.y = h + margin;
    return p;
  }

  /* =====================================================================
     ON-FOOT EXPLORER (open world)
     ===================================================================== */

  /** Place the explorer at the vehicle's left (driver) door, on the ground. */
  private spawnExplorerBesideCar(): void {
    const ex = this.explorer;
    if (!ex) return;
    if (this.riding) this.dismount(false);
    // rig space: local +X is right, so -X is the driver side
    const r = this.rig?.right() ?? { x: 1, y: 0, z: 0 };
    const f = this.foot;
    f.pos.set(
      this.v.pos.x - r.x * (this.carWid * 0.5 + 0.85),
      0,
      this.v.pos.z - r.z * (this.carWid * 0.5 + 0.85),
    );
    f.pos.y = this.groundHeight(f.pos.x, f.pos.z);
    f.vx = f.vz = f.vy = 0;
    f.yaw = this.v.yaw;
    f.grounded = true;
    f.gait = f.gaitS = 0;
    f.act = null;
    f.queued = null;
    f.crouch = false;
    f.crouchK = 0;
    f.downK = 0;
    this.footCam.yaw = f.yaw; // camera starts directly behind
    this.footCam.pitch = 0.18;
    this.footRenderSync();
    ex.root.visible = true;
    ex.root.position.copy(f.pos);
    ex.root.rotation.set(0, f.yaw, 0);
    ex.setGait(0);
  }

  /** Hop in — allowed only near the (slow or parked) vehicle. */
  private tryEnterCar(): void {
    if (!this.onFoot || !this.explorer || this.foot.downT > 0 || this.riding) return;
    const d = Math.hypot(this.foot.pos.x - this.v.pos.x, this.foot.pos.z - this.v.pos.z);
    if (d > ENTER_DIST) {
      this.notify("Walk closer to the vehicle");
      return;
    }
    this.onFoot = false;
    this.holster();
    const restocked = this.armory.resupply();
    this.explorer.root.visible = false;
    this.foot.gait = this.foot.gaitS = 0;
    this.foot.act = null;
    this.foot.queued = null;
    this.foot.crouch = false;
    this.explorer.setGait(0);
    this.audio.thump(0.3);
    this.input.rumble(0.2, 120);
    this.setTip();
    this.notify(restocked ? "Ammo restocked — F / Y to hop out" : "Press F / Y to hop out");
  }

  /** Hop out — blocked while the vehicle is moving fast. */
  private tryExitCar(): void {
    if (this.onFoot || !this.explorer) return;
    if (Math.abs(this.v.speed) > EXIT_MAX_SPEED) {
      this.notify("Slow down before jumping out!");
      return;
    }
    this.onFoot = true;
    this.spawnExplorerBesideCar();
    this.audio.thump(0.22);
    this.setTip();
    this.notify("On foot — explore!");
  }

  /**
   * Explorer movement, GTA-style: analog camera-relative walk → jog → sprint
   * (stamina), crouch, jump, dodge roll, and a punch / kick combat layer —
   * against the sampled terrain, pushed out of static prop colliders and the
   * parked vehicle. Deliberately kinematic — Rapier stays the car's domain.
   */
  private updateExplorer(dt: number, snap: JeepInputSnapshot): void {
    const ex = this.explorer;
    if (!ex) return;
    const f = this.foot;
    if (this.riding) {
      this.updateRiding(dt, snap);
      return;
    }
    const KO = f.downT > 0;

    // ---- timers -----------------------------------------------------------
    f.comboT = Math.max(0, f.comboT - dt);
    f.invulnT = Math.max(0, f.invulnT - dt);
    f.healthRest = Math.max(0, f.healthRest - dt);
    if (f.healthRest <= 0 && !KO && f.health < 100) f.health = Math.min(100, f.health + 3 * dt);
    if (KO) {
      f.downT -= dt;
      f.downK = Math.min(1, f.downK + dt * 4);
      if (f.downT <= 0) this.recoverFromKnockout();
    } else f.downK = Math.max(0, f.downK - dt * 3);

    // ---- action timeline (punch / kick / roll) ----------------------------
    if (f.act) {
      f.actT += dt;
      if (f.act !== "roll" && !f.hitDone && f.actT / f.actDur >= MELEE[f.actMove].hit) {
        f.hitDone = true;
        this.resolveMelee();
      }
      if (f.actT >= f.actDur) {
        f.act = null;
        const next = f.queued;
        f.queued = null;
        if (next && !KO) this.startAction(next);
      }
    }

    // ---- camera-relative intent -------------------------------------------
    const ix = KO ? 0 : snap.moveX;
    const iy = KO ? 0 : snap.moveY;
    const rawMag = Math.hypot(ix, iy);
    const mag = Math.min(1, rawMag);
    const yaw = this.footCam.yaw;
    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);
    let mx = 0;
    let mz = 0;
    if (rawMag > 0.01) {
      mx = (-sy * iy + cy * ix) / rawMag;
      mz = (-cy * iy - sy * ix) / rawMag;
    }
    const surface = this.surfaceAt(f.pos.x, f.pos.z);
    const wade = surface === "water" ? 0.55 : surface === "mud" ? 0.85 : 1;

    // gait: a light tilt walks, full tilt jogs, sprint burns stamina
    const gunOut = !!this.armory.gun && !KO;
    const aiming = gunOut && (snap.aim || this.mouseAim);
    const trigger = gunOut && (snap.fire || this.mouseFire);
    // with a gun out the right trigger fires — only Shift / L3 sprint, and never while aiming
    const sprintKey = gunOut ? snap.sprintHard && !aiming : snap.sprint;
    const sprinting =
      sprintKey && mag > 0.5 && !f.crouch && !f.winded && f.act !== "roll" && !KO;
    let top =
      mag < 0.55
        ? FOOT_WALK * (mag / 0.55)
        : FOOT_WALK + (FOOT_JOG - FOOT_WALK) * ((mag - 0.55) / 0.45);
    if (sprinting) top = FOOT_RUN * mag;
    if (f.crouch) top *= FOOT_CROUCH;
    if (f.act === "punch" || f.act === "kick") top *= 0.3; // planted while swinging
    if (aiming) top *= 0.55;
    top *= wade;

    // ---- stamina ----------------------------------------------------------
    const planar = Math.hypot(f.vx, f.vz);
    if (sprinting && planar > 3) {
      f.stamina = Math.max(0, f.stamina - STAMINA_DRAIN * dt);
      f.staminaRest = 0.9;
      if (f.stamina <= 0) {
        f.winded = true;
        this.notify("Out of breath");
      }
    } else {
      f.staminaRest = Math.max(0, f.staminaRest - dt);
      if (f.staminaRest <= 0) {
        f.stamina = Math.min(100, f.stamina + STAMINA_REGEN * (planar < 1 ? 1.5 : 1) * dt);
        if (f.winded && f.stamina >= 25) f.winded = false;
      }
    }

    // ---- velocity ---------------------------------------------------------
    if (f.act === "roll") {
      const p = f.actT / f.actDur;
      const rs = ROLL_SPEED * (1 - 0.55 * p);
      f.vx = f.rollX * rs;
      f.vz = f.rollZ * rs;
    } else {
      const tx = mx * top;
      const tz = mz * top;
      const braking = top < 0.05 || KO;
      const k = 1 - Math.exp(-(braking ? FOOT_BRAKE_RATE : FOOT_ACCEL_RATE) * (f.grounded ? 1 : 0.35) * dt);
      f.vx += (tx - f.vx) * k;
      f.vz += (tz - f.vz) * k;
      if (Math.abs(f.vx) < 0.02) f.vx = 0;
      if (Math.abs(f.vz) < 0.02) f.vz = 0;
    }

    // jump (edge-detected level input)
    if (snap.jump && !this.prevJump && f.grounded && !KO && f.act !== "roll") {
      f.vy = FOOT_JUMP_V * (f.crouch ? 0.8 : 1);
      f.grounded = false;
      f.crouch = false;
      ex.jump();
      this.audio.thump(0.12);
    }
    this.prevJump = snap.jump;

    // integrate + gravity
    f.pos.x += f.vx * dt;
    f.pos.z += f.vz * dt;
    f.vy -= GRAVITY * dt;
    f.pos.y += f.vy * dt;

    // ground follow (walk down slopes instead of micro-falling)
    const gh = this.groundHeight(f.pos.x, f.pos.z);
    if (f.pos.y <= gh) {
      if (!f.grounded && f.vy < -7) this.audio.thump(0.18);
      f.pos.y = gh;
      f.vy = 0;
      f.grounded = true;
    } else if (f.grounded) {
      // walked off a ledge / down a steep bank — become airborne
      if (f.pos.y > gh + 0.42) f.grounded = false;
      else {
        f.pos.y = gh;
        f.vy = 0;
      }
    }

    // static prop colliders (trunks, boulders, logs) — circle push-out
    const pushR = PLAYER_RADIUS - 0.03 + FOOT_SKIN;
    for (const b of this.colliders) {
      const dx = f.pos.x - b.x;
      const dz = f.pos.z - b.z;
      const rr = b.r + pushR;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      f.pos.x += (dx / d) * (rr - d);
      f.pos.z += (dz / d) * (rr - d);
    }
    // the parked vehicle's footprint
    {
      const dx = f.pos.x - this.v.pos.x;
      const dz = f.pos.z - this.v.pos.z;
      const rr = this.carR + 0.55;
      const d = Math.hypot(dx, dz);
      if (d < rr && d > 1e-4) {
        f.pos.x += (dx / d) * (rr - d);
        f.pos.z += (dz / d) * (rr - d);
      }
    }
    // soft world edge (same radius the vehicle respects; town sector extends it)
    {
      const r = Math.hypot(f.pos.x, f.pos.z);
      const LIM = Math.max(BOUND, this.city.bound(f.pos.x, f.pos.z)) - 1.5;
      if (r > LIM) {
        const kk = LIM / r;
        f.pos.x *= kk;
        f.pos.z *= kk;
      }
    }

    // ---- facing + animation ------------------------------------------------
    const speed = Math.hypot(f.vx, f.vz);
    if (trigger || aiming) this.gunUpT = 2.2;
    else this.gunUpT = Math.max(0, this.gunUpT - dt);
    const faceCam = gunOut && this.gunUpT > 0 && f.act !== "roll";
    if (faceCam) {
      // aiming: the body follows the camera so the barrel points where you look
      let d = this.footCam.yaw - f.yaw;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      f.yaw += d * Math.min(1, 16 * dt);
    } else if (f.act === "roll") {
      f.yaw = Math.atan2(-f.rollX, -f.rollZ);
    } else if (speed > 0.4 && f.act !== "punch" && f.act !== "kick" && !KO) {
      const target = Math.atan2(-f.vx, -f.vz);
      let d = target - f.yaw;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      f.yaw += d * Math.min(1, FOOT_TURN * dt);
    }
    f.gait = clamp(speed / FOOT_RUN, 0, 1);
    f.gaitS = damp(f.gaitS, f.gait, 10, dt);
    f.crouchK = damp(f.crouchK, f.crouch ? 1 : 0, 12, dt);
    f.stealth = f.crouch ? 0.5 : sprinting ? 1.5 : speed > FOOT_JOG * 0.6 ? 1.1 : 1;
    ex.setGait(f.gaitS);
    ex.setSpeed(speed);
    ex.setCrouch(f.crouchK);
    ex.setDown(f.downK);
    ex.setAction(f.act, f.act ? f.actT / f.actDur : 0, f.actSide);
    // gun stance: out and low until you aim or shoot, then up along the camera's line
    this.syncHeldGun();
    this.stanceK = damp(this.stanceK, gunOut ? 1 : 0, 9, dt);
    this.aimK = damp(this.aimK, aiming ? 1 : 0, 11, dt);
    const camPitch = this.camera ? Math.asin(clamp(this.camera.getWorldDirection(this.gv1).y, -1, 1)) : 0;
    this.gunPitchS = damp(this.gunPitchS, this.gunUpT > 0 ? camPitch : -0.9, 12, dt);
    ex.setStance(this.stanceK, this.gunPitchS);
    ex.root.position.copy(f.pos);
    ex.root.rotation.set(0, f.yaw, 0);
    ex.update(dt);
    this.updateGuns(dt, aiming, trigger, speed);

    // footsteps: stride length grows with pace
    if (f.grounded && speed > 0.8 && f.act !== "roll") {
      f.stepAcc += speed * dt;
      const stride = speed > FOOT_JOG * 1.2 ? 3.1 : speed > FOOT_WALK * 1.3 ? 2.5 : 1.7;
      if (f.stepAcc >= stride) {
        f.stepAcc = 0;
        this.audio.step(surface, (f.crouch ? 0.35 : 0.8) * clamp(speed / FOOT_JOG, 0.4, 1.3));
      }
    } else if (speed < 0.5) f.stepAcc = 0;

    // wading splashes + a dash of dust on hard runs
    this.splashT -= dt;
    if (speed > 1.2 && this.splashT <= 0) {
      this.splashT = surface === "water" ? 0.16 : 0.3;
      if (surface === "water") {
        for (let i = 0; i < 3; i++)
          this.spawnParticle(
            f.pos.x + (Math.random() - 0.5) * 0.5, gh + 0.06, f.pos.z + (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 1.4, 1.4 + Math.random(), (Math.random() - 0.5) * 1.4,
            "#cfe8ef", 0.12, 0.4, 0.5,
          );
      } else if (f.gaitS > 0.5) {
        this.spawnParticle(
          f.pos.x + (Math.random() - 0.5) * 0.4, gh + 0.05, f.pos.z + (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.6, 0.7 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6,
          "#a8946a", 0.12, 0.35, 0.5,
        );
      }
    }

    this.nearCar =
      Math.hypot(f.pos.x - this.v.pos.x, f.pos.z - this.v.pos.z) < ENTER_DIST;
    this.refreshNearRide();
  }

  /* ---- riding ------------------------------------------------------------ */

  private refreshNearRide(): void {
    const f = this.foot;
    const h = this.animals?.findRideable(f.pos.x, f.pos.z, RIDE_REACH) ?? null;
    if (!h || f.downT > 0) {
      this.nearRide = null;
      return;
    }
    const info = this.animals!.rideInfo(h);
    this.nearRide = { h, name: info.name, dist: Math.hypot(info.x - f.pos.x, info.z - f.pos.z) };
  }

  /** F on foot: climb onto the nearest rideable animal, else hop in the car. */
  private tryEnterOrMount(): void {
    if (this.riding) {
      this.dismount(true);
      return;
    }
    const r = this.nearRide;
    if (r && this.ridePreferred()) this.mount(r.h);
    else this.tryEnterCar();
  }

  /** An animal within reach beats the car unless the car is clearly closer. */
  private ridePreferred(): boolean {
    const r = this.nearRide;
    if (!r) return false;
    const carD = Math.hypot(this.foot.pos.x - this.v.pos.x, this.foot.pos.z - this.v.pos.z);
    return carD > ENTER_DIST || r.dist < carD + 1.2;
  }

  private mount(h: RideHandle): void {
    const ex = this.explorer;
    const an = this.animals;
    if (!ex || !an || this.foot.downT > 0) return;
    const f = this.foot;
    an.startRide(h); // measures the back from the live pose — read the seat after this
    const info = an.rideInfo(h);
    this.holster();
    this.riding = h;
    this.rideName = info.name;
    this.rideSeat = info.seat;
    this.rideSpecialName = info.special.name;
    this.rideRadius = info.radius;
    // the camera backs off and rises with the mount's size
    this.rideCamDist = 0.8 + info.seat.len * 0.9;
    this.rideCamLift = 0.3 + info.seat.y * 0.35;
    f.act = null;
    f.queued = null;
    f.crouch = false;
    f.vx = f.vz = f.vy = 0;
    f.grounded = true;
    f.yaw = info.yaw;
    this.footCam.yaw = info.yaw;
    this.nearRide = null;
    this.audio.thump(0.2);
    this.input.rumble(0.2, 120);
    this.setTip();
    this.notify(`Riding the ${info.name.replace(/_/g, " ")} — Space jump · Q ${info.special.name}`);
  }

  /** Slide off beside the animal (or, `place=false`, leave placement to the caller). */
  private dismount(place: boolean): void {
    const h = this.riding;
    const an = this.animals;
    const f = this.foot;
    if (!h || !an) {
      this.riding = null;
      return;
    }
    const info = an.rideInfo(h);
    an.endRide(h);
    this.riding = null;
    this.explorer?.setSeated(0);
    f.vx = f.vz = f.vy = 0;
    if (place) {
      // step off on the animal's right-hand side
      const side = info.radius + 0.9;
      f.pos.x = info.x + Math.cos(info.yaw) * side;
      f.pos.z = info.z - Math.sin(info.yaw) * side;
      f.pos.y = this.groundHeight(f.pos.x, f.pos.z);
      f.grounded = true;
      this.audio.thump(0.15);
      this.setTip();
      this.notify("On foot");
    }
  }

  /**
   * Steer the mount. The animal keeps its own character — top speed, inertia,
   * turning circle, gait clip (see AnimalSystem.rideStep) — and the rider sits
   * on its measured back: pelvis on the saddle line, legs straddling the flanks
   * on slim mounts or stretched out forward on wide / low ones, so no part of
   * the body ends up inside the animal.
   */
  private updateRiding(dt: number, snap: JeepInputSnapshot): void {
    const ex = this.explorer;
    const an = this.animals;
    const h = this.riding;
    const f = this.foot;
    if (!ex || !an || !h) return;

    const ix = snap.moveX;
    const iy = snap.moveY;
    const rawMag = Math.hypot(ix, iy);
    const mag = Math.min(1, rawMag);
    const yaw = this.footCam.yaw;
    let targetYaw = f.yaw;
    if (rawMag > 0.05) {
      const mx = (-Math.sin(yaw) * iy + Math.cos(yaw) * ix) / rawMag;
      const mz = (-Math.cos(yaw) * iy - Math.sin(yaw) * ix) / rawMag;
      targetYaw = Math.atan2(-mx, -mz);
    }
    // light tilt walks, full tilt trots, sprint gallops — fractions of THIS animal's top speed
    let frac = mag < 0.05 ? 0 : mag < 0.55 ? RIDE_WALK * (mag / 0.55) : RIDE_WALK + (RIDE_TROT - RIDE_WALK) * ((mag - 0.55) / 0.45);
    if (snap.sprint && mag > 0.5) frac = RIDE_GALLOP;
    // Space jumps with THIS animal's own jump height (a flyer climbs while it is held)
    if (snap.jump && !this.prevJump && an.rideJump(h)) this.audio.thump(0.18);
    this.prevJump = snap.jump;
    const body = an.rideStep(h, dt, targetYaw, frac, snap.jump);

    // the seat: along the heading from the origin, on top of the back
    const seat = this.rideSeat;
    const hx = -Math.sin(body.yaw);
    const hz = -Math.cos(body.yaw);
    f.pos.set(body.x + hx * seat.fwd, body.y + seat.y, body.z + hz * seat.fwd);
    f.yaw = body.yaw;
    f.vx = hx * body.speed;
    f.vz = hz * body.speed;
    f.vy = 0;
    f.grounded = true;
    f.gait = f.gaitS = 0;
    f.stealth = 1;

    // posture: straddle a slim back, stretch the legs forward on a wide or low one
    const forward = clamp(Math.max((0.95 - seat.y) / 0.45, (seat.halfW - 0.38) / 0.35), 0, 1);
    const spread = clamp((seat.halfW - 0.15) / 0.4, 0, 1);
    ex.setGait(0);
    ex.setSpeed(0);
    ex.setCrouch(0);
    ex.setDown(0);
    ex.setAction(null, 0);
    ex.setSeated(1, forward, spread);
    // pelvis sits ~8 cm above the saddle line
    // …and centre the PELVIS (not the root) on the seat: rotate its offset by the heading
    const ho = ex.hipOffset?.() ?? { x: 0, z: 0 };
    const cyw = Math.cos(f.yaw);
    const syw = Math.sin(f.yaw);
    ex.root.position.set(
      f.pos.x - (ho.x * cyw + ho.z * syw),
      f.pos.y + 0.08 - ex.hipHeight(),
      f.pos.z - (-ho.x * syw + ho.z * cyw),
    );
    ex.root.rotation.set(0, f.yaw, 0);
    ex.update(dt);

    // hoofbeats at the animal's own cadence (small animals patter, giants thud)
    if (body.speed > 0.5) {
      this.rideStepT -= dt;
      if (this.rideStepT <= 0) {
        const pace = clamp(body.speed / Math.max(1, an.rideInfo(h).topSpeed), 0.1, 1.1);
        this.rideStepT = clamp((0.62 - pace * 0.4) * (0.6 + seat.len * 0.25), 0.16, 0.9);
        this.audio.step(this.surfaceAt(body.x, body.z), clamp(0.5 + seat.len * 0.3, 0.6, 1.4));
      }
    }
    this.nearCar = Math.hypot(f.pos.x - this.v.pos.x, f.pos.z - this.v.pos.z) < ENTER_DIST;
    this.nearRide = null;
  }

  /** Special-move key while mounted: each species has its own (charge, leap, roar, web…). */
  private mountSpecial(): void {
    const h = this.riding;
    const an = this.animals;
    if (!h || !an) return;
    const r = an.rideSpecial(h);
    if (!r.ready) {
      this.notify(`${r.name} — ready in ${Math.ceil(r.cdLeft)}s`);
      return;
    }
    if (r.call) this.audio.animalCall(r.call.kind, r.call.pitch);
    this.audio.thump(r.thud);
    if (r.shake > 0.4) this.audio.thud(r.shake);
    this.camState.trauma = Math.min(1, this.camState.trauma + r.shake);
    this.input.rumble(clamp(0.25 + r.shake, 0.25, 1), 160);
    if (r.heal > 0) this.foot.health = Math.min(100, this.foot.health + r.heal);
    this.notify(r.text);
  }

  /** Horn key while mounted: the animal's own call (bark, neigh, roar…). */
  private mountCall(): void {
    const h = this.riding;
    const an = this.animals;
    if (!h || !an) return;
    const info: RideInfo = an.rideInfo(h);
    this.audio.animalCall(info.call.kind, info.call.pitch);
    an.rideCall(h);
    this.camState.trauma = Math.min(1, this.camState.trauma + 0.05 + info.mass / 40000);
    this.notify(info.call.text);
  }

  /* =====================================================================
     GUNS
     ===================================================================== */

  /** Put the right model (or none) in the explorer's hand for the current selection. */
  private syncHeldGun(): void {
    const sel = this.armory.selected;
    if (sel === this.heldGun) return;
    this.heldGun = sel;
    this.explorer?.setGun(sel > 0 ? (this.gunModels[sel - 1] ?? null) : null);
  }

  /** Select a weapon: 0 = fists, 1–5 = guns, -1 = cycle. */
  private switchWeapon(slot: number): void {
    const f = this.foot;
    if (!this.explorer || this.riding || f.downT > 0 || f.act === "roll") return;
    if (slot < 0) this.armory.cycle(1);
    else if (!this.armory.select(slot)) return;
    this.prevFire = true; // a held trigger must not fire the new gun
    this.onWeaponChanged();
  }

  private onWeaponChanged(): void {
    const g = this.armory.gun;
    this.syncHeldGun();
    this.audio.weaponSwap();
    if (g) this.notify(g.name);
    else {
      this.notify("Fists");
      this.mouseFire = this.mouseAim = false;
      if (document.pointerLockElement) document.exitPointerLock();
    }
    this.foot.crouch = false;
    this.setTip();
  }

  /** Put the gun away (entering the jeep, climbing on an animal). */
  private holster(): void {
    this.mouseFire = this.mouseAim = false;
    if (document.pointerLockElement) document.exitPointerLock();
    if (this.armory.gun) {
      this.armory.select(0);
      this.syncHeldGun();
    }
    this.stanceK = this.aimK = 0;
    this.explorer?.setStance(0, -0.9);
    if (this.el.xhair) this.el.xhair.hidden = true;
    if (this.el.scope) this.el.scope.hidden = true;
  }

  private reloadGun(): void {
    const g = this.armory.gun;
    if (!g || !this.armory.reload()) return;
    this.audio.reload(g.reloadSeconds);
    this.prevReloading = true;
  }

  /** First solid thing along a ray: terrain or a trunk/boulder (distance, or `maxT` if clear). */
  private rayWorld(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): number {
    const STEP = 0.6;
    let prevT = 0;
    for (let t = STEP; t <= maxT; t += STEP) {
      const x = ox + dx * t;
      const y = oy + dy * t;
      const z = oz + dz * t;
      const gh = this.groundHeight(x, z);
      if (y <= gh) {
        // refine inside the last step so impacts land on the surface, not 0.6 m early
        let lo = prevT;
        let hi = t;
        for (let i = 0; i < 5; i++) {
          const mid = (lo + hi) / 2;
          if (oy + dy * mid <= this.groundHeight(ox + dx * mid, oz + dz * mid)) hi = mid;
          else lo = mid;
        }
        return hi;
      }
      if (y - gh < 12) {
        for (const b of this.colliders) {
          const cx = x - b.x;
          const cz = z - b.z;
          const r = b.r * 0.9;
          if (cx * cx + cz * cz < r * r) return t;
        }
      }
      prevT = t;
    }
    return maxT;
  }

  /** Per-frame gun logic: cooldown/reload clocks, trigger handling, HUD bits. */
  private updateGuns(dt: number, aiming: boolean, trigger: boolean, speed: number): void {
    const ar = this.armory;
    ar.update(dt);
    const g = ar.gun;
    this.hitMarkT = Math.max(0, this.hitMarkT - dt);
    if (this.prevReloading && !ar.reloading) this.prevReloading = false;
    if (!g || this.foot.downT > 0 || this.riding) {
      this.prevFire = trigger;
      return;
    }
    const edge = trigger && !this.prevFire;
    if (trigger && (g.auto || edge)) {
      if (ar.canFire()) this.fireGun(g, aiming, speed);
      else if (edge && !ar.reloading && ar.dry) {
        this.audio.dryFire();
        this.notify("Out of ammo — drive to the jeep to restock");
      } else if (edge && ar.mag <= 0 && !ar.reloading) this.reloadGun();
    }
    // a reload the armory started by itself (empty magazine)
    if (ar.reloading && !this.prevReloading) {
      this.prevReloading = true;
      this.audio.reload(g.reloadSeconds);
    }
    this.prevFire = trigger;
  }

  private fireGun(g: GunDef, aiming: boolean, speed: number): void {
    const ar = this.armory;
    const cam = this.camera;
    const ex = this.explorer;
    const an = this.animals;
    if (!cam || !ex || !ar.fire()) return;
    const f = this.foot;

    // aim ray = straight through the crosshair, starting just in front of the player
    cam.getWorldDirection(this.gv1); // gv1 = camera forward
    const head = this.gv2.set(f.pos.x, f.pos.y + 1.45, f.pos.z);
    const along = Math.max(0.5, this.gv3.subVectors(head, cam.position).dot(this.gv1));
    const ox = cam.position.x + this.gv1.x * along;
    const oy = cam.position.y + this.gv1.y * along;
    const oz = cam.position.z + this.gv1.z * along;
    const muzzle = this.gv4;
    if (!ex.muzzleWorld(muzzle)) muzzle.set(f.pos.x, f.pos.y + 1.3, f.pos.z);

    // spread: tight when aiming and standing, wide from the hip and on the move
    const cone = g.spread * (aiming ? 1 : g.hipSpread) * (1 + clamp(speed / FOOT_RUN, 0, 1) * 1.2);
    let anyHit = false;
    let anyKill = false;
    for (let i = 0; i < g.pellets; i++) {
      const ang = Math.sqrt(Math.random()) * cone;
      const phi = Math.random() * TAU;
      // perpendicular basis around the aim direction
      const fx = this.gv1.x;
      const fy = this.gv1.y;
      const fz = this.gv1.z;
      let ux = -fz;
      let uz = fx;
      const ul = Math.hypot(ux, uz) || 1;
      ux /= ul;
      uz /= ul;
      const vx = fy * uz;
      const vy = fz * ux - fx * uz;
      const vz = -fy * ux;
      const sa = Math.sin(ang);
      const ca = Math.cos(ang);
      const dx = fx * ca + (ux * Math.cos(phi) + vx * Math.sin(phi)) * sa;
      const dy = fy * ca + (vy * Math.sin(phi)) * sa;
      const dz = fz * ca + (uz * Math.cos(phi) + vz * Math.sin(phi)) * sa;

      const worldT = this.rayWorld(ox, oy, oz, dx, dy, dz, g.range);
      const hit = an?.shoot(ox, oy, oz, dx, dy, dz, worldT, (t) => damageAt(g, t), g.knock) ?? null;
      const t = hit ? hit.t : worldT;
      const ex2 = ox + dx * t;
      const ey = oy + dy * t;
      const ez = oz + dz * t;
      if (hit) {
        anyHit = true;
        if (hit.killed) anyKill = true;
      } else if (worldT < g.range) {
        // dust and chips where it struck the ground or a trunk
        for (let k = 0; k < 4; k++)
          this.spawnParticle(
            ex2, ey, ez, (Math.random() - 0.5) * 2.2, 0.8 + Math.random() * 1.6, (Math.random() - 0.5) * 2.2,
            "#b7a47c", 0.1, 0.3, 0.35,
          );
      }
      this.addTracer(muzzle.x, muzzle.y, muzzle.z, ex2, ey, ez, g.pellets > 1 ? 0.5 : 0.9);
    }

    // muzzle flash, sound, recoil
    for (let k = 0; k < 3; k++)
      this.spawnParticle(
        muzzle.x, muzzle.y, muzzle.z, (Math.random() - 0.5) * 1.2, (Math.random() - 0.2) * 1.2, (Math.random() - 0.5) * 1.2,
        k === 0 ? "#fff3c4" : "#ffb84a", 0.32, 0.04, 0.07,
      );
    this.audio.gunshot(g.sound);
    ex.kickGun(1);
    // GTA-style: the reticle lifts a little and eases back on its own — it never walks off target
    this.camKick = Math.min(0.07, this.camKick + g.recoil * (aiming ? 0.55 : 0.9));
    this.camState.trauma = Math.min(1, this.camState.trauma + 0.012 + g.recoil * 0.6);
    this.input.rumble(clamp(0.18 + g.recoil * 8, 0.2, 0.7), 70);
    if (anyHit) {
      this.hitMarkT = 0.18;
      this.hitKill = anyKill;
      this.audio.hitMarker(anyKill);
    }
  }

  private addTracer(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, opacity: number): void {
    const scene = this.scene;
    if (!scene) return;
    const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    if (len < 0.2) return;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity, depthWrite: false });
    const m = new THREE.Mesh(this.tracerGeo, mat);
    m.scale.set(0.035, 0.035, len);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.lookAt(x1, y1, z1);
    m.frustumCulled = false;
    scene.add(m);
    this.tracers.push({ mesh: m, life: 0.07, max: 0.07 });
  }

  private updateTracers(dt: number): void {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene?.remove(t.mesh);
        (t.mesh.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      } else {
        (t.mesh.material as THREE.MeshBasicMaterial).opacity *= 0.85;
      }
    }
  }

  /** Is a living animal under the crosshair right now (aim friction, reticle colour)? */
  private targetUnderReticle(): boolean {
    const cam = this.camera;
    const g = this.armory.gun;
    if (!cam || !g || !this.animals) return false;
    cam.getWorldDirection(this.gv1);
    return this.animals.probe(cam.position.x, cam.position.y, cam.position.z, this.gv1.x, this.gv1.y, this.gv1.z, Math.min(g.range, 80)) !== null;
  }

  /** Weapon panel, crosshair, hit marker and scope overlay (called from the 14 Hz UI tick). */
  private updateWeaponHud(): void {
    const ar = this.armory;
    const g = ar.gun;
    const show = this.onFoot && !this.riding && !this.paused;
    if (this.el.weapon) this.el.weapon.hidden = !show;
    const xh = this.el.xhair;
    const out = show && !!g && this.foot.downT <= 0;
    if (xh) {
      xh.hidden = !out;
      xh.classList.toggle("aim", this.aimK > 0.5);
      xh.classList.toggle("target", out && this.targetUnderReticle());
      if (out && g) {
        const cone = g.spread * (this.aimK > 0.5 ? 1 : g.hipSpread) * (1 + clamp(Math.hypot(this.foot.vx, this.foot.vz) / FOOT_RUN, 0, 1) * 1.2);
        xh.style.setProperty("--s", `${clamp(5 + cone * 380, 5, 54).toFixed(1)}px`);
      }
    }
    if (this.el.hitm) {
      this.el.hitm.classList.toggle("on", this.hitMarkT > 0);
      this.el.hitm.classList.toggle("kill", this.hitKill);
    }
    if (this.el.scope) this.el.scope.hidden = !(out && !!g?.scope && this.aimK > 0.85);
    if (!show) return;
    if (!g) {
      if (this.el.wName) this.el.wName.textContent = "Fists";
      if (this.el.wAmmo) this.el.wAmmo.textContent = "";
      if (this.el.wReload) this.el.wReload.style.width = "0%";
      if (this.el.wKeys) this.el.wKeys.textContent = "1–5 draw a gun";
      return;
    }
    if (this.el.wName) this.el.wName.textContent = g.name;
    if (this.el.wAmmo) {
      const res = ar.reserve === Infinity ? "∞" : String(ar.reserve);
      this.el.wAmmo.innerHTML = `${ar.mag}<small> / ${res}</small>`;
      this.el.wAmmo.classList.toggle("low", ar.mag <= Math.ceil(g.magSize * 0.25));
    }
    if (this.el.wReload) {
      this.el.wReload.style.width = ar.reloading ? `${(1 - ar.reloadLeft / g.reloadSeconds) * 100}%` : "0%";
    }
    if (this.el.wKeys) this.el.wKeys.textContent = ar.reloading ? "Reloading…" : ar.dry ? "No ammo — restock at the jeep" : `${g.auto ? "Auto" : "Semi"} · R reload`;
  }

  /* ---- on-foot actions ---------------------------------------------------- */

  /** Begin a punch / kick / roll, queueing it if a swing is already in flight. */
  private startAction(kind: "punch" | "kick" | "roll"): void {
    const f = this.foot;
    const ex = this.explorer;
    if (!this.onFoot || !ex || f.downT > 0 || this.riding) return;
    if (f.act === "roll") return; // committed
    if (kind !== "roll" && this.armory.gun) return; // hands are full — holster to fight bare-fisted
    if (kind === "roll") {
      if (!f.grounded || f.stamina < ROLL_COST * 0.5) return;
      const yaw = this.footCam.yaw;
      const mx = this.lastMove.x;
      const my = this.lastMove.y;
      const m = Math.hypot(mx, my);
      let dx: number;
      let dz: number;
      if (m > 0.2) {
        dx = (-Math.sin(yaw) * my + Math.cos(yaw) * mx) / m;
        dz = (-Math.cos(yaw) * my - Math.sin(yaw) * mx) / m;
      } else {
        dx = -Math.sin(f.yaw);
        dz = -Math.cos(f.yaw);
      }
      f.rollX = dx;
      f.rollZ = dz;
      f.act = "roll";
      f.actT = 0;
      f.actDur = ROLL_DUR;
      f.queued = null;
      f.crouch = false;
      f.invulnT = ROLL_DUR * 0.75;
      f.stamina = Math.max(0, f.stamina - ROLL_COST);
      f.staminaRest = 0.9;
      this.audio.step("dirt", 1);
      return;
    }
    if (f.act) {
      // chain the next swing once the current one is mostly through
      if (f.actT / f.actDur > 0.45) f.queued = kind;
      return;
    }
    let move: keyof typeof MELEE = "kick";
    if (kind === "punch") {
      f.combo = f.comboT > 0 ? (f.combo + 1) % 3 : 0;
      move = f.combo === 2 ? "hook" : "punch";
      f.actSide = f.combo === 2 ? 0 : ((f.combo % 2) as 0 | 1);
    } else f.actSide = Math.random() < 0.5 ? 0 : 1;
    const spec = MELEE[move];
    f.act = kind;
    f.actMove = move;
    f.actT = 0;
    f.actDur = spec.dur;
    f.hitDone = false;
    f.comboT = 0.9;
    f.crouch = false;
    f.stamina = Math.max(0, f.stamina - spec.cost);
    f.staminaRest = 0.7;
    // soft lock: snap to the nearest animal in front so swings connect
    const dirX = -Math.sin(f.yaw);
    const dirZ = -Math.cos(f.yaw);
    const t = this.animals?.nearestTarget(f.pos.x, f.pos.z, dirX, dirZ, 4.2, -0.2);
    if (t) f.yaw = Math.atan2(-(t.x - f.pos.x), -(t.z - f.pos.z));
    // small lunge into the swing
    f.vx += -Math.sin(f.yaw) * 2.2;
    f.vz += -Math.cos(f.yaw) * 2.2;
  }

  /** The moment a swing connects: cone test against the wildlife + feedback. */
  private resolveMelee(): void {
    const f = this.foot;
    const spec = MELEE[f.actMove];
    const dx = -Math.sin(f.yaw);
    const dz = -Math.cos(f.yaw);
    const r = this.animals?.melee(
      f.pos.x + dx * 0.2, f.pos.z + dz * 0.2, dx, dz, spec.range, spec.arc, spec.dmg, spec.knock,
    );
    if (!r || r.hits === 0) {
      this.audio.step("dirt", 0.5); // whiff
      return;
    }
    this.audio.thump(clamp(0.3 + spec.dmg / 45, 0.3, 0.8));
    this.input.rumble(clamp(0.3 + spec.dmg / 50, 0.3, 0.8), 110);
    this.camState.trauma = Math.min(1, this.camState.trauma + 0.1 + r.kills * 0.15 + (r.heavy ? 0.1 : 0));
    this.slowmoT = Math.max(this.slowmoT, r.kills ? 0.1 : 0.04); // hit-stop
  }

  /** An animal bit the player. `n` points away from the attacker. */
  private hurtPlayer(dmg: number, nx: number, nz: number): void {
    const f = this.foot;
    if (!this.onFoot || f.downT > 0 || f.invulnT > 0 || dmg <= 0) return;
    f.health = Math.max(0, f.health - dmg);
    f.healthRest = 7;
    f.vx += nx * 6.5;
    f.vz += nz * 6.5;
    if (f.act && f.act !== "roll") f.act = null; // staggered out of the swing
    f.queued = null;
    f.invulnT = 0.5;
    this.camState.trauma = Math.min(1, this.camState.trauma + 0.35);
    this.audio.thud(0.6);
    this.input.rumble(0.7, 220);
    if (f.health <= 0) {
      this.mouseFire = this.mouseAim = false;
      if (this.riding) this.dismount(true);
      f.downT = 3.2;
      f.act = null;
      f.crouch = false;
      this.camState.trauma = 1;
      this.notify("Knocked out!");
    }
  }

  /** Back on your feet at the car after a knockout. */
  private recoverFromKnockout(): void {
    this.foot.downT = 0;
    this.foot.health = 60;
    this.foot.stamina = 100;
    this.foot.winded = false;
    this.foot.healthRest = 4;
    this.spawnExplorerBesideCar();
    this.notify("You came to beside the jeep — 60% health");
  }

  /** On-foot third-person camera: orbitable follow with terrain clearance. */
  private updateFootCamera(dt: number): void {
    const camera = this.camera;
    const cs = this.camState;
    if (!camera) return;
    const p = this.foot.pos;
    const fc = this.footCam;
    this.camKick = damp(this.camKick, 0, 9, dt);
    const pitchEff = fc.pitch - this.camKick;
    const cp = Math.cos(pitchEff);
    // mounted: sit higher and further back so the animal's body never fills the lens
    const mounted = this.riding ? 1 : 0;
    const dist = fc.dist + mounted * this.rideCamDist;
    const lift = mounted * this.rideCamLift;
    this.camV1.set(Math.sin(fc.yaw) * cp * dist, 1.5 + lift + Math.sin(pitchEff) * dist, Math.cos(fc.yaw) * cp * dist);
    // gun out: pull in and swing over the right shoulder so the crosshair clears the body
    const shoulder = 0.62 * this.stanceK;
    if (this.stanceK > 0.001) {
      this.camV1.multiplyScalar(1 - 0.32 * this.aimK * this.stanceK);
      this.camV1.x += Math.cos(fc.yaw) * shoulder;
      this.camV1.z += -Math.sin(fc.yaw) * shoulder;
    }
    this.camV1.add(p);
    this.safeAboveTerrain(this.camV1, 0.4);
    cs.pos.lerp(this.camV1, 1 - Math.exp(-(this.aimK > 0.05 ? 16 : 9) * dt));
    this.camV2.set(p.x + Math.cos(fc.yaw) * shoulder, p.y + (mounted ? 1.0 : 1.45), p.z - Math.sin(fc.yaw) * shoulder);
    cs.look.lerp(this.camV2, 1 - Math.exp(-16 * dt));
    camera.position.copy(cs.pos);
    camera.lookAt(cs.look);
    const speedK = clamp(Math.hypot(this.foot.vx, this.foot.vz) / FOOT_RUN, 0, 1);
    const g = this.armory.gun;
    const baseFov = 58 + speedK * 6;
    camera.fov = lerp(camera.fov, g ? lerp(baseFov, g.zoomFov, this.aimK) : baseFov, 1 - Math.exp(-(g ? 12 : 3) * dt));
    camera.updateProjectionMatrix();
  }

  /** Keep derived foot state in sync after teleports (no velocity carry-over). */
  private footRenderSync(): void {
    this.nearCar =
      Math.hypot(this.foot.pos.x - this.v.pos.x, this.foot.pos.z - this.v.pos.z) < ENTER_DIST;
  }

  /** HUD hint under the tip: shown only when the explorer can hop in. */
  private updatePrompt(): void {
    const pr = this.el.prompt;
    if (!pr) return;
    const key = this.input.connected ? "Y" : "F";
    const ride = this.nearRide;
    const rideFirst = !!ride && this.ridePreferred();
    const show = this.onFoot && !this.paused && (!!this.riding || rideFirst || this.nearCar);
    pr.hidden = !show;
    if (!show) return;
    if (this.riding) pr.textContent = `${key} — dismount`;
    else if (rideFirst && ride) pr.textContent = `${key} — ride the ${ride.name.replace(/_/g, " ")}`;
    else pr.textContent = `${key} — enter the ${this.activeCar ? "vehicle" : "jeep"}`;
  }

  /** Show the HUD for who you are right now: driver dashboard or explorer vitals. */
  private applyModeHud(): void {
    const root = this.root;
    if (!root) return;
    const foot = this.onFoot;
    for (const el of root.querySelectorAll<HTMLElement>("[data-car]")) el.hidden = foot;
    for (const el of root.querySelectorAll<HTMLElement>("[data-foot]")) el.hidden = !foot;
    const gears = root.querySelector<HTMLElement>(".jj-gears");
    if (gears) gears.hidden = foot;
    if (this.el.brkRow) this.el.brkRow.hidden = foot;
    if (this.el.spdu) this.el.spdu.textContent = foot ? "KM / H · ON FOOT" : "KM / H";
    if (this.el.warn && foot) this.el.warn.classList.remove("show");
  }

  /** Contextual bottom tip — one line per state. */
  private setTip(): void {
    this.applyModeHud();
    const tip = this.el.tip;
    if (!tip) return;
    if (this.onFoot && this.riding) {
      tip.innerHTML =
        `<b>WASD</b> steer · <b>Shift</b> gallop · <b>Space</b> jump · <b>Q</b>/click ${this.rideSpecialName} · <b>K</b> call · <b>F</b> dismount`;
    } else if (this.onFoot && this.armory.gun) {
      tip.innerHTML =
        "<b>Click</b>/<b>J</b> fire · <b>Right-click</b>/<b>X</b> aim · <b>R</b> reload · <b>1–5</b> guns · <b>Tab</b> cycle · <b>0</b> holster";
    } else if (this.onFoot) {
      tip.innerHTML =
        "<b>WASD</b> move · <b>Shift</b> sprint · <b>Space</b> jump · <b>C</b> crouch · <b>Q</b> roll · <b>J</b>/click punch · <b>K</b>/right-click kick · <b>1–5</b> draw a gun · <b>F</b> vehicle";
    } else {
      tip.innerHTML =
        "<b>RT</b> drive · <b>stick</b> steer · <b>F/E</b> hop out · <b>C</b> cameras · <b>R</b> reset";
    }
  }

  private updateCamera(dt: number): void {
    const camera = this.camera;
    const jeep = this.jeep;
    if (!camera || !jeep) return;
    const v = this.v;
    const cs = this.camState;
    const mode = MODES[this.camMode];
    // The camera follows the interpolated render position, never raw sim state.
    const pos = this.renderPos;

    if (this.onFoot) {
      this.updateFootCamera(dt);
    } else if (mode === "chase") {
      cs.dist = damp(cs.dist, cs.targetDist, 6, dt);
      const speedK = clamp(Math.abs(v.speed) / MAX_SPEED, 0, 1);
      const back = cs.dist + speedK * 1.6;
      const yq = this.camQ.setFromEuler(this.camE.set(0, v.yaw + cs.yawOff, 0, "YXZ"));
      this.camV1.set(0, 2.5 + speedK * 0.4, back).applyQuaternion(yq);
      this.camV1.add(pos);
      this.safeAboveTerrain(this.camV1, 1.4);
      cs.pos.lerp(this.camV1, 1 - Math.exp(-7.0 * dt));
      this.camV2.copy(pos);
      this.camV2.y += 0.85;
      this.camV2.x += -Math.sin(v.yaw) * (2.5 + speedK * 6.0);
      this.camV2.z += -Math.cos(v.yaw) * (2.5 + speedK * 6.0);
      cs.look.lerp(this.camV2, 1 - Math.exp(-8.0 * dt));
      camera.position.copy(cs.pos);
      camera.lookAt(cs.look);
      camera.fov = lerp(camera.fov, 62 + speedK * 8, 1 - Math.exp(-3.5 * dt));
      camera.updateProjectionMatrix();
    } else if (mode === "cockpit") {
      cs.headX = damp(cs.headX, clamp(-v.lateral * 0.03, -0.06, 0.06), 5, dt);
      cs.headY = damp(cs.headY, clamp(-v.dive * 0.8, -0.06, 0.06), 5, dt);
      this.camV1.set(-0.42 + cs.headX, 0.62 + cs.headY, -0.28);
      jeep.localToWorld(this.camV1);
      camera.position.lerp(this.camV1, 1 - Math.exp(-22 * dt));
      this.camV2.set(-0.42 + Math.sin(cs.yawOff) * 3.2, 0.42 + Math.sin(cs.pitchOff) * 2.4, -6.0);
      jeep.localToWorld(this.camV2);
      camera.lookAt(this.camV2);
      camera.fov = lerp(camera.fov, 70, 1 - Math.exp(-4 * dt));
      camera.updateProjectionMatrix();
    } else if (mode === "orbit") {
      const d = cs.orbitDist;
      this.camV1.set(
        Math.sin(cs.orbitYaw) * Math.cos(cs.orbitPitch) * d,
        Math.sin(cs.orbitPitch) * d + 1.0,
        Math.cos(cs.orbitYaw) * Math.cos(cs.orbitPitch) * d,
      );
      this.camV1.add(pos);
      this.safeAboveTerrain(this.camV1, 0.6);
      camera.position.lerp(this.camV1, 1 - Math.exp(-8 * dt));
      this.camV2.copy(pos);
      this.camV2.y += 0.7;
      cs.look.lerp(this.camV2, 1 - Math.exp(-8 * dt));
      camera.lookAt(cs.look);
      camera.fov = lerp(camera.fov, 55, 1 - Math.exp(-4 * dt));
      camera.updateProjectionMatrix();
    } else if (mode === "under") {
      const yq = this.camQ.setFromEuler(this.camE.set(0, v.yaw, 0, "YXZ"));
      this.camV1.set(0.4, -0.32, 2.85).applyQuaternion(yq).add(pos);
      const gh = this.terrainHeight(this.camV1.x, this.camV1.z);
      this.camV1.y = Math.max(this.camV1.y, gh + 0.25);
      camera.position.lerp(this.camV1, 1 - Math.exp(-7.5 * dt));
      this.camV2.copy(pos);
      this.camV2.y -= 0.35;
      this.camV2.x += -Math.sin(v.yaw) * 1.5;
      this.camV2.z += -Math.cos(v.yaw) * 1.5;
      cs.look.lerp(this.camV2, 1 - Math.exp(-7.5 * dt));
      camera.lookAt(cs.look);
      camera.fov = lerp(camera.fov, 52, 1 - Math.exp(-4 * dt));
      camera.updateProjectionMatrix();
    } else {
      const yq = this.camQ.setFromEuler(this.camE.set(0, v.yaw, 0, "YXZ"));
      this.camV1.set(-2.15, 0.3, -1.15).applyQuaternion(yq).add(pos);
      const gh = this.terrainHeight(this.camV1.x, this.camV1.z);
      this.camV1.y = Math.max(this.camV1.y, gh + 0.35);
      camera.position.lerp(this.camV1, 1 - Math.exp(-9 * dt));
      this.camV2.set(-0.86, -0.35, -1.28);
      jeep.localToWorld(this.camV2);
      cs.look.lerp(this.camV2, 1 - Math.exp(-9 * dt));
      camera.lookAt(cs.look);
      camera.fov = lerp(camera.fov, 58, 1 - Math.exp(-4 * dt));
      camera.updateProjectionMatrix();
    }

    // game-feel: trauma² shake — smooth sin offsets + roll, added ON TOP of follow
    const shake = cs.trauma * cs.trauma;
    if (shake > 0.001) {
      const t = this.time * 30;
      camera.position.x += 0.24 * shake * Math.sin(t * 1.7);
      camera.position.y += 0.17 * shake * Math.sin(t * 2.3);
      camera.rotation.z += 0.022 * shake * Math.sin(t * 1.1);
    }
    // transient FOV punch on hard landings, eased back to rest
    if (this.fovKick > 0.01) {
      camera.fov += this.fovKick;
      this.fovKick = damp(this.fovKick, 0, 5, dt);
      camera.updateProjectionMatrix();
    }
  }

  private setCameraMode(i: number): void {
    this.camMode = ((i % MODES.length) + MODES.length) % MODES.length;
    this.notify(MODE_LABEL[MODES[this.camMode]]);
    if (this.el.hCam) this.el.hCam.textContent = MODE_LABEL[MODES[this.camMode]].replace(" camera", "").replace(" view", "");
  }

  private relaxLook(dt: number): void {
    const cs = this.camState;
    const mode = MODES[this.camMode];
    if (this.onFoot) {
      // free orbit on foot: nothing to relax
      return;
    }
    if (mode === "chase" || mode === "cockpit") {
      cs.yawOff = damp(cs.yawOff, 0, 2.2, dt);
      cs.pitchOff = damp(cs.pitchOff, 0, 2.2, dt);
    }
  }

  private applyStickLook(snap: JeepInputSnapshot, dt: number): void {
    const cs = this.camState;
    const mode = MODES[this.camMode];
    const lx = snap.lookX;
    const ly = snap.lookY;
    if (this.onFoot) {
      // aiming drops the stick sensitivity (and sticks to a target under the reticle, GTA-style)
      let sens = 1 - 0.45 * this.aimK;
      if (this.aimK > 0.5 && this.targetUnderReticle()) sens *= 0.5;
      this.footCam.yaw -= lx * dt * 3.0 * sens;
      this.footCam.pitch = clamp(this.footCam.pitch + ly * dt * 2.2 * sens, -0.32, 0.95);
      return;
    }
    if (mode === "orbit") {
      cs.orbitYaw -= lx * dt * 3.4;
      cs.orbitPitch = clamp(cs.orbitPitch + ly * dt * 2.4, -0.25, 1.15);
    } else if (mode === "cockpit") {
      cs.yawOff = clamp(cs.yawOff - lx * dt * 2.6, -0.85, 0.85);
      cs.pitchOff = clamp(cs.pitchOff - ly * dt * 2.0, -0.5, 0.5);
    } else if (mode === "chase") {
      cs.yawOff = clamp(cs.yawOff - lx * dt * 2.6, -1.0, 1.0);
    }
  }

  /* =====================================================================
     HUD
     ===================================================================== */

  private buildHud(): void {
    const root = this.root;
    if (!root) return;
    root.insertAdjacentHTML(
      "beforeend",
      `<div class="jj-grade"></div><div class="jj-vig"></div>
      <div class="jj-hud">
        <div class="jj-panel jj-compass" data-el="compass">N</div>
        <div class="jj-panel jj-topleft">
          <div data-car><span class="k">Camera</span><span class="v" data-el="hCam">Chase</span></div>
          <div data-car><span class="k">Lights</span><span class="v"><span class="jj-dot" data-el="hLampDot"></span><span data-el="hLamp">Off</span></span></div>
          <div><span class="k">Surface</span><span class="v" data-el="hSurf">Dirt</span></div>
          <div data-car><span class="k">Loop</span><span class="v" data-el="hLap">0 · 0%</span></div>
          <div><span class="k">Wildlife</span><span class="v" data-el="hKills">0</span></div>
          <div class="jj-time-best" data-car><span class="k">Time</span><span class="v" data-el="hTime">0:00.00</span></div>
          <div class="jj-time-best" data-car><span class="k">Best</span><span class="v" data-el="hBest">—</span></div>
        </div>
        <div class="jj-panel jj-speedo">
          <div class="jj-spd" data-el="spd">0</div>
          <div class="jj-spdu" data-el="spdu">KM / H</div>
          <div class="jj-gears">
            <div data-g="P">P</div><div data-g="R">R</div><div data-g="N">N</div><div data-g="D" class="on">D</div>
          </div>
          <div class="jj-bars">
            <div class="jj-brow"><span class="jj-blbl">HP</span><div class="jj-bwrap jj-hp"><i data-el="hp"></i></div></div>
            <div class="jj-bwrap jj-thr" data-el="thrRow"><i data-el="thr"></i></div>
            <div class="jj-bwrap jj-brk" data-el="brkRow"><i data-el="brk"></i></div>
          </div>
        </div>
        <div class="jj-panel jj-notice" data-el="notice">Chase camera</div>
        <div class="jj-panel jj-prompt" data-el="prompt" hidden>F — enter the jeep</div>
        <div class="jj-panel jj-weapon" data-el="weapon" hidden>
          <div class="n" data-el="wName">Fists</div>
          <div class="a" data-el="wAmmo"></div>
          <div class="r"><i data-el="wReload"></i></div>
          <div class="k" data-el="wKeys">1–5 draw a gun</div>
        </div>
        <div class="jj-xhair" data-el="xhair" hidden><i></i><i></i><i></i><i></i><b data-el="hitm"></b></div>
        <div class="jj-scope" data-el="scope" hidden></div>
        <div class="jj-panel jj-tip" data-el="tip"><b>WASD</b> move · <b>Shift</b> sprint · <b>Space</b> jump · <b>J</b> punch · <b>K</b> kick · <b>F</b> vehicle</div>
        <div class="jj-panel jj-warn" data-el="warn">Jeep overturned — press <b>RB / R</b> to recover</div>
        <div class="jj-panel jj-pad" data-el="pad">Keyboard · plug in a gamepad</div>
      </div>
      <div class="jj-count" data-el="count"></div>
      <div class="jj-touch" data-el="touch" hidden>
        <div class="jj-tbtn" data-t="left" style="left:24px;bottom:34px;">◀</div>
        <div class="jj-tbtn" data-t="right" style="left:118px;bottom:34px;">▶</div>
        <div class="jj-tbtn" data-t="gas" style="right:24px;bottom:120px;">▲</div>
        <div class="jj-tbtn" data-t="brake" style="right:24px;bottom:34px;">▼</div>
        <div class="jj-tbtn" data-t="cam" style="right:118px;bottom:34px;font-size:14px;">CAM</div>
        <div class="jj-tbtn" data-t="punch" data-foot style="right:212px;bottom:120px;font-size:12px;" hidden>PUNCH</div>
        <div class="jj-tbtn" data-t="kick" data-foot style="right:212px;bottom:34px;font-size:12px;" hidden>KICK</div>
        <div class="jj-tbtn" data-t="enter" style="right:118px;bottom:120px;font-size:13px;">CAR</div>
      </div>`,
    );
    for (const el of root.querySelectorAll<HTMLElement>("[data-el]")) {
      this.el[el.dataset.el as string] = el;
    }
    this.gearEls = [...root.querySelectorAll<HTMLElement>(".jj-gears div")];
    this.updatePadChip(this.input.connected, this.input.padId);
    const touchBox = root.querySelector<HTMLElement>("[data-el=touch]");
    if (touchBox && this.input.touchActive) {
      touchBox.hidden = false;
      const bind = (sel: string, down: () => void, up?: () => void) => {
        const b = touchBox.querySelector<HTMLElement>(`[data-t=${sel}]`);
        if (b) this.input.bindTouchButton(b, down, up);
      };
      bind("gas", () => this.input.setTouchPedal("gas", true), () => this.input.setTouchPedal("gas", false));
      bind("brake", () => this.input.setTouchPedal("brake", true), () => this.input.setTouchPedal("brake", false));
      bind("left", () => this.input.setTouchSteer(-1), () => this.input.setTouchSteer(0));
      bind("right", () => this.input.setTouchSteer(1), () => this.input.setTouchSteer(0));
      bind("cam", () => {
        if (this.onFoot) this.input.pushAction("camera"); // crouch
        else this.setCameraMode(this.camMode + 1);
      });
      bind("punch", () => this.input.pushAction(this.riding ? "special" : "punch"));
      bind("kick", () => this.input.pushAction(this.riding ? "special" : "kick"));
      bind("enter", () => this.input.pushAction("enter"));
    }
  }

  private noticeTimer = 0;
  private notify(text: string): void {
    const n = this.el.notice;
    if (!n) return;
    n.textContent = text;
    n.classList.add("show");
    window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => n.classList.remove("show"), 1900);
  }

  private updatePadChip(connected: boolean, id: string): void {
    if (!this.el.pad) return;
    if (connected) {
      const short = id.length > 34 ? `${id.slice(0, 34)}…` : id;
      this.el.pad.textContent = `🎮 ${short}`;
    } else {
      this.el.pad.textContent = "Keyboard · plug in a gamepad";
    }
  }

  /** Big 3-2-1-GO readout; retriggers the pop animation per number. */
  private showCount(n: number): void {
    const el = this.el.count;
    if (!el) return;
    if (this.lastCountNum === n) return;
    this.lastCountNum = n;
    if (n <= 0) {
      el.textContent = "GO!";
      this.audio.beep(true);
    } else {
      el.textContent = String(n);
      this.audio.beep(false);
    }
    el.classList.remove("jj-pop");
    void el.offsetWidth; // restart the CSS animation
    el.classList.add("jj-pop");
  }

  private uiAcc = 0;
  private updateUI(dt: number): void {
    this.uiAcc += dt;
    if (this.uiAcc < 0.07) return;
    this.uiAcc = 0;
    const v = this.v;
    const foot = this.onFoot;
    const kmh = foot ? Math.hypot(this.foot.vx, this.foot.vz) * 3.6 : Math.abs(v.speed) * 3.6;
    if (this.el.spd) this.el.spd.textContent = String(Math.round(kmh));
    let gear = "D";
    if (v.speed < -0.15) gear = "R";
    else if (Math.abs(v.speed) < 0.12 && v.throttle < 0.05) gear = v.handbrake || v.brake > 0.5 ? "P" : "N";
    if (!foot) for (const g of this.gearEls) g.classList.toggle("on", g.dataset.g === gear);
    if (this.el.thr) {
      // on foot the throttle bar becomes stamina
      this.el.thr.style.width = foot ? `${this.foot.stamina}%` : `${v.throttle * 100}%`;
      this.el.thr.style.background = foot ? (this.foot.winded ? "#e5484d" : "#5aa9e6") : "";
    }
    if (this.el.brk) this.el.brk.style.width = `${v.brake * 100}%`;
    // HP bar: always visible, full width = healthy, colour tracks the level
    if (this.el.hp) {
      const hp = foot ? this.foot.health : this.jeepHealth;
      this.el.hp.style.width = `${hp}%`;
      this.el.hp.style.background = hp > 50 ? "#78d18a" : hp > 25 ? "#e8b04a" : "#e5484d";
    }
    if (this.el.hSurf) {
      const surf = this.onFoot ? this.surfaceAt(this.foot.pos.x, this.foot.pos.z) : v.surface;
      this.el.hSurf.textContent = surf.charAt(0).toUpperCase() + surf.slice(1);
    }
    if (this.el.hLap) this.el.hLap.textContent = `${v.lap} · ${Math.round(v.progress * 100)}%`;
    if (this.el.hTime) {
      if (this.lapStartT < 0) this.el.hTime.textContent = "—";
      else {
        const t = this.countdownT > 0 ? 0 : Math.max(0, this.time - this.lapStartT);
        this.el.hTime.textContent = JeepEngine.fmtTime(t);
      }
    }
    if (this.el.hBest) this.el.hBest.textContent = this.bestLap ? JeepEngine.fmtTime(this.bestLap) : "—";
    const yaw = this.onFoot ? this.foot.yaw : v.yaw;
    let deg = ((-yaw * 180) / Math.PI + 180) % 360;
    if (deg < 0) deg += 360;
    if (this.el.compass) this.el.compass.textContent = `${DIRS[Math.round(deg / 45) % 8]} · ${Math.round(deg)}°`;
    if (this.el.warn) this.el.warn.classList.toggle("show", !foot && v.overturnT > 1.4);
    this.updateWeaponHud();
    this.updatePrompt();
  }

  private toggleHeadlights(): void {
    this.headlightsOn = !this.headlightsOn;
    for (const l of this.headlights) l.intensity = this.headlightsOn ? 115 : 0;
    for (const m of this.headlampMeshes) (m.material as THREE.MeshStandardMaterial).emissiveIntensity = this.headlightsOn ? 2.6 : 0.15;
    for (const m of this.roofLamps) (m.material as THREE.MeshStandardMaterial).emissiveIntensity = this.headlightsOn ? 2.2 : 0.12;
    if (this.el.hLamp) this.el.hLamp.textContent = this.headlightsOn ? "On" : "Off";
    if (this.el.hLampDot) this.el.hLampDot.classList.toggle("on", this.headlightsOn);
    this.notify(this.headlightsOn ? "Headlights on" : "Headlights off");
  }

  /* =====================================================================
     LIFECYCLE
     ===================================================================== */

  /** Progressive world build; reports progress to the shell. */
  async build(): Promise<void> {
    const step = async (pct: number, label: string) => {
      this.onProgress?.(pct, label);
      await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      if (this.destroyed) throw new Error("build cancelled");
    };

    this.root = document.createElement("div");
    this.root.className = "jj-root";
    this.styleEl = document.createElement("style");
    this.styleEl.textContent = HUD_CSS;
    this.root.appendChild(this.styleEl);
    this.container.appendChild(this.root);

    await step(6, "Creating renderer…");
    this.initRenderer();
    await initPhysics(); // Rapier WASM
    if (this.destroyed) throw new Error("build cancelled");
    this.pw = new PhysicsWorld(GRAVITY);
    this.propStream = new PropStreamer(this.pw);
    await step(18, "Shaping jungle terrain…");
    this.buildTerrain();
    if (this.heightGrid) this.terrainStream = new TerrainStreamer(this.pw, this.heightGrid, 32, 1);
    await step(38, "Carving the stream…");
    this.buildWater();
    this.buildBridge();
    await step(43, "Fetching CC0 jungle props…");
    this.props = await loadJeepProps();
    await step(48, "Planting the jungle…");
    this.buildJungle();
    await step(62, "Laying the jungle railway…");
    await this.buildRailway();
    await step(76, "Raising Port Marin…");
    await this.buildCity();
    await step(82, "Placing trail markers…");
    this.buildSigns();
    this.buildLogs(mulberry(99));
    await step(86, "Painting the light…");
    this.buildLightShafts();
    this.buildFireflies();
    await step(88, "Releasing the wildlife…");
    await this.buildAnimals();
    await step(88, "Assembling the jeep…");
    this.buildJeep();
    await step(92, "Waking the explorer…");
    this.explorer = await loadJungleCharacter(this.skin);
    this.gunModels = await loadAllGunModels();
    if (this.explorer) {
      this.scene!.add(this.explorer.root);
      this.explorer.root.visible = false;
      this.onFoot = true; // the session opens on foot — open world
    }
    await step(96, "Warming up particles…");
    this.initParticles();
    void this.initDebris();
    this.buildHud();
    this.resetVehicle(Math.floor(SAMPLES * 0.01));
    if (this.vehicleId) void this.setVehicle(this.vehicleId);
    this.v.lap = 0;
    this.v.prevT = 0.01;
    this.setCameraMode(0);
    // Dev/tooling hook: spawn straight into Port Marin (?warp=road|crossing|city|aerial)
    const warp = this.readWarpParam();
    if (warp) {
      this.onFoot = false;
      if (this.explorer) this.explorer.root.visible = false;
      this.applyWarp(warp);
      if (warp === "aerial") {
        this.setCameraMode(2);
        this.camState.orbitPitch = 1.15;
        this.camState.orbitDist = 85;
        this.camState.orbitYaw = 0.6;
      }
    }
    // Frame the opening shot: behind the explorer on foot, else behind the jeep.
    if (this.onFoot) {
      this.spawnExplorerBesideCar();
      const fc = this.footCam;
      const cp = Math.cos(fc.pitch);
      this.camV1.set(Math.sin(fc.yaw) * cp * fc.dist, 1.5 + Math.sin(fc.pitch) * fc.dist, Math.cos(fc.yaw) * cp * fc.dist);
      this.camV1.add(this.foot.pos);
      this.safeAboveTerrain(this.camV1, 0.4);
      this.camState.pos.copy(this.camV1);
      this.camV2.set(this.foot.pos.x, this.foot.pos.y + 1.45, this.foot.pos.z);
      this.camState.look.copy(this.camV2);
    } else {
      const yq = this.camQ.setFromEuler(this.camE.set(0, this.v.yaw, 0, "YXZ"));
      this.camV1.set(0, 2.9, 8.2).applyQuaternion(yq).add(this.v.pos);
      this.safeAboveTerrain(this.camV1, 1.4);
      this.camState.pos.copy(this.camV1);
      this.camV2.copy(this.v.pos);
      this.camV2.y += 0.85;
      this.camState.look.copy(this.camV2);
    }
    if (this.camera) {
      this.camera.position.copy(this.camState.pos);
      this.camera.lookAt(this.camState.look);
    }
    // one warm-up render to compile shaders
    if (this.composer && this.renderer && this.camera) this.composer.render();
    else if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera);
    this.onProgress?.(100, "Ready.");
    this.onReady?.();
  }

  /**
   * Load the Quaternius animal packs and release the population. Loading is
   * optional at runtime: a failed pack just means fewer (or no) animals —
   * the drive never breaks.
   */
  /**
   * Chip the jeep's health. At zero the jeep is wrecked: inputs lock, smoke
   * pours out, and after a beat it recovers on the trail with partial health.
   */
  private damageJeep(amount: number): void {
    if (this.wreckT > 0) return;
    this.jeepHealth = Math.max(0, this.jeepHealth - amount);
    if (this.jeepHealth <= 0) {
      this.wreckT = 3.4;
      this.slowmoT = 0.3;
      this.camState.trauma = 1;
      this.audio.thud(1.4);
      this.input.rumble(1, 900);
      this.notify("WRECKED!");
      // fireball-ish burst over the bonnet
      const rp = this.renderPos;
      const sy = Math.sin(this.v.yaw);
      const cy = Math.cos(this.v.yaw);
      for (let i = 0; i < 46; i++) {
        this.spawnParticle(
          rp.x - sy * 1.4, rp.y + 0.9, rp.z - cy * 1.4,
          (Math.random() - 0.5) * 7,
          2 + Math.random() * 8,
          (Math.random() - 0.5) * 7,
          Math.random() < 0.55 ? "#ff8a3c" : "#2b2b2b",
          0.3 + Math.random() * 0.25, 0.15, 0.7 + Math.random() * 0.6,
        );
      }
    }
  }

  /**
   * Raise Port Marin: load the two Kenney City Kits and instance the town
   * (streets, houses, yards, street furniture) onto the shelf the terrain
   * carve prepared. Buildings register streamed box colliders, so the jeep
   * — and the wildlife — bounce off the architecture. A failed pack load
   * leaves a bare but fully drivable shelf and road bed.
   */
  private async buildCity(): Promise<void> {
    const scene = this.scene;
    if (!scene || this.destroyed) return;
    const host: CityHost = {
      scene,
      addSolid: (x, z, hx, hy, hz, rotY) => {
        const y0 = this.groundHeight(x, z);
        this.propStream?.add({ shape: { kind: "box", hx, hy, hz }, x, y: y0 + hy, z, rotY, e: 0.12 });
        this.colliders.push({ x, z, r: Math.hypot(hx, hz) });
      },
    };
    const system = new CitySystem(this.city);
    await system.load();
    if (this.destroyed) {
      system.destroy();
      return;
    }
    system.spawn(host);
    this.citySystem = system;
  }

  /**
   * Lay the Jungle Express: instanced track on the carved bed + the consist
   * that runs the loop forever. Cars get kinematic Rapier boxes (managed
   * through the host) so the jeep — and Rapier's contact events — treat the
   * train as solid. A failed asset load degrades to a bare railway bed.
   */
  private async buildRailway(): Promise<void> {
    const scene = this.scene;
    if (!scene || this.destroyed) return;
    const host: TrainHost = {
      scene,
      rail: this.rail,
      crossings: this.railCrossings,
      puff: (x, y, z, vx, vy, vz, color, size, life) =>
        this.spawnParticle(x, y, z, vx, vy, vz, color, size, size * 3.2, life),
      whistle: (g) => this.audio.trainWhistle(g),
      onRam: (closing, nx, nz) => this.trainRam(closing, nx, nz),
      addBox: (id, hx, hy, hz) => {
        if (!this.pw) return;
        const body = this.pw.world.createRigidBody(
          RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -500, 0),
        );
        this.pw.world.createCollider(
          RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.35).setRestitution(0.3),
          body,
        );
        this.trainBodies.set(id, body);
      },
      moveBox: (id, x, y, z, qx, qy, qz, qw) => {
        const body = this.trainBodies.get(id);
        if (!body) return;
        body.setNextKinematicTranslation({ x, y, z });
        body.setNextKinematicRotation({ x: qx, y: qy, z: qz, w: qw });
      },
      removeBox: (id) => {
        const body = this.trainBodies.get(id);
        if (body) {
          this.pw?.world.removeRigidBody(body);
          this.trainBodies.delete(id);
        }
      },
      camRight: (out) =>
        this.camera ? out.setFromMatrixColumn(this.camera.matrixWorld, 0) : out.set(1, 0, 0),
    };
    const system = new TrainSystem(host);
    await system.load((k) => {
      if (!this.destroyed) this.onProgress?.(62 + k * 8, "Laying the jungle railway…");
    });
    if (this.destroyed) {
      system.destroy();
      return;
    }
    system.spawn();
    this.trains = system;
  }

  /** The Express made contact — the arcade sting on top of Rapier's bounce. */
  private trainRam(closing: number, nx: number, nz: number): void {
    this.slowmoT = Math.max(this.slowmoT, 0.15);
    this.camState.trauma = 1;
    if (this.onFoot) {
      // a train vs a person: huge knockback, likely a knockout
      this.hurtPlayer(Math.round(clamp(closing * 1.7, 30, 60)), nx, nz);
      this.foot.vx += nx * 13;
      this.foot.vz += nz * 13;
    } else {
      this.damageJeep(clamp(closing * 1.5, 16, 36));
      this.audio.thud(1.5);
      this.input.rumble(1, 700);
      // shove the jeep clear of the rails in its own lateral frame
      const cy = Math.cos(this.v.yaw);
      const sy = Math.sin(this.v.yaw);
      this.v.lateral = clamp(this.v.lateral + (nx * cy + nz * -sy) * 5, -7, 7);
    }
    this.notify("THE JUNGLE EXPRESS!");
  }

  private async buildAnimals(): Promise<void> {
    const host: AnimalHost = {
      scene: this.scene!,
      terrainHeight: (x, z) => this.terrainHeight(x, z),
      trailDist: (x, z) => this.trailInfo(x, z).dist,
      waterDist: (x, z) => this.waterDist(x, z),
      waterSpawnPoint: (r) => {
        const bodies: { x: number; z: number; r: number }[] = [
          { x: this.stream.c.x, z: this.stream.c.z, r: this.stream.r },
          ...this.ponds,
        ];
        const b = bodies[Math.floor(r() * bodies.length)];
        const ang = r() * Math.PI * 2;
        const d = b.r + 2 + r() * 26;
        return { x: b.x + Math.cos(ang) * d, z: b.z + Math.sin(ang) * d };
      },
      trailSpawnPoint: (r, offMin, offMax) => {
        const pts = this.trailPts;
        const i = Math.floor(r() * pts.length);
        const p = pts[i];
        const q = pts[(i + 1) % pts.length];
        let tx = q.x - p.x;
        let tz = q.z - p.z;
        const l = Math.hypot(tx, tz) || 1;
        tx /= l;
        tz /= l;
        const off = offMin + r() * (offMax - offMin);
        const side = r() < 0.5 ? -1 : 1;
        // normal of the tangent
        return { x: p.x - tz * off * side, z: p.z + tx * off * side };
      },
      blocked: (x, z, r) => {
        if (this.rail.dist(x, z) < r + 4.2) return true; // never on the railway
        for (const c of this.colliders) {
          const dx = x - c.x;
          const dz = z - c.z;
          const rr = c.r + r;
          if (dx * dx + dz * dz < rr * rr) return true;
        }
        return false;
      },
      burst: (x, y, z, n, color, spread, size) => {
        for (let i = 0; i < n; i++) {
          this.spawnParticle(
            x, y, z,
            (Math.random() - 0.5) * spread,
            Math.random() * spread * 0.7 + 0.6,
            (Math.random() - 0.5) * spread,
            color, size, size * 0.25, 0.45 + Math.random() * 0.5,
          );
        }
      },
      onKill: (name, points) => {
        this.kills++;
        if (this.el.hKills) this.el.hKills.textContent = String(this.kills);
        this.notify(`${name} down! +${points}`);
      },
      onHeavyImpact: (approach) => {
        // heavy vehicles tank animal strikes; light ones get wrecked
        const massSoak = clamp(1.15 - 0.35 * (this.perf.mass - 1), 0.4, 1.3);
        this.damageJeep(clamp(approach / 46, 0.18, 0.55) * 32 * massSoak);
        this.slowmoT = 0.12;
        this.camState.trauma = Math.min(1, this.camState.trauma + 0.55);
        this.audio.thud(0.9);
        this.input.rumble(clamp(0.45 + approach / 46, 0.45, 1), 340);
      },
      onJeepImpact: (keep) => {
        this.v.speed *= keep;
      },
      onAnimalAttack: (dmg, keep, nx, nz) => {
        this.damageJeep(dmg);
        this.v.speed *= keep;
        // shove the jeep sideways in its own local frame
        const cy = Math.cos(this.v.yaw);
        const sy = Math.sin(this.v.yaw);
        this.v.lateral = clamp(this.v.lateral + (nx * cy + nz * -sy) * (2.5 + dmg * 0.12), -3.2, 3.2);
        this.camState.trauma = Math.min(1, this.camState.trauma + 0.3);
        this.audio.thud(0.7);
        this.input.rumble(0.7, 240);
      },
      onAnimalAttackFoot: (dmg, nx, nz) => this.hurtPlayer(dmg, nx, nz),
      thump: (s) => this.audio.thump(s),
      rumble: (m, ms) => {
        const h = animalHitRumble(m, ms);
        this.input.rumble(h.strength, h.ms);
      },
      camRight: (out) =>
        this.camera ? out.setFromMatrixColumn(this.camera.matrixWorld, 0) : out.set(1, 0, 0),
    };
    const sys = new AnimalSystem(host);
    await sys.load((k) => {
      if (!this.destroyed) this.onProgress?.(80 + k * 8, "Releasing the wildlife…");
    });
    sys.spawnAll();
    this.animals = sys;
  }

  start(): void {
    if (this.started || this.destroyed) return;
    this.started = true;
    this.input.consumeActions(); // drop anything queued before gameplay began
    this.root?.querySelector(".jj-hud")?.classList.add("on");
    this.setTip();
    this.el.tip?.classList.add("show");
    window.setTimeout(() => this.el.tip?.classList.remove("show"), 9000);
    // open world: no countdown, no forced objective. The loop clock arms the
    // first time the start gate is crossed — laps stay optional.
    this.lapStartT = -1;
    this.lapTimes = [];
    this.notify(this.onFoot ? "Explore — your jeep is waiting" : "Free roam — the jungle is yours");
    this.loadBestLap();
    this.lastT = performance.now();
    cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(this.animate); // loop first…
    this.audio.start(); // …audio failures can never break gameplay
    this.audio.loadFiles(); // CC0 ambience + impacts stream in async
  }

  get isPaused(): boolean {
    return this.paused;
  }

  togglePause(): void {
    if (this.paused) this.resume();
    else this.pause();
  }

  pause(): void {
    if (!this.started || this.paused || this.destroyed) return;
    this.paused = true;
    this.mouseFire = this.mouseAim = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.audio.suspend();
    this.onPauseChange?.(true);
  }

  resume(): void {
    if (!this.paused || this.destroyed) return;
    this.paused = false;
    this.audio.resume();
    this.lastT = performance.now();
    this.onPauseChange?.(false);
  }

  private animate = (now: number): void => {
    if (this.destroyed) return;
    this.rafId = requestAnimationFrame(this.animate);
    let dt = (now - this.lastT) / 1000;
    this.lastT = now;
    if (!isFinite(dt)) dt = 0.016;
    dt = clamp(dt, 0.0005, 0.05);
    if (this.paused || document.hidden) return;

    // hit-stop (game-feel): big impacts briefly slow time; input stays live
    if (this.slowmoT > 0) {
      this.slowmoT -= dt;
      dt *= 0.3;
    }
    this.time += dt;

    // ---- input ----
    const snap = this.input.sample();
    this.lastMove.x = snap.moveX;
    this.lastMove.y = snap.moveY;
    this.audio.setFootMode(this.onFoot);
    const locked = this.countdownT > 0 || this.wreckT > 0 || this.onFoot;
    this.v.throttle = locked ? 0 : snap.throttle;
    this.v.brake = locked ? 0 : snap.brake;
    this.v.steerTarget = locked ? 0 : snap.steer;
    this.v.handbrake = locked ? false : snap.handbrake;
    // wrecked: heavy smoke while dead in the water, then recover at 65%
    if (this.wreckT > 0) {
      this.wreckT -= dt;
      if (Math.random() < 0.6) {
        const sy = Math.sin(this.v.yaw);
        const cy = Math.cos(this.v.yaw);
        this.spawnParticle(
          this.renderPos.x - sy * 1.4, this.renderPos.y + 1.0, this.renderPos.z - cy * 1.4,
          (Math.random() - 0.5) * 0.5,
          1.6 + Math.random() * 1.2,
          (Math.random() - 0.5) * 0.5,
          Math.random() < 0.3 ? "#ff6a2c" : "#222222",
          0.35, 1.6, 1.5,
        );
      }
      if (this.wreckT <= 0) {
        this.resetVehicle();
        this.jeepHealth = 65;
        this.notify("Recovered — 65% health");
      }
    }
    this.applyStickLook(snap, dt);
    const stickLooking = Math.abs(snap.lookX) > 0.1 || Math.abs(snap.lookY) > 0.1;
    for (const action of this.input.consumeActions()) {
      switch (action) {
        case "camera":
          if (this.onFoot) {
            const f = this.foot;
            if (f.downT <= 0 && f.act !== "roll" && !this.riding) {
              f.crouch = !f.crouch;
              this.notify(f.crouch ? "Crouching — animals notice you less" : "Standing");
            }
          } else this.setCameraMode(this.camMode + 1);
          break;
        case "punch":
        case "kick":
        case "roll":
          if (this.onFoot) this.startAction(action);
          break;
        case "special":
          if (this.riding) this.mountSpecial();
          break;
        case "reload":
          if (this.onFoot && this.armory.gun) this.reloadGun();
          break;
        case "weaponNext":
          if (this.onFoot) this.switchWeapon(-1);
          break;
        case "weapon0":
        case "weapon1":
        case "weapon2":
        case "weapon3":
        case "weapon4":
        case "weapon5":
          if (this.onFoot) this.switchWeapon(Number(action.slice(6)));
          break;
        case "undercam":
          if (!this.onFoot) this.setCameraMode(MODES.indexOf("under"));
          break;
        case "enter":
          if (this.onFoot) this.tryEnterOrMount();
          else this.tryExitCar();
          break;
        case "headlights":
          if (!this.onFoot) this.toggleHeadlights();
          else this.switchWeapon(-1); // dpad ↓ on foot cycles weapons
          break;
        case "horn":
          if (!this.onFoot) {
            this.audio.horn();
            this.notify("BEEP BEEP!");
          } else if (this.riding) this.mountCall();
          break;
        case "reset":
          if (this.onFoot && this.armory.gun) this.reloadGun(); // R reloads with a gun out; holster (0) to warp
          else this.resetVehicle();
          break;
        case "pause": this.pause(); break;
        case "mute": {
          const m = this.audio.toggle();
          this.notify(m ? "Audio muted" : "Audio on");
          break;
        }
      }
    }

    // ---- countdown 3-2-1-GO (drive inputs locked) ----
    if (this.countdownT > 0) {
      const before = Math.ceil(this.countdownT);
      this.countdownT -= dt;
      const after = Math.ceil(Math.max(0, this.countdownT));
      if (after < before) this.showCount(after);
      if (this.countdownT <= 0) this.lapStartT = this.time;
    }

    // auto-recover after sitting overturned (the warn shows at 1.4s)
    if (this.v.overturnT > 3.2) {
      this.resetVehicle();
      this.notify("Auto-recovered");
    }

    // ---- fixed-step simulation, render interpolation (physics-tuning) ----
    this.acc += dt;
    let steps = 0;
    while (this.acc >= JeepEngine.FIXED_DT && steps < JeepEngine.MAX_SUBSTEPS) {
      this.prevPos.copy(this.v.pos);
      this.prevQuat.copy(this.physQuat);
      this.updateVehicle(JeepEngine.FIXED_DT);
      this.currPos.copy(this.v.pos);
      this.currQuat.copy(this.physQuat);
      this.acc -= JeepEngine.FIXED_DT;
      steps++;
    }
    if (steps === JeepEngine.MAX_SUBSTEPS) this.acc = 0; // drop backlog after a stall
    const alpha = clamp(this.acc / JeepEngine.FIXED_DT, 0, 1);
    this.renderPos.lerpVectors(this.prevPos, this.currPos, alpha);
    if (this.jeep) {
      this.jeep.position.copy(this.renderPos);
      this.jeep.quaternion.slerpQuaternions(this.prevQuat, this.currQuat, alpha).multiply(this.cosQuat);
    }

    // wildlife brains + ragdolls (reads the interpolated jeep transform)
    // — they react to whoever the player *is*: the explorer on foot, else the jeep
    if (this.riding && this.explorer && this.animals) {
      // the mount is the vehicle now: it can ram other animals with its own mass
      const mi = this.animals.rideInfo(this.riding);
      this.rideVec.set(mi.x, mi.y, mi.z);
      this.animals.update(dt, {
        pos: this.rideVec,
        speed: mi.speed,
        lateral: 0,
        yaw: mi.yaw,
        radius: this.rideRadius,
        onFoot: true,
        stealth: 1,
        mountMass: mi.mass,
      });
    } else if (this.onFoot && this.explorer) {
      this.animals?.update(dt, {
        pos: this.foot.pos,
        speed: Math.hypot(this.foot.vx, this.foot.vz),
        lateral: 0,
        yaw: this.foot.yaw,
        radius: PLAYER_RADIUS,
        onFoot: true,
        stealth: this.foot.stealth,
      });
    } else {
      this.animals?.update(dt, {
        pos: this.renderPos,
        speed: this.v.speed,
        lateral: this.v.lateral,
        yaw: this.v.yaw,
        radius: this.carR,
      });
    }

    // on-foot explorer (open world): walk, collide, animate
    if (this.onFoot && this.explorer) this.updateExplorer(dt, snap);

    // the Jungle Express: circles the jungle forever and reacts to whoever
    // the player currently is (mount, explorer on foot, or the jeep)
    this.trains?.update(
      dt,
      this.riding ? this.rideVec : this.onFoot && this.explorer ? this.foot.pos : this.renderPos,
    );
    this.audio.setTrainState(this.trains ? this.trains.sound : null);

    // trauma decays in real time so shake always settles (game-feel)
    this.camState.trauma = Math.max(0, this.camState.trauma - 1.5 * dt);

    if (!stickLooking && !this.dragging) this.relaxLook(dt);
    this.updateCamera(dt);
    this.emitWheelFX(dt);
    this.emitExhaust(dt);
    this.updateParticles(dt);
    this.updateTracers(dt);
    this.updateDebris(dt);
    this.audio.setState({
      rpm: this.v.rpm,
      throttle: this.v.throttle,
      brake: this.v.brake,
      speed: this.v.speed,
      maxSpeed: MAX_SPEED,
      surface: this.v.surface,
      handbrake: this.v.handbrake,
      lateral: this.v.lateral,
      bumpImpulse: this.v.bumpImpulse,
    });
    // adaptive music: intensity follows how hard you're driving
    this.audio.setIntensity(
      clamp((Math.abs(this.v.speed) / MAX_SPEED) * 0.75 + this.v.throttle * 0.35, 0, 1),
    );
    this.audio.update();
    this.updateUI(dt);
    this.updateAtmosphere(dt);

    // wind on vegetation
    for (const mat of this.windMats) {
      const u = (mat.userData as { uTime?: { value: number } }).uTime;
      if (u) u.value = this.time;
    }
    if (this.sky) {
      const mat = this.sky.material as THREE.ShaderMaterial;
      mat.uniforms.uTime.value = this.time;
      this.sky.position.set(this.camera!.position.x, 0, this.camera!.position.z);
    }
    if (this.waterMat) this.waterMat.uniforms.uTime.value = this.time;

    // sun follows whoever holds the camera (car or explorer) so the shadow
    // map stays tight
    const focusX = this.onFoot ? this.foot.pos.x : this.renderPos.x;
    const focusY = this.onFoot ? this.foot.pos.y : this.renderPos.y;
    const focusZ = this.onFoot ? this.foot.pos.z : this.renderPos.z;
    if (this.sunLight) {
      this.sunLight.position.set(focusX + 95, focusY + 105, focusZ - 72);
      this.sunLight.target.position.set(focusX, focusY, focusZ);
      this.sunLight.target.updateMatrixWorld();
    }

    if (this.composer) this.composer.render();
    else if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera);
  };

  private onResize = (): void => {
    if (!this.renderer || !this.camera) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.Q.pixelRatio));
    this.composer?.setSize(window.innerWidth, window.innerHeight);
    this.composer?.setPixelRatio(Math.min(window.devicePixelRatio, this.Q.pixelRatio));
  };

  /** Keyboard pause/resume — must work while paused, unlike pad actions. */
  private onPauseKey = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    if ((k === "p" || k === "escape") && this.started) this.togglePause();
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (!this.container.contains(e.target as Node)) return;
    this.clickStart = { x: e.clientX, y: e.clientY, t: performance.now(), button: e.button };
    this.lockClick = false;
    if (this.onFoot && this.started && !this.paused && this.input.touchActive === false) {
      if (!document.pointerLockElement) {
        // like GTA on PC: the first click grabs the mouse so the view follows it — not also a shot
        this.lockClick = true;
        void this.root?.requestPointerLock?.();
        return;
      }
      if (this.armory.gun && !this.riding) {
        if (e.button === 0) this.mouseFire = true;
        if (e.button === 2) this.mouseAim = true;
      }
    }
    if (e.button === 2) return; // right button is the kick, never a camera drag
    this.dragging = true;
    this.lastDragX = e.clientX;
    this.lastDragY = e.clientY;
  };
  private onMouseUp = (e: MouseEvent): void => {
    this.dragging = false;
    if (e.button === 0) this.mouseFire = false;
    if (e.button === 2) this.mouseAim = false;
    if ((this.armory.gun && !this.riding) || this.lockClick) return; // clicks are shots / the mouse-capture click, not punches
    // on foot: a quick, still click punches; right-click kicks (GTA-style)
    if (!this.onFoot || !this.started || this.paused) return;
    const c = this.clickStart;
    if (e.button !== c.button || !this.container.contains(e.target as Node)) return;
    if ((e.target as HTMLElement).closest?.(".jj-tbtn")) return;
    const still = Math.hypot(e.clientX - c.x, e.clientY - c.y) < 6;
    if (c.button === 2 || (c.button === 0 && still && performance.now() - c.t < 280)) {
      this.input.pushAction(this.riding ? "special" : c.button === 2 ? "kick" : "punch");
    }
  };
  private onContextMenu = (e: MouseEvent): void => {
    if (this.onFoot && this.container.contains(e.target as Node)) e.preventDefault();
  };
  private onMouseMove = (e: MouseEvent): void => {
    if (document.pointerLockElement && this.onFoot && this.started && !this.paused) {
      // captured pointer: raw deltas, scaled down while zoomed so a scope stays steady
      const z = (this.camera ? clamp(this.camera.fov / 58, 0.25, 1) : 1) * (1 - 0.3 * this.aimK);
      this.footCam.yaw -= e.movementX * 0.0034 * z;
      this.footCam.pitch = clamp(this.footCam.pitch + e.movementY * 0.003 * z, -0.32, 0.95);
      return;
    }
    if (!this.dragging || !this.started) return;
    const dx = (e.clientX - this.lastDragX) / window.innerWidth;
    const dy = (e.clientY - this.lastDragY) / window.innerHeight;
    this.lastDragX = e.clientX;
    this.lastDragY = e.clientY;
    if (this.onFoot) {
      this.footCam.yaw -= dx * 4.2;
      this.footCam.pitch = clamp(this.footCam.pitch + dy * 3.0, -0.32, 0.95);
      return;
    }
    const cs = this.camState;
    const mode = MODES[this.camMode];
    if (mode === "orbit") {
      cs.orbitYaw -= dx * 4.2;
      cs.orbitPitch = clamp(cs.orbitPitch + dy * 3.0, -0.25, 1.15);
    } else if (mode === "cockpit") {
      cs.yawOff = clamp(cs.yawOff - dx * 3.2, -0.85, 0.85);
      cs.pitchOff = clamp(cs.pitchOff - dy * 2.4, -0.5, 0.5);
    } else if (mode === "chase") {
      cs.yawOff = clamp(cs.yawOff - dx * 3.2, -1.0, 1.0);
    }
  };
  private onWheel = (e: WheelEvent): void => {
    if (!this.started) return;
    if (!this.container.contains(e.target as Node)) return;
    const cs = this.camState;
    if (this.onFoot) {
      if (this.armory.gun && !this.riding && Math.abs(e.deltaY) > 4) {
        // gun out: the wheel changes weapon (zoom the camera with the wheel while holstered)
        const now = performance.now();
        if (now - this.lastWheel > 180) {
          this.lastWheel = now;
          this.armory.cycle(e.deltaY > 0 ? 1 : -1);
          this.prevFire = true;
          this.onWeaponChanged();
        }
        return;
      }
      this.footCam.dist = clamp(this.footCam.dist + e.deltaY * 0.006, 2.2, 10);
      return;
    }
    const mode = MODES[this.camMode];
    if (mode === "chase") cs.targetDist = clamp(cs.targetDist + e.deltaY * 0.006, 4.2, 16);
    else if (mode === "orbit") cs.orbitDist = clamp(cs.orbitDist + e.deltaY * 0.006, 3.4, 16);
  };
  private onVisibility = (): void => {
    if (document.hidden) {
      this.audio.suspend();
    } else if (this.started && !this.paused) {
      this.audio.resume();
      this.lastT = performance.now();
    }
  };

  /** Attach global listeners (called once, after build). */
  attach(): void {
    this.input.attach();
    window.addEventListener("keydown", this.onPauseKey);
    window.addEventListener("resize", this.onResize);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("wheel", this.onWheel, { passive: true });
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener("keydown", this.onPauseKey);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("contextmenu", this.onContextMenu);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("wheel", this.onWheel);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.input.detach();
    this.animals?.destroy();
    this.animals = null;
    this.citySystem?.destroy();
    this.citySystem = null;
    this.trains?.destroy();
    this.trains = null;
    this.mouseFire = this.mouseAim = false;
    if (document.pointerLockElement) document.exitPointerLock();
    for (const t of this.tracers) {
      this.scene?.remove(t.mesh);
      (t.mesh.material as THREE.Material).dispose();
    }
    this.tracers = [];
    this.tracerGeo.dispose();
    this.explorer?.dispose();
    this.explorer = null;
    this.rig = null;
    this.terrainStream = null;
    this.propStream = null;
    this.pw?.dispose();
    this.pw = null;
    this.audio.dispose();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = null;
    this.composer = null;
    this.scene?.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
    this.root?.remove();
    this.root = null;
    this.el = {};
  }
}
