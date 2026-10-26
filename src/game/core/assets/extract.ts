import * as THREE from "three";
import { FOLIAGE_RE, recolorConverted } from "./recolor";
import type { PackModel, PackPart } from "./types";

/**
 * Extract one model — all parts keep their own materials (GLTFLoader already
 * produces MeshStandardMaterial with textures, alphaMode, doubleSided…).
 */
export function extract(gltfScene: THREE.Group): PackModel | null {
  const meshes: THREE.Mesh[] = [];
  gltfScene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) meshes.push(mesh);
  });
  if (meshes.length === 0) return null;

  const parts: PackPart[] = [];
  for (const m of meshes) {
    const g = m.geometry.clone();
    m.updateWorldMatrix(true, false);
    g.applyMatrix4(m.matrixWorld);
    if (!g.getAttribute("normal")) g.computeVertexNormals();

    let material = m.material as THREE.MeshStandardMaterial;
    if (material instanceof THREE.MeshBasicMaterial) {
      // unlit OBJ conversions (palms/rocks) → lit standard material, recoloured
      const std = new THREE.MeshStandardMaterial({
        color: material.color.clone(),
        roughness: 0.9,
        metalness: 0,
        side: material.side,
      });
      if (!recolorConverted(material.name ?? "", std)) {
        std.color.setHex(0x9a9a92); // neutral fallback if the name mismatched
      }
      material = std;
    } else if (!("map" in material && material.map)) {
      // OBJ-derived glbs have no textures — colour them by slot name.
      // Textured glTF models (maples, bushes…) are left untouched.
      recolorConverted(material.name ?? "", material as THREE.MeshStandardMaterial);
    }
    if (FOLIAGE_RE.test(material.name)) (material.userData as { foliage?: boolean }).foliage = true;
    parts.push({ geometry: g, material: material as THREE.Material });
  }

  // Normalise all parts together: origin at ground centre, union height = 1.
  // translate first (minY → 0, xz centred), then scale about the origin.
  const union = new THREE.Box3();
  const tmp = new THREE.Box3();
  for (const p of parts) {
    p.geometry.computeBoundingBox();
    tmp.copy(p.geometry.boundingBox!);
    union.union(tmp);
  }
  const h = Math.max(1e-4, union.max.y - union.min.y);
  const cx = (union.min.x + union.max.x) * 0.5;
  const cz = (union.min.z + union.max.z) * 0.5;
  for (const p of parts) {
    p.geometry.translate(-cx, -union.min.y, -cz);
    p.geometry.scale(1 / h, 1 / h, 1 / h);
    p.geometry.computeBoundingBox();
    p.geometry.computeBoundingSphere();
  }

  return { parts, trunk: measureTrunk(parts) };
}

/** Footprint of the non-foliage geometry in the lowest slice of the model. */
function measureTrunk(parts: PackPart[]): PackModel["trunk"] {
  for (const slice of [0.08, 0.16]) {
    let n = 0;
    let sx = 0;
    let sz = 0;
    for (const p of parts) {
      if (FOLIAGE_RE.test(p.material.name)) continue;
      const pos = p.geometry.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) > slice) continue;
        sx += pos.getX(i);
        sz += pos.getZ(i);
        n++;
      }
    }
    if (n < 3) continue;
    const x = sx / n;
    const z = sz / n;
    let r = 0;
    for (const p of parts) {
      if (FOLIAGE_RE.test(p.material.name)) continue;
      const pos = p.geometry.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) > slice) continue;
        r = Math.max(r, Math.hypot(pos.getX(i) - x, pos.getZ(i) - z));
      }
    }
    return { x, z, r };
  }
  return undefined;
}
