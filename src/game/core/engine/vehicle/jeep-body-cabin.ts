/** Jeep body: roll cage, mirrors, doors, rear and roof accessories. */
import * as THREE from "three";
import type { JeepEngine } from "../jeep-engine";

/** Roll cage, roof light bar, mirrors and doors. */
export function addCageAndDoors(this: JeepEngine, bodyGroup: THREE.Group, M: JeepEngine["M"]): void {
  // roll cage
  const cageM = M.blackSemi;
  const cage = new THREE.Group();
  const tube = (len: number, r = 0.05) => new THREE.CylinderGeometry(r, r, len, 8);
  for (const s of [-1, 1]) {
    const hoopV = new THREE.Mesh(tube(1.05), cageM);
    hoopV.position.set(s * 0.8, 0.86, 0.62);
    cage.add(hoopV);
    const rearStay = new THREE.Mesh(tube(1.25), cageM);
    rearStay.position.set(s * 0.8, 0.94, 1.06);
    rearStay.rotation.x = -0.78; // top end forward at the hoop, bottom end back at the tail
    cage.add(rearStay);
    const roofRail = new THREE.Mesh(tube(1.75), cageM);
    roofRail.rotation.x = Math.PI / 2;
    roofRail.position.set(s * 0.8, 1.36, -0.2);
    cage.add(roofRail);
    const diag = new THREE.Mesh(tube(0.9), cageM);
    diag.position.set(s * 0.8, 0.95, 0.15);
    diag.rotation.x = -0.9;
    cage.add(diag);
  }
  const hoopTop = new THREE.Mesh(tube(1.6), cageM);
  hoopTop.rotation.z = Math.PI / 2;
  hoopTop.position.set(0, 1.38, 0.62);
  cage.add(hoopTop);
  const roofFront = new THREE.Mesh(tube(1.6), cageM);
  roofFront.rotation.z = Math.PI / 2;
  roofFront.position.set(0, 1.32, -0.98);
  cage.add(roofFront);
  const roofMid = new THREE.Mesh(tube(1.6, 0.04), cageM);
  roofMid.rotation.z = Math.PI / 2;
  roofMid.position.set(0, 1.37, -0.2);
  cage.add(roofMid);
  cage.children.forEach((c) => (c.castShadow = true));
  bodyGroup.add(cage);

  // roof light bar
  const lbBase = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.1, 0.12), M.blackMatte);
  lbBase.position.set(0, 1.46, -0.92);
  lbBase.castShadow = true;
  bodyGroup.add(lbBase);
  for (let k = 0; k < 4; k++) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.07, 12), M.lampGlass.clone());
    l.rotation.x = Math.PI / 2;
    l.position.set(-0.42 + k * 0.28, 1.46, -1.0);
    this.roofLamps.push(l);
    bodyGroup.add(l);
  }

  // mirrors
  for (const s of [-1, 1]) {
    const armM = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.26, 6), M.blackSemi);
    armM.position.set(s * 0.92, 0.98, -0.86);
    armM.rotation.z = s * 1.0;
    bodyGroup.add(armM);
    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.13), M.blackMatte);
    shell.position.set(s * 1.06, 1.0, -0.86);
    bodyGroup.add(shell);
    const mir = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.11), M.mirror);
    mir.position.set(s * 1.02, 1.0, -0.855);
    mir.rotation.y = ((s * Math.PI) / 2) * 1.0 + (s < 0 ? 0.2 : -0.2);
    bodyGroup.add(mir);
  }

  // doors
  for (const s of [-1, 1]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.44, 1.18), M.redGloss);
    door.position.set(s * 0.855, 0.4, -0.08);
    door.castShadow = true;
    bodyGroup.add(door);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.2), M.chrome);
    handle.position.set(s * 0.92, 0.48, 0.22);
    bodyGroup.add(handle);
    for (const dz of [-0.52, 0.42]) {
      const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.1, 7), M.blackSemi);
      hinge.position.set(s * 0.9, 0.4, dz);
      bodyGroup.add(hinge);
    }
  }
}

/** Tail, spare wheel, plate, antenna and snorkel. */
export function addRearAndMounts(this: JeepEngine, bodyGroup: THREE.Group, M: JeepEngine["M"]): void {
  // rear
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.72, 0.1), M.redGloss);
  tail.position.set(0, 0.28, 1.78);
  tail.castShadow = true;
  bodyGroup.add(tail);
  const tailSeam = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.02, 0.02), M.blackMatte);
  tailSeam.position.set(0, 0.6, 1.84);
  bodyGroup.add(tailSeam);
  for (const s of [-1, 1]) {
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.07), M.brake.clone());
    bl.position.set(s * 0.66, 0.4, 1.845);
    this.brakeMeshes.push(bl);
    bodyGroup.add(bl);
    const rl = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.06), M.reverse.clone());
    rl.position.set(s * 0.66, 0.18, 1.845);
    this.reverseMeshes.push(rl);
    bodyGroup.add(rl);
  }
  const spare = this.buildWheel();
  spare.scale.setScalar(0.94);
  spare.rotation.y = Math.PI / 2;
  spare.position.set(0, 0.56, 2.04);
  bodyGroup.add(spare);
  const carrier = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.2), M.blackMatte);
  carrier.position.set(0, 0.56, 1.9);
  bodyGroup.add(carrier);
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 0.17),
    new THREE.MeshStandardMaterial({ map: this.plateTexture(), roughness: 0.6 }),
  );
  plate.position.set(-0.56, 0.06, 1.845);
  bodyGroup.add(plate);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.035, 14), M.chrome);
  cap.rotation.z = Math.PI / 2;
  cap.position.set(-0.88, 0.28, 1.1);
  bodyGroup.add(cap);

  // antenna
  const antBase = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.12, 8), M.blackSemi);
  antBase.position.set(0.86, 0.64, 1.76);
  bodyGroup.add(antBase);
  const antWhip = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 1.45, 6), M.steel);
  antWhip.position.set(0.86, 1.4, 1.76);
  antWhip.rotation.z = 0.08; // leans inward
  bodyGroup.add(antWhip);
  const antTip = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), M.chrome);
  antTip.position.set(0.802, 2.125, 1.76);
  bodyGroup.add(antTip);

  // snorkel: rises from the right fender along the windshield pillar, intake facing forward
  const snork = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.9, 10), M.blackMatte);
  snork.position.set(0.94, 0.88, -1.03);
  bodyGroup.add(snork);
  for (const y of [0.62, 1.1]) {
    const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.14), M.blackSemi);
    clamp.position.set(0.9, y, -0.98);
    bodyGroup.add(clamp);
  }
  const snorkHead = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 12), M.blackMatte);
  snorkHead.rotation.x = Math.PI / 2;
  snorkHead.position.set(0.94, 1.36, -1.08);
  bodyGroup.add(snorkHead);
  const snorkMouth = new THREE.Mesh(new THREE.CircleGeometry(0.065, 12), M.blackSemi);
  snorkMouth.rotation.y = Math.PI;
  snorkMouth.position.set(0.94, 1.36, -1.162);
  bodyGroup.add(snorkMouth);
}
