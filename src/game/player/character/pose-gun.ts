import * as THREE from "three";
import { aim, twist } from "./aim";
import type { PoseState } from "./pose-state";

const handV = new THREE.Vector3();
const gunQ = new THREE.Quaternion();
const gunDir = new THREE.Vector3();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** Two-handed hold. Model frame: +Z forward, +X the character's left. */
export function applyGunHold(s: PoseState): void {
  const { armed, kick, model, gunHolder } = s;
  const p = s.gunPitch + kick * 0.22;
  const ay = Math.sin(p);
  const az = Math.cos(p);
  aim(s, "RightArm", 0.2, ay, az, armed);
  aim(s, "RightForeArm", 0.1, ay, az, armed);
  aim(s, "LeftArm", -0.26, ay - 0.04, az, armed * 0.95);
  aim(s, "LeftForeArm", -0.12, ay - 0.02, az, armed * 0.95);
  // lean the chest into the aim
  twist(s, s.bones.chest, 1, 0, 0, -p * 0.25 * armed);
  const hand = s.bone("RightHand");
  if (hand && s.gunModel) {
    model.updateWorldMatrix(true, false);
    hand.updateWorldMatrix(true, false);
    hand.getWorldPosition(handV);
    model.worldToLocal(handV);
    gunDir.set(0, ay, az).normalize();
    gunQ.setFromUnitVectors(Z_AXIS, gunDir);
    gunHolder.quaternion.copy(gunQ);
    gunHolder.position.copy(handV).addScaledVector(gunDir, -kick * 0.07);
    gunHolder.visible = true;
  }
}
