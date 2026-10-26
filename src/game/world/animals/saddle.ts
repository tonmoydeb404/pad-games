import * as THREE from "three";
import type { Saddle } from "./types";
import { saddleFromPoints } from "./saddle-fit";

/**
 * Find the back from the bind-pose vertices: take the middle of the body
 * (clear of head, neck, tail), bin it across its width, and sit on the lowest
 * of the central column tops — so a ridge of plates or a single spike never
 * lifts the seat, but the rider never ends up inside the body either.
 */
/** Load-time estimate (cheap, vertices only). The precise surface measurement runs when a rider mounts. */
export function measureSaddle(scene: THREE.Object3D, scale: number, height: number, useSurface = false): Saddle {
  const tris: number[] = [];
  return saddleFromPoints(collectBodyPoints(scene, scale, false, useSurface ? tris : undefined), height, useSurface ? tris : undefined);
}

/**
 * Body vertices in the model's own frame (+Z forward), scaled to world size.
 * `posed` reads the skinned/animated vertices (what you actually see); the
 * bind pose can sit noticeably lower than the idle animation.
 */
export function collectBodyPoints(scene: THREE.Object3D, scale: number, posed: boolean, trisOut?: number[]): number[] {
  scene.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(scene.matrixWorld).invert();
  const toRoot = new THREE.Matrix4();
  const pts: number[] = [];
  const v = new THREE.Vector3();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    if (/horn|antler/i.test(m.name)) return; // sweeping antlers aren't part of the back
    const pos = m.geometry.getAttribute("position");
    if (!pos) return;
    // model frame: relative to the root, so the actor's own yaw/translation drop out
    toRoot.multiplyMatrices(inv, m.matrixWorld);
    // every vertex, transformed once (skinned meshes: the animated position)
    const vp = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      if (posed && typeof m.getVertexPosition === "function") m.getVertexPosition(i, v);
      else v.fromBufferAttribute(pos, i);
      v.applyMatrix4(toRoot).multiplyScalar(scale);
      vp[i * 3] = v.x;
      vp[i * 3 + 1] = v.y;
      vp[i * 3 + 2] = v.z;
    }
    const step = Math.max(1, Math.floor(pos.count / 6000));
    for (let i = 0; i < pos.count; i += step) {
      const x = vp[i * 3];
      const y = vp[i * 3 + 1];
      const z = vp[i * 3 + 2];
      if (Number.isFinite(x + y + z)) pts.push(x, y, z);
    }
    if (trisOut) {
      const idx = m.geometry.getIndex();
      const n = idx ? idx.count : pos.count;
      for (let t = 0; t + 2 < n; t += 3) {
        for (let k = 0; k < 3; k++) {
          const vi = idx ? idx.getX(t + k) : t + k;
          trisOut.push(vp[vi * 3], vp[vi * 3 + 1], vp[vi * 3 + 2]);
        }
      }
    }
  });
  return pts;
}
