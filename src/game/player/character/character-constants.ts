import type { SkinId } from "./character-types";

export const CHARACTER_HEIGHT = 1.72;

/** FBX source faces +Z; engine forward is -Z. */
export const MODEL_YAW = Math.PI;

export const BASE = "/assets/jeep/character";

export const SKINS: SkinId[] = ["skaterMaleA", "skaterFemaleA", "criminalMaleA", "cyborgFemaleA"];

/** Hip height — root > pivot (rolls / falls rotate about it) > model. */
export const PIVOT_Y = 0.9;

/** Bone → the child its direction is measured toward. */
export const AIM_CHILD: Record<string, string> = {
  LeftArm: "LeftForeArm",
  LeftForeArm: "LeftHand",
  RightArm: "RightForeArm",
  RightForeArm: "RightHand",
  LeftUpLeg: "LeftLeg",
  LeftLeg: "LeftFoot",
  RightUpLeg: "RightLeg",
  RightLeg: "RightFoot",
};
