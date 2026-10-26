/**
 * Headless TrainSystem test: loads the real GLBs from public/assets/jeep/train
 * (Node shims in glb-shim.ts) and drives the system against a spy host.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import "./glb-shim";
import { TRAIN_SPEED } from "./constants";
import { TrainSystem } from "./train-system";
import type { RailPose } from "./types";
import { flat, makeSpyHost } from "./test-helpers";

describe("TrainSystem", () => {
  const STEP = 1 / 60;

  async function booted() {
    const rail = flat();
    const { host, spy } = makeSpyHost(rail, [{ x: rail.pts[0].x, z: rail.pts[0].z }]);
    const sys = new TrainSystem(host);
    await sys.load();
    sys.spawn();
    return { rail, spy, sys };
  }

  it("builds the five-car consist from the shipped GLBs", async () => {
    const { sys } = await booted();
    expect(sys.carCount).toBe(5);
  });

  it("runs forever: advances, smokes, tracks colliders and rams the player", async () => {
    const { rail, spy, sys } = await booted();
    const pose: RailPose = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
    let d = 0;
    let soundGained = false;
    for (let k = 0; k < 60 * 10; k++) {
      // ride along ON the track — the player stands where the loco will be
      rail.pose(d + 1, pose);
      sys.update(STEP, new THREE.Vector3(pose.x, pose.y, pose.z));
      soundGained ||= sys.sound.gain > 0.5;
      d += TRAIN_SPEED * STEP;
    }
    expect(sys.sound.gain).toBeGreaterThan(0.5); // never silent up close
    expect(soundGained).toBe(true);
    expect(spy.puffs).toBeGreaterThan(75); // chimney never stops (~0.11s cadence)
    expect(spy.boxes.added).toBeGreaterThanOrEqual(5); // one collider per car
    expect(spy.boxes.removed).toBe(0); // cars stay live while the player rides along
    expect(spy.rams.length).toBeGreaterThanOrEqual(5); // run over, repeatedly
    expect(spy.whistles).toBeGreaterThanOrEqual(1); // announced the crossing
  });

  it("goes quiet when the player is far away", async () => {
    const { sys } = await booted();
    sys.update(STEP, new THREE.Vector3(5000, 0, 5000));
    expect(sys.sound.gain).toBe(0);
  });
});
