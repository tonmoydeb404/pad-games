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
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export interface PackPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

export interface PackModel {
  parts: PackPart[];
  /**
   * Measured trunk footprint at the base, in the model's normalised units
   * (height = 1, xz centred on the bounding box). Bent trees have their root
   * offset from the centre, so colliders use this instead of the placement
   * point. Undefined for models without woody parts.
   */
  trunk?: { x: number; z: number; r: number };
}

const BASE = "/assets/jeep/nature";

const GLTF_NAMES = [
  ...[1, 2, 3, 4, 5].map((i) => `MapleTree_${i}`),
  ...[1, 2, 3, 4, 5].map((i) => `BirchTree_${i}`),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => `DeadTree_${i}`),
  "Bush",
  "Bush_Flowers",
  "Bush_Large",
  "Bush_Large_Flowers",
  "Bush_Small",
  "Bush_Small_Flowers",
  "Flower_1",
  "Flower_2",
  "Flower_1_Clump",
  "Flower_2_Clump",
  "Flower_3_Clump",
  "Flower_4_Clump",
  "Flower_5_Clump",
  "Grass_Large",
  "Grass_Large_Extruded",
  "Grass_Small",
];

/** Converted from the pack's OBJs; OBJ MTLs ship uncoloured (Blender gray). */
const OBJ_CONVERTED = [
  ...[1, 2, 3, 4, 5].map((i) => `PalmTree_${i}`),
  ...[1, 2, 3, 4, 5].map((i) => `NormalTree_${i}`),
  ...[1, 2, 3, 4, 5].map((i) => `PineTree_${i}`),
  ...[1, 2, 3, 4, 5].map((i) => `Rock_${i}`),
  "Plant_1",
  "Plant_2",
  "Plant_Flowers",
  ...[1, 2, 3, 4].map((i) => `Petals_${i}`),
];

export interface JeepProps {
  /** leafy canopy — maples + NormalTree cousins, mixed at scatter time */
  trees: PackModel[];
  /** birches, sparse silhouette accents */
  birches: PackModel[];
  /** conifers for the far ring */
  pines: PackModel[];
  /** palms, height-normalised */
  palms: PackModel[];
  /** dead trees for undergrowth dressing */
  dead: PackModel[];
  bushes: PackModel[];
  /** flower clumps + singles */
  flowers: PackModel[];
  /** plant sprigs (Plant_1/2 + Plant_Flowers) — low undergrowth */
  plants: PackModel[];
  /** petal ground scatter */
  petals: PackModel[];
  grass: PackModel[];
  rocks: PackModel[];
}

const FOLIAGE_RE = /leaf|leaves|flower|grass|petal|plant|fruit/i;

/**
 * Recolour the pack's OBJ-derived GLBs, whose MTLs are Blender-gray (Kd 0.64).
 * Names follow the pack's material naming: `<Family>_Bark`, `<Family>_Leaves`,
 * plain `Flowers` on plants/petals, plain `Rock`. Returns true when matched.
 */
function recolorConverted(name: string, material: THREE.MeshStandardMaterial): boolean {
  if (/leaves/i.test(name)) {
    if (/pine/i.test(name)) {
      // conifer needles: deep blue-green
      material.color.setHSL(0.33 + Math.random() * 0.03, 0.55, 0.17 + Math.random() * 0.05);
    } else {
      material.color.setHSL(0.28 + Math.random() * 0.05, 0.62, 0.3 + Math.random() * 0.08);
    }
    material.roughness = 0.85;
    return true;
  }
  if (/trunk|bark/i.test(name)) {
    material.color.setHex(/pine/i.test(name) ? 0x50402a : 0x6a5738);
    material.roughness = 0.95;
    return true;
  }
  if (/rock|stone/i.test(name)) {
    material.color.setHSL(0.09, 0.08, 0.45 + Math.random() * 0.1);
    material.roughness = 0.94;
    return true;
  }
  if (/flower|petal/i.test(name)) {
    // untextured plant sprigs / petals → pastel, hue keyed by mesh so a
    // scatter of one model doesn't come out one flat colour
    material.color.setHSL(Math.random(), 0.6, 0.68 + Math.random() * 0.08);
    material.roughness = 0.8;
    return true;
  }
  return false;
}

/**
 * Extract one model — all parts keep their own materials (GLTFLoader already
 * produces MeshStandardMaterial with textures, alphaMode, doubleSided…).
 */
function extract(gltfScene: THREE.Group): PackModel | null {
  const meshes: THREE.Mesh[] = [];
  gltfScene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) meshes.push(mesh);
  });
  if (meshes.length === 0) return null;

  const parts: PackPart[] = [];
  for (const m of meshes) {
    const g = m.geometry.clone();
    m.updateWorldMatrix(true, false);
    g.applyMatrix4(m.matrixWorld);
    if (!g.getAttribute("normal")) g.computeVertexNormals();

    let material = m.material as THREE.MeshStandardMaterial;
    if (material instanceof THREE.MeshBasicMaterial) {
      // unlit OBJ conversions (palms/rocks) → lit standard material, recoloured
      const std = new THREE.MeshStandardMaterial({
        color: material.color.clone(),
        roughness: 0.9,
        metalness: 0,
        side: material.side,
      });
      if (!recolorConverted(material.name ?? "", std)) {
        std.color.setHex(0x9a9a92); // neutral fallback if the name mismatched
      }
      material = std;
    } else if (!("map" in material && material.map)) {
      // OBJ-derived glbs have no textures — colour them by slot name.
      // Textured glTF models (maples, bushes…) are left untouched.
      recolorConverted(material.name ?? "", material as THREE.MeshStandardMaterial);
    }
    if (FOLIAGE_RE.test(material.name)) (material.userData as { foliage?: boolean }).foliage = true;
    parts.push({ geometry: g, material: material as THREE.Material });
  }

  // Normalise all parts together: origin at ground centre, union height = 1.
  // translate first (minY → 0, xz centred), then scale about the origin.
  const union = new THREE.Box3();
  const tmp = new THREE.Box3();
  for (const p of parts) {
    p.geometry.computeBoundingBox();
    tmp.copy(p.geometry.boundingBox!);
    union.union(tmp);
  }
  const h = Math.max(1e-4, union.max.y - union.min.y);
  const cx = (union.min.x + union.max.x) * 0.5;
  const cz = (union.min.z + union.max.z) * 0.5;
  for (const p of parts) {
    p.geometry.translate(-cx, -union.min.y, -cz);
    p.geometry.scale(1 / h, 1 / h, 1 / h);
    p.geometry.computeBoundingBox();
    p.geometry.computeBoundingSphere();
  }

  return { parts, trunk: measureTrunk(parts) };
}

/** Footprint of the non-foliage geometry in the lowest slice of the model. */
function measureTrunk(parts: PackPart[]): PackModel["trunk"] {
  for (const slice of [0.08, 0.16]) {
    let n = 0;
    let sx = 0;
    let sz = 0;
    for (const p of parts) {
      if (FOLIAGE_RE.test(p.material.name)) continue;
      const pos = p.geometry.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) > slice) continue;
        sx += pos.getX(i);
        sz += pos.getZ(i);
        n++;
      }
    }
    if (n < 3) continue;
    const x = sx / n;
    const z = sz / n;
    let r = 0;
    for (const p of parts) {
      if (FOLIAGE_RE.test(p.material.name)) continue;
      const pos = p.geometry.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) > slice) continue;
        r = Math.max(r, Math.hypot(pos.getX(i) - x, pos.getZ(i) - z));
      }
    }
    return { x, z, r };
  }
  return undefined;
}

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
