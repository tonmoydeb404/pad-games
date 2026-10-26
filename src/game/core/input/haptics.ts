import { clamp } from "../noise";

interface VibrationActuator {
  playEffect: (type: string, opts: Record<string, number>) => Promise<string>;
}

function actuatorOf(pad: Gamepad | null): VibrationActuator | null {
  if (!pad) return null;
  const act = (pad as Gamepad & { vibrationActuator?: unknown })
    .vibrationActuator;
  if (act && typeof (act as VibrationActuator).playEffect === "function") {
    return act as VibrationActuator;
  }
  return null;
}

/**
 * Haptic profile for striking an animal. The animal system asks for rumble in
 * proportion to the animal's mass (a fox ≈ 0.25, a horse ≈ 0.45), but the
 * always-on driving rumble already runs at ≈ 0.1–0.4, so those requests are
 * lost in it. Lift them above the driving level: even a rat is a distinct
 * thump, a heavy beast is a full-strength jolt.
 */
export function animalHitRumble(strength: number, ms: number): { strength: number; ms: number } {
  return { strength: clamp(0.5 + strength * 0.7, 0.5, 1), ms: Math.max(ms, 190) };
}

/** Gamepad rumble: one-shot impacts plus the sustained driving rumble. */
export class Haptics {
  /** When the current impact effect ends, and how strong it is. A new
   *  playEffect() REPLACES whatever is playing, so the sustained driving
   *  rumble must never run over a hit, and a weaker hit must not replace a
   *  stronger one that is still going. */
  private impactUntil = 0;
  private impactStrength = 0;
  private driveRumbleTimer = 0;

  /** One-shot impact rumble (collisions, hard landings). */
  rumble(pad: Gamepad | null, strength: number, ms = 220): void {
    const now = performance.now();
    const s = clamp(strength, 0, 1);
    if (now < this.impactUntil && s <= this.impactStrength * 1.05) return;
    this.impactUntil = now + ms;
    this.impactStrength = s;
    const act = actuatorOf(pad);
    if (!act) return;
    try {
      void act.playEffect("dual-rumble", {
        startDelay: 0,
        duration: ms,
        weakMagnitude: s * 0.9,
        strongMagnitude: s,
      });
    } catch {
      // unsupported pad/driver — silence is the correct fallback
    }
  }

  /** Sustained low rumble while driving, scaled by speed & roughness. */
  drive(
    getPad: () => Gamepad | null,
    dt: number,
    opts: { speed: number; maxSpeed: number; rough: number },
  ): void {
    this.driveRumbleTimer -= dt;
    if (this.driveRumbleTimer > 0) return;
    if (performance.now() < this.impactUntil) return; // don't cut a hit short
    const t = clamp(Math.abs(opts.speed) / opts.maxSpeed, 0, 1);
    if (t < 0.12) return;
    const mag = 0.06 + t * 0.28 + opts.rough * 0.12;
    this.driveRumbleTimer = 0.16;
    const act = actuatorOf(getPad());
    if (!act) return;
    try {
      void act.playEffect("dual-rumble", {
        startDelay: 0,
        duration: 150,
        weakMagnitude: mag * 0.6,
        strongMagnitude: mag,
      });
    } catch {
      // ignore
    }
  }
}
