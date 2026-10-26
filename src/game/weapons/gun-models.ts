/**
 * Blaster Kit models for the on-foot guns. Each GLB (modelled barrel → -Z) is
 * turned and normalised into a hand-held rig: barrel along +Z, grip at the origin, scaled to the gun's
 * on-screen length — so the character just has to put the origin in its
 * hand and point +Z where it aims.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GUNS, type GunDef } from "./weapons";

const BASE = "/assets/jeep/blasters";

/** On-screen length (m) per gun, pistol → sniper. */
const LENGTH: Record<string, number> = {
  "blaster-b": 0.34,
  "blaster-h": 0.5,
  "blaster-e": 0.8,
  "blaster-l": 0.66,
  "blaster-q": 0.92,
};

export interface GunModel {
  /** Barrel along +Z, grip at the origin. */
  root: THREE.Group;
  /** Barrel tip in `root`'s space (muzzle flash, tracer start). */
  muzzle: THREE.Vector3;
  /** Held length (m). */
  length: number;
}

const cache = new Map<string, Promise<GunModel | null>>();

/** Load (once) and normalise a blaster; resolves null if the file is missing. */
export function loadGunModel(def: GunDef): Promise<GunModel | null> {
  let hit = cache.get(def.model);
  if (!hit) {
    hit = new GLTFLoader()
      .loadAsync(`${BASE}/${def.model}.glb`)
      .then((gltf) => {
        const raw = gltf.scene;
        // Kenney blasters are modelled barrel-toward -Z (thin end at low z, grip and
        // stock at high z — checked against the vertex data). The rig wants +Z.
        raw.rotation.y = Math.PI;
        raw.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(raw);
        const size = box.getSize(new THREE.Vector3());
        const len = LENGTH[def.model] ?? 0.5;
        const k = len / Math.max(size.z, 1e-4);
        const holder = new THREE.Group();
        holder.add(raw);
        raw.scale.setScalar(k);
        // grip: a little behind the middle, around the lower third of the body
        const z0 = box.min.z * k + len * 0.3;
        const cx = ((box.min.x + box.max.x) / 2) * k;
        const gy = box.min.y * k + (box.max.y - box.min.y) * k * 0.62;
        raw.position.set(-cx, -gy, -z0);
        raw.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.frustumCulled = false;
          }
        });
        const muzzle = new THREE.Vector3(0, ((box.max.y - box.min.y) * k * 0.15) - 0.0, box.max.z * k - z0 + 0.02);
        return { root: holder, muzzle, length: len } satisfies GunModel;
      })
      .catch((err) => {
        console.warn(`[jeep] gun model ${def.model} failed to load`, err);
        return null;
      });
    cache.set(def.model, hit);
  }
  return hit;
}

/** Load every gun up front (a few hundred KB); results line up with GUNS. */
export function loadAllGunModels(): Promise<(GunModel | null)[]> {
  return Promise.all(GUNS.map(loadGunModel));
}
