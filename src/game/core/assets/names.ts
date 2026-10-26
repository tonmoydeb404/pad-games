export const BASE = "/assets/jeep/nature";

export const GLTF_NAMES = [
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
export const OBJ_CONVERTED = [
  ...[1, 2, 3, 4, 5].map((i) => `PalmTree_${i}`),
  ...[1, 2, 3, 4, 5].map((i) => `NormalTree_${i}`),
  ...[1, 2, 3, 4, 5].map((i) => `PineTree_${i}`),
  ...[1, 2, 3, 4, 5].map((i) => `Rock_${i}`),
  "Plant_1",
  "Plant_2",
  "Plant_Flowers",
  ...[1, 2, 3, 4].map((i) => `Petals_${i}`),
];
