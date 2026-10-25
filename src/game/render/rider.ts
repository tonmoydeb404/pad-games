/**
 * The rider: a vector silhouette on a sandboard with an accent scarf.
 * Poses: carving (lean), charging (crouch), tuck while spinning, reach for
 * grabs, ragdoll on crash. The scarf trails in world space.
 */

import { Container, Graphics } from "pixi.js";
import { makeProjector, type CamView } from "./world-view";

export interface RiderPose {
  x: number;
  y: number;
  angle: number;
  grounded: boolean;
  charging: boolean;
  charge: number;
  grabbing: boolean;
  /** Locked into a rail grind — balanced crouch, arms out. */
  grinding?: boolean;
  crashed: boolean;
  speed: number;
}

const COAT = 0x2d3a6b;
const PANTS = 0x1b2342;
const RIM = 0x9fb4ff;
const ACCENT = 0x35d0ba;
const SCARF = 0xff8a4c;
const BOARD = 0x2b2320;

export class RiderView {
  readonly container = new Container();
  readonly scarfGfx = new Graphics();
  private gfx = new Graphics();
  private scarf: { x: number; y: number }[] = [];

  /** Squash & stretch spring, driven by impacts. + squash, − stretch. */
  private squash = 0;
  private squashVel = 0;
  motionEnabled = true;

  constructor() {
    this.container.addChild(this.gfx);
    for (let i = 0; i < 8; i++) this.scarf.push({ x: 0, y: 0 });
  }

  /**
   * Impulse the deformation spring: + squashes (landings, crashes),
   * − stretches (launches). The spring settles back to rest with a slight
   * overshoot, so the pop reads as weight, not wobble.
   */
  kick(amount: number): void {
    if (!this.motionEnabled) return;
    this.squashVel += amount * 10;
  }

  private stepSquash(dt: number): void {
    if (!this.motionEnabled) {
      this.squash = 0;
      this.squashVel = 0;
      return;
    }
    // Underdamped spring toward 0 (~25% overshoot, settles in ~0.35 s).
    const stiffness = 190;
    const damping = 11;
    this.squashVel += (-stiffness * this.squash - damping * this.squashVel) * dt;
    this.squash += this.squashVel * dt;
    if (this.squash > 0.45) this.squash = 0.45;
    if (this.squash < -0.45) this.squash = -0.45;
  }

  reset(x: number, y: number): void {
    for (const p of this.scarf) {
      p.x = x;
      p.y = y - 24;
    }
    this.squash = 0;
    this.squashVel = 0;
  }

  draw(
    cam: CamView,
    w: number,
    h: number,
    pose: RiderPose,
    dt: number,
  ): void {
    const { sx, sy } = makeProjector(cam, w, h);
    const px = sx(pose.x);
    const py = sy(pose.y);
    this.gfx.clear();

    // ---- scarf (world space, drawn under the rider) ----
    this.scarfGfx.clear();
    const headWorldX = pose.x + 10 / cam.zoom;
    const headWorldY = pose.y - 34 / cam.zoom;
    const lead = this.scarf[0];
    lead.x += (headWorldX - lead.x) * Math.min(1, dt * 22);
    lead.y += (headWorldY - lead.y) * Math.min(1, dt * 22);
    for (let i = 1; i < this.scarf.length; i++) {
      const a = this.scarf[i - 1];
      const b = this.scarf[i];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      const rest = 6.5 / cam.zoom;
      const t = ((d - rest) / d) * Math.min(1, dt * 26);
      b.x += dx * t;
      b.y += dy * t - 12 * dt / cam.zoom;
    }
    for (let i = 1; i < this.scarf.length; i++) {
      this.scarfGfx.moveTo(sx(this.scarf[i - 1].x), sy(this.scarf[i - 1].y));
      this.scarfGfx.lineTo(sx(this.scarf[i].x), sy(this.scarf[i].y));
      this.scarfGfx.stroke({
        width: (6.5 - i * 0.6) * cam.zoom,
        color: SCARF,
        alpha: pose.crashed ? 0.5 : 1,
        cap: "round",
        join: "round",
      });
    }

    // ---- rider ----
    // A hooded silhouette: filled shapes (no stick limbs) with a rim light,
    // so it reads as one clean figure against both day and night skies.
    const z = cam.zoom * 1.25;
    this.container.position.set(px, py);
    this.container.rotation = pose.angle;
    // Squash & stretch scales around the board contact (the local origin),
    // pressed along the board's normal: landings flatten the figure into
    // the slope, launches stretch it along the pop. Charging adds a static
    // press so the crouch reads on the board itself.
    this.stepSquash(dt);
    const sq = this.squash + (pose.charging ? pose.charge * 0.14 : 0);
    this.container.scale.set(1 + sq * 0.7, 1 - sq);
    const g = this.gfx;
    const dead = pose.crashed;
    const coat = dead ? 0x3a3550 : COAT;
    const pants = dead ? 0x2c2a3c : PANTS;

    const crouch = pose.charging ? pose.charge : 0;
    const air = !pose.grounded;
    const grind = pose.grinding === true;
    const lean = pose.grounded ? Math.min(1, pose.speed / 900) : 0.3;
    const hipH = grind ? 15 : air ? 17 : 23 - crouch * 9;
    const hx = -1 * z;
    const hy = -(hipH + 4) * z;
    const shx = hx + (7 + lean * 6 + crouch * 3) * z;
    const shy = hy - (19 - crouch * 5 - (air ? 2 : 0)) * z;

    // board: slim plank with an upturned nose
    g.moveTo(-28 * z, -3 * z);
    g.quadraticCurveTo(-30 * z, -7 * z, -26 * z, -6 * z);
    g.lineTo(26 * z, -6 * z);
    g.quadraticCurveTo(34 * z, -6 * z, 33 * z, -11 * z);
    g.quadraticCurveTo(29 * z, 0, 22 * z, 2 * z);
    g.lineTo(-24 * z, 2 * z);
    g.quadraticCurveTo(-30 * z, 2 * z, -28 * z, -3 * z);
    g.fill(dead ? 0x4a3a30 : BOARD);
    g.moveTo(-22 * z, -2 * z);
    g.lineTo(24 * z, -2 * z);
    g.stroke({ width: 1.6 * z, color: ACCENT, alpha: dead ? 0.4 : 0.95, cap: "round" });

    // legs: two segments each, knees pushed forward
    const knee = (3 + crouch * 6 + (air ? 4 : 0)) * z;
    const leg = (footX: number, hipX: number, color: number, w: number) => {
      const kx = (footX + hipX) / 2 + knee;
      const ky = (-6 + hy / z) * z * 0.5 - 2 * z;
      g.moveTo(footX * z, -5 * z);
      g.lineTo(kx, ky);
      g.lineTo(hipX * z, hy);
      g.stroke({ width: w * z, color, cap: "round", join: "round" });
    };
    leg(-11, -2, pants, 6.5);
    leg(10, 1, pants, 6.5);
    // lit edge on the front leg
    g.moveTo(10 * z, -5 * z);
    g.lineTo((10 + 1) / 2 * z + knee, ((-6 + hy / z) * z * 0.5) - 2 * z);
    g.stroke({ width: 1.4 * z, color: RIM, alpha: 0.55, cap: "round" });

    // back arm (counter-balance), under the torso; out wide on a grind
    const armBack = grind
      ? [-13, -6]
      : air
        ? [-7, 8]
        : [-9 - lean * 4, 8 + crouch * 3];
    g.moveTo(shx - 1 * z, shy + 3 * z);
    g.lineTo(shx + armBack[0] * z, shy + armBack[1] * z);
    g.stroke({ width: 4.6 * z, color: pants, cap: "round" });

    // torso: tapered coat
    g.moveTo(hx - 5.5 * z, hy + 3 * z);
    g.quadraticCurveTo(hx - 8 * z, (hy + shy) / 2, shx - 6 * z, shy + 2 * z);
    g.lineTo(shx + 5 * z, shy);
    g.quadraticCurveTo(hx + 8 * z, (hy + shy) / 2, hx + 6 * z, hy + 3 * z);
    g.closePath();
    g.fill(coat);
    g.stroke({ width: 1.2 * z, color: RIM, alpha: 0.5, join: "round" });

    // front arm
    g.moveTo(shx + 1 * z, shy + 2 * z);
    if (grind) g.lineTo(shx + 14 * z, shy - 8 * z);
    else if (pose.grabbing && air) g.lineTo(12 * z, -6 * z);
    else if (air) g.lineTo(shx + 12 * z, shy - 3 * z);
    else g.lineTo(shx + (9 + lean * 3) * z, shy + (10 - crouch * 3) * z);
    g.stroke({ width: 4.8 * z, color: coat, cap: "round", join: "round" });

    // head with hood and goggles
    const hdx = shx + 2.5 * z;
    const hdy = shy - 7.5 * z;
    g.moveTo(hdx - 4 * z, hdy - 2 * z);
    g.lineTo(hdx - 12 * z - lean * 3 * z, hdy + 2 * z); // hood tail
    g.lineTo(hdx - 3 * z, hdy + 5 * z);
    g.closePath();
    g.fill(coat);
    g.circle(hdx, hdy, 6.6 * z);
    g.fill(coat);
    g.stroke({ width: 1 * z, color: RIM, alpha: 0.45 });
    g.ellipse(hdx + 3.2 * z, hdy - 0.4 * z, 3.4 * z, 2.5 * z);
    g.fill(dead ? 0x555 : ACCENT);

    this.container.alpha = 1;
  }
}
