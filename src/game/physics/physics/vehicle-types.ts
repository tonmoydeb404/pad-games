export interface VehicleSpec {
  mass: number;
  length: number;
  width: number;
  wheelR: number;
  /** Wheel centre sits this far below the body origin at rest. */
  axleOff: number;
  /** FL FR RL RR, body frame (x right, z back). */
  wheels: { x: number; z: number }[];
  /** ω² of the body bounce (jeep 130). */
  spring: number;
  /** Legacy damping coefficient: ζ = damp / (2·√spring). */
  damp: number;
  /** Local height of the centre of mass (negative = below the origin). */
  comY: number;
  gravity: number;
  /** Shell bounciness (heavy vehicles plow, light ones ricochet). */
  restitution?: number;
}

/** What the engine asks of the car each tick (arcade-level intents). */
export interface DriveIntent {
  /** Net drive acceleration along the heading (u/s², already includes engine,
   *  reverse and brake blending; negative = decelerate). */
  driveAccel: number;
  /** Extra braking deceleration through the tyres (always ≥ 0). */
  brakeAccel: number;
  /** Front wheel angle, radians (+ = turn left, nose toward -x). */
  steerAngle: number;
  /** Friction multipliers (surface × car × damage). */
  grip: number;
  sideGrip: number;
  rearSideGrip: number;
  /** Target yaw rate, rad/s (+ = left) for the stability assist; null = none. */
  yawTarget: number | null;
  /** Resistive deceleration along the heading, u/s² (already signed vs speed). */
  resist: number;
}

export const IDLE_INTENT: DriveIntent = {
  driveAccel: 0,
  brakeAccel: 0,
  steerAngle: 0,
  grip: 1,
  sideGrip: 1,
  rearSideGrip: 1,
  yawTarget: null,
  resist: 0,
};

/** Suspension rest length and max travel. */
export const SUSPENSION_REST = 0.45;
export const SUSPENSION_TRAVEL = 0.3;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat extends Vec3 {
  w: number;
}
