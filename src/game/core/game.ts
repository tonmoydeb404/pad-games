/**
 * Game: the orchestrator. Owns the loop, input, audio, world, player,
 * scoring and the renderer; exposes a tiny imperative API to the React shell
 * and pushes slow-changing data out through an event emitter. No React here.
 */

import { Emitter } from "./events";
import { Loop } from "./loop";
import { params } from "./params";
import { dailySeedFor } from "./rng";
import type { ActionSnapshot } from "../input/actions";
import type { GameEvents, GameState, RunMode, RunSummary, Settings, ToastEvent } from "./types";
import { InputManager } from "../input/input";
import { Haptics } from "../input/haptics";
import { Mixer } from "../audio/mixer";
import { PlayerBody, type LandingQuality } from "../player/body";
import { TrickTracker } from "../player/tricks";
import { Renderer } from "../render/renderer";
import { OrbField, ORB_COLLECT } from "../world/collectibles";
import { ObstacleField } from "../world/obstacles";
import { GoalEngine } from "../world/goals";
import { StormWall } from "../world/storm";
import { Terrain } from "../world/chunks";
import { clamp, paletteAt } from "../world/biome";

export interface GameOptions {
  canvas: HTMLCanvasElement;
  settings: Settings;
}

const ATTRACT_RESET_PX = 30000;
const TAU = Math.PI * 2;
/** Crash animation bounds (seconds) before the results menu appears. */
const CRASH_MIN = 1.5;
const CRASH_MAX = 3.2;

/**
 * Feedback presets per event importance. The shake offset is trauma², so a
 * small trauma barely moves the camera while a big one punches. `hitStop` is
 * seconds of slow-motion freeze — skipped under the reduced-motion setting.
 */
const IMPACT = {
  pickup: { trauma: 0.06, hitStop: 0 },
  landClean: { trauma: 0.3, hitStop: 0.045 },
  landRough: { trauma: 0.36, hitStop: 0 },
  crash: { trauma: 0.65, hitStop: 0.095 },
} as const;
type ImpactTier = keyof typeof IMPACT;

export class Game {
  readonly events = new Emitter<GameEvents>();

  private loop: Loop;
  private input = new InputManager();
  private haptics: Haptics;
  private mixer = new Mixer();
  private renderer: Renderer;
  private terrain: Terrain;
  private obstacles = new ObstacleField();
  private orbs = new OrbField();
  private body = new PlayerBody();
  private tricks = new TrickTracker();
  private storm = new StormWall();
  private goals = new GoalEngine();
  private settings: Settings;

  private state: GameState = "booting";
  private mode: RunMode = "attract";
  private seed: number;

  private time = 0;
  private runTime = 0;
  private lastHudAt = 0;
  private fps = 0;
  private startX = 0;
  private lastX = 0;
  private grabAccum = 0;
  private toastSeq = 0;
  private riderCrashed = false;
  private crashTimer = 0;
  private lastStumbleAt = -100;
  private inputGrace = 0;
  private summary: RunSummary | null = null;
  private endedBy: RunSummary["endedBy"] = "crash";
  private destroyed = false;
  /** Seconds of zoom punch-in remaining after a landing. */
  private zoomPunch = 0;
  /** Current simulation time scale (chasm slow-mo). */
  private simScale = 1;
  /** Grind meters this run (goal counter). */
  private runGrindMeters = 0;
  /** Sunstones this run (goal counter). */
  private runSunstones = 0;
  /** Big airs this run (goal counter). */
  private runBigAirs = 0;

  private cam = { x: 0, y: 0, zoom: 1, px: 0, py: 0, pZoom: 1 };

  private visibility = () => {
    if (document.hidden && this.state === "running") this.pause();
  };

  private constructor(opts: GameOptions, seed: number) {
    this.settings = opts.settings;
    this.seed = seed;
    this.terrain = new Terrain(seed);
    this.renderer = new Renderer(seed);
    this.haptics = new Haptics(() => this.input.pads.getPad());
    this.loop = new Loop({
      update: (dt) => this.update(dt),
      render: (alpha, frameDt) => this.render(alpha, frameDt),
      onFps: (fps) => {
        this.fps = fps;
      },
    });
  }

  static async create(opts: GameOptions): Promise<Game> {
    const seed = (Math.random() * 2 ** 31) | 0;
    const game = new Game(opts, seed);
    await game.renderer.init(opts.canvas);
    game.setupAttract();
    game.input.attach();
    game.applySettings(opts.settings);

    game.input.pads.onConnect = (info) => {
      game.events.emit("pad", { connected: true, id: info.id });
      game.emitToast("Controller connected", info.id.slice(0, 42), "info");
      game.uiSound("confirm");
    };
    game.input.pads.onDisconnect = () => {
      game.events.emit("pad", { connected: false, id: "" });
      game.emitToast("Controller disconnected", undefined, "info");
    };
    game.input.menuEvents.on("action", (action) => {
      game.events.emit("menu", action);
    });

    document.addEventListener("visibilitychange", game.visibility);
    // A gamepad button press is not a "user activation" for the AudioContext,
    // so unlock audio on the first pointer/keyboard gesture too.
    const unlock = () => {
      game.mixerEnsure();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    game.loop.start();
    game.state = "menu";
    game.emitState();
    game.emitHud(true);
    return game;
  }

  getState(): GameState {
    return this.state;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.loop.stop();
    document.removeEventListener("visibilitychange", this.visibility);
    this.input.detach();
    this.input.menuEvents.clear();
    this.events.clear();
    this.mixer.dispose();
    this.renderer.destroy();
  }

  // ------------------------------------------------------------------
  // Public API used by the React shell
  // ------------------------------------------------------------------

  startRun(mode: "daily" | "free"): void {
    if (this.destroyed) return;
    this.mixer.ensure();
    const seed = mode === "daily" ? dailySeedFor() : (Math.random() * 2 ** 31) | 0;
    this.seed = seed;
    this.mode = mode;
    this.terrain.regenerate(seed);
    this.obstacles.regenerate(seed, this.terrain);
    this.orbs.regenerate(seed, this.terrain);
    this.renderer.particles.list = [];
    this.renderer.weather.regenerate(seed);
    this.body.reset(this.terrain);
    this.tricks.reset();
    this.storm.reset();
    this.goals.startRun();
    this.riderCrashed = false;
    this.terrain.ensure(-500, 3600);
    this.obstacles.ensure(0, 3200);
    this.orbs.ensure(0, 3200);
    this.runTime = 0;
    this.lastStumbleAt = -100;
    this.startX = this.body.s.x;
    this.lastX = this.body.s.x;
    this.grabAccum = 0;
    this.inputGrace = 0.22;
    this.zoomPunch = 0;
    this.simScale = 1;
    this.runGrindMeters = 0;
    this.runSunstones = 0;
    this.runBigAirs = 0;
    this.loop.clearHitStop();

    const s = this.body.s;
    this.cam = {
      x: s.x + 220,
      y: s.y - 90,
      zoom: 1,
      px: s.x + 220,
      py: s.y - 90,
      pZoom: 1,
    };
    this.renderer.resetScarf(s.x, s.y);
    this.state = "running";
    this.emitState();
    this.emitHud(true);
    this.mixer.setDucked(false);
  }

  pause(): void {
    if (this.state !== "running") return;
    this.state = "paused";
    this.emitState();
    this.mixer.setDucked(true);
    this.haptics.ui("back");
  }

  resume(): void {
    if (this.state !== "paused") return;
    this.mixer.ensure();
    this.state = "running";
    this.emitState();
    this.mixer.setDucked(false);
  }

  togglePause(): void {
    if (this.state === "running") this.pause();
    else if (this.state === "paused") this.resume();
  }

  restart(): void {
    if (this.mode === "daily") this.startRun("daily");
    else this.startRun("free");
  }

  quitToMenu(): void {
    this.mode = "attract";
    this.setupAttract();
    this.state = "menu";
    this.emitState();
    this.mixer.setDucked(true);
  }

  applySettings(settings: Settings): void {
    this.settings = settings;
    this.haptics.enabled = settings.rumble;
    this.renderer.shakeEnabled = settings.shake;
    this.renderer.setMotionEffects(!settings.reducedMotion);
    this.mixer.setMusic(settings.music);
    this.mixer.setSfx(settings.sfx);
  }

  uiSound(kind: "move" | "confirm" | "back"): void {
    this.mixer.ensure();
    this.mixer.ui(kind);
    this.haptics.ui(kind);
  }

  /** AudioContext unlock hook (gamepad input isn't a user activation). */
  mixerEnsure(): void {
    this.mixer.ensure();
  }

  lastSummary(): RunSummary | null {
    return this.summary;
  }

  // ------------------------------------------------------------------
  // World setup
  // ------------------------------------------------------------------

  private setupAttract(): void {
    const seed = (Math.random() * 2 ** 31) | 0;
    this.seed = seed;
    this.terrain.regenerate(seed);
    this.obstacles.regenerate(seed, this.terrain);
    this.orbs.regenerate(seed, this.terrain);
    this.obstacles.list = [];
    this.renderer.particles.list = [];
    this.renderer.weather.regenerate(seed);
    this.body.reset(this.terrain);
    this.terrain.ensure(-500, 3600);
    const s = this.body.s;
    this.cam = {
      x: s.x + 220,
      y: s.y - 90,
      zoom: 1,
      px: s.x + 220,
      py: s.y - 90,
      pZoom: 1,
    };
    this.renderer.resetScarf(s.x, s.y);
  }

  // ------------------------------------------------------------------
  // Simulation
  // ------------------------------------------------------------------

  private update(dt: number): void {
    if (this.destroyed) return;
    this.time += dt;
    const stateBefore = this.state;
    const input = this.input.update(dt * 1000);
    if (input.anyPressed) this.mixer.ensure();

    // Resuming goes through the menu "back" action, which fires inside
    // input.update() on the same key press; only pause if the state was
    // already running before polling, or we'd re-pause right after resume.
    if (input.pausePressed && stateBefore === "running" && this.state === "running") {
      this.pause();
    }

    if (this.state === "menu") this.updateAttract(dt);
    else if (this.state === "running") this.updateRun(dt, input);
    else if (this.state === "crashing") this.updateCrash(dt);
    else if (this.state === "gameover") this.updateGameOver(dt);

    this.renderer.particles.update(dt);

    if (this.time - this.lastHudAt > 0.1) {
      this.emitHud(false);
    }
  }

  private updateAttract(dt: number): void {
    const s = this.body.s;
    this.body.beginStep();
    this.cam.px = this.cam.x;
    this.cam.py = this.cam.y;
    this.cam.pZoom = this.cam.zoom;

    const ai = neutralAI;
    this.body.syncFastFall(ai);
    const ev = this.body.update(dt, ai, this.terrain);
    if (ev.crashed) this.body.rescue(this.terrain);
    // Gentle governor so the attract cam stays calm.
    if (s.vx > 620) s.vx *= 1 - Math.min(1, dt * 0.9);

    if (s.x > ATTRACT_RESET_PX) this.setupAttract();

    this.followCamera(dt, s.vx, 0.86);
    this.ensureWorld(false);
    this.renderer.weather.update(dt, s.x, this.renderer.w, this.renderer.h, s.vx);
    this.mixer.update(dt, {
      speed: s.vx,
      grounded: s.grounded,
      air: !s.grounded,
      storm: this.renderer.weather.level,
      running: false,
      intensity: 0,
    });
  }

  private updateRun(dt: number, input: ReturnType<InputManager["update"]>): void {
    const s = this.body.s;
    this.runTime += dt;
    this.body.beginStep();
    this.cam.px = this.cam.x;
    this.cam.py = this.cam.y;
    this.cam.pZoom = this.cam.zoom;

    // Ignore the confirm press that started the run (e.g. held Space/A).
    if (this.inputGrace > 0) {
      this.inputGrace -= dt;
      input = neutralAI;
    }

    // Chasm slow-mo: the world breathes as a gap lines up, then snaps back.
    const simDt = dt * this.chasmTimeScale(dt);

    this.body.syncFastFall(input);
    const ev = this.body.update(simDt, input, this.terrain);

    if (ev.jumped) {
      this.mixer.jump(ev.jumped.charge);
      this.renderer.particles.burst(s.x, s.y, 10, 200, 0xe9b483);
      // Launch stretch: stronger pop off a fuller charge.
      this.renderer.riderKick(-(0.35 + ev.jumped.charge * 0.25));
    }
    if (ev.doubleJumped) {
      this.mixer.jump(0.35);
      this.renderer.particles.burst(s.x, s.y + 6, 8, 160, 0xffd76a);
      this.renderer.riderKick(-0.3);
    }
    if (ev.grindStarted) {
      this.haptics.pickup();
      this.renderer.particles.sparkle(s.x, s.y + 8);
      this.renderer.riderKick(-0.2);
    }
    if (ev.grindEnded) {
      const meters = ev.grindEnded.meters;
      this.runGrindMeters += meters;
      this.goals.setRunCounter("runGrindMeters", this.runGrindMeters);
      this.goals.addCareerCounter("careerGrindMeters", meters);
      const toast = this.tricks.endGrindSession(meters);
      if (toast) {
        this.emitToast(toast.name, `+${toast.points}`, "good");
        this.mixer.trick();
        this.renderer.spawnFloater(s.x, s.y - 40, `${toast.name} +${toast.points}`);
      }
      if (ev.grindEnded.reason === "jump") this.mixer.jump(0.6);
    }
    if (ev.landed) this.onLanded(ev.landed);
    if (ev.crashed) {
      this.tricks.loseChain();
      this.endRun(ev.crashed.reason === "fall" ? "fall" : "crash");
      return;
    }

    // ---- the storm wall ----
    const meters = (s.x - this.startX) / params.pxPerMeter;
    this.storm.update(simDt, s.x, meters, !s.grounded && !s.grind);
    if (this.storm.tierUp) this.emitToast("The wall surges!", undefined, "bad");
    if (this.storm.caught) {
      this.tricks.loseChain();
      this.endRun("storm");
      return;
    }

    // obstacle collision
    const hit = this.obstacles.collide(s.x, s.y, 9);
    if (hit) {
      // Forgiving: the first knock in a while only stumbles (slows you and
      // breaks the obstacle); a second one soon after ends the run.
      if (this.runTime - this.lastStumbleAt > 10) {
        this.lastStumbleAt = this.runTime;
        this.obstacles.list = this.obstacles.list.filter((o) => o !== hit);
        s.vx *= 0.5;
        s.vy = Math.min(s.vy, 0);
        this.impact("landRough");
        this.renderer.riderKick(0.6);
        this.renderer.particles.burst(hit.x, hit.y, 18, 260, 0xb9a48c);
        this.mixer.land("rough");
        this.haptics.land("rough");
        this.emitToast("Stumble!", undefined, "bad");
      } else {
        this.tricks.loseChain();
        this.endRun("obstacle");
        return;
      }
    }

    // pickups
    for (const orb of this.orbs.inRange(s.x - 120, s.x + 120)) {
      const dx = orb.x - s.x;
      const dy = orb.y - s.y;
      if (dx * dx + dy * dy < ORB_COLLECT * ORB_COLLECT) {
        orb.taken = true;
        this.runSunstones++;
        const toast = this.tricks.addPickup();
        this.tricks.addBoost(this.body.s, 0.12);
        this.renderer.particles.sparkle(orb.x, orb.y);
        this.renderer.spawnFloater(orb.x, orb.y - 18, `+${toast.points}`);
        this.impact("pickup");
        this.mixer.pickup();
        this.haptics.pickup();
        this.emitToast(toast.name, `+${toast.points}`, "good");
      }
    }
    this.goals.setRunCounter("runSunstones", this.runSunstones);

    // grab trick
    const grabbing = !s.grounded && input.jumpHeld;
    const grabPts = this.tricks.updateGrab(simDt, grabbing);
    if (grabPts > 0) this.grabAccum += grabPts;

    // distance score
    const metersRidden = (s.x - this.lastX) / params.pxPerMeter;
    this.tricks.addDistance(metersRidden);
    this.lastX = s.x;
    this.goals.setRunCounter(
      "runDistance",
      Math.floor((this.lastX - this.startX) / params.pxPerMeter),
    );

    this.followCamera(dt, s.vx, 1 - clamp((s.vx - 600) / 2200, 0, 0.2));
    this.ensureWorld();

    const speed = Math.hypot(s.vx, s.vy);
    this.renderer.weather.update(dt, s.x, this.renderer.w, this.renderer.h, s.vx);
    this.haptics.update(dt, {
      grounded: s.grounded,
      speed,
      storm: Math.min(1, this.renderer.weather.level + this.storm.proximity(s.x) * 0.8),
    });
    // Adaptive-music intensity: speed, combo depth, weather and the wall
    // all feed it; the mixer smooths and maps it to the pulse/arp layers.
    const intensity = clamp(
      (speed / 1400) * 0.65 +
        ((this.tricks.multiplier - 1) / 7) * 0.45 +
        this.renderer.weather.level * 0.15 +
        this.storm.proximity(s.x) * 0.35,
      0,
      1,
    );
    this.mixer.update(dt, {
      speed,
      grounded: s.grounded,
      air: !s.grounded,
      storm: Math.max(this.renderer.weather.level, this.storm.proximity(s.x)),
      running: true,
      intensity,
    });
    this.flushGoalCompletions();
  }

  /**
   * Ease the simulation time scale toward a gap: full speed in the open,
   * slowest deep inside a chasm approach, with a fast attack and a slow
   * release so the world snaps back after the lip.
   */
  private chasmTimeScale(dt: number): number {
    const s = this.body.s;
    let target = 1;
    const range = params.slowmoStartPx;
    const gaps = this.terrain.gapsInRange(s.x - 80, s.x + range + 400);
    for (const g of gaps) {
      const inside = s.x > g.x0 && s.x < g.x1;
      if (inside) {
        target = Math.min(target, params.slowmoMinScale);
        continue;
      }
      const ahead = g.x0 - s.x;
      if (s.vx > 0 && ahead > -60 && ahead < range) {
        const t = clamp(ahead / range, 0, 1);
        // grounded riders only dip partway — the dive is for the flight
        const floor = s.grounded ? 0.55 : params.slowmoMinScale;
        target = Math.min(target, floor + (1 - floor) * t);
      }
    }
    const k =
      target < this.simScale ? 1 - Math.exp(-dt * 9) : 1 - Math.exp(-dt * 2.4);
    this.simScale += (target - this.simScale) * k;
    return this.simScale;
  }

  /** Toast + HUD pulse for any goals finished since the last check. */
  private flushGoalCompletions(): void {
    while (this.goals.completedThisRun.length > 0) {
      const goal = this.goals.completedThisRun.shift()!;
      this.emitToast("Goal complete!", goal.label, "good");
      this.mixer.trick();
      this.haptics.pickup();
      this.renderer.spawnFloater(this.body.s.x, this.body.s.y - 70, "GOAL!");
    }
    if (this.goals.allDone && this.goals.maybeLevelUp()) {
      this.emitToast(`Level ${this.goals.level}`, "New goals unlocked", "info");
      this.goals.persist();
    }
  }

  private updateGameOver(dt: number): void {
    // Ragdoll tumble, keep the world alive behind the results overlay.
    const s = this.body.s;
    this.body.beginStep();
    this.cam.px = this.cam.x;
    this.cam.py = this.cam.y;
    this.cam.pZoom = this.cam.zoom;
    this.renderer.weather.update(dt, s.x, this.renderer.w, this.renderer.h, 0);
    this.mixer.update(dt, {
      speed: 0,
      grounded: false,
      air: false,
      storm: this.renderer.weather.level,
      running: false,
      intensity: 0,
    });
  }

  private onLanded(landed: {
    quality: LandingQuality;
    spins: number;
    speed: number;
    airTime: number;
    roughZone: boolean;
  }): void {
    const s = this.body.s;
    const quality = landed.quality;
    const grabPoints = Math.round(this.grabAccum);
    this.grabAccum = 0;
    const toasts = this.tricks.onLanding(quality, landed.spins, landed.airTime, grabPoints);

    // goal feeds: landing quality and trick tallies
    this.goals.setRunCounter("runSpins", this.tricks.spins);
    this.goals.setRunCounter("runCleanLandings", this.tricks.cleanLandings);
    this.goals.setMaxCounter("runMaxCombo", this.tricks.maxCombo);
    if (toasts.some((t) => t.name === "Big Air")) this.runBigAirs++;
    this.goals.setRunCounter("runBigAirs", this.runBigAirs);

    if (quality === "clean") {
      this.tricks.addBoost(this.body.s, 0.15);
      this.mixer.land("clean");
      this.haptics.land("clean");
      this.impact("landClean");
      this.renderer.riderKick(0.4);
      this.renderer.particles.burst(s.x, s.y, 14, 240, 0xe9b483);
    } else {
      this.tricks.addBoost(this.body.s, 0.06);
      this.mixer.land("rough");
      this.haptics.land("rough");
      this.impact("landRough");
      this.renderer.riderKick(0.6);
      this.renderer.particles.burst(s.x, s.y, 24, 330, 0xd9a06c);
    }
    // Zoom punch: the camera snaps in briefly, selling the touchdown.
    this.zoomPunch = 0.4;

    // Trick rewards pop where they happened, stacked so multi-trick
    // landings don't overlap.
    let floatIdx = 0;
    for (const t of toasts) {
      if (t.points > 0 || t.name === "Combo Lost") {
        this.emitToast(
          t.name,
          t.points > 0 ? `+${t.points}` : undefined,
          t.name === "Combo Lost" ? "bad" : "good",
        );
        this.mixer.trick();
        if (t.points > 0) {
          this.renderer.spawnFloater(
            s.x,
            s.y - 52 - floatIdx * 20,
            `${t.name} +${t.points}`,
          );
          floatIdx++;
        }
      }
    }
  }

  /**
   * One feedback bundle per impact event, scaled by the tier preset — keeps
   * juice proportional game-wide instead of ad-hoc per call site.
   */
  private impact(tier: ImpactTier): void {
    const preset = IMPACT[tier];
    this.renderer.addShake(preset.trauma);
    if (preset.hitStop > 0 && !this.settings.reducedMotion) {
      this.loop.hitStop(preset.hitStop);
    }
  }

  private endRun(reason: RunSummary["endedBy"]): void {
    const s = this.body.s;
    this.endedBy = reason;
    this.riderCrashed = true;
    this.crashTimer = 0;
    // Survived a run with the wall behind you: that's an escape.
    if (this.storm.active && !this.storm.caught && reason !== "quit") {
      this.goals.addCareerCounter("careerStormEscapes", 1);
      this.goals.persist();
    }
    this.goals.persist();
    // Keep most of the momentum and tumble: the crash plays out in
    // updateCrash() and only then does the results menu appear.
    s.vx *= reason === "fall" ? 0.5 : 0.75;
    if (reason !== "fall") s.vy = Math.min(s.vy, 0) - 380;
    s.grounded = false;
    s.charging = false;
    s.charge = 0;
    s.spinVel = (s.vx >= 0 ? 1 : -1) * 9;
    s.grind = null;
    this.state = "crashing";
    this.simScale = 1;
    this.emitState();

    this.mixer.crash();
    this.haptics.crash();
    this.impact("crash");
    this.renderer.riderKick(0.9);
    this.renderer.particles.crash(s.x, s.y, 0xe9b483);

    this.summary = {
      mode: this.mode,
      seed: this.seed,
      score: Math.floor(this.tricks.score),
      distance: Math.floor((this.lastX - this.startX) / params.pxPerMeter),
      duration: this.runTime,
      maxCombo: this.tricks.maxCombo,
      spins: this.tricks.spins,
      cleanLandings: this.tricks.cleanLandings,
      roughLandings: this.tricks.roughLandings,
      tricks: this.tricks.tricks,
      endedBy: reason,
      date: Date.now(),
    };
    this.emitToast(
      reason === "fall"
        ? "Fell into the dune sea"
        : reason === "storm"
          ? "The wall caught you"
          : reason === "obstacle"
            ? "Wiped out"
            : "Crashed",
      undefined,
      "bad",
    );
  }

  /** Tumble physics for the crash animation; then reveal the results. */
  private updateCrash(dt: number): void {
    const s = this.body.s;
    this.crashTimer += dt;
    this.body.beginStep();
    this.cam.px = this.cam.x;
    this.cam.py = this.cam.y;
    this.cam.pZoom = this.cam.zoom;

    const gap = this.terrain.gapAt(s.x);
    s.vy += params.gravity * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.bodyAngle += s.spinVel * dt;

    if (!gap) {
      const gy = this.terrain.heightAt(s.x);
      if (s.y >= gy) {
        s.y = gy;
        const impact = Math.abs(s.vy);
        if (s.vy > 160) {
          s.vy = -s.vy * 0.32;
          s.vx *= 0.8;
          s.spinVel *= 0.7;
          this.renderer.particles.burst(s.x, s.y, 10, 180 + impact * 0.2, 0xd9a06c);
          if (impact > 420) this.renderer.addShake(6);
        } else {
          // sliding to a stop
          s.vy = 0;
          s.vx *= Math.exp(-2.4 * dt);
          s.spinVel *= Math.exp(-4 * dt);
          const slope = Math.atan(this.terrain.slopeAt(s.x));
          // settle lying on the slope, via the nearest full-turn equivalent
          const lie = slope + Math.PI * 0.5;
          const target = lie + Math.round((s.bodyAngle - lie) / TAU) * TAU;
          s.bodyAngle += (target - s.bodyAngle) * Math.min(1, dt * 5);
        }
      }
    }

    this.renderer.weather.update(dt, s.x, this.renderer.w, this.renderer.h, s.vx);
    this.followCamera(dt, Math.max(120, Math.abs(s.vx)), 1);
    this.ensureWorld(false);
    this.mixer.update(dt, {
      speed: 0,
      grounded: false,
      air: false,
      storm: this.renderer.weather.level,
      running: false,
      intensity: 0,
    });

    const stopped = Math.abs(s.vx) < 12 && s.y >= this.terrain.heightAt(s.x) - 1;
    if (this.crashTimer >= CRASH_MAX || (this.crashTimer >= CRASH_MIN && stopped)) {
      this.finishRun();
    }
  }

  private finishRun(): void {
    const s = this.body.s;
    s.vx = 0;
    s.vy = 0;
    s.spinVel = 0;
    this.state = "gameover";
    this.emitState();
    if (this.summary) this.events.emit("runEnd", this.summary);
  }

  private followCamera(dt: number, speed: number, zoom: number): void {
    const s = this.body.s;
    // Exact exponential smoothing — identical feel at 60 Hz and 144 Hz.
    const kx = 1 - Math.exp(-dt * 5);
    const ky = 1 - Math.exp(-dt * 3.6);
    const kz = 1 - Math.exp(-dt * (this.zoomPunch > 0 ? 5 : 1.6));
    this.zoomPunch = Math.max(0, this.zoomPunch - dt);

    // Horizontal look-ahead scales with speed (endless right-runner).
    const look = clamp(speed * 0.32, 90, 360);
    this.cam.x += (s.x + look - this.cam.x) * kx;

    // Vertical framing: mostly the original glide. Only a small lead while
    // rising and a mild drift toward the landing while falling — enough to
    // frame big airs without the camera riding every hop.
    let focusY = s.y - 90;
    if (!s.grounded) {
      focusY += clamp(s.vy * 0.05, -40, 0);
      if (s.vy > 0) {
        const landX = s.x + s.vx * 0.35;
        if (!this.terrain.gapAt(landX)) {
          const landY = this.terrain.heightAt(landX);
          const fall = clamp((s.vy - 120) / 700, 0, 1);
          focusY += (landY - 90 - focusY) * fall * 0.3;
        }
      }
    }

    // Y deadzone: chase only the overflow beyond a slack band, so rolling
    // dunes don't bob the camera.
    const DEAD_Y = 46;
    const dy = focusY - this.cam.y;
    const overflow = Math.abs(dy) - DEAD_Y;
    const chaseY = overflow > 0 ? this.cam.y + Math.sign(dy) * overflow : this.cam.y;
    this.cam.y += (chaseY - this.cam.y) * ky;

    // Ease out while high in the air to keep the rider framed; the punch
    // timer snaps it back in on landing.
    let z = zoom;
    if (!s.grounded && !this.terrain.gapAt(s.x)) {
      const height = this.terrain.heightAt(s.x) - s.y;
      if (height > 160) {
        z = Math.min(z, 0.92 - clamp((height - 160) / 1600, 0, 0.06));
      }
    }
    this.cam.zoom += (z - this.cam.zoom) * kz;
  }

  private ensureWorld(withEntities = true): void {
    const s = this.body.s;
    const viewHalf = this.renderer.w / 2 / this.cam.zoom;
    this.terrain.ensure(s.x - viewHalf - 500, s.x + viewHalf + 900);
    this.terrain.prune(this.cam.x);
    if (!withEntities) return;
    this.obstacles.ensure(s.x - 400, s.x + viewHalf + 800);
    this.obstacles.prune(this.cam.x);
    this.orbs.ensure(s.x - 400, s.x + viewHalf + 800);
    this.orbs.prune(this.cam.x);
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------

  private render(alpha: number, frameDt: number): void {
    if (this.destroyed) return;
    const s = this.body.s;
    const p = this.body.prevView;
    const viewHalf = this.renderer.w / 2 / this.cam.zoom;
    const speed = Math.hypot(s.vx, s.vy);
    this.renderer.draw({
      alpha,
      time: this.time,
      dt: frameDt,
      worldX: this.cam.x,
      palette: paletteAt(this.cam.x),
      terrain: this.terrain,
      obstacles: this.obstacles.inRange(this.cam.x - viewHalf - 100, this.cam.x + viewHalf + 100),
      orbs: this.orbs.inRange(this.cam.x - viewHalf - 100, this.cam.x + viewHalf + 100),
      body: {
        px: p.x,
        py: p.y,
        pAngle: p.bodyAngle,
        x: s.x,
        y: s.y,
        angle: s.bodyAngle,
      },
      rider: {
        grounded: s.grounded,
        charging: s.charging,
        charge: s.charge,
        grabbing: this.tricks.isGrabbing && !s.grounded,
        crashed: this.riderCrashed,
        speed,
      },
      cam: this.cam,
      weather: this.renderer.weather,
      particles: this.renderer.particles,
      rails: this.terrain.railsInRange(this.cam.x - viewHalf - 100, this.cam.x + viewHalf + 100),
      storm: this.storm.active
        ? { x: this.storm.x, proximity: this.storm.proximity(this.cam.x) }
        : null,
      grinding: s.state === "grinding",
      carving:
        (s.grounded || s.state === "grinding") && speed > 320
          ? { angle: Math.atan(this.terrain.slopeAt(s.x)), speed }
          : null,
      highContrast: this.settings.highContrast,
    });
  }

  // ------------------------------------------------------------------
  // Events
  // ------------------------------------------------------------------

  private emitState(): void {
    this.events.emit("state", this.state);
  }

  private emitHud(force: boolean): void {
    this.lastHudAt = this.time;
    if (!force && this.state === "booting") return;
    const s = this.body.s;
    const speed = Math.hypot(s.vx, s.vy);
    const snap = this.goals.snapshot();
    this.events.emit("hud", {
      score: Math.floor(this.tricks.score),
      multiplier: this.tricks.multiplier,
      distance: Math.max(0, Math.floor((this.lastX - this.startX) / params.pxPerMeter)),
      speedKph: Math.round(speed * 0.09),
      boost: s.boost,
      fps: this.fps,
      padConnected: this.input.pads.connected,
      grounded: s.grounded,
      airTime: s.airTime,
      spinDeg: Math.round(Math.abs(s.spinAccum) * (180 / Math.PI)),
      chain: Math.round(this.tricks.chain),
      level: snap.level,
      goals: snap.goals,
      stormMeters: this.storm.active
        ? Math.max(0, Math.round(this.storm.gapPx(s.x) / params.pxPerMeter))
        : null,
    });
  }

  private emitToast(text: string, sub: string | undefined, tone: ToastEvent["tone"]): void {
    this.events.emit("toast", { id: ++this.toastSeq, text, sub, tone });
  }
}

const neutralAI: ActionSnapshot = {
  jumpHeld: false,
  jumpPressed: false,
  jumpReleased: false,
  boostHeld: false,
  downHeld: false,
  pausePressed: false,
  confirmPressed: false,
  backPressed: false,
  navPressed: { up: false, down: false, left: false, right: false },
  spinAxis: 0,
  anyPressed: false,
};
