/**
 * World-anchored score popups: "+300 720° Spin" rising from where the trick
 * landed. A small pool of Text objects — no per-popup allocation — projected
 * from world space each frame, like particles. HUD toasts stay for run-level
 * events; these sell the trick at the moment and place it happens.
 */

import { Container, Text } from "pixi.js";
import { makeProjector, type CamView } from "./world-view";

const POOL = 8;
const LIFE = 1.1;
const RISE = 46; // world px/s upward drift

interface Floater {
  text: Text;
  x: number;
  y: number;
  life: number;
  active: boolean;
}

export class Floaters {
  readonly container = new Container();
  private pool: Floater[] = [];
  private next = 0;

  constructor() {
    const style = {
      fontFamily: "ui-monospace, Menlo, monospace",
      fontSize: 15,
      fontWeight: "bold",
      fill: 0xffd76a,
      stroke: { color: 0x140b06, width: 4 },
      letterSpacing: 0.5,
    } as const;
    for (let i = 0; i < POOL; i++) {
      const text = new Text({ text: "", style });
      text.anchor.set(0.5);
      text.visible = false;
      this.container.addChild(text);
      this.pool.push({ text, x: 0, y: 0, life: 0, active: false });
    }
  }

  /** Pop a label at a world position. Oldest pooled floater is recycled. */
  spawn(x: number, y: number, label: string, color = 0xffd76a): void {
    const f = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    f.text.text = label;
    f.text.style.fill = color;
    f.x = x;
    f.y = y;
    f.life = LIFE;
    f.active = true;
    f.text.visible = true;
  }

  update(dt: number, cam: CamView, w: number, h: number): void {
    const { sx, sy } = makeProjector(cam, w, h);
    for (const f of this.pool) {
      if (!f.active) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.active = false;
        f.text.visible = false;
        continue;
      }
      f.y -= RISE * dt;
      const age = LIFE - f.life;
      // Spawn pop: quick overshoot settling to 1, then fade near the end.
      const pop = 1 + 0.45 * Math.exp(-age * 9);
      f.text.scale.set(pop);
      f.text.alpha = Math.min(1, f.life / 0.45);
      f.text.position.set(sx(f.x), sy(f.y));
    }
  }
}
