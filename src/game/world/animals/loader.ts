import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { AnimalCtx } from "./actor";
import { pickClips } from "./clips";
import { BASE } from "./constants";
import { measureSaddle } from "./saddle";
import { DEFS } from "./species";

/** Load every species GLB. Progress reports 0..1 across the pack. */
export async function loadPrototypes(ctx: AnimalCtx, onProgress?: (k: number) => void): Promise<void> {
  const loader = new GLTFLoader();
  let done = 0;
  await Promise.all(
    DEFS.map(
      (def) =>
        new Promise<void>((resolve) => {
          loader.load(
            `${BASE}/${def.file}.glb`,
            (gltf) => {
              // natural height at bind pose → uniform normalize scale
              const box = new THREE.Box3().setFromObject(gltf.scene);
              const size = new THREE.Vector3();
              box.getSize(size);
              const natural = Math.max(size.y, 1e-4);
              const scene = gltf.scene;
              // Generous bounding sphere (bind-pose union + pose margin) so
              // skinned meshes frustum-cull correctly — bind-pose bounds are
              // wrong once bones move, and disabling culling entirely would
              // render the whole population every frame.
              const union = new THREE.Box3();
              const tmp = new THREE.Box3();
              const sphereCenter = new THREE.Vector3();
              scene.updateMatrixWorld(true);
              scene.traverse((o) => {
                const m = o as THREE.Mesh;
                if (m.isMesh && m.geometry) {
                  m.castShadow = true;
                  m.receiveShadow = false;
                  if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
                  tmp.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
                  union.union(tmp);
                }
              });
              const sphereRadius = Math.max(union.getSize(sphereCenter).length(), 0.5);
              union.getCenter(sphereCenter);
              scene.traverse((o) => {
                const m = o as THREE.Mesh;
                if (m.isMesh && m.geometry) {
                  m.geometry.boundingSphere = new THREE.Sphere(sphereCenter.clone(), sphereRadius);
                }
              });
              ctx.prototypes.set(def.file, {
                scene,
                clips: pickClips(gltf.animations),
                scale: def.height / natural,
                saddle: (() => {
                  const sd = measureSaddle(scene, def.height / natural, def.height);
                  // a coiled/flat body can measure at or below the ground — never seat below a sliver of height
                  sd.y = Math.max(sd.y, def.height * 0.12);
                  return sd;
                })(),
              });
              done++;
              onProgress?.(done / DEFS.length);
              resolve();
            },
            undefined,
            () => {
              console.warn(`[animals] failed to load ${def.file}.glb — species skipped`);
              done++;
              onProgress?.(done / DEFS.length);
              resolve();
            },
          );
        }),
    ),
  );
}
