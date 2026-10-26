import * as THREE from "three";
import type { GunModel } from "../../weapons/gun-models";
import { AIM_CHILD, PIVOT_Y } from "./character-constants";
import type { CharacterAction } from "./character-types";

/** Mutable pose inputs shared by the character API and the pose solvers. */
export interface PoseState {
  root: THREE.Group;
  pivot: THREE.Group;
  model: THREE.Group;
  bone(name: string): THREE.Object3D | null;
  bones: { hips: THREE.Object3D | null; spine: THREE.Object3D | null; chest: THREE.Object3D | null };
  aimable: Map<string, { b: THREE.Object3D; child: THREE.Object3D }>;
  act: { kind: CharacterAction | null; t: number; side: 0 | 1 };
  crouch: number;
  down: number;
  seated: number;
  armed: number;
  gunPitch: number;
  kick: number;
  gunModel: GunModel | null;
  gunHolder: THREE.Group;
  seatForward: number;
  seatSpread: number;
  hipY: number;
  hipX: number;
  hipZ: number;
  /** Ankle/toe bones — crouch re-plants the feet to the rest sole height. */
  footBones: THREE.Object3D[];
  restSole: number;
}

/** root > pivot (hip height; rolls / falls rotate about it) > model (yaw fix). */
export function createPoseState(scene: THREE.Object3D, yaw: number): PoseState {
  const root = new THREE.Group();
  root.name = "Explorer";
  const pivot = new THREE.Group();
  pivot.position.y = PIVOT_Y;
  root.add(pivot);
  const model = new THREE.Group();
  model.rotation.y = yaw;
  model.position.y = -PIVOT_Y;
  pivot.add(model);
  model.add(scene);

  // Limbs are aimed in world space toward a target direction expressed in the
  // *model frame* (+Z forward, +X the character's left), so it holds whatever
  // the rig's rest pose is.
  const bone = (n: string): THREE.Object3D | null => scene.getObjectByName(n) ?? null;
  const aimable = new Map<string, { b: THREE.Object3D; child: THREE.Object3D }>();
  for (const [n, c] of Object.entries(AIM_CHILD)) {
    const b = bone(n);
    const ch = bone(c);
    if (b && ch) aimable.set(n, { b, child: ch });
  }
  const gunHolder = new THREE.Group();
  gunHolder.visible = false;
  model.add(gunHolder);
  return {
    root,
    pivot,
    model,
    bone,
    bones: { hips: bone("Hips"), spine: bone("Spine"), chest: bone("Chest") },
    aimable,
    act: { kind: null, t: 0, side: 0 },
    crouch: 0,
    down: 0,
    seated: 0,
    armed: 0,
    gunPitch: -0.9,
    kick: 0,
    gunModel: null,
    gunHolder,
    seatForward: 0,
    seatSpread: 0.5,
    hipY: 0.9,
    hipX: 0,
    hipZ: 0,
    footBones: ["LeftFoot", "RightFoot", "LeftToes", "RightToes"]
      .map((n) => bone(n))
      .filter((b): b is THREE.Object3D => !!b),
    restSole: 0,
  };
}

const footV = new THREE.Vector3();

/** Lowest foot bone, in the character root's space. */
export function lowestFoot(s: PoseState): number {
  s.root.updateMatrixWorld(true);
  let min = Infinity;
  for (const b of s.footBones) {
    b.getWorldPosition(footV);
    s.root.worldToLocal(footV);
    if (footV.y < min) min = footV.y;
  }
  return min;
}
