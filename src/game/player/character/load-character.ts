import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { BASE, MODEL_YAW } from "./character-constants";
import { createAnim } from "./character-anim";
import { applySkins } from "./character-skins";
import type { JungleCharacter, SkinId } from "./character-types";
import { createCharacter } from "./create-character";
import { createPoseState, lowestFoot } from "./pose-state";

/**
 * Load the explorer and apply a skin. Resolves with `null` when anything goes
 * wrong (missing files, GLTF bug) — the caller falls back to a no-explorer
 * session, never a crash.
 */
export async function loadJungleCharacter(skin: SkinId = "skaterMaleA"): Promise<JungleCharacter | null> {
  try {
    const gltf = await new GLTFLoader().loadAsync(`${BASE}/character.glb`);
    const s = createPoseState(gltf.scene, MODEL_YAW);
    const skins = await applySkins(gltf.scene, skin);
    const anim = createAnim(gltf.animations, s.model);
    anim.mixer.update(0);
    if (s.footBones.length) s.restSole = lowestFoot(s);
    return createCharacter(s, anim, skins);
  } catch (err) {
    console.warn("[jeep] explorer failed to load — walking disabled:", err);
    return null;
  }
}
