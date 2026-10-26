/** Camera modes and the on-foot explorer / riding / melee tuning constants. */
export const MODES = ["chase", "cockpit", "orbit", "under", "wheel"] as const;
export type CamMode = (typeof MODES)[number];
export const MODE_LABEL: Record<CamMode, string> = {
  chase: "Chase camera",
  cockpit: "Driver view",
  orbit: "Inspection orbit",
  under: "Undercarriage camera",
  wheel: "Front wheel camera",
};
/* --- on-foot explorer (open world) --------------------------------------- */
export const FOOT_WALK = 3.4; // u/s — light stick tilt
export const FOOT_JOG = 7.6; // u/s — full stick / WASD (GTA's default pace)
export const FOOT_RUN = 12.8; // u/s sprint (burns stamina)
export const FOOT_CROUCH = 0.42; // speed multiplier while crouched
export const FOOT_ACCEL_RATE = 9; // 1/s — exponential approach to the intent velocity
export const FOOT_BRAKE_RATE = 14; // 1/s — stopping is snappier than starting
export const FOOT_TURN = 14; // 1/s — how fast the explorer faces the move dir
export const FOOT_JUMP_V = 8.2; // initial upward velocity (GRAVITY pulls back)
export const PLAYER_RADIUS = 0.45;
/** Melee moves: timeline length, the fraction of it where the hit lands, reach. */
export const MELEE = {
  punch: { dur: 0.4, hit: 0.38, range: 1.9, arc: 0.3, dmg: 12, knock: 1.2, cost: 3 },
  hook: { dur: 0.52, hit: 0.44, range: 2.0, arc: 0.3, dmg: 22, knock: 2.6, cost: 6 },
  kick: { dur: 0.62, hit: 0.46, range: 2.3, arc: 0.45, dmg: 26, knock: 3.4, cost: 8 },
} as const;
/** How close you must be (edge of the animal) to climb on. */
export const RIDE_REACH = 2.6;
/** Fractions of the mount's top speed. */
export const RIDE_WALK = 0.26;
export const RIDE_TROT = 0.58;
export const RIDE_GALLOP = 1;
export const ROLL_DUR = 0.62;
export const ROLL_SPEED = 11;
export const ROLL_COST = 16;
/** Horizontal distance from the vehicle that allows hopping in. */
export const ENTER_DIST = 3.7;
/** Can't bail out above this forward speed. */
export const EXIT_MAX_SPEED = 3.4;
/** Push the explorer out of trunks/boulders with this much margin. */
export const FOOT_SKIN = 0.32;

export const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
