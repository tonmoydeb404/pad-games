/** World, trail, physics-tuning and surface constants shared across the engine. */
export const WORLD = 1000;
export const BOUND = 440;
export const ROAD_HALF = 4.3;
/** Berm/embankment width — the road blends to the jungle floor over this run. */
export const ROAD_BLEND = 24.0;
/** Distance from the road centreline where big trees may stand (past the berm). */
export const TREE_LINE = ROAD_HALF + ROAD_BLEND;

// Hand-placed control points: irregular closed circuit with switchbacks,
// a narrow section, a wide clearing, a rocky climb, a river dip and a bridge.
// Track height is NOT authored here any more — it is derived from the smoothed
// base terrain in the constructor, so the road always rides the jungle floor.
export const CTRL: [number, number][] = [
  [0, -250],
  [88, -238],
  [158, -186],
  [196, -104],
  [236, -34],
  [214, 40],
  [150, 72],
  [112, 132],
  [158, 196],
  [96, 246],
  [6, 254],
  [-78, 222],
  [-142, 160],
  [-126, 84],
  [-192, 34],
  [-236, -42],
  [-176, -96],
  [-206, -166],
  [-142, -214],
  [-66, -250],
];

export const SAMPLES = 1400;
export const CELL = 26;
export const gridKey = (cx: number, cz: number): number => cx * 4096 + cz;

export const MAX_SPEED = 46.8;
export const MAX_REV = 13.5;

/** World gravity (units/s²). ~2.3× real-scale — heavier than reality reads as
 *  "planted" at arcade speeds, like GTA's tuned-up gravity. */
export const GRAVITY = 20;
/** Suspension visuals: rest compression and full travel (wheel/spring meshes). */
export const SUSP_REST = 0.16;
export const SUSP_TRAVEL = 0.3;

/** Jump kickers on the trail: ramp up, short lip, ramp down (world units). */
export const KICK_H = 3.4;
export const KICK_RISE = 19;
export const KICK_FALL = 8;
/** Lateral run over which a kicker fades out past the road edge — wide enough
 *  that clipping its flank doesn't tip the car. */
export const KICK_SHOULDER = 10;

export const SURFACE: Record<string, { grip: number; drag: number; accel: number; rough: number }> = {
  dirt: { grip: 1.0, drag: 0.55, accel: 1.0, rough: 0.4 },
  mud: { grip: 0.68, drag: 0.95, accel: 0.75, rough: 0.5 },
  rock: { grip: 0.88, drag: 0.7, accel: 0.88, rough: 0.9 },
  grass: { grip: 0.8, drag: 0.75, accel: 0.85, rough: 0.55 },
  water: { grip: 0.65, drag: 1.4, accel: 0.65, rough: 0.45 },
  asphalt: { grip: 1.08, drag: 0.45, accel: 1.06, rough: 0.12 },
  ballast: { grip: 0.86, drag: 0.66, accel: 0.92, rough: 0.72 },
};

// fixed-timestep simulation (physics-tuning): constant dt keeps the spring
// suspension stable at any frame rate; rendering interpolates between ticks.
export const FIXED_DT = 1 / 60;
export const MAX_SUBSTEPS = 4;
