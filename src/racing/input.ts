/**
 * Racing input: merges keyboard + gamepad into one analog snapshot per frame
 * plus a queue of edge-triggered actions (jeep conventions, racing actions).
 *
 * Gamepad mapping (standard layout):
 *   RT (7) / A (0)  throttle (analog)      LT (6)        brake · reverse
 *   Left stick X / dpad ← →         steer  B (1)         handbrake
 *   Y (3) · dpad ↑   cycle camera          X (2)         horn
 *   RB (5)           reset car              Back (8)      mute
 *   Start (9)        pause                  Right stick   look / orbit
 *
 * Keyboard: WASD / arrows drive, Space handbrake, C cameras, K/B horn,
 * R reset, P/Esc pause, M mute.
 */
import { clamp } from "./util";

export interface RacingInputSnapshot {
  /** 0..1 analog */
  throttle: number;
  /** 0..1 analog */
  brake: number;
  /** -1..1, +1 = left */
  steer: number;
  handbrake: boolean;
  /** Horn held (sounds only while pressed). */
  horn: boolean;
  /** right stick / look, deadzoned, -1..1 */
  lookX: number;
  lookY: number;
  padConnected: boolean;
  padId: string;
}

export type RacingAction = "camera" | "reset" | "pause" | "mute";

const STICK_DEADZONE = 0.18;
const LOOK_DEADZONE = 0.22;
const TRIGGER_THRESHOLD = 0.12;
const BUTTON_PRESSED = 0.5;

function deadzone(v: number, dz: number): number {
  const sign = Math.sign(v);
  const mag = Math.abs(v);
  if (mag <= dz) return 0;
  return sign * ((mag - dz) / (1 - dz));
}

interface VibrationActuator {
  playEffect: (type: string, opts: Record<string, number>) => Promise<string>;
}

function actuatorOf(pad: Gamepad | null): VibrationActuator | null {
  if (!pad) return null;
  const act = (pad as Gamepad & { vibrationActuator?: unknown }).vibrationActuator;
  if (act && typeof (act as VibrationActuator).playEffect === "function") {
    return act as VibrationActuator;
  }
  return null;
}

export class RacingInput {
  connected = false;
  padId = "";
  onConnectChange: ((connected: boolean, id: string) => void) | null = null;

  private keys = Object.create(null) as Record<string, boolean>;
  private actions: RacingAction[] = [];
  private prevButtons: boolean[] = [];
  private impactUntil = 0;
  private impactStrength = 0;
  private driveRumbleTimer = 0;

  private connectedCb = (e: Event) => {
    const gp = (e as GamepadEvent).gamepad;
    this.setConnected(true, gp.id);
  };
  private disconnectedCb = () => {
    this.prevButtons = [];
    const still = this.pollPad() !== null;
    this.setConnected(still, still ? (this.pollPad()?.id ?? "") : "");
  };

  private setConnected(c: boolean, id: string): void {
    const changed = c !== this.connected || id !== this.padId;
    this.connected = c;
    this.padId = id;
    if (changed) this.onConnectChange?.(c, id);
  }

  private pollPad(): Gamepad | null {
    if (typeof navigator.getGamepads !== "function") return null;
    for (const gp of navigator.getGamepads()) {
      if (gp && gp.connected) return gp;
    }
    return null;
  }

  attach(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clearKeys);
    window.addEventListener("gamepadconnected", this.connectedCb);
    window.addEventListener("gamepaddisconnected", this.disconnectedCb);
    const gp = this.pollPad();
    if (gp) this.setConnected(true, gp.id);
  }

  detach(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clearKeys);
    window.removeEventListener("gamepadconnected", this.connectedCb);
    window.removeEventListener("gamepaddisconnected", this.disconnectedCb);
    this.clearKeys();
    this.setConnected(false, "");
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (PREVENT.has(e.key)) e.preventDefault();
    const k = e.key.toLowerCase();
    if (this.keys[k]) return;
    this.keys[k] = true;
    switch (k) {
      case "c":
        this.actions.push("camera");
        break;
      case "r":
        this.actions.push("reset");
        break;
      case "m":
        this.actions.push("mute");
        break;
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys[e.key.toLowerCase()] = false;
  };

  private clearKeys = (): void => {
    for (const k in this.keys) this.keys[k] = false;
  };

  /** True only on the frame the button transitions to pressed. */
  private wasPressed(gp: Gamepad, index: number): boolean {
    const pressed = !!gp.buttons[index] && gp.buttons[index].value > BUTTON_PRESSED;
    const was = this.prevButtons[index] ?? false;
    this.prevButtons[index] = pressed;
    return pressed && !was;
  }

  private triggerValue(gp: Gamepad, index: number): number {
    const v = gp.buttons[index]?.value ?? 0;
    return v > TRIGGER_THRESHOLD ? v : 0;
  }

  /** Sample the merged input state; follow with consumeActions(). */
  sample(): RacingInputSnapshot {
    const keys = this.keys;
    const gp = this.pollPad();
    this.setConnected(!!gp, gp?.id ?? "");

    let throttle = keys["w"] || keys["arrowup"] ? 1 : 0;
    let brake = keys["s"] || keys["arrowdown"] ? 1 : 0;
    let steer = 0;
    if (keys["a"] || keys["arrowleft"]) steer += 1;
    if (keys["d"] || keys["arrowright"]) steer -= 1;
    let handbrake = !!keys[" "];
    let horn = !!(keys["k"] || keys["b"]);
    let lookX = 0;
    let lookY = 0;

    if (gp) {
      const trigR = this.triggerValue(gp, 7);
      const aHeld = (gp.buttons[0]?.value ?? 0) > BUTTON_PRESSED ? 1 : 0;
      throttle = Math.max(throttle, trigR, aHeld);
      brake = Math.max(brake, this.triggerValue(gp, 6));
      const lx = deadzone(gp.axes[0] ?? 0, STICK_DEADZONE);
      steer = clamp(steer - lx, -1, 1);
      if (gp.buttons[14]?.pressed) steer = clamp(steer + 1, -1, 1);
      if (gp.buttons[15]?.pressed) steer = clamp(steer - 1, -1, 1);
      handbrake = handbrake || !!gp.buttons[1]?.pressed;
      horn = horn || !!gp.buttons[2]?.pressed;
      lookX = deadzone(gp.axes[2] ?? 0, LOOK_DEADZONE);
      lookY = deadzone(gp.axes[3] ?? 0, LOOK_DEADZONE);

      if (this.wasPressed(gp, 3) || (gp.buttons[12]?.pressed && !this.prevButtons[12]))
        this.actions.push("camera");
      if (this.wasPressed(gp, 5)) this.actions.push("reset");
      if (this.wasPressed(gp, 8)) this.actions.push("mute");
      if (this.wasPressed(gp, 9)) this.actions.push("pause");
      for (let i = 0; i < gp.buttons.length; i++) {
        this.prevButtons[i] = gp.buttons[i].value > BUTTON_PRESSED;
      }
    }

    return {
      throttle,
      brake,
      steer: clamp(steer, -1, 1),
      handbrake,
      horn,
      lookX,
      lookY,
      padConnected: !!gp,
      padId: this.padId,
    };
  }

  /** Edge-triggered actions accumulated since the last call. */
  consumeActions(): RacingAction[] {
    const out = this.actions;
    this.actions = [];
    return out;
  }

  /** One-shot impact rumble (collisions, hard landings, boost pads). */
  rumble(strength: number, ms = 220): void {
    const now = performance.now();
    const s = clamp(strength, 0, 1);
    if (now < this.impactUntil && s <= this.impactStrength * 1.05) return;
    this.impactUntil = now + ms;
    this.impactStrength = s;
    const act = actuatorOf(this.pollPad());
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

  /** Sustained low rumble while driving, scaled by speed. */
  update(dt: number, opts: { speed: number; maxSpeed: number; rough: number }): void {
    this.driveRumbleTimer -= dt;
    if (this.driveRumbleTimer > 0) return;
    if (performance.now() < this.impactUntil) return;
    const t = clamp(Math.abs(opts.speed) / opts.maxSpeed, 0, 1);
    if (t < 0.12) return;
    const mag = 0.05 + t * 0.24 + opts.rough * 0.12;
    this.driveRumbleTimer = 0.16;
    const act = actuatorOf(this.pollPad());
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

const PREVENT = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Space"]);
