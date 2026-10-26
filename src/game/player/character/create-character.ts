import * as THREE from "three";
import type { GunModel } from "../../weapons/gun-models";
import { applyPose } from "./apply-pose";
import type { CharacterAnim } from "./character-anim";
import type { CharacterSkins } from "./character-skins";
import type { CharacterAction, JungleCharacter, SkinId } from "./character-types";
import type { PoseState } from "./pose-state";

/** Wire the pose state, animation and skins into the public character API. */
export function createCharacter(s: PoseState, anim: CharacterAnim, skins: CharacterSkins): JungleCharacter {
  const { gunHolder } = s;
  return {
    root: s.root,
    setGait: (g) => anim.setGait(g),
    setSpeed: (mps) => anim.setSpeed(mps),
    setAction(a: CharacterAction | null, t: number, side: 0 | 1 = 0): void {
      s.act.kind = a;
      s.act.t = THREE.MathUtils.clamp(t, 0, 1);
      s.act.side = side;
    },
    setCrouch(k: number): void {
      s.crouch = THREE.MathUtils.clamp(k, 0, 1);
    },
    setDown(k: number): void {
      s.down = THREE.MathUtils.clamp(k, 0, 1);
    },
    setGun(gun: GunModel | null): void {
      for (const c of [...gunHolder.children]) gunHolder.remove(c);
      s.gunModel = gun;
      if (gun) gunHolder.add(gun.root);
      else gunHolder.visible = false;
    },
    setStance(a: number, pitch: number): void {
      s.armed = THREE.MathUtils.clamp(a, 0, 1);
      s.gunPitch = THREE.MathUtils.clamp(pitch, -1.2, 1.2);
    },
    kickGun(amount = 1): void {
      s.kick = Math.min(1.4, s.kick + amount);
    },
    muzzleWorld(out: THREE.Vector3): boolean {
      if (!s.gunModel || !gunHolder.visible) return false;
      gunHolder.updateWorldMatrix(true, true);
      out.copy(s.gunModel.muzzle);
      s.gunModel.root.localToWorld(out);
      return true;
    },
    setSeated(k: number, forward = 0, spread = 0.5): void {
      s.seated = THREE.MathUtils.clamp(k, 0, 1);
      s.seatForward = THREE.MathUtils.clamp(forward, 0, 1);
      s.seatSpread = THREE.MathUtils.clamp(spread, 0, 1);
    },
    hipHeight: () => s.hipY,
    hipOffset: () => ({ x: s.hipX, z: s.hipZ }),
    setSkin: (id: SkinId) => skins.setSkin(id),
    jump: () => anim.jump(),
    update(dt: number): void {
      anim.mixer.update(dt);
      s.kick = Math.max(0, s.kick - dt * 7);
      applyPose(s);
    },
    dispose(): void {
      anim.mixer.stopAllAction();
      anim.mixer.uncacheRoot(s.model);
      skins.dispose();
    },
  };
}
