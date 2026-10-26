import * as THREE from "three";
import { sstep } from "./aim";

export interface CharacterAnim {
  mixer: THREE.AnimationMixer;
  setGait(g: number): void;
  setSpeed(mps: number): void;
  jump(): void;
}

/**
 * Animation state machine. idle + run both keep playing; the gait factor owns
 * their weights (the engine damps the factor per frame, which IS the
 * crossfade). Jump is a one-shot that takes over, then hands control back.
 */
export function createAnim(animations: THREE.AnimationClip[], model: THREE.Object3D): CharacterAnim {
  const mixer = new THREE.AnimationMixer(model);
  const find = (name: string): THREE.AnimationClip | null => animations.find((c) => c.name === name) ?? null;
  const idleClip = find("idle");
  const runClip = find("run");
  const jumpClip = find("jump");
  if (!idleClip || !runClip) throw new Error("idle/run clips missing");

  const idle = mixer.clipAction(idleClip);
  const run = mixer.clipAction(runClip);
  idle.play();
  run.play();
  run.setEffectiveWeight(0);

  let jumping = false;
  let jumpAction: THREE.AnimationAction | null = null;
  let speedMps = 0;
  if (jumpClip) {
    jumpAction = mixer.clipAction(jumpClip);
    jumpAction.setLoop(THREE.LoopOnce, 1);
    jumpAction.clampWhenFinished = true;
  }
  mixer.addEventListener("finished", () => {
    jumping = false;
    if (jumpAction) jumpAction.setEffectiveWeight(0);
  });

  return {
    mixer,
    setGait(g: number): void {
      if (jumping) return;
      const w = THREE.MathUtils.clamp(g, 0, 1);
      run.setEffectiveWeight(w);
      idle.setEffectiveWeight(1 - w);
      if (speedMps <= 0) run.timeScale = 0.85 + w * 0.5;
    },
    setSpeed(mps: number): void {
      speedMps = Math.max(0, mps);
      if (jumping) return;
      // stride follows the ground: walk-pace gets a slower cycle, sprints a quicker one
      const w = sstep(0.15, 2.4, speedMps);
      run.setEffectiveWeight(w);
      idle.setEffectiveWeight(1 - w);
      run.timeScale = THREE.MathUtils.clamp(speedMps / 8.2, 0.5, 1.55);
    },
    jump(): void {
      if (!jumpAction) return;
      jumping = true;
      jumpAction.reset();
      jumpAction.enabled = true;
      jumpAction.setEffectiveWeight(1).play();
    },
  };
}
