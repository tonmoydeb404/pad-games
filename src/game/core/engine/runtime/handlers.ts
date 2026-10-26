/** DOM event handlers (bound in the constructor). */
import { clamp } from "../../noise";
import { MODES } from "../config/foot-constants";
import type { JeepEngine } from "../jeep-engine";

export function onResize(this: JeepEngine): void {
  if (!this.renderer || !this.camera) return;
  this.camera.aspect = window.innerWidth / window.innerHeight;
  this.camera.updateProjectionMatrix();
  this.renderer.setSize(window.innerWidth, window.innerHeight);
  this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.Q.pixelRatio));
  this.composer?.setSize(window.innerWidth, window.innerHeight);
  this.composer?.setPixelRatio(Math.min(window.devicePixelRatio, this.Q.pixelRatio));
}

/** Keyboard pause/resume — must work while paused, unlike pad actions. */
export function onPauseKey(this: JeepEngine, e: KeyboardEvent): void {
  const k = e.key.toLowerCase();
  if ((k === "p" || k === "escape") && this.started) this.togglePause();
}

export function onMouseDown(this: JeepEngine, e: MouseEvent): void {
  if (!this.container.contains(e.target as Node)) return;
  this.clickStart = { x: e.clientX, y: e.clientY, t: performance.now(), button: e.button };
  this.lockClick = false;
  if (this.onFoot && this.started && !this.paused && this.input.touchActive === false) {
    if (!document.pointerLockElement) {
      // like GTA on PC: the first click grabs the mouse so the view follows it — not also a shot
      this.lockClick = true;
      void this.root?.requestPointerLock?.();
      return;
    }
    if (this.armory.gun && !this.riding) {
      if (e.button === 0) this.mouseFire = true;
      if (e.button === 2) this.mouseAim = true;
    }
  }
  if (e.button === 2) return; // right button is the kick, never a camera drag
  this.dragging = true;
  this.lastDragX = e.clientX;
  this.lastDragY = e.clientY;
}

export function onMouseUp(this: JeepEngine, e: MouseEvent): void {
  this.dragging = false;
  if (e.button === 0) this.mouseFire = false;
  if (e.button === 2) this.mouseAim = false;
  if ((this.armory.gun && !this.riding) || this.lockClick) return; // clicks are shots / the mouse-capture click, not punches
  // on foot: a quick, still click punches; right-click kicks (GTA-style)
  if (!this.onFoot || !this.started || this.paused) return;
  const c = this.clickStart;
  if (e.button !== c.button || !this.container.contains(e.target as Node)) return;
  if ((e.target as HTMLElement).closest?.(".jj-tbtn")) return;
  const still = Math.hypot(e.clientX - c.x, e.clientY - c.y) < 6;
  if (c.button === 2 || (c.button === 0 && still && performance.now() - c.t < 280)) {
    this.input.pushAction(this.riding ? "special" : c.button === 2 ? "kick" : "punch");
  }
}

export function onContextMenu(this: JeepEngine, e: MouseEvent): void {
  if (this.onFoot && this.container.contains(e.target as Node)) e.preventDefault();
}

export function onMouseMove(this: JeepEngine, e: MouseEvent): void {
  if (document.pointerLockElement && this.onFoot && this.started && !this.paused) {
    // captured pointer: raw deltas, scaled down while zoomed so a scope stays steady
    const z = (this.camera ? clamp(this.camera.fov / 58, 0.25, 1) : 1) * (1 - 0.3 * this.aimK);
    this.footCam.yaw -= e.movementX * 0.0034 * z;
    this.footCam.pitch = clamp(this.footCam.pitch + e.movementY * 0.003 * z, -0.32, 0.95);
    return;
  }
  if (!this.dragging || !this.started) return;
  const dx = (e.clientX - this.lastDragX) / window.innerWidth;
  const dy = (e.clientY - this.lastDragY) / window.innerHeight;
  this.lastDragX = e.clientX;
  this.lastDragY = e.clientY;
  if (this.onFoot) {
    this.footCam.yaw -= dx * 4.2;
    this.footCam.pitch = clamp(this.footCam.pitch + dy * 3.0, -0.32, 0.95);
    return;
  }
  const cs = this.camState;
  const mode = MODES[this.camMode];
  if (mode === "orbit") {
    cs.orbitYaw -= dx * 4.2;
    cs.orbitPitch = clamp(cs.orbitPitch + dy * 3.0, -0.25, 1.15);
  } else if (mode === "cockpit") {
    cs.yawOff = clamp(cs.yawOff - dx * 3.2, -0.85, 0.85);
    cs.pitchOff = clamp(cs.pitchOff - dy * 2.4, -0.5, 0.5);
  } else if (mode === "chase") {
    cs.yawOff = clamp(cs.yawOff - dx * 3.2, -1.0, 1.0);
  }
}

export function onWheel(this: JeepEngine, e: WheelEvent): void {
  if (!this.started) return;
  if (!this.container.contains(e.target as Node)) return;
  const cs = this.camState;
  if (this.onFoot) {
    if (this.armory.gun && !this.riding && Math.abs(e.deltaY) > 4) {
      // gun out: the wheel changes weapon (zoom the camera with the wheel while holstered)
      const now = performance.now();
      if (now - this.lastWheel > 180) {
        this.lastWheel = now;
        this.armory.cycle(e.deltaY > 0 ? 1 : -1);
        this.prevFire = true;
        this.onWeaponChanged();
      }
      return;
    }
    this.footCam.dist = clamp(this.footCam.dist + e.deltaY * 0.006, 2.2, 10);
    return;
  }
  const mode = MODES[this.camMode];
  if (mode === "chase") cs.targetDist = clamp(cs.targetDist + e.deltaY * 0.006, 4.2, 16);
  else if (mode === "orbit") cs.orbitDist = clamp(cs.orbitDist + e.deltaY * 0.006, 3.4, 16);
}

export function onVisibility(this: JeepEngine): void {
  if (document.hidden) {
    this.audio.suspend();
  } else if (this.started && !this.paused) {
    this.audio.resume();
    this.lastT = performance.now();
  }
}
