/**
 * On-foot explorer (mounts) — headless tests against the real engine
 * step: real terrain (HeightGrid), real prop colliders, real enter/exit state
 * machine. The Kenney mesh itself is stubbed; its loading path is exercised
 * by assets.test-style GLB checks and the browser.
 */
import { describe, expect, it } from "vitest";
import { snap, walkingEngine } from "./explorer-helpers";

describe("on-foot explorer (mounts)", () => {
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
    e.player.vitals.health = 50;
    e.mountSpecial();
    expect(calls).toContain("special");
    expect(e.player.vitals.health).toBe(75); // the special's heal reached the rider
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
