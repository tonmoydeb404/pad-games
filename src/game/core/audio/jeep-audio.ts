/**
 * Procedural Web Audio for Jungle Jeep — zero assets. Engine (two detuned
 * oscillators + sub), terrain tire noise, skid screech, jungle ambience with
 * insect shimmer, an upbeat 123 BPM safari BGM sequencer, plus one-shots
 * (horn, impact thump, water splash, birds). All optional: failures are
 * swallowed and the game stays silent.
 */

import type { AnimalCall } from "../../world/animals";
import { clamp } from "../noise";
import { animalCall } from "./animal-calls";
import { startAudioGraph } from "./graph";
import { gunshot, reload, dryFire, hitMarker, weaponSwap, type GunSound } from "./gun-sfx";
import { loadSamples } from "./samples";
import { beep, horn, thud, thump } from "./sfx-impact";
import { splash, step } from "./sfx-ambient";
import { setTrainState, trainWhistle } from "./train-sfx";
import { createAudioState, type VehicleAudioState } from "./types";
import { updateVehicle } from "./vehicle-update";

export class JeepAudio {
  private readonly a = createAudioState();

  setFootMode(on: boolean): void {
    this.a.footMode = on;
  }

  /** One footfall on `surface`; `k` is loudness 0..1.3 (crouch < jog < sprint). */
  step(surface: string, k: number): void {
    step(this.a, surface, k);
  }

  /** 0..1 — the engine feeds speed/throttle each frame (adaptive music). */
  setIntensity(v: number): void {
    this.a.intensity = clamp(v, 0, 1);
  }

  /** Called by the engine each frame with the live vehicle snapshot. */
  setState(s: VehicleAudioState): void {
    this.a.stateRef = s;
  }

  start(): void {
    if (this.a.ready) return;
    try {
      startAudioGraph(this.a);
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
    void loadSamples(this.a);
  }

  thump(strength: number): void {
    thump(this.a, strength);
  }

  /** Suspension/landing thud — deeper than a bump, scales with airtime. */
  thud(severity: number): void {
    thud(this.a, severity);
  }

  /** Countdown blip; the final "GO" is a brighter, longer tone. */
  beep(final = false): void {
    beep(this.a, final);
  }

  splash(): void {
    splash(this.a);
  }

  horn(): void {
    horn(this.a);
  }

  animalCall(kind: AnimalCall, pitch = 1): void {
    animalCall(this.a, kind, pitch);
  }

  gunshot(kind: GunSound): void {
    gunshot(this.a, kind);
  }

  /** Magazine out/in: two clicks with a slide in between. */
  reload(seconds = 1.5): void {
    reload(this.a, seconds);
  }

  /** Trigger pulled on an empty gun. */
  dryFire(): void {
    dryFire(this.a);
  }

  /** Quick tick when a bullet lands on an animal. */
  hitMarker(kill = false): void {
    hitMarker(this.a, kill);
  }

  /** Switching weapons: a short mechanical clack. */
  weaponSwap(): void {
    weaponSwap(this.a);
  }

  setTrainState(s: { gain: number; pan: number; rate: number } | null): void {
    setTrainState(this.a, s);
  }

  /** Two-tone steam whistle (detuned chord + breath), distance-attenuated. */
  trainWhistle(gain: number): void {
    trainWhistle(this.a, gain);
  }

  update(): void {
    updateVehicle(this.a);
  }

  toggle(): boolean {
    const a = this.a;
    a.muted = !a.muted;
    if (a.master && a.ctx) {
      a.master.gain.setTargetAtTime(a.muted ? 0 : 0.85, a.ctx.currentTime, 0.1);
    }
    return a.muted;
  }

  get isMuted(): boolean {
    return this.a.muted;
  }

  suspend(): void {
    const ctx = this.a.ctx;
    if (ctx && ctx.state === "running") void ctx.suspend();
  }

  resume(): void {
    const ctx = this.a.ctx;
    if (ctx && ctx.state === "suspended") void ctx.resume();
  }

  dispose(): void {
    const a = this.a;
    if (a.stepTimer) clearInterval(a.stepTimer);
    a.stepTimer = null;
    try {
      a.ambienceSrc?.stop();
    } catch {
      // already stopped
    }
    a.ambienceSrc = null;
    a.impacts = { light: [], wood: [], heavy: [] };
    try {
      void a.ctx?.close();
    } catch {
      // already closed
    }
    a.ctx = null;
    a.master = null;
    a.bgmGain = null;
    a.musicDuck = null;
    a.engineBus = null;
    a.sfxBus = null;
    a.ambienceBus = null;
    a.ready = false;
  }
}
