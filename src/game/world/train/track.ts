import * as THREE from "three";
import { clamp } from "../../core/noise";
import { TRACK_LENGTH_SCALE, TRACK_PIECE, TRAIN_SCALE } from "./constants";
import type { RailPath } from "./rail-path";
import type { RailPose } from "./types";

/**
 * Track: one InstancedMesh per part, laid tangent to the loop.
 * Pieces are compressed along the track axis (sleepers get shallower,
 * gauge unchanged) so joints sit ~2° apart on the tightest curve instead
 * of ~4.5° — the line reads smooth — and each piece pitches to the bed
 * grade so slopes don't staircase.
 */
export function spawnTrack(scene: THREE.Scene, rail: RailPath, trackProto: THREE.Object3D): void {
  const parts: { mesh: THREE.Mesh }[] = [];
  trackProto.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) parts.push({ mesh: m });
  });
  const pieceLen = TRACK_PIECE * TRAIN_SCALE * TRACK_LENGTH_SCALE;
  const spacing = pieceLen - 0.6; // slight overlap hides the joints
  const count = Math.max(1, Math.ceil(rail.length / spacing));
  const d = new THREE.Object3D();
  const pose: RailPose = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
  for (const { mesh } of parts) {
    const im = new THREE.InstancedMesh(mesh.geometry, mesh.material as THREE.Material, count);
    im.receiveShadow = true; // thin rails — never cast (hundreds of k of tris is waste)
    for (let i = 0; i < count; i++) {
      rail.pose((i + 0.5) * spacing, pose);
      d.position.set(pose.x, pose.y + 0.02, pose.z);
      d.rotation.set(
        Math.asin(clamp(pose.ty, -1, 1)),
        Math.atan2(-pose.tx, -pose.tz),
        0,
        "YXZ",
      );
      d.scale.set(TRAIN_SCALE, TRAIN_SCALE, TRAIN_SCALE * TRACK_LENGTH_SCALE);
      d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    scene.add(im);
  }
}
