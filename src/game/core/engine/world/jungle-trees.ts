/** Jungle canopy: maples, dead trees, palms, birches and the far pine ring. */
import type { JeepProps } from "../../assets";
import { TAU } from "../../noise";
import { BOUND, ROAD_HALF, TREE_LINE } from "../config/world-constants";
import type { JeepEngine } from "../jeep-engine";
import type { Picker, Plant, Splitter } from "./jungle-placement";

export function scatterTrees(this: JeepEngine, props: JeepProps, pick: Picker, rnd: () => number, splitByModel: Splitter): void {
  // trees: maples (canopy) with a dead-tree undergrowth share
  const treeData: Plant[] = [];
  for (let i = 0; i < this.Q.trees; i++) {
    const s = pick(TREE_LINE + 1.5, 999, BOUND - 4, { space: 8, slope: 0.5, railMin: 14 });
    if (s)
      treeData.push({
        ...s,
        sc: 7.5 + rnd() * 6.5, // placement scale = model height in world units
        rot: rnd() * TAU,
      });
  }
  const treeDeadCount = Math.floor(this.Q.trees * 0.16);
  const deadData: Plant[] = [];
  for (let i = 0; i < treeDeadCount; i++) {
    const s = pick(TREE_LINE + 0.5, 999, BOUND - 4, { space: 6.5, slope: 0.55 });
    if (s)
      deadData.push({
        ...s,
        sc: 5.0 + rnd() * 5.5,
        rot: rnd() * TAU,
      });
  }
  /** `solid` = restitution; adds a trunk-sized collider per instance. */
  splitByModel(treeData, props.trees, 0.24);
  splitByModel(deadData, props.dead, 0.3);

  // palms along the trail shoulder
  const palmData: Plant[] = [];
  for (let i = 0; i < this.Q.palms; i++) {
    const s = pick(TREE_LINE + 1.0, 999, BOUND - 8, { space: 7.5, slope: 0.45 });
    if (s)
      palmData.push({
        ...s,
        sc: 7.0 + rnd() * 4.5,
        rot: rnd() * TAU,
      });
  }
  splitByModel(palmData, props.palms, 0.28);

  // birches: sparse, lighter silhouette accents
  const birchData: Plant[] = [];
  for (let i = 0; i < Math.floor(this.Q.trees * 0.12); i++) {
    const s = pick(TREE_LINE + 5, 999, BOUND - 6, { space: 9, slope: 0.45 });
    if (s) birchData.push({ ...s, sc: 8.0 + rnd() * 3.0, rot: rnd() * TAU });
  }
  splitByModel(birchData, props.birches, 0.3);

  // pines: a tall far ring, framing the playfield
  const pineData: Plant[] = [];
  for (let i = 0; i < Math.floor(this.Q.trees * 0.35); i++) {
    const s = pick(ROAD_HALF + 45, 999, BOUND - 10, { space: 11, slope: 0.55 });
    if (s) pineData.push({ ...s, sc: 12 + rnd() * 8, rot: rnd() * TAU });
  }
  splitByModel(pineData, props.pines, 0.24);
}
