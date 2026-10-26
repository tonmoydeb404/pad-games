/** Dev-only profiler overlay (F3 toggles, F4 copies a JSON report). */
import type * as THREE from "three";
import { FrameStats } from "./frame-stats";

interface Extras {
  /** extra scene counters, e.g. { animals: 120 } */
  counts: () => Record<string, number>;
}

export interface ProfileReport {
  time: string;
  userAgent: string;
  screen: string;
  frame: ReturnType<FrameStats["summary"]>;
  render: { drawCalls: number; triangles: number; geometries: number; textures: number };
  heapMB: number | null;
  counts: Record<string, number>;
}

export class Profiler {
  private readonly stats = new FrameStats();
  private readonly el: HTMLPreElement;
  private lastPaint = 0;
  private frameStart = 0;
  private render = { drawCalls: 0, triangles: 0, geometries: 0, textures: 0 };

  constructor(
    host: HTMLElement,
    private readonly renderer: THREE.WebGLRenderer,
    private readonly extras: Extras,
  ) {
    // composer passes render several times a frame — accumulate per frame ourselves
    renderer.info.autoReset = false;
    this.el = document.createElement("pre");
    Object.assign(this.el.style, {
      position: "fixed", left: "8px", top: "8px", zIndex: "50", margin: "0", padding: "6px 8px",
      font: "11px/1.35 ui-monospace, monospace", color: "#9fe8a4", background: "rgba(0,0,0,.65)",
      pointerEvents: "none", borderRadius: "4px", whiteSpace: "pre",
    } satisfies Partial<CSSStyleDeclaration>);
    host.appendChild(this.el);
  }

  /** Call at the top of a live (unpaused) frame with the raw, unclamped dt. */
  begin(rawMs: number): void {
    this.pendingWall = rawMs;
    this.frameStart = performance.now();
    this.renderer.info.reset();
  }
  private pendingWall = 0;

  /** Call after the frame has been rendered. */
  end(): void {
    const now = performance.now();
    this.stats.push(this.pendingWall, now - this.frameStart);
    const i = this.renderer.info;
    this.render = { drawCalls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures };
    if (now - this.lastPaint > 250) {
      this.lastPaint = now;
      this.paint();
    }
  }

  setVisible(v: boolean): void {
    this.el.style.display = v ? "block" : "none";
  }

  clear(): void {
    this.stats.reset();
  }

  report(): ProfileReport {
    const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return {
      time: new Date().toISOString(),
      userAgent: navigator.userAgent,
      screen: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`,
      frame: this.stats.summary(),
      render: this.render,
      heapMB: heap ? Math.round(heap.usedJSHeapSize / 1048576) : null,
      counts: this.extras.counts(),
    };
  }

  private paint(): void {
    const r = this.report();
    const f = r.frame;
    this.el.textContent = [
      `${f.fps.toFixed(0)} fps  avg ${f.avgMs.toFixed(1)}ms  cpu ${f.avgCpuMs.toFixed(1)}ms`,
      `p50 ${f.p50Ms.toFixed(1)}  p95 ${f.p95Ms.toFixed(1)}  p99 ${f.p99Ms.toFixed(1)}  max ${f.maxMs.toFixed(0)}ms  spikes ${f.spikes}`,
      `draws ${r.render.drawCalls}  tris ${(r.render.triangles / 1000).toFixed(0)}k  geo ${r.render.geometries}  tex ${r.render.textures}`,
      `heap ${r.heapMB ?? "n/a"}MB  ${Object.entries(r.counts).map(([k, v]) => `${k} ${v}`).join("  ")}`,
      `F3 hide · F4 copy report · Shift+F3 reset`,
    ].join("\n");
  }

  destroy(): void {
    this.renderer.info.autoReset = true;
    this.el.remove();
  }
}
