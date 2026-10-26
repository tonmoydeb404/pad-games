/** Main loop: frame timing, input sampling and the per-frame phase pipeline. */
import { clamp } from "../../noise";
import type { JeepEngine } from "../jeep-engine";

export function animate(this: JeepEngine, now: number): void {
  if (this.destroyed) return;
  this.rafId = requestAnimationFrame(this.animate);
  let dt = (now - this.lastT) / 1000;
  this.lastT = now;
  if (!isFinite(dt)) dt = 0.016;
  dt = clamp(dt, 0.0005, 0.05);
  if (this.paused || document.hidden) return;

  // hit-stop (game-feel): big impacts briefly slow time; input stays live
  if (this.slowmoT > 0) {
    this.slowmoT -= dt;
    dt *= 0.3;
  }
  this.time += dt;

  // ---- input ----
  const snap = this.input.sample();
  this.lastMove.x = snap.moveX;
  this.lastMove.y = snap.moveY;
  this.audio.setFootMode(this.onFoot);
  const locked = this.countdownT > 0 || this.wreckT > 0 || this.onFoot;
  this.v.throttle = locked ? 0 : snap.throttle;
  this.v.brake = locked ? 0 : snap.brake;
  this.v.steerTarget = locked ? 0 : snap.steer;
  this.v.handbrake = locked ? false : snap.handbrake;
  this.updateWreck(dt);
  this.applyStickLook(snap, dt);
  const stickLooking = Math.abs(snap.lookX) > 0.1 || Math.abs(snap.lookY) > 0.1;
  this.handleActions();
  this.tickRules(dt);
  this.stepSimulation(dt);
  this.updateActors(dt, snap);
  this.updateFeedback(dt, stickLooking);
  this.renderFrame();
}

/** Wrecked: heavy smoke while dead in the water, then recover at 65%. */
export function updateWreck(this: JeepEngine, dt: number): void {
  if (this.wreckT > 0) {
    this.wreckT -= dt;
    if (Math.random() < 0.6) {
      const sy = Math.sin(this.v.yaw);
      const cy = Math.cos(this.v.yaw);
      this.spawnParticle(
        this.renderPos.x - sy * 1.4, this.renderPos.y + 1.0, this.renderPos.z - cy * 1.4,
        (Math.random() - 0.5) * 0.5,
        1.6 + Math.random() * 1.2,
        (Math.random() - 0.5) * 0.5,
        Math.random() < 0.3 ? "#ff6a2c" : "#222222",
        0.35, 1.6, 1.5,
      );
    }
    if (this.wreckT <= 0) {
      this.resetVehicle();
      this.jeepHealth = 65;
      this.notify("Recovered — 65% health");
    }
  }
}
