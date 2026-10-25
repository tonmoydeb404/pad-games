/**
 * Central physics/game feel tunables. A singleton on purpose: the debug
 * sliders (settings → "Debug sliders") mutate `params` live so feel can be
 * tuned while riding, per the plan's risk mitigation.
 */

export interface GameParams {
  /** px/s^2 */
  gravity: number;
  /** kinetic friction coefficient of sand */
  frictionMu: number;
  /** linear damping in air (per second) */
  airDrag: number;
  /** quadratic drag coefficient (v^2 term), the main speed limiter */
  quadDrag: number;
  /** world descent per px of forward travel */
  baseSlope: number;
  /** speed ceiling, px/s */
  maxSpeed: number;
  /** jump impulse range, px/s */
  jumpMin: number;
  jumpMax: number;
  /** seconds holding jump to reach full charge */
  chargeTime: number;
  /** rad/s at full stick/trigger deflection */
  spinRate: number;
  /** px/s^2 while boosting */
  boostAccel: number;
  /** boost meter drained per second */
  boostDrain: number;
  /** landing tolerance, rad — velocity vs terrain tangent */
  landCleanAngle: number;
  landRoughAngle: number;
  /** landing tolerance, rad — body vs terrain tangent (spins!) */
  bodyCleanAngle: number;
  bodyRoughAngle: number;
  /** seconds of coyote time after leaving ground */
  coyoteTime: number;
  /** px per world meter, for score/distance/HUD */
  pxPerMeter: number;
  /** extra gravity multiplier when holding down in air */
  fastFall: number;
  /** below this grounded speed on an uphill, the rider pumps forward */
  pushSpeed: number;
  /** boost meter segments shown in the HUD (fills are per-segment) */
  boostLevels: number;
  /** passive boost fill per second (tricks add on top) */
  boostPassiveFill: number;
  /** second airborne hop impulse, as a fraction of jumpMax */
  doubleJumpStrength: number;
  /** snap distance below a rail that catches a falling rider */
  grindKissDistance: number;
  /** boost meter fill per second while grinding */
  grindBoostFill: number;
  /** speed multiplier on salt pans (slick ground) */
  saltSpeedMult: number;
  /** friction multiplier on salt pans */
  saltFrictionMult: number;
  /** run distance (m) before the storm wall starts chasing */
  stormStartM: number;
  /** storm wall speeds per difficulty tier, px/s */
  stormTierSpeeds: number[];
  /** wall distance (px) kept behind while the rider is airborne */
  stormHoldbackPx: number;
  /** speed multiplier applied when the wall is far off-screen */
  stormCatchupMult: number;
  /** nearest gap approach (px) where chasm slow-mo begins */
  slowmoStartPx: number;
  /** time scale at the heart of the chasm approach */
  slowmoMinScale: number;
}

export const defaultParams: GameParams = {
  gravity: 2300,
  frictionMu: 0.02,
  airDrag: 0.06,
  quadDrag: 0.00042,
  baseSlope: 0.14,
  maxSpeed: 900,
  jumpMin: 560,
  jumpMax: 900,
  chargeTime: 0.4,
  spinRate: 8,
  boostAccel: 480,
  boostDrain: 0.45,
  landCleanAngle: 0.42,
  landRoughAngle: 1.2,
  bodyCleanAngle: 0.7,
  bodyRoughAngle: 1.4,
  coyoteTime: 0.14,
  pxPerMeter: 40,
  fastFall: 0.85,
  pushSpeed: 170,
  boostLevels: 12,
  boostPassiveFill: 0.018,
  doubleJumpStrength: 0.42,
  grindKissDistance: 30,
  grindBoostFill: 0.35,
  saltSpeedMult: 1.4,
  saltFrictionMult: 0.3,
  stormStartM: 650,
  stormTierSpeeds: [150, 195, 240, 285, 330, 375],
  stormHoldbackPx: 340,
  stormCatchupMult: 1.4,
  slowmoStartPx: 420,
  slowmoMinScale: 0.35,
};

export const params: GameParams = { ...defaultParams };

export function resetParams(): void {
  Object.assign(params, defaultParams);
}
