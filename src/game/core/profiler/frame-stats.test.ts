import { describe, expect, it } from "vitest";
import { FrameStats } from "./frame-stats";

describe("FrameStats", () => {
  it("is all zeros when empty", () => {
    expect(new FrameStats().summary().frames).toBe(0);
  });

  it("computes fps, percentiles and spikes", () => {
    const s = new FrameStats();
    for (let i = 0; i < 99; i++) s.push(16, 4);
    s.push(100, 40);
    const r = s.summary();
    expect(r.frames).toBe(100);
    expect(r.p50Ms).toBe(16);
    expect(r.maxMs).toBe(100);
    expect(r.spikes).toBe(1);
    expect(r.fps).toBeCloseTo(1000 / 16.84, 1);
    expect(r.avgCpuMs).toBeCloseTo(4.36, 2);
  });

  it("keeps only the newest `size` frames", () => {
    const s = new FrameStats(10);
    for (let i = 0; i < 10; i++) s.push(100, 1);
    for (let i = 0; i < 10; i++) s.push(10, 1);
    expect(s.summary().maxMs).toBe(10);
  });

  it("reset clears the window", () => {
    const s = new FrameStats();
    s.push(16, 1);
    s.reset();
    expect(s.summary().frames).toBe(0);
  });
});
