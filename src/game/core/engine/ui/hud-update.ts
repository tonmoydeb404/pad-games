/** HUD updates: notices, pad chip, countdown, readouts and headlights. */
import * as THREE from "three";
import { DIRS } from "../config/foot-constants";
import type { JeepEngine } from "../jeep-engine";

export function notify(this: JeepEngine, text: string): void {
  const n = this.el.notice;
  if (!n) return;
  n.textContent = text;
  n.classList.add("show");
  window.clearTimeout(this.noticeTimer);
  this.noticeTimer = window.setTimeout(() => n.classList.remove("show"), 1900);
}

export function updatePadChip(this: JeepEngine, connected: boolean, id: string): void {
  if (!this.el.pad) return;
  if (connected) {
    const short = id.length > 34 ? `${id.slice(0, 34)}…` : id;
    this.el.pad.textContent = `🎮 ${short}`;
  } else {
    this.el.pad.textContent = "Keyboard · plug in a gamepad";
  }
}

/** Big 3-2-1-GO readout; retriggers the pop animation per number. */
export function showCount(this: JeepEngine, n: number): void {
  const el = this.el.count;
  if (!el) return;
  if (this.lastCountNum === n) return;
  this.lastCountNum = n;
  if (n <= 0) {
    el.textContent = "GO!";
    this.audio.beep(true);
  } else {
    el.textContent = String(n);
    this.audio.beep(false);
  }
  el.classList.remove("jj-pop");
  void el.offsetWidth; // restart the CSS animation
  el.classList.add("jj-pop");
}

export function updateUI(this: JeepEngine, dt: number): void {
  this.uiAcc += dt;
  if (this.uiAcc < 0.07) return;
  this.uiAcc = 0;
  const v = this.v;
  const foot = this.onFoot;
  const kmh = foot ? Math.hypot(this.foot.vx, this.foot.vz) * 3.6 : Math.abs(v.speed) * 3.6;
  if (this.el.spd) this.el.spd.textContent = String(Math.round(kmh));
  let gear = "D";
  if (v.speed < -0.15) gear = "R";
  else if (Math.abs(v.speed) < 0.12 && v.throttle < 0.05) gear = v.handbrake || v.brake > 0.5 ? "P" : "N";
  if (!foot) for (const g of this.gearEls) g.classList.toggle("on", g.dataset.g === gear);
  this.root?.querySelector<HTMLElement>(".jj-hud")?.setAttribute("data-mode", foot ? "foot" : "car");
  if (this.el.thr) this.el.thr.style.width = `${v.throttle * 100}%`;
  if (this.el.sta) {
    this.el.sta.style.width = `${this.foot.stamina}%`;
    this.el.sta.style.background = this.foot.winded ? "#e5484d" : "";
  }
  if (this.el.brk) this.el.brk.style.width = `${v.brake * 100}%`;
  // HP bar: always visible, full width = healthy, colour tracks the level
  if (this.el.hp) {
    const hp = foot ? this.foot.health : this.jeepHealth;
    this.el.hp.style.width = `${hp}%`;
    this.el.hp.style.background = hp > 50 ? "#78d18a" : hp > 25 ? "#e8b04a" : "#e5484d";
  }
  if (this.el.hSurf) {
    const surf = this.onFoot ? this.surfaceAt(this.foot.pos.x, this.foot.pos.z) : v.surface;
    this.el.hSurf.textContent = surf.charAt(0).toUpperCase() + surf.slice(1);
  }
  const yaw = this.onFoot ? this.foot.yaw : v.yaw;
  let deg = ((-yaw * 180) / Math.PI + 180) % 360;
  if (deg < 0) deg += 360;
  if (this.el.compass) this.el.compass.textContent = `${DIRS[Math.round(deg / 45) % 8]} · ${Math.round(deg)}°`;
  if (this.el.warn) this.el.warn.classList.toggle("show", !foot && v.overturnT > 1.4);
  this.updateWeaponHud();
  this.updatePrompt();
}

export function toggleHeadlights(this: JeepEngine): void {
  this.headlightsOn = !this.headlightsOn;
  for (const l of this.headlights) l.intensity = this.headlightsOn ? 115 : 0;
  for (const m of this.headlampMeshes) (m.material as THREE.MeshStandardMaterial).emissiveIntensity = this.headlightsOn ? 2.6 : 0.15;
  for (const m of this.roofLamps) (m.material as THREE.MeshStandardMaterial).emissiveIntensity = this.headlightsOn ? 2.2 : 0.12;
  if (this.el.hLamp) this.el.hLamp.textContent = this.headlightsOn ? "Lights on" : "Lights off";
  if (this.el.hLampDot) this.el.hLampDot.classList.toggle("on", this.headlightsOn);
  this.notify(this.headlightsOn ? "Headlights on" : "Headlights off");
}
