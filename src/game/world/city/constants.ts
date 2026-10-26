export const TOWN_BASE = "/assets/jeep/city/town";
export const ROADS_BASE = "/assets/jeep/city/roads";

/* -------------------------------------------------------------------------
   Town site constants (world units)
   ------------------------------------------------------------------------- */

/** Town centre — south-east rim, outside the rail ring (r ≈ 315). */
export const TOWN_CX = 246;
export const TOWN_CZ = -315;
/** Flat shelf radius, and the ring over which it blends back to the rim. */
export const TOWN_FLAT = 78;
export const TOWN_BLEND = 34;
/** How deep the shelf is dug into the rim (the town sits in a hollow). */
export const TOWN_DIG = 20;

/** Street tile footprint (kit tile is 1×1 — this is also the kit scale). */
export const TILE = 8;
/** Street grid lines: ring road at ±RING, cross streets on the axes. */
export const RING = 32;
/** Access-road cross-section: flat core (covers the tile), shoulder, then a
 *  long berm blend so cuts through the rim read as embankments, not canyons. */
export const ROAD_CORE = 4.4;
export const ROAD_SHOULDER = 6.0;
export const ROAD_BLEND = 20;

/** Where the access road leaves the trail (fraction of the trail loop). */
export const JUNCTION_T = 0.135;

/** Road samples + spatial-hash cell (mirrors the trail's structures). */
export const ROAD_SAMPLES = 260;
export const CELL = 26;
export const gridKey = (cx: number, cz: number): number => cx * 4096 + cz;

/** Player/vehicle bound inside the town sector (the jungle rim bound is 440). */
export const TOWN_BOUND = 486;
