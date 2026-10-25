/**
 * Sandstorms: a state machine (idle → ramping → storm → clearing) plus the
 * screen-space visuals (wind streaks and a warm tint). Intensity is read by
 * audio (wind gain) and haptics too, so the cue is carried by all channels.
 */

import { Container, Graphics } from "pixi.js";
import { Rng } from "../core/rng";
import { rgbNum, type Palette } from "../world/biome";

interface Streak {
  fx: number;
  fy: number;
  len: number;
  sp: number;
}

export class Weather {
  readonly container = new Container();
  private gfx = new Graphics();
  intensity = 0;
  active = false;

  private rng: Rng;
  private nextStormIn = 50;
  private stormLeft = 0;
  private streaks: Streak[] = [];

  constructor(seed: number) {
    this.rng = new Rng(seed ^ 0x3e7d0dd);
    for (let i = 0; i < 80; i++) {
      this.streaks.push({
        fx: this.rng.float(),
        fy: this.rng.float(),
        len: 30 + this.rng.float() * 90,
        sp: 900 + this.rng.float() * 700,
      });
    }
    this.container.addChild(this.gfx);
  }

  regenerate(seed: number): void {
    this.rng = new Rng(seed ^ 0x3e7d0dd);
    this.nextStormIn = this.rng.range(45, 90);
    this.intensity = 0;
    this.active = false;
    this.stormLeft = 0;
  }

  update(dt: number, worldX: number, w: number, h: number, camSpeed: number): void {
    if (this.active) {
      this.stormLeft -= dt;
      if (this.stormLeft <= 0) {
        this.active = false;
        this.nextStormIn = this.rng.range(55, 110);
      }
    } else if (worldX > 5000) {
      this.nextStormIn -= dt;
      if (this.nextStormIn <= 0) {
        this.active = true;
        this.stormLeft = this.rng.range(12, 22);
      }
    }

    const target = this.active ? 1 : 0;
    const rate = this.active ? 0.5 : 0.35;
    this.intensity += (target - this.intensity) * Math.min(1, dt * rate * 2);

    // advance streaks
    for (const s of this.streaks) {
      s.fx -= ((s.sp + camSpeed * 0.4) * dt) / w;
      if (s.fx < -0.2) {
        s.fx = 1 + this.rng.float() * 0.2;
        s.fy = this.rng.float();
      }
    }
    void h;
  }

  draw(w: number, h: number, palette: Palette): void {
    const target = this.gfx;
    target.clear();
    if (this.intensity < 0.02) return;
    for (const s of this.streaks) {
      const y = s.fy * h;
      const x = s.fx * w;
      target.moveTo(x, y);
      target.lineTo(x + s.len * this.intensity, y + s.len * 0.12);
    }
    target.stroke({
      width: 1.4,
      color: rgbNum(palette.sandRidge),
      alpha: 0.28 * this.intensity,
      cap: "round",
    });
    target.rect(0, 0, w, h).fill({
      color: rgbNum(palette.glow),
      alpha: 0.16 * this.intensity,
    });
  }

  /** Convenience for audio/haptics. */
  get level(): number {
    return this.intensity;
  }
}
