import { aim, sstep, twist } from "./aim";
import type { PoseState } from "./pose-state";

export function applyPunch(s: PoseState): void {
  const { act, bones } = s;
  const sd = act.side === 1 ? 1 : -1; // model frame: character's left = +X
  const L = act.side === 1 ? "Left" : "Right";
  const t = act.t;
  const env = sstep(0, 0.14, t) * (1 - sstep(0.82, 1, t));
  // 0 = guard (fist at chin), 1 = fully extended
  const ext = sstep(0.12, 0.34, t) * (1 - sstep(0.5, 0.74, t));
  // off-hand guard stays up
  const O = act.side === 1 ? "Right" : "Left";
  const os = -sd;
  aim(s, `${O}Arm`, os * 0.4, -0.75, 0.35, env * 0.9);
  aim(s, `${O}ForeArm`, os * 0.1, 0.7, 0.75, env * 0.9);
  // torso whips into the strike
  twist(s, bones.spine, 0, 1, 0, sd * -1 * (ext * 0.5 - 0.1 * env));
  twist(s, bones.chest, 0, 1, 0, sd * -1 * ext * 0.3);
  aim(s, `${L}Arm`, sd * (0.35 - ext * 0.3), -0.75 + ext * 0.78, 0.35 + ext * 0.65, env);
  aim(s, `${L}ForeArm`, sd * (0.1 - ext * 0.1), 0.7 - ext * 0.62, 0.75 + ext * 0.25, env);
}

export function applyKick(s: PoseState): void {
  const { act, bones } = s;
  const L = act.side === 1 ? "Left" : "Right";
  const sd = act.side === 1 ? 1 : -1;
  const t = act.t;
  const env = sstep(0, 0.16, t) * (1 - sstep(0.78, 1, t));
  // chamber (knee up) → snap out → recoil
  const snap = sstep(0.26, 0.42, t) * (1 - sstep(0.52, 0.72, t));
  twist(s, bones.spine, 1, 0, 0, env * -0.22);
  aim(s, `${L}UpLeg`, sd * 0.05, 0.15 + (1 - snap) * 0.5, 0.85 + snap * 0.3, env);
  aim(s, `${L}Leg`, sd * 0.02, -0.9 + snap * 0.9, 0.25 + snap * 0.7, env);
  aim(s, "LeftArm", 0.7, -0.5, 0.2, env * 0.7);
  aim(s, "RightArm", -0.7, -0.5, 0.2, env * 0.7);
}
