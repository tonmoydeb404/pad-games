/** On-foot explorer tick: timers, action timeline and input intent, then movement and animation. */
import type { JeepInputSnapshot } from "../../input";
import { FOOT_WALK, FOOT_JOG, FOOT_RUN, FOOT_CROUCH, MELEE } from "../config/foot-constants";
import type { JeepEngine } from "../jeep-engine";
import type { FootIntent } from "./explorer-types";

/**
 * Explorer movement, GTA-style: analog camera-relative walk → jog → sprint
 * (stamina), crouch, jump, dodge roll, and a punch / kick combat layer —
 * against the sampled terrain, pushed out of static prop colliders and the
 * parked vehicle. Deliberately kinematic — Rapier stays the car's domain.
 */
export function updateExplorer(this: JeepEngine, dt: number, snap: JeepInputSnapshot): void {
  if (!this.explorer) return;
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
  const intent: FootIntent = { KO, mx, mz, top, sprinting, gunOut, aiming, trigger, surface };
  const gh = this.moveExplorer(dt, snap, intent);
  this.animateExplorer(dt, intent, gh);
}
