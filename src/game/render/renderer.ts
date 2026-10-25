/**
 * Renderer: owns the Pixi Application, the layer stack, and the camera.
 * The game core stays engine-agnostic — it hands the renderer a RenderState
 * every frame and the renderer turns it into pixels.
 */

import { Application, Graphics } from "pixi.js";
import type { Palette } from "../world/biome";
import type { Rail, Terrain } from "../world/chunks";
import type { Obstacle } from "../world/obstacles";
import type { Orb } from "../world/collectibles";
import type { RiderPose } from "./rider";
import { loadSceneArt } from "./art";
import { Floaters } from "./floaters";
import { ParallaxView } from "./parallax";
import { Particles } from "./particles";
import { RiderView } from "./rider";
import { SkyView } from "./sky";
import { Weather } from "./weather";
import { WorldView, type CamView } from "./world-view";

/** Trauma lost per second. */
const TRAUMA_DECAY = 1.6;
/** Max shake offset (screen px) at full trauma — scaled by trauma². */
const MAX_SHAKE_X = 14;
const MAX_SHAKE_Y = 9;

export interface InterpBody {
  px: number;
  py: number;
  pAngle: number;
  x: number;
  y: number;
  angle: number;
}

export interface RenderState {
  alpha: number;
  time: number;
  dt: number;
  worldX: number;
  palette: Palette;
  terrain: Terrain;
  obstacles: Obstacle[];
  orbs: Orb[];
  rails: Rail[];
  /** Active storm wall, when it's in the run. */
  storm: { x: number; proximity: number } | null;
  /** Rider is locked into a rail grind. */
  grinding: boolean;
  body: InterpBody;
  rider: Omit<RiderPose, "x" | "y" | "angle">;
  cam: { px: number; py: number; pZoom: number; x: number; y: number; zoom: number };
  weather: Weather;
  particles: Particles;
  carving: { angle: number; speed: number } | null;
  /** Accessibility: colorblind-safe sunstone rendering. */
  highContrast: boolean;
}

export class Renderer {
  app = new Application();
  w = 960;
  h = 540;

  readonly weather = new Weather(1);
  readonly particles = new Particles();

  private sky = new SkyView();
  private parallax: ParallaxView;
  private worldView = new WorldView();
  private riderView = new RiderView();
  private floaters = new Floaters();

  private worldG = new Graphics();
  private entityG = new Graphics();
  private particleG = new Graphics();
  private resizeObserver: ResizeObserver | null = null;

  /** Shake trauma 0..1; the offset is trauma², so small hits stay gentle. */
  private trauma = 0;
  private shakeT = 0;
  shakeEnabled = true;

  constructor(seed: number) {
    this.parallax = new ParallaxView(seed);
    this.weather = new Weather(seed);
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    await this.app.init({
      canvas,
      resizeTo: canvas.parentElement ?? canvas,
      antialias: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoDensity: true,
      background: 0x070b1c,
      powerPreference: "high-performance",
    });
    this.measure();

    // Kenney scenery art (CC0). Null on failure → plain-dune fallback.
    const art = await loadSceneArt();
    this.sky.setArt(art);
    this.parallax.setArt(art);

    const stage = this.app.stage;
    stage.addChild(this.sky.container);
    stage.addChild(this.parallax.container);
    stage.addChild(this.worldG);
    stage.addChild(this.entityG);
    stage.addChild(this.particleG);
    stage.addChild(this.floaters.container);
    stage.addChild(this.riderView.scarfGfx);
    stage.addChild(this.riderView.container);
    stage.addChild(this.weather.container);

    // Keep logical size fresh even if Pixi's ResizePlugin misses a layout pass.
    const parent = canvas.parentElement;
    if (parent && typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.measure());
      this.resizeObserver.observe(parent);
    }
  }

  private measure(): void {
    // Guard against callbacks after destroy (app.renderer is nulled by Pixi).
    const renderer = this.app.renderer;
    if (!renderer) return;
    this.w = renderer.screen.width;
    this.h = renderer.screen.height;
  }

  /**
   * Add shake trauma (0..1 scale). Hits ADD — they don't reset — and the
   * applied offset is trauma², so small hits barely move the camera.
   */
  addShake(amount: number): void {
    if (!this.shakeEnabled) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Impulse the rider's squash & stretch spring (see RiderView.kick). */
  riderKick(amount: number): void {
    this.riderView.kick(amount);
  }

  /** Reduced-motion gate for transient deformation (hit-stop is gated in Game). */
  setMotionEffects(enabled: boolean): void {
    this.riderView.motionEnabled = enabled;
  }

  /** Pop a score label at a world position (pooled; see Floaters). */
  spawnFloater(x: number, y: number, label: string, color?: number): void {
    this.floaters.spawn(x, y, label, color);
  }

  resetScarf(x: number, y: number): void {
    this.riderView.reset(x, y);
  }

  draw(state: RenderState): void {
    this.measure();
    const { w, h } = this;

    // interpolated camera
    const cam: CamView = {
      x: state.cam.px + (state.cam.x - state.cam.px) * state.alpha,
      y: state.cam.py + (state.cam.y - state.cam.py) * state.alpha,
      zoom: state.cam.pZoom + (state.cam.zoom - state.cam.pZoom) * state.alpha,
      shx: 0,
      shy: 0,
    };

    // Shake: smooth sinusoidal offsets driven by decaying trauma — never a
    // random offset per frame (that buzzes like static). The phase resets
    // while idle so each hit attacks from zero.
    this.trauma = Math.max(0, this.trauma - state.dt * TRAUMA_DECAY);
    if (this.trauma > 0.002) {
      this.shakeT += state.dt * 30;
      const s2 = this.trauma * this.trauma;
      cam.shx = MAX_SHAKE_X * s2 * Math.sin(this.shakeT * 1.7);
      cam.shy = MAX_SHAKE_Y * s2 * Math.sin(this.shakeT * 2.3);
    } else {
      this.shakeT = 0;
    }

    this.sky.draw(state.palette, w, h, state.worldX, state.time);
    this.parallax.draw(cam.x, state.palette, w, h);
    this.worldView.drawTerrain(this.worldG, cam, w, h, state.terrain, state.palette);
    this.worldView.drawRails(this.worldG, cam, w, h, state.rails, state.palette, state.time);
    this.worldView.drawEntities(
      this.entityG,
      cam,
      w,
      h,
      state.obstacles,
      state.orbs,
      state.time,
      state.palette,
      state.highContrast,
    );
    if (state.storm) {
      this.worldView.drawStorm(this.entityG, cam, w, h, state.storm.x, state.storm.proximity, state.time);
    }

    if (state.carving) {
      // spray at the board while carving (a couple per frame)
      this.particles.carve(
        state.body.x,
        state.body.y,
        state.carving.angle,
        state.carving.speed,
        0xf2c294,
      );
      this.particles.carve(
        state.body.x,
        state.body.y,
        state.carving.angle,
        state.carving.speed * 0.8,
        0xd9a06c,
      );
    }
    this.particles.draw(this.particleG, cam, w, h);
    this.floaters.update(state.dt, cam, w, h);

    const b = state.body;
    this.riderView.draw(
      cam,
      w,
      h,
      {
        x: b.px + (b.x - b.px) * state.alpha,
        y: b.py + (b.y - b.py) * state.alpha,
        angle: b.pAngle + shortestAngle(b.pAngle, b.angle) * state.alpha,
        grounded: state.rider.grounded,
        charging: state.rider.charging,
        charge: state.rider.charge,
        grabbing: state.rider.grabbing,
        grinding: state.grinding,
        crashed: state.rider.crashed,
        speed: state.rider.speed,
      },
      state.dt,
    );

    this.weather.draw(w, h, state.palette);

    this.app.render();
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.app.destroy(false, { children: true });
  }
}

function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
