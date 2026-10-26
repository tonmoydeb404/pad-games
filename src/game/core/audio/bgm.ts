import { noiseBuffer } from "./noise-buffer";
import type { AudioState } from "./types";

// --- procedural upbeat jungle adventure background music ---
const BASS_NOTES = [41.2, 41.2, 49.0, 41.2, 55.0, 41.2, 49.0, 61.73];
const MELODY_NOTES = [164.81, 196.0, 220.0, 246.94, 293.66, 329.63, 392.0];

function kick(ctx: AudioContext, bgm: GainNode, t: number): void {
  const kOsc = ctx.createOscillator();
  kOsc.type = "sine";
  const kGain = ctx.createGain();
  kOsc.frequency.setValueAtTime(110, t);
  kOsc.frequency.exponentialRampToValueAtTime(32, t + 0.08);
  kGain.gain.setValueAtTime(0.38, t);
  kGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  kOsc.connect(kGain);
  kGain.connect(bgm);
  kOsc.start(t);
  kOsc.stop(t + 0.14);
}

function snare(ctx: AudioContext, bgm: GainNode, t: number): void {
  const nb = noiseBuffer(ctx, 0.2);
  if (!nb) return;
  const sn = ctx.createBufferSource();
  sn.buffer = nb;
  const f = ctx.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = 1000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.22, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  sn.connect(f);
  f.connect(g);
  g.connect(bgm);
  sn.start(t);
  sn.stop(t + 0.15);
}

function hat(ctx: AudioContext, bgm: GainNode, t: number, s: number, intensity: number): void {
  const nb = noiseBuffer(ctx, 0.05);
  if (!nb) return;
  const hh = ctx.createBufferSource();
  hh.buffer = nb;
  const f = ctx.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = 7500;
  const g = ctx.createGain();
  const vol = (s === 2 || s === 10 ? 0.14 : 0.07) * (0.45 + intensity * 0.75);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  hh.connect(f);
  f.connect(g);
  g.connect(bgm);
  hh.start(t);
  hh.stop(t + 0.05);
}

function bass(ctx: AudioContext, bgm: GainNode, t: number, s: number): void {
  const bOsc = ctx.createOscillator();
  bOsc.type = "sawtooth";
  bOsc.frequency.value = BASS_NOTES[Math.floor(s / 2)];
  const filt = ctx.createBiquadFilter();
  filt.type = "lowpass";
  filt.Q.value = 3.5;
  filt.frequency.setValueAtTime(140, t);
  filt.frequency.exponentialRampToValueAtTime(750, t + 0.04);
  filt.frequency.exponentialRampToValueAtTime(140, t + 0.12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.18, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
  bOsc.connect(filt);
  filt.connect(g);
  g.connect(bgm);
  bOsc.start(t);
  bOsc.stop(t + 0.14);
}

/** Melody layer — fades in with driving intensity (vertical layering). */
function melody(ctx: AudioContext, bgm: GainNode, t: number, s: number, bar: number, intensity: number): void {
  const mIdx = (s + bar * 2) % MELODY_NOTES.length;
  const mOsc = ctx.createOscillator();
  mOsc.type = "triangle";
  mOsc.frequency.value = MELODY_NOTES[mIdx];
  const g = ctx.createGain();
  const vol = 0.12 * Math.min(1, (intensity - 0.28) * 2.4);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  mOsc.connect(g);
  g.connect(bgm);
  mOsc.start(t);
  mOsc.stop(t + 0.2);
  // sparkle: octave-up pling at high intensity
  if (intensity > 0.75 && s === 11) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = MELODY_NOTES[mIdx] * 2;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.05, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(og);
    og.connect(bgm);
    o.start(t);
    o.stop(t + 0.14);
  }
}

export function playBgmStep(a: AudioState): void {
  const ctx = a.ctx;
  const bgm = a.bgmGain;
  if (!a.ready || !ctx || !bgm || a.muted || ctx.state !== "running") return;
  const t = ctx.currentTime;
  const s = a.currentStep % 16;
  const bar = Math.floor(a.currentStep / 16) % 4;
  if (s === 0 || s === 6 || s === 10 || s === 14) kick(ctx, bgm, t);
  if (s === 4 || s === 12) snare(ctx, bgm, t);
  if (s % 2 === 1) hat(ctx, bgm, t, s, a.intensity);
  if (s % 2 === 0) bass(ctx, bgm, t, s);
  if ([0, 3, 6, 8, 11, 14].includes(s) && a.intensity > 0.28) melody(ctx, bgm, t, s, bar, a.intensity);
  a.currentStep++;
}

export function startBgm(a: AudioState): void {
  if (a.stepTimer) clearInterval(a.stepTimer);
  a.currentStep = 0;
  // 123 BPM, 16th-note timing
  a.stepTimer = setInterval(() => playBgmStep(a), 122);
}
