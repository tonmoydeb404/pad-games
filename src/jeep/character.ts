/**
 * The on-foot explorer — Kenney "Animated Characters: Protagonists",
 * characterMedium rig (CC0 1.0, see public/assets/jeep/CREDITS.md).
 *
 * One GLB carries the skinned mesh (normalised to 1.72 units tall, origin at
 * the feet) plus the idle/run/jump takes, baked by
 * `scripts/convert-character.mjs` from the pack's FBX files. The four skin
 * PNGs are applied at runtime, so every skin shares the one geometry file.
 *
 * Facing: the FBX source models +Z; this engine's convention is forward = -Z
 * (the jeep drives toward -Z), so the model is yawed π behind a documented
 * constant — flip MODEL_YAW to 0 if a future re-export faces the other way.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GunModel } from "./gunmodels";

export const CHARACTER_HEIGHT = 1.72;

/** FBX source faces +Z; engine forward is -Z. */
const MODEL_YAW = Math.PI;

const BASE = "/assets/jeep/character";

export type SkinId = "skaterMaleA" | "skaterFemaleA" | "criminalMaleA" | "cyborgFemaleA";

export const SKINS: SkinId[] = ["skaterMaleA", "skaterFemaleA", "criminalMaleA", "cyborgFemaleA"];

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

const sstep = (a: number, b: number, x: number): number => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Bone → the child its direction is measured toward. */
const AIM_CHILD: Record<string, string> = {
  LeftArm: "LeftForeArm",
  LeftForeArm: "LeftHand",
  RightArm: "RightForeArm",
  RightForeArm: "RightHand",
  LeftUpLeg: "LeftLeg",
  LeftLeg: "LeftFoot",
  RightUpLeg: "RightLeg",
  RightLeg: "RightFoot",
};

/**
 * Load the explorer and apply a skin. Resolves with `null` when anything goes
 * wrong (missing files, GLTF bug) — the caller falls back to a no-explorer
 * session, never a crash.
 */
export async function loadJungleCharacter(skin: SkinId = "skaterMaleA"): Promise<JungleCharacter | null> {
  try {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(`${BASE}/character.glb`);

    const root = new THREE.Group();
    root.name = "Explorer";
    // root > pivot (hip height; rolls / falls rotate about it) > model (yaw fix)
    const PIVOT_Y = 0.9;
    const pivot = new THREE.Group();
    pivot.position.y = PIVOT_Y;
    root.add(pivot);
    const model = new THREE.Group();
    model.rotation.y = MODEL_YAW;
    model.position.y = -PIVOT_Y;
    pivot.add(model);
    model.add(gltf.scene);

    const texLoader = new THREE.TextureLoader();
    const loadSkin = async (id: SkinId): Promise<THREE.Texture> => {
      const t = await texLoader.loadAsync(`${BASE}/skins/${id}.png`);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    };
    let tex = await loadSkin(skin);
    let meshes = 0;
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      meshes++;
      mesh.castShadow = true;
      mesh.frustumCulled = false; // skinned bounds lie — never cull
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.map = tex;
      mat.color.set(0xffffff);
      mat.roughness = 0.72;
      mat.metalness = 0;
      mat.needsUpdate = true;
    });
    if (meshes === 0) throw new Error("no meshes in character.glb");

    // --- animation state machine -------------------------------------------
    // idle + run both keep playing; the gait factor owns their weights (the
    // engine damps the factor per frame, which IS the crossfade). Jump is a
    // one-shot that takes over, then hands control back.
    const mixer = new THREE.AnimationMixer(model);
    const find = (name: string): THREE.AnimationClip | null =>
      gltf.animations.find((c) => c.name === name) ?? null;
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
    if (jumpClip) {
      jumpAction = mixer.clipAction(jumpClip);
      jumpAction.setLoop(THREE.LoopOnce, 1);
      jumpAction.clampWhenFinished = true;
    }
    mixer.addEventListener("finished", () => {
      jumping = false;
      if (jumpAction) jumpAction.setEffectiveWeight(0);
    });


    // --- procedural action layer ------------------------------------------
    // Runs AFTER the mixer each frame. Limbs are aimed in world space toward
    // a target direction expressed in the *model frame* (+Z forward, +X the
    // character's left), so it holds whatever the rig's rest pose is.
    const bone = (n: string): THREE.Object3D | null => gltf.scene.getObjectByName(n) ?? null;
    const bones = {
      hips: bone("Hips"),
      spine: bone("Spine"),
      chest: bone("Chest"),
    };
    const aimable = new Map<string, { b: THREE.Object3D; child: THREE.Object3D }>();
    for (const [n, c] of Object.entries(AIM_CHILD)) {
      const b = bone(n);
      const ch = bone(c);
      if (b && ch) aimable.set(n, { b, child: ch });
    }
    const act: { kind: CharacterAction | null; t: number; side: 0 | 1 } = { kind: null, t: 0, side: 0 };
    let crouch = 0;
    let down = 0;
    let seated = 0;
    let armed = 0;
    let gunPitch = -0.9;
    let kick = 0;
    let gunModel: GunModel | null = null;
    const gunHolder = new THREE.Group();
    gunHolder.visible = false;
    model.add(gunHolder);
    const handV = new THREE.Vector3();
    const gunQ = new THREE.Quaternion();
    const gunDir = new THREE.Vector3();
    const Z_AXIS = new THREE.Vector3(0, 0, 1);
    let seatForward = 0;
    let seatSpread = 0.5;
    let hipY = 0.9;
    let hipX = 0;
    let hipZ = 0;
    /** Ankle/toe height above the soles at rest — crouch re-plants the feet to it. */
    const footBones = ["LeftFoot", "RightFoot", "LeftToes", "RightToes"]
      .map((n) => bone(n))
      .filter((b): b is THREE.Object3D => !!b);
    const footV = new THREE.Vector3();
    const seatTmpA = new THREE.Vector3();
    const seatTmpB = new THREE.Vector3();
    const seatTmpC = new THREE.Vector3();
    const seatTmpD = new THREE.Vector3();
    /** Lowest foot bone, in the character root's space. */
    const lowestFoot = (): number => {
      root.updateMatrixWorld(true);
      let min = Infinity;
      for (const b of footBones) {
        b.getWorldPosition(footV);
        root.worldToLocal(footV);
        if (footV.y < min) min = footV.y;
      }
      return min;
    };
    let restSole = 0;
    let speedMps = 0;

    const qModel = new THREE.Quaternion();
    const qParent = new THREE.Quaternion();
    const qWorld = new THREE.Quaternion();
    const qDelta = new THREE.Quaternion();
    const pA = new THREE.Vector3();
    const pB = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const tgt = new THREE.Vector3();
    const ID = new THREE.Quaternion();

    /** Rotate `b` (world space) so its limb points toward `target` (model frame), by weight w. */
    const aim = (name: string, x: number, y: number, z: number, w: number): void => {
      const a = aimable.get(name);
      if (!a || w <= 0.001) return;
      const { b, child } = a;
      b.updateWorldMatrix(true, false);
      child.updateWorldMatrix(true, false);
      b.getWorldPosition(pA);
      child.getWorldPosition(pB);
      dir.subVectors(pB, pA);
      if (dir.lengthSq() < 1e-8) return;
      dir.normalize();
      model.getWorldQuaternion(qModel);
      tgt.set(x, y, z).normalize().applyQuaternion(qModel);
      qDelta.setFromUnitVectors(dir, tgt);
      qDelta.slerp(ID, 1 - w);
      b.getWorldQuaternion(qWorld);
      qWorld.premultiply(qDelta);
      if (b.parent) {
        b.parent.getWorldQuaternion(qParent);
        b.quaternion.copy(qParent.invert().multiply(qWorld));
      } else b.quaternion.copy(qWorld);
      b.updateWorldMatrix(false, true);
    };

    /** Twist / lean a bone by a rotation about a model-frame axis. */
    const twist = (b: THREE.Object3D | null, ax: number, ay: number, az: number, ang: number): void => {
      if (!b || Math.abs(ang) < 1e-4) return;
      b.updateWorldMatrix(true, false);
      model.getWorldQuaternion(qModel);
      dir.set(ax, ay, az).normalize().applyQuaternion(qModel);
      qDelta.setFromAxisAngle(dir, ang);
      b.getWorldQuaternion(qWorld);
      qWorld.premultiply(qDelta);
      if (b.parent) {
        b.parent.getWorldQuaternion(qParent);
        b.quaternion.copy(qParent.invert().multiply(qWorld));
      } else b.quaternion.copy(qWorld);
      b.updateWorldMatrix(false, true);
    };

    const applyPose = (): void => {
      // knock-out / roll tumble about the hips
      pivot.rotation.x = 0;
      model.position.y = -PIVOT_Y;
      if (down > 0.001) {
        pivot.rotation.x = down * (Math.PI / 2) * 0.96;
        pivot.position.y = PIVOT_Y * (1 - down) + 0.22 * down;
      } else {
        pivot.position.y = PIVOT_Y;
      }
      if (act.kind === "roll") {
        // tuck into a ball and tumble forward (-Z in root space)
        const e = sstep(0, 0.12, act.t) * (1 - sstep(0.88, 1, act.t));
        pivot.rotation.x = -sstep(0.04, 0.96, act.t) * Math.PI * 2;
        pivot.position.y = PIVOT_Y - 0.28 * e;
        const tuck = e;
        aim("LeftUpLeg", 0.05, 0.1, 1, tuck * 0.9);
        aim("RightUpLeg", -0.05, 0.1, 1, tuck * 0.9);
        aim("LeftLeg", 0, -0.8, -0.6, tuck * 0.9);
        aim("RightLeg", 0, -0.8, -0.6, tuck * 0.9);
        aim("LeftArm", 0.3, -0.4, 1, tuck * 0.8);
        aim("RightArm", -0.3, -0.4, 1, tuck * 0.8);
        return;
      }
      if (crouch > 0.01) {
        pivot.position.y = PIVOT_Y - crouch * 0.34 * (1 - down);
        for (const s of [1, -1] as const) {
          const L = s === 1 ? "Left" : "Right";
          aim(`${L}UpLeg`, 0.1 * s, -0.25, 0.95, crouch);
          aim(`${L}Leg`, 0.04 * s, -0.9, -0.55, crouch);
        }
        twist(bones.spine, 1, 0, 0, crouch * 0.4);
        // lowering the hips by a fixed amount buries the feet when the legs
        // don't fold exactly that far — measure and re-plant them on the ground
        if (footBones.length && down < 0.01) pivot.position.y += restSole - lowestFoot();
      }
      if (seated > 0.01 && !act.kind) {
        pivot.position.y = PIVOT_Y;
        const w = seated * 0.95;
        for (const sd of [1, -1] as const) {
          const L = sd === 1 ? "Left" : "Right";
          // straddle: thighs part and drop to the flanks; forward: legs out along the back
          const spr = 0.3 + seatSpread * 0.75;
          // wide / low backs: knees up, feet planted on the back (like sitting on the ground)
          // — shins that pointed down would drive straight into the body
          const up = seatTmpA.set(sd * spr, -0.55, 0.3).lerp(seatTmpB.set(sd * 0.18, 0.5, 1), seatForward);
          const lo = seatTmpC.set(sd * (0.12 + seatSpread * 0.3), -1, -0.1).lerp(seatTmpD.set(sd * 0.12, -0.7, -0.7), seatForward);
          aim(`${L}UpLeg`, up.x, up.y, up.z, w);
          aim(`${L}Leg`, lo.x, lo.y, lo.z, w);
          aim(`${L}Arm`, 0.3 * sd, -0.55, 0.75, seated * 0.7);
          aim(`${L}ForeArm`, 0.1 * sd, -0.25, 1, seated * 0.7);
        }
        if (bones.hips) {
          root.updateMatrixWorld(true);
          bones.hips.getWorldPosition(footV);
          const hl = root.worldToLocal(footV);
          hipY = hl.y;
          hipX = hl.x;
          hipZ = hl.z;
        }
      }
      if (armed > 0.01 && !act.kind && seated < 0.01) {
        // two-handed hold. Model frame: +Z forward, +X the character's left.
        const p = gunPitch + kick * 0.22;
        const ay = Math.sin(p);
        const az = Math.cos(p);
        aim("RightArm", 0.2, ay, az, armed);
        aim("RightForeArm", 0.1, ay, az, armed);
        aim("LeftArm", -0.26, ay - 0.04, az, armed * 0.95);
        aim("LeftForeArm", -0.12, ay - 0.02, az, armed * 0.95);
        // lean the chest into the aim
        twist(bones.chest, 1, 0, 0, -p * 0.25 * armed);
        const hand = bone("RightHand");
        if (hand && gunModel) {
          model.updateWorldMatrix(true, false);
          hand.updateWorldMatrix(true, false);
          hand.getWorldPosition(handV);
          model.worldToLocal(handV);
          gunDir.set(0, ay, az).normalize();
          gunQ.setFromUnitVectors(Z_AXIS, gunDir);
          gunHolder.quaternion.copy(gunQ);
          gunHolder.position.copy(handV).addScaledVector(gunDir, -kick * 0.07);
          gunHolder.visible = true;
        }
      } else gunHolder.visible = false;
      if (act.kind === "punch") {
        const s = act.side === 1 ? 1 : -1; // model frame: character's left = +X
        const L = act.side === 1 ? "Left" : "Right";
        const t = act.t;
        const env = sstep(0, 0.14, t) * (1 - sstep(0.82, 1, t));
        // 0 = guard (fist at chin), 1 = fully extended
        const ext = sstep(0.12, 0.34, t) * (1 - sstep(0.5, 0.74, t));
        // off-hand guard stays up
        const O = act.side === 1 ? "Right" : "Left";
        const os = -s;
        aim(`${O}Arm`, os * 0.4, -0.75, 0.35, env * 0.9);
        aim(`${O}ForeArm`, os * 0.1, 0.7, 0.75, env * 0.9);
        // torso whips into the strike
        twist(bones.spine, 0, 1, 0, s * -1 * (ext * 0.5 - 0.1 * env));
        twist(bones.chest, 0, 1, 0, s * -1 * ext * 0.3);
        aim(`${L}Arm`, s * (0.35 - ext * 0.3), -0.75 + ext * 0.78, 0.35 + ext * 0.65, env);
        aim(`${L}ForeArm`, s * (0.1 - ext * 0.1), 0.7 - ext * 0.62, 0.75 + ext * 0.25, env);
        return;
      }
      if (act.kind === "kick") {
        const L = act.side === 1 ? "Left" : "Right";
        const s = act.side === 1 ? 1 : -1;
        const t = act.t;
        const env = sstep(0, 0.16, t) * (1 - sstep(0.78, 1, t));
        // chamber (knee up) → snap out → recoil
        const snap = sstep(0.26, 0.42, t) * (1 - sstep(0.52, 0.72, t));
        twist(bones.spine, 1, 0, 0, env * -0.22);
        aim(`${L}UpLeg`, s * 0.05, 0.15 + (1 - snap) * 0.5, 0.85 + snap * 0.3, env);
        aim(`${L}Leg`, s * 0.02, -0.9 + snap * 0.9, 0.25 + snap * 0.7, env);
        aim("LeftArm", 0.7, -0.5, 0.2, env * 0.7);
        aim("RightArm", -0.7, -0.5, 0.2, env * 0.7);
        return;
      }
    };

    mixer.update(0);
    if (footBones.length) restSole = lowestFoot();

    return {
      root,
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
      setAction(a: CharacterAction | null, t: number, side: 0 | 1 = 0): void {
        act.kind = a;
        act.t = THREE.MathUtils.clamp(t, 0, 1);
        act.side = side;
      },
      setCrouch(k: number): void {
        crouch = THREE.MathUtils.clamp(k, 0, 1);
      },
      setDown(k: number): void {
        down = THREE.MathUtils.clamp(k, 0, 1);
      },
      setGun(gun: GunModel | null): void {
        for (const c of [...gunHolder.children]) gunHolder.remove(c);
        gunModel = gun;
        if (gun) gunHolder.add(gun.root);
        else gunHolder.visible = false;
      },
      setStance(a: number, pitch: number): void {
        armed = THREE.MathUtils.clamp(a, 0, 1);
        gunPitch = THREE.MathUtils.clamp(pitch, -1.2, 1.2);
      },
      kickGun(amount = 1): void {
        kick = Math.min(1.4, kick + amount);
      },
      muzzleWorld(out: THREE.Vector3): boolean {
        if (!gunModel || !gunHolder.visible) return false;
        gunHolder.updateWorldMatrix(true, true);
        out.copy(gunModel.muzzle);
        gunModel.root.localToWorld(out);
        return true;
      },
      setSeated(k: number, forward = 0, spread = 0.5): void {
        seated = THREE.MathUtils.clamp(k, 0, 1);
        seatForward = THREE.MathUtils.clamp(forward, 0, 1);
        seatSpread = THREE.MathUtils.clamp(spread, 0, 1);
      },
      hipHeight(): number {
        return hipY;
      },
      hipOffset(): { x: number; z: number } {
        return { x: hipX, z: hipZ };
      },
      async setSkin(id: SkinId): Promise<void> {
        const next = await loadSkin(id);
        gltf.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const mat = mesh.material as THREE.MeshStandardMaterial;
          mat.map = next;
          mat.needsUpdate = true;
        });
        tex.dispose();
        tex = next;
      },
      jump(): void {
        if (!jumpAction) return;
        jumping = true;
        jumpAction.reset();
        jumpAction.enabled = true;
        jumpAction.setEffectiveWeight(1).play();
      },
      update(dt: number): void {
        mixer.update(dt);
        kick = Math.max(0, kick - dt * 7);
        applyPose();
      },
      dispose(): void {
        mixer.stopAllAction();
        mixer.uncacheRoot(model);
        tex.dispose();
      },
    };
  } catch (err) {
    console.warn("[jeep] explorer failed to load — walking disabled:", err);
    return null;
  }
}
