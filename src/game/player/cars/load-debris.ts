import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { BASE } from "./car-constants";
import { bake, collectMeshes } from "./car-meshes";
import type { CarPart } from "./car-types";

/**
 * Load the kit's 15 debris parts for crash effects. Each model is normalised
 * to ~0.3 units and centred. Resolves `[]` when unavailable; loaded once.
 */
let debrisCache: CarPart[] | null = null;
export async function loadDebrisParts(): Promise<CarPart[]> {
  if (debrisCache) return debrisCache;
  const NAMES = [
    "debris-bolt",
    "debris-bumper",
    "debris-door-window",
    "debris-door",
    "debris-drivetrain-axle",
    "debris-drivetrain",
    "debris-nut",
    "debris-plate-a",
    "debris-plate-b",
    "debris-plate-small-a",
    "debris-plate-small-b",
    "debris-spoiler-a",
    "debris-spoiler-b",
    "debris-tire",
  ];
  const loader = new GLTFLoader();
  const all = await Promise.all(
    NAMES.map(
      (n) =>
        new Promise<CarPart[]>((resolve) => {
          loader.load(
            `${BASE}/${n}.glb`,
            (gltf) => {
              try {
                const meshes = collectMeshes(gltf.scene);
                const parts: CarPart[] = [];
                const box = new THREE.Box3();
                for (const m of meshes) {
                  m.geometry.computeBoundingBox();
                  box.union(m.geometry.boundingBox!);
                  parts.push({ geometry: bake(m.geometry, m), material: m.material as THREE.Material });
                }
                const size = new THREE.Vector3();
                box.getSize(size);
                const k = 0.3 / Math.max(size.x, size.y, size.z, 1e-3);
                const c = new THREE.Vector3();
                box.getCenter(c);
                for (const p of parts) {
                  p.geometry.translate(-c.x, -c.y, -c.z);
                  p.geometry.scale(k, k, k);
                }
                resolve(parts);
              } catch {
                resolve([]);
              }
            },
            undefined,
            () => resolve([]),
          );
        }),
    ),
  );
  debrisCache = all.flat();
  return debrisCache;
}

