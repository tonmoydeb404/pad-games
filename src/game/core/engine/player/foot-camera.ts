/** On-foot camera, prompts and per-mode HUD. */
import { clamp, damp, lerp } from "../../noise";
import { FOOT_RUN, ENTER_DIST } from "../config/foot-constants";
import type { JeepEngine } from "../jeep-engine";

/** On-foot third-person camera: orbitable follow with terrain clearance. */
export function updateFootCamera(this: JeepEngine, dt: number): void {
  const camera = this.camera;
  const cs = this.camState;
  if (!camera) return;
  const p = this.foot.pos;
  const fc = this.footCam;
  this.camKick = damp(this.camKick, 0, 9, dt);
  const pitchEff = fc.pitch - this.camKick;
  const cp = Math.cos(pitchEff);
  // mounted: sit higher and further back so the animal's body never fills the lens
  const mounted = this.riding ? 1 : 0;
  const dist = fc.dist + mounted * this.rideCamDist;
  const lift = mounted * this.rideCamLift;
  this.camV1.set(Math.sin(fc.yaw) * cp * dist, 1.5 + lift + Math.sin(pitchEff) * dist, Math.cos(fc.yaw) * cp * dist);
  // gun out: pull in and swing over the right shoulder so the crosshair clears the body
  const shoulder = 0.62 * this.stanceK;
  if (this.stanceK > 0.001) {
    this.camV1.multiplyScalar(1 - 0.32 * this.aimK * this.stanceK);
    this.camV1.x += Math.cos(fc.yaw) * shoulder;
    this.camV1.z += -Math.sin(fc.yaw) * shoulder;
  }
  this.camV1.add(p);
  this.safeAboveTerrain(this.camV1, 0.4);
  cs.pos.lerp(this.camV1, 1 - Math.exp(-(this.aimK > 0.05 ? 16 : 9) * dt));
  this.camV2.set(p.x + Math.cos(fc.yaw) * shoulder, p.y + (mounted ? 1.0 : 1.45), p.z - Math.sin(fc.yaw) * shoulder);
  cs.look.lerp(this.camV2, 1 - Math.exp(-16 * dt));
  camera.position.copy(cs.pos);
  camera.lookAt(cs.look);
  const speedK = clamp(Math.hypot(this.foot.vx, this.foot.vz) / FOOT_RUN, 0, 1);
  const g = this.armory.gun;
  const baseFov = 58 + speedK * 6;
  camera.fov = lerp(camera.fov, g ? lerp(baseFov, g.zoomFov, this.aimK) : baseFov, 1 - Math.exp(-(g ? 12 : 3) * dt));
  camera.updateProjectionMatrix();
}

/** Keep derived foot state in sync after teleports (no velocity carry-over). */
export function footRenderSync(this: JeepEngine): void {
  this.nearCar =
    Math.hypot(this.foot.pos.x - this.v.pos.x, this.foot.pos.z - this.v.pos.z) < ENTER_DIST;
}

/** HUD hint under the tip: shown only when the explorer can hop in. */
export function updatePrompt(this: JeepEngine): void {
  const pr = this.el.prompt;
  if (!pr) return;
  const key = this.input.connected ? "Y" : "F";
  const ride = this.nearRide;
  const rideFirst = !!ride && this.ridePreferred();
  const show = this.onFoot && !this.paused && (!!this.riding || rideFirst || this.nearCar);
  pr.hidden = !show;
  if (!show) return;
  if (this.riding) pr.textContent = `${key} — dismount`;
  else if (rideFirst && ride) pr.textContent = `${key} — ride the ${ride.name.replace(/_/g, " ")}`;
  else pr.textContent = `${key} — enter the ${this.activeCar ? "vehicle" : "jeep"}`;
}

/** Show the HUD for who you are right now: driver dashboard or explorer vitals. */
export function applyModeHud(this: JeepEngine): void {
  const root = this.root;
  if (!root) return;
  const foot = this.onFoot;
  for (const el of root.querySelectorAll<HTMLElement>("[data-car]")) el.hidden = foot;
  for (const el of root.querySelectorAll<HTMLElement>("[data-foot]")) el.hidden = !foot;
  const gears = root.querySelector<HTMLElement>(".jj-gears");
  if (gears) gears.hidden = foot;
  if (this.el.brkRow) this.el.brkRow.hidden = foot;
  if (this.el.spdu) this.el.spdu.textContent = foot ? "KM / H · ON FOOT" : "KM / H";
  if (this.el.warn && foot) this.el.warn.classList.remove("show");
}

/** Contextual bottom tip — one line per state. */
export function setTip(this: JeepEngine): void {
  this.applyModeHud();
  const tip = this.el.tip;
  if (!tip) return;
  if (this.onFoot && this.riding) {
    tip.innerHTML =
      `<b>WASD</b> steer · <b>Shift</b> gallop · <b>Space</b> jump · <b>Q</b>/click ${this.rideSpecialName} · <b>K</b> call · <b>F</b> dismount`;
  } else if (this.onFoot && this.armory.gun) {
    tip.innerHTML =
      "<b>Click</b>/<b>J</b> fire · <b>Right-click</b>/<b>X</b> aim · <b>R</b> reload · <b>1–5</b> guns · <b>Tab</b> cycle · <b>0</b> holster";
  } else if (this.onFoot) {
    tip.innerHTML =
      "<b>WASD</b> move · <b>Shift</b> sprint · <b>Space</b> jump · <b>C</b> crouch · <b>Q</b> roll · <b>J</b>/click punch · <b>K</b>/right-click kick · <b>1–5</b> draw a gun · <b>F</b> vehicle";
  } else {
    tip.innerHTML =
      "<b>RT</b> drive · <b>stick</b> steer · <b>F/E</b> hop out · <b>C</b> cameras · <b>R</b> reset";
  }
}
