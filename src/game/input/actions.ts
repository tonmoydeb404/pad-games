/**
 * Actions, not buttons: input sources are mapped to abstract actions so
 * rebinding and the keyboard debug fallback stay trivial.
 */

export type MenuAction = import("../core/types").MenuAction;

/** Analog steering value for spins, -1 (backflip/ccw) .. +1 (frontflip/cw). */
export interface ActionSnapshot {
  jumpHeld: boolean;
  jumpPressed: boolean;
  jumpReleased: boolean;
  boostHeld: boolean;
  downHeld: boolean;
  pausePressed: boolean;
  confirmPressed: boolean;
  backPressed: boolean;
  navPressed: Record<"up" | "down" | "left" | "right", boolean>;
  spinAxis: number;
  /** any fresh input this frame — used for "press any button" screens */
  anyPressed: boolean;
}

export function neutralSnapshot(): ActionSnapshot {
  return {
    jumpHeld: false,
    jumpPressed: false,
    jumpReleased: false,
    boostHeld: false,
    downHeld: false,
    pausePressed: false,
    confirmPressed: false,
    backPressed: false,
    navPressed: { up: false, down: false, left: false, right: false },
    spinAxis: 0,
    anyPressed: false,
  };
}
