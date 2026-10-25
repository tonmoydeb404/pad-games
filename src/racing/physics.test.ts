/**
 * Headless Rapier checks for the racing vehicle: it settles on the ground,
 * drives toward -Z, brakes to a stop, and a ramp trimesh carries it upward.
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { IDLE_INTENT, PhysicsWorld, VehicleRig, initPhysics, type VehicleSpec } from "./physics";

const SPEC: VehicleSpec = {
  mass: 920,
  length: 3.9,
  width: 1.9,
  wheelR: 0.33,
  axleOff: 0.45,
  wheels: [
    { x: -0.85, z: -1.3 },
    { x: 0.85, z: -1.3 },
    { x: -0.85, z: 1.3 },
    { x: 0.85, z: 1.3 },
  ],
  spring: 172,
  damp: 13,
  comY: -0.12,
  gravity: 20,
  restitution: 0.1,
};
const DT = 1 / 60;

async function world(): Promise<{ pw: PhysicsWorld; rig: VehicleRig }> {
  await initPhysics();
  const pw = new PhysicsWorld(20);
  pw.addGround(500);
  const rig = new VehicleRig(pw, SPEC, { x: 0, y: 1, z: 0 });
  return { pw, rig };
}

function run(pw: PhysicsWorld, rig: VehicleRig, ticks: number, intent = IDLE_INTENT): void {
  for (let i = 0; i < ticks; i++) {
    rig.drive(intent, DT);
    pw.step(DT);
  }
}

describe("racing vehicle on Rapier", () => {
  it("settles on all four wheels", async () => {
    const { pw, rig } = await world();
    run(pw, rig, 120);
    expect(rig.contacts).toBe(4);
    expect(rig.body.translation().y).toBeGreaterThan(0.3);
    expect(rig.body.translation().y).toBeLessThan(1.0);
  });

  it("accelerates toward -Z and brakes back down", async () => {
    const { pw, rig } = await world();
    run(pw, rig, 60);
    run(pw, rig, 180, { ...IDLE_INTENT, driveAccel: 28 });
    const fast = rig.speeds().forward;
    expect(fast).toBeGreaterThan(20);
    expect(rig.body.translation().z).toBeLessThan(-20);
    run(pw, rig, 240, { ...IDLE_INTENT, brakeAccel: 32 });
    expect(rig.speeds().forward).toBeLessThan(2);
  });

  it("climbs a trimesh ramp", async () => {
    const { pw, rig } = await world();
    // wedge rising 3 m over 20 m along -Z, starting at z = -10
    const g = new THREE.BufferGeometry();
    const v = new Float32Array([
      -4, 0, 10, 4, 0, 10, -4, 3, -10, 4, 3, -10,
    ]);
    g.setAttribute("position", new THREE.BufferAttribute(v, 3));
    g.setIndex([0, 1, 2, 1, 3, 2]);
    pw.addTrimesh(g, 0, -20, 0, 1, 1);
    run(pw, rig, 60);
    let peak = 0;
    for (let i = 0; i < 240; i++) {
      run(pw, rig, 1, { ...IDLE_INTENT, driveAccel: 28 });
      peak = Math.max(peak, rig.body.translation().y);
    }
    expect(peak).toBeGreaterThan(2.5);
  });
});
