import * as THREE from "three";
import { clamp } from "../../core/noise";
import { CHIMNEY, TRAIN_SCALE, TRAIN_SPEED, WHISTLE_RANGE } from "./constants";
import type { RailPose, TrainHost } from "./types";

/** One chimney puff of steam, trailing back along the loco's tangent. */
export function emitSmoke(host: TrainHost, loco: THREE.Group, pose: RailPose, tmp: THREE.Vector3): void {
  const wp = tmp.set(CHIMNEY.x * TRAIN_SCALE, CHIMNEY.y * TRAIN_SCALE, CHIMNEY.z * TRAIN_SCALE);
  wp.applyEuler(loco.rotation).add(loco.position);
  const r = Math.random();
  host.puff(
    wp.x + (Math.random() - 0.5) * 0.25,
    wp.y,
    wp.z + (Math.random() - 0.5) * 0.25,
    -pose.tx * 2.6 + (Math.random() - 0.5),
    1.7 + Math.random() * 1.1,
    -pose.tz * 2.6 + (Math.random() - 0.5),
    r < 0.62 ? "#d8d3c8" : r < 0.85 ? "#9a958c" : "#55524c",
    0.55 + Math.random() * 0.35,
    1.3 + Math.random() * 0.7,
  );
}

/** Distance falloff for the audio gain, 0..1. */
export function trainGain(nearest: number): number {
  return clamp(1 / (1 + Math.pow(nearest / 62, 1.7)), 0, 1);
}

/** Stereo bearing (-1..1) of the nearest car relative to the camera right axis. */
export function trainPan(dx: number, dz: number, right: THREE.Vector3): number {
  const l = Math.hypot(dx, dz) || 1;
  return clamp((dx / l) * right.x + (dz / l) * right.z, -1, 1);
}

/** Is the loco within whistle range of any level crossing? */
export function nearCrossing(crossings: { x: number; z: number }[], x: number, z: number): boolean {
  for (const c of crossings) if (Math.hypot(c.x - x, c.z - z) < WHISTLE_RANGE) return true;
  return false;
}

/** Gentle outward bank on curves, from the tangent change over the next 7u. */
export function carRoll(pose: RailPose, ahead: RailPose): number {
  const tx = ahead.tx - pose.tx;
  const tz = ahead.tz - pose.tz;
  // centripetal component along the car's right axis (world up × fwd)
  const lateralK = (tx * -pose.tz + tz * pose.tx) / 7;
  return clamp(-lateralK * TRAIN_SPEED * TRAIN_SPEED * 50, -0.075, 0.075);
}
