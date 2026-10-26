import * as THREE from "three";
import { makeEngine, type TestEngine } from "../../core/engine-harness";
import type { JungleCharacter } from "../../player/character";
import type { JeepInputSnapshot } from "../../core/input";
import { GUNS } from "../weapons";

export const snap = (over: Partial<JeepInputSnapshot> = {}): JeepInputSnapshot => ({
  throttle: 0, brake: 0, steer: 0, handbrake: false, moveX: 0, moveY: 0, jump: false,
  sprint: false, sprintHard: false, fire: false, aim: false, lookX: 0, lookY: 0,
  padConnected: false, padId: "", ...over,
});

export interface Shot {
  o: number[];
  d: number[];
  maxT: number;
  dmg: number;
}

export async function armedEngine(): Promise<{ e: TestEngine; shots: Shot[]; calls: string[]; stance: number[] }> {
  const e = await makeEngine();
  const calls: string[] = [];
  const stance: number[] = [];
  const shots: Shot[] = [];
  const ex = {
    root: new THREE.Group(),
    setGait() {}, setSpeed() {}, setCrouch() {}, setDown() {}, setAction() {}, setSeated() {},
    setStance: (k: number, p: number) => stance.push(k, p),
    setGun: (g: unknown) => calls.push(g ? "gun" : "nogun"),
    kickGun: () => calls.push("kick"),
    muzzleWorld: (out: THREE.Vector3) => (out.set(0, 1.4, 0), true),
    hipHeight: () => 0.6,
    async setSkin() {}, jump() {}, update() {}, dispose() {},
  } as unknown as JungleCharacter;
  e.explorer = ex;
  e.gunModels = GUNS.map(() => ({ root: new THREE.Group(), muzzle: new THREE.Vector3(0, 0, 0.4), length: 0.5 }));
  e.onFoot = true;
  e.spawnExplorerBesideCar();
  e.camera = new THREE.PerspectiveCamera(60, 1.6, 0.1, 500);
  // behind the player, looking along -Z
  e.camera.position.set(e.foot.pos.x, e.foot.pos.y + 2, e.foot.pos.z + 4);
  e.camera.lookAt(e.foot.pos.x, e.foot.pos.y + 1.6, e.foot.pos.z - 50);
  e.camera.updateMatrixWorld(true);
  e.animals = {
    shoot: (ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, dmg: (t: number) => number) => {
      shots.push({ o: [ox, oy, oz], d: [dx, dy, dz], maxT, dmg: dmg(10) });
      return null;
    },
    findRideable: () => null,
    melee: () => ({ hits: 0, kills: 0, heavy: false }),
    nearestTarget: () => null,
  };
  e.audio = new Proxy({}, { get: (_t, k) => (...a: unknown[]) => { calls.push(String(k) + (a.length && typeof a[0] === "string" ? `:${a[0]}` : "")); } });
  return { e, shots, calls, stance };
}

export const run = (e: TestEngine, frames: number, s: Partial<JeepInputSnapshot> = {}): void => {
  for (let i = 0; i < frames; i++) e.updateExplorer(1 / 60, snap(s));
};
