/**
 * Parallax scenery, back to front:
 *   far mountains → landmarks → mid hills → near dune (+ roadside scenery).
 * The mountains, hills, landmarks and scenery are the Kenney Background
 * Elements pack (CC0, see art.ts); each is recoloured every frame from the
 * day/night + biome palette so it keeps the sky's light. The near dune is
 * still a noise-driven silhouette: it is the ground the scenery stands on and
 * it must blend into the playable terrain in front of it.
 * Landmarks rise every ~2 km so distance progress is perceivable; their
 * positions and the scenery are pure functions of a slot index, so every rider
 * and seed sees the same ones at the same distances.
 * Without art (load failure) the far and mid layers fall back to plain
 * noise dunes.
 */

import { Container, Graphics, Sprite } from "pixi.js";
import { Noise1D, hash2 } from "../core/rng";
import { rgbNum, type Palette } from "../world/biome";
import {
  hazed,
  landmarkFor,
  SCENERY_SLOT,
  SPRITE_SCALE,
  sceneryAt,
  spriteTint,
  tintFor,
  type SceneArt,
} from "./art";

/** Landmark spacing: 2 km at 40 px/m, in world pixels. */
const LANDMARK_SPACING = 80000;
/** Parallax factor the landmarks share with the mid hills. */
const LANDMARK_FACTOR = 0.28;
const NEAR_FACTOR = 0.5;

/** The pack's tileable layers are 1024×400; where their ridge sits inside. */
const TILE_H = 400;
const MOUNTAIN_RIDGE_MEAN = 120;
const HILL_RIDGE_MEAN = 57;
const HILL_RIDGE_MAX = 117;

interface Layer {
  gfx: Graphics;
  factor: number;
  baseFrac: number;
  ampFrac: number;
  wl: number;
  noise: Noise1D;
  color: (p: Palette) => [number, number, number];
}

/**
 * A recolourable tiled silhouette with a solid fill below it. Plain sprites
 * side by side rather than a TilingSprite: a tiling sampler wraps the
 * texture's solid bottom row onto its transparent top, leaving a hairline.
 */
class TiledLayer {
  readonly container = new Container();
  private readonly sprites: Sprite[] = [];
  private readonly fill = new Graphics();

  constructor(private readonly texture: SceneArt["bg"]["hills"]) {
    this.container.addChild(this.fill);
  }

  /**
   * @param scale   texture px → screen px
   * @param ridgeY  screen y the layer's mean ridge height lands on
   * @param ridgeMean where that mean ridge sits inside the texture
   */
  draw(w: number, h: number, scale: number, ridgeY: number, ridgeMean: number, scroll: number, tint: number, color: [number, number, number]): void {
    const y0 = ridgeY - ridgeMean * scale;
    const tileW = this.texture.width * scale;
    const need = Math.ceil(w / tileW) + 2;
    while (this.sprites.length < need) {
      const sp = new Sprite(this.texture);
      this.sprites.push(sp);
      this.container.addChild(sp);
    }
    const offset = -(((scroll % tileW) + tileW) % tileW);
    for (let i = 0; i < this.sprites.length; i++) {
      const sp = this.sprites[i];
      sp.visible = i < need;
      if (!sp.visible) continue;
      // 1px overlap hides seams between neighbours
      sp.position.set(offset + i * tileW - 0.5, y0);
      sp.scale.set((tileW + 1) / this.texture.width, scale);
      sp.tint = tint;
    }
    // everything below the texture is the same solid tone
    const bottom = y0 + TILE_H * scale;
    this.fill.clear();
    if (bottom < h + 4) this.fill.rect(0, bottom - 1, w, h + 5 - bottom).fill(rgbNum(color));
  }
}

export class ParallaxView {
  readonly container = new Container();
  private layers: Layer[];
  private art: SceneArt | null = null;
  private seed: number;

  private readonly farArt = new Container();
  private readonly landmarkArt = new Container();
  private readonly midArt = new Container();
  private readonly sceneryArt = new Container();
  private far: TiledLayer | null = null;
  private mid: TiledLayer | null = null;
  private landmarkPool: Sprite[] = [];
  private sceneryPool: Sprite[] = [];

  constructor(seed: number) {
    this.seed = seed;
    const mk = (
      factor: number,
      baseFrac: number,
      ampFrac: number,
      wl: number,
      noise: Noise1D,
      color: Layer["color"],
    ): Layer => {
      const gfx = new Graphics();
      return { gfx, factor, baseFrac, ampFrac, wl, noise, color };
    };
    this.layers = [
      mk(0.12, 0.52, 0.2, 950, new Noise1D(seed ^ 0x1f2e3d), (p) => p.duneFar),
      mk(0.28, 0.64, 0.24, 640, new Noise1D(seed ^ 0x4b5c6d), (p) => p.duneMid),
      mk(NEAR_FACTOR, 0.78, 0.27, 440, new Noise1D(seed ^ 0x7a8b9c), (p) => p.duneNear),
    ];
    // far → landmarks → mid → near dune → scenery on the near ridge
    this.container.addChild(
      this.layers[0].gfx,
      this.farArt,
      this.landmarkArt,
      this.layers[1].gfx,
      this.midArt,
      this.layers[2].gfx,
      this.sceneryArt,
    );
  }

  /** Attach the loaded Kenney art (null keeps the plain-dune fallback). */
  setArt(art: SceneArt | null): void {
    this.art = art;
    if (!art) return;
    this.far = new TiledLayer(art.bg.mountains);
    this.mid = new TiledLayer(art.bg.hills);
    this.farArt.addChild(this.far.container);
    this.midArt.addChild(this.mid.container);
    this.layers[0].gfx.clear();
    this.layers[1].gfx.clear();
  }

  draw(camX: number, p: Palette, w: number, h: number): void {
    const art = this.art;
    if (art && this.far && this.mid) {
      // distant mountains: hazy, drifting very slowly
      const sFar = h * 0.00105;
      const far = hazed(p.duneFar, p, 0.3);
      this.far.draw(w, h, sFar, h * 0.5, MOUNTAIN_RIDGE_MEAN, camX * this.layers[0].factor, tintFor(far), far);
      // landmarks stand behind the hills
      const sMid = h * 0.0014;
      const midRidgeY = h * 0.64;
      this.drawLandmarks(camX, p, w, h, art, midRidgeY - HILL_RIDGE_MEAN * sMid + (HILL_RIDGE_MAX + 6) * sMid);
      this.mid.draw(w, h, sMid, midRidgeY, HILL_RIDGE_MEAN, camX * this.layers[1].factor, tintFor(p.duneMid), p.duneMid);
    } else {
      this.drawLayer(this.layers[0], camX, p, w, h);
      this.drawLayer(this.layers[1], camX, p, w, h);
    }
    this.drawLayer(this.layers[2], camX, p, w, h);
    if (art) this.drawScenery(camX, p, w, h, art);
  }

  private drawLayer(l: Layer, camX: number, p: Palette, w: number, h: number): void {
    l.gfx.clear();
    const step = 34;
    const baseY = h * l.baseFrac;
    const amp = h * l.ampFrac;
    const scroll = camX * l.factor;
    l.gfx.moveTo(-step, baseY - l.noise.fbm((-step + scroll) / l.wl, 3) * amp);
    for (let sx = -step; sx <= w + step; sx += step) {
      const y = baseY - l.noise.fbm((sx + scroll) / l.wl, 3) * amp;
      l.gfx.lineTo(sx, y);
    }
    l.gfx.lineTo(w + step, h + 4);
    l.gfx.lineTo(-step, h + 4);
    l.gfx.closePath();
    l.gfx.fill({ color: rgbNum(l.color(p)), alpha: 1 });
  }

  /** A pooled sprite from `pool`, created on demand and parented to `parent`. */
  private sprite(pool: Sprite[], i: number, parent: Container, art: SceneArt): Sprite {
    let sp = pool[i];
    if (!sp) {
      sp = new Sprite(art.sprites.cactus1);
      parent.addChild(sp);
      pool[i] = sp;
    }
    sp.visible = true;
    return sp;
  }

  /**
   * One landmark per deterministic slot. Positions and kinds are pure
   * functions of the slot index. `baseY` is below the lowest point of the
   * hills in front, so a landmark always rises out from behind them.
   */
  private drawLandmarks(camX: number, p: Palette, w: number, h: number, art: SceneArt, baseY: number): void {
    const viewWorldMin = camX - 200 / LANDMARK_FACTOR;
    const viewWorldMax = camX + (w + 200) / LANDMARK_FACTOR;
    const i0 = Math.max(0, Math.floor(viewWorldMin / LANDMARK_SPACING));
    const i1 = Math.ceil(viewWorldMax / LANDMARK_SPACING);
    let used = 0;
    if (i1 >= 0 && i0 <= i1) {
      const tint = spriteTint(p, 0.5 + 0.25 * p.night);
      for (let i = i0; i <= i1; i++) {
        const wx = i * LANDMARK_SPACING + hash2(i, 911) * LANDMARK_SPACING * 0.5;
        const cx = (wx - camX) * LANDMARK_FACTOR;
        if (cx < -160 || cx > w + 160) continue;
        const name = landmarkFor(i);
        const tex = art.sprites[name];
        const sp = this.sprite(this.landmarkPool, used++, this.landmarkArt, art);
        sp.texture = tex;
        sp.anchor.set(0.5, 1);
        const tall = name === "tower" || name === "towerAlt";
        const wide = name === "castleSmall" || name === "castleSmallAlt";
        // sized to stand well clear of the hills they rise from behind
        const target = h * ((tall ? 0.42 : wide ? 0.27 : 0.36) + hash2(i, 313) * 0.1);
        sp.scale.set(Math.max(SPRITE_SCALE * 0.4, target / tex.height));
        sp.position.set(cx, baseY);
        sp.tint = tint;
      }
    }
    for (let k = used; k < this.landmarkPool.length; k++) this.landmarkPool[k].visible = false;
  }

  /** Cacti, palms, dead trees and bushes planted along the near dune's ridge. */
  private drawScenery(camX: number, p: Palette, w: number, h: number, art: SceneArt): void {
    const near = this.layers[2];
    const scroll = camX * near.factor;
    const baseY = h * near.baseFrac;
    const amp = h * near.ampFrac;
    const i0 = Math.floor((scroll - 240) / SCENERY_SLOT);
    const i1 = Math.ceil((scroll + w + 240) / SCENERY_SLOT);
    // darker in the dark: sprites share the ground's light
    const tint = spriteTint(p, 0.42 + 0.3 * p.night);
    let used = 0;
    for (let i = i0; i <= i1; i++) {
      const item = sceneryAt(i, this.seed);
      if (!item) continue;
      const sx = item.x - scroll;
      const ridge = baseY - near.noise.fbm(item.x / near.wl, 3) * amp;
      const tex = art.sprites[item.name];
      const sp = this.sprite(this.sceneryPool, used++, this.sceneryArt, art);
      sp.texture = tex;
      sp.anchor.set(0.5, 0.94);
      const k = (item.heightFrac * h) / tex.height;
      sp.scale.set(item.flip ? -k : k, k);
      sp.position.set(sx, ridge + 2);
      sp.tint = tint;
    }
    for (let k = used; k < this.sceneryPool.length; k++) this.sceneryPool[k].visible = false;
  }
}
