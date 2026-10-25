/**
 * Racing audio — a small WebAudio synth (no assets): engine drone, tyre
 * skid, wind, boost whoosh, pickup blips and a horn. Created lazily on the
 * engine's start() (a user gesture), updated per frame, destroyed cleanly.
 */
import { clamp } from "./util";

export interface AudioFrame {
  /** |forward speed|, u/s. */
  speed: number;
  maxSpeed: number;
  /** 0..1 throttle */
  throttle: number;
  /** 0..1 drift intensity (lateral slip while grounded). */
  drift: number;
  /** Wheels off the ground. */
  airborne: boolean;
  /** Off the tarmac. */
  offRoad: boolean;
}

export class RacingAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineSub: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private skidGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;

  get started(): boolean {
    return this.ctx !== null;
  }

  /** Must be called from a user gesture (the Start button). */
  start(): void {
    if (this.ctx) return;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(ctx.destination);

    // looped noise source feeds skid + wind
    const len = ctx.sampleRate * 1.5;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // engine: saw + sub square through a lowpass
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.frequency.value = 900;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = "sawtooth";
    this.engineOsc.frequency.value = 60;
    this.engineSub = ctx.createOscillator();
    this.engineSub.type = "square";
    this.engineSub.frequency.value = 30;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.5;
    this.engineOsc.connect(this.engineFilter);
    this.engineSub.connect(subGain).connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
    this.engineSub.start();

    this.skidGain = this.loopNoise("bandpass", 900, 0);
    this.windGain = this.loopNoise("lowpass", 500, 0);
  }

  private loopNoise(type: BiquadFilterType, freq: number, gain: number): GainNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(this.master!);
    src.start();
    return g;
  }

  /** Per-frame mix. Safe to call before start(). */
  update(frame: AudioFrame): void {
    if (!this.ctx || !this.engineOsc || !this.engineGain) return;
    const t = clamp(Math.abs(frame.speed) / frame.maxSpeed, 0, 1);
    // rpm: idle 55 Hz → ~210 Hz at full chat; sub an octave down
    const rev = 0.25 + t * 0.75;
    const rpm = 55 + rev * 155 + frame.throttle * 12;
    this.engineOsc.frequency.setTargetAtTime(rpm, this.ctx.currentTime, 0.06);
    this.engineSub!.frequency.setTargetAtTime(rpm / 2, this.ctx.currentTime, 0.06);
    this.engineFilter!.frequency.setTargetAtTime(500 + t * 2200, this.ctx.currentTime, 0.08);
    this.engineGain.gain.setTargetAtTime(0.1 + frame.throttle * 0.16 + t * 0.1, this.ctx.currentTime, 0.09);

    const skid = frame.airborne ? 0 : frame.drift * (frame.offRoad ? 0.35 : 0.5);
    this.skidGain?.gain.setTargetAtTime(skid, this.ctx.currentTime, 0.05);
    const wind = t * t * (frame.airborne ? 0.3 : 0.16);
    this.windGain?.gain.setTargetAtTime(wind, this.ctx.currentTime, 0.12);
  }

  /** Short pickup / UI blip. */
  blip(freq = 880, dur = 0.12, type: OscillatorType = "triangle"): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(g).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  /** Two-note chime for completed challenges. */
  chime(): void {
    this.blip(660, 0.14);
    window.setTimeout(() => this.blip(990, 0.2), 110);
  }

  /** Boost-pad whoosh: filtered noise sweep. */
  boost(): void {
    if (!this.ctx || !this.noiseBuffer || !this.master) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(300, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(3200, ctx.currentTime + 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    src.connect(filter).connect(g).connect(this.master);
    src.start();
    src.stop(ctx.currentTime + 0.55);
  }

  horn(on: boolean): void {
    if (!this.ctx || !this.master) return;
    if (on && !this.hornOsc) {
      const ctx = this.ctx;
      this.hornOsc = ctx.createOscillator();
      this.hornOsc.type = "square";
      this.hornOsc.frequency.value = 340;
      const o2 = ctx.createOscillator();
      o2.type = "square";
      o2.frequency.value = 425;
      this.hornGain = ctx.createGain();
      this.hornGain.gain.value = 0.08;
      this.hornOsc.connect(this.hornGain);
      o2.connect(this.hornGain);
      this.hornGain.connect(this.master);
      this.hornOsc.start();
      o2.start();
      this.hornOsc2 = o2;
    } else if (!on && this.hornOsc) {
      this.hornOsc.stop();
      this.hornOsc2?.stop();
      this.hornOsc = null;
      this.hornOsc2 = null;
      this.hornGain = null;
    }
  }
  private hornOsc: OscillatorNode | null = null;
  private hornOsc2: OscillatorNode | null = null;
  private hornGain: GainNode | null = null;

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.03);
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  dispose(): void {
    try {
      this.horn(false);
      this.engineOsc?.stop();
      this.engineSub?.stop();
      void this.ctx?.close();
    } catch {
      // already gone
    }
    this.ctx = null;
    this.master = null;
  }
}
