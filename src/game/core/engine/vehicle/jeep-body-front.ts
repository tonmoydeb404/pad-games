/** Jeep body: headlights, bull bar, winch and bumpers. */
import * as THREE from "three";
import { TAU } from "../../noise";
import type { JeepEngine } from "../jeep-engine";

/** Headlights (with spot lights), bull bar, winch and bumpers. */
export function addFrontEnd(this: JeepEngine, bodyGroup: THREE.Group, M: JeepEngine["M"]): void {
  // headlights
  for (const s of [-1, 1]) {
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.14, 16), M.blackSemi);
    housing.rotation.x = Math.PI / 2;
    housing.position.set(s * 0.56, 0.4, -1.9);
    bodyGroup.add(housing);
    const refl = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 10, 0, TAU, 0, Math.PI / 2), M.reflector);
    refl.rotation.x = Math.PI / 2;
    refl.position.set(s * 0.56, 0.4, -1.9);
    bodyGroup.add(refl);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.168, 18), M.lampGlass.clone());
    lens.position.set(s * 0.56, 0.4, -1.975);
    lens.rotation.y = Math.PI;
    this.headlampMeshes.push(lens);
    bodyGroup.add(lens);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.022, 6, 18), M.chrome);
    ring.position.set(s * 0.56, 0.4, -1.96);
    bodyGroup.add(ring);
    const ind = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.06), M.amber);
    ind.position.set(s * 0.3, 0.56, -1.93);
    bodyGroup.add(ind);
    const sl = new THREE.SpotLight(0xffe6b8, 0, 58, 0.55, 0.42, 1.3);
    sl.position.set(s * 0.56, 0.4, -2.0);
    sl.target.position.set(s * 0.5, -0.9, -16);
    bodyGroup.add(sl);
    bodyGroup.add(sl.target);
    this.headlights.push(sl);
  }

  // bull bar + fog lights
  const bar = new THREE.Group();
  // top rail across the nose, corner posts and a centre post, all in front of the grille
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.4, 8), M.blackMatte);
  rail.rotation.z = Math.PI / 2;
  rail.position.set(0, 0.5, -2.1);
  rail.castShadow = true;
  bar.add(rail);
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.62, 8), M.blackMatte);
    post.position.set(s * 0.7, 0.19, -2.1);
    bar.add(post);
    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8), M.blackMatte);
    wrap.rotation.x = Math.PI / 2;
    wrap.position.set(s * 0.7, 0.5, -1.95);
    bar.add(wrap);
  }
  const vbar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.62, 8), M.blackMatte);
  vbar.position.set(0, 0.19, -2.1);
  bar.add(vbar);
  for (const s of [-1, 1]) {
    const stay = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.55, 8), M.blackMatte);
    stay.position.set(s * 0.36, 0, -2.1);
    bar.add(stay);
    const link = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.36, 8), M.blackMatte);
    link.rotation.x = Math.PI / 2;
    link.position.set(s * 0.36, -0.18, -1.96);
    bar.add(link);
    const fogPod = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 12), M.blackMatte);
    fogPod.rotation.x = Math.PI / 2;
    fogPod.position.set(s * 0.28, 0.18, -2.12);
    bar.add(fogPod);
    const fogLens = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), M.yellowFog);
    fogLens.position.set(s * 0.28, 0.18, -2.162);
    fogLens.rotation.y = Math.PI;
    bar.add(fogLens);
  }
  bodyGroup.add(bar);

  // winch
  const winchBody = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.16, 0.2), M.blackSemi);
  winchBody.position.set(0, 0.06, -2.08);
  bodyGroup.add(winchBody);
  const winchDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.26, 12), M.winchCable);
  winchDrum.rotation.z = Math.PI / 2;
  winchDrum.position.set(0, 0.06, -2.08);
  bodyGroup.add(winchDrum);
  const solenoidBox = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.14), M.blackMatte);
  solenoidBox.position.set(0, 0.19, -2.08);
  bodyGroup.add(solenoidBox);
  const fairlead = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.05), M.chrome);
  fairlead.position.set(0, 0.06, -2.19);
  bodyGroup.add(fairlead);
  const winchHook = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.016, 6, 12), M.chrome);
  winchHook.position.set(0, 0.02, -2.22);
  winchHook.rotation.y = Math.PI / 2;
  bodyGroup.add(winchHook);

  // bumpers + shackles
  const fb = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.24, 0.28), M.blackMatte);
  fb.position.set(0, -0.02, -1.96);
  fb.castShadow = true;
  bodyGroup.add(fb);
  const rb = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.24, 0.26), M.blackMatte);
  rb.position.set(0, -0.02, 1.9);
  rb.castShadow = true;
  bodyGroup.add(rb);
  for (const s of [-1, 1]) {
    const fSh = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.02, 6, 12), M.shackleRed);
    fSh.position.set(s * 0.66, -0.02, -2.12);
    fSh.rotation.y = Math.PI / 2;
    bodyGroup.add(fSh);
    const rSh = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.02, 6, 12), M.shackleRed);
    rSh.position.set(s * 0.66, -0.02, 2.05);
    rSh.rotation.y = Math.PI / 2;
    bodyGroup.add(rSh);
  }
}
