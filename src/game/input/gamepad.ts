/**
 * Gamepad API wrapper: connection tracking, polling, deadzones and edge
 * detection. Browsers only expose a pad after the first button press, so the
 * UI always offers a keyboard path too.
 */

export interface PadInfo {
  index: number;
  id: string;
  mapping: string;
}

interface PadPrev {
  buttons: boolean[];
}

const STICK_DEADZONE = 0.22;
const TRIGGER_THRESHOLD = 0.15;
const BUTTON_PRESSED = 0.5;

function applyDeadzone(v: number): number {
  const sign = Math.sign(v);
  const mag = Math.abs(v);
  if (mag <= STICK_DEADZONE) return 0;
  return sign * ((mag - STICK_DEADZONE) / (1 - STICK_DEADZONE));
}

export class GamepadManager {
  connected = false;
  padId = "";
  onConnect: ((info: PadInfo) => void) | null = null;
  onDisconnect: (() => void) | null = null;

  private prevs = new Map<number, PadPrev>();

  private connectedCb = (e: Event) => {
    const gp = (e as GamepadEvent).gamepad;
    this.connected = true;
    this.padId = gp.id;
    this.onConnect?.({ index: gp.index, id: gp.id, mapping: gp.mapping });
  };

  private disconnectedCb = (e: Event) => {
    const gp = (e as GamepadEvent).gamepad;
    this.prevs.delete(gp.index);
    const any = this.pollPad() !== null;
    this.connected = any;
    if (!any) this.padId = "";
    this.onDisconnect?.();
  };

  attach(): void {
    window.addEventListener("gamepadconnected", this.connectedCb);
    window.addEventListener("gamepaddisconnected", this.disconnectedCb);
    // Pick up already-connected pads (page was reloaded while holding pad).
    const gp = this.pollPad();
    if (gp) {
      this.connected = true;
      this.padId = gp.id;
    }
  }

  detach(): void {
    window.removeEventListener("gamepadconnected", this.connectedCb);
    window.removeEventListener("gamepaddisconnected", this.disconnectedCb);
    this.prevs.clear();
    this.connected = false;
    this.padId = "";
  }

  private pollPad(): Gamepad | null {
    if (typeof navigator.getGamepads !== "function") return null;
    const pads = navigator.getGamepads();
    for (const gp of pads) {
      if (gp && gp.connected) return gp;
    }
    return null;
  }

  getPad(): Gamepad | null {
    return this.pollPad();
  }

  /** List all connected pads (input tester page). */
  listPads(): Gamepad[] {
    if (typeof navigator.getGamepads !== "function") return [];
    return [...navigator.getGamepads()].filter(
      (gp): gp is Gamepad => gp !== null && gp.connected,
    );
  }

  /**
   * True only on the frame a button transitions to pressed.
   * `wasPressed` must be called exactly once per button per frame.
   */
  wasPressed(gp: Gamepad, index: number): boolean {
    const btn = gp.buttons[index];
    const pressed = !!btn && btn.value > BUTTON_PRESSED;
    let prev = this.prevs.get(gp.index);
    if (!prev) {
      prev = { buttons: [] };
      this.prevs.set(gp.index, prev);
    }
    const was = prev.buttons[index] ?? false;
    prev.buttons[index] = pressed;
    return pressed && !was;
  }

  /** Left stick X with deadzone applied. */
  stickX(gp: Gamepad): number {
    return applyDeadzone(gp.axes[0] ?? 0);
  }

  /** Left stick Y with deadzone applied (down is positive). */
  stickY(gp: Gamepad): number {
    return applyDeadzone(gp.axes[1] ?? 0);
  }

  /** Analog triggers: LT and RT in [0, 1]. */
  triggers(gp: Gamepad): { left: number; right: number } {
    const left = gp.buttons[6]?.value ?? gp.axes[6] ?? 0;
    const right = gp.buttons[7]?.value ?? gp.axes[7] ?? 0;
    return {
      left: left > TRIGGER_THRESHOLD ? left : 0,
      right: right > TRIGGER_THRESHOLD ? right : 0,
    };
  }
}
