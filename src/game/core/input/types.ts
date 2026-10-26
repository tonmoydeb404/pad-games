/**
 * Jungle Jeep input: merges keyboard + gamepad + touch into one analog
 * snapshot per frame, plus a queue of edge-triggered actions.
 *
 * Gamepad mapping (standard layout) — driving:
 *   RT (7) / A (0)  throttle (analog)      LT (6)        brake · reverse
 *   Left stick X / dpad ← →         steer  B (1)        handbrake
 *   LB (4) · dpad ↑  cycle camera         dpad ↓        headlights · dpad ← quick-use (on foot)
 *   Y (3)            enter / exit vehicle  X (2)         horn
 *   RB (5)           reset vehicle         Back (8)      inventory · Start (9) pause
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
  | "mute"
  | "inventory"
  | "quickUse";
