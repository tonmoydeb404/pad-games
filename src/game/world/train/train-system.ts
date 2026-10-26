import * as THREE from "three";
import { clamp } from "../../core/noise";
import { loadTrainModels } from "./assets";
import { obbCircleHit } from "./collision";
import {
  CARS,
  CAR_GAP,
  EARSHOT,
  RAM_COOLDOWN,
  TRAIN_SCALE,
  TRAIN_SPEED,
  WHISTLE_COOLDOWN,
} from "./constants";
import { carRoll, emitSmoke, nearCrossing, trainGain, trainPan } from "./effects";
import { spawnTrack } from "./track";
import type { RailPose, TrainHost } from "./types";

export class TrainSystem {
  private readonly root = new THREE.Group();
  private readonly groups: THREE.Group[] = [];
  private readonly halfLen: number[] = [];
  private readonly offsets: number[] = [];
  private d = 0;
  private puffAcc = 0;
  private whistleT = 6; // first whistle soon after the start — announce it
  private ramT = 0;
  private built = false;

  /** Live audio state — the engine pushes it into JeepAudio each frame. */
  readonly sound = { gain: 0, pan: 0, rate: TRAIN_SPEED / 4.5 };

  constructor(private readonly host: TrainHost) {
    // arc offsets along the consist
    let off = 0;
    for (let i = 0; i < CARS.length; i++) {
      if (i > 0) off += CARS[i - 1].half * TRAIN_SCALE + CAR_GAP + CARS[i].half * TRAIN_SCALE;
      this.offsets.push(off);
    }
  }

  /** Load every car + the track piece; failures degrade to fewer cars. */
  async load(onProgress?: (k: number) => void): Promise<void> {
    const entries: [string, (scene: THREE.Object3D) => void][] = [
      ...CARS.map(
        (car) => [car.file, (scene: THREE.Object3D) => this.protos.set(car.file, scene)] as [string, (scene: THREE.Object3D) => void],
      ),
      ["track", (scene) => {
        this.trackProto = scene;
      }],
    ];
    await loadTrainModels(entries, onProgress);
  }

  private readonly protos = new Map<string, THREE.Object3D>();
  private trackProto: THREE.Object3D | null = null;

  /** Build scene objects + the instanced track (call after load). */
  spawn(): void {
    const { scene, rail } = this.host;

    if (this.trackProto) spawnTrack(scene, rail, this.trackProto);

    // --- the consist
    for (const car of CARS) {
      const proto = this.protos.get(car.file);
      if (!proto) continue;
      const g = new THREE.Group();
      g.scale.setScalar(TRAIN_SCALE);
      // glTF carries no shadow flags — opt every part in here
      proto.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
      g.add(proto);
      g.visible = false;
      this.root.add(g);
      this.groups.push(g);
      this.halfLen.push(car.half * TRAIN_SCALE);
    }
    this.root.visible = false;
    scene.add(this.root);
    this.built = true;
  }

  get carCount(): number {
    return this.groups.length;
  }

  /** Advance the consist, smoke, whistle, colliders, audio. Runs forever. */
  update(dt: number, jeep: THREE.Vector3): void {
    if (!this.built || this.groups.length === 0) return;
    this.d += TRAIN_SPEED * dt;
    this.root.visible = true;
    this.ramT = Math.max(0, this.ramT - dt);
    this.whistleT = Math.max(0, this.whistleT - dt);

    const pose: RailPose = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
    const poseAhead: RailPose = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
    let nearest = 1e9;
    let nearestX = 0;
    let nearestZ = 0;
    let locoX = 0;
    let locoZ = 0;

    for (let k = 0; k < this.groups.length; k++) {
      const g = this.groups[k];
      const hl = this.halfLen[k];
      const d = this.d - this.offsets[k];
      this.host.rail.pose(d, pose);
      this.host.rail.pose(d + 7, poseAhead);

      // heading with grade pitch + gentle outward bank on curves
      const roll = carRoll(pose, poseAhead);
      const yaw = Math.atan2(-pose.tx, -pose.tz);
      const pitch = Math.asin(clamp(pose.ty, -1, 1));
      g.position.set(pose.x, pose.y + 0.06, pose.z);
      g.rotation.set(pitch, yaw, roll, "YXZ");
      g.visible = true;

      if (k === 0) {
        locoX = pose.x;
        locoZ = pose.z;
      }

      // proximity
      const dist = Math.hypot(jeep.x - pose.x, jeep.z - pose.z);
      if (dist < nearest) {
        nearest = dist;
        nearestX = pose.x;
        nearestZ = pose.z;
      }

      // kinematic collider: near the jeep → create/track; far → retire
      const active = this.live.has(k);
      if (dist < 150) {
        if (!active) {
          this.host.addBox(k, 1.12, 1.05, hl * 0.94);
          this.live.add(k);
        }
        // rotation quaternion: Euler(pitch, yaw, roll, "YXZ")
        const q = this.q.setFromEuler(this.e.set(pitch, yaw, roll, "YXZ"));
        this.host.moveBox(k, pose.x, pose.y + 1.08, pose.z, q.x, q.y, q.z, q.w);
      } else if (active) {
        this.live.delete(k);
        this.host.removeBox(k);
      }

      // the ram sting — Rapier bounces the jeep; this sells the damage
      if (this.ramT <= 0 && dist < hl + 4) {
        const hit = obbCircleHit(jeep.x, jeep.z, 1.4, pose.x, pose.z, hl * 0.94, 1.12, yaw, this.hit);
        if (hit > 0) {
          this.ramT = RAM_COOLDOWN;
          this.host.onRam(TRAIN_SPEED + 4, this.hit.nx, this.hit.nz);
        }
      }
    }

    // --- chimney smoke
    this.puffAcc += dt;
    const loco = this.groups[0];
    while (this.puffAcc > 0.11) {
      this.puffAcc -= 0.11;
      this.host.rail.pose(this.d, pose);
      emitSmoke(this.host, loco, pose, this.v2);
    }

    // --- whistle: approaching a level crossing
    if (this.whistleT <= 0 && nearCrossing(this.host.crossings, locoX, locoZ)) {
      this.whistleT = WHISTLE_COOLDOWN;
      this.host.whistle(clamp(1 - nearest / 420, 0.15, 1));
    }

    // --- audio state (distance + stereo bearing)
    if (nearest > EARSHOT) {
      this.sound.gain = 0;
    } else {
      this.sound.gain = trainGain(nearest);
      this.host.camRight(this.v3);
      this.sound.pan = trainPan(nearestX - jeep.x, nearestZ - jeep.z, this.v3);
    }
  }

  /** Tear down scene objects + any live colliders. */
  destroy(): void {
    for (const k of [...this.live]) this.host.removeBox(k);
    this.live.clear();
    this.root.removeFromParent();
    this.built = false;
  }

  private readonly live = new Set<number>();
  private readonly v2 = new THREE.Vector3();
  private readonly v3 = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly hit = { nx: 0, nz: 0, depth: 0 };
}
