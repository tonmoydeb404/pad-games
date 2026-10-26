import type * as THREE from "three";
import type { GunModel } from "../../weapons/gun-models";

export type SkinId = "skaterMaleA" | "skaterFemaleA" | "criminalMaleA" | "cyborgFemaleA";

/** Procedural (non-clip) actions the engine drives with a 0..1 timeline. */
export type CharacterAction = "punch" | "kick" | "roll";

export interface JungleCharacter {
  /** Positioned/yawed by the engine; origin at the feet, forward = -Z. */
  root: THREE.Group;
  /** 0 = standing idle, 1 = full run (crossfades + stride scale). */
  setGait(g: number): void;
  /**
   * Planar ground speed in u/s. Retimes the stride so feet match the ground
   * (a slow walk reads as a walk, not a slow-motion sprint) and blends idle in.
   */
  setSpeed(mps: number): void;
  /** Play the jump take once, then fall back to the current gait. */
  jump(): void;
  /**
   * Pose a procedural action at `t` (0..1 through it) or clear it with `null`.
   * `side` picks the limb: 0 = right, 1 = left. The engine owns the timeline
   * so hit timing and the animation can never drift apart.
   */
  setAction(action: CharacterAction | null, t: number, side?: 0 | 1): void;
  /** 0 = standing, 1 = full crouch. */
  setCrouch(k: number): void;
  /** 0 = on feet, 1 = flat on the back (knocked out). */
  setDown(k: number): void;
  /**
   * 0 = on foot, 1 = sitting on a mount. `forward` 0..1 blends from legs
   * straddling the flanks to legs stretched out forward along the back (wide
   * or low mounts); `spread` 0..1 is how far the thighs part when straddling.
   */
  setSeated(k: number, forward?: number, spread?: number): void;
  /** Pelvis height above the feet origin in the current pose (seat placement). */
  hipHeight(): number;
  /** Pelvis offset from the root in its own space (x right, z back) — so a seat can centre the hips, not the root. */
  hipOffset?(): { x: number; z: number };
  /** Put a blaster in the right hand (null = empty hands). Re-using one model is fine. */
  setGun(gun: GunModel | null): void;
  /**
   * Gun stance. `armed` 0..1 blends the two-handed hold in; `pitch` is where
   * the barrel points (rad, + = up; low-ready ≈ -0.9); `kick` 0..1 is recoil
   * that decays on its own.
   */
  setStance(armed: number, pitch: number): void;
  /** One shot's worth of recoil. */
  kickGun(amount?: number): void;
  /** Barrel tip in world space (muzzle flash / tracer start); false when no gun is held. */
  muzzleWorld(out: THREE.Vector3): boolean;
  /** Swap the skin texture live (character select). */
  setSkin(skin: SkinId): Promise<void>;
  update(dt: number): void;
  dispose(): void;
}
