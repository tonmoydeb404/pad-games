import * as THREE from "three";

export function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) out.push(m);
  });
  return out;
}

export function bake(geometry: THREE.BufferGeometry, mesh: THREE.Mesh): THREE.BufferGeometry {
  mesh.updateWorldMatrix(true, false);
  const g = geometry.clone();
  g.applyMatrix4(mesh.matrixWorld);
  if (!g.getAttribute("normal")) g.computeVertexNormals();
  return g;
}
