import type { Actor, ClipKey } from "./actor";

/** Crossfade an actor to one of its clips (no-op retime when it is already playing). */
export function play(a: Actor, key: ClipKey, fade = 0.22, timeScale = 1): void {
  const next = a.actions[key];
  if (!next || next === a.current) {
    if (next) next.timeScale = timeScale;
    return;
  }
  next.reset();
  next.timeScale = timeScale;
  next.setEffectiveWeight(1);
  next.fadeIn(fade);
  a.current?.fadeOut(fade);
  a.current = next;
  next.play();
}
