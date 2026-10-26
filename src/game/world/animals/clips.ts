import type * as THREE from "three";

export interface Clips {
  idle: THREE.AnimationClip | null;
  eat: THREE.AnimationClip | null;
  move: THREE.AnimationClip | null;
  death: THREE.AnimationClip | null;
  react: THREE.AnimationClip | null;
}

export function pickClips(all: THREE.AnimationClip[]): Clips {
  const find = (re: RegExp, avoid?: RegExp): THREE.AnimationClip | null =>
    all.find((c) => re.test(c.name) && !(avoid && avoid.test(c.name))) ?? null;
  return {
    idle: find(/idle/i, /headlow|hitreact/i) ?? find(/flying/i),
    eat: find(/eating/i),
    move: find(/gallop(?!.*jump)|run|flying/i) ?? find(/walk/i) ?? find(/jump/i),
    death: find(/death/i),
    react: find(/hitreact/i),
  };
}
