/** Title-screen loop: the live world as a slow cinematic backdrop before the session starts. */
import type { JeepEngine } from "../jeep-engine";

/** Fraction of the screen width the subject is pushed right, leaving room for the menu. */
const SUBJECT_SHIFT = 0.2;

export function startTitleLoop(this: JeepEngine): void {
  let last = performance.now();
  const tick = (now: number): void => {
    if (this.destroyed || this.started) return;
    this.rafId = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const cam = this.camera;
    if (!cam || document.hidden) return;
    this.time += dt;
    const f = this.foot;
    // front-left of the explorer (the jeep is parked on his right, so it falls behind him), drifting slowly
    const a = f.yaw + 0.85 + Math.sin(this.time * 0.12) * 0.22;
    this.camV1.set(f.pos.x - Math.sin(a) * 4.6, f.pos.y + 1.35, f.pos.z - Math.cos(a) * 4.6);
    this.safeAboveTerrain(this.camV1, 0.7);
    cam.position.copy(this.camV1);
    cam.lookAt(f.pos.x, f.pos.y + 1.25, f.pos.z);
    const w = window.innerWidth;
    cam.setViewOffset(w, window.innerHeight, -w * SUBJECT_SHIFT, 0, w, window.innerHeight);
    this.explorer?.update(dt);
    this.renderFrame();
  };
  cancelAnimationFrame(this.rafId);
  this.rafId = requestAnimationFrame(tick);
}

/** Undo the title framing so gameplay cameras start from a normal projection. */
export function endTitleShot(this: JeepEngine): void {
  this.camera?.clearViewOffset();
  this.camera?.updateProjectionMatrix();
}
