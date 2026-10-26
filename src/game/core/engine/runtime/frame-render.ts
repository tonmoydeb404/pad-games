/** Per-frame feedback (camera, particles, audio, UI) and the final render. */
import * as THREE from "three";
import { clamp } from "../../noise";
import { MAX_SPEED } from "../config/world-constants";
import type { JeepEngine } from "../jeep-engine";

/** Camera, effects, audio state and HUD for this frame. */
export function updateFeedback(this: JeepEngine, dt: number, stickLooking: boolean): void {
  // trauma decays in real time so shake always settles (game-feel)
  this.camState.trauma = Math.max(0, this.camState.trauma - 1.5 * dt);

  if (!stickLooking && !this.dragging) this.relaxLook(dt);
  this.updateCamera(dt);
  this.emitWheelFX(dt);
  this.emitExhaust(dt);
  this.updateParticles(dt);
  this.updateTracers(dt);
  this.updateDebris(dt);
  this.audio.setState({
    rpm: this.v.rpm,
    throttle: this.v.throttle,
    brake: this.v.brake,
    speed: this.v.speed,
    maxSpeed: MAX_SPEED,
    surface: this.v.surface,
    handbrake: this.v.handbrake,
    lateral: this.v.lateral,
    bumpImpulse: this.v.bumpImpulse,
  });
  // adaptive music: intensity follows how hard you're driving
  this.audio.setIntensity(
    clamp((Math.abs(this.v.speed) / MAX_SPEED) * 0.75 + this.v.throttle * 0.35, 0, 1),
  );
  this.audio.update();
  this.updateUI(dt);
  this.updateAtmosphere(dt);
}

/** Wind/sky/water uniforms, sun follow and the composer/renderer draw. */
export function renderFrame(this: JeepEngine): void {
  // wind on vegetation
  for (const mat of this.windMats) {
    const u = (mat.userData as { uTime?: { value: number } }).uTime;
    if (u) u.value = this.time;
  }
  if (this.sky) {
    const mat = this.sky.material as THREE.ShaderMaterial;
    mat.uniforms.uTime.value = this.time;
    this.sky.position.set(this.camera!.position.x, 0, this.camera!.position.z);
  }
  if (this.waterMat) this.waterMat.uniforms.uTime.value = this.time;

  // sun follows whoever holds the camera (car or explorer) so the shadow
  // map stays tight
  const focusX = this.onFoot ? this.foot.pos.x : this.renderPos.x;
  const focusY = this.onFoot ? this.foot.pos.y : this.renderPos.y;
  const focusZ = this.onFoot ? this.foot.pos.z : this.renderPos.z;
  if (this.sunLight) {
    this.sunLight.position.set(focusX + 95, focusY + 105, focusZ - 72);
    this.sunLight.target.position.set(focusX, focusY, focusZ);
    this.sunLight.target.updateMatrixWorld();
  }

  if (this.composer) this.composer.render();
  else if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera);
}
