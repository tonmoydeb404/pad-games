/**
 * On-foot guns through the real engine step: drawing a gun, pulling the
 * trigger (ammo, cooldown, pellets, hit-scan against animals / terrain /
 * trunks), reloading, melee being disabled while armed, and holstering when
 * hopping in the jeep. Animals and the Kenney rig are stubbed.
 */
import { describe, expect, it } from "vitest";
import { GUNS } from "../weapons";
import { armedEngine, run } from "./guns-helpers";

describe("on-foot guns (handling)", () => {
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
