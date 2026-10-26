import { startBgm } from "./bgm";
import { buildAmbience } from "./graph-ambience";
import { buildEngine } from "./graph-engine";
import { buildTrain } from "./graph-train";
import { scheduleBird } from "./sfx-ambient";
import type { AudioState } from "./types";

/** Build the whole audio graph (context, buses, layers) and start the music. */
export function startAudioGraph(a: AudioState): void {
  if (a.ready) return;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    a.ctx = new Ctor();
  } catch {
    return;
  }
  const ctx = a.ctx;
  a.master = ctx.createGain();
  a.master.gain.value = 0;
  a.master.connect(ctx.destination);

  // --- buses (audio-design): engine / sfx / music(+duck) / ambience ---
  a.engineBus = ctx.createGain();
  a.engineBus.gain.value = 1;
  a.engineBus.connect(a.master);
  a.sfxBus = ctx.createGain();
  a.sfxBus.gain.value = 1;
  a.sfxBus.connect(a.master);

  a.bgmGain = ctx.createGain();
  a.bgmGain.gain.value = 0.32;
  a.musicDuck = ctx.createGain();
  a.musicDuck.gain.value = 1;
  a.bgmGain.connect(a.musicDuck);
  a.musicDuck.connect(a.master);

  buildEngine(a, ctx, a.engineBus);
  buildAmbience(a, ctx, a.master);
  buildTrain(a, ctx, a.sfxBus);

  a.ready = true;
  a.master.gain.linearRampToValueAtTime(a.muted ? 0 : 0.85, ctx.currentTime + 1.6);
  scheduleBird(a);
  startBgm(a);
}
