import { noiseBuffer } from "./noise-buffer";
import type { AudioState } from "./types";

/**
 * The Jungle Express (own sub-bus off sfx, one shared panner).
 * chuff: looping noise through a bandpass, gated by a slewed square LFO at the
 * chuff rate; rumble: the same noise lowpassed way down.
 */
export function buildTrain(a: AudioState, ctx: AudioContext, sfxBus: GainNode): void {
  a.trainBus = ctx.createGain();
  a.trainBus.gain.value = 1;
  a.trainBus.connect(sfxBus);
  if (typeof ctx.createStereoPanner === "function") {
    a.trainPan = ctx.createStereoPanner();
    a.trainPan.connect(a.trainBus);
  }
  const trainOut = a.trainPan ?? a.trainBus;
  const chugBuf = noiseBuffer(ctx, 3);
  if (!chugBuf) return;
  const chug = ctx.createBufferSource();
  chug.buffer = chugBuf;
  chug.loop = true;
  const chugFilter = ctx.createBiquadFilter();
  chugFilter.type = "bandpass";
  chugFilter.frequency.value = 760;
  chugFilter.Q.value = 0.9;
  a.chugPulse = ctx.createGain();
  a.chugPulse.gain.value = 0.5; // the LFO swings this 0..1
  a.chugGain = ctx.createGain();
  a.chugGain.gain.value = 0;
  chug.connect(chugFilter);
  chugFilter.connect(a.chugPulse);
  a.chugPulse.connect(a.chugGain);
  a.chugGain.connect(trainOut);
  chug.start();

  a.chugLfo = ctx.createOscillator();
  a.chugLfo.type = "square";
  a.chugLfo.frequency.value = 2.8;
  // soften the square's edges into chuff envelopes
  const lfoSlew = ctx.createBiquadFilter();
  lfoSlew.type = "lowpass";
  lfoSlew.frequency.value = 26;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.5;
  a.chugLfo.connect(lfoSlew);
  lfoSlew.connect(lfoDepth);
  lfoDepth.connect(a.chugPulse.gain);
  a.chugLfo.start();

  const rumble = ctx.createBufferSource();
  rumble.buffer = chugBuf;
  rumble.loop = true;
  const rumbleFilter = ctx.createBiquadFilter();
  rumbleFilter.type = "lowpass";
  rumbleFilter.frequency.value = 130;
  a.rumbleGain = ctx.createGain();
  a.rumbleGain.gain.value = 0;
  rumble.connect(rumbleFilter);
  rumbleFilter.connect(a.rumbleGain);
  a.rumbleGain.connect(trainOut);
  rumble.start();
}
