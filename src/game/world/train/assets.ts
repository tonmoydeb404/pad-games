import type * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { BASE } from "./constants";

/**
 * Load `[name, put]` GLBs from the train asset folder in parallel; failures
 * warn and degrade (the caller simply has fewer models).
 */
export async function loadTrainModels(
  entries: [string, (scene: THREE.Object3D) => void][],
  onProgress?: (k: number) => void,
): Promise<void> {
  const loader = new GLTFLoader();
  let done = 0;
  await Promise.all(
    entries.map(
      ([name, put]) =>
        new Promise<void>((resolve) => {
          loader.load(
            `${BASE}/${name}.glb`,
            (g) => {
              put(g.scene);
              onProgress?.(++done / entries.length);
              resolve();
            },
            undefined,
            () => {
              console.warn(`[jeep] train asset missing: ${name}.glb`);
              onProgress?.(++done / entries.length);
              resolve();
            },
          );
        }),
    ),
  );
}
