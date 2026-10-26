import { PIVOT_Y } from "./character-constants";
import { applyGunHold } from "./pose-gun";
import { applyCrouch, applyRoll, applySeated } from "./pose-body";
import { applyKick, applyPunch } from "./pose-strikes";
import type { PoseState } from "./pose-state";

/** Procedural layer — runs AFTER the animation mixer each frame. */
export function applyPose(s: PoseState): void {
  const { pivot, model, act } = s;
  // knock-out / roll tumble about the hips
  pivot.rotation.x = 0;
  model.position.y = -PIVOT_Y;
  if (s.down > 0.001) {
    pivot.rotation.x = s.down * (Math.PI / 2) * 0.96;
    pivot.position.y = PIVOT_Y * (1 - s.down) + 0.22 * s.down;
  } else {
    pivot.position.y = PIVOT_Y;
  }
  if (act.kind === "roll") {
    applyRoll(s);
    return;
  }
  if (s.crouch > 0.01) applyCrouch(s);
  if (s.seated > 0.01 && !act.kind) applySeated(s);
  if (s.armed > 0.01 && !act.kind && s.seated < 0.01) applyGunHold(s);
  else s.gunHolder.visible = false;
  if (act.kind === "punch") applyPunch(s);
  else if (act.kind === "kick") applyKick(s);
}
