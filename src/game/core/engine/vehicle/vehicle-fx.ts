/** Vehicle tick phases: exhaust smoke, tyre spray, overturn/lap tracking and gamepad rumble. */
import { ROAD_HALF, MAX_SPEED } from "../config/world-constants";
import type { JeepEngine } from "../jeep-engine";
import type { TickCtx } from "./tick-types";

export function emitExhaustSmoke(this: JeepEngine): void {
  const v = this.v;
  // exhaust smoke
  if (this.bodyGroup && Math.random() < (v.throttle > 0.05 ? 0.85 : 0.28)) {
    this.tmpVec.set(0.5, -0.35, this.exhaustZ).applyMatrix4(this.bodyGroup.matrixWorld);
    this.spawnParticle(
      this.tmpVec.x,
      this.tmpVec.y,
      this.tmpVec.z,
      (Math.random() - 0.5) * 0.2,
      0.35 + Math.random() * 0.3,
      (Math.random() - 0.5) * 0.2 + v.speed * 0.08,
      0x555555,
      0.08,
      0.32,
      0.55,
    );
  }
}

export function emitTireSpray(this: JeepEngine, c: TickCtx): void {
  const v = this.v;
  const { jeep, surf } = c;
  const fx = -Math.sin(v.yaw);
  const fz = -Math.cos(v.yaw);
  // tire spray
  if (Math.abs(v.speed) > 2.5 && (surf === "dirt" || surf === "mud")) {
    for (let i = 2; i < 4; i++) {
      const w = this.wheels[i];
      if (w.contact && Math.random() < 0.65) {
        this.tmpVec.set(w.base.x, -this.axleOff + w.base.y + (w.comp - 0.16), w.base.z).applyMatrix4(jeep.matrixWorld);
        this.spawnParticle(
          this.tmpVec.x + (Math.random() - 0.5) * 0.3,
          this.tmpVec.y,
          this.tmpVec.z + (Math.random() - 0.5) * 0.3,
          -fx * v.speed * 0.18 + (Math.random() - 0.5) * 1.1,
          0.7 + Math.random() * 1.0,
          -fz * v.speed * 0.18 + (Math.random() - 0.5) * 1.1,
          surf === "mud" ? 0x423220 : 0x725434,
          0.14,
          0.42,
          0.4,
        );
      }
    }
  }
}

/** Overturn timer, trail progress/laps and sustained gamepad rumble. */
export function trackProgress(this: JeepEngine, c: TickCtx): void {
  const v = this.v;
  const { dt, rig, S } = c;
  // overturn detection & progress
  if (rig.up().y < 0.45) v.overturnT += dt;
  else v.overturnT = Math.max(0, v.overturnT - dt * 2);

  const info = this.trailInfo(v.pos.x, v.pos.z);
  if (info.dist < ROAD_HALF + 1.0) {
    v.lastGoodIdx = info.i;
    const t = info.t;
    if (v.prevT > 0.85 && t < 0.15) this.completeLap();
    if (v.prevT < 0.15 && t > 0.85) v.lap = Math.max(0, v.lap - 1);
    v.prevT = t;
    v.progress = t;
  }

  // sustained gamepad rumble from speed & roughness
  this.input.update(dt, { speed: Math.abs(v.speed), maxSpeed: MAX_SPEED, rough: S.rough });
}
