import type { AudioState } from "./types";

/** Where one-shots go: the sfx bus, falling back to master. */
export function sfxOut(a: AudioState): GainNode | null {
  return a.sfxBus ?? a.master;
}

/** True when one-shots may play (graph built, context alive, not muted). */
export function canPlay(a: AudioState): boolean {
  return a.ready && !!a.ctx && !!a.master && !a.muted;
}

/** Briefly duck the music bus (sidechain-style) under big one-shots. */
export function duck(a: AudioState, level = 0.45, recover = 0.4): void {
  const ctx = a.ctx;
  const d = a.musicDuck;
  if (!ctx || !d) return;
  const now = performance.now();
  if (now - a.lastDuck < 90) return;
  a.lastDuck = now;
  const t = ctx.currentTime;
  d.gain.cancelScheduledValues(t);
  d.gain.setValueAtTime(d.gain.value, t);
  d.gain.linearRampToValueAtTime(level, t + 0.03);
  d.gain.setValueAtTime(level, t + 0.12);
  d.gain.linearRampToValueAtTime(1, t + 0.12 + recover);
}
