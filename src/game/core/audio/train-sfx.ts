import { clamp } from "../noise";
import { noiseBuffer } from "./noise-buffer";
import type { AudioState } from "./types";

/**
 * The Jungle Express, every frame: distance gain (0 = out of earshot),
 * stereo bearing, chuff rate. The train keeps steaming while paused or
 * on foot — this only shapes what you hear.
 */
export function setTrainState(a: AudioState, s: { gain: number; pan: number; rate: number } | null): void {
  const ctx = a.ctx;
  if (!a.ready || !ctx) return;
  const t = ctx.currentTime;
  const g = s ? clamp(s.gain, 0, 1) : 0;
  a.chugGain?.gain.setTargetAtTime(0.55 * g * g, t, 0.15);
  a.rumbleGain?.gain.setTargetAtTime(0.3 * g, t, 0.2);
  a.chugLfo?.frequency.setTargetAtTime(clamp(s?.rate ?? 2.8, 0.8, 6), t, 0.25);
  a.trainPan?.pan.setTargetAtTime(clamp(s?.pan ?? 0, -1, 1), t, 0.12);
}

/** Two-tone steam whistle (detuned chord + breath), distance-attenuated. */
export function trainWhistle(a: AudioState, gain: number): void {
  const ctx = a.ctx;
  if (!a.ready || !ctx || a.muted || !a.trainBus) return;
  const t = ctx.currentTime;
  const g0 = clamp(gain, 0.15, 1);
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(0.3 * g0, t + 0.06);
  out.gain.setValueAtTime(0.3 * g0, t + 0.6);
  out.gain.exponentialRampToValueAtTime(0.001, t + 1.15);
  out.connect(a.trainBus);
  for (const f of [466.16, 622.25]) {
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = f * (0.995 + Math.random() * 0.01);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vibG = ctx.createGain();
    vibG.gain.value = 3.5;
    vib.connect(vibG);
    vibG.connect(o.frequency);
    const og = ctx.createGain();
    og.gain.value = f > 500 ? 0.5 : 1;
    o.connect(og);
    og.connect(out);
    o.start(t);
    o.stop(t + 1.2);
    vib.start(t);
    vib.stop(t + 1.2);
  }
  // breathy edge so the chord reads as steam, not an organ
  const nb = noiseBuffer(ctx, 1.3);
  if (nb) {
    const src = ctx.createBufferSource();
    src.buffer = nb;
    const bf = ctx.createBiquadFilter();
    bf.type = "bandpass";
    bf.frequency.value = 900;
    bf.Q.value = 1.4;
    const ng = ctx.createGain();
    ng.gain.value = 0.14 * g0;
    src.connect(bf);
    bf.connect(ng);
    ng.connect(out);
    src.start(t);
    src.stop(t + 1.2);
  }
}
