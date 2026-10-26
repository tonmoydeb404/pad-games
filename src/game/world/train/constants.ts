import * as THREE from "three";

export const BASE = "/assets/jeep/train";

/**
 * Rail ring: control points on a circle around the trail loop, with two
 * Gaussian dips pulled in over the trail's biggest bulges (near the "DEEP
 * RUTS" stretch and the north-east bend). Each dip dips inside the trail
 * ring and back out, giving four level crossings (two chicane pairs ~60u
 * apart, half a lap between pairs). Verified against the real trail loop:
 * ≥ 15u clearance elsewhere, clear of every pond and the stream, min curve
 * radius ≈ 120u (the consist is 34.5u long), grades under 3.2°.
 */
export const RAIL_RING = {
  points: 48,
  base: 315,
  dips: [
    { at: (69 * Math.PI) / 180, depth: 78, width: (36 * Math.PI) / 180 },
    { at: (-124 * Math.PI) / 180, depth: 78, width: (36 * Math.PI) / 180 },
  ],
};

/** Arc-length samples around the loop (≈ 2.3u spacing). */
export const RAIL_SAMPLES = 900;
/**
 * Flat ballast half-width (the carved bed the track pieces sit on).
 * Wider than the diagonal of the coarsest terrain lattice cell (5.26u step
 * at Low quality → 7.44u diagonal) so every lattice corner around the
 * centreline lands inside the bench — the *rendered* bed is then exactly the
 * rail height everywhere, and the track never floats or buries. Also fully
 * covers the dirt road where the two cross (level-crossing deck).
 */
export const RAIL_BED = 7.5;
/** Embankment run — the bed blends back to the jungle floor over this. */
export const RAIL_BLEND = 13.0;

/** Uniform kit→world scale for train + track (loco ≈ 6.5u long). */
export const TRAIN_SCALE = 0.8;
/** Cruise speed — u/s along the loop, forever. */
export const TRAIN_SPEED = 12.5;

/** Consist order (files in /assets/jeep/train) with kit-unit half-lengths. */
export const CARS: { file: string; half: number }[] = [
  { file: "locomotive", half: 8.09 / 2 },
  { file: "tender", half: 5.21 / 2 },
  { file: "passenger-wagon", half: 8.06 / 2 },
  { file: "goods-wagon", half: 8.06 / 2 },
  { file: "flatcar", half: 9.26 / 2 },
];
/** Coupler gap between cars (world units). */
export const CAR_GAP = 0.9;
/** Track piece length in kit units (RailwayTrack_Straight) — instanced. */
export const TRACK_PIECE = 18.0;
/**
 * Track pieces are compressed along the track axis (gauge unchanged) so
 * joints sit ≤2° apart on the tightest curve — the line reads smooth.
 * Sleepers get proportionally shallower, which reads fine at driving range.
 */
export const TRACK_LENGTH_SCALE = 0.45;
/** Chimney mouth in baked model space (kit units) — steam source. */
export const CHIMNEY = new THREE.Vector3(0, 3.55, -2.2);

export const CELL = 26;
export const gridKey = (cx: number, cz: number): number => cx * 4096 + cz;

export const WHISTLE_COOLDOWN = 20;
export const WHISTLE_RANGE = 115;
export const RAM_COOLDOWN = 0.9;
/** Beyond this the audio state goes silent (the train is 'out of earshot'). */
export const EARSHOT = 380;
