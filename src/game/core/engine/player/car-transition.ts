/** Getting in and out of the vehicle. */
import * as THREE from "three";
import { ENTER_DIST, EXIT_MAX_SPEED } from "../config/foot-constants";
import type { JeepEngine } from "../jeep-engine";

export function safeAboveTerrain(this: JeepEngine, p: THREE.Vector3, margin = 0.9): THREE.Vector3 {
  const h = this.terrainHeight(p.x, p.z);
  if (p.y < h + margin) p.y = h + margin;
  return p;
}

/** Place the explorer at the vehicle's left (driver) door, on the ground. */
export function spawnExplorerBesideCar(this: JeepEngine): void {
  const ex = this.explorer;
  if (!ex) return;
  if (this.riding) this.dismount(false);
  // rig space: local +X is right, so -X is the driver side
  const r = this.rig?.right() ?? { x: 1, y: 0, z: 0 };
  const f = this.foot;
  f.pos.set(
    this.v.pos.x - r.x * (this.carWid * 0.5 + 0.85),
    0,
    this.v.pos.z - r.z * (this.carWid * 0.5 + 0.85),
  );
  f.pos.y = this.groundHeight(f.pos.x, f.pos.z);
  f.vx = f.vz = f.vy = 0;
  f.yaw = this.v.yaw;
  f.grounded = true;
  f.gait = f.gaitS = 0;
  f.act = null;
  f.queued = null;
  f.crouch = false;
  f.crouchK = 0;
  f.downK = 0;
  this.footCam.yaw = f.yaw; // camera starts directly behind
  this.footCam.pitch = 0.18;
  this.footRenderSync();
  ex.root.visible = true;
  ex.root.position.copy(f.pos);
  ex.root.rotation.set(0, f.yaw, 0);
  ex.setGait(0);
}

/** Hop in — allowed only near the (slow or parked) vehicle. */
export function tryEnterCar(this: JeepEngine): void {
  if (!this.onFoot || !this.explorer || this.foot.downT > 0 || this.riding) return;
  const d = Math.hypot(this.foot.pos.x - this.v.pos.x, this.foot.pos.z - this.v.pos.z);
  if (d > ENTER_DIST) {
    this.notify("Walk closer to the vehicle");
    return;
  }
  this.onFoot = false;
  this.holster();
  const restocked = this.armory.resupply();
  this.explorer.root.visible = false;
  this.foot.gait = this.foot.gaitS = 0;
  this.foot.act = null;
  this.foot.queued = null;
  this.foot.crouch = false;
  this.explorer.setGait(0);
  this.audio.thump(0.3);
  this.input.rumble(0.2, 120);
  this.setTip();
  this.notify(restocked ? "Ammo restocked — F / Y to hop out" : "Press F / Y to hop out");
}

/** Hop out — blocked while the vehicle is moving fast. */
export function tryExitCar(this: JeepEngine): void {
  if (this.onFoot || !this.explorer) return;
  if (Math.abs(this.v.speed) > EXIT_MAX_SPEED) {
    this.notify("Slow down before jumping out!");
    return;
  }
  this.onFoot = true;
  this.spawnExplorerBesideCar();
  this.audio.thump(0.22);
  this.setTip();
  this.notify("On foot — explore!");
}
