import * as THREE from "three";
import type { PoseState } from "./pose-state";

export const sstep = (a: number, b: number, x: number): number => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const qModel = new THREE.Quaternion();
const qParent = new THREE.Quaternion();
const qWorld = new THREE.Quaternion();
const qDelta = new THREE.Quaternion();
const pA = new THREE.Vector3();
const pB = new THREE.Vector3();
const dir = new THREE.Vector3();
const tgt = new THREE.Vector3();
const ID = new THREE.Quaternion();

/** Write `qWorld` back onto bone `b` as a local rotation. */
function commit(b: THREE.Object3D): void {
  if (b.parent) {
    b.parent.getWorldQuaternion(qParent);
    b.quaternion.copy(qParent.invert().multiply(qWorld));
  } else b.quaternion.copy(qWorld);
  b.updateWorldMatrix(false, true);
}

/** Rotate `name` (world space) so its limb points toward (x, y, z) in the model frame, by weight w. */
export function aim(s: PoseState, name: string, x: number, y: number, z: number, w: number): void {
  const a = s.aimable.get(name);
  if (!a || w <= 0.001) return;
  const { b, child } = a;
  b.updateWorldMatrix(true, false);
  child.updateWorldMatrix(true, false);
  b.getWorldPosition(pA);
  child.getWorldPosition(pB);
  dir.subVectors(pB, pA);
  if (dir.lengthSq() < 1e-8) return;
  dir.normalize();
  s.model.getWorldQuaternion(qModel);
  tgt.set(x, y, z).normalize().applyQuaternion(qModel);
  qDelta.setFromUnitVectors(dir, tgt);
  qDelta.slerp(ID, 1 - w);
  b.getWorldQuaternion(qWorld);
  qWorld.premultiply(qDelta);
  commit(b);
}

/** Twist / lean a bone by a rotation about a model-frame axis. */
export function twist(s: PoseState, b: THREE.Object3D | null, ax: number, ay: number, az: number, ang: number): void {
  if (!b || Math.abs(ang) < 1e-4) return;
  b.updateWorldMatrix(true, false);
  s.model.getWorldQuaternion(qModel);
  dir.set(ax, ay, az).normalize().applyQuaternion(qModel);
  qDelta.setFromAxisAngle(dir, ang);
  b.getWorldQuaternion(qWorld);
  qWorld.premultiply(qDelta);
  commit(b);
}
