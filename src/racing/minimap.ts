/**
 * Minimap: the tile map drawn once into an offscreen canvas (roads, bridge
 * deck, plaza, lot), then blitted per frame with tokens, traps, boost pads
 * and the player arrow. North-up, world-metres → pixels linear.
 */
import { TILES, rotatedSize, type Rot } from "./tiles";
import { CELL } from "./tiles";
import type { WorldMap } from "./track";

const PX_PER_M = 0.55;
const MARGIN_M = 30;

export class MiniMap {
  private base: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  /** world-metre bounds of the map area drawn. */
  readonly area: { x0: number; z0: number; x1: number; z1: number };
  readonly width: number;
  readonly height: number;

  constructor(private readonly map: WorldMap) {
    const b = map.bounds;
    this.area = {
      x0: b.minX * CELL - MARGIN_M,
      z0: b.minZ * CELL - MARGIN_M,
      x1: b.maxX * CELL + MARGIN_M,
      z1: b.maxZ * CELL + MARGIN_M,
    };
    this.width = Math.round((this.area.x1 - this.area.x0) * PX_PER_M);
    this.height = Math.round((this.area.z1 - this.area.z0) * PX_PER_M);

    this.base = document.createElement("canvas");
    this.base.width = this.width;
    this.base.height = this.height;
    this.ctx = this.base.getContext("2d")!;
    this.drawBase();
  }

  private wx(x: number): number {
    return (x - this.area.x0) * PX_PER_M;
  }
  private wz(z: number): number {
    return (z - this.area.z0) * PX_PER_M;
  }

  private drawBase(): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#0d1a0e";
    ctx.fillRect(0, 0, this.width, this.height);

    // subtle grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let gx = Math.ceil(this.area.x0 / CELL); gx * CELL < this.area.x1; gx++) {
      ctx.beginPath();
      ctx.moveTo(this.wx(gx * CELL), 0);
      ctx.lineTo(this.wx(gx * CELL), this.height);
      ctx.stroke();
    }
    for (let gz = Math.ceil(this.area.z0 / CELL); gz * CELL < this.area.z1; gz++) {
      ctx.beginPath();
      ctx.moveTo(0, this.wz(gz * CELL));
      ctx.lineTo(this.width, this.wz(gz * CELL));
      ctx.stroke();
    }

    // road + deck tiles
    for (const p of this.map.placements) {
      const def = TILES[p.tile];
      const { w, d } = rotatedSize(def.w, def.d, p.rot as Rot);
      const isDeck = def.minimap === "deck";
      const isRoad = def.minimap === "road";
      if (!isRoad && !isDeck) continue;
      ctx.fillStyle = isDeck ? "#8a93a8" : "#4b5568";
      ctx.fillRect(
        this.wx(p.gx * CELL),
        this.wz(p.gz * CELL),
        w * CELL * PX_PER_M,
        d * CELL * PX_PER_M,
      );
    }
    // start line accent
    ctx.fillStyle = "#e2e8f0";
    const s = this.map.spawn;
    ctx.fillRect(this.wx(s.gx * CELL), this.wz(s.gz * CELL), CELL * PX_PER_M, 3);
  }

  /** Draw the current frame into the visible canvas. */
  update(
    target: HTMLCanvasElement,
    player: { x: number; z: number; yaw: number },
    opts: { tokens: { x: number; z: number; taken: boolean }[]; traps: { x: number; z: number }[] },
  ): void {
    const ctx = target.getContext("2d");
    if (!ctx) return;
    if (target.width !== this.width || target.height !== this.height) {
      target.width = this.width;
      target.height = this.height;
    }
    ctx.drawImage(this.base, 0, 0);

    // boost pads
    ctx.fillStyle = "#38bdf8";
    for (const b of this.map.boost) {
      const { x, z } = { x: (b.gx + 0.5) * CELL, z: (b.gz + 0.5) * CELL };
      ctx.fillRect(this.wx(x) - 2, this.wz(z) - 2, 4, 4);
    }
    // speed traps
    ctx.fillStyle = "#fbbf24";
    for (const t of opts.traps) {
      ctx.beginPath();
      ctx.arc(this.wx(t.x), this.wz(t.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // tokens
    for (const t of opts.tokens) {
      ctx.fillStyle = t.taken ? "rgba(250,204,21,0.25)" : "#facc15";
      ctx.beginPath();
      ctx.arc(this.wx(t.x), this.wz(t.z), t.taken ? 1.6 : 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // player arrow
    ctx.save();
    ctx.translate(this.wx(player.x), this.wz(player.z));
    ctx.rotate(-player.yaw);
    ctx.fillStyle = "#f87171";
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.2, 5);
    ctx.lineTo(0, 2.6);
    ctx.lineTo(-4.2, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
