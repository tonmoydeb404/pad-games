/**
 * Procedural Web Audio for Jungle Jeep — zero assets. Engine (two detuned
 * oscillators + sub), terrain tire noise, skid screech, jungle ambience with
 * insect shimmer, an upbeat 123 BPM safari BGM sequencer, plus one-shots
 * (horn, impact thump, water splash, birds). All optional: failures are
 * swallowed and the game stays silent.
 */

import type { AnimalCall } from "./animals";
import { clamp } from "./noise";

/** Kenney impact-sounds banks shipped under CC0 (rides in /assets/jeep/audio). */
const IMPACT_FILES = {
  light: ["impactGeneric_light_000", "impactGeneric_light_001", "impactGeneric_light_002", "impactGeneric_light_003", "impactGeneric_light_004"],
  wood: ["impactWood_medium_000", "impactWood_medium_001", "impactWood_medium_002", "impactWood_medium_003", "impactWood_medium_004"],
  heavy: ["impactPlate_heavy_000", "impactPlate_heavy_001", "impactPlate_heavy_002", "impactPlate_heavy_003", "impactPlate_heavy_004", "impactSoft_heavy_000", "impactSoft_heavy_001", "impactSoft_heavy_002", "impactSoft_heavy_003", "impactSoft_heavy_004"],
};

export interface VehicleAudioState {
  rpm: number;
  throttle: number;
  brake: number;
  speed: number;
  maxSpeed: number;
  surface: string;
  handbrake: boolean;
  lateral: number;
  bumpImpulse: number;
}

const MAX_SPEED_FALLBACK = 46.8;

export class JeepAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  /** Dedicated duck stage between the music bus and master (audio-design:
   * ducking must never overwrite the music bus level itself). */
  private musicDuck: GainNode | null = null;
  private engineBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  /** Adaptive-music intensity 0..1 (drives melody/hat layers). */
  private intensity = 0;
  private engOsc1: OscillatorNode | null = null;
  private engOsc2: OscillatorNode | null = null;
  private engGain: GainNode | null = null;
  private engFilter: BiquadFilterNode | null = null;
  private subOsc: OscillatorNode | null = null;
  private subGain: GainNode | null = null;
  private tireFilter: BiquadFilterNode | null = null;
  private tireGain: GainNode | null = null;
  private skidGain: GainNode | null = null;
  private muted = false;
  private ready = false;
  private ambienceBus: GainNode | null = null;
  private ambienceSrc: AudioBufferSourceNode | null = null;
  /** The Jungle Express: chuff pulse + low rumble through one panner. */
  private trainBus: GainNode | null = null;
  private trainPan: StereoPannerNode | null = null;
  private chugPulse: GainNode | null = null;
  private chugGain: GainNode | null = null;
  private chugLfo: OscillatorNode | null = null;
  private rumbleGain: GainNode | null = null;
  /** Real CC0 impact samples (Kenney), grouped by weight. */
  private impacts: {
    light: AudioBuffer[];
    wood: AudioBuffer[];
    heavy: AudioBuffer[];
  } = { light: [], wood: [], heavy: [] };
  private lastSplash = 0;
  private lastThump = 0;
  private lastHorn = 0;
  private lastDuck = 0;
  private lastThud = 0;
  private stepTimer: ReturnType<typeof setInterval> | null = null;
  private currentStep = 0;

  /** True while the player is walking: the parked jeep's engine falls silent. */
  private footMode = false;
  private lastStep = 0;

  setFootMode(on: boolean): void {
    this.footMode = on;
  }

  /** One footfall on `surface`; `k` is loudness 0..1.3 (crouch < jog < sprint). */
  step(surface: string, k: number): void {
    const ctx = this.ctx;
    if (!this.ready || !ctx || !this.master || this.muted) return;
    if (surface === "water") {
      this.splash();
      return;
    }
    const now = performance.now();
    if (now - this.lastStep < 90) return;
    this.lastStep = now;
    const nb = this.noiseBuffer(0.2);
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
    g.connect(this.sfxBus ?? this.master);
    src.start(t);
    src.stop(t + 0.14);
  }

  /** 0..1 — the engine feeds speed/throttle each frame (adaptive music). */
  setIntensity(v: number): void {
    this.intensity = clamp(v, 0, 1);
  }

  /** Briefly duck the music bus (sidechain-style) under big one-shots. */
  private duck(level = 0.45, recover = 0.4): void {
    const ctx = this.ctx;
    const d = this.musicDuck;
    if (!ctx || !d) return;
    const now = performance.now();
    if (now - this.lastDuck < 90) return;
    this.lastDuck = now;
    const t = ctx.currentTime;
    d.gain.cancelScheduledValues(t);
    d.gain.setValueAtTime(d.gain.value, t);
    d.gain.linearRampToValueAtTime(level, t + 0.03);
    d.gain.setValueAtTime(level, t + 0.12);
    d.gain.linearRampToValueAtTime(1, t + 0.12 + recover);
  }

  private get maxSpeed(): number {
    return this.stateRef?.maxSpeed ?? MAX_SPEED_FALLBACK;
  }
  private stateRef: VehicleAudioState | null = null;

  /** Called by the engine each frame with the live vehicle snapshot. */
  setState(s: VehicleAudioState): void {
    this.stateRef = s;
  }

  private noiseBuffer(sec = 2): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    }
    return b;
  }

  // --- procedural upbeat jungle adventure background music ---
  private static readonly BASS_NOTES = [
    41.2, 41.2, 49.0, 41.2, 55.0, 41.2, 49.0, 61.73,
  ];
  private static readonly MELODY_NOTES = [
    164.81, 196.0, 220.0, 246.94, 293.66, 329.63, 392.0,
  ];

  private playBgmStep(): void {
    const ctx = this.ctx;
    const bgm = this.bgmGain;
    if (!this.ready || !ctx || !bgm || this.muted || ctx.state !== "running")
      return;
    const t = ctx.currentTime;
    const s = this.currentStep % 16;
    const bar = Math.floor(this.currentStep / 16) % 4;

    // 1. kick
    if (s === 0 || s === 6 || s === 10 || s === 14) {
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
    // 2. snare
    if (s === 4 || s === 12) {
      const nb = this.noiseBuffer(0.2);
      if (nb) {
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
    }
    // 3. hi-hat (louder with intensity)
    if (s % 2 === 1) {
      const nb = this.noiseBuffer(0.05);
      if (nb) {
        const hh = ctx.createBufferSource();
        hh.buffer = nb;
        const f = ctx.createBiquadFilter();
        f.type = "highpass";
        f.frequency.value = 7500;
        const g = ctx.createGain();
        const vol = (s === 2 || s === 10 ? 0.14 : 0.07) * (0.45 + this.intensity * 0.75);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        hh.connect(f);
        f.connect(g);
        g.connect(bgm);
        hh.start(t);
        hh.stop(t + 0.05);
      }
    }
    // 4. bassline
    if (s % 2 === 0) {
      const freq = JeepAudio.BASS_NOTES[Math.floor(s / 2)];
      const bOsc = ctx.createOscillator();
      bOsc.type = "sawtooth";
      bOsc.frequency.value = freq;
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
    // 5. melody layer — fades in with driving intensity (vertical layering)
    if (
      (s === 0 || s === 3 || s === 6 || s === 8 || s === 11 || s === 14) &&
      this.intensity > 0.28
    ) {
      const mIdx = (s + bar * 2) % JeepAudio.MELODY_NOTES.length;
      const mOsc = ctx.createOscillator();
      mOsc.type = "triangle";
      mOsc.frequency.value = JeepAudio.MELODY_NOTES[mIdx];
      const g = ctx.createGain();
      const vol = 0.12 * Math.min(1, (this.intensity - 0.28) * 2.4);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      mOsc.connect(g);
      g.connect(bgm);
      mOsc.start(t);
      mOsc.stop(t + 0.2);
      // sparkle: octave-up pling at high intensity
      if (this.intensity > 0.75 && s === 11) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = JeepAudio.MELODY_NOTES[mIdx] * 2;
        const og = ctx.createGain();
        og.gain.setValueAtTime(0.05, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        o.connect(og);
        og.connect(bgm);
        o.start(t);
        o.stop(t + 0.14);
      }
    }
    this.currentStep++;
  }

  private startBgm(): void {
    if (this.stepTimer) clearInterval(this.stepTimer);
    this.currentStep = 0;
    // 123 BPM, 16th-note timing
    this.stepTimer = setInterval(() => this.playBgmStep(), 122);
  }

  start(): void {
    if (this.ready) return;
    try {
      this.startAudioGraph();
    } catch (err) {
      // Audio must never take gameplay down with it — stay silent instead.
      console.warn("[jeep] audio unavailable:", err);
      this.dispose();
    }
  }

  /**
   * Fire-and-forget fetch of the CC0 recorded audio (TinyWorlds ambience +
   * Kenney impacts). Never throws; gameplay never waits for it.
   */
  loadFiles(): void {
    void this.loadFilesInner();
  }

  private async loadFilesInner(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || !this.ready) return;
    const decode = async (url: string): Promise<AudioBuffer | null> => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const arr = await res.arrayBuffer();
        return await ctx.decodeAudioData(arr);
      } catch {
        return null; // decode unsupported (or offline) — procedural layer stays
      }
    };

    // recorded rainforest bed — loops seamlessly, sits under everything
    const amb = await decode("/assets/jeep/audio/ambience.mp3");
    if (amb && this.ctx && this.ambienceBus && this.ready) {
      const c = this.ctx;
      const src = c.createBufferSource();
      src.buffer = amb;
      src.loop = true;
      const g = c.createGain();
      g.gain.value = 0.5;
      src.connect(g);
      g.connect(this.ambienceBus);
      src.start();
      this.ambienceSrc = src;
    }

    // Kenney impact banks → randomized one-shots for bumps/crashes
    const ids = [...(IMPACT_FILES.light ?? []).map((n) => [n, "light"] as const), ...(IMPACT_FILES.wood ?? []).map((n) => [n, "wood"] as const), ...(IMPACT_FILES.heavy ?? []).map((n) => [n, "heavy"] as const)];
    const bufs = await Promise.all(ids.map(async ([n, grp]) => [grp, await decode(`/assets/jeep/audio/impact/${n}.mp3`)] as const));
    if (!this.ctx || !this.ready) return;
    this.impacts = { light: [], wood: [], heavy: [] };
    for (const [grp, b] of bufs) {
      if (b) (this.impacts[grp as "light" | "wood" | "heavy"] as AudioBuffer[]).push(b);
    }
  }

  /** Randomized real-impact one-shot; returns false when no samples loaded. */
  private playImpact(group: "light" | "wood" | "heavy", strength: number): boolean {
    const ctx = this.ctx;
    const pool = this.impacts[group];
    if (!ctx || !this.ready || this.muted || pool.length === 0) return false;
    const buf = pool[Math.floor(Math.random() * pool.length)];
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.85 + Math.random() * 0.35;
    const g = ctx.createGain();
    g.gain.setValueAtTime(clamp(strength, 0.05, 1), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + buf.duration);
    src.connect(g);
    g.connect(this.sfxBus ?? this.master!);
    src.start(t);
    src.stop(t + buf.duration + 0.05);
    return true;
  }

  private startAudioGraph(): void {
    if (this.ready) return;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // --- buses (audio-design): engine / sfx / music(+duck) / ambience ---
    this.engineBus = ctx.createGain();
    this.engineBus.gain.value = 1;
    this.engineBus.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 1;
    this.sfxBus.connect(this.master);

    this.bgmGain = ctx.createGain();
    this.bgmGain.gain.value = 0.32;
    this.musicDuck = ctx.createGain();
    this.musicDuck.gain.value = 1;
    this.bgmGain.connect(this.musicDuck);
    this.musicDuck.connect(this.master);

    // engine: two detuned oscillators through a lowpass + sub sine
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = "lowpass";
    this.engFilter.frequency.value = 620;
    this.engFilter.Q.value = 3.2;
    this.engOsc1 = ctx.createOscillator();
    this.engOsc1.type = "sawtooth";
    this.engOsc1.frequency.value = 48;
    this.engOsc2 = ctx.createOscillator();
    this.engOsc2.type = "square";
    this.engOsc2.frequency.value = 48 * 1.006;
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    this.engOsc1.connect(this.engFilter);
    this.engOsc2.connect(g2);
    g2.connect(this.engFilter);
    this.engFilter.connect(this.engGain);
    this.engGain.connect(this.engineBus);
    this.engOsc1.start();
    this.engOsc2.start();

    this.subGain = ctx.createGain();
    this.subGain.gain.value = 0;
    this.subOsc = ctx.createOscillator();
    this.subOsc.type = "sine";
    this.subOsc.frequency.value = 42;
    this.subOsc.connect(this.subGain);
    this.subGain.connect(this.engineBus);
    this.subOsc.start();

    // tire / terrain noise
    const nb = this.noiseBuffer(3);
    if (nb) {
      const tire = ctx.createBufferSource();
      tire.buffer = nb;
      tire.loop = true;
      this.tireFilter = ctx.createBiquadFilter();
      this.tireFilter.type = "bandpass";
      this.tireFilter.frequency.value = 420;
      this.tireFilter.Q.value = 0.8;
      this.tireGain = ctx.createGain();
      this.tireGain.gain.value = 0;
      tire.connect(this.tireFilter);
      this.tireFilter.connect(this.tireGain);
      this.tireGain.connect(this.engineBus);
      tire.start();

      // skid screech channel
      const skid = ctx.createBufferSource();
      skid.buffer = nb;
      skid.loop = true;
      const skidFilter = ctx.createBiquadFilter();
      skidFilter.type = "bandpass";
      skidFilter.frequency.value = 2100;
      skidFilter.Q.value = 4.0;
      this.skidGain = ctx.createGain();
      this.skidGain.gain.value = 0;
      skid.connect(skidFilter);
      skidFilter.connect(this.skidGain);
      this.skidGain.connect(this.engineBus);
      skid.start();
    }

    // jungle ambience: procedural wind + insect shimmer, plus the recorded
    // CC0 rainforest bed once it finishes loading (audio-design: own bus)
    this.ambienceBus = ctx.createGain();
    this.ambienceBus.gain.value = 1;
    this.ambienceBus.connect(this.master);
    const ambGain = ctx.createGain();
    ambGain.gain.value = 0.11;
    ambGain.connect(this.ambienceBus);
    const windBuf = this.noiseBuffer(4);
    if (windBuf) {
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

    // --- the Jungle Express (own sub-bus off sfx, one shared panner) ---
    // chuff: looping noise through a bandpass, gated by a slewed square LFO
    // at the chuff rate; rumble: the same noise lowpassed way down.
    this.trainBus = ctx.createGain();
    this.trainBus.gain.value = 1;
    this.trainBus.connect(this.sfxBus);
    if (typeof ctx.createStereoPanner === "function") {
      this.trainPan = ctx.createStereoPanner();
      this.trainPan.connect(this.trainBus);
    }
    const trainOut = this.trainPan ?? this.trainBus;
    const chugBuf = this.noiseBuffer(3);
    if (chugBuf) {
      const chug = ctx.createBufferSource();
      chug.buffer = chugBuf;
      chug.loop = true;
      const chugFilter = ctx.createBiquadFilter();
      chugFilter.type = "bandpass";
      chugFilter.frequency.value = 760;
      chugFilter.Q.value = 0.9;
      this.chugPulse = ctx.createGain();
      this.chugPulse.gain.value = 0.5; // the LFO swings this 0..1
      this.chugGain = ctx.createGain();
      this.chugGain.gain.value = 0;
      chug.connect(chugFilter);
      chugFilter.connect(this.chugPulse);
      this.chugPulse.connect(this.chugGain);
      this.chugGain.connect(trainOut);
      chug.start();

      this.chugLfo = ctx.createOscillator();
      this.chugLfo.type = "square";
      this.chugLfo.frequency.value = 2.8;
      // soften the square's edges into chuff envelopes
      const lfoSlew = ctx.createBiquadFilter();
      lfoSlew.type = "lowpass";
      lfoSlew.frequency.value = 26;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0.5;
      this.chugLfo.connect(lfoSlew);
      lfoSlew.connect(lfoDepth);
      lfoDepth.connect(this.chugPulse.gain);
      this.chugLfo.start();

      const rumble = ctx.createBufferSource();
      rumble.buffer = chugBuf;
      rumble.loop = true;
      const rumbleFilter = ctx.createBiquadFilter();
      rumbleFilter.type = "lowpass";
      rumbleFilter.frequency.value = 130;
      this.rumbleGain = ctx.createGain();
      this.rumbleGain.gain.value = 0;
      rumble.connect(rumbleFilter);
      rumbleFilter.connect(this.rumbleGain);
      this.rumbleGain.connect(trainOut);
      rumble.start();
    }

    this.ready = true;
    this.master.gain.linearRampToValueAtTime(
      this.muted ? 0 : 0.85,
      ctx.currentTime + 1.6,
    );
    this.scheduleBird();
    this.startBgm();
  }

  private scheduleBird(): void {
    if (!this.ready) return;
    window.setTimeout(() => {
      if (this.ready && !this.muted && this.ctx?.state === "running")
        this.bird();
      this.scheduleBird();
    }, 3500 + Math.random() * 9000);
  }

  private bird(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
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
    g.connect(this.sfxBus ?? this.master);
    o.start(t);
    o.stop(t + 0.34);
  }

  thump(strength: number): void {
    const ctx = this.ctx;
    if (!this.ready || !ctx || !this.master || this.muted) return;
    const now = performance.now();
    if (now - this.lastThump < 130) return;
    this.lastThump = now;
    const t = ctx.currentTime;
    // real recorded impact on top; procedural sub-layer underneath for weight
    this.playImpact(strength > 0.6 ? "heavy" : "light", Math.min(0.85, 0.25 + strength * 0.55));
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
    g.connect(this.sfxBus ?? this.master);
    o.start(t);
    o.stop(t + 0.3);
    if (strength > 0.45) this.duck(0.5, 0.3);
  }

  /** Suspension/landing thud — deeper than a bump, scales with airtime. */
  thud(severity: number): void {
    const ctx = this.ctx;
    if (!this.ready || !ctx || !this.master || this.muted) return;
    const now = performance.now();
    if (now - this.lastThud < 150) return;
    this.lastThud = now;
    const s = clamp(severity, 0.15, 1.5);
    const t = ctx.currentTime;
    // real impact sample first (wood crunch for landings), then the sub layer
    this.playImpact("wood", clamp(0.2 + s * 0.45, 0.1, 1) * 0.7);
    const nb = this.noiseBuffer(0.25);
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
      g.connect(this.sfxBus ?? this.master);
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
    og.connect(this.sfxBus ?? this.master);
    o.start(t);
    o.stop(t + 0.22);
    this.duck(0.55, 0.35);
  }

  /** Countdown blip; the final "GO" is a brighter, longer tone. */
  beep(final = false): void {
    const ctx = this.ctx;
    if (!this.ready || !ctx || !this.master || this.muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = final ? 784 : 392;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(final ? 0.2 : 0.12, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + (final ? 0.4 : 0.12));
    o.connect(g);
    g.connect(this.sfxBus ?? this.master);
    o.start(t);
    o.stop(t + (final ? 0.42 : 0.14));
  }

  splash(): void {
    const ctx = this.ctx;
    if (!this.ready || !ctx || !this.master || this.muted) return;
    const now = performance.now();
    if (now - this.lastSplash < 260) return;
    this.lastSplash = now;
    const t = ctx.currentTime;
    const nb = this.noiseBuffer(0.4);
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
    g.connect(this.sfxBus ?? this.master);
    src.start(t);
    src.stop(t + 0.4);
  }

  /* ---- animal voices (the horn key while riding) ------------------------- */

  private lastCall = 0;

  /**
   * One synthesized vocal element: a pitch contour through an oscillator
   * (optionally buzzed by a vibrato and shaped by a band/low-pass filter) plus
   * an optional band of noise for breath and rasp.
   */
  private voice(
    t0: number,
    o: {
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
    },
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const out = this.sfxBus ?? this.master;
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
      const nb = this.noiseBuffer(Math.min(2, end));
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

  /**
   * An animal's call. `pitch` scales every frequency (small animals high,
   * giants low — see RideInfo.call.pitch); each kind has its own contour:
   * a dog's two sharp barks, a horse's rising-then-falling whinny, a T-Rex's
   * rasping roar, a hadrosaur's hollow honk…
   */
  animalCall(kind: AnimalCall, pitch = 1): void {
    const ctx = this.ctx;
    if (!this.ready || !ctx || !this.master || this.muted) return;
    const now = performance.now();
    if (now - this.lastCall < 350) return;
    this.lastCall = now;
    const t = ctx.currentTime + 0.01;
    const p = clamp(pitch, 0.4, 2);
    const v = (o: Parameters<JeepAudio["voice"]>[1], at = 0) => this.voice(t + at, o);
    switch (kind) {
      case "bark":
        for (const at of [0, 0.22]) {
          v({ type: "sawtooth", f: [[0, 520], [0.05, 360], [0.14, 300]], g: [[0.005, 0.5], [0.06, 0.35], [0.14, 0]], lp: 1800, bp: [900, 1.2], noise: 0.35, pitch: p, vol: 0.5 }, at);
        }
        break;
      case "yip":
        for (const at of [0, 0.13, 0.26]) {
          v({ type: "triangle", f: [[0, 900], [0.06, 1250], [0.1, 1000]], g: [[0.01, 0.4], [0.1, 0]], bp: [1400, 1.5], pitch: p, vol: 0.4 }, at);
        }
        break;
      case "howl":
        v({ type: "triangle", f: [[0, 260], [0.5, 520], [1.2, 560], [1.9, 420]], g: [[0.15, 0.4], [1.2, 0.42], [1.9, 0]], vib: [5.5, 10], bp: [800, 0.9], noise: 0.08, pitch: p, vol: 0.5 });
        break;
      case "neigh":
        v({ type: "sawtooth", f: [[0, 520], [0.18, 1050], [0.5, 980], [0.9, 640], [1.25, 380]], g: [[0.04, 0.45], [0.6, 0.45], [1.25, 0]], vib: [14, 28], lp: 2600, bp: [1500, 0.7], noise: 0.18, pitch: p, vol: 0.5 });
        break;
      case "bray":
        for (const [at, hz] of [[0, 520], [0.5, 480], [1.0, 540]] as const) {
          v({ type: "sawtooth", f: [[0, hz * 0.7], [0.12, hz * 1.5], [0.38, hz * 1.4]], g: [[0.03, 0.5], [0.35, 0.45], [0.42, 0]], lp: 2200, bp: [1100, 0.8], noise: 0.12, pitch: p, vol: 0.5 }, at);
        }
        break;
      case "moo":
        v({ type: "sawtooth", f: [[0, 130], [0.5, 105], [1.4, 150], [1.9, 92]], g: [[0.1, 0.5], [1.4, 0.5], [1.9, 0]], vib: [4, 3], lp: 700, bp: [320, 0.8], pitch: p, vol: 0.6 });
        break;
      case "bellow":
        v({ type: "sawtooth", f: [[0, 160], [0.3, 210], [1.0, 170], [1.5, 120]], g: [[0.08, 0.5], [1.0, 0.5], [1.5, 0]], vib: [7, 8], lp: 900, bp: [400, 0.7], noise: 0.2, pitch: p, vol: 0.55 });
        break;
      case "bleat":
        v({ type: "sawtooth", f: [[0, 420], [0.2, 520], [0.5, 380]], g: [[0.02, 0.45], [0.5, 0]], vib: [26, 40], lp: 1800, bp: [900, 1.1], pitch: p, vol: 0.45 });
        break;
      case "hum":
        v({ type: "triangle", f: [[0, 300], [0.6, 360], [1.2, 330]], g: [[0.2, 0.35], [0.9, 0.35], [1.3, 0]], vib: [4.5, 6], lp: 900, pitch: p, vol: 0.5 });
        break;
      case "croak":
        for (const at of [0, 0.2]) {
          v({ type: "square", f: [[0, 190], [0.08, 140]], g: [[0.01, 0.35], [0.1, 0]], vib: [40, 40], lp: 900, bp: [400, 1], pitch: p, vol: 0.4 }, at);
        }
        break;
      case "hiss":
        v({ type: "sawtooth", f: [[0, 40], [1, 40]], g: [[0.1, 0.0001], [0.2, 0.2], [1.0, 0.18], [1.4, 0]], bp: [5200, 0.6], noise: 3.5, pitch: p, vol: 0.4 });
        break;
      case "squeak":
        for (const at of [0, 0.12]) {
          v({ type: "sine", f: [[0, 2400], [0.05, 3300], [0.09, 2900]], g: [[0.005, 0.35], [0.09, 0]], pitch: p, vol: 0.35 }, at);
        }
        break;
      case "chitter":
        for (let i = 0; i < 6; i++) {
          v({ type: "square", f: [[0, 1400], [0.04, 1000]], g: [[0.004, 0.28], [0.05, 0]], bp: [2200, 1.5], noise: 0.4, pitch: p, vol: 0.35 }, i * 0.07);
        }
        break;
      case "buzz":
        v({ type: "sawtooth", f: [[0, 230], [0.6, 260], [1.0, 220]], g: [[0.05, 0.3], [0.9, 0.3], [1.1, 0]], vib: [60, 25], bp: [700, 1.2], noise: 0.25, pitch: p, vol: 0.35 });
        break;
      case "roar":
        v({ type: "sawtooth", f: [[0, 90], [0.25, 190], [0.9, 150], [1.9, 70]], g: [[0.05, 0.55], [1.0, 0.55], [1.9, 0]], vib: [24, 14], lp: 1100, bp: [350, 0.5], noise: 0.9, pitch: p, vol: 0.7 });
        v({ type: "square", f: [[0, 45], [1.9, 38]], g: [[0.1, 0.4], [1.7, 0.3], [1.9, 0]], lp: 200, pitch: p, vol: 0.6 });
        break;
      case "screech":
        v({ type: "sawtooth", f: [[0, 900], [0.1, 1800], [0.5, 1500], [0.8, 700]], g: [[0.02, 0.5], [0.5, 0.45], [0.8, 0]], vib: [30, 60], bp: [1800, 0.7], noise: 0.5, pitch: p, vol: 0.5 });
        break;
      case "trumpet":
        v({ type: "sawtooth", f: [[0, 120], [0.5, 200], [1.6, 190], [2.2, 100]], g: [[0.15, 0.5], [1.6, 0.5], [2.2, 0]], vib: [6, 4], lp: 1000, bp: [300, 0.6], pitch: p, vol: 0.6 });
        break;
      case "honk":
        v({ type: "sawtooth", f: [[0, 190], [0.12, 270], [0.9, 250], [1.2, 160]], g: [[0.03, 0.5], [0.9, 0.5], [1.2, 0]], lp: 1300, bp: [600, 1.8], pitch: p, vol: 0.55 });
        break;
      case "grunt":
      default:
        v({ type: "sawtooth", f: [[0, 120], [0.15, 90], [0.4, 70]], g: [[0.02, 0.5], [0.4, 0]], lp: 600, noise: 0.4, pitch: p, vol: 0.6 });
        break;
    }
    this.duck(0.6, 0.5);
  }

  /* ---- guns ---------------------------------------------------------------- */

  private lastShot = 0;

  /**
   * One shot, voiced per weapon (see GunDef.sound): a noise crack for the
   * muzzle blast under a falling-pitch body — pistol pop, SMG rip, rifle
   * crack, shotgun boom, sniper slam.
   */
  gunshot(kind: "pistol" | "smg" | "rifle" | "shotgun" | "sniper"): void {
    const ctx = this.ctx;
    if (!this.ready || !ctx || !this.master || this.muted) return;
    const now = performance.now();
    if (now - this.lastShot < 40) return;
    this.lastShot = now;
    const t = ctx.currentTime + 0.005;
    const jitter = 0.94 + Math.random() * 0.12;
    const v = (o: Parameters<JeepAudio["voice"]>[1]) => this.voice(t, o);
    switch (kind) {
      case "pistol":
        v({ type: "square", f: [[0, 340], [0.07, 120]], g: [[0.003, 0.5], [0.09, 0]], bp: [2400, 0.7], noise: 1.4, pitch: jitter, vol: 0.5 });
        break;
      case "smg":
        v({ type: "square", f: [[0, 460], [0.05, 200]], g: [[0.002, 0.42], [0.06, 0]], bp: [3400, 0.8], noise: 1.5, pitch: jitter, vol: 0.4 });
        break;
      case "rifle":
        v({ type: "sawtooth", f: [[0, 260], [0.09, 90]], g: [[0.003, 0.55], [0.13, 0]], bp: [2000, 0.6], noise: 1.5, pitch: jitter, vol: 0.55 });
        break;
      case "shotgun":
        v({ type: "sawtooth", f: [[0, 130], [0.2, 55]], g: [[0.004, 0.7], [0.28, 0]], bp: [1300, 0.5], noise: 2.2, pitch: jitter, vol: 0.7 });
        break;
      case "sniper":
        v({ type: "sawtooth", f: [[0, 100], [0.3, 38]], g: [[0.004, 0.75], [0.42, 0]], bp: [1500, 0.5], noise: 2.4, pitch: jitter, vol: 0.8 });
        v({ type: "triangle", f: [[0, 1200], [0.04, 400]], g: [[0.002, 0.3], [0.05, 0]], pitch: 1, vol: 0.3 }); // crack
        break;
    }
    if (kind === "shotgun" || kind === "sniper") this.duck(0.6, 0.45);
  }

  /** Magazine out/in: two clicks with a slide in between. */
  reload(seconds = 1.5): void {
    const ctx = this.ctx;
    if (!this.ready || !ctx || !this.master || this.muted) return;
    const t = ctx.currentTime;
    const click = (at: number, hz: number) =>
      this.voice(t + at, { type: "square", f: [[0, hz], [0.03, hz * 0.6]], g: [[0.002, 0.3], [0.04, 0]], bp: [2600, 1.2], noise: 0.8, pitch: 1, vol: 0.35 });
    click(0.12, 900);
    click(seconds * 0.55, 700);
    click(Math.max(seconds - 0.12, 0.3), 1100);
  }

  /** Trigger pulled on an empty gun. */
  dryFire(): void {
    const ctx = this.ctx;
    if (!this.ready || !ctx || !this.master || this.muted) return;
    this.voice(ctx.currentTime, { type: "square", f: [[0, 600], [0.025, 400]], g: [[0.002, 0.25], [0.03, 0]], bp: [2800, 1.4], pitch: 1, vol: 0.3 });
  }

  /** Quick tick when a bullet lands on an animal. */
  hitMarker(kill = false): void {
    const ctx = this.ctx;
    if (!this.ready || !ctx || !this.master || this.muted) return;
    const t = ctx.currentTime;
    this.voice(t, { type: "triangle", f: [[0, kill ? 1500 : 1100], [0.05, kill ? 1100 : 800]], g: [[0.002, 0.3], [0.07, 0]], pitch: 1, vol: 0.35 });
    if (kill) this.voice(t + 0.07, { type: "triangle", f: [[0, 1800], [0.06, 1400]], g: [[0.002, 0.3], [0.08, 0]], pitch: 1, vol: 0.35 });
  }

  /** Switching weapons: a short mechanical clack. */
  weaponSwap(): void {
    const ctx = this.ctx;
    if (!this.ready || !ctx || !this.master || this.muted) return;
    this.voice(ctx.currentTime, { type: "square", f: [[0, 500], [0.04, 260]], g: [[0.003, 0.3], [0.06, 0]], bp: [1800, 1], noise: 0.7, pitch: 1, vol: 0.3 });
  }

  horn(): void {
    const ctx = this.ctx;
    if (!this.ready || !ctx || !this.master || this.muted) return;
    const now = performance.now();
    if (now - this.lastHorn < 380) return;
    this.lastHorn = now;
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
    g.connect(this.sfxBus ?? this.master);
    o1.start(t);
    o2.start(t);
    o1.stop(t + 0.36);
    o2.stop(t + 0.36);
    this.duck(0.55, 0.35);
  }

  /**
   * The Jungle Express, every frame: distance gain (0 = out of earshot),
   * stereo bearing, chuff rate. The train keeps steaming while paused or
   * on foot — this only shapes what you hear.
   */
  setTrainState(s: { gain: number; pan: number; rate: number } | null): void {
    const ctx = this.ctx;
    if (!this.ready || !ctx) return;
    const t = ctx.currentTime;
    const g = s ? clamp(s.gain, 0, 1) : 0;
    this.chugGain?.gain.setTargetAtTime(0.55 * g * g, t, 0.15);
    this.rumbleGain?.gain.setTargetAtTime(0.3 * g, t, 0.2);
    this.chugLfo?.frequency.setTargetAtTime(clamp(s?.rate ?? 2.8, 0.8, 6), t, 0.25);
    this.trainPan?.pan.setTargetAtTime(clamp(s?.pan ?? 0, -1, 1), t, 0.12);
  }

  /** Two-tone steam whistle (detuned chord + breath), distance-attenuated. */
  trainWhistle(gain: number): void {
    const ctx = this.ctx;
    if (!this.ready || !ctx || this.muted || !this.trainBus) return;
    const t = ctx.currentTime;
    const g0 = clamp(gain, 0.15, 1);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.3 * g0, t + 0.06);
    out.gain.setValueAtTime(0.3 * g0, t + 0.6);
    out.gain.exponentialRampToValueAtTime(0.001, t + 1.15);
    out.connect(this.trainBus);
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
    const nb = this.noiseBuffer(1.3);
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

  update(): void {
    const ctx = this.ctx;
    const s = this.stateRef;
    if (!this.ready || !ctx || ctx.state !== "running" || !s) return;
    if (this.footMode) {
      const t0 = ctx.currentTime;
      this.engGain?.gain.setTargetAtTime(0, t0, 0.12);
      this.subGain?.gain.setTargetAtTime(0, t0, 0.12);
      this.tireGain?.gain.setTargetAtTime(0, t0, 0.12);
      this.skidGain?.gain.setTargetAtTime(0, t0, 0.05);
      return;
    }
    const maxSpeed = this.maxSpeed;
    const base = 26 + s.rpm * 0.0165;
    const load = clamp(
      s.throttle * 0.7 + Math.abs(s.speed) / maxSpeed * 0.5,
      0,
      1.1,
    );
    const now = ctx.currentTime;
    this.engOsc1?.frequency.setTargetAtTime(base, now, 0.06);
    this.engOsc2?.frequency.setTargetAtTime(base * 2.01, now, 0.06);
    this.subOsc?.frequency.setTargetAtTime(base * 0.5 + 18, now, 0.08);
    this.engFilter?.frequency.setTargetAtTime(420 + load * 1500, now, 0.1);
    this.engGain?.gain.setTargetAtTime(0.075 + load * 0.1, now, 0.1);
    this.subGain?.gain.setTargetAtTime(0.055 + load * 0.055, now, 0.12);
    const spd = Math.abs(s.speed);
    const surfBright =
      s.surface === "rock"
        ? 900
        : s.surface === "water"
          ? 280
          : s.surface === "mud"
            ? 330
            : s.surface === "ballast"
              ? 700
              : 520;
    this.tireFilter?.frequency.setTargetAtTime(surfBright + spd * 40, now, 0.15);
    this.tireGain?.gain.setTargetAtTime(
      clamp(spd / maxSpeed, 0, 1) * 0.1,
      now,
      0.15,
    );
    // skid screech on handbrake or drift
    const skidding =
      (s.handbrake && spd > 2.0) || Math.abs(s.lateral) > 1.2;
    this.skidGain?.gain.setTargetAtTime(skidding ? 0.18 : 0, now, 0.08);
    if (s.bumpImpulse > 0.35) this.thump(s.bumpImpulse);
  }

  toggle(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(
        this.muted ? 0 : 0.85,
        this.ctx.currentTime,
        0.1,
      );
    }
    return this.muted;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === "running") void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  dispose(): void {
    if (this.stepTimer) clearInterval(this.stepTimer);
    this.stepTimer = null;
    try {
      this.ambienceSrc?.stop();
    } catch {
      // already stopped
    }
    this.ambienceSrc = null;
    this.impacts = { light: [], wood: [], heavy: [] };
    try {
      void this.ctx?.close();
    } catch {
      // already closed
    }
    this.ctx = null;
    this.master = null;
    this.bgmGain = null;
    this.musicDuck = null;
    this.engineBus = null;
    this.sfxBus = null;
    this.ambienceBus = null;
    this.ready = false;
  }
}
