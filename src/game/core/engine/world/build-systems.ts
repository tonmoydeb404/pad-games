/** Railway, train collision and wildlife system construction. */
import { RAPIER } from "../../../physics/physics";
import { TrainSystem, type TrainHost } from "../../../world/train";
import { clamp } from "../../noise";
import type { JeepEngine } from "../jeep-engine";

/**
 * Lay the Jungle Express: instanced track on the carved bed + the consist
 * that runs the loop forever. Cars get kinematic Rapier boxes (managed
 * through the host) so the jeep — and Rapier's contact events — treat the
 * train as solid. A failed asset load degrades to a bare railway bed.
 */
export async function buildRailway(this: JeepEngine): Promise<void> {
  const scene = this.scene;
  if (!scene || this.destroyed) return;
  const host: TrainHost = {
    scene,
    rail: this.rail,
    crossings: this.railCrossings,
    puff: (x, y, z, vx, vy, vz, color, size, life) =>
      this.spawnParticle(x, y, z, vx, vy, vz, color, size, size * 3.2, life),
    whistle: (g) => this.audio.trainWhistle(g),
    onRam: (closing, nx, nz) => this.trainRam(closing, nx, nz),
    addBox: (id, hx, hy, hz) => {
      if (!this.pw) return;
      const body = this.pw.world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -500, 0),
      );
      this.pw.world.createCollider(
        RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.35).setRestitution(0.3),
        body,
      );
      this.trainBodies.set(id, body);
    },
    moveBox: (id, x, y, z, qx, qy, qz, qw) => {
      const body = this.trainBodies.get(id);
      if (!body) return;
      body.setNextKinematicTranslation({ x, y, z });
      body.setNextKinematicRotation({ x: qx, y: qy, z: qz, w: qw });
    },
    removeBox: (id) => {
      const body = this.trainBodies.get(id);
      if (body) {
        this.pw?.world.removeRigidBody(body);
        this.trainBodies.delete(id);
      }
    },
    camRight: (out) =>
      this.camera ? out.setFromMatrixColumn(this.camera.matrixWorld, 0) : out.set(1, 0, 0),
  };
  const system = new TrainSystem(host);
  await system.load((k) => {
    if (!this.destroyed) this.onProgress?.(62 + k * 8, "Laying the jungle railway…");
  });
  if (this.destroyed) {
    system.destroy();
    return;
  }
  system.spawn();
  this.trains = system;
}

/** The Express made contact — the arcade sting on top of Rapier's bounce. */
export function trainRam(this: JeepEngine, closing: number, nx: number, nz: number): void {
  this.slowmoT = Math.max(this.slowmoT, 0.15);
  this.camState.trauma = 1;
  if (this.onFoot) {
    // a train vs a person: huge knockback, likely a knockout
    this.hurtPlayer(Math.round(clamp(closing * 1.7, 30, 60)), nx, nz, "train");
    this.foot.vx += nx * 13;
    this.foot.vz += nz * 13;
  } else {
    this.damageJeep(clamp(closing * 1.5, 16, 36));
    this.audio.thud(1.5);
    this.input.rumble(1, 700);
    // shove the jeep clear of the rails in its own lateral frame
    const cy = Math.cos(this.v.yaw);
    const sy = Math.sin(this.v.yaw);
    this.v.lateral = clamp(this.v.lateral + (nx * cy + nz * -sy) * 5, -7, 7);
  }
  this.notify("THE JUNGLE EXPRESS!");
}
