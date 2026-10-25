/**
 * Custom slope physics — deliberately not a physics engine.
 *
 * Grounded: velocity is projected onto the terrain tangent; gravity pulls
 * along the slope, sand friction and quadratic drag slow it down.
 * Airborne: ballistic. Takeoff happens when the ground falls away faster
 * than gravity can bend the trajectory (convex edges at speed).
 * Landing is judged by two angles: body vs slope (spins must be completed —
 * a failed rotation is a crash) and velocity vs slope (extreme terrain
 * slams max out at a rough, speed-bleeding landing — the world itself never
 * kills you).
 */

import type { ActionSnapshot } from "../input/actions";
import { params } from "../core/params";
import { clamp } from "../world/biome";
import type { Gap, Rail, SurfaceMaterial, Terrain } from "../world/chunks";

export type LandingQuality = "clean" | "rough";

/**
 * Explicit rider state, mirroring classic slope-sim state machines:
 * boarding on the surface, grinding a rail, launching, flipping through a
 * trick, freefalling at the apex, falling hard, resetting after a wipeout.
 */
export type PlayerState =
  | "boarding"
  | "grinding"
  | "jumping"
  | "flipping"
  | "freefalling"
  | "falling"
  | "resetting";

/** Rider height above the rail line while grinding. */
const GRIND_RIDE_OFFSET = 12;

export interface BodyEvent {
  jumped?: { charge: number };
  doubleJumped?: true;
  tookOff?: true;
  grindStarted?: { x: number };
  grindEnded?: { reason: "jump" | "end" | "drop"; meters: number };
  landed?: {
    quality: LandingQuality;
    spins: number;
    speed: number;
    airTime: number;
    roughZone: boolean;
  };
  crashed?: { reason: "slope" | "fall" };
}

export interface BodyState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  /** explicit rider state, derived every step */
  state: PlayerState;
  /** ground material under the rider this step */
  surface: SurfaceMaterial;
  /** visual + trick angle, radians (cw positive) */
  bodyAngle: number;
  spinVel: number;
  spinAccum: number;
  charging: boolean;
  charge: number;
  boost: number;
  coyote: number;
  airTime: number;
  boostActive: boolean;
  /** post-landing grip: suppresses instant re-takeoff so landings settle */
  grip: number;
  /** second hop still available in this air */
  doubleLeft: boolean;
  /** rail currently being ground (null otherwise) */
  grind: Rail | null;
  /** meters ridden in the current grind */
  grindMeters: number;
  /** seconds before the same rail can catch the rider again */
  railCooldown: number;
}

export function normAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class PlayerBody {
  s: BodyState = this.freshState();
  private lastGroundY = 0;
  /** Snapshot from the start of the step, for render interpolation. */
  prevView: BodyState = this.freshState();
  private fastFall = false;
  /** Seconds left in which a jump released just before landing still fires. */
  private jumpBuffer = 0;

  private freshState(): BodyState {
    return {
      x: 0,
      y: 0,
      vx: 220,
      vy: 0,
      grounded: true,
      state: "boarding",
      surface: "sand",
      bodyAngle: Math.atan(params.baseSlope),
      spinVel: 0,
      spinAccum: 0,
      charging: false,
      charge: 0,
      boost: 1,
      coyote: 0,
      airTime: 0,
      boostActive: false,
      grip: 0,
      doubleLeft: false,
      grind: null,
      grindMeters: 0,
      railCooldown: 0,
    };
  }

  reset(terrain: Terrain): void {
    this.s = this.freshState();
    this.s.x = 120;
    this.s.y = terrain.heightAt(this.s.x);
    this.lastGroundY = this.s.y;
    this.prevView = { ...this.s };
  }

  /** Snapshot at the start of the step, for render interpolation. */
  beginStep(): void {
    this.prevView = { ...this.s };
  }

  update(dt: number, input: ActionSnapshot, terrain: Terrain): BodyEvent {
    const s = this.s;
    const ev: BodyEvent = {};

    // ---- spin input (air only) ----
    if (!s.grounded && !s.grind) {
      const target = input.spinAxis * params.spinRate;
      if (target !== 0) {
        // Engaging / holding / reversing: ramp toward the commanded rate
        // over ~90 ms so spin builds analog feel instead of snapping.
        s.spinVel += (target - s.spinVel) * (1 - Math.exp(-dt / 0.09));
      } else {
        // Released: decay with momentum — half-life ~0.25 s — so a trick
        // keeps its rotation and under/over-rotation matter.
        s.spinVel *= Math.exp(-dt / 0.36);
      }
      s.airTime += dt;
    } else {
      s.spinVel *= 1 - Math.min(1, dt * 14);
      s.airTime = 0;
    }

    // ---- jump (charge on hold, launch on release) ----
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (s.grounded && (input.jumpHeld || input.jumpPressed)) {
      s.charging = true;
      s.charge = Math.min(1, s.charge + dt / params.chargeTime);
    }

    // ---- boost meter: passive trickle + active drain (12-segment feel) ----
    s.boost = Math.min(1, s.boost + params.boostPassiveFill * dt);
    s.boostActive = input.boostHeld && s.boost > 0 && (s.grounded || s.airTime < 2);
    s.railCooldown = Math.max(0, s.railCooldown - dt);

    if (s.grind) {
      this.stepGrind(dt, input, terrain, ev);
    } else if (s.grounded) {
      this.stepGrounded(dt, input, terrain, ev);
      if (ev.crashed) return this.deriveState(ev);
      if (s.grounded && input.jumpReleased && s.charging) {
        this.launch(ev, s.charge);
      }
    } else {
      // Left the ground this step (lip / chasm): a late press or release
      // inside the coyote window still jumps.
      if (s.coyote > 0 && (input.jumpReleased || input.jumpPressed) && !ev.jumped) {
        this.launch(ev, Math.max(s.charge, 0.3));
      } else {
        if (s.coyote <= 0) s.charging = false;
        // Released a touch early in the air: remember it for landing.
        if (
          input.jumpReleased &&
          terrain.heightAt(s.x) - s.y < 110 &&
          !terrain.gapAt(s.x)
        ) {
          this.jumpBuffer = 0.14;
        }
        // Second hop: one per air, on a fresh press.
        if (input.jumpPressed && s.doubleLeft && s.coyote <= 0) {
          this.doubleJump(ev);
        }
        this.stepAirborne(dt, terrain, ev);
        if (s.grounded && !ev.crashed && this.jumpBuffer > 0) {
          this.launch(ev, 0.3);
        }
      }
    }

    return this.deriveState(ev);
  }

  /** Higher second hop — a fraction of the charged launch, per tuning. */
  private doubleJump(ev: BodyEvent): void {
    const s = this.s;
    const impulse =
      (params.jumpMin + (params.jumpMax - params.jumpMin) * 0.4) *
      params.doubleJumpStrength;
    s.vy = Math.min(s.vy, 0) - impulse;
    s.vx += Math.sign(s.vx) * impulse * 0.12;
    s.doubleLeft = false;
    s.spinAccum = 0;
    ev.doubleJumped = true;
  }

  /**
   * Grind a rail: no gravity, no friction — carried by momentum. The meter
   * refills while locked in; hop off, drop off, or ride it to the end.
   */
  private stepGrind(
    dt: number,
    input: ActionSnapshot,
    terrain: Terrain,
    ev: BodyEvent,
  ): void {
    const s = this.s;
    const rail = s.grind!;

    // carried speed, with an optional boost push
    if (input.boostHeld && s.boost > 0) {
      s.vx += params.boostAccel * 0.5 * dt;
      s.boost = Math.max(0, s.boost - params.boostDrain * 0.5 * dt);
    }
    s.vx = clamp(s.vx, 120, params.maxSpeed * 1.05);
    s.x += s.vx * dt;
    s.y = terrain.railYAt(rail, s.x) - GRIND_RIDE_OFFSET;
    s.grindMeters += (s.vx * dt) / params.pxPerMeter;

    // grinding refills the meter — the reward for finding the line
    s.boost = Math.min(1, s.boost + params.grindBoostFill * dt);
    s.bodyAngle += normAngle(0 - s.bodyAngle) * Math.min(1, dt * 16);
    s.spinAccum = 0;

    const end = (reason: "jump" | "end" | "drop", popVy: number): void => {
      const meters = s.grindMeters;
      s.grind = null;
      s.grindMeters = 0;
      s.railCooldown = reason === "drop" ? 0.35 : 0.55;
      s.grounded = false;
      s.coyote = 0;
      s.vy = popVy;
      ev.grindEnded = { reason, meters };
    };

    // ride off the end with a little pop
    if (s.x >= rail.x1 - 8) {
      end("end", -140);
      return;
    }
    // hop off (keeps the trick chain alive) or drop off deliberately
    if (input.jumpPressed || input.jumpReleased) {
      end("jump", -(params.jumpMin * 0.75));
      return;
    }
    if (input.downHeld) {
      end("drop", 0);
    }
  }

  /** Derive the explicit rider state from the step's outcome. */
  private deriveState(ev: BodyEvent): BodyEvent {
    const s = this.s;
    if (s.grind) {
      s.state = "grinding";
    } else if (s.grounded) {
      s.state = "boarding";
    } else if (Math.abs(s.spinVel) > 2) {
      s.state = "flipping";
    } else if (s.vy < -120) {
      s.state = "jumping";
    } else if (s.vy > 620) {
      s.state = "falling";
    } else {
      s.state = "freefalling";
    }
    return ev;
  }

  /** Launch off the surface normal; consumes the charge. */
  private launch(ev: BodyEvent, charge: number): void {
    const s = this.s;
    const impulse = params.jumpMin + (params.jumpMax - params.jumpMin) * charge;
    const slope = Math.atan(this.slopeHint);
    s.vx += Math.sin(slope) * impulse * 0.6;
    s.vy -= Math.cos(slope) * impulse;
    s.grounded = false;
    s.charging = false;
    s.coyote = 0;
    s.spinAccum = 0;
    s.doubleLeft = true;
    this.jumpBuffer = 0;
    ev.jumped = { charge };
    s.charge = 0;
  }

  private slopeHint = 0;

  private stepGrounded(
    dt: number,
    input: ActionSnapshot,
    terrain: Terrain,
    ev: BodyEvent,
  ): void {
    const s = this.s;
    s.coyote = Math.max(0, s.coyote - dt);
    s.grip = Math.max(0, s.grip - dt);

    const slope = terrain.slopeAt(s.x);
    this.slopeHint = slope;
    const theta = Math.atan(slope);
    const tx = Math.cos(theta);
    const ty = Math.sin(theta);

    // Ground material under the board: salt pans are slick and fast.
    const surface = terrain.surfaceAt(s.x);
    s.surface = surface;
    const onSalt = surface === "salt";

    // speed along the tangent
    let speed = s.vx * tx + s.vy * ty;

    // gravity along slope, minus friction and quadratic drag
    speed += params.gravity * ty * dt;
    const mu =
      params.frictionMu *
      (s.charging ? 2.4 : 1) *
      (onSalt ? params.saltFrictionMult : 1);
    speed -= Math.sign(speed) * (mu * params.gravity * Math.cos(theta)) * dt;
    speed -= Math.sign(speed) * params.quadDrag * speed * speed * dt;

    // boost
    if (input.boostHeld && s.boost > 0) {
      speed += params.boostAccel * dt;
      s.boost = Math.max(0, s.boost - params.boostDrain * dt);
    }

    // Skate pump: on an uphill at low speed, guarantee forward progress so
    // the run can never stall in a valley (slopes are clamped rideable).
    if (ty < -0.02 && speed < params.pushSpeed) {
      speed += (params.gravity * -ty + 140) * dt;
    }

    speed = clamp(speed, 0, params.maxSpeed * (onSalt ? params.saltSpeedMult : 1));

    // move along the surface
    const nx = s.x + tx * speed * dt;
    const gap = terrain.gapAt(nx);

    if (gap) {
      // Ground disappears under us — go ballistic over the chasm.
      s.vx = tx * speed;
      s.vy = ty * speed;
      s.grounded = false;
      s.coyote = params.coyoteTime;
      s.spinAccum = 0;
      ev.tookOff = true;
      return;
    }

    s.x = nx;
    s.y = terrain.heightAt(nx);
    s.vx = tx * speed;
    s.vy = ty * speed;
    this.lastGroundY = s.y;

    // Ease the visual angle toward the slope (springy for feel).
    const targetAngle = theta;
    s.bodyAngle += normAngle(targetAngle - s.bodyAngle) * Math.min(1, dt * 18);
    s.spinAccum = 0;

    // ---- takeoff check: only genuine lips launch the rider. Requires the
    // ballistic path to clear the ground by a margin over a speed-scaled
    // lookahead, and respects post-landing grip. ----
    if (speed > 160 && s.grip <= 0) {
      const look = clamp(speed * 0.09, 24, 110);
      const aheadX = s.x + look;
      const aheadGap = terrain.gapAt(aheadX);
      const aheadY = aheadGap ? terrain.gapKillY(aheadGap) : terrain.heightAt(aheadX);
      const t = (aheadX - s.x) / Math.max(1, speed);
      const ballisticY = s.y + s.vy * t + 0.5 * params.gravity * t * t;
      if (ballisticY < aheadY - 6) {
        s.grounded = false;
        s.coyote = params.coyoteTime;
        s.spinAccum = 0;
        ev.tookOff = true;
      }
    }
  }

  private stepAirborne(dt: number, terrain: Terrain, ev: BodyEvent): void {
    const s = this.s;
    s.coyote = Math.max(0, s.coyote - dt);

    s.vy += params.gravity * dt;
    if (this.fastFall) s.vy += params.gravity * params.fastFall * dt;
    const drag = 1 - Math.min(1, params.airDrag * dt);
    s.vx *= drag;
    s.vy *= drag;

    // Air boost: a weaker push along the current velocity during the first
    // seconds of an air — extends jumps, or drives a falling rider down to
    // the slope with speed held. Weaker than ground boost on purpose.
    if (s.boostActive) {
      const speed = Math.hypot(s.vx, s.vy) || 1;
      const push = params.boostAccel * 0.6 * dt;
      s.vx += (s.vx / speed) * push;
      s.vy += (s.vy / speed) * push;
      s.boost = Math.max(0, s.boost - params.boostDrain * dt);
    }

    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.bodyAngle += s.spinVel * dt;
    s.spinAccum += s.spinVel * dt;

    // ---- landing assist: with no meaningful spin input, ease the body
    // toward the nearest full turn aligned with the predicted landing slope,
    // so spins can be completed and neutral landings arrive aligned. ----
    if (Math.abs(s.spinVel) < 0.5) {
      const landingX = s.x + s.vx * 0.18;
      if (!terrain.gapAt(landingX)) {
        const landingAngle = Math.atan(terrain.slopeAt(landingX));
        const turns = Math.round((s.bodyAngle - landingAngle) / (Math.PI * 2));
        const target = turns * Math.PI * 2 + landingAngle;
        s.bodyAngle += normAngle(target - s.bodyAngle) * Math.min(1, dt * 10);
      }
    }

    const speed = Math.hypot(s.vx, s.vy);
    if (speed > params.maxSpeed * 1.15) {
      const k = (params.maxSpeed * 1.15) / speed;
      s.vx *= k;
      s.vy *= k;
    }

    // ---- fall into a chasm? ----
    const gap: Gap | null = terrain.gapAt(s.x);
    if (gap && s.y > terrain.gapKillY(gap)) {
      ev.crashed = { reason: "fall" };
      return;
    }

    // ---- rail catch: falling onto a line locks the rider into a grind ----
    if (!gap && s.vy >= 0 && s.railCooldown <= 0) {
      const rail = terrain.railAt(s.x);
      if (rail && s.x > rail.x0 + 16 && s.x < rail.x1 - 16) {
        const rideY = terrain.railYAt(rail, s.x) - GRIND_RIDE_OFFSET;
        if (s.y >= rideY - 10 && s.y <= rideY + params.grindKissDistance) {
          s.grind = rail;
          s.grindMeters = 0;
          s.y = rideY;
          s.vy = 0;
          s.vx = Math.max(s.vx, 260);
          s.grounded = false;
          s.spinVel = 0;
          s.spinAccum = 0;
          s.doubleLeft = true;
          ev.grindStarted = { x: s.x };
          return;
        }
      }
    }

    // ---- landing ----
    if (!gap && s.y >= terrain.heightAt(s.x) && s.vy >= 0) {
      this.land(terrain, ev);
    }
  }

  land(terrain: Terrain, ev: BodyEvent, forceQuality?: LandingQuality): void {
    const s = this.s;
    const gy = terrain.heightAt(s.x);
    s.y = gy;
    this.lastGroundY = gy;
    const air = s.airTime;

    const terrainAngle = Math.atan(terrain.slopeAt(s.x));
    const velAngle = Math.atan2(s.vy, s.vx);
    const velDiff = Math.abs(normAngle(velAngle - terrainAngle));
    const bodyDiff = Math.abs(normAngle(s.bodyAngle - terrainAngle));
    const spins = Math.max(
      0,
      Math.floor(Math.abs(s.spinAccum) / (Math.PI * 2) + 0.12),
    );
    const roughZone = terrain.roughAt(s.x);

    let quality: LandingQuality | "crash";
    // Crashes are player-caused: failing to complete a rotation. Terrain
    // geometry alone never kills — extreme velocity mismatches max out at a
    // hard rough landing that bleeds most of the speed.
    const bodyExtreme =
      bodyDiff > params.bodyRoughAngle ||
      (roughZone && bodyDiff > params.bodyCleanAngle);
    const velExtreme =
      velDiff > params.landRoughAngle ||
      (roughZone && velDiff > params.landCleanAngle + 0.1);
    if (forceQuality) quality = forceQuality;
    else if (bodyExtreme) quality = "crash";
    else if (velExtreme || bodyDiff > params.bodyCleanAngle) quality = "rough";
    else quality = "clean";

    // Snap body angle to the slope for the ride-out.
    s.bodyAngle = terrainAngle;
    s.spinVel = 0;
    s.spinAccum = 0;
    s.grounded = true;
    s.charging = false;
    s.airTime = 0;
    s.grip = 0.09;
    s.doubleLeft = true;
    s.grind = null;
    s.grindMeters = 0;

    if (quality === "crash") {
      ev.crashed = { reason: "slope" };
      return;
    }

    // Project velocity onto the tangent with a quality-based keep factor.
    const speed = Math.hypot(s.vx, s.vy);
    const keep = quality === "clean" ? 0.97 : 0.55;
    const newSpeed = Math.min(params.maxSpeed, speed * keep);
    const tx = Math.cos(terrainAngle);
    const ty = Math.sin(terrainAngle);
    s.vx = tx * newSpeed;
    s.vy = ty * newSpeed;

    ev.landed = {
      quality,
      spins,
      speed: newSpeed,
      airTime: air,
      roughZone,
    };
  }

  /** Soft reset used by the attract mode: place back on the surface. */
  rescue(terrain: Terrain): void {
    const s = this.s;
    s.y = terrain.heightAt(s.x);
    s.vy = 0;
    s.vx = Math.max(240, s.vx * 0.6);
    s.grounded = true;
    s.bodyAngle = Math.atan(terrain.slopeAt(s.x));
    s.spinVel = 0;
    s.airTime = 0;
    s.grind = null;
    s.grindMeters = 0;
    s.railCooldown = 0.5;
    s.doubleLeft = true;
    s.state = "boarding";
  }

  syncFastFall(input: ActionSnapshot): void {
    this.fastFall = input.downHeld && !this.s.grounded;
  }

  get lastSafeY(): number {
    return this.lastGroundY;
  }
}
