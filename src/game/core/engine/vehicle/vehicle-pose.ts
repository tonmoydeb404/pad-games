/** Vehicle tick phases: cosmetic attitude, wheel/axle visuals, gauges and lights. */
import * as THREE from "three";
import { clamp, damp, lerp } from "../../noise";
import { SUSP_REST, SUSP_TRAVEL } from "../config/world-constants";
import type { JeepEngine } from "../jeep-engine";
import type { TickCtx } from "./tick-types";

/** Cosmetic dive/roll on top of the physical attitude, then apply the mesh transforms. */
export function applyAttitude(this: JeepEngine, c: TickCtx): void {
  const v = this.v;
  const { dt, jeep, a, turnRate } = c;
  const REST = SUSP_REST;
  const TRAVEL = SUSP_TRAVEL;
  // cosmetic attitude on top of the physical one: braking dive, cornering roll
  v.dive = damp(v.dive, clamp(-a * 0.011, -0.09, 0.09), 5.0, dt);
  v.bodyRoll = damp(v.bodyRoll, clamp(turnRate * Math.abs(v.speed) * 0.028 * this.perf.roll, -0.14, 0.14), 5.0, dt);
  v.vibr = damp(v.vibr, (v.throttle * 0.4 + 0.25) * (1 - clamp(Math.abs(v.speed) / 6, 0, 0.8)), 5, dt);
  this.cosQuat.setFromEuler(this.cosEuler.set(v.dive, 0, v.bodyRoll, "YXZ"));

  // apply transform
  jeep.position.copy(v.pos);
  jeep.quaternion.copy(this.physQuat).multiply(this.cosQuat);
  const vib = v.vibr * 0.0045;
  if (this.bodyGroup) {
    this.bodyGroup.position.y = Math.sin(this.time * 46) * vib;
    this.bodyGroup.rotation.z = Math.sin(this.time * 37) * vib * 0.5;
  }

  for (let i = 0; i < 4; i++) {
    const w = this.wheels[i];
    w.holder.position.y = -this.axleOff + w.base.y + (w.comp - REST);
    w.holder.position.x = w.base.x;
    w.holder.position.z = w.base.z;
    if (w.front) w.steerG.rotation.y = v.steer * 0.55;
    w.spin.rotation.x = w.angle;
    const spr = this.springs[i];
    const part = this.springParts[i];
    const compRatio = clamp(w.comp / TRAVEL, 0, 1);
    spr.position.y = -this.axleOff + (w.comp - REST) * 0.5;
    if (part.coil) part.coil.scale.y = lerp(1.0, 0.62, compRatio);
    if (part.rod) part.rod.position.y = lerp(0.34, 0.2, compRatio);
  }
  if (this.axleF && this.axleR) {
    const artF = Math.atan2(this.wheels[1].comp - this.wheels[0].comp, this.track);
    const artR = Math.atan2(this.wheels[3].comp - this.wheels[2].comp, this.track);
    this.axleF.position.y = -this.axleOff + ((this.wheels[0].comp + this.wheels[1].comp) / 2 - REST);
    this.axleR.position.y = -this.axleOff + ((this.wheels[2].comp + this.wheels[3].comp) / 2 - REST);
    this.axleF.rotation.z = clamp(artF, -0.3, 0.3);
    this.axleR.rotation.z = clamp(artR, -0.3, 0.3);
  }
}

/** RPM, brake/reverse lamps and dashboard needles. */
export function updateGauges(this: JeepEngine, c: TickCtx): void {
  const v = this.v;
  const { dt, topBase } = c;
  const targetRpm = 780 + (Math.abs(v.speed) / topBase) * 4200 + v.throttle * 1400;
  v.rpm = damp(v.rpm, targetRpm, 4.5, dt);
  const braking = (v.brake > 0.05 && v.speed > 0.2) || (v.throttle > 0.05 && v.speed < -0.3);
  for (const m of this.brakeMeshes) (m.material as THREE.MeshStandardMaterial).emissiveIntensity = braking ? 1.7 : 0.05;
  const reversing = v.speed < -0.2;
  for (const m of this.reverseMeshes) (m.material as THREE.MeshStandardMaterial).emissiveIntensity = reversing ? 1.4 : 0.02;
  if (this.steerWheelObj) this.steerWheelObj.rotation.z = -v.steer * 2.8;
  if (this.speedoNeedle) this.speedoNeedle.rotation.z = -0.5 - (Math.abs(v.speed) / topBase) * 3.8;
  if (this.tachoNeedle) this.tachoNeedle.rotation.z = -0.5 - clamp((v.rpm - 780) / 5000, 0, 1) * 3.8;
}
