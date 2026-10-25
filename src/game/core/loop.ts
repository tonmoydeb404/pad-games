/**
 * Fixed 60 Hz timestep loop with render interpolation, independent of any
 * rendering library. Physics feel is identical on 60 Hz and 144 Hz screens.
 */

export interface LoopHandlers {
  update: (dt: number) => void;
  render: (alpha: number, frameDt: number) => void;
  onFps?: (fps: number) => void;
}

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const MAX_STEPS = 6;

export class Loop {
  private raf = 0;
  private running = false;
  private last = 0;
  private acc = 0;
  private frames = 0;
  private fpsClock = 0;
  /** 0..1 simulation speed while a hit-stop freeze is active. */
  private timeScale = 1;
  /** Real-time (performance.now) deadline that ends the freeze. */
  private freezeUntil = 0;

  constructor(private h: LoopHandlers) {}

  /**
   * Hit-stop: briefly run the simulation at `scale` speed to sell an impact.
   * `seconds` is REAL time — unaffected by the scale — so the freeze always
   * resumes. Overlapping calls are safe: the newest deadline simply wins.
   */
  hitStop(seconds: number, scale = 0.12): void {
    this.freezeUntil = performance.now() + seconds * 1000;
    this.timeScale = scale;
  }

  /** Cancel any active hit-stop (new run, state change, …). */
  clearHitStop(): void {
    this.freezeUntil = 0;
    this.timeScale = 1;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    const tick = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);

      let frameDt = (now - this.last) / 1000;
      this.last = now;
      if (frameDt > MAX_FRAME) frameDt = MAX_FRAME;

      // The freeze deadline is real time, so it expires even while scaled.
      if (this.timeScale < 1 && now >= this.freezeUntil) this.timeScale = 1;

      this.acc += frameDt;
      let steps = 0;
      while (this.acc >= STEP && steps < MAX_STEPS) {
        this.h.update(STEP * this.timeScale);
        this.acc -= STEP;
        steps++;
      }
      // If we are consistently too slow, drop the backlog instead of spiraling.
      if (steps === MAX_STEPS && this.acc > STEP) this.acc = 0;

      this.h.render(this.acc / STEP, frameDt);

      this.frames++;
      this.fpsClock += frameDt;
      if (this.fpsClock >= 0.5) {
        this.h.onFps?.(Math.round(this.frames / this.fpsClock));
        this.frames = 0;
        this.fpsClock = 0;
      }
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  get isRunning(): boolean {
    return this.running;
  }
}
