import { clamp } from "../noise";
import type { JeepAction } from "./types";

const STICK_DEADZONE = 0.18;
const LOOK_DEADZONE = 0.22;
const TRIGGER_THRESHOLD = 0.12;
const BUTTON_PRESSED = 0.5;

export function deadzone(v: number, dz: number): number {
  const sign = Math.sign(v);
  const mag = Math.abs(v);
  if (mag <= dz) return 0;
  return sign * ((mag - dz) / (1 - dz));
}

/** First connected pad, or null (also when the Gamepad API is missing). */
export function pollPad(): Gamepad | null {
  if (typeof navigator.getGamepads !== "function") return null;
  for (const gp of navigator.getGamepads()) {
    if (gp && gp.connected) return gp;
  }
  return null;
}

/** True only on the frame the button transitions to pressed. */
function wasPressed(gp: Gamepad, index: number, prev: boolean[]): boolean {
  const pressed = !!gp.buttons[index] && gp.buttons[index].value > BUTTON_PRESSED;
  const was = prev[index] ?? false;
  prev[index] = pressed;
  return pressed && !was;
}

function triggerValue(gp: Gamepad, index: number): number {
  const v = gp.buttons[index]?.value ?? 0;
  return v > TRIGGER_THRESHOLD ? v : 0;
}

/** The analog channels keyboard/touch already filled in; the pad merges in. */
export interface PadChannels {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  jump: boolean;
  moveX: number;
  moveY: number;
  padSprint: boolean;
  padHard: boolean;
  fire: boolean;
  aim: boolean;
  lookX: number;
  lookY: number;
}

/** Merge the pad into `c` and queue its edge-triggered actions. */
export function applyGamepad(
  gp: Gamepad,
  c: PadChannels,
  prev: boolean[],
  actions: JeepAction[],
): void {
  const trigL = triggerValue(gp, 6);
  const trigR = triggerValue(gp, 7);
  const aHeld = (gp.buttons[0]?.value ?? 0) > BUTTON_PRESSED ? 1 : 0;
  c.throttle = Math.max(c.throttle, trigR, aHeld);
  c.brake = Math.max(c.brake, trigL);
  const lx = deadzone(gp.axes[0] ?? 0, STICK_DEADZONE);
  c.steer = clamp(c.steer - lx, -1, 1);
  if (gp.buttons[14]?.pressed) c.steer = clamp(c.steer + 1, -1, 1);
  if (gp.buttons[15]?.pressed) c.steer = clamp(c.steer - 1, -1, 1);
  const bHeld = !!gp.buttons[1]?.pressed;
  c.handbrake = c.handbrake || bHeld;
  c.jump = c.jump || aHeld === 1;
  // analog walk: radial deadzone on the full left stick keeps diagonals even
  // (dpad stays camera/lights — it must not crouch you mid-stride)
  const sx = gp.axes[0] ?? 0;
  const sy = -(gp.axes[1] ?? 0);
  const m = Math.hypot(sx, sy);
  if (m > STICK_DEADZONE) {
    const k = (Math.min(1, m) - STICK_DEADZONE) / (1 - STICK_DEADZONE) / m;
    c.moveX = clamp(c.moveX + sx * k, -1, 1);
    c.moveY = clamp(c.moveY + sy * k, -1, 1);
  }
  c.padHard = !!gp.buttons[10]?.pressed;
  c.padSprint = trigR > 0.5 || c.padHard;
  c.fire = c.fire || trigR > 0.5;
  c.aim = c.aim || trigL > 0.5;
  c.lookX = deadzone(gp.axes[2] ?? 0, LOOK_DEADZONE);
  c.lookY = deadzone(gp.axes[3] ?? 0, LOOK_DEADZONE);

  if (wasPressed(gp, 4, prev) || (gp.buttons[12]?.pressed && !prev[12]))
    actions.push("camera");
  if (gp.buttons[13]?.pressed && !prev[13]) actions.push("headlights");
  if (wasPressed(gp, 3, prev)) actions.push("enter");
  if (wasPressed(gp, 2, prev)) actions.push("horn", "punch", "reload");
  if (wasPressed(gp, 1, prev)) actions.push("kick", "special");
  if (wasPressed(gp, 11, prev)) actions.push("roll", "special");
  if (wasPressed(gp, 5, prev)) actions.push("reset");
  if (wasPressed(gp, 8, prev)) actions.push("inventory");
  if (wasPressed(gp, 9, prev)) actions.push("pause");
  // snapshot of every button for next-frame edge detection
  for (let i = 0; i < gp.buttons.length; i++) {
    prev[i] = gp.buttons[i].value > BUTTON_PRESSED;
  }
}
