/**
 * Rumble presets (carve / land / crash / pickup / ui). Haptics are strictly
 * optional: every call is feature-detected and try/caught, and visual/audio
 * feedback carries the same cues.
 */

interface FireOpts {
  duration: number;
  weak: number;
  strong: number;
}

type VibrationActuator = {
  playEffect: (type: string, opts: Record<string, number>) => Promise<string>;
};

function actuatorOf(pad: Gamepad | null): VibrationActuator | null {
  if (!pad) return null;
  const act = (pad as Gamepad & { vibrationActuator?: unknown })
    .vibrationActuator;
  if (
    act &&
    typeof (act as VibrationActuator).playEffect === "function"
  ) {
    return act as VibrationActuator;
  }
  return null;
}

export class Haptics {
  enabled = true;
  private carveTimer = 0;

  constructor(private getPad: () => Gamepad | null) {}

  private fire(opts: FireOpts): void {
    if (!this.enabled) return;
    const act = actuatorOf(this.getPad());
    if (!act) return;
    try {
      void act.playEffect("dual-rumble", {
        startDelay: 0,
        duration: Math.round(opts.duration),
        weakMagnitude: Math.min(1, opts.weak),
        strongMagnitude: Math.min(1, opts.strong),
      });
    } catch {
      // Unsupported pad/driver — silence is the correct fallback.
    }
  }

  /** Sustained low rumble while carving, scaled by speed. */
  update(
    dt: number,
    opts: { grounded: boolean; speed: number; storm: number },
  ): void {
    if (!this.enabled || !opts.grounded) {
      this.carveTimer = 0;
      return;
    }
    this.carveTimer -= dt;
    if (this.carveTimer > 0) return;
    const t = Math.min(1, opts.speed / 1400);
    if (t < 0.25) return;
    const mag = 0.08 + 0.3 * t + 0.15 * opts.storm;
    this.fire({ duration: 170, weak: mag * 0.7, strong: mag });
    this.carveTimer = 0.18;
  }

  land(quality: "clean" | "rough"): void {
    if (quality === "clean") {
      this.fire({ duration: 110, weak: 0.35, strong: 0.5 });
    } else {
      this.fire({ duration: 240, weak: 0.7, strong: 0.9 });
    }
  }

  crash(): void {
    this.fire({ duration: 420, weak: 1, strong: 1 });
  }

  pickup(): void {
    this.fire({ duration: 60, weak: 0.4, strong: 0 });
  }

  ui(kind: "move" | "confirm" | "back" = "move"): void {
    if (kind === "confirm") this.fire({ duration: 70, weak: 0.35, strong: 0.25 });
    else if (kind === "back") this.fire({ duration: 50, weak: 0.2, strong: 0 });
    else this.fire({ duration: 30, weak: 0.15, strong: 0 });
  }

  /** One-off probe used by the input tester page. */
  test(kind: "weak" | "strong" | "dual"): void {
    if (kind === "weak") this.fire({ duration: 300, weak: 1, strong: 0 });
    else if (kind === "strong") this.fire({ duration: 300, weak: 0, strong: 1 });
    else this.fire({ duration: 400, weak: 1, strong: 1 });
  }
}
