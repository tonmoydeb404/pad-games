/**
 * Jungle Jeep input: merges keyboard + gamepad + touch into one analog
 * snapshot per frame, plus a queue of edge-triggered actions.
 *
 * Gamepad mapping (standard layout) — driving:
 *   RT (7) / A (0)  throttle (analog)      LT (6)        brake · reverse
 *   Left stick X / dpad ← →         steer  B (1)        handbrake
 *   LB (4) · dpad ↑  cycle camera         dpad ↓        headlights
 *   Y (3)            enter / exit vehicle  X (2)         horn
 *   RB (5)           reset vehicle         Back (8)      mute · Start (9) pause
 *   Right stick      look / orbit camera
 *
 * On foot (GTA-style):
 *   Left stick       move (analog: tilt = walk → jog)   RT (7) / L3 (10)  sprint
 *   A (0)            jump                    X (2)   punch    B (1)  kick
 *   LB (4)           crouch (toggle)         R3 (11) dodge roll
 *   Y (3)            enter vehicle           Right stick  look
 *
 * With a gun out: RT fires (hold), LT aims, X reloads, dpad ↓ cycles weapons,
 * RT no longer sprints (L3 does). Keyboard: 1–5 pick a gun, 0 holsters,
 * Tab cycles, J fires, X aims, T / R reloads, mouse: left fires, right aims.
 *
 * Keyboard: WASD / arrows move · drive, Space handbrake · jump, Shift sprint,
 * J punch, K kick, Q dodge roll · special move while mounted, C crouch (camera while driving), F/E
 * enter·exit the vehicle, K/B horn, V undercam, H lights, R reset,
 * P/Esc pause, M mute. Mouse (on foot): click punch · right-click kick.
 */

import { clamp } from "./noise";

export interface JeepInputSnapshot {
  /** 0..1 analog */
  throttle: number;
  /** 0..1 analog */
  brake: number;
  /** -1..1, +1 = left (original game's convention) */
  steer: number;
  handbrake: boolean;
  /** On foot: analog strafe, -1 (left) .. +1 (right). */
  moveX: number;
  /** On foot: analog walk, -1 (back) .. +1 (forward). */
  moveY: number;
  /** On foot: Space (kb) / A (pad) held — the engine edge-detects the jump. */
  jump: boolean;
  /** On foot: Shift (kb) / RT·L3 (pad) held — sprint. */
  sprint: boolean;
  /** Shift / L3 only: sprint that never doubles as the fire trigger. */
  sprintHard: boolean;
  /** Trigger held: J (kb) / RT (pad). The engine adds the mouse. */
  fire: boolean;
  /** Aim held: X (kb) / LT (pad). The engine adds the mouse. */
  aim: boolean;
  /** right stick / look, already deadzoned, -1..1 */
  lookX: number;
  lookY: number;
  padConnected: boolean;
  padId: string;
}

export type JeepAction =
  | "camera"
  | "undercam"
  | "headlights"
  | "horn"
  | "enter"
  | "punch"
  | "kick"
  | "special"
  | "reload"
  | "weaponNext"
  | "weapon0"
  | "weapon1"
  | "weapon2"
  | "weapon3"
  | "weapon4"
  | "weapon5"
  | "roll"
  | "reset"
  | "pause"
  | "mute";

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

export class JeepInput {
  connected = false;
  padId = "";
  onConnectChange: ((connected: boolean, id: string) => void) | null = null;

  private keys = Object.create(null) as Record<string, boolean>;
  private actions: JeepAction[] = [];
  private touch = { gas: false, brake: false, steer: 0 };
  private prevButtons: boolean[] = [];
  /** When the current impact effect ends, and how strong it is. A new
   *  playEffect() REPLACES whatever is playing, so the sustained driving
   *  rumble must never run over a hit, and a weaker hit must not replace a
   *  stronger one that is still going. */
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
      case "v":
        this.actions.push("undercam");
        break;
      case "h":
        this.actions.push("headlights");
        break;
      case "k":
        this.actions.push("horn", "kick");
        break;
      case "b":
        this.actions.push("horn");
        break;
      case "j":
        this.actions.push("punch");
        break;
      case "t":
        this.actions.push("reload");
        break;
      case "tab":
        this.actions.push("weaponNext");
        break;
      case "0":
      case "1":
      case "2":
      case "3":
      case "4":
      case "5":
        this.actions.push(`weapon${k}` as JeepAction);
        break;
      case "q":
        this.actions.push("roll", "special");
        break;
      case "f":
      case "e":
        this.actions.push("enter");
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
    this.touch.gas = false;
    this.touch.brake = false;
    this.touch.steer = 0;
  };

  /** True only on the frame the button transitions to pressed. */
  private wasPressed(gp: Gamepad, index: number): boolean {
    const pressed =
      !!gp.buttons[index] && gp.buttons[index].value > BUTTON_PRESSED;
    const was = this.prevButtons[index] ?? false;
    this.prevButtons[index] = pressed;
    return pressed && !was;
  }

  private triggerValue(gp: Gamepad, index: number): number {
    const v = gp.buttons[index]?.value ?? 0;
    return v > TRIGGER_THRESHOLD ? v : 0;
  }

  /**
   * Sample the merged input state. Call exactly once per frame, then read
   * `consumeActions()`.
   */
  sample(): JeepInputSnapshot {
    const keys = this.keys;
    const gp = this.pollPad();
    this.setConnected(!!gp, gp?.id ?? "");

    let throttle = keys["w"] || keys["arrowup"] || this.touch.gas ? 1 : 0;
    let brake = keys["s"] || keys["arrowdown"] || this.touch.brake ? 1 : 0;
    let steer = 0;
    if (keys["a"] || keys["arrowleft"] || this.touch.steer < 0) steer += 1;
    if (keys["d"] || keys["arrowright"] || this.touch.steer > 0) steer -= 1;
    let handbrake = !!keys[" "];
    let jump = !!keys[" "];
    const sprint = !!keys["shift"];
    let moveX = 0;
    let moveY = 0;
    if (throttle) moveY += 1;
    if (brake) moveY -= 1;
    if (keys["d"] || keys["arrowright"] || this.touch.steer > 0) moveX += 1;
    if (keys["a"] || keys["arrowleft"] || this.touch.steer < 0) moveX -= 1;
    let padSprint = false;
    let padHard = false;
    let fire = !!keys["j"];
    let aim = !!keys["x"];
    let lookX = 0;
    let lookY = 0;

    if (gp) {
      const trigL = this.triggerValue(gp, 6);
      const trigR = this.triggerValue(gp, 7);
      const aHeld = (gp.buttons[0]?.value ?? 0) > BUTTON_PRESSED ? 1 : 0;
      throttle = Math.max(throttle, trigR, aHeld);
      brake = Math.max(brake, trigL);
      const lx = deadzone(gp.axes[0] ?? 0, STICK_DEADZONE);
      steer = clamp(steer - lx, -1, 1);
      if (gp.buttons[14]?.pressed) steer = clamp(steer + 1, -1, 1);
      if (gp.buttons[15]?.pressed) steer = clamp(steer - 1, -1, 1);
      const bHeld = !!gp.buttons[1]?.pressed;
      handbrake = handbrake || bHeld;
      jump = jump || aHeld === 1;
      // analog walk: radial deadzone on the full left stick keeps diagonals even
      // (dpad stays camera/lights — it must not crouch you mid-stride)
      const sx = gp.axes[0] ?? 0;
      const sy = -(gp.axes[1] ?? 0);
      const m = Math.hypot(sx, sy);
      if (m > STICK_DEADZONE) {
        const k = (Math.min(1, m) - STICK_DEADZONE) / (1 - STICK_DEADZONE) / m;
        moveX = clamp(moveX + sx * k, -1, 1);
        moveY = clamp(moveY + sy * k, -1, 1);
      }
      padHard = !!gp.buttons[10]?.pressed;
      padSprint = trigR > 0.5 || padHard;
      fire = fire || trigR > 0.5;
      aim = aim || trigL > 0.5;
      lookX = deadzone(gp.axes[2] ?? 0, LOOK_DEADZONE);
      lookY = deadzone(gp.axes[3] ?? 0, LOOK_DEADZONE);

      if (this.wasPressed(gp, 4) || (gp.buttons[12]?.pressed && !this.prevButtons[12]))
        this.actions.push("camera");
      if (gp.buttons[13]?.pressed && !this.prevButtons[13])
        this.actions.push("headlights");
      if (this.wasPressed(gp, 3)) this.actions.push("enter");
      if (this.wasPressed(gp, 2)) this.actions.push("horn", "punch", "reload");
      if (this.wasPressed(gp, 1)) this.actions.push("kick", "special");
      if (this.wasPressed(gp, 11)) this.actions.push("roll", "special");
      if (this.wasPressed(gp, 5)) this.actions.push("reset");
      if (this.wasPressed(gp, 8)) this.actions.push("mute");
      if (this.wasPressed(gp, 9)) this.actions.push("pause");
      // snapshot of every button for next-frame edge detection
      for (let i = 0; i < gp.buttons.length; i++) {
        this.prevButtons[i] = gp.buttons[i].value > BUTTON_PRESSED;
      }
    }

    return {
      throttle,
      brake,
      steer,
      handbrake,
      moveX,
      moveY,
      jump,
      sprint: sprint || padSprint,
      sprintHard: sprint || padHard,
      fire,
      aim,
      lookX,
      lookY,
      padConnected: !!gp,
      padId: this.padId,
    };
  }

  /** Edge-triggered actions accumulated since the last call. */
  consumeActions(): JeepAction[] {
    const out = this.actions;
    this.actions = [];
    return out;
  }

  /** Queue an action programmatically (HUD touch buttons). */
  pushAction(action: JeepAction): void {
    this.actions.push(action);
  }

  /** One-shot impact rumble (collisions, hard landings). */
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

  /** Sustained low rumble while driving, scaled by speed & roughness. */
  update(dt: number, opts: { speed: number; maxSpeed: number; rough: number }): void {
    this.driveRumbleTimer -= dt;
    if (this.driveRumbleTimer > 0) return;
    if (performance.now() < this.impactUntil) return; // don't cut a hit short
    const t = clamp(Math.abs(opts.speed) / opts.maxSpeed, 0, 1);
    if (t < 0.12) return;
    const mag = 0.06 + t * 0.28 + opts.rough * 0.12;
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

  /** Bind a touch/mouse button (engine-created HUD element). */
  bindTouchButton(
    el: HTMLElement,
    down: () => void,
    up?: () => void,
  ): void {
    const d = (e: Event) => {
      e.preventDefault();
      down();
    };
    const u = (e: Event) => {
      e.preventDefault();
      up?.();
    };
    el.addEventListener("touchstart", d, { passive: false });
    el.addEventListener("touchend", u, { passive: false });
    el.addEventListener("touchcancel", u, { passive: false });
    el.addEventListener("mousedown", d);
    el.addEventListener("mouseup", u);
    el.addEventListener("mouseleave", u);
  }

  setTouchSteer(v: -1 | 0 | 1): void {
    this.touch.steer = v;
  }
  setTouchPedal(which: "gas" | "brake", on: boolean): void {
    this.touch[which] = on;
  }

  get touchActive(): boolean {
    return "ontouchstart" in window;
  }
}

const PREVENT = new Set([
  "Tab",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  " ",
  "Space",
]);
