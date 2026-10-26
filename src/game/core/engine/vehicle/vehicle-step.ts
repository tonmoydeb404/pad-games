/** Vehicle tick phases: Rapier step with collision response, and reading the body state back. */
import { clamp, damp } from "../../noise";
import { BOUND, SUSP_REST, SUSP_TRAVEL } from "../config/world-constants";
import type { JeepEngine } from "../jeep-engine";
import type { StepResult, TickCtx } from "./tick-types";

/** Step Rapier, clamp to the world boundary and turn contacts into impact effects. */
export function stepWorld(this: JeepEngine, c: TickCtx): StepResult | null {
  const { dt, pw, rig, P, fw, intent } = c;
  const body = rig.body;
  const linBefore = body.linvel();
  const vy0 = linBefore.y;
  const vxBefore = linBefore.x;
  const vzBefore = linBefore.z;
  rig.drive(intent, dt);
  pw.step(dt);

  // boundary (extended through the Port Marin sector so the town is drivable)
  {
    const t = body.translation();
    const r = Math.hypot(t.x, t.z);
    const bound = Math.max(BOUND, this.city.bound(t.x, t.z));
    if (r > bound) {
      const k = bound / r;
      body.setTranslation({ x: t.x * k, y: t.y, z: t.z * k }, true);
      const lin = body.linvel();
      body.setLinvel({ x: lin.x * 0.4, y: lin.y, z: lin.z * 0.4 }, true);
    }
  }
  const t = body.translation();
  if (!isFinite(t.x) || !isFinite(t.y) || !isFinite(t.z)) {
    this.resetVehicle();
    return null;
  }

  // collisions: Rapier resolved them; work out how hard the car was hit.
  // The contact-force events say THAT something touched the chassis and
  // roughly how hard; the speed actually lost says how much it mattered.
  let eventImpact = 0;
  pw.events.drainContactForceEvents((ev) => {
    const dir = ev.maxForceDirection();
    if (Math.abs(dir.y) > 0.7) return; // ground / landing — onLand handles it
    eventImpact = Math.max(eventImpact, (ev.totalForceMagnitude() * dt) / (1000 * P.mass));
  });
  const linAfter = body.linvel();
  const dvx = linAfter.x - vxBefore;
  const dvz = linAfter.z - vzBefore;
  const dvLoss = Math.hypot(dvx, dvz);
  if (eventImpact > 0) {
    this.contactTicks++;
    // never report more than the speed the car actually shed (plus a little)
    const impact = Math.min(eventImpact, dvLoss + 0.2);
    // push direction = how the car's horizontal velocity changed
    let nx = dvx;
    let nz = dvz;
    if (dvLoss > 1e-4) {
      nx /= dvLoss;
      nz /= dvLoss;
    } else {
      nx = -fw.x;
      nz = -fw.z;
    }
    const fresh = this.contactTicks === 1 || impact > this.lastImpact * 2;
    if (fresh && impact > 0.6) {
      // the moment of a crash: the full treatment, once
      this.collisionFx(impact, nx, nz);
      this.lastImpact = impact;
    } else if (this.time - this.lastScrape > 0.18) {
      // pressing / sliding along something: a light, rate-limited rumble
      this.lastScrape = this.time;
      this.input.rumble(clamp(0.16 + impact * 0.1, 0.16, 0.45), 110);
      this.addTrauma(0.03);
    }
  } else {
    this.contactTicks = 0;
    this.lastImpact = 0;
  }
  return { vy0, t, linAfter };
}

/** Copy the rigid body's pose/speeds into the vehicle state, then suspension, airtime and bump feel. */
export function readBack(this: JeepEngine, c: TickCtx, s: StepResult): void {
  const v = this.v;
  const { dt, rig } = c;
  const body = rig.body;
  const { vy0, t, linAfter } = s;
  v.pos.set(t.x, t.y, t.z);
  const q = body.rotation();
  this.physQuat.set(q.x, q.y, q.z, q.w);
  const f = rig.forward();
  v.yaw = Math.atan2(-f.x, -f.z);
  this.physEuler.setFromQuaternion(this.physQuat, "YXZ");
  v.pitch = this.physEuler.x;
  v.roll = this.physEuler.z;
  const sp = rig.speeds();
  v.speed = sp.forward;
  v.lateral = sp.lateral;
  v.vy = linAfter.y;
  this.syncF = v.speed;
  this.syncL = v.lateral;

  // suspension → wheel/spring visuals
  const REST = SUSP_REST;
  const TRAVEL = SUSP_TRAVEL;
  const ctrl = rig.controller;
  let maxImpact = 0;
  for (let i = 0; i < 4; i++) {
    const w = this.wheels[i];
    const prev = w.comp;
    const target = clamp(REST + rig.wheelDrop(i), 0, TRAVEL);
    w.comp = damp(w.comp, target, 40, dt);
    w.compV = (w.comp - prev) / dt;
    w.contact = ctrl.wheelIsInContact(i) ? 1 : 0;
    const cp = w.contact ? ctrl.wheelContactPoint(i) : null;
    w.groundY = cp ? cp.y : undefined;
    const delta = Math.abs(w.comp - prev);
    if (delta > maxImpact) maxImpact = delta;
  }

  // airtime + landing (game-feel: layered feedback on on_land)
  const contacts = rig.contacts;
  if (contacts === 0) {
    this.airT += dt;
    this.noContactTicks++;
  } else {
    if (this.noContactTicks > 0) {
      const impactVy = Math.max(0, -vy0);
      if (this.airT > 0.18 || impactVy > 9) this.onLand(this.airT, impactVy);
    }
    this.noContactTicks = 0;
    this.airT = 0;
  }
  // a single bumpy tick off the ground isn't flight: wait ~3 ticks
  v.airborne = this.noContactTicks >= 3;

  // suspension bottomed out — small thud + shake (rate-limited)
  if (rig.bottomedOut() && vy0 < -4 && this.time - this.lastBottomOut > 0.45) {
    this.lastBottomOut = this.time;
    this.audio.thud(0.35);
    this.addTrauma(0.14);
    this.input.rumble(0.35, 140);
  }

  v.bumpImpulse = damp(v.bumpImpulse, 0, 6, dt);
  if (maxImpact > 0.012) v.bumpImpulse = Math.min(1, v.bumpImpulse + maxImpact * 3.2);
  // rough ground feeds a little continuous trauma into the camera
  if (v.bumpImpulse > 0.18) this.addTrauma(v.bumpImpulse * 0.016);

  for (let i = 0; i < 4; i++) {
    const w = this.wheels[i];
    w.angle -= (v.speed / this.wheelR) * dt * (v.handbrake && !v.airborne ? 0.12 : 1);
  }
}
