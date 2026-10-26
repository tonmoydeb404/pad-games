import { noiseBuffer } from "./noise-buffer";
import { sfxOut } from "./duck";
import type { AudioState } from "./types";

/** One synthesized vocal element (see {@link voice}). */
export interface VoiceOpts {
  type?: OscillatorType;
  /** [seconds, Hz] pitch contour */
  f: [number, number][];
  /** [seconds, gain] amplitude contour */
  g: [number, number][];
  vib?: [number, number];
  lp?: number;
  bp?: [number, number];
  noise?: number;
  pitch: number;
  vol: number;
}

/**
 * One synthesized vocal element: a pitch contour through an oscillator
 * (optionally buzzed by a vibrato and shaped by a band/low-pass filter) plus
 * an optional band of noise for breath and rasp.
 */
export function voice(a: AudioState, t0: number, o: VoiceOpts): void {
  const ctx = a.ctx;
  if (!ctx) return;
  const out = sfxOut(a);
  if (!out) return;
  const end = Math.max(o.f[o.f.length - 1][0], o.g[o.g.length - 1][0]) + 0.05;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, t0);
  for (const [t, v] of o.g) amp.gain.linearRampToValueAtTime(Math.max(0.0001, v * o.vol), t0 + t);
  amp.gain.linearRampToValueAtTime(0, t0 + end);
  let tail: AudioNode = amp;
  if (o.lp) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = o.lp * Math.min(1.4, o.pitch + 0.3);
    amp.connect(lp);
    tail = lp;
  }
  tail.connect(out);

  const osc = ctx.createOscillator();
  osc.type = o.type ?? "sawtooth";
  osc.frequency.setValueAtTime(o.f[0][1] * o.pitch, t0 + o.f[0][0]);
  for (const [t, hz] of o.f) osc.frequency.linearRampToValueAtTime(hz * o.pitch, t0 + t);
  let src: AudioNode = osc;
  if (o.bp) {
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = o.bp[0] * o.pitch;
    bp.Q.value = o.bp[1];
    osc.connect(bp);
    src = bp;
  }
  src.connect(amp);
  if (o.vib) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = o.vib[0];
    const depth = ctx.createGain();
    depth.gain.value = o.vib[1] * o.pitch;
    lfo.connect(depth);
    depth.connect(osc.frequency);
    lfo.start(t0);
    lfo.stop(t0 + end);
  }
  osc.start(t0);
  osc.stop(t0 + end);

  if (o.noise) {
    const nb = noiseBuffer(ctx, Math.min(2, end));
    if (nb) {
      const ns = ctx.createBufferSource();
      ns.buffer = nb;
      const nf = ctx.createBiquadFilter();
      nf.type = "bandpass";
      nf.frequency.value = (o.bp?.[0] ?? 1200) * o.pitch;
      nf.Q.value = 0.8;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0, t0);
      for (const [t, v] of o.g) ng.gain.linearRampToValueAtTime(Math.max(0.0001, v * o.noise * o.vol), t0 + t);
      ng.gain.linearRampToValueAtTime(0, t0 + end);
      ns.connect(nf);
      nf.connect(ng);
      ng.connect(out);
      ns.start(t0);
      ns.stop(t0 + end);
    }
  }
}
