/** Jeep wheel: rounded all-terrain tyre with staggered chevron lugs on a spoked steel rim. */
import * as THREE from "three";
import { TAU } from "../../noise";
import type { JeepEngine } from "../jeep-engine";

const R = 0.5;
const W = 0.34;
const LUGS = 26;

/** Tyre carcass revolved around the axle: flat tread, rounded shoulders, slight sidewall bulge. */
function carcass(): THREE.LatheGeometry {
  const left: [number, number][] = [
    [0.3, -0.16], [0.36, -0.175], [0.43, -0.178], [0.475, -0.155], [0.496, -0.115], [0.5, -0.06], [0.5, 0],
  ];
  const right = left.slice(0, -1).reverse().map(([r, y]): [number, number] => [r, -y]);
  const pts = [...left, ...right].map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, 40);
  geo.rotateZ(Math.PI / 2); // lathe axis Y → axle X
  return geo;
}

/** Two staggered rows of chevron lugs sitting flush on the tread. */
function lugs(M: JeepEngine["M"]): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 0.045, 0.075), M.rubber, LUGS * 2);
  im.castShadow = true;
  const d = new THREE.Object3D();
  let n = 0;
  for (let row = 0; row < 2; row++) {
    const side = row === 0 ? -1 : 1;
    for (let i = 0; i < LUGS; i++) {
      const a = ((i + row * 0.5) / LUGS) * TAU;
      d.position.set(side * 0.09, Math.cos(a) * (R + 0.005), Math.sin(a) * (R + 0.005));
      d.rotation.set(a, -side * 0.45, 0); // local +Y radial, then a chevron yaw about it
      d.updateMatrix();
      im.setMatrixAt(n++, d.matrix);
    }
  }
  im.instanceMatrix.needsUpdate = true;
  return im;
}

export function buildWheel(this: JeepEngine): THREE.Group {
  const M = this.M;
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(carcass(), M.rubber);
  tyre.castShadow = true;
  tyre.receiveShadow = true;
  g.add(tyre);
  g.add(lugs(M));
  // centre rib so the tread reads as one band between the lug rows
  const rib = new THREE.Mesh(new THREE.TorusGeometry(R - 0.002, 0.03, 6, 40), M.rubber);
  rib.rotation.y = Math.PI / 2;
  g.add(rib);

  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, W * 0.9, 24), M.blackSemi);
  rim.rotation.z = Math.PI / 2;
  g.add(rim);
  for (const s of [-1, 1]) {
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.3, 24), M.blackSemi);
    face.rotation.y = (s * Math.PI) / 2;
    face.position.x = s * W * 0.46;
    g.add(face);
    const bead = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 6, 28), M.steel);
    bead.rotation.y = Math.PI / 2;
    bead.position.x = s * W * 0.46;
    g.add(bead);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU;
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.26, 0.075), M.steel);
      sp.position.set(s * W * 0.47, Math.cos(a) * 0.15, Math.sin(a) * 0.15);
      sp.rotation.x = a; // long axis (local Y) points out along the radius
      g.add(sp);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 12), M.chrome);
    hub.rotation.z = Math.PI / 2;
    hub.position.x = s * W * 0.5;
    g.add(hub);
  }
  return g;
}
