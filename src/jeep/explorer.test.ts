/**
 * On-foot explorer (open world) — headless tests against the real engine
 * step: real terrain (HeightGrid), real prop colliders, real enter/exit state
 * machine. The Kenney mesh itself is stubbed; its loading path is exercised
 * by assets.test-style GLB checks and the browser.
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { makeEngine, type TestEngine } from "./engineHarness";
import type { JungleCharacter, SkinId } from "./character";
import type { JeepInputSnapshot } from "./input";

const snap = (over: Partial<JeepInputSnapshot> = {}): JeepInputSnapshot => ({
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

interface FakeExplorer extends JungleCharacter {
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

async function walkingEngine(): Promise<{ e: TestEngine; ex: FakeExplorer }> {
  const e = await makeEngine();
  const ex = fakeExplorer();
  e.explorer = ex;
  e.onFoot = true;
  e.spawnExplorerBesideCar();
  return { e, ex };
}

const distXZ = (a: THREE.Vector3, b: THREE.Vector3): number =>
  Math.hypot(a.x - b.x, a.z - b.z);

describe("on-foot explorer (open world)", () => {
  it("spawns at the driver's door, on the ground, within enter range", async () => {
    const { e } = await walkingEngine();
    const f = e.foot;
    expect(distXZ(f.pos, e.v.pos)).toBeLessThan(3.7);
    expect(f.pos.y).toBeCloseTo(e.groundHeight(f.pos.x, f.pos.z), 2);
    expect(f.grounded).toBe(true);
    expect(e.explorer.root.visible).toBe(true);
    expect(e.nearCar).toBe(true);
  });

  it("walks where the camera points and blends the gait", async () => {
    const { e, ex } = await walkingEngine();
    const start = e.foot.pos.clone();
    for (let i = 0; i < 120; i++) e.updateExplorer(1 / 60, snap({ moveY: 1 }));
    const f = e.foot;
    expect(distXZ(f.pos, start)).toBeGreaterThan(11); // GTA jog ≈ 7.6 u/s × 2 s
    expect(ex.lastGait).toBeGreaterThan(0.3);
    expect(f.grounded).toBe(true);
    // stays glued to the terrain, never sinks or floats
    expect(Math.abs(f.pos.y - e.groundHeight(f.pos.x, f.pos.z))).toBeLessThan(0.3);
  });

  it("sprints faster than it walks", async () => {
    const { e } = await walkingEngine();
    const a = e.foot.pos.clone();
    for (let i = 0; i < 120; i++) e.updateExplorer(1 / 60, snap({ moveY: 1 }));
    const walkD = distXZ(e.foot.pos, a);
    e.spawnExplorerBesideCar();
    const b = e.foot.pos.clone();
    for (let i = 0; i < 120; i++) e.updateExplorer(1 / 60, snap({ moveY: 1, sprint: true }));
    const runD = distXZ(e.foot.pos, b);
    expect(runD).toBeGreaterThan(walkD * 1.4);
  });

  it("is pushed out of trunks and boulders", async () => {
    const { e } = await walkingEngine();
    const f = e.foot;
    // a tree dead ahead of the walk direction
    const yaw = e.footCam.yaw;
    const tx = f.pos.x - Math.sin(yaw) * 3;
    const tz = f.pos.z - Math.cos(yaw) * 3;
    e.colliders.push({ x: tx, z: tz, r: 1 });
    // ~1.3 s of walking: enough to reach the trunk, not enough to round it
    for (let i = 0; i < 80; i++) e.updateExplorer(1 / 60, snap({ moveY: 1 }));
    const d = Math.hypot(f.pos.x - tx, f.pos.z - tz);
    expect(d).toBeGreaterThanOrEqual(1.7); // trunk r + foot radius + skin
    expect(d).toBeLessThan(3.4); // but the explorer got close — pressed against it
  });

  it("jumps, leaves the ground, and lands back on the terrain", async () => {
    const { e, ex } = await walkingEngine();
    const f = e.foot;
    const gh = () => e.groundHeight(f.pos.x, f.pos.z);
    e.updateExplorer(1 / 60, snap({ jump: true }));
    expect(ex.jumps).toBe(1);
    expect(f.grounded).toBe(false);
    expect(f.vy).toBeGreaterThan(4);
    for (let i = 0; i < 150; i++) e.updateExplorer(1 / 60, snap({}));
    expect(f.grounded).toBe(true);
    expect(f.pos.y).toBeCloseTo(gh(), 2);
    expect(ex.jumps).toBe(1); // no double-fire from a held button
  });

  it("hops in and out of the jeep — but not at speed", async () => {
    const { e } = await walkingEngine();
    // walk away first: entering out of range is refused
    for (let i = 0; i < 240; i++) e.updateExplorer(1 / 60, snap({ moveY: 1 }));
    expect(e.nearCar).toBe(false);
    e.tryEnterCar();
    expect(e.onFoot).toBe(true); // still outside
    // back to the car
    e.spawnExplorerBesideCar();
    e.tryEnterCar();
    expect(e.onFoot).toBe(false);
    expect(e.explorer.root.visible).toBe(false);
    // bailing at speed is refused
    e.v.speed = 30;
    e.tryExitCar();
    expect(e.onFoot).toBe(false);
    // parked exit puts you back at the door
    e.v.speed = 0;
    e.tryExitCar();
    expect(e.onFoot).toBe(true);
    expect(e.explorer.root.visible).toBe(true);
    expect(distXZ(e.foot.pos, e.v.pos)).toBeLessThan(3.7);
  });

  it("reset while on foot warps the explorer to the vehicle", async () => {
    const { e } = await walkingEngine();
    for (let i = 0; i < 300; i++) e.updateExplorer(1 / 60, snap({ moveY: 1 }));
    expect(distXZ(e.foot.pos, e.v.pos)).toBeGreaterThan(6);
    e.resetVehicle();
    expect(e.onFoot).toBe(true);
    expect(distXZ(e.foot.pos, e.v.pos)).toBeLessThan(3.7);
  });

  it("skins are known ids", async () => {
    const { SKINS } = await import("./character");
    const ids: SkinId[] = ["skaterMaleA", "skaterFemaleA", "criminalMaleA", "cyborgFemaleA"];
    expect(SKINS).toEqual(ids);
  });

  it("moves at a GTA pace: light tilt walks, full tilt jogs, sprint outruns both", async () => {
    const { e } = await walkingEngine();
    const dist = (input: Partial<JeepInputSnapshot>): number => {
      e.spawnExplorerBesideCar();
      const a = e.foot.pos.clone();
      for (let i = 0; i < 120; i++) e.updateExplorer(1 / 60, snap(input));
      return distXZ(e.foot.pos, a);
    };
    const walk = dist({ moveY: 0.4 });
    const jog = dist({ moveY: 1 });
    const run = dist({ moveY: 1, sprint: true });
    expect(walk).toBeGreaterThan(2);
    expect(jog).toBeGreaterThan(walk * 1.8);
    expect(run).toBeGreaterThan(jog * 1.35);
  });

  it("strafes with moveX and drains stamina only while sprinting", async () => {
    const { e } = await walkingEngine();
    const f = e.foot;
    for (let i = 0; i < 60; i++) e.updateExplorer(1 / 60, snap({ moveY: 1 }));
    expect(f.stamina).toBe(100);
    for (let i = 0; i < 120; i++) e.updateExplorer(1 / 60, snap({ moveY: 1, sprint: true }));
    expect(f.stamina).toBeLessThan(80);
    // exhaust it: sprint locks out (winded) until stamina recovers
    let windedSeen = false;
    let settledWinded = Infinity;
    for (let i = 0; i < 900; i++) {
      e.updateExplorer(1 / 60, snap({ moveY: 1, sprint: true }));
      if (f.winded) {
        windedSeen = true;
        settledWinded = Math.min(settledWinded, Math.hypot(f.vx, f.vz));
      }
    }
    expect(windedSeen).toBe(true);
    expect(settledWinded).toBeLessThan(9); // reduced to a jog, not a sprint
  });

  it("crouching slows you down and makes you quieter to animals", async () => {
    const { e, ex } = await walkingEngine();
    e.foot.crouch = true;
    for (let i = 0; i < 90; i++) e.updateExplorer(1 / 60, snap({ moveY: 1 }));
    expect(Math.hypot(e.foot.vx, e.foot.vz)).toBeLessThan(3.4);
    expect(e.foot.stealth).toBeLessThan(1);
    expect(ex.crouch).toBeGreaterThan(0.5);
  });

  it("punches: swings, lands the hit on the timeline, and chains a combo", async () => {
    const { e, ex } = await walkingEngine();
    const swings: number[] = [];
    e.animals = {
      melee: (...a: number[]) => {
        swings.push(a[6]); // dmg
        return { hits: 1, kills: 0, heavy: false };
      },
      nearestTarget: () => null,
      findRideable: () => null,
    };
    e.startAction("punch");
    expect(e.foot.act).toBe("punch");
    for (let i = 0; i < 6; i++) e.updateExplorer(1 / 60, snap());
    expect(swings.length).toBe(0); // the fist hasn't arrived yet
    for (let i = 0; i < 20; i++) e.updateExplorer(1 / 60, snap());
    expect(swings.length).toBe(1);
    expect(ex.action).toBeNull();
    // second + third punches are a combo ending in a harder hook
    for (let n = 0; n < 2; n++) {
      e.startAction("punch");
      for (let i = 0; i < 40; i++) e.updateExplorer(1 / 60, snap());
    }
    expect(swings.length).toBe(3);
    expect(swings[2]).toBeGreaterThan(swings[0]);
  });

  it("dodge-rolls: moves fast, is invulnerable, costs stamina", async () => {
    const { e } = await walkingEngine();
    const f = e.foot;
    const a = f.pos.clone();
    e.lastMove.y = 1;
    e.startAction("roll");
    expect(f.act).toBe("roll");
    expect(f.invulnT).toBeGreaterThan(0.3);
    const s0 = f.stamina;
    e.hurtPlayer(20, 1, 0);
    expect(f.health).toBe(100); // i-frames
    for (let i = 0; i < 45; i++) e.updateExplorer(1 / 60, snap());
    expect(distXZ(f.pos, a)).toBeGreaterThan(3);
    expect(f.stamina).toBeLessThan(s0 + 1);
    expect(f.act).toBeNull();
  });

  it("animals can hurt the explorer; a knockout wakes you at the jeep", async () => {
    const { e } = await walkingEngine();
    const f = e.foot;
    e.hurtPlayer(30, 1, 0);
    expect(f.health).toBe(70);
    expect(f.vx).toBeGreaterThan(3); // knocked back
    f.invulnT = 0;
    e.hurtPlayer(500, 1, 0);
    expect(f.health).toBe(0);
    expect(f.downT).toBeGreaterThan(0);
    for (let i = 0; i < 60 * 4; i++) e.updateExplorer(1 / 60, snap());
    expect(f.downT).toBeLessThanOrEqual(0);
    expect(f.health).toBe(60);
    expect(distXZ(f.pos, e.v.pos)).toBeLessThan(3.7);
  });

  it("mounts an animal, sits on its back, steers it at its own pace, calls, and dismounts", async () => {
    const { e } = await walkingEngine();
    const calls: string[] = [];
    // a stand-in horse 1.5 m from the explorer; back at 1.4 m, seat 0.2 m forward
    const horse = { x: e.foot.pos.x + 1.5, z: e.foot.pos.z + 4, yaw: 0, speed: 0, seated: false, rode: 0, ended: 0 };
    const handle = {};
    const info = () => ({
      name: "Horse", height: 1.65, topSpeed: 11, mass: 500, radius: 0.8,
      x: horse.x, y: 0, z: horse.z, yaw: horse.yaw, speed: horse.speed, hp: 100, maxHp: 100,
      seat: { y: 1.4, fwd: 0.2, halfW: 0.3, len: 2.2 },
      call: { kind: "neigh", text: "Neigh!", pitch: 0.66 },
      jumpHeight: 2,
      special: { name: "Gallop Burst", text: "Hyah!", cd: 7, cdLeft: 0 },
    });
    e.animals = {
      findRideable: () => (horse.seated ? null : handle),
      rideInfo: info,
      startRide: () => {
        horse.seated = true;
      },
      rideStep: (_h: object, dt: number, yaw: number, frac: number) => {
        horse.yaw = yaw;
        horse.speed = 11 * frac;
        horse.z -= Math.cos(yaw) * horse.speed * dt;
        horse.x -= Math.sin(yaw) * horse.speed * dt;
        horse.rode++;
        return { x: horse.x, y: 0, z: horse.z, yaw, speed: horse.speed };
      },
      rideCall: () => calls.push("anim"),
      rideJump: () => {
        calls.push("jump");
        return true;
      },
      rideSpecial: () => {
        calls.push("special");
        return { ready: true, name: "Gallop Burst", text: "Hyah!", cdLeft: 0, heal: 25, shake: 0.2, thud: 0.3, call: { kind: "neigh", pitch: 0.7 } };
      },
      endRide: () => {
        horse.seated = false;
        horse.ended++;
      },
      update: () => {},
      melee: () => ({ hits: 0, kills: 0, heavy: false }),
      nearestTarget: () => null,
    };
    e.audio = new Proxy({}, { get: (_t, k) => (...a: unknown[]) => { if (k === "animalCall") calls.push(String(a[0])); } });
    e.foot.pos.set(horse.x - 1, 0, horse.z);
    e.updateExplorer(1 / 60, snap()); // refreshes the "near rideable" state
    expect(e.nearRide?.name).toBe("Horse");

    e.tryEnterOrMount();
    expect(e.riding).toBe(handle);
    expect(horse.seated).toBe(true);

    // WASD steers the animal; the rider sits on the saddle line, above the ground
    for (let i = 0; i < 90; i++) e.updateExplorer(1 / 60, snap({ moveY: 1, sprint: true }));
    expect(horse.rode).toBeGreaterThan(80);
    // seat = 0.2 m ahead of the origin along the heading, at the back's height
    const hx = -Math.sin(horse.yaw);
    const hz = -Math.cos(horse.yaw);
    expect(e.foot.pos.x).toBeCloseTo(horse.x + hx * 0.2, 3);
    expect(e.foot.pos.z).toBeCloseTo(horse.z + hz * 0.2, 3);
    expect(e.foot.pos.y).toBeCloseTo(1.4, 3);
    // the pelvis lands 8 cm over the saddle line
    expect(e.explorer.root.position.y + 0.6).toBeCloseTo(1.4 + 0.08, 3);
    expect(Math.hypot(e.foot.vx, e.foot.vz)).toBeCloseTo(11, 0); // km/h readout = the animal's speed
    // melee and crouch are off while mounted
    e.startAction("punch");
    expect(e.foot.act).toBeNull();

    // Space jumps the mount (on the key's leading edge only); Q / click uses its special
    calls.length = 0;
    e.updateExplorer(1 / 60, snap({ moveY: 1, jump: true }));
    e.updateExplorer(1 / 60, snap({ moveY: 1, jump: true })); // held — no second jump
    expect(calls.filter((c) => c === "jump")).toHaveLength(1);
    e.foot.health = 50;
    e.mountSpecial();
    expect(calls).toContain("special");
    expect(e.foot.health).toBe(75); // the special's heal reached the rider
    expect(calls).toContain("neigh");

    // horn key = the animal's own call
    calls.length = 0;
    e.mountCall();
    expect(calls).toContain("neigh");
    expect(calls).toContain("anim");

    // F again: slide off beside it, on the ground, free to walk
    e.tryEnterOrMount();
    expect(e.riding).toBeNull();
    expect(horse.ended).toBe(1);
    expect(e.foot.pos.y).toBeCloseTo(e.groundHeight(e.foot.pos.x, e.foot.pos.z), 2);
    const gap = Math.hypot(e.foot.pos.x - horse.x, e.foot.pos.z - horse.z);
    expect(gap).toBeGreaterThan(1.2);
    expect(gap).toBeLessThan(3);
  });
});
