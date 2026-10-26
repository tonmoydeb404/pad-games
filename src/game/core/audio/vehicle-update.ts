import { clamp } from "../noise";
import { thump } from "./sfx-impact";
import type { AudioState } from "./types";

const MAX_SPEED_FALLBACK = 46.8;

const SURFACE_BRIGHT: Record<string, number> = {
  rock: 900,
  water: 280,
  mud: 330,
  ballast: 700,
};

/** Per-frame engine / tire / skid modulation from the live vehicle snapshot. */
export function updateVehicle(a: AudioState): void {
  const ctx = a.ctx;
  const s = a.stateRef;
  if (!a.ready || !ctx || ctx.state !== "running" || !s) return;
  if (a.footMode) {
    const t0 = ctx.currentTime;
    a.engGain?.gain.setTargetAtTime(0, t0, 0.12);
    a.subGain?.gain.setTargetAtTime(0, t0, 0.12);
    a.tireGain?.gain.setTargetAtTime(0, t0, 0.12);
    a.skidGain?.gain.setTargetAtTime(0, t0, 0.05);
    return;
  }
  const maxSpeed = s.maxSpeed ?? MAX_SPEED_FALLBACK;
  const base = 26 + s.rpm * 0.0165;
  const load = clamp(s.throttle * 0.7 + (Math.abs(s.speed) / maxSpeed) * 0.5, 0, 1.1);
  const now = ctx.currentTime;
  a.engOsc1?.frequency.setTargetAtTime(base, now, 0.06);
  a.engOsc2?.frequency.setTargetAtTime(base * 2.01, now, 0.06);
  a.subOsc?.frequency.setTargetAtTime(base * 0.5 + 18, now, 0.08);
  a.engFilter?.frequency.setTargetAtTime(420 + load * 1500, now, 0.1);
  a.engGain?.gain.setTargetAtTime(0.075 + load * 0.1, now, 0.1);
  a.subGain?.gain.setTargetAtTime(0.055 + load * 0.055, now, 0.12);
  const spd = Math.abs(s.speed);
  const surfBright = SURFACE_BRIGHT[s.surface] ?? 520;
  a.tireFilter?.frequency.setTargetAtTime(surfBright + spd * 40, now, 0.15);
  a.tireGain?.gain.setTargetAtTime(clamp(spd / maxSpeed, 0, 1) * 0.1, now, 0.15);
  // skid screech on handbrake or drift
  const skidding = (s.handbrake && spd > 2.0) || Math.abs(s.lateral) > 1.2;
  a.skidGain?.gain.setTargetAtTime(skidding ? 0.18 : 0, now, 0.08);
  if (s.bumpImpulse > 0.35) thump(a, s.bumpImpulse);
}
