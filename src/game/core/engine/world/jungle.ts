/** Jungle build: vegetation, exposed roots and the distant silhouette bands. */
import * as THREE from "three";
import { mulberry, TAU } from "../../noise";
import { BOUND, ROAD_HALF } from "../config/world-constants";
import type { JeepEngine } from "../jeep-engine";
import { createPicker, createSplitter } from "./jungle-placement";

export function buildJungle(this: JeepEngine): void {
  const scene = this.scene;
  if (!scene) return;
  const rnd = mulberry(1337);
  const pick = createPicker(this, rnd);
  const splitByModel = createSplitter(this);

  // --- Quaternius pack vegetation (all trees/bushes/flowers/grass/rocks).
  const props = this.props;
  if (!props) {
    console.warn("[jeep] CC0 Quaternius pack missing — jungle vegetation skipped");
  } else {
    this.scatterTrees(props, pick, rnd, splitByModel);
    this.scatterUndergrowth(props, pick, rnd, splitByModel);
  }
  // --- exposed roots
  const rootG = new THREE.TorusGeometry(0.8, 0.13, 5, 9, Math.PI);
  const rootM = new THREE.MeshStandardMaterial({ color: 0x4a3a26, roughness: 0.95 });
  this.addInstanced(
    rootG,
    rootM,
    120,
    (d) => {
      const s = pick(ROAD_HALF - 0.6, ROAD_HALF + 2.2, BOUND - 3);
      if (!s) return false;
      d.position.set(s.x, s.y - 0.05, s.z);
      d.rotation.set(0, rnd() * TAU, 0);
      const sc = 0.6 + rnd() * 1.1;
      d.scale.setScalar(sc);
      return true;
    },
    false,
  );

  // --- distant jungle silhouette bands
  for (let b = 0; b < 3; b++) {
    const r = 470 + b * 90;
    const g = new THREE.CylinderGeometry(r, r, 60 + b * 26, 48, 1, true);
    const m = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({
        color: 0x5c7a63,
        transparent: true,
        opacity: 0.7 - b * 0.16,
        fog: true,
        depthWrite: false,
        side: THREE.BackSide,
      }),
    );
    m.material.color.setHSL(0.32, 0.14 - b * 0.03, 0.3 + b * 0.09);
    m.position.y = 18 + b * 12;
    m.renderOrder = -1;
    scene.add(m);
  }
}
