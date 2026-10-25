/**
 * Pooled particles: carving spray, landing poofs, crash bursts, pickup
 * sparkles. All particles live in one Graphics (a single draw call).
 */

import { Graphics } from "pixi.js";
import { makeProjector, type CamView } from "./world-view";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: number;
  grav: number;
  alpha: number;
}

const MAX_PARTICLES = 420;

export class Particles {
  list: Particle[] = [];

  private spawn(p: Particle): void {
    if (this.list.length >= MAX_PARTICLES) this.list.shift();
    this.list.push(p);
  }

  /** Sand kicked up while carving. Call a few times per frame while grounded. */
  carve(
    x: number,
    y: number,
    tangentAngle: number,
    speed: number,
    color: number,
  ): void {
    const back = Math.PI + tangentAngle;
    const spread = (Math.random() - 0.5) * 1.1;
    const v = speed * (0.14 + Math.random() * 0.2);
    this.spawn({
      x: x - Math.cos(tangentAngle) * 20,
      y: y - 4,
      vx: Math.cos(back + spread) * v,
      vy: Math.sin(back + spread) * v - 40,
      life: 0.5 + Math.random() * 0.3,
      max: 0.8,
      size: 2 + Math.random() * 3.4,
      color,
      grav: 900,
      alpha: 0.7,
    });
  }

  /** Landing poof. */
  burst(x: number, y: number, n: number, power: number, color: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = power * (0.3 + Math.random() * 0.7);
      this.spawn({
        x,
        y: y - 2,
        vx: Math.cos(a) * v,
        vy: -Math.abs(Math.sin(a)) * v * 0.9,
        life: 0.4 + Math.random() * 0.5,
        max: 0.9,
        size: 2.4 + Math.random() * 4,
        color,
        grav: 800,
        alpha: 0.8,
      });
    }
  }

  crash(x: number, y: number, color: number): void {
    this.burst(x, y, 40, 420, color);
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn({
        x,
        y,
        vx: Math.cos(a) * 160 * Math.random(),
        vy: -260 * Math.random(),
        life: 0.9,
        max: 0.9,
        size: 4 + Math.random() * 5,
        color: 0x35d0ba,
        grav: 700,
        alpha: 0.9,
      });
    }
  }

  sparkle(x: number, y: number): void {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 60 + Math.random() * 120;
      this.spawn({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 60,
        life: 0.5,
        max: 0.5,
        size: 2 + Math.random() * 2.4,
        color: 0xffd76a,
        grav: 300,
        alpha: 1,
      });
    }
  }

  update(dt: number): void {
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) {
        list[i] = list[list.length - 1];
        list.pop();
        continue;
      }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(g: Graphics, cam: CamView, w: number, h: number): void {
    g.clear();
    const { sx, sy } = makeProjector(cam, w, h);
    for (const p of this.list) {
      const t = p.life / p.max;
      g.circle(sx(p.x), sy(p.y), p.size * cam.zoom * (0.5 + t * 0.7)).fill({
        color: p.color,
        alpha: p.alpha * t,
      });
    }
  }
}
