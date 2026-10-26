import { noiseBuffer } from "./noise-buffer";
import type { AudioState } from "./types";

/** Engine (two detuned oscillators + lowpass + sub), tire noise, skid screech. */
export function buildEngine(a: AudioState, ctx: AudioContext, engineBus: GainNode): void {
  // engine: two detuned oscillators through a lowpass + sub sine
  a.engGain = ctx.createGain();
  a.engGain.gain.value = 0;
  a.engFilter = ctx.createBiquadFilter();
  a.engFilter.type = "lowpass";
  a.engFilter.frequency.value = 620;
  a.engFilter.Q.value = 3.2;
  a.engOsc1 = ctx.createOscillator();
  a.engOsc1.type = "sawtooth";
  a.engOsc1.frequency.value = 48;
  a.engOsc2 = ctx.createOscillator();
  a.engOsc2.type = "square";
  a.engOsc2.frequency.value = 48 * 1.006;
  const g2 = ctx.createGain();
  g2.gain.value = 0.35;
  a.engOsc1.connect(a.engFilter);
  a.engOsc2.connect(g2);
  g2.connect(a.engFilter);
  a.engFilter.connect(a.engGain);
  a.engGain.connect(engineBus);
  a.engOsc1.start();
  a.engOsc2.start();

  a.subGain = ctx.createGain();
  a.subGain.gain.value = 0;
  a.subOsc = ctx.createOscillator();
  a.subOsc.type = "sine";
  a.subOsc.frequency.value = 42;
  a.subOsc.connect(a.subGain);
  a.subGain.connect(engineBus);
  a.subOsc.start();

  // tire / terrain noise
  const nb = noiseBuffer(ctx, 3);
  if (!nb) return;
  const tire = ctx.createBufferSource();
  tire.buffer = nb;
  tire.loop = true;
  a.tireFilter = ctx.createBiquadFilter();
  a.tireFilter.type = "bandpass";
  a.tireFilter.frequency.value = 420;
  a.tireFilter.Q.value = 0.8;
  a.tireGain = ctx.createGain();
  a.tireGain.gain.value = 0;
  tire.connect(a.tireFilter);
  a.tireFilter.connect(a.tireGain);
  a.tireGain.connect(engineBus);
  tire.start();

  // skid screech channel
  const skid = ctx.createBufferSource();
  skid.buffer = nb;
  skid.loop = true;
  const skidFilter = ctx.createBiquadFilter();
  skidFilter.type = "bandpass";
  skidFilter.frequency.value = 2100;
  skidFilter.Q.value = 4.0;
  a.skidGain = ctx.createGain();
  a.skidGain.gain.value = 0;
  skid.connect(skidFilter);
  skidFilter.connect(a.skidGain);
  a.skidGain.connect(engineBus);
  skid.start();
}
