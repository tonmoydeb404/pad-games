/** Triangle accounting for a Three.js scene, grouped by top-level object. */
import * as THREE from "three";

export interface SceneEntry {
  name: string;
  meshes: number;
  /** triangles submitted per pass (instances counted, frustum culling ignored) */
  triangles: number;
  castsShadow: boolean;
}

const trisOf = (m: THREE.Mesh): number => {
  const g = m.geometry;
  const per = g.index ? g.index.count / 3 : (g.getAttribute("position")?.count ?? 0) / 3;
  const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
  return per * inst;
};

/** Per top-level child of `root`: visible mesh count and triangles. Sorted largest first. */
export function sceneBreakdown(root: THREE.Object3D): SceneEntry[] {
  const out: SceneEntry[] = [];
  root.children.forEach((child, i) => {
    if (!child.visible) return;
    let meshes = 0;
    let triangles = 0;
    let casts = false;
    child.traverseVisible((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      meshes++;
      triangles += trisOf(m);
      casts ||= m.castShadow;
    });
    if (meshes > 0) out.push({ name: child.name || `${child.type}#${i}`, meshes, triangles: Math.round(triangles), castsShadow: casts });
  });
  return out.sort((a, b) => b.triangles - a.triangles);
}
