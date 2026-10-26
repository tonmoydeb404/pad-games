/** Jungle undergrowth: bushes, flowers, plants, grass, rocks and petals. */
import type { JeepProps } from "../../assets";
import { TAU } from "../../noise";
import { BOUND, ROAD_HALF, TREE_LINE } from "../config/world-constants";
import type { JeepEngine } from "../jeep-engine";
import type { Picker, Plant, Splitter } from "./jungle-placement";

export function scatterUndergrowth(this: JeepEngine, props: JeepProps, pick: Picker, rnd: () => number, splitByModel: Splitter): void {
  // bushes — spread evenly through the whole jungle
  const bushData: Plant[] = [];
  for (let i = 0; i < this.Q.bushes; i++) {
    const s = pick(TREE_LINE - 2, 999, BOUND - 3, { space: 3.4, slope: 0.5 });
    if (s)
      bushData.push({
        ...s,
        sc: 0.9 + rnd() * 1.1,
        rot: rnd() * TAU,
      });
  }
  splitByModel(bushData, props.bushes);

  // flower clumps instead of the old procedural ferns — everywhere, evenly
  const flowerData: Plant[] = [];
  for (let i = 0; i < this.Q.ferns; i++) {
    const s = pick(TREE_LINE, 999, BOUND - 3, { space: 2.6, slope: 0.45 });
    if (s)
      flowerData.push({
        ...s,
        sc: 0.45 + rnd() * 0.6,
        rot: rnd() * TAU,
      });
  }
  splitByModel(flowerData, props.flowers);

  // plant sprigs: low undergrowth everywhere
  const plantData: Plant[] = [];
  for (let i = 0; i < 200; i++) {
    const s = pick(TREE_LINE, 999, BOUND - 3, { space: 2.4, slope: 0.45 });
    if (s) plantData.push({ ...s, sc: 0.5 + rnd() * 0.6, rot: rnd() * TAU });
  }
  splitByModel(plantData, props.plants);

  // grass clumps astride the trail and across the jungle floor
  const grassData: Plant[] = [];
  for (let i = 0; i < this.Q.grass; i++) {
    const s = pick(TREE_LINE, 999, BOUND - 2, { space: 2.0, slope: 0.5 });
    if (s)
      grassData.push({
        ...s,
        sc: 0.5 + rnd() * 0.7,
        rot: rnd() * TAU,
      });
  }
  // Grass_Large_Extruded reads heavy at distance — use it sparingly
  const grassModels = props.grass;
  grassModels.forEach((model, mi) => {
    const share = model === grassModels[1] ? Math.floor(grassData.length * 0.2) : Math.floor(grassData.length * 0.4);
    const sub = grassData
      .filter((_, k) => k % grassModels.length === mi)
      .slice(0, share)
      .map((g) => ({ x: g.x, y: g.y, z: g.z, rot: g.rot, scale: g.sc }));
    this.scatterPack(model, sub, { sway: 0.05, cast: false });
  });

  // rocks — big ones far out with colliders, small ones on the trail
  const rockFar: Plant[] = [];
  const rockNear: Plant[] = [];
  for (let i = 0; i < Math.floor(this.Q.rocks * 0.6); i++) {
    const s = pick(TREE_LINE, 999, BOUND - 3, { space: 4.5, slope: 0.8 });
    if (s) rockFar.push({ ...s, sc: 0.8 + rnd() * 2.6, rot: rnd() * TAU });
  }
  for (let i = 0; i < Math.floor(this.Q.rocks * 0.4); i++) {
    const s = pick(0.5, ROAD_HALF + 4, BOUND - 3);
    if (s) {
      const onRoad = s.dist < ROAD_HALF;
      rockNear.push({ ...s, sc: onRoad ? 0.16 + rnd() * 0.22 : 0.3 + rnd() * 0.9, rot: rnd() * TAU });
    }
  }
  // boulders really bounce — solid up to ~their height, so a jump can clear one
  for (const r of rockFar) if (r.sc > 1.2) this.addCollider(r.x, r.z, r.sc * 0.7, 0.58, { y0: r.y, height: r.sc * 0.85 });
  props.rocks.forEach((model, mi) => {
    const sub = [
      ...rockFar.filter((_, k) => k % props.rocks.length === mi),
      ...rockNear.filter((_, k) => k % props.rocks.length === mi),
    ].map((r) => ({ x: r.x, y: r.y, z: r.z, rot: r.rot, scale: r.sc }));
    this.scatterPack(model, sub, { sway: 0, cast: true, tint: false });
  });

  // petals: ground confetti (small, cheap, no shadows)
  const petalData: Plant[] = [];
  for (let i = 0; i < 240; i++) {
    const s = pick(TREE_LINE, 999, BOUND - 3, { space: 1.4 });
    if (s) petalData.push({ ...s, sc: 0.25 + rnd() * 0.25, rot: rnd() * TAU });
  }
  splitByModel(petalData, props.petals);
}
