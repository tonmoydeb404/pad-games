import { SIZE_MULT } from "./constants";
import { NATURAL_DEFS } from "./species-table";
import type { AnimalDef } from "./types";

/**
 * On-screen size policy (rider = 1.72 m):
 *  - dinosaurs stay big (authored size × SIZE_MULT) — they are giants;
 *  - normal animals that can already carry a rider (deer, stag, horses, donkey,
 *    cow, bull) keep their regular, natural size;
 *  - small animals are scaled up only as far as a rider fits (RIDEABLE_HEIGHT).
 */
const DINOSAURS = new Set(["Trex", "Velociraptor", "Triceratops", "Stegosaurus", "Apatosaurus", "Parasaurolophus"]);
const RIDEABLE_HEIGHT: Record<string, number> = {
  Alpaca: 1.5,
  Wolf: 1.5,
  Husky: 1.4,
  ShibaInu: 1.3,
  Fox: 1.4,
  Frog: 1.1,
  Snake: 1.0,
  Snake_angry: 1.0,
  Rat: 1.2,
  Spider: 1.2,
  Wasp: 1.4,
};

/** Final on-screen height (m) for a species. */
function displayHeight(d: AnimalDef): number {
  if (DINOSAURS.has(d.file)) return d.height * SIZE_MULT;
  return Math.max(d.height, RIDEABLE_HEIGHT[d.file] ?? 0);
}

/** The shipped population. */
export const DEFS: AnimalDef[] = NATURAL_DEFS.map((d) => ({ ...d, height: displayHeight(d) }));

/** Display name tweaks after the table (keeps the table terse). */
for (const d of DEFS) {
  if (d.file === "Horse_White") d.name = "White Horse";
  if (d.file === "Snake_angry") d.name = "Angry Snake";
}
