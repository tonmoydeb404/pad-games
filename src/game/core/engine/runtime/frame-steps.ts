/** Per-frame simulation phases: countdown rules, fixed-step vehicle, wildlife and trains. */
import { clamp } from "../../noise";
import type { JeepInputSnapshot } from "../../input";
import { PLAYER_RADIUS } from "../config/foot-constants";
import { FIXED_DT, MAX_SUBSTEPS } from "../config/world-constants";
import type { JeepEngine } from "../jeep-engine";

/** Countdown 3-2-1-GO. An overturned jeep stays put until the player recovers it (RB / R). */
export function tickRules(this: JeepEngine, dt: number): void {
  // ---- countdown 3-2-1-GO (drive inputs locked) ----
  if (this.countdownT > 0) {
    const before = Math.ceil(this.countdownT);
    this.countdownT -= dt;
    const after = Math.ceil(Math.max(0, this.countdownT));
    if (after < before) this.showCount(after);
    if (this.countdownT <= 0) this.lapStartT = this.time;
  }
}

/** Fixed-step vehicle simulation with render interpolation (physics-tuning). */
export function stepSimulation(this: JeepEngine, dt: number): void {
  this.acc += dt;
  let steps = 0;
  while (this.acc >= FIXED_DT && steps < MAX_SUBSTEPS) {
    this.prevPos.copy(this.v.pos);
    this.prevQuat.copy(this.physQuat);
    this.updateVehicle(FIXED_DT);
    this.currPos.copy(this.v.pos);
    this.currQuat.copy(this.physQuat);
    this.acc -= FIXED_DT;
    steps++;
  }
  if (steps === MAX_SUBSTEPS) this.acc = 0; // drop backlog after a stall
  const alpha = clamp(this.acc / FIXED_DT, 0, 1);
  this.renderPos.lerpVectors(this.prevPos, this.currPos, alpha);
  if (this.jeep) {
    this.jeep.position.copy(this.renderPos);
    this.jeep.quaternion.slerpQuaternions(this.prevQuat, this.currQuat, alpha).multiply(this.cosQuat);
  }
}

/** Wildlife, the on-foot explorer and the Jungle Express. */
export function updateActors(this: JeepEngine, dt: number, snap: JeepInputSnapshot): void {
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
}
