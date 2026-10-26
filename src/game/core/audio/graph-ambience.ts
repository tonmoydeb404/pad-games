import { noiseBuffer } from "./noise-buffer";
import type { AudioState } from "./types";

/**
 * Jungle ambience: procedural wind + insect shimmer, plus the recorded CC0
 * rainforest bed once it finishes loading (audio-design: own bus).
 */
export function buildAmbience(a: AudioState, ctx: AudioContext, master: GainNode): void {
  a.ambienceBus = ctx.createGain();
  a.ambienceBus.gain.value = 1;
  a.ambienceBus.connect(master);
  const ambGain = ctx.createGain();
  ambGain.gain.value = 0.11;
  ambGain.connect(a.ambienceBus);
  const windBuf = noiseBuffer(ctx, 4);
  if (!windBuf) return;
  const wind = ctx.createBufferSource();
  wind.buffer = windBuf;
  wind.loop = true;
  const wf = ctx.createBiquadFilter();
  wf.type = "lowpass";
  wf.frequency.value = 520;
  const wg = ctx.createGain();
  wg.gain.value = 0.5;
  wind.connect(wf);
  wf.connect(wg);
  wg.connect(ambGain);
  wind.start();

  const ins = ctx.createBufferSource();
  ins.buffer = windBuf;
  ins.loop = true;
  const inf = ctx.createBiquadFilter();
  inf.type = "bandpass";
  inf.frequency.value = 5200;
  inf.Q.value = 14;
  const ing = ctx.createGain();
  ing.gain.value = 0.55;
  ins.connect(inf);
  inf.connect(ing);
  ing.connect(ambGain);
  ins.start();
}
