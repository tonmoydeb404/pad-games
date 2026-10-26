/** Explorer presentation: facing, animation rig, gun stance, footsteps and splashes. */
import { clamp, damp, TAU } from "../../noise";
import { FOOT_WALK, FOOT_JOG, FOOT_RUN, FOOT_TURN, ENTER_DIST } from "../config/foot-constants";
import type { JeepEngine } from "../jeep-engine";
import type { FootIntent } from "./explorer-types";

/** Facing, animation, gun stance, footsteps and splashes for the explorer. */
export function animateExplorer(this: JeepEngine, dt: number, it: FootIntent, gh: number): void {
  const ex = this.explorer!;
  const f = this.foot;
  const { KO, sprinting, gunOut, aiming, trigger, surface } = it;
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
