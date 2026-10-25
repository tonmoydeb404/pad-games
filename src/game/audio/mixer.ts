/**
 * Procedural audio — no binary assets, no licensing risk.
 *
 * Buses: master (with a safety limiter) → (music | sfx | ambience). Wind and
 * slide are looped filtered noise routed through the ambience bus whose
 * gain/filter follow speed; SFX and music are synthesized on the fly with
 * per-hit pitch/volume variation. Music is adaptive: pads per bar always,
 * a beat pulse and an arpeggio fade in with intensity — all scheduled on
 * the AudioContext clock so the grid never drifts. The AudioContext is
 * created lazily on the first user gesture.
 */

export interface MixerState {
  speed: number;
  grounded: boolean;
  air: boolean;
  storm: number;
  running: boolean;
  /** 0..1 — adaptive-music intensity (speed, combo, storm). */
  intensity: number;
}

type Ctx = AudioContext;

export class Mixer {
  musicOn = true;
  sfxOn = true;
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private ambienceBus: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private slideGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  // Adaptive music: scheduled on the audio clock (never frame time), chords
  // per bar, a soft pulse per beat, arpeggio eighths at high intensity.
  private static BPM = 92;
  private beatDur = 60 / Mixer.BPM;
  private barDur = this.beatDur * 8;
  private nextChordAt = 0;
  private nextBeatAt = 0;
  private nextArpAt = 0;
  private chordIndex = 0;
  private arpStep = 0;
  /** Smoothed intensity actually driving the layers (0..1). */
  private intensity = 0;
  private started = false;

  /** Create/resume the context. Safe to call repeatedly. */
  ensure(): void {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.buildGraph();
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
  }

  dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.started = false;
    }
  }

  private buildGraph(): void {
    const ctx = this.ctx!;
    // Safety limiter on master — a net against clipping, not the mix itself.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 0;
    limiter.ratio.value = 16;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(limiter);
    limiter.connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? 0.5 : 0;
    this.musicBus.connect(this.master);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxOn ? 1 : 0;
    this.sfxBus.connect(this.master);

    this.ambienceBus = ctx.createGain();
    this.ambienceBus.gain.value = 0.9;
    this.ambienceBus.connect(this.master);

    // shared 2s noise buffer
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;

    // wind: bandpassed noise → ambience bus
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = buf;
    windSrc.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = "bandpass";
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.55;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    windSrc
      .connect(this.windFilter)
      .connect(this.windGain)
      .connect(this.ambienceBus);
    windSrc.start();

    // board slide: lowpassed noise → ambience bus
    const slideSrc = ctx.createBufferSource();
    slideSrc.buffer = buf;
    slideSrc.loop = true;
    const slideFilter = ctx.createBiquadFilter();
    slideFilter.type = "lowpass";
    slideFilter.frequency.value = 620;
    this.slideGain = ctx.createGain();
    this.slideGain.gain.value = 0;
    slideSrc
      .connect(slideFilter)
      .connect(this.slideGain)
      .connect(this.ambienceBus);
    slideSrc.start();

    // Start the musical grid slightly ahead of "now".
    const t0 = ctx.currentTime + 0.1;
    this.nextChordAt = t0;
    this.nextBeatAt = t0;
    this.nextArpAt = t0;
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    if (this.musicBus && this.ctx) {
      this.musicBus.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.1);
    }
  }

  setSfx(on: boolean): void {
    this.sfxOn = on;
    if (this.sfxBus && this.ctx) {
      this.sfxBus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * Duck the MUSIC in menus/pause — on its own bus, so UI sounds and SFX
   * stay audible and the player's music level isn't overwritten (it
   * restores to the same 0.5 the Music toggle sets).
   */
  setDucked(ducked: boolean): void {
    if (!this.musicBus || !this.ctx) return;
    this.musicBus.gain.setTargetAtTime(
      ducked ? 0.12 : 0.5,
      this.ctx.currentTime,
      0.25,
    );
  }

  update(dt: number, s: MixerState): void {
    if (!this.ctx || !this.windGain || !this.windFilter || !this.slideGain) return;
    const t = this.ctx.currentTime;
    const speedT = Math.min(1, s.speed / 1400);

    const windTarget =
      Math.pow(speedT, 1.2) * 0.4 * (s.air ? 1.25 : 1) + s.storm * 0.32;
    this.windGain.gain.setTargetAtTime(
      s.running ? windTarget : windTarget * 0.3,
      t,
      0.18,
    );
    this.windFilter.frequency.setTargetAtTime(360 + s.speed * 0.85, t, 0.15);

    const slideTarget = s.grounded ? Math.min(1, s.speed / 1200) * 0.26 : 0;
    this.slideGain.gain.setTargetAtTime(
      s.running ? slideTarget : 0,
      t,
      s.grounded ? 0.12 : 0.05,
    );

    // Intensity eases toward its target so layers fade, never snap.
    const target = s.running ? Math.min(1, Math.max(0, s.intensity)) : 0;
    this.intensity += (target - this.intensity) * Math.min(1, dt * 2);

    if (this.musicOn) this.runMusicScheduler();
  }

  // ---------------------------------------------------------------------
  // Music: pad chords per bar + adaptive layers on the audio clock.
  // Everything is scheduled at exact AudioContext times (sample-accurate),
  // never accumulated from frame dt — so the grid never drifts.
  // ---------------------------------------------------------------------

  private static CHORDS: number[][] = [
    [110.0, 130.81, 164.81], // Am
    [87.31, 110.0, 130.81], // F
    [130.81, 164.81, 196.0], // C
    [98.0, 123.47, 146.83], // G
  ];

  private static SCALE = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25];

  /** Melodic pattern for the arp layer (indices into SCALE). */
  private static ARP = [0, 2, 4, 2, 5, 4, 2, 1];

  private runMusicScheduler(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const look = 0.3;

    // After a stalled tab, snap the grid forward instead of stacking ops.
    if (this.nextChordAt < ctx.currentTime - 1) this.nextChordAt = ctx.currentTime;
    if (this.nextBeatAt < ctx.currentTime - 1) this.nextBeatAt = ctx.currentTime;
    if (this.nextArpAt < ctx.currentTime - 1) this.nextArpAt = ctx.currentTime;

    // Chords: one per bar, always.
    while (this.nextChordAt < ctx.currentTime + look) {
      const chord = Mixer.CHORDS[this.chordIndex % Mixer.CHORDS.length];
      this.chordIndex++;
      for (const freq of chord) {
        this.pad(freq, this.barDur * 1.05, 0.045, this.nextChordAt);
      }
      this.nextChordAt += this.barDur;
    }

    // Pulse layer: a soft tick per beat, fading in past ~30% intensity.
    while (this.nextBeatAt < ctx.currentTime + look) {
      if (this.intensity > 0.3) {
        this.pulse(this.nextBeatAt, 0.04 + 0.15 * this.intensity);
      }
      this.nextBeatAt += this.beatDur;
    }

    // Arp layer: pentatonic eighths, entering above ~55% intensity.
    const eighth = this.beatDur / 2;
    while (this.nextArpAt < ctx.currentTime + look) {
      if (this.intensity > 0.55) {
        const note = Mixer.SCALE[Mixer.ARP[this.arpStep % Mixer.ARP.length]];
        this.pluck(note, this.nextArpAt, 0.05 + 0.06 * (this.intensity - 0.55));
      }
      this.arpStep++;
      this.nextArpAt += eighth;
    }
  }

  private pad(freq: number, dur: number, vol: number, when: number): void {
    const ctx = this.ctx!;
    const t = when;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const det = ctx.createOscillator();
    det.type = "sine";
    det.frequency.value = freq * 1.003;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(g);
    det.connect(g);
    g.connect(this.musicBus!);
    osc.start(t);
    det.start(t);
    osc.stop(t + dur + 0.1);
    det.stop(t + dur + 0.1);
  }

  /** Soft percussive tick driving the beat layer. */
  private pulse(when: number, vol: number): void {
    const ctx = this.ctx!;
    if (!this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 2400;
    f.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.09);
    src.connect(f);
    f.connect(g);
    g.connect(this.musicBus!);
    src.start(when, Math.random());
    src.stop(when + 0.12);
  }

  private pluck(freq: number, when?: number, vol = 0.12): void {
    const ctx = this.ctx!;
    const t = when ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    // Slight detune per pluck so repeated notes never sound sampled.
    osc.frequency.value = freq * Math.pow(2, ((Math.random() * 2 - 1) * 0.5) / 12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    const delay = ctx.createDelay(0.6);
    delay.delayTime.value = 0.28;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    osc.connect(g);
    g.connect(this.musicBus!);
    g.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    fb.connect(this.musicBus!);
    osc.start(t);
    osc.stop(t + 1.2);
  }

  // ---------------------------------------------------------------------
  // SFX one-shots
  // ---------------------------------------------------------------------

  private burst(
    opts: {
      dur: number;
      vol: number;
      type: "noise" | "osc";
      freq?: number;
      freqEnd?: number;
      filter?: number;
      oscType?: OscillatorType;
      /** Random pitch variation, semitones (kills machine-gun repeats). */
      detune?: number;
      /** Random volume variation, ± fraction. */
      volJitter?: number;
    },
  ): void {
    if (!this.ctx || !this.sfxBus || !this.sfxOn) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const detune = opts.detune ?? 0;
    const jitter = opts.volJitter ?? 0.1;
    const det = Math.pow(2, ((Math.random() * 2 - 1) * detune) / 12);
    const vol = opts.vol * (1 + (Math.random() * 2 - 1) * jitter);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    g.connect(this.sfxBus);

    if (opts.type === "noise" && this.noiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = (opts.filter ?? 900) * det;
      src.connect(f).connect(g);
      src.start(t, Math.random());
      src.stop(t + opts.dur + 0.05);
    } else {
      const osc = ctx.createOscillator();
      osc.type = opts.oscType ?? "sine";
      osc.frequency.setValueAtTime((opts.freq ?? 440) * det, t);
      if (opts.freqEnd) {
        osc.frequency.exponentialRampToValueAtTime(opts.freqEnd * det, t + opts.dur);
      }
      osc.connect(g);
      osc.start(t);
      osc.stop(t + opts.dur + 0.05);
    }
  }

  jump(charge: number): void {
    this.burst({
      dur: 0.22,
      vol: 0.22,
      type: "noise",
      filter: 1600 + charge * 1800,
      detune: 0.5,
    });
    this.burst({
      dur: 0.18,
      vol: 0.14,
      type: "osc",
      freq: 300 + charge * 220,
      freqEnd: 720 + charge * 500,
      oscType: "triangle",
      detune: 0.5,
    });
  }

  land(kind: "clean" | "rough"): void {
    if (kind === "clean") {
      this.burst({ dur: 0.16, vol: 0.3, type: "noise", filter: 520, detune: 0.8 });
      this.burst({
        dur: 0.14,
        vol: 0.16,
        type: "osc",
        freq: 150,
        freqEnd: 80,
        detune: 0.6,
      });
    } else {
      this.burst({ dur: 0.3, vol: 0.4, type: "noise", filter: 800, detune: 0.8 });
      this.burst({
        dur: 0.22,
        vol: 0.2,
        type: "osc",
        freq: 110,
        freqEnd: 55,
        detune: 0.6,
      });
    }
  }

  crash(): void {
    this.burst({ dur: 0.5, vol: 0.5, type: "noise", filter: 1100, detune: 0.4 });
    this.burst({
      dur: 0.5,
      vol: 0.3,
      type: "osc",
      freq: 220,
      freqEnd: 40,
      oscType: "sawtooth",
      detune: 0.3,
    });
  }

  pickup(): void {
    this.burst({
      dur: 0.14,
      vol: 0.18,
      type: "osc",
      freq: 880,
      freqEnd: 1320,
      oscType: "sine",
      detune: 1.0,
    });
  }

  trick(): void {
    this.burst({
      dur: 0.12,
      vol: 0.12,
      type: "osc",
      freq: 660,
      freqEnd: 990,
      oscType: "sine",
      detune: 0.6,
    });
  }

  ui(kind: "move" | "confirm" | "back"): void {
    if (kind === "confirm") {
      this.burst({ dur: 0.1, vol: 0.14, type: "osc", freq: 520, freqEnd: 780 });
    } else if (kind === "back") {
      this.burst({ dur: 0.1, vol: 0.1, type: "osc", freq: 420, freqEnd: 260 });
    } else {
      this.burst({ dur: 0.06, vol: 0.08, type: "osc", freq: 600 });
    }
  }
}
