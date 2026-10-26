/** Jeep sub-assemblies: plate texture, wheel, axle and spring. */
import * as THREE from "three";
import { TAU } from "../../noise";
import type { JeepEngine } from "../jeep-engine";

export function plateTexture(this: JeepEngine): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 96;
  const x = c.getContext("2d");
  if (!x) throw new Error("no 2d ctx");
  x.fillStyle = "#e9e6dc";
  x.fillRect(0, 0, 256, 96);
  x.strokeStyle = "#20242a";
  x.lineWidth = 6;
  x.strokeRect(5, 5, 246, 86);
  x.fillStyle = "#1b2027";
  x.font = "bold 52px monospace";
  x.textAlign = "center";
  x.fillText("JGL-4X4", 128, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildWheel(this: JeepEngine): THREE.Group {
  const M = this.M;
  const g = new THREE.Group();
  const R = 0.5;
  const W = 0.34;
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(R, R, W, 22, 1, false), M.rubber);
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  tire.receiveShadow = true;
  g.add(tire);
  for (const s of [-1, 1]) {
    const sw = new THREE.Mesh(new THREE.TorusGeometry(R * 0.94, 0.055, 6, 20), M.rubber);
    sw.rotation.y = Math.PI / 2;
    sw.position.x = s * W * 0.5;
    g.add(sw);
  }
  const blockG = new THREE.BoxGeometry(W * 0.3, 0.085, 0.135);
  const rows = 3;
  const per = 17;
  const im = new THREE.InstancedMesh(blockG, M.rubber, rows * per);
  im.castShadow = true;
  const d = new THREE.Object3D();
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < per; i++) {
      const a = (i / per) * TAU + r * 0.22;
      d.position.set((r - 1) * W * 0.31, Math.cos(a) * (R + 0.015), Math.sin(a) * (R + 0.015));
      d.rotation.set(-a + (r - 1) * 0.22, 0, 0);
      d.updateMatrix();
      im.setMatrixAt(n++, d.matrix);
    }
  }
  im.instanceMatrix.needsUpdate = true;
  g.add(im);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.62, R * 0.62, W * 0.92, 16), M.blackSemi);
  rim.rotation.z = Math.PI / 2;
  g.add(rim);
  for (const s of [-1, 1]) {
    const face = new THREE.Mesh(new THREE.CircleGeometry(R * 0.62, 16), M.blackSemi);
    face.rotation.y = (s * Math.PI) / 2;
    face.position.x = s * (W * 0.47);
    g.add(face);
    for (let k = 0; k < 5; k++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.03, R * 0.5, 0.09), M.steel);
      sp.position.set(s * (W * 0.5), Math.cos((k / 5) * TAU) * R * 0.3, Math.sin((k / 5) * TAU) * R * 0.3);
      sp.rotation.x = (k / 5) * TAU;
      g.add(sp);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10), M.chrome);
    hub.rotation.z = Math.PI / 2;
    hub.position.x = s * (W * 0.52);
    g.add(hub);
    for (let k = 0; k < 5; k++) {
      const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.035, 6), M.chrome);
      nut.rotation.z = Math.PI / 2;
      nut.position.set(s * (W * 0.54), Math.cos((k / 5) * TAU) * 0.16, Math.sin((k / 5) * TAU) * 0.16);
      g.add(nut);
    }
  }
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.46, R * 0.46, 0.035, 18), M.dirtySteel);
  disc.rotation.z = Math.PI / 2;
  g.add(disc);
  const cal = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.1), M.shackleRed);
  cal.position.set(0, R * 0.36, 0.06);
  g.add(cal);
  return g;
}

export function buildAxle(this: JeepEngine, isFront: boolean): THREE.Group {
  const M = this.M;
  const g = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 1.78, 10), M.dirtySteel);
  tube.rotation.z = Math.PI / 2;
  tube.castShadow = true;
  g.add(tube);
  const diff = new THREE.Mesh(new THREE.SphereGeometry(0.215, 12, 10), M.dirtySteel);
  diff.position.set(isFront ? -0.08 : 0.06, 0, isFront ? -0.06 : 0.06);
  diff.scale.set(1, 1, 0.85);
  diff.castShadow = true;
  g.add(diff);
  const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.09, 12), M.steel);
  cover.rotation.x = Math.PI / 2;
  cover.position.set(diff.position.x, 0, isFront ? -0.24 : 0.26);
  g.add(cover);
  for (const s of [-1, 1]) {
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.16, 10), M.blackSemi);
    hub.rotation.z = Math.PI / 2;
    hub.position.x = s * 0.86;
    g.add(hub);
  }
  for (const s of [-1, 1]) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 1.05), M.dirtySteel);
    leaf.position.set(s * 0.55, 0.05, 0);
    g.add(leaf);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.62), M.steel);
    arm.position.set(s * 0.62, -0.06, isFront ? 0.34 : -0.34);
    arm.rotation.x = isFront ? -0.16 : 0.16;
    g.add(arm);
  }
  return g;
}

export function buildSpring(this: JeepEngine): THREE.Group {
  const M = this.M;
  const g = new THREE.Group();
  const coil = new THREE.Group();
  const ringG = new THREE.TorusGeometry(0.105, 0.021, 5, 12);
  for (let i = 0; i < 7; i++) {
    const r = new THREE.Mesh(ringG, M.steel);
    r.rotation.x = Math.PI / 2;
    r.position.y = i * 0.055;
    coil.add(r);
  }
  coil.name = "coil";
  g.add(coil);
  const shockBody = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 8), M.redDark);
  shockBody.position.y = 0.1;
  g.add(shockBody);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 8), M.chrome);
  rod.position.y = 0.3;
  rod.name = "rod";
  g.add(rod);
  return g;
}
