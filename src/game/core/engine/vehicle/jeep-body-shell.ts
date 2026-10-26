/** Jeep body: tub, hood, grille, fenders and windshield. */
import * as THREE from "three";
import type { JeepEngine } from "../jeep-engine";

/** Tub, hood, cowl and grille. */
export function addBodyShell(this: JeepEngine, bodyGroup: THREE.Group, M: JeepEngine["M"]): void {
  const tub = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.62, 3.55), M.redGloss);
  tub.position.set(0, 0.16, 0);
  tub.castShadow = true;
  tub.receiveShadow = true;
  bodyGroup.add(tub);
  const tubLower = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.3, 3.45), M.redDark);
  tubLower.position.set(0, -0.16, 0);
  tubLower.castShadow = true;
  bodyGroup.add(tubLower);
  for (const s of [-1, 1]) {
    const rock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 2.6), M.blackMatte);
    rock.position.set(s * 0.88, -0.24, 0.05);
    rock.castShadow = true;
    bodyGroup.add(rock);
    const mud = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 2.4), M.mudMat);
    mud.position.set(s * 0.93, -0.3, 0.05);
    bodyGroup.add(mud);
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 1.5), M.blackSemi);
    step.position.set(s * 0.98, -0.4, 0.05);
    step.castShadow = true;
    bodyGroup.add(step);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 3.4), M.blackMatte);
    seam.position.set(s * 0.87, 0.3, 0);
    bodyGroup.add(seam);
  }

  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.16, 1.18), M.redGloss);
  hood.position.set(0, 0.5, -1.3);
  hood.rotation.x = -0.035;
  hood.castShadow = true;
  bodyGroup.add(hood);
  const bulge = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.09, 0.8), M.redGloss);
  bulge.position.set(0, 0.58, -1.34);
  bulge.castShadow = true;
  bodyGroup.add(bulge);
  for (const s of [-1, 1]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.02, 1.15), M.blackMatte);
    line.position.set(s * 0.46, 0.585, -1.3);
    bodyGroup.add(line);
    const latch = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.06), M.chrome);
    latch.position.set(s * 0.62, 0.52, -1.86);
    bodyGroup.add(latch);
  }
  const cowl = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.16, 0.24), M.redDark);
  cowl.position.set(0, 0.56, -0.7);
  bodyGroup.add(cowl);

  for (const s of [-1, 1]) {
    const latchB = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.04), M.blackSemi);
    latchB.position.set(s * 0.84, 0.46, -1.3);
    bodyGroup.add(latchB);
    const latchT = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 6), M.chrome);
    latchT.rotation.z = Math.PI / 2;
    latchT.position.set(s * 0.84, 0.52, -1.3);
    bodyGroup.add(latchT);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.12), M.rubber);
    pad.position.set(s * 0.35, 0.59, -1.4);
    bodyGroup.add(pad);
  }

  // grille
  const grilleBacking = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.48, 0.02), M.blackMatte);
  grilleBacking.position.set(0, 0.34, -1.93);
  bodyGroup.add(grilleBacking);
  const grillePanel = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.52, 0.1), M.blackMatte);
  grillePanel.position.set(0, 0.34, -1.9);
  grillePanel.castShadow = true;
  bodyGroup.add(grillePanel);
  for (let k = 0; k < 7; k++) {
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.06), M.redDark);
    slot.position.set(-0.54 + k * 0.18, 0.34, -1.945);
    bodyGroup.add(slot);
  }
  const grilleFrame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 0.06), M.redGloss);
  grilleFrame.position.set(0, 0.34, -1.86);
  bodyGroup.add(grilleFrame);
}

/** Wheel arches, flares and the windshield. */
export function addFendersAndGlass(this: JeepEngine, bodyGroup: THREE.Group, M: JeepEngine["M"]): void {
  // fenders: a flat flare shelf over each tyre with a half-round lip, centred on the axle
  for (let i = 0; i < 4; i++) {
    const p = this.wheelPos[i];
    const side = Math.sign(p.x);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.04, 6, 24, Math.PI), M.blackMatte);
    lip.position.set(side * 1.06, -0.42, p.z);
    lip.rotation.y = Math.PI / 2;
    lip.castShadow = true;
    bodyGroup.add(lip);
    const flare = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 1.32), M.blackMatte);
    flare.position.set(side * 0.96, 0.23, p.z);
    flare.castShadow = true;
    bodyGroup.add(flare);
    const well = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.4, 16, 1, true), M.blackMatte);
    well.rotation.z = Math.PI / 2;
    well.position.set(side * 0.72, -0.42, p.z);
    (well.material as THREE.MeshStandardMaterial).side = THREE.BackSide;
    bodyGroup.add(well);
  }
  for (const s of [-1, 1]) {
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.02), M.rubber);
    flap.position.set(s * 0.88, -0.22, 1.64);
    bodyGroup.add(flap);
  }

  // windshield
  const wsAngle = -0.3;
  const wsFrame = new THREE.Group();
  const fTop = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.09, 0.09), M.blackSemi);
  fTop.position.set(0, 1.28, -0.98);
  wsFrame.add(fTop);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.86, 0.09), M.blackSemi);
    side.position.set(s * 0.8, 0.9, -0.87);
    side.rotation.x = wsAngle;
    wsFrame.add(side);
  }
  const fBot = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.09), M.blackSemi);
  fBot.position.set(0, 0.6, -0.76);
  wsFrame.add(fBot);
  wsFrame.children.forEach((c) => (c.castShadow = true));
  bodyGroup.add(wsFrame);
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.56, 0.8), M.glass);
  ws.position.set(0, 0.94, -0.885);
  ws.rotation.x = wsAngle;
  ws.renderOrder = 3;
  bodyGroup.add(ws);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.02, 0.02), M.blackMatte);
    w.position.set(s * 0.35, 0.63, -0.8);
    w.rotation.z = s * 0.22;
    bodyGroup.add(w);
  }
}
