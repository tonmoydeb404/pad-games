import { clamp } from "../noise";
import { sfxOut, canPlay } from "./duck";
import { noiseBuffer } from "./noise-buffer";
import type { AudioState } from "./types";

export function scheduleBird(a: AudioState): void {
  if (!a.ready) return;
  window.setTimeout(() => {
    if (a.ready && !a.muted && a.ctx?.state === "running") bird(a);
    scheduleBird(a);
  }, 3500 + Math.random() * 9000);
}

function bird(a: AudioState): void {
  const ctx = a.ctx;
  if (!ctx || !a.master) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = "sine";
  const g = ctx.createGain();
  g.gain.value = 0;
  const f = 1100 + Math.random() * 1400;
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * (1.3 + Math.random() * 0.5), t + 0.09);
  o.frequency.exponentialRampToValueAtTime(f * 0.85, t + 0.22);
  g.gain.linearRampToValueAtTime(0.05, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0008, t + 0.3);
  o.connect(g);
  g.connect(sfxOut(a)!);
  o.start(t);
  o.stop(t + 0.34);
}

export function splash(a: AudioState): void {
  const ctx = a.ctx;
  if (!canPlay(a) || !ctx) return;
  const now = performance.now();
  if (now - a.lastSplash < 260) return;
  a.lastSplash = now;
  const t = ctx.currentTime;
  const nb = noiseBuffer(ctx, 0.4);
  if (!nb) return;
  const src = ctx.createBufferSource();
  src.buffer = nb;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.setValueAtTime(1600, t);
  f.frequency.exponentialRampToValueAtTime(500, t + 0.3);
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.linearRampToValueAtTime(0.22, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
  src.connect(f);
  f.connect(g);
  g.connect(sfxOut(a)!);
  src.start(t);
  src.stop(t + 0.4);
}

/** One footfall on `surface`; `k` is loudness 0..1.3 (crouch < jog < sprint). */
export function step(a: AudioState, surface: string, k: number): void {
  const ctx = a.ctx;
  if (!canPlay(a) || !ctx) return;
  if (surface === "water") {
    splash(a);
    return;
  }
  const now = performance.now();
  if (now - a.lastStep < 90) return;
  a.lastStep = now;
  const nb = noiseBuffer(ctx, 0.2);
  if (!nb) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = nb;
  src.playbackRate.value = 0.9 + Math.random() * 0.25;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = surface === "rock" ? 1900 : surface === "mud" ? 420 : 780;
  f.Q.value = 0.9;
  const g = ctx.createGain();
  const vol = clamp(k, 0.1, 1.4) * (surface === "rock" ? 0.2 : 0.14);
  g.gain.value = 0;
  g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  src.connect(f);
  f.connect(g);
  g.connect(sfxOut(a)!);
  src.start(t);
  src.stop(t + 0.14);
}
