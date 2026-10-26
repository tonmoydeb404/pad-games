/**
 * Shared fixtures for the wildlife tests: a Node shim that serves the real
 * GLBs from public/assets/jeep/animals, a spy host and a booted system.
 *
 * GLTFLoader runs fine under Node for these texture-free models (tiny shims
 * below); no WebGL is needed because AnimalSystem only fills the scene graph.
 */
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { AnimalSystem, type AnimalHost } from "./index";

if (typeof (globalThis as { self?: unknown }).self === "undefined") {
  (globalThis as { self?: unknown }).self = globalThis;
}

// Serve /assets/jeep/animals/*.glb straight from public/ — Node's undici
// rejects site-relative URLs, so patch Request (three builds one) and fetch.
const ROOT = path.resolve(__dirname, "../../../..");
const realFetch = globalThis.fetch.bind(globalThis);
// three's FileLoader reports download progress via ProgressEvent
(globalThis as { ProgressEvent?: unknown }).ProgressEvent = class {
  type: string;
  lengthComputable: boolean;
  loaded: number;
  total: number;
  constructor(type: string, init?: { lengthComputable?: boolean; loaded?: number; total?: number }) {
    this.type = type;
    this.lengthComputable = init?.lengthComputable ?? false;
    this.loaded = init?.loaded ?? 0;
    this.total = init?.total ?? 0;
  }
};
const RealRequest = globalThis.Request;
globalThis.Request = class extends RealRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    super(url.startsWith("/") ? `http://localhost${url}` : input as RequestInfo, init);
  }
} as typeof Request;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const pathname = new URL(raw, "http://localhost").pathname;
  if (pathname.startsWith("/assets/jeep/animals/")) {
    const body = fs.readFileSync(path.join(ROOT, "public", pathname));
    return new Response(body, { status: 200 });
  }
  return realFetch(input, init);
}) as typeof fetch;

export interface HostSpy {
  host: AnimalHost;
  kills: { name: string; points: number }[];
  heavyHits: number[];
  keeps: number[];
  attacks: { dmg: number; keep: number }[];
  footAttacks: { dmg: number; nx: number; nz: number }[];
  bursts: { n: number; color: number }[];
}

/** Flat jungle: trail runs down the |x|<80 corridor (kept empty so the test
 *  jeep's path is deterministic); the stream circle sits at (-142,160). */
export function makeHost(): HostSpy {
  const spy: HostSpy = {
    kills: [],
    heavyHits: [],
    keeps: [],
    attacks: [],
    footAttacks: [],
    bursts: [],
    host: null as unknown as AnimalHost,
  };
  spy.host = {
    scene: new THREE.Scene(),
    terrainHeight: () => 0,
    // |x| < 80 is the trail corridor (td 30 → inside the 10..55 corridor band),
    // outside is deep jungle (td 200 > 70)
    trailDist: (x) => (Math.abs(x) < 80 ? 30 : 200),
    waterDist: (x, z) => Math.hypot(x + 142, z - 160),
    waterSpawnPoint: (r) => {
      const ang = r() * Math.PI * 2;
      const d = 28 + r() * 26;
      return { x: -142 + Math.cos(ang) * d, z: 160 + Math.sin(ang) * d };
    },
    trailSpawnPoint: (r) => ({ x: (r() - 0.5) * 700, z: (r() - 0.5) * 700 }),
    blocked: () => false,
    burst: (_x, _y, _z, n, color) => {
      spy.bursts.push({ n, color });
    },
    onKill: (name, points) => spy.kills.push({ name, points }),
    onHeavyImpact: (approach) => spy.heavyHits.push(approach),
    onJeepImpact: (keep) => spy.keeps.push(keep),
    onAnimalAttack: (dmg, keep) => spy.attacks.push({ dmg, keep }),
    onAnimalAttackFoot: (dmg, nx, nz) => spy.footAttacks.push({ dmg, nx, nz }),
    camRight: (out) => out.set(1, 0, 0),
    thump: () => {},
    rumble: () => {},
  };
  return spy;
}

/** Jeep snapshot heading toward +z at the given speed (yaw = π). */
export const jeepAt = (x: number, z: number, speed: number) => ({
  pos: new THREE.Vector3(x, 0, z),
  speed,
  lateral: 0,
  yaw: Math.PI,
  radius: 1.3,
});

export const STEP = 1 / 60;

export async function booted() {
  const spy = makeHost();
  const sys = new AnimalSystem(spy.host);
  await sys.load();
  sys.spawnAll();
  return { spy, sys };
}

/** Explorer snapshot on foot, heading toward +z. */
export const explorerAt = (x: number, z: number, speed = 0) => ({
  pos: new THREE.Vector3(x, 0, z),
  speed,
  lateral: 0,
  yaw: Math.PI,
  radius: 0.45,
  onFoot: true,
  stealth: 1,
});

/** Settle the mount facing +z (so "ahead" is +z and "behind" is -z). */
export const faceSouth = (sys: AnimalSystem, h: object): void => {
  for (let i = 0; i < 150; i++) sys.rideStep(h, STEP, Math.PI, 0.05);
};
export const idleSnap = (x: number, z: number) => ({
  pos: new THREE.Vector3(x, 0, z), speed: 0, lateral: 0, yaw: 0, radius: 0.45, onFoot: true, stealth: 1,
});
