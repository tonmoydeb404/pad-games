/**
 * Procedural Web Audio for Dungeon Blaster — per-weapon shots, footsteps,
 * pickups, grenade booms and a low dungeon ambience. No audio assets.
 */
export class ArenaAudio {
  private ctx: AudioContext | null = null;
  private ambience: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private footT = 0;
  volume = 0.5;

  private get ac(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private noise(duration: number, freq: number, gain: number, type: BiquadFilterType = "lowpass"): void {
    const ac = this.ac;
    if (!ac) return;
    const n = Math.floor(ac.sampleRate * duration);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ac.createGain();
    g.gain.value = gain * this.volume;
    src.connect(f).connect(g).connect(ac.destination);
    src.start();
  }

  private tone(freq: number, duration: number, gain: number, type: OscillatorType = "square", slide = 0): void {
    const ac = this.ac;
    if (!ac) return;
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ac.currentTime + duration);
    const g = ac.createGain();
    g.gain.value = gain * this.volume;
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + duration);
  }

  /** Per-weapon shots: pistol pop, SMG rip, rifle crack, shotgun boom, sniper slam. */
  shoot(weapon: number): void {
    switch (weapon) {
      case 0:
        this.noise(0.09, 2600, 0.4);
        this.tone(320, 0.05, 0.2, "square", -180);
        break;
      case 1:
        this.noise(0.06, 3600, 0.32);
        this.tone(420, 0.04, 0.14, "square", -220);
        break;
      case 2:
        this.noise(0.12, 2200, 0.45);
        this.tone(240, 0.07, 0.22, "sawtooth", -140);
        break;
      case 3:
        this.noise(0.28, 1400, 0.6);
        this.tone(120, 0.12, 0.3, "sawtooth", -60);
        break;
      case 4:
        this.noise(0.3, 1800, 0.65);
        this.tone(90, 0.18, 0.34, "sawtooth", -40);
        break;
      default:
        this.noise(0.1, 3000, 0.4);
    }
  }

  reload(): void {
    this.tone(700, 0.05, 0.14, "square");
    window.setTimeout(() => this.tone(500, 0.05, 0.14, "square"), 130);
  }

  throwGrenade(): void {
    this.noise(0.12, 1200, 0.2, "highpass");
  }

  explosion(distance = 0): void {
    const atten = 1 / (1 + distance / 14);
    this.noise(0.7, 900 * atten + 120, 0.9 * atten + 0.1);
    this.tone(70, 0.5, 0.5 * atten + 0.08, "sawtooth", -40);
  }

  footstep(): void {
    this.noise(0.05, 500 + Math.random() * 200, 0.12);
  }

  /** Called every frame with the player's speed; produces timed steps. */
  updateFootsteps(speed: number, dt: number, grounded: boolean): void {
    if (!grounded || speed < 1.5) {
      this.footT = 0;
      return;
    }
    this.footT += dt * (speed / 7);
    if (this.footT > 0.42) {
      this.footT = 0;
      this.footstep();
    }
  }

  pickup(): void {
    this.tone(880, 0.08, 0.2, "triangle");
    window.setTimeout(() => this.tone(1320, 0.12, 0.2, "triangle"), 70);
  }

  weaponPickup(): void {
    this.tone(440, 0.09, 0.2, "triangle");
    window.setTimeout(() => this.tone(660, 0.09, 0.2, "triangle"), 80);
    window.setTimeout(() => this.tone(880, 0.14, 0.22, "triangle"), 160);
  }

  hit(): void {
    this.tone(1200, 0.06, 0.25, "triangle");
  }
  kill(): void {
    this.tone(900, 0.12, 0.3, "triangle");
    this.tone(1400, 0.18, 0.25, "triangle");
  }
  damaged(): void {
    this.tone(140, 0.15, 0.4, "sawtooth");
  }
  empty(): void {
    this.tone(300, 0.04, 0.15);
  }

  /** Low dungeon air: filtered noise bed + a slow sub drone. */
  startAmbience(): void {
    const ac = this.ac;
    if (!ac || this.ambience) return;
    const n = ac.sampleRate * 4;
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.5;
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 240;
    const g = ac.createGain();
    g.gain.value = 0.35 * this.volume;
    src.connect(f).connect(g).connect(ac.destination);
    src.start();
    const drone = ac.createOscillator();
    drone.type = "sine";
    drone.frequency.value = 52;
    const dg = ac.createGain();
    dg.gain.value = 0.05 * this.volume;
    drone.connect(dg).connect(ac.destination);
    drone.start();
    this.ambience = { src, gain: dg };
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ambience && this.ctx) this.ambience.gain.gain.value = 0.05 * v;
  }

  destroy(): void {
    if (this.ambience) {
      try {
        this.ambience.src.stop();
      } catch {
        // already stopped
      }
      this.ambience = null;
    }
    void this.ctx?.close();
    this.ctx = null;
  }
}
