/** Jeep interior mesh. */
import * as THREE from "three";
import { TAU } from "../../noise";
import type { JeepEngine } from "../jeep-engine";

export function buildInterior(this: JeepEngine): THREE.Group {
  const M = this.M;
  const g = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.05, 2.0), M.blackMatte);
  floor.position.set(0, 0.06, 0.3);
  g.add(floor);
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.34, 0.3), M.dash);
  dash.position.set(0, 0.52, -0.72);
  g.add(dash);
  const dashTop = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.42), M.blackMatte);
  dashTop.position.set(0, 0.7, -0.8);
  dashTop.rotation.x = -0.12;
  g.add(dashTop);
  const grabBar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.38, 8), M.chrome);
  grabBar.rotation.z = Math.PI / 2;
  grabBar.position.set(0.42, 0.64, -0.6);
  g.add(grabBar);
  const cbBox = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.18), M.blackSemi);
  cbBox.position.set(0, 0.44, -0.62);
  g.add(cbBox);
  const cbDial = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 8), M.chrome);
  cbDial.rotation.x = Math.PI / 2;
  cbDial.position.set(-0.06, 0.44, -0.52);
  g.add(cbDial);
  let dialIdx = 0;
  for (const dx of [-0.1, 0.14]) {
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.03, 14), M.blackSemi);
    dial.rotation.x = Math.PI / 2 + 0.16;
    dial.position.set(-0.42 + dx, 0.58, -0.58);
    g.add(dial);
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(0.072, 14),
      new THREE.MeshStandardMaterial({ color: 0x0e1114, emissive: 0x2a6b4a, emissiveIntensity: 0.35, roughness: 0.5 }),
    );
    face.rotation.set(-0.16, 0, 0);
    face.position.set(-0.42 + dx, 0.58, -0.56);
    g.add(face);
    const needlePiv = new THREE.Group();
    needlePiv.name = dialIdx === 0 ? "speedoNeedle" : "tachoNeedle";
    needlePiv.position.set(-0.42 + dx, 0.58, -0.555);
    needlePiv.rotation.set(-0.16, 0, 0);
    const needleMesh = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.055, 0.005), M.needleMat);
    needleMesh.position.set(0, 0.025, 0);
    needlePiv.add(needleMesh);
    g.add(needlePiv);
    dialIdx++;
  }
  const rvmArm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 6), M.blackMatte);
  rvmArm.position.set(0, 1.22, -0.92);
  rvmArm.rotation.x = 0.4;
  g.add(rvmArm);
  const rvm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.09, 0.03), M.mirror);
  rvm.position.set(0, 1.18, -0.9);
  g.add(rvm);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 8), M.blackSemi);
  col.position.set(-0.42, 0.44, -0.42);
  col.rotation.x = 0.72;
  g.add(col);
  const sw = new THREE.Group();
  sw.name = "steeringWheel";
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.026, 7, 22), M.blackMatte);
  sw.add(rim);
  for (let k = 0; k < 3; k++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.175, 0.018), M.blackSemi);
    sp.rotation.z = (k / 3) * TAU;
    sp.position.set(Math.sin((k / 3) * TAU) * -0.09, Math.cos((k / 3) * TAU) * 0.09, 0);
    sw.add(sp);
  }
  const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 12), M.redDark);
  boss.rotation.x = Math.PI / 2;
  sw.add(boss);
  sw.position.set(-0.42, 0.6, -0.29);
  sw.rotation.x = -0.85;
  g.add(sw);
  for (const sx of [-0.42, 0.42]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.14, 0.52), M.seat);
    base.position.set(sx, 0.3, 0.16);
    base.castShadow = true;
    g.add(base);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.66, 0.13), M.seat);
    back.position.set(sx, 0.62, 0.44);
    back.rotation.x = -0.16;
    back.castShadow = true;
    g.add(back);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.1), M.seatTrim);
    trim.position.set(sx, 0.86, 0.41);
    g.add(trim);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.14), M.seat);
    head.position.set(sx, 1.0, 0.44);
    g.add(head);
  }
  const bench = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.14, 0.46), M.seat);
  bench.position.set(0, 0.3, 1.02);
  g.add(bench);
  const benchBack = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.5, 0.12), M.seat);
  benchBack.position.set(0, 0.56, 1.26);
  g.add(benchBack);
  const lev = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 0.34, 7), M.chrome);
  lev.position.set(-0.02, 0.35, -0.12);
  lev.rotation.x = -0.22;
  g.add(lev);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), M.blackMatte);
  knob.position.set(-0.02, 0.52, -0.16);
  g.add(knob);
  const lev2 = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.022, 0.26, 7), M.steel);
  lev2.position.set(0.12, 0.31, -0.02);
  lev2.rotation.x = -0.3;
  g.add(lev2);
  for (let k = 0; k < 3; k++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.13), M.steel);
    p.position.set(-0.62 + k * 0.14, 0.16, -0.6);
    p.rotation.x = -0.34;
    g.add(p);
  }
  const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.24, 6), M.blackMatte);
  hb.position.set(0.14, 0.36, 0.06);
  hb.rotation.x = -0.7;
  g.add(hb);
  return g;
}
