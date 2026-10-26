import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CAR_CATALOG } from "./car-catalog";
import { BASE } from "./car-constants";
import type { LoadedCar } from "./car-types";
import { normalise } from "./normalise";

/**
 * Load and normalise one vehicle. Resolves `null` when the model is missing
 * or unreadable. Results are cached — repeated selections are instant.
 */
export async function loadCar(id: string): Promise<LoadedCar | null> {
  const spec = CAR_CATALOG.find((c) => c.id === id);
  if (!spec) return null;
  if (!loadCar.cache) loadCar.cache = new Map<string, LoadedCar | null>();
  const hit = loadCar.cache.get(id);
  if (hit !== undefined) return hit;

  const car = await new Promise<LoadedCar | null>((resolve) => {
    new GLTFLoader().load(
      `${BASE}/${id}.glb`,
      (gltf) => {
        try {
          resolve(normalise(spec, gltf.scene));
        } catch (err) {
          console.warn(`[jeep/cars] failed to normalise ${id}:`, err);
          resolve(null);
        }
      },
      undefined,
      () => resolve(null),
    );
  });
  loadCar.cache.set(id, car);
  return car;
}
loadCar.cache = null as Map<string, LoadedCar | null> | null;
