/**
 * InputManager: merges keyboard + gamepad into one ActionSnapshot per frame,
 * with edge detection and menu navigation events.
 *
 * Gamepad mapping (standard layout):
 *   A (0)        hold to charge jump / grab in air / confirm
 *   X (2), RB(5) boost
 *   LB (4)       spin ccw
 *   LX (axis 0)  spin, analog
 *   LT/RT        spin ccw / cw (analog)
 *   Start (9)    pause          B (1) back          D-pad + stick: menus
 *
 * Keyboard fallback:
 *   Space / W    jump & confirm       Shift   boost
 *   A/D, ←/→     spin                 S/↓     fast-fall
 *   Esc / P      pause & back         Enter   confirm
 */

import { Emitter } from "../core/events";
import type { MenuAction } from "../core/types";
import type { ActionSnapshot } from "./actions";
import { neutralSnapshot } from "./actions";
import { GamepadManager } from "./gamepad";
import { KeyboardSource } from "./keyboard";

const KEY_JUMP = ["Space", "KeyW"];
const KEY_BOOST = ["ShiftLeft", "ShiftRight"];
const KEY_DOWN = ["KeyS", "ArrowDown"];
const KEY_PAUSE = ["Escape", "KeyP"];
const KEY_SPIN_CCW = ["ArrowLeft", "KeyA"];
const KEY_SPIN_CW = ["ArrowRight", "KeyD"];
const KEY_CONFIRM = ["Enter", "Space"];
const KEY_BACK = ["Escape"];

const NAV_FIRST_REPEAT_MS = 320;
const NAV_REPEAT_MS = 140;

type NavDir = "up" | "down" | "left" | "right";

export class InputManager {
  readonly keyboard = new KeyboardSource();
  readonly pads = new GamepadManager();
  /** Fresh menu actions — React menus subscribe to this. */
  readonly menuEvents = new Emitter<{ action: MenuAction }>();

  private prevJump = false;
  private prevPause = false;
  private prevConfirm = false;
  private prevBack = false;
  private prevNav: Record<NavDir, boolean> = {
    up: false,
    down: false,
    left: false,
    right: false,
  };
  private navCooldown: Record<NavDir, number> = {
    up: 0,
    down: 0,
    left: 0,
    right: 0,
  };
  private prevPadButtons: boolean[] = [];
  private anySignal = false;

  attach(): void {
    this.keyboard.attach();
    this.pads.attach();
  }

  detach(): void {
    this.keyboard.detach();
    this.pads.detach();
  }

  private fire(action: MenuAction): void {
    this.anySignal = true;
    this.menuEvents.emit("action", action);
  }

  update(dtMs: number): ActionSnapshot {
    const snap = neutralSnapshot();
    const kb = this.keyboard;
    const gp = this.pads.getPad();

    // ---------- held state ----------
    // Keys are polled once per step, so a quick tap (down+up between two
    // polls) would vanish. Fresh presses count as held for this step; the
    // key-up is then seen as a release on the next one.
    const fresh = new Set(kb.consumePressed());
    const isHeld = (codes: string[]) =>
      codes.some((c) => kb.isDown(c) || fresh.has(c));
    let jumpHeld = isHeld(KEY_JUMP);
    let boostHeld = KEY_BOOST.some((c) => kb.isDown(c));
    const downHeld = KEY_DOWN.some((c) => kb.isDown(c));
    let pauseHeld = isHeld(KEY_PAUSE);
    let confirmHeld = isHeld(KEY_CONFIRM);
    let backHeld = isHeld(KEY_BACK);

    const nav: Record<NavDir, boolean> = {
      up: kb.isDown("ArrowUp"),
      down: downHeld,
      left: KEY_SPIN_CCW.some((c) => kb.isDown(c)),
      right: KEY_SPIN_CW.some((c) => kb.isDown(c)),
    };

    let spin = 0;
    if (KEY_SPIN_CW.some((c) => kb.isDown(c))) spin += 1;
    if (KEY_SPIN_CCW.some((c) => kb.isDown(c))) spin -= 1;

    // ---------- gamepad ----------
    let padAnyEdge = false;
    if (gp) {
      const padButtons = gp.buttons.map((b) => b.pressed);
      for (let i = 0; i < padButtons.length; i++) {
        if (padButtons[i] && !this.prevPadButtons[i]) padAnyEdge = true;
      }
      this.prevPadButtons = padButtons;
      if (padAnyEdge) this.anySignal = true;

      jumpHeld = jumpHeld || padButtons[0];
      boostHeld = boostHeld || padButtons[5] || padButtons[2];
      pauseHeld = pauseHeld || padButtons[9];
      confirmHeld = confirmHeld || padButtons[0];
      backHeld = backHeld || padButtons[1];

      const lx = this.pads.stickX(gp);
      const ly = this.pads.stickY(gp);
      spin += lx;
      const trig = this.pads.triggers(gp);
      spin += trig.right - trig.left;
      if (padButtons[4]) spin -= 1;

      nav.up = nav.up || ly < -0.55 || padButtons[12];
      nav.down = nav.down || ly > 0.55 || padButtons[13];
      nav.left = nav.left || lx < -0.55 || padButtons[14];
      nav.right = nav.right || lx > 0.55 || padButtons[15];
    }

    spin = Math.max(-1, Math.min(1, spin));

    // ---------- edges ----------
    snap.jumpPressed = jumpHeld && !this.prevJump;
    snap.jumpReleased = !jumpHeld && this.prevJump;
    this.prevJump = jumpHeld;
    if (snap.jumpPressed) this.anySignal = true;

    if (pauseHeld && !this.prevPause) {
      snap.pausePressed = true;
      this.fire("back");
    }
    this.prevPause = pauseHeld;

    if (confirmHeld && !this.prevConfirm) {
      snap.confirmPressed = true;
      this.fire("confirm");
    }
    this.prevConfirm = confirmHeld;

    if (backHeld && !this.prevBack) {
      snap.backPressed = true;
      this.fire("back");
    }
    this.prevBack = backHeld;

    // Menu navigation with initial delay + key repeat.
    for (const dir of ["up", "down", "left", "right"] as const) {
      const held = nav[dir];
      const edge = held && !this.prevNav[dir];
      this.navCooldown[dir] -= dtMs;
      if (held && (!this.prevNav[dir] || this.navCooldown[dir] <= 0)) {
        this.navCooldown[dir] = this.prevNav[dir]
          ? NAV_REPEAT_MS
          : NAV_FIRST_REPEAT_MS;
        if (dir !== "left" && dir !== "right") this.fire(dir);
        else this.anySignal = true;
      }
      this.prevNav[dir] = held;
      snap.navPressed[dir] = edge;
    }

    snap.jumpHeld = jumpHeld;
    snap.boostHeld = boostHeld;
    snap.downHeld = downHeld;
    snap.spinAxis = spin;
    snap.anyPressed = this.anySignal;
    this.anySignal = false;

    return snap;
  }
}
