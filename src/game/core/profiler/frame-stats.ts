/** Rolling frame-time statistics. Pure — no DOM, no Three.js. */
export interface FrameSummary {
  frames: number;
  fps: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  /** frames slower than SPIKE_MS in the window */
  spikes: number;
  avgCpuMs: number;
}

export const SPIKE_MS = 33.4;

const percentile = (sorted: number[], p: number): number =>
  sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

export class FrameStats {
  private readonly wall: number[] = [];
  private readonly cpu: number[] = [];

  constructor(private readonly size = 600) {}

  /** @param wallMs time since the previous frame @param cpuMs JS time spent in this frame */
  push(wallMs: number, cpuMs: number): void {
    this.wall.push(wallMs);
    this.cpu.push(cpuMs);
    if (this.wall.length > this.size) {
      this.wall.shift();
      this.cpu.shift();
    }
  }

  reset(): void {
    this.wall.length = 0;
    this.cpu.length = 0;
  }

  summary(): FrameSummary {
    const n = this.wall.length;
    if (n === 0) return { frames: 0, fps: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, spikes: 0, avgCpuMs: 0 };
    const sorted = [...this.wall].sort((a, b) => a - b);
    const avg = this.wall.reduce((s, v) => s + v, 0) / n;
    return {
      frames: n,
      fps: 1000 / avg,
      avgMs: avg,
      p50Ms: percentile(sorted, 0.5),
      p95Ms: percentile(sorted, 0.95),
      p99Ms: percentile(sorted, 0.99),
      maxMs: sorted[n - 1],
      spikes: sorted.filter((v) => v > SPIKE_MS).length,
      avgCpuMs: this.cpu.reduce((s, v) => s + v, 0) / n,
    };
  }
}
