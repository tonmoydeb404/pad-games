/** Instanced vegetation scattering and wind-sway shader patching. */
import * as THREE from "three";
import type { PackModel } from "../../assets";
import { hash2 } from "../../noise";
import type { JeepEngine } from "../jeep-engine";

export function scatterPack(
  this: JeepEngine,
  model: PackModel,
  placements: { x: number; y: number; z: number; rot: number; scale: number }[],
  opts: { sway?: number; cast?: boolean; tint?: boolean } = {},
): void {
  const scene = this.scene;
  if (!scene || placements.length === 0) return;
  const d = new THREE.Object3D();
  const col = new THREE.Color();
  for (const part of model.parts) {
    const mat = part.material as THREE.MeshStandardMaterial;
    const alphaBlend = !!mat.transparent || !!mat.alphaTest;
    const im = new THREE.InstancedMesh(part.geometry, part.material, placements.length);
    im.receiveShadow = true;
    placements.forEach((p, i) => {
      d.position.set(p.x, p.y, p.z);
      d.rotation.set(0, p.rot, 0);
      d.scale.setScalar(p.scale);
      d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
      if (opts.tint !== false) {
        const hv = hash2(i, 5);
        // near-white tint so instance colour variation never muddies the art
        col.setHSL(0.28 + (hv - 0.5) * 0.035, 0.22, 0.8 + hv * 0.15);
        im.setColorAt(i, col);
      }
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();

    const wantsShadow = (opts.cast ?? true) && this.Q.shadowsOn;
    if (wantsShadow) {
      if (alphaBlend) {
        // leaf quads: cut out the alpha holes in the shadow pass too
        const map = mat.map;
        if (map) {
          let dm = this.shadowDepthMats.get(map);
          if (!dm) {
            dm = new THREE.MeshDepthMaterial({
              depthPacking: THREE.RGBADepthPacking,
              map,
              alphaTest: 0.5,
            });
            this.shadowDepthMats.set(map, dm);
          }
          im.customDepthMaterial = dm;
          im.castShadow = true;
        }
      } else {
        im.castShadow = true;
      }
    }

    const sway = opts.sway ?? 0;
    if (sway > 0 && this.isFoliagePart(part.material)) {
      this.addWindSway(part.material, sway);
      this.vegetation.push({ mesh: im, amp: sway });
    }
    scene.add(im);
  }
}

export function isFoliagePart(this: JeepEngine, mat: THREE.Material): boolean {
  return /leaf|leaves|flower|grass|petal|plant|fruit/i.test(mat.name);
}

export function addWindSway(this: JeepEngine, mat: THREE.Material, amp: number): void {
  if (this.windMats.includes(mat)) return; // shared materials across models
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 };
    sh.vertexShader = `uniform float uTime;\n` + sh.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
    #ifdef USE_INSTANCING
      vec4 ipos = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
      float sway = sin(uTime*1.4 + ipos.x*0.35 + ipos.z*0.27) + sin(uTime*2.3 + ipos.z*0.5)*0.5;
      transformed.x += sway * ${amp.toFixed(4)} * max(transformed.y, 0.0);
      transformed.z += sway * ${amp.toFixed(4)} * 0.6 * max(transformed.y, 0.0);
    #endif`,
    );
    (mat.userData as { uTime?: { value: number } }).uTime = sh.uniforms.uTime as { value: number };
  };
  mat.needsUpdate = true;
  this.windMats.push(mat);
}

export function addInstanced(
  this: JeepEngine,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  count: number,
  placer: (d: THREE.Object3D, i: number) => boolean,
  cast = true,
): THREE.InstancedMesh | null {
  const scene = this.scene;
  if (!scene || count <= 0) return null;
  const im = new THREE.InstancedMesh(geo, mat, count);
  im.castShadow = cast && this.Q.shadowsOn;
  im.receiveShadow = true;
  const d = new THREE.Object3D();
  let n = 0;
  for (let i = 0; i < count; i++) {
    if (placer(d, i)) {
      d.updateMatrix();
      im.setMatrixAt(n++, d.matrix);
    }
  }
  im.count = n;
  im.instanceMatrix.needsUpdate = true;
  // Instance-aware bounds so frustum culling never drops visible plants.
  im.computeBoundingSphere();
  scene.add(im);
  return im;
}
