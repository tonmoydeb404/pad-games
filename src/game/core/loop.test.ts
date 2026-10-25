import { beforeEach, describe, expect, it, vi } from "vitest";
import { Loop } from "./loop";

/**
 * Loop runs on requestAnimationFrame + performance.now; stub both with a
 * manual clock so hit-stop timing is deterministic.
 */
function setup() {
  let rafCb: ((t: number) => void) | null = null;
  let now = 0;
  vi.stubGlobal("performance", { now: () => now });
  vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => {
    rafCb = cb;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const loop = new Loop({ update: vi.fn(), render: vi.fn() });
  const update = (loop as unknown as { h: { update: ReturnType<typeof vi.fn> } }).h.update;
  return {
    loop,
    update,
    frame(ms: number) {
      now += ms;
      rafCb?.(now);
    },
    cleanup() {
      loop.stop();
      vi.unstubAllGlobals();
    },
  };
}

const STEP = 1 / 60;

describe("Loop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs unscaled at the fixed step", () => {
    const { loop, update, frame, cleanup } = setup();
    loop.start();
    for (let i = 0; i < 30; i++) frame(1000 / 60);
    const dts = update.mock.calls.map((c) => c[0] as number);
    expect(dts.length).toBeGreaterThanOrEqual(29);
    for (const dt of dts) expect(dt).toBeCloseTo(STEP, 6);
    cleanup();
  });

  it("hit-stop scales sim time and restores after real-time deadline", () => {
    const { loop, update, frame, cleanup } = setup();
    loop.start();
    loop.hitStop(0.1, 0.1); // 100 ms real-time freeze at 10% speed
    for (let i = 0; i < 30; i++) frame(1000 / 60);
    const dts = update.mock.calls.map((c) => c[0] as number);
    const scaled = dts.filter((dt) => dt < STEP);
    const normal = dts.filter((dt) => Math.abs(dt - STEP) < 1e-9);
    // ~6 steps of freeze (0.1 s), the rest back at full speed.
    expect(scaled.length).toBeGreaterThanOrEqual(5);
    expect(scaled.length).toBeLessThanOrEqual(7);
    expect(normal.length).toBeGreaterThanOrEqual(20);
    for (const dt of scaled) expect(dt).toBeCloseTo(STEP * 0.1, 6);
    cleanup();
  });

  it("clearHitStop cancels an active freeze immediately", () => {
    const { loop, update, frame, cleanup } = setup();
    loop.start();
    loop.hitStop(1, 0.1);
    loop.clearHitStop();
    for (let i = 0; i < 10; i++) frame(1000 / 60);
    for (const call of update.mock.calls) {
      expect(call[0]).toBeCloseTo(STEP, 6);
    }
    cleanup();
  });

  it("the newest hit-stop deadline wins on overlap", () => {
    const { loop, update, frame, cleanup } = setup();
    loop.start();
    loop.hitStop(0.5, 0.1);
    frame(1000 / 60); // one scaled step
    loop.hitStop(0.02, 0.1); // shorter, newer — must own the restore
    for (let i = 0; i < 30; i++) frame(1000 / 60);
    const dts = update.mock.calls.map((c) => c[0] as number);
    const normal = dts.filter((dt) => Math.abs(dt - STEP) < 1e-9);
    // Restores after the short second freeze, not after the long first one.
    expect(normal.length).toBeGreaterThan(20);
    cleanup();
  });
});
