/** Weapon switching, holstering, reloading and the weapon HUD. */
import { clamp } from "../../noise";
import { getItemDef, weaponItemId } from "../../../player/state";
import { FOOT_RUN } from "../config/foot-constants";
import type { JeepEngine } from "../jeep-engine";

/** Put the right model (or none) in the explorer's hand for the current selection. */
export function syncHeldGun(this: JeepEngine): void {
  const sel = this.armory.selected;
  // the player model records what is in hand (guns only until tools exist)
  const held = this.player.held;
  if (!held || getItemDef(held).category === "weapon") this.player.held = sel > 0 ? weaponItemId(sel) : null;
  if (sel === this.heldGun) return;
  this.heldGun = sel;
  this.explorer?.setGun(sel > 0 ? (this.gunModels[sel - 1] ?? null) : null);
}

/** Select a weapon: 0 = fists, 1–5 = guns, -1 = cycle. */
export function switchWeapon(this: JeepEngine, slot: number): void {
  const f = this.foot;
  if (!this.explorer || this.riding || f.downT > 0 || f.act === "roll") return;
  if (slot < 0) this.armory.cycle(1);
  else if (!this.armory.select(slot)) return;
  this.prevFire = true; // a held trigger must not fire the new gun
  this.onWeaponChanged();
}

export function onWeaponChanged(this: JeepEngine): void {
  const g = this.armory.gun;
  this.syncHeldGun();
  this.audio.weaponSwap();
  if (g) this.notify(g.name);
  else {
    this.notify("Fists");
    this.mouseFire = this.mouseAim = false;
    if (document.pointerLockElement) document.exitPointerLock();
  }
  this.foot.crouch = false;
  this.setTip();
}

/** Put the gun away (entering the jeep, climbing on an animal). */
export function holster(this: JeepEngine): void {
  this.mouseFire = this.mouseAim = false;
  if (document.pointerLockElement) document.exitPointerLock();
  if (this.armory.gun) {
    this.armory.select(0);
    this.syncHeldGun();
  }
  this.stanceK = this.aimK = 0;
  this.explorer?.setStance(0, -0.9);
  if (this.el.xhair) this.el.xhair.hidden = true;
  if (this.el.scope) this.el.scope.hidden = true;
}

export function reloadGun(this: JeepEngine): void {
  const g = this.armory.gun;
  if (!g || !this.armory.reload()) return;
  this.audio.reload(g.reloadSeconds);
  this.prevReloading = true;
}

/** Per-frame gun logic: cooldown/reload clocks, trigger handling, HUD bits. */
export function updateGuns(this: JeepEngine, dt: number, aiming: boolean, trigger: boolean, speed: number): void {
  const ar = this.armory;
  ar.update(dt);
  const g = ar.gun;
  this.hitMarkT = Math.max(0, this.hitMarkT - dt);
  if (this.prevReloading && !ar.reloading) this.prevReloading = false;
  if (!g || this.foot.downT > 0 || this.riding) {
    this.prevFire = trigger;
    return;
  }
  const edge = trigger && !this.prevFire;
  if (trigger && (g.auto || edge)) {
    if (ar.canFire()) this.fireGun(g, aiming, speed);
    else if (edge && !ar.reloading && ar.dry) {
      this.audio.dryFire();
      this.notify("Out of ammo — drive to the jeep to restock");
    } else if (edge && ar.mag <= 0 && !ar.reloading) this.reloadGun();
  }
  // a reload the armory started by itself (empty magazine)
  if (ar.reloading && !this.prevReloading) {
    this.prevReloading = true;
    this.audio.reload(g.reloadSeconds);
  }
  this.prevFire = trigger;
}

/** Is a living animal under the crosshair right now (aim friction, reticle colour)? */
export function targetUnderReticle(this: JeepEngine): boolean {
  const cam = this.camera;
  const g = this.armory.gun;
  if (!cam || !g || !this.animals) return false;
  cam.getWorldDirection(this.gv1);
  return this.animals.probe(cam.position.x, cam.position.y, cam.position.z, this.gv1.x, this.gv1.y, this.gv1.z, Math.min(g.range, 80)) !== null;
}

/** Weapon panel, crosshair, hit marker and scope overlay (called from the 14 Hz UI tick). */
export function updateWeaponHud(this: JeepEngine): void {
  const ar = this.armory;
  const g = ar.gun;
  const show = this.onFoot && !this.riding && !this.paused;
  if (this.el.weapon) this.el.weapon.hidden = !show || !g; // fists need no card
  const xh = this.el.xhair;
  const out = show && !!g && this.foot.downT <= 0;
  if (xh) {
    xh.hidden = !out;
    xh.classList.toggle("aim", this.aimK > 0.5);
    xh.classList.toggle("target", out && this.targetUnderReticle());
    if (out && g) {
      const cone = g.spread * (this.aimK > 0.5 ? 1 : g.hipSpread) * (1 + clamp(Math.hypot(this.foot.vx, this.foot.vz) / FOOT_RUN, 0, 1) * 1.2);
      xh.style.setProperty("--s", `${clamp(5 + cone * 380, 5, 54).toFixed(1)}px`);
    }
  }
  if (this.el.hitm) {
    this.el.hitm.classList.toggle("on", this.hitMarkT > 0);
    this.el.hitm.classList.toggle("kill", this.hitKill);
  }
  if (this.el.scope) this.el.scope.hidden = !(out && !!g?.scope && this.aimK > 0.85);
  if (!show) return;
  if (!g) {
    if (this.el.wName) this.el.wName.textContent = "Fists";
    if (this.el.wAmmo) this.el.wAmmo.textContent = "";
    if (this.el.wReload) this.el.wReload.style.width = "0%";
    if (this.el.wKeys) this.el.wKeys.textContent = "1–5 draw a gun";
    return;
  }
  if (this.el.wName) this.el.wName.textContent = g.name;
  if (this.el.wAmmo) {
    const res = ar.reserve === Infinity ? "∞" : String(ar.reserve);
    this.el.wAmmo.innerHTML = `${ar.mag}<small> / ${res}</small>`;
    this.el.wAmmo.classList.toggle("low", ar.mag <= Math.ceil(g.magSize * 0.25));
  }
  if (this.el.wReload) {
    this.el.wReload.style.width = ar.reloading ? `${(1 - ar.reloadLeft / g.reloadSeconds) * 100}%` : "0%";
  }
  if (this.el.wKeys) this.el.wKeys.textContent = ar.reloading ? "Reloading…" : ar.dry ? "No ammo — restock at the jeep" : `${g.auto ? "Auto" : "Semi"} · R reload`;
}
