import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Actor, AnimalCtx, Prototype } from "./actor";
import { play } from "./animation";
import { MODEL_FACING } from "./constants";
import type { AnimalDef } from "./types";

export function makeActor(ctx: AnimalCtx, def: AnimalDef, proto: Prototype, x: number, z: number, rnd: () => number): Actor {
  const root = cloneSkinned(proto.scene) as THREE.Group;
  root.scale.setScalar(proto.scale);
  const mixer = new THREE.AnimationMixer(root);
  const clip = (c: THREE.AnimationClip | null): THREE.AnimationAction | undefined =>
    c ? mixer.clipAction(c) : undefined;
  const actions = {
    idle: clip(proto.clips.idle),
    eat: clip(proto.clips.eat),
    move: clip(proto.clips.move),
    death: clip(proto.clips.death),
    react: clip(proto.clips.react),
  };
  if (actions.idle) actions.idle.setLoop(THREE.LoopRepeat, Infinity);
  if (actions.move) actions.move.setLoop(THREE.LoopRepeat, Infinity);
  if (actions.eat) actions.eat.setLoop(THREE.LoopRepeat, Infinity);
  if (actions.death) {
    actions.death.setLoop(THREE.LoopOnce, 1);
    actions.death.clampWhenFinished = true; // hold the collapsed pose
  }
  if (actions.react) {
    actions.react.setLoop(THREE.LoopOnce, 1);
    actions.react.clampWhenFinished = true; // hold the flinch until we crossfade away
  }
  const y = ctx.host.terrainHeight(x, z);
  const pos = new THREE.Vector3(x, def.flyer ? y + def.height + 0.8 : y, z);
  const yaw = rnd() * Math.PI * 2;
  root.position.copy(pos);
  root.rotation.set(0, yaw + MODEL_FACING, 0);
  ctx.host.scene.add(root);
  const actor: Actor = {
    def,
    root,
    mixer,
    clips: proto.clips,
    actions,
    current: null,
    state: "idle",
    stateT: 0,
    pos,
    yaw,
    targetYaw: yaw,
    vel: new THREE.Vector3(),
    vy: 0,
    angVel: new THREE.Vector3(),
    bounces: 0,
    bled: false,
    respawnT: 0,
    radius: Math.max(0.35, def.height * 0.38),
    idleTimer: 2 + rnd() * 6,
    eatT: 0,
    reactT: 0,
    hitCd: 0,
    hp: def.hp,
    maxHp: def.hp,
    coolT: 0,
    hurtT: 0,
    // personal space: some individuals let you drive right past
    fleeR:
      def.temper === "calm" ? 4 + rnd() * 8 :
      def.temper === "fierce" ? 6 + rnd() * 10 :
      8 + rnd() * 18,
    aggroR: 10 + rnd() * 8,
    bar: null,
    phase: rnd() * Math.PI * 2,
    saddle: proto.saddle,
  };
  play(actor, "idle", 0.2, 0.9 + rnd() * 0.25);
  return actor;
}
