import { canPlay, duck } from "./duck";
import { voice, type VoiceOpts } from "./voice";
import type { AudioState } from "./types";

export type GunSound = "pistol" | "smg" | "rifle" | "shotgun" | "sniper";

/**
 * One shot, voiced per weapon (see GunDef.sound): a noise crack for the
 * muzzle blast under a falling-pitch body — pistol pop, SMG rip, rifle
 * crack, shotgun boom, sniper slam.
 */
export function gunshot(a: AudioState, kind: GunSound): void {
  const ctx = a.ctx;
  if (!canPlay(a) || !ctx) return;
  const now = performance.now();
  if (now - a.lastShot < 40) return;
  a.lastShot = now;
  const t = ctx.currentTime + 0.005;
  const jitter = 0.94 + Math.random() * 0.12;
  const v = (o: VoiceOpts) => voice(a, t, o);
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
  if (kind === "shotgun" || kind === "sniper") duck(a, 0.6, 0.45);
}

/** Magazine out/in: two clicks with a slide in between. */
export function reload(a: AudioState, seconds = 1.5): void {
  const ctx = a.ctx;
  if (!canPlay(a) || !ctx) return;
  const t = ctx.currentTime;
  const click = (at: number, hz: number) =>
    voice(a, t + at, { type: "square", f: [[0, hz], [0.03, hz * 0.6]], g: [[0.002, 0.3], [0.04, 0]], bp: [2600, 1.2], noise: 0.8, pitch: 1, vol: 0.35 });
  click(0.12, 900);
  click(seconds * 0.55, 700);
  click(Math.max(seconds - 0.12, 0.3), 1100);
}

/** Trigger pulled on an empty gun. */
export function dryFire(a: AudioState): void {
  const ctx = a.ctx;
  if (!canPlay(a) || !ctx) return;
  voice(a, ctx.currentTime, { type: "square", f: [[0, 600], [0.025, 400]], g: [[0.002, 0.25], [0.03, 0]], bp: [2800, 1.4], pitch: 1, vol: 0.3 });
}

/** Quick tick when a bullet lands on an animal. */
export function hitMarker(a: AudioState, kill = false): void {
  const ctx = a.ctx;
  if (!canPlay(a) || !ctx) return;
  const t = ctx.currentTime;
  voice(a, t, { type: "triangle", f: [[0, kill ? 1500 : 1100], [0.05, kill ? 1100 : 800]], g: [[0.002, 0.3], [0.07, 0]], pitch: 1, vol: 0.35 });
  if (kill) voice(a, t + 0.07, { type: "triangle", f: [[0, 1800], [0.06, 1400]], g: [[0.002, 0.3], [0.08, 0]], pitch: 1, vol: 0.35 });
}

/** Switching weapons: a short mechanical clack. */
export function weaponSwap(a: AudioState): void {
  const ctx = a.ctx;
  if (!canPlay(a) || !ctx) return;
  voice(a, ctx.currentTime, { type: "square", f: [[0, 500], [0.04, 260]], g: [[0.003, 0.3], [0.06, 0]], bp: [1800, 1], noise: 0.7, pitch: 1, vol: 0.3 });
}
