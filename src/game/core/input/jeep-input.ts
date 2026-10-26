import { applyGamepad, pollPad, type PadChannels } from "./gamepad";
import { Haptics } from "./haptics";
import { keyActions, PREVENT_KEYS } from "./keyboard";
import type { JeepAction, JeepInputSnapshot } from "./types";

export class JeepInput {
  connected = false;
  padId = "";
  onConnectChange: ((connected: boolean, id: string) => void) | null = null;

  private keys = Object.create(null) as Record<string, boolean>;
  private actions: JeepAction[] = [];
  private touch = { gas: false, brake: false, steer: 0 };
  private prevButtons: boolean[] = [];
  private haptics = new Haptics();

  private connectedCb = (e: Event) => {
    const gp = (e as GamepadEvent).gamepad;
    this.setConnected(true, gp.id);
  };
  private disconnectedCb = () => {
    this.prevButtons = [];
    const still = pollPad() !== null;
    this.setConnected(still, still ? (pollPad()?.id ?? "") : "");
  };

  private setConnected(c: boolean, id: string): void {
    const changed = c !== this.connected || id !== this.padId;
    this.connected = c;
    this.padId = id;
    if (changed) this.onConnectChange?.(c, id);
  }

  attach(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clearKeys);
    window.addEventListener("gamepadconnected", this.connectedCb);
    window.addEventListener("gamepaddisconnected", this.disconnectedCb);
    const gp = pollPad();
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
    if (PREVENT_KEYS.has(e.key)) e.preventDefault();
    const k = e.key.toLowerCase();
    if (this.keys[k]) return;
    this.keys[k] = true;
    this.actions.push(...keyActions(k));
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

  /**
   * Sample the merged input state. Call exactly once per frame, then read
   * `consumeActions()`.
   */
  sample(): JeepInputSnapshot {
    const keys = this.keys;
    const gp = pollPad();
    this.setConnected(!!gp, gp?.id ?? "");

    const throttle = keys["w"] || keys["arrowup"] || this.touch.gas ? 1 : 0;
    const brake = keys["s"] || keys["arrowdown"] || this.touch.brake ? 1 : 0;
    let steer = 0;
    if (keys["a"] || keys["arrowleft"] || this.touch.steer < 0) steer += 1;
    if (keys["d"] || keys["arrowright"] || this.touch.steer > 0) steer -= 1;
    let moveX = 0;
    let moveY = 0;
    if (throttle) moveY += 1;
    if (brake) moveY -= 1;
    if (keys["d"] || keys["arrowright"] || this.touch.steer > 0) moveX += 1;
    if (keys["a"] || keys["arrowleft"] || this.touch.steer < 0) moveX -= 1;
    const sprint = !!keys["shift"];
    const c: PadChannels = {
      throttle,
      brake,
      steer,
      handbrake: !!keys[" "],
      jump: !!keys[" "],
      moveX,
      moveY,
      padSprint: false,
      padHard: false,
      fire: !!keys["j"],
      aim: !!keys["x"],
      lookX: 0,
      lookY: 0,
    };

    if (gp) applyGamepad(gp, c, this.prevButtons, this.actions);

    return {
      throttle: c.throttle,
      brake: c.brake,
      steer: c.steer,
      handbrake: c.handbrake,
      moveX: c.moveX,
      moveY: c.moveY,
      jump: c.jump,
      sprint: sprint || c.padSprint,
      sprintHard: sprint || c.padHard,
      fire: c.fire,
      aim: c.aim,
      lookX: c.lookX,
      lookY: c.lookY,
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
    this.haptics.rumble(pollPad(), strength, ms);
  }

  /** Sustained low rumble while driving, scaled by speed & roughness. */
  update(dt: number, opts: { speed: number; maxSpeed: number; rough: number }): void {
    this.haptics.drive(pollPad, dt, opts);
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
