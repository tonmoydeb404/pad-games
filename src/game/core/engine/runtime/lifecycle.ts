/** Start, pause/resume, attach and destroy. */
import * as THREE from "three";
import type { JeepEngine } from "../jeep-engine";

export function start(this: JeepEngine): void {
  if (this.started || this.destroyed) return;
  this.started = true;
  this.input.consumeActions(); // drop anything queued before gameplay began
  this.root?.querySelector(".jj-hud")?.classList.add("on");
  this.setTip();
  this.el.tip?.classList.add("show");
  window.setTimeout(() => this.el.tip?.classList.remove("show"), 9000);
  // open world: no countdown, no forced objective. The loop clock arms the
  // first time the start gate is crossed — laps stay optional.
  this.lapStartT = -1;
  this.lapTimes = [];
  this.notify(this.onFoot ? "Explore — your jeep is waiting" : "Free roam — the jungle is yours");
  this.loadBestLap();
  this.lastT = performance.now();
  cancelAnimationFrame(this.rafId);
  this.rafId = requestAnimationFrame(this.animate); // loop first…
  this.audio.start(); // …audio failures can never break gameplay
  this.audio.loadFiles(); // CC0 ambience + impacts stream in async
}

export function togglePause(this: JeepEngine): void {
  if (this.paused) this.resume();
  else this.pause();
}

export function pause(this: JeepEngine): void {
  if (!this.started || this.paused || this.destroyed) return;
  this.paused = true;
  this.mouseFire = this.mouseAim = false;
  if (document.pointerLockElement) document.exitPointerLock();
  this.audio.suspend();
  this.onPauseChange?.(true);
}

export function resume(this: JeepEngine): void {
  if (!this.paused || this.destroyed) return;
  this.paused = false;
  this.audio.resume();
  this.lastT = performance.now();
  this.onPauseChange?.(false);
}

/** Attach global listeners (called once, after build). */
export function attach(this: JeepEngine): void {
  this.input.attach();
  window.addEventListener("keydown", this.onPauseKey as EventListener);
  window.addEventListener("resize", this.onResize as EventListener);
  window.addEventListener("mousedown", this.onMouseDown as EventListener);
  window.addEventListener("mouseup", this.onMouseUp as EventListener);
  window.addEventListener("contextmenu", this.onContextMenu as EventListener);
  window.addEventListener("mousemove", this.onMouseMove as EventListener);
  window.addEventListener("wheel", this.onWheel as EventListener, { passive: true });
  document.addEventListener("visibilitychange", this.onVisibility as EventListener);
}

export function destroy(this: JeepEngine): void {
  if (this.destroyed) return;
  this.destroyed = true;
  cancelAnimationFrame(this.rafId);
  window.removeEventListener("keydown", this.onPauseKey as EventListener);
  window.removeEventListener("resize", this.onResize as EventListener);
  window.removeEventListener("mousedown", this.onMouseDown as EventListener);
  window.removeEventListener("mouseup", this.onMouseUp as EventListener);
  window.removeEventListener("contextmenu", this.onContextMenu as EventListener);
  window.removeEventListener("mousemove", this.onMouseMove as EventListener);
  window.removeEventListener("wheel", this.onWheel as EventListener);
  document.removeEventListener("visibilitychange", this.onVisibility as EventListener);
  this.input.detach();
  this.profiler?.destroy();
  this.profiler = null;
  this.animals?.destroy();
  this.animals = null;
  this.citySystem?.destroy();
  this.citySystem = null;
  this.trains?.destroy();
  this.trains = null;
  this.mouseFire = this.mouseAim = false;
  if (document.pointerLockElement) document.exitPointerLock();
  for (const t of this.tracers) {
    this.scene?.remove(t.mesh);
    (t.mesh.material as THREE.Material).dispose();
  }
  this.tracers = [];
  this.tracerGeo.dispose();
  this.explorer?.dispose();
  this.explorer = null;
  this.rig = null;
  this.terrainStream = null;
  this.propStream = null;
  this.pw?.dispose();
  this.pw = null;
  this.audio.dispose();
  this.renderer?.dispose();
  this.renderer?.forceContextLoss();
  this.renderer = null;
  this.composer = null;
  this.scene?.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
  this.root?.remove();
  this.root = null;
  this.el = {};
}
