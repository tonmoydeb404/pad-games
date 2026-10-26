/** Driving camera modes and stick look. */
import type { JeepInputSnapshot } from "../../input";
import { clamp, damp, lerp } from "../../noise";
import { MODES, MODE_LABEL } from "../config/foot-constants";
import { MAX_SPEED } from "../config/world-constants";
import type { JeepEngine } from "../jeep-engine";

export function updateCamera(this: JeepEngine, dt: number): void {
  const camera = this.camera;
  const jeep = this.jeep;
  if (!camera || !jeep) return;
  const v = this.v;
  const cs = this.camState;
  const mode = MODES[this.camMode];
  // The camera follows the interpolated render position, never raw sim state.
  const pos = this.renderPos;

  if (this.onFoot) {
    this.updateFootCamera(dt);
  } else if (mode === "chase") {
    cs.dist = damp(cs.dist, cs.targetDist, 6, dt);
    const speedK = clamp(Math.abs(v.speed) / MAX_SPEED, 0, 1);
    const back = cs.dist + speedK * 1.6;
    const yq = this.camQ.setFromEuler(this.camE.set(0, v.yaw + cs.yawOff, 0, "YXZ"));
    this.camV1.set(0, 2.5 + speedK * 0.4, back).applyQuaternion(yq);
    this.camV1.add(pos);
    this.safeAboveTerrain(this.camV1, 1.4);
    cs.pos.lerp(this.camV1, 1 - Math.exp(-7.0 * dt));
    this.camV2.copy(pos);
    this.camV2.y += 0.85;
    this.camV2.x += -Math.sin(v.yaw) * (2.5 + speedK * 6.0);
    this.camV2.z += -Math.cos(v.yaw) * (2.5 + speedK * 6.0);
    cs.look.lerp(this.camV2, 1 - Math.exp(-8.0 * dt));
    camera.position.copy(cs.pos);
    camera.lookAt(cs.look);
    camera.fov = lerp(camera.fov, 62 + speedK * 8, 1 - Math.exp(-3.5 * dt));
    camera.updateProjectionMatrix();
  } else if (mode === "cockpit") {
    cs.headX = damp(cs.headX, clamp(-v.lateral * 0.03, -0.06, 0.06), 5, dt);
    cs.headY = damp(cs.headY, clamp(-v.dive * 0.8, -0.06, 0.06), 5, dt);
    this.camV1.set(-0.42 + cs.headX, 0.62 + cs.headY, -0.28);
    jeep.localToWorld(this.camV1);
    camera.position.lerp(this.camV1, 1 - Math.exp(-22 * dt));
    this.camV2.set(-0.42 + Math.sin(cs.yawOff) * 3.2, 0.42 + Math.sin(cs.pitchOff) * 2.4, -6.0);
    jeep.localToWorld(this.camV2);
    camera.lookAt(this.camV2);
    camera.fov = lerp(camera.fov, 70, 1 - Math.exp(-4 * dt));
    camera.updateProjectionMatrix();
  } else if (mode === "orbit") {
    const d = cs.orbitDist;
    this.camV1.set(
      Math.sin(cs.orbitYaw) * Math.cos(cs.orbitPitch) * d,
      Math.sin(cs.orbitPitch) * d + 1.0,
      Math.cos(cs.orbitYaw) * Math.cos(cs.orbitPitch) * d,
    );
    this.camV1.add(pos);
    this.safeAboveTerrain(this.camV1, 0.6);
    camera.position.lerp(this.camV1, 1 - Math.exp(-8 * dt));
    this.camV2.copy(pos);
    this.camV2.y += 0.7;
    cs.look.lerp(this.camV2, 1 - Math.exp(-8 * dt));
    camera.lookAt(cs.look);
    camera.fov = lerp(camera.fov, 55, 1 - Math.exp(-4 * dt));
    camera.updateProjectionMatrix();
  } else if (mode === "under") {
    const yq = this.camQ.setFromEuler(this.camE.set(0, v.yaw, 0, "YXZ"));
    this.camV1.set(0.4, -0.32, 2.85).applyQuaternion(yq).add(pos);
    const gh = this.terrainHeight(this.camV1.x, this.camV1.z);
    this.camV1.y = Math.max(this.camV1.y, gh + 0.25);
    camera.position.lerp(this.camV1, 1 - Math.exp(-7.5 * dt));
    this.camV2.copy(pos);
    this.camV2.y -= 0.35;
    this.camV2.x += -Math.sin(v.yaw) * 1.5;
    this.camV2.z += -Math.cos(v.yaw) * 1.5;
    cs.look.lerp(this.camV2, 1 - Math.exp(-7.5 * dt));
    camera.lookAt(cs.look);
    camera.fov = lerp(camera.fov, 52, 1 - Math.exp(-4 * dt));
    camera.updateProjectionMatrix();
  } else {
    const yq = this.camQ.setFromEuler(this.camE.set(0, v.yaw, 0, "YXZ"));
    this.camV1.set(-2.15, 0.3, -1.15).applyQuaternion(yq).add(pos);
    const gh = this.terrainHeight(this.camV1.x, this.camV1.z);
    this.camV1.y = Math.max(this.camV1.y, gh + 0.35);
    camera.position.lerp(this.camV1, 1 - Math.exp(-9 * dt));
    this.camV2.set(-0.86, -0.35, -1.28);
    jeep.localToWorld(this.camV2);
    cs.look.lerp(this.camV2, 1 - Math.exp(-9 * dt));
    camera.lookAt(cs.look);
    camera.fov = lerp(camera.fov, 58, 1 - Math.exp(-4 * dt));
    camera.updateProjectionMatrix();
  }

  // game-feel: trauma² shake — smooth sin offsets + roll, added ON TOP of follow
  const shake = cs.trauma * cs.trauma;
  if (shake > 0.001) {
    const t = this.time * 30;
    camera.position.x += 0.24 * shake * Math.sin(t * 1.7);
    camera.position.y += 0.17 * shake * Math.sin(t * 2.3);
    camera.rotation.z += 0.022 * shake * Math.sin(t * 1.1);
  }
  // transient FOV punch on hard landings, eased back to rest
  if (this.fovKick > 0.01) {
    camera.fov += this.fovKick;
    this.fovKick = damp(this.fovKick, 0, 5, dt);
    camera.updateProjectionMatrix();
  }
}

export function setCameraMode(this: JeepEngine, i: number): void {
  this.camMode = ((i % MODES.length) + MODES.length) % MODES.length;
  this.notify(MODE_LABEL[MODES[this.camMode]]);
  if (this.el.hCam) this.el.hCam.textContent = MODE_LABEL[MODES[this.camMode]].replace(" camera", "").replace(" view", "");
}

export function relaxLook(this: JeepEngine, dt: number): void {
  const cs = this.camState;
  const mode = MODES[this.camMode];
  if (this.onFoot) {
    // free orbit on foot: nothing to relax
    return;
  }
  if (mode === "chase" || mode === "cockpit") {
    cs.yawOff = damp(cs.yawOff, 0, 2.2, dt);
    cs.pitchOff = damp(cs.pitchOff, 0, 2.2, dt);
  }
}

export function applyStickLook(this: JeepEngine, snap: JeepInputSnapshot, dt: number): void {
  const cs = this.camState;
  const mode = MODES[this.camMode];
  const lx = snap.lookX;
  const ly = snap.lookY;
  if (this.onFoot) {
    // aiming drops the stick sensitivity (and sticks to a target under the reticle, GTA-style)
    let sens = 1 - 0.45 * this.aimK;
    if (this.aimK > 0.5 && this.targetUnderReticle()) sens *= 0.5;
    this.footCam.yaw -= lx * dt * 3.0 * sens;
    this.footCam.pitch = clamp(this.footCam.pitch + ly * dt * 2.2 * sens, -0.32, 0.95);
    return;
  }
  if (mode === "orbit") {
    cs.orbitYaw -= lx * dt * 3.4;
    cs.orbitPitch = clamp(cs.orbitPitch + ly * dt * 2.4, -0.25, 1.15);
  } else if (mode === "cockpit") {
    cs.yawOff = clamp(cs.yawOff - lx * dt * 2.6, -0.85, 0.85);
    cs.pitchOff = clamp(cs.pitchOff - ly * dt * 2.0, -0.5, 0.5);
  } else if (mode === "chase") {
    cs.yawOff = clamp(cs.yawOff - lx * dt * 2.6, -1.0, 1.0);
  }
}
