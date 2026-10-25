/**
 * Sky: vertical gradient (drawn as smooth horizontal bands, rebuilt only when
 * the palette shifts), stars that fade in at night, and — from the Kenney
 * Background Elements pack — a sun and moon on arcs driven by world position
 * plus slowly drifting clouds (see art.ts).
 */

import { Container, Graphics, Sprite } from "pixi.js";
import { DAY_CYCLE_PX, rgbNum, type Palette } from "../world/biome";
import { Rng, hash2 } from "../core/rng";
import { cloudLook, type SceneArt, type SpriteName } from "./art";

const BANDS = 26;

interface Star {
  fx: number;
  fy: number;
  r: number;
  tw: number;
}

interface Cloud {
  sprite: Sprite;
  /** Placement along the wrap span, 0..1. */
  fx: number;
  /** Height in the sky, fraction of screen height. */
  fy: number;
  /** Display width, fraction of screen width. */
  size: number;
  /** Parallax against the day-cycle position. */
  factor: number;
  /** Own drift, px/s. */
  drift: number;
}

const CLOUD_COUNT = 7;

export class SkyView {
  readonly container = new Container();
  private gfx = new Graphics();
  private glowGfx = new Graphics();
  private starsGfx = new Graphics();
  private stars: Star[] = [];
  private lastKey = "";
  private art: SceneArt | null = null;
  private sun: Sprite | null = null;
  private moon: Sprite | null = null;
  private clouds: Cloud[] = [];
  private cloudLayer = new Container();

  constructor() {
    const rng = new Rng(0x57a2b1);
    for (let i = 0; i < 130; i++) {
      this.stars.push({
        fx: rng.float(),
        fy: rng.float() * 0.72,
        r: 0.6 + rng.float() * 1.3,
        tw: rng.float() * Math.PI * 2,
      });
    }
    this.container.addChild(this.gfx, this.starsGfx, this.glowGfx);
  }

  /** Attach the loaded Kenney art: sun, moon and clouds. */
  setArt(art: SceneArt | null): void {
    this.art = art;
    if (!art) return;
    const mk = (name: SpriteName): Sprite => {
      const sp = new Sprite(art.sprites[name]);
      sp.anchor.set(0.5);
      return sp;
    };
    this.sun = mk("sun");
    this.moon = mk("moon");
    this.container.addChild(this.sun, this.moon, this.cloudLayer);
    const rng = new Rng(0xc10d5);
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const sprite = mk(`cloud${(i % 8) + 1}` as SpriteName);
      sprite.anchor.set(0.5, 0.5);
      this.cloudLayer.addChild(sprite);
      this.clouds.push({
        sprite,
        fx: (i + hash2(i, 7) * 0.8) / CLOUD_COUNT,
        fy: 0.07 + rng.float() * 0.34,
        size: 0.07 + rng.float() * 0.08,
        factor: 0.015 + rng.float() * 0.045,
        drift: 4 + rng.float() * 9,
      });
    }
  }

  draw(p: Palette, w: number, h: number, worldX: number, time: number): void {
    const key = `${rgbNum(p.skyTop)}|${rgbNum(p.skyMid)}|${rgbNum(p.skyHor)}|${Math.round(w)}x${Math.round(h)}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.gfx.clear();
      const bh = h / BANDS + 1;
      for (let i = 0; i < BANDS; i++) {
        const t = i / (BANDS - 1);
        let c: [number, number, number];
        if (t < 0.55) {
          const k = t / 0.55;
          c = lerp3(p.skyTop, p.skyMid, k);
        } else {
          const k = (t - 0.55) / 0.45;
          c = lerp3(p.skyMid, p.skyHor, k);
        }
        this.gfx.rect(0, i * bh, w, bh).fill(rgbNum(c));
      }
    }

    // --- stars ---
    if (p.night > 0.02) {
      this.starsGfx.clear();
      const a = p.night;
      for (const s of this.stars) {
        const tw = 0.55 + 0.45 * Math.sin(time * 1.7 + s.tw);
        this.starsGfx.circle(s.fx * w, s.fy * h, s.r).fill({
          color: 0xeef2ff,
          alpha: a * tw * 0.9,
        });
      }
    } else if (this.starsGfx.renderable) {
      this.starsGfx.clear();
    }

    // --- sun & moon travel with the day cycle ---
    const glow = this.glowGfx;
    glow.clear();
    const cycle = (((worldX / DAY_CYCLE_PX) % 1) + 1) % 1;
    const sunT = (cycle + 0.92) % 1;
    const sunSize = Math.min(120, Math.max(56, h * 0.105));
    if (this.sun) this.sun.visible = false;
    if (this.moon) this.moon.visible = false;
    if (sunT < 0.85) {
      const k = sunT / 0.85;
      const sx = w * (0.08 + 0.84 * k);
      const sy = h * 0.66 - Math.sin(k * Math.PI) * h * 0.52;
      // fade out as night falls, so a setting sun doesn't hang there glaring
      const fade = 1 - p.night * 0.92;
      if (this.art) {
        glow.circle(sx, sy, sunSize * 1.3).fill({ color: rgbNum(p.glow), alpha: 0.14 * fade });
        glow.circle(sx, sy, sunSize * 0.8).fill({ color: rgbNum(p.glow), alpha: 0.22 * fade });
      }
      if (this.sun) {
        this.sun.visible = true;
        this.sun.position.set(sx, sy);
        this.sun.scale.set(sunSize / this.sun.texture.width);
        this.sun.tint = rgbNum(p.sun);
        this.sun.alpha = fade;
      }
    }
    if (p.night > 0.05) {
      const moonT = (cycle + 0.42) % 1;
      if (moonT < 0.85) {
        const k = moonT / 0.85;
        const mx = w * (0.08 + 0.84 * k);
        const my = h * 0.6 - Math.sin(k * Math.PI) * h * 0.48;
        const moonSize = sunSize * 0.8;
        if (this.art) glow.circle(mx, my, moonSize * 1.1).fill({ color: 0xaab8e8, alpha: 0.1 * p.night });
        if (this.moon) {
          this.moon.visible = true;
          this.moon.position.set(mx, my);
          this.moon.scale.set(moonSize / this.moon.texture.width);
          this.moon.tint = 0xe4ebff;
          this.moon.alpha = p.night;
        }
      }
    }

    // --- clouds: slow parallax against the day cycle, plus their own drift ---
    if (this.art) {
      const look = cloudLook(p);
      const span = w + 480;
      for (const c of this.clouds) {
        const sp = c.sprite;
        const x = (((c.fx * span - (worldX * c.factor + time * c.drift)) % span) + span) % span - 240;
        sp.position.set(x, h * c.fy);
        sp.scale.set((w * c.size) / sp.texture.width);
        sp.tint = look.tint;
        sp.alpha = look.alpha;
      }
    }
  }
}

function lerp3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
