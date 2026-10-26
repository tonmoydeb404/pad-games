/**
 * Asset loader for Jungle Jeep — Quaternius "Ultimate Stylized Nature"
 * (CC0 1.0, see public/assets/jeep/CREDITS.md).
 *
 * Served from `/assets/jeep/nature`: 36 .gltf+.bin models with external
 * textures, plus 27 self-contained .glb (palms, rocks, NormalTree, PineTree,
 * Plant and Petals converted from the pack's OBJ exports, recoloured below
 * since the OBJ MTLs are Blender-gray).
 *
 * Every model is normalised so the engine can treat them uniformly:
 *   - origin moved to ground centre (minY = 0)
 *   - height scaled to 1 unit — place with `scale = desiredHeight`
 *
 * Models keep all their parts (bark vs leaves materials — a few InstancedMeshes
 * per variant). All failures are swallowed: the engine gets `null`/empty lists
 * and a warning, never a crash.
 */
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { extract } from "./extract";
import { BASE, GLTF_NAMES, OBJ_CONVERTED } from "./names";
import type { JeepProps, PackModel } from "./types";

/**
 * Load the whole pack from `/assets/jeep/nature`. Resolves with `null` when
 * anything goes wrong (offline, files purged, GLTF bug) — never throws.
 */
export async function loadJeepProps(): Promise<JeepProps | null> {
  const loader = new GLTFLoader();
  const entries: [string, string][] = [
    ...GLTF_NAMES.map((n) => [n, `${BASE}/${n}.gltf`] as [string, string]),
    ...OBJ_CONVERTED.map((n) => [n, `${BASE}/${n}.glb`] as [string, string]),
  ];
  const loaded = await Promise.all(
    entries.map(
      ([name, url]) =>
        new Promise<[string, PackModel | null]>((resolve) => {
          loader.load(
            url,
            (gltf) => resolve([name, extract(gltf.scene)]),
            undefined,
            () => resolve([name, null]),
          );
        }),
    ),
  );
  const map = new Map(loaded);
  const out: JeepProps = {
    trees: [],
    birches: [],
    pines: [],
    palms: [],
    dead: [],
    bushes: [],
    flowers: [],
    plants: [],
    petals: [],
    grass: [],
    rocks: [],
  };
  const put = (name: string, bucket: keyof JeepProps): void => {
    const m = map.get(name);
    if (m) (out[bucket] as PackModel[]).push(m);
  };
  for (let i = 1; i <= 5; i++) put(`MapleTree_${i}`, "trees");
  for (let i = 1; i <= 5; i++) put(`NormalTree_${i}`, "trees");
  for (let i = 1; i <= 5; i++) put(`BirchTree_${i}`, "birches");
  for (let i = 1; i <= 5; i++) put(`PineTree_${i}`, "pines");
  for (let i = 1; i <= 5; i++) put(`PalmTree_${i}`, "palms");
  for (let i = 1; i <= 10; i++) put(`DeadTree_${i}`, "dead");
  for (const n of ["Bush", "Bush_Flowers", "Bush_Large", "Bush_Large_Flowers", "Bush_Small", "Bush_Small_Flowers"]) put(n, "bushes");
  for (const n of ["Flower_1", "Flower_2", "Flower_1_Clump", "Flower_2_Clump", "Flower_3_Clump", "Flower_4_Clump", "Flower_5_Clump"]) put(n, "flowers");
  for (const n of ["Plant_1", "Plant_2", "Plant_Flowers"]) put(n, "plants");
  for (const n of ["Petals_1", "Petals_2", "Petals_3", "Petals_4"]) put(n, "petals");
  for (const n of ["Grass_Large", "Grass_Large_Extruded", "Grass_Small"]) put(n, "grass");
  for (let i = 1; i <= 5; i++) put(`Rock_${i}`, "rocks");

  const total = Object.values(out).reduce((n, arr) => n + arr.length, 0);
  if (out.trees.length === 0 && out.palms.length === 0) {
    console.warn("[jeep] Quaternius pack failed to load:", total, "models usable");
    return null;
  }
  return out;
}
