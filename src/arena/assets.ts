/**
 * Arena asset loading — Kenney GLB packs → three.js scenes, with a single
 * progress callback for the loading screen and a null result on failure
 * (the renderer falls back to the original coloured-box art).
 *
 * The packs are laid out so each GLB's relative "Textures/colormap.png"
 * resolves against its own URL.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ASSET_VERSION, WEAPONS } from "@pad/arena-shared";

export interface LoadedModel {
  /** original scene (never added to the live graph) */
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

export interface ArenaAssets {
  dungeon: Map<string, LoadedModel>;
  blasters: Map<string, LoadedModel>;
}

const V = `?v=${ASSET_VERSION}`;
const dungeonUrl = (m: string): string => `/assets/arena/dungeon/${m}.glb${V}`;
const blasterUrl = (m: string): string => `/assets/arena/blasters/${m}.glb${V}`;

/** Every dungeon model the game renders (tiles + props + decor + pickups + rigs). */
const DUNGEON_MODELS = [
  "wall",
  "wall-half",
  "wall-opening",
  "gate",
  "floor",
  "floor-detail",
  "stairs",
  "column",
  "dirt",
  "barrel",
  "chest",
  "table",
  "chair",
  "pot",
  "rocks",
  "banner",
  "trap",
  "potion",
  "character-human",
  "character-orc",
];

const BLASTER_MODELS = [
  ...new Set(WEAPONS.map((w) => w.modelId)),
  "grenade-a",
  "clip-large",
  "crate-small",
  "crate-medium",
  "crate-wide",
  "target-large",
  "target-small",
  "target-fragment-large",
  "target-fragment-small",
  "bullet-foam-tip",
  "smoke",
];

/** Load every arena model; resolves null if anything 404s or WebGL prep fails. */
export function loadArenaAssets(onProgress?: (frac: number) => void): Promise<ArenaAssets | null> {
  const entries: { map: Map<string, LoadedModel>; id: string; url: string }[] = [];
  const dungeon = new Map<string, LoadedModel>();
  const blasters = new Map<string, LoadedModel>();
  for (const m of DUNGEON_MODELS) entries.push({ map: dungeon, id: m, url: dungeonUrl(m) });
  for (const m of BLASTER_MODELS) entries.push({ map: blasters, id: m, url: blasterUrl(m) });

  return new Promise((resolve) => {
    const loader = new GLTFLoader();
    let done = 0;
    let failed = false;
    const tick = (): void => {
      done++;
      onProgress?.(done / entries.length);
      if (done === entries.length && !failed) resolve({ dungeon, blasters });
    };
    for (const e of entries) {
      loader.load(
        e.url,
        (gltf) => {
          if (failed) return;
          const scene = gltf.scene as THREE.Group;
          scene.traverse((o) => {
            if (o instanceof THREE.Mesh) {
              o.castShadow = false;
              o.receiveShadow = false;
              o.frustumCulled = true;
            }
          });
          e.map.set(e.id, { scene, animations: gltf.animations ?? [] });
          tick();
        },
        undefined,
        () => {
          // one missing model → the whole pack is treated as unavailable
          if (!failed) {
            failed = true;
            resolve(null);
          }
        },
      );
    }
  });
}

/** Deep-clone a loaded model scene (shares geometry/materials — cheap). */
export function instance(model: LoadedModel): THREE.Group {
  const clone = model.scene.clone(true);
  clone.scale.setScalar(1);
  return clone;
}
