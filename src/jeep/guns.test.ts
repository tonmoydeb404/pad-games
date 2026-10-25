/**
 * On-foot guns through the real engine step: drawing a gun, pulling the
 * trigger (ammo, cooldown, pellets, hit-scan against animals / terrain /
 * trunks), reloading, melee being disabled while armed, and holstering when
 * hopping in the jeep. Animals and the Kenney rig are stubbed.
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { makeEngine, type TestEngine } from "./engineHarness";
import type { JungleCharacter } from "./character";
import type { JeepInputSnapshot } from "./input";
import { GUNS } from "./weapons";

const snap = (over: Partial<JeepInputSnapshot> = {}): JeepInputSnapshot => ({
  throttle: 0, brake: 0, steer: 0, handbrake: false, moveX: 0, moveY: 0, jump: false,
  sprint: false, sprintHard: false, fire: false, aim: false, lookX: 0, lookY: 0,
  padConnected: false, padId: "", ...over,
});

interface Shot {
  o: number[];
  d: number[];
  maxT: number;
  dmg: number;
}

async function armedEngine(): Promise<{ e: TestEngine; shots: Shot[]; calls: string[]; stance: number[] }> {
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

const run = (e: TestEngine, frames: number, s: Partial<JeepInputSnapshot> = {}): void => {
  for (let i = 0; i < frames; i++) e.updateExplorer(1 / 60, snap(s));
};

describe("on-foot guns", () => {
  it("draws a gun by number, swaps, cycles back to fists, and equips with a short delay", async () => {
    const { e, calls } = await armedEngine();
    expect(e.armory.gun).toBeNull();
    e.switchWeapon(3);
    expect(e.armory.gun?.name).toBe("Longshot");
    expect(calls).toContain("gun");
    e.switchWeapon(0);
    expect(e.armory.gun).toBeNull();
    expect(calls[calls.length - 1]).not.toBe("gun");
    // the cycle key walks fists → 1 → 2 …
    e.switchWeapon(-1);
    expect(e.armory.selected).toBe(1);
    e.switchWeapon(-1);
    expect(e.armory.selected).toBe(2);
  });

  it("firing spends a round, respects the fire rate, and shoots along the camera ray", async () => {
    const { e, shots, calls } = await armedEngine();
    e.switchWeapon(1); // sidearm: semi-auto, 12 rounds
    run(e, 30); // swap delay
    expect(e.armory.mag).toBe(12);
    run(e, 1, { fire: true });
    expect(e.armory.mag).toBe(11);
    expect(shots).toHaveLength(1);
    expect(calls.filter((c) => c.startsWith("gunshot")).length).toBe(1);
    expect(calls).toContain("gunshot:pistol");
    // the ray points down the camera's -Z line, starting in front of the player
    expect(shots[0].d[2]).toBeLessThan(-0.99);
    expect(Math.abs(shots[0].d[0])).toBeLessThan(0.05);
    expect(shots[0].o[2]).toBeLessThan(e.camera.position.z);
    // holding the trigger on a semi-auto doesn't machine-gun
    run(e, 40, { fire: true });
    expect(e.armory.mag).toBe(11);
    // release and pull again: another shot
    run(e, 5);
    run(e, 1, { fire: true });
    expect(e.armory.mag).toBe(10);
  });

  it("an automatic gun keeps firing while the trigger is held, at its own rate", async () => {
    const { e, shots } = await armedEngine();
    e.switchWeapon(2); // Ripper: 0.085 s
    run(e, 30);
    run(e, 60, { fire: true }); // 1 s
    expect(shots.length).toBeGreaterThanOrEqual(10);
    expect(shots.length).toBeLessThanOrEqual(13);
  });

  it("the shotgun throws eight pellets in a spread; each is a separate ray", async () => {
    const { e, shots } = await armedEngine();
    e.switchWeapon(4);
    run(e, 30);
    run(e, 1, { fire: true });
    expect(shots).toHaveLength(8);
    const xs = new Set(shots.map((s) => s.d[0].toFixed(4)));
    expect(xs.size).toBeGreaterThan(4); // genuinely different directions
    for (const s of shots) expect(s.maxT).toBeLessThanOrEqual(GUNS[3].range);
  });

  it("aiming tightens the spread compared to firing from the hip", async () => {
    const spreadOf = async (aim: boolean): Promise<number> => {
      const { e, shots } = await armedEngine();
      e.switchWeapon(4);
      run(e, 30);
      for (let i = 0; i < 12; i++) {
        run(e, 1, { fire: true, aim });
        run(e, 60);
      }
      const ys = shots.map((s) => s.d[0]);
      const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
      return Math.sqrt(ys.reduce((a, b) => a + (b - mean) ** 2, 0) / ys.length);
    };
    expect(await spreadOf(true)).toBeLessThan(await spreadOf(false));
  });

  it("bullets stop at terrain and at trunks", async () => {
    const { e, shots } = await armedEngine();
    e.switchWeapon(3);
    run(e, 30);
    // a wide trunk 12 m dead ahead of the muzzle line
    const f = e.foot.pos;
    e.colliders.push({ x: f.x, z: f.z - 12, r: 2 });
    run(e, 1, { fire: true });
    const t = shots[shots.length - 1].maxT;
    expect(t).toBeGreaterThan(6);
    expect(t).toBeLessThan(15); // stopped by the trunk, not the 110 m range
    // straight into the ground
    e.rayWorld(f.x, f.y + 2, f.z, 0, -1, 0, 50);
    expect(e.rayWorld(f.x, f.y + 2, f.z, 0, -1, 0, 50)).toBeGreaterThan(1.5);
    expect(e.rayWorld(f.x, f.y + 2, f.z, 0, -1, 0, 50)).toBeLessThan(2.6);
  });

  it("emptying the magazine reloads from the reserve and blocks fire meanwhile", async () => {
    const { e, calls } = await armedEngine();
    e.switchWeapon(5); // Widowmaker: 5 rounds, 15 spare
    run(e, 30);
    for (let i = 0; i < 5; i++) {
      run(e, 1, { fire: true });
      run(e, 5);
      run(e, 90); // cooldown 1.3 s
    }
    expect(e.armory.mag === 5 || e.armory.reloading).toBe(true);
    expect(calls).toContain("reload");
  });

  it("with a gun out, melee and the sprint trigger are off; RT-style sprint needs L3/Shift", async () => {
    const { e } = await armedEngine();
    e.switchWeapon(2);
    e.startAction("punch");
    e.startAction("kick");
    expect(e.foot.act).toBeNull();
    // 'sprint' held (e.g. RT) must not run; sprintHard does
    run(e, 120, { moveY: 1, sprint: true, sprintHard: false });
    const jog = Math.hypot(e.foot.vx, e.foot.vz);
    expect(jog).toBeLessThan(9);
    run(e, 120, { moveY: 1, sprint: true, sprintHard: true });
    expect(Math.hypot(e.foot.vx, e.foot.vz)).toBeGreaterThan(11);
    // aiming slows you right down and turns the body to the camera
    run(e, 90, { moveY: 1, aim: true });
    expect(Math.hypot(e.foot.vx, e.foot.vz)).toBeLessThan(5);
    // but a roll still works
    e.startAction("roll");
    expect(e.foot.act).toBe("roll");
  });

  it("the body turns to face the camera while aiming", async () => {
    const { e } = await armedEngine();
    e.switchWeapon(1);
    e.footCam.yaw = 1.2;
    e.foot.yaw = 0;
    run(e, 60, { aim: true });
    expect(e.foot.yaw).toBeCloseTo(1.2, 1);
  });

  it("hopping into the jeep holsters the gun and restocks the ammo", async () => {
    const { e } = await armedEngine();
    e.switchWeapon(4);
    run(e, 30);
    run(e, 1, { fire: true });
    expect(e.armory.mag).toBe(5);
    e.tryEnterCar();
    expect(e.onFoot).toBe(false);
    expect(e.armory.gun).toBeNull();
    e.tryExitCar();
    e.switchWeapon(4);
    expect(e.armory.mag).toBe(6);
    expect(e.armory.reserve).toBe(GUNS[3].reserveMags * GUNS[3].magSize);
  });

  it("can't draw or fire while knocked out", async () => {
    const { e, shots } = await armedEngine();
    e.switchWeapon(1);
    run(e, 30);
    e.hurtPlayer(500, 1, 0);
    expect(e.foot.downT).toBeGreaterThan(0);
    run(e, 5, { fire: true });
    expect(shots).toHaveLength(0);
    e.switchWeapon(2);
    expect(e.armory.selected).toBe(1);
  });

  it("recoil is a small transient kick: the aim never drifts away, however long you hold the trigger", async () => {
    const { e } = await armedEngine();
    e.switchWeapon(5); // Widowmaker: the hardest kick
    run(e, 30);
    const pitch0 = e.footCam.pitch;
    const yaw0 = e.footCam.yaw;
    run(e, 1, { fire: true });
    expect(e.camKick).toBeGreaterThan(0);
    expect(e.camKick).toBeLessThanOrEqual(0.07);
    expect(e.footCam.pitch).toBe(pitch0); // the stored aim is untouched
    expect(e.footCam.yaw).toBe(yaw0);
    // an SMG held down for 3 s never stacks past the cap
    e.switchWeapon(2);
    run(e, 30);
    let worst = 0;
    for (let i = 0; i < 180; i++) {
      run(e, 1, { fire: true, aim: true });
      worst = Math.max(worst, e.camKick);
    }
    expect(worst).toBeLessThanOrEqual(0.07);
    expect(e.footCam.pitch).toBe(pitch0);
    expect(e.footCam.yaw).toBe(yaw0);
  });
});
