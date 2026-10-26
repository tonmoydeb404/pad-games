import type * as THREE from "three";

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
