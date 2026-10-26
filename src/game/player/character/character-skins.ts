import * as THREE from "three";
import { BASE } from "./character-constants";
import type { SkinId } from "./character-types";

export interface CharacterSkins {
  setSkin(id: SkinId): Promise<void>;
  dispose(): void;
}

/** Apply a skin to every mesh in `scene`; resolves the live-swap handle. */
export async function applySkins(scene: THREE.Object3D, skin: SkinId): Promise<CharacterSkins> {
  const texLoader = new THREE.TextureLoader();
  const loadSkin = async (id: SkinId): Promise<THREE.Texture> => {
    const t = await texLoader.loadAsync(`${BASE}/skins/${id}.png`);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  let tex = await loadSkin(skin);
  let meshes = 0;
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshes++;
    mesh.castShadow = true;
    mesh.frustumCulled = false; // skinned bounds lie — never cull
    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.map = tex;
    mat.color.set(0xffffff);
    mat.roughness = 0.72;
    mat.metalness = 0;
    mat.needsUpdate = true;
  });
  if (meshes === 0) throw new Error("no meshes in character.glb");
  return {
    async setSkin(id: SkinId): Promise<void> {
      const next = await loadSkin(id);
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.map = next;
        mat.needsUpdate = true;
      });
      tex.dispose();
      tex = next;
    },
    dispose(): void {
      tex.dispose();
    },
  };
}
