import { clamp } from "../noise";
import { canPlay, duck, sfxOut } from "./duck";
import { noiseBuffer } from "./noise-buffer";
import { playImpact } from "./samples";
import type { AudioState } from "./types";

export function thump(a: AudioState, strength: number): void {
  const ctx = a.ctx;
  if (!canPlay(a) || !ctx) return;
  const now = performance.now();
  if (now - a.lastThump < 130) return;
  a.lastThump = now;
  const t = ctx.currentTime;
  // real recorded impact on top; procedural sub-layer underneath for weight
  playImpact(a, strength > 0.6 ? "heavy" : "light", Math.min(0.85, 0.25 + strength * 0.55));
  const o = ctx.createOscillator();
  o.type = "sine";
  // SFX variation: small random pitch so repeated bumps don't sound robotic.
  o.frequency.setValueAtTime(110 + Math.random() * 50, t);
  o.frequency.exponentialRampToValueAtTime(36, t + 0.18);
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.linearRampToValueAtTime(Math.min(0.42, strength * 0.5), t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  o.connect(g);
  g.connect(sfxOut(a)!);
  o.start(t);
  o.stop(t + 0.3);
  if (strength > 0.45) duck(a, 0.5, 0.3);
}

/** Suspension/landing thud — deeper than a bump, scales with airtime. */
export function thud(a: AudioState, severity: number): void {
  const ctx = a.ctx;
  if (!canPlay(a) || !ctx) return;
  const now = performance.now();
  if (now - a.lastThud < 150) return;
  a.lastThud = now;
  const s = clamp(severity, 0.15, 1.5);
  const t = ctx.currentTime;
  const out = sfxOut(a)!;
  // real impact sample first (wood crunch for landings), then the sub layer
  playImpact(a, "wood", clamp(0.2 + s * 0.45, 0.1, 1) * 0.7);
  const nb = noiseBuffer(ctx, 0.25);
  if (nb) {
    const src = ctx.createBufferSource();
    src.buffer = nb;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(900 * s + 200, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 0.18);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(Math.min(0.5, 0.18 + s * 0.3), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(t);
    src.stop(t + 0.25);
  }
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(95 * s + 40, t);
  o.frequency.exponentialRampToValueAtTime(34, t + 0.16);
  const og = ctx.createGain();
  og.gain.value = 0;
  og.gain.linearRampToValueAtTime(Math.min(0.4, 0.12 + s * 0.28), t + 0.01);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  o.connect(og);
  og.connect(out);
  o.start(t);
  o.stop(t + 0.22);
  duck(a, 0.55, 0.35);
}

/** Countdown blip; the final "GO" is a brighter, longer tone. */
export function beep(a: AudioState, final = false): void {
  const ctx = a.ctx;
  if (!canPlay(a) || !ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = "square";
  o.frequency.value = final ? 784 : 392;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(final ? 0.2 : 0.12, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + (final ? 0.4 : 0.12));
  o.connect(g);
  g.connect(sfxOut(a)!);
  o.start(t);
  o.stop(t + (final ? 0.42 : 0.14));
}

export function horn(a: AudioState): void {
  const ctx = a.ctx;
  if (!canPlay(a) || !ctx) return;
  const now = performance.now();
  if (now - a.lastHorn < 380) return;
  a.lastHorn = now;
  const t = ctx.currentTime;
  // SFX variation: slight random detune every honk.
  const detune = 0.97 + Math.random() * 0.06;
  const o1 = ctx.createOscillator();
  o1.type = "sawtooth";
  o1.frequency.value = 370 * detune;
  const o2 = ctx.createOscillator();
  o2.type = "sawtooth";
  o2.frequency.value = 465 * detune;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.22, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  o1.connect(g);
  o2.connect(g);
  g.connect(sfxOut(a)!);
  o1.start(t);
  o2.start(t);
  o1.stop(t + 0.36);
  o2.stop(t + 0.36);
  duck(a, 0.55, 0.35);
}
