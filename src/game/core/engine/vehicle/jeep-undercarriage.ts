/** Jeep undercarriage mesh. */
import * as THREE from "three";
import type { JeepEngine } from "../jeep-engine";

export function buildUndercarriage(this: JeepEngine): THREE.Group {
  const M = this.M;
  const u = new THREE.Group();
  const rail = new THREE.BoxGeometry(0.16, 0.2, 3.85);
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(rail, M.dirtySteel);
    r.position.set(s * 0.52, -0.3, 0);
    r.castShadow = true;
    u.add(r);
  }
  for (const z of [-1.45, -0.55, 0.35, 1.35]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.12, 0.14), M.dirtySteel);
    c.position.set(0, -0.3, z);
    u.add(c);
  }
  const gb = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.72), M.blackSemi);
  gb.position.set(0, -0.34, -0.35);
  gb.castShadow = true;
  u.add(gb);
  const tc = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.42), M.steel);
  tc.position.set(-0.06, -0.38, 0.12);
  u.add(tc);
  const dsF = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.15, 8), M.chrome);
  dsF.rotation.x = Math.PI / 2;
  dsF.position.set(0, -0.42, -1.05);
  u.add(dsF);
  const dsR = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 8), M.chrome);
  dsR.rotation.x = Math.PI / 2;
  dsR.position.set(0, -0.42, 0.95);
  u.add(dsR);
  const ft = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.28, 0.74), M.dirtySteel);
  ft.position.set(0.02, -0.36, 0.92);
  ft.castShadow = true;
  u.add(ft);
  const pipe1 = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 2.1, 8), M.steel);
  pipe1.rotation.x = Math.PI / 2;
  pipe1.position.set(0.42, -0.4, -0.55);
  u.add(pipe1);
  const muff = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.62, 10), M.dirtySteel);
  muff.rotation.z = Math.PI / 2;
  muff.position.set(0.5, -0.4, 0.62);
  u.add(muff);
  const pipe2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8), M.steel);
  pipe2.rotation.x = Math.PI / 2;
  pipe2.position.set(0.62, -0.4, 1.2);
  u.add(pipe2);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.062, 0.22, 10), M.chrome);
  tip.rotation.x = Math.PI / 2;
  tip.position.set(0.62, -0.4, 1.72);
  u.add(tip);
  const sp1 = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.05, 0.85), M.blackMatte);
  sp1.position.set(0, -0.46, -1.3);
  u.add(sp1);
  const sp2 = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.05, 0.7), M.blackMatte);
  sp2.position.set(0, -0.5, -0.3);
  u.add(sp2);
  const mud = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.03, 3.4), M.mudMat);
  mud.position.set(0, -0.24, 0);
  u.add(mud);
  return u;
}
