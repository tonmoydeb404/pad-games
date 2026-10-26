/** Vehicle reset, warping and restart. */
import { SAMPLES } from "../config/world-constants";
import type { JeepEngine } from "../jeep-engine";

export function resetVehicle(this: JeepEngine, toIndex?: number): void {
  const v = this.v;
  const i = ((toIndex !== undefined ? toIndex : v.lastGoodIdx) % SAMPLES + SAMPLES) % SAMPLES;
  const p = this.trailPts[i];
  const t = this.trailTan[i];
  v.pos.set(p.x, this.groundHeight(p.x, p.z) + 0.95, p.z);
  v.yaw = Math.atan2(-t.x, -t.z);
  v.speed = 0;
  v.lateral = 0;
  v.pitch = 0;
  v.roll = 0;
  v.overturnT = 0;
  v.dive = 0;
  v.squat = 0;
  v.bodyRoll = 0;
  v.vy = 0;
  v.airborne = false;
  this.airT = 0;
  this.noContactTicks = 0;
  this.syncF = 0;
  this.syncL = 0;
  for (const w of this.wheels) {
    w.comp = 0.16;
    w.compV = 0;
  }
  this.physEuler.set(0, v.yaw, 0, "YXZ");
  this.physQuat.setFromEuler(this.physEuler);
  this.prevQuat.copy(this.physQuat);
  this.currQuat.copy(this.physQuat);
  this.terrainStream?.update(v.pos.x, v.pos.z, true);
  this.propStream?.update(v.pos.x, v.pos.z);
  if (!this.rig) this.rebuildRig();
  const q = this.physQuat;
  this.rig?.teleport({ x: v.pos.x, y: v.pos.y, z: v.pos.z }, { x: q.x, y: q.y, z: q.z, w: q.w });
  this.jeep?.position.copy(v.pos);
  this.jeep?.quaternion.copy(this.physQuat);
  this.jeepHealth = 100; // fresh jeep after a recovery
  this.wreckT = 0;
  if (this.onFoot) this.spawnExplorerBesideCar(); // the walk home is a chore
  this.notify(this.onFoot ? "Warped to your vehicle" : "Vehicle reset to trail");
}

/**
 * `resetVehicle` at an arbitrary spot (the trail, but also Port Marin).
 * Same settle sequence: fresh body state, physics teleport, meshes synced.
 */
export function warpTo(this: JeepEngine, x: number, z: number, yaw: number): void {
  const v = this.v;
  v.pos.set(x, this.groundHeight(x, z) + 0.95, z);
  v.yaw = yaw;
  v.speed = 0;
  v.lateral = 0;
  v.pitch = 0;
  v.roll = 0;
  v.overturnT = 0;
  v.dive = 0;
  v.squat = 0;
  v.bodyRoll = 0;
  v.vy = 0;
  v.airborne = false;
  this.airT = 0;
  this.noContactTicks = 0;
  this.syncF = 0;
  this.syncL = 0;
  for (const w of this.wheels) {
    w.comp = 0.16;
    w.compV = 0;
  }
  this.physEuler.set(0, v.yaw, 0, "YXZ");
  this.physQuat.setFromEuler(this.physEuler);
  this.prevQuat.copy(this.physQuat);
  this.currQuat.copy(this.physQuat);
  this.terrainStream?.update(v.pos.x, v.pos.z, true);
  this.propStream?.update(v.pos.x, v.pos.z);
  if (!this.rig) this.rebuildRig();
  const q = this.physQuat;
  this.rig?.teleport({ x: v.pos.x, y: v.pos.y, z: v.pos.z }, { x: q.x, y: q.y, z: q.z, w: q.w });
  this.jeep?.position.copy(v.pos);
  this.jeep?.quaternion.copy(this.physQuat);
  this.jeepHealth = 100;
  this.wreckT = 0;
}

/** `?warp=…` dev/tooling hook (see applyWarp); null when unavailable. */
export function readWarpParam(this: JeepEngine): string | null {
  try {
    return new URLSearchParams(window.location.search).get("warp");
  } catch {
    return null;
  }
}

/** Spawn the jeep at a Port Marin vantage point for inspection. */
export function applyWarp(this: JeepEngine, kind: string): void {
  const target = (() => {
    if (kind === "road") {
      const p = this.city.roadPose(14);
      return { x: p.x, z: p.z, yaw: Math.atan2(-p.tx, -p.tz) };
    }
    if (kind === "crossing") {
      const p = this.city.roadPose(this.city.crossingArc);
      return { x: this.city.crossing.x, z: this.city.crossing.z, yaw: Math.atan2(-p.tx, -p.tz) };
    }
    if (kind === "city" || kind === "aerial") {
      const g = this.city.toWorld(0, -14);
      const c = this.city.toWorld(0, 0);
      return { x: g.x, z: g.z, yaw: Math.atan2(-(c.x - g.x), -(c.z - g.z)) };
    }
    return null;
  })();
  if (!target) return;
  this.warpTo(target.x, target.z, target.yaw);
  this.notify(`Warp: ${kind}`);
}

export function restart(this: JeepEngine): void {
  this.resetVehicle(Math.floor(SAMPLES * 0.01));
  this.v.lap = 0;
  this.v.prevT = 0.01;
  // re-arm the optional loop clock (mid-session restart)
  this.lapStartT = -1;
  this.lapTimes = [];
}
