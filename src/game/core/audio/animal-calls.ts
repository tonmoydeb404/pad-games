import type { AnimalCall } from "../../world/animals";
import { clamp } from "../noise";
import { canPlay, duck } from "./duck";
import { voice, type VoiceOpts } from "./voice";
import type { AudioState } from "./types";

/**
 * An animal's call. `pitch` scales every frequency (small animals high,
 * giants low — see RideInfo.call.pitch); each kind has its own contour:
 * a dog's two sharp barks, a horse's rising-then-falling whinny, a T-Rex's
 * rasping roar, a hadrosaur's hollow honk…
 */
export function animalCall(a: AudioState, kind: AnimalCall, pitch = 1): void {
  const ctx = a.ctx;
  if (!canPlay(a) || !ctx) return;
  const now = performance.now();
  if (now - a.lastCall < 350) return;
  a.lastCall = now;
  const t = ctx.currentTime + 0.01;
  const p = clamp(pitch, 0.4, 2);
  const v = (o: VoiceOpts, at = 0) => voice(a, t + at, o);
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
  duck(a, 0.6, 0.5);
}
