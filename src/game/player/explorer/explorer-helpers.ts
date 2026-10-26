import * as THREE from "three";
import { makeEngine, type TestEngine } from "../../core/engine-harness";
import type { JeepInputSnapshot } from "../../core/input";
import type { JungleCharacter } from "../character";

export const snap = (over: Partial<JeepInputSnapshot> = {}): JeepInputSnapshot => ({
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  moveX: 0,
  moveY: 0,
  jump: false,
  sprint: false,
  sprintHard: false,
  fire: false,
  aim: false,
  lookX: 0,
  lookY: 0,
  padConnected: false,
  padId: "",
  ...over,
});

export interface FakeExplorer extends JungleCharacter {
  lastGait: number;
  jumps: number;
  lastSpeed: number;
  action: string | null;
  crouch: number;
}

function fakeExplorer(): FakeExplorer {
  const ex = {
    root: new THREE.Group(),
    lastGait: -1,
    jumps: 0,
    lastSpeed: 0,
    action: null as string | null,
    crouch: 0,
    setSpeed(mps: number): void {
      ex.lastSpeed = mps;
    },
    setAction(a: string | null): void {
      ex.action = a;
    },
    setCrouch(k: number): void {
      ex.crouch = k;
    },
    setDown(): void {},
    setSeated(): void {},
    setGun(): void {},
    setStance(): void {},
    kickGun(): void {},
    muzzleWorld: () => false,
    hipHeight: () => 0.6,
    async setSkin(): Promise<void> {},
    setGait(g: number): void {
      ex.lastGait = g;
    },
    jump(): void {
      ex.jumps++;
    },
    update(): void {},
    dispose(): void {},
  };
  return ex;
}

export async function walkingEngine(): Promise<{ e: TestEngine; ex: FakeExplorer }> {
  const e = await makeEngine();
  const ex = fakeExplorer();
  e.explorer = ex;
  e.onFoot = true;
  e.spawnExplorerBesideCar();
  return { e, ex };
}

export const distXZ = (a: THREE.Vector3, b: THREE.Vector3): number =>
  Math.hypot(a.x - b.x, a.z - b.z);

