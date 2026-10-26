import * as THREE from "three";
import { PIVOT_Y } from "./character-constants";
import { aim, sstep, twist } from "./aim";
import { lowestFoot, type PoseState } from "./pose-state";

/** Tuck into a ball and tumble forward (-Z in root space). */
export function applyRoll(s: PoseState): void {
  const { act, pivot } = s;
  const e = sstep(0, 0.12, act.t) * (1 - sstep(0.88, 1, act.t));
  pivot.rotation.x = -sstep(0.04, 0.96, act.t) * Math.PI * 2;
  pivot.position.y = PIVOT_Y - 0.28 * e;
  const tuck = e;
  aim(s, "LeftUpLeg", 0.05, 0.1, 1, tuck * 0.9);
  aim(s, "RightUpLeg", -0.05, 0.1, 1, tuck * 0.9);
  aim(s, "LeftLeg", 0, -0.8, -0.6, tuck * 0.9);
  aim(s, "RightLeg", 0, -0.8, -0.6, tuck * 0.9);
  aim(s, "LeftArm", 0.3, -0.4, 1, tuck * 0.8);
  aim(s, "RightArm", -0.3, -0.4, 1, tuck * 0.8);
}

export function applyCrouch(s: PoseState): void {
  const { crouch, down } = s;
  s.pivot.position.y = PIVOT_Y - crouch * 0.34 * (1 - down);
  for (const sd of [1, -1] as const) {
    const L = sd === 1 ? "Left" : "Right";
    aim(s, `${L}UpLeg`, 0.1 * sd, -0.25, 0.95, crouch);
    aim(s, `${L}Leg`, 0.04 * sd, -0.9, -0.55, crouch);
  }
  twist(s, s.bones.spine, 1, 0, 0, crouch * 0.4);
  // lowering the hips by a fixed amount buries the feet when the legs
  // don't fold exactly that far — measure and re-plant them on the ground
  if (s.footBones.length && down < 0.01) s.pivot.position.y += s.restSole - lowestFoot(s);
}

const seatTmpA = new THREE.Vector3();
const seatTmpB = new THREE.Vector3();
const seatTmpC = new THREE.Vector3();
const seatTmpD = new THREE.Vector3();
const hipV = new THREE.Vector3();

export function applySeated(s: PoseState): void {
  const { seated, seatSpread, seatForward } = s;
  s.pivot.position.y = PIVOT_Y;
  const w = seated * 0.95;
  for (const sd of [1, -1] as const) {
    const L = sd === 1 ? "Left" : "Right";
    // straddle: thighs part and drop to the flanks; forward: legs out along the back
    const spr = 0.3 + seatSpread * 0.75;
    // wide / low backs: knees up, feet planted on the back (like sitting on the ground)
    // — shins that pointed down would drive straight into the body
    const up = seatTmpA.set(sd * spr, -0.55, 0.3).lerp(seatTmpB.set(sd * 0.18, 0.5, 1), seatForward);
    const lo = seatTmpC.set(sd * (0.12 + seatSpread * 0.3), -1, -0.1).lerp(seatTmpD.set(sd * 0.12, -0.7, -0.7), seatForward);
    aim(s, `${L}UpLeg`, up.x, up.y, up.z, w);
    aim(s, `${L}Leg`, lo.x, lo.y, lo.z, w);
    aim(s, `${L}Arm`, 0.3 * sd, -0.55, 0.75, seated * 0.7);
    aim(s, `${L}ForeArm`, 0.1 * sd, -0.25, 1, seated * 0.7);
  }
  if (s.bones.hips) {
    s.root.updateMatrixWorld(true);
    s.bones.hips.getWorldPosition(hipV);
    const hl = s.root.worldToLocal(hipV);
    s.hipY = hl.y;
    s.hipX = hl.x;
    s.hipZ = hl.z;
  }
}
