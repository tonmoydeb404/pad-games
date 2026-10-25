/**
 * Draws the gameplay world in screen space: heightfield terrain (split into
 * runs around chasms), rough-zone shading, obstacles and sunstone pickups.
 * The terrain profile is sampled once per frame into reusable buffers and
 * shared by the fill, ridge and rough passes.
 */

import { Graphics } from "pixi.js";
import { lerpRGB, rgbNum, type Palette, type RGB } from "../world/biome";
import type { Gap, Rail, RoughZone, Terrain } from "../world/chunks";
import { rockShape, type Obstacle } from "../world/obstacles";
import { ORB_RADIUS, type Orb } from "../world/collectibles";

/** High-contrast sunstone palette (accessibility option). */
const ORB_HC = { halo: 0x7ef0dc, core: 0xffffff, edge: 0x101c33 };

export interface CamView {
  x: number;
  y: number;
  zoom: number;
  shx: number;
  shy: number;
}

export function makeProjector(cam: CamView, w: number, h: number) {
  const halfW = w / 2;
  const horizon = h * 0.45;
  return {
    sx: (wx: number) => (wx - cam.x) * cam.zoom + halfW + cam.shx,
    sy: (wy: number) => (wy - cam.y) * cam.zoom + horizon + cam.shy,
  };
}

export class WorldView {
  /** Sampled profile buffers — grown on demand, never reallocated steady-state. */
  private bufN = 0;
  private xsBuf = new Float64Array(0);
  private ysBuf = new Float64Array(0);
  private gapBuf = new Uint8Array(0);
  private surfBuf = new Uint8Array(0);
  /** Run boundaries as [start, end] index pairs. */
  private runsBuf: number[] = [];

  drawTerrain(
    g: Graphics,
    cam: CamView,
    w: number,
    h: number,
    terrain: Terrain,
    palette: Palette,
  ): void {
    g.clear();
    const { sx, sy } = makeProjector(cam, w, h);
    const step = 12 / cam.zoom;
    const x0 = cam.x - w / 2 / cam.zoom - step * 2;
    const x1 = cam.x + w / 2 / cam.zoom + step * 2;
    const bottom = h + 90;
    const sand = rgbNum(palette.sand);
    const ridge = rgbNum(palette.sandRidge);
    const shade = rgbNum(palette.sandShade);
    // Salt pans read as pale crust — a hard shift toward white.
    const salt: RGB = lerpRGB(palette.sand, [244, 246, 250], 0.72);
    const saltNum = rgbNum(salt);
    const saltRidge = rgbNum(lerpRGB(palette.sandRidge, [255, 255, 255], 0.8));

    const n = Math.min(4096, Math.ceil((x1 - x0) / step) + 2);
    this.ensureBuffers(n);

    // One sampling pass: heights, gaps, surface and screen coordinates
    // computed once, then reused by the fill, ridge and rough passes.
    for (let k = 0; k < n; k++) {
      const wx = x0 + k * step;
      this.xsBuf[k] = sx(wx);
      this.ysBuf[k] = sy(terrain.heightAt(wx));
      this.gapBuf[k] = terrain.gapAt(wx) !== null ? 1 : 0;
      this.surfBuf[k] = terrain.surfaceAt(wx) === "salt" ? 1 : 0;
    }

    // Contiguous grounded runs between chasms, split by surface material.
    let runCount = 0;
    let runStart = -1;
    let runSurf = 0;
    for (let k = 0; k < n; k++) {
      if (!this.gapBuf[k]) {
        if (runStart < 0) {
          runStart = k;
          runSurf = this.surfBuf[k];
        } else if (this.surfBuf[k] !== runSurf) {
          this.runsBuf[runCount * 2] = runStart;
          this.runsBuf[runCount * 2 + 1] = k - 1;
          runCount++;
          runStart = k;
          runSurf = this.surfBuf[k];
        }
      } else if (runStart >= 0) {
        this.runsBuf[runCount * 2] = runStart;
        this.runsBuf[runCount * 2 + 1] = k - 1;
        runCount++;
        runStart = -1;
      }
    }
    if (runStart >= 0) {
      this.runsBuf[runCount * 2] = runStart;
      this.runsBuf[runCount * 2 + 1] = n - 1;
      runCount++;
    }

    // Ground body per run (sand or salt crust).
    for (let r = 0; r < runCount; r++) {
      const a = this.runsBuf[r * 2];
      const b = this.runsBuf[r * 2 + 1];
      g.moveTo(this.xsBuf[a], this.ysBuf[a]);
      for (let k = a + 1; k <= b; k++) g.lineTo(this.xsBuf[k], this.ysBuf[k]);
      g.lineTo(this.xsBuf[b] + 2, bottom);
      g.lineTo(this.xsBuf[a] - 2, bottom);
      g.closePath();
      g.fill(this.surfBuf[a] ? saltNum : sand);
    }

    // Ridge highlight per run.
    for (let r = 0; r < runCount; r++) {
      const a = this.runsBuf[r * 2];
      const b = this.runsBuf[r * 2 + 1];
      g.moveTo(this.xsBuf[a], this.ysBuf[a]);
      for (let k = a + 1; k <= b; k++) g.lineTo(this.xsBuf[k], this.ysBuf[k]);
      g.stroke({
        width: 4,
        color: this.surfBuf[a] ? saltRidge : ridge,
        alpha: 0.9,
        join: "round",
      });
    }

    // Rough-zone shading, reusing the sampled profile.
    const roughs: RoughZone[] = terrain.roughInRange(x0, x1);
    for (const rz of roughs) {
      const a = Math.max(0, Math.ceil((rz.x0 - x0) / step));
      const b = Math.min(n - 1, Math.floor((rz.x1 - x0) / step));
      if (b <= a) continue;
      g.moveTo(this.xsBuf[a], this.ysBuf[a]);
      for (let k = a + 1; k <= b; k++) g.lineTo(this.xsBuf[k], this.ysBuf[k]);
      g.stroke({ width: 8, color: shade, alpha: 0.5, join: "round" });
    }

    // Chasm darkness and walls.
    const gaps: Gap[] = terrain.gapsInRange(x0, x1);
    for (const gap of gaps) {
      const gx0 = sx(gap.x0);
      const gx1 = sx(gap.x1);
      if (gx1 < -40 || gx0 > w + 40) continue;
      const top = Math.min(
        sy(terrain.heightAt(gap.x0)),
        sy(terrain.heightAt(gap.x1)),
      );
      g.rect(gx0, top - 2, gx1 - gx0, bottom - top).fill({
        color: 0x140b06,
        alpha: 0.94,
      });
      g.moveTo(gx0, sy(terrain.heightAt(gap.x0)));
      g.lineTo(gx0, bottom);
      g.stroke({ width: 3, color: shade, alpha: 0.7 });
      g.moveTo(gx1, sy(terrain.heightAt(gap.x1)));
      g.lineTo(gx1, bottom);
      g.stroke({ width: 3, color: shade, alpha: 0.7 });
    }
  }

  private ensureBuffers(n: number): void {
    if (n <= this.bufN) return;
    this.bufN = Math.max(256, 2 ** Math.ceil(Math.log2(n)));
    this.xsBuf = new Float64Array(this.bufN);
    this.ysBuf = new Float64Array(this.bufN);
    this.gapBuf = new Uint8Array(this.bufN);
    this.surfBuf = new Uint8Array(this.bufN);
  }

  /**
   * Grind rails: support posts at both ends and the taut line with its
   * mid-span sag. Drawn behind entities so the rider reads as on top.
   */
  drawRails(
    g: Graphics,
    cam: CamView,
    w: number,
    h: number,
    rails: Rail[],
    _palette: Palette,
    time: number,
  ): void {
    const { sx, sy } = makeProjector(cam, w, h);
    for (const rail of rails) {
      const ax = sx(rail.x0);
      const bx = sx(rail.x1);
      if (bx < -60 || ax > w + 60) continue;
      const ay = sy(rail.y);
      const by = sy(rail.y);
      const midY = sy(rail.y + rail.sag);
      const groundY0 = sy(rail.y + rail.lift);
      const groundY1 = sy(rail.y + rail.lift);
      // posts
      g.moveTo(ax, ay + 2);
      g.lineTo(ax, groundY0);
      g.stroke({ width: 3 * cam.zoom, color: 0x4a3423, alpha: 0.85 });
      g.moveTo(bx, by + 2);
      g.lineTo(bx, groundY1);
      g.stroke({ width: 3 * cam.zoom, color: 0x4a3423, alpha: 0.85 });
      // line (quadratic through the sag)
      const midX = (ax + bx) / 2;
      g.moveTo(ax, ay);
      g.quadraticCurveTo(midX, midY * 2 - (ay + by) / 2, bx, by);
      const glint = 0.75 + 0.25 * Math.sin(time * 3);
      g.stroke({ width: 3.5 * cam.zoom, color: 0xffd76a, alpha: 0.55 * glint, join: "round" });
      g.stroke({ width: 1.5 * cam.zoom, color: 0x2a1c10, alpha: 0.8, join: "round" });
    }
  }

  /** The chasing storm wall: a dust front advancing from the left edge. */
  drawStorm(
    g: Graphics,
    cam: CamView,
    w: number,
    _h: number,
    stormX: number,
    proximity: number,
    time: number,
  ): void {
    const { sx } = makeProjector(cam, w, 0);
    const front = sx(stormX);
    if (front > w + 200) return;
    const alpha = Math.min(1, 0.25 + proximity * 0.75);
    const churn = Math.sin(time * 7) * 6 * proximity;
    // dense core behind the front, fading tail to the left edge
    const gradStop = Math.max(-80, front - 340);
    g.rect(gradStop, -40, front - gradStop + 40, 2000).fill({
      color: 0xb0824f,
      alpha: 0.32 * alpha,
    });
    g.rect(Math.max(-80, front - 120), -40, front - Math.max(-80, front - 120) + 40, 2000).fill({
      color: 0x8a5c33,
      alpha: 0.4 * alpha,
    });
    // the rolling front itself
    g.moveTo(front + churn, -40);
    g.lineTo(front + churn, 2000);
    g.stroke({ width: 14, color: 0xc89a62, alpha: 0.5 * alpha });
    g.moveTo(front + churn * 0.6 + 8, -40);
    g.lineTo(front + churn * 0.6 + 8, 2000);
    g.stroke({ width: 5, color: 0xf2d9a8, alpha: 0.35 * alpha });
  }

  drawEntities(
    g: Graphics,
    cam: CamView,
    w: number,
    h: number,
    obstacles: Obstacle[],
    orbs: Orb[],
    time: number,
    palette: Palette,
    highContrast = false,
  ): void {
    g.clear();
    const { sx, sy } = makeProjector(cam, w, h);

    for (const o of obstacles) {
      const ox = sx(o.x);
      if (ox < -80 || ox > w + 80) continue;
      if (o.kind === "rock") {
        g.poly(rockShape(o).map((v, i) => (i % 2 === 0 ? sx(v) : sy(v))));
        g.fill(rgbNum(palette.sandShade));
        g.poly(rockShape(o).map((v, i) => (i % 2 === 0 ? sx(v) : sy(v))));
        g.stroke({ width: 2, color: 0x1d130d, alpha: 0.6 });
      } else {
        const bx = sx(o.x);
        const by = sy(o.y + 34);
        const th = 68 * cam.zoom;
        // trunk
        g.roundRect(bx - 6 * cam.zoom, by - th, 12 * cam.zoom, th, 6 * cam.zoom);
        g.fill(0x3f6b4f);
        // arms
        g.roundRect(bx - 22 * cam.zoom, by - th * 0.72, 16 * cam.zoom, 7 * cam.zoom, 3 * cam.zoom);
        g.fill(0x3f6b4f);
        g.roundRect(bx - 22 * cam.zoom, by - th * 0.9, 7 * cam.zoom, 20 * cam.zoom, 3 * cam.zoom);
        g.fill(0x3f6b4f);
        g.roundRect(bx + 6 * cam.zoom, by - th * 0.6, 16 * cam.zoom, 7 * cam.zoom, 3 * cam.zoom);
        g.fill(0x3f6b4f);
        g.roundRect(bx + 15 * cam.zoom, by - th * 0.78, 7 * cam.zoom, 18 * cam.zoom, 3 * cam.zoom);
        g.fill(0x3f6b4f);
        g.roundRect(bx - 6 * cam.zoom, by - th, 12 * cam.zoom, th, 6 * cam.zoom);
        g.stroke({ width: 2, color: 0x1d3a2a, alpha: 0.7 });
      }
    }

    for (const orb of orbs) {
      if (orb.taken) continue;
      const ox = sx(orb.x);
      if (ox < -40 || ox > w + 40) continue;
      const pulse = 1 + 0.12 * Math.sin(time * 4 + orb.phase);
      const oy = sy(orb.y);
      if (highContrast) {
        // Colorblind-safe sunstone: white core, dark edge, cyan halo.
        g.circle(ox, oy, ORB_RADIUS * 2.2 * cam.zoom * pulse).fill({
          color: ORB_HC.halo,
          alpha: 0.3,
        });
        g.circle(ox, oy, ORB_RADIUS * cam.zoom * pulse);
        g.fill(ORB_HC.core);
        g.stroke({ width: 3, color: ORB_HC.edge, alpha: 0.95 });
      } else {
        g.circle(ox, oy, ORB_RADIUS * 1.9 * cam.zoom * pulse).fill({
          color: 0xffd76a,
          alpha: 0.16,
        });
        g.circle(ox, oy, ORB_RADIUS * cam.zoom * pulse).fill({
          color: 0xffd76a,
          alpha: 0.9,
        });
        g.circle(ox - 3 * cam.zoom, oy - 3 * cam.zoom, 3.4 * cam.zoom).fill({
          color: 0xfff3c4,
          alpha: 0.95,
        });
      }
    }
  }
}
