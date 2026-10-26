/**
 * Test-only: runs the real JeepEngine vehicle step headlessly — real terrain,
 * kickers, Rapier, arcade intents — with stubbed meshes, audio and input (no
 * WebGL, no DOM). Not imported by the app.
 */
import * as THREE from "three";
import { JeepEngine } from "./engine";
import { initPhysics, PhysicsWorld, PropStreamer, TerrainStreamer } from "../physics/physics";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type TestEngine = any;

export async function makeEngine(): Promise<TestEngine> {
  const g = globalThis as any;
  g.window ??= g;
  g.navigator ??= { getGamepads: () => [] };
  g.document ??= { createElement: () => ({ getContext: () => null }), addEventListener() {} };
  g.window.addEventListener ??= () => {};
  g.addEventListener ??= () => {};
  const e: TestEngine = new JeepEngine({ container: {} as HTMLElement, quality: "low" });
  e.scene = new THREE.Scene();
  e.buildTerrain();
  await initPhysics();
  e.pw = new PhysicsWorld(20);
  e.propStream = new PropStreamer(e.pw);
  e.terrainStream = new TerrainStreamer(e.pw, e.heightGrid, 32, 1);
  const wp = [[-0.86, -1.28], [0.86, -1.28], [-0.86, 1.32], [0.86, 1.32]];
  e.wheels = wp.map(([x, z], i) => ({
    holder: new THREE.Group(),
    steerG: new THREE.Group(),
    spin: new THREE.Group(),
    base: new THREE.Vector3(x, 0, z),
    comp: 0.16,
    compV: 0,
    contact: 0,
    angle: 0,
    front: i < 2,
  }));
  e.springs = wp.map(() => new THREE.Group());
  e.springParts = wp.map(() => ({ coil: null, rod: null }));
  e.jeep = new THREE.Group();
  e.notify = () => {};
  e.audio = new Proxy({}, { get: () => () => {} });
  e.input = Object.assign(Object.create(null), { rumble() {}, update() {}, consumeActions: () => [] });
  e.spawnParticle = () => {};
  e.spawnDebris = () => {};
  e.resetVehicle(Math.floor(1400 * 0.01));
  for (let i = 0; i < 90; i++) e.updateVehicle(1 / 60); // settle
  return e;
}

export interface DriveStats {
  hits: number;
  flights: number;
  airTicks: number;
  minUp: number;
  maxOffRoad: number;
  /** Ride clearance (body origin − ground) sampled while ≥3 wheels touch. */
  clearance: number[];
  progress: number;
}

/** Follow the trail with a look-ahead steerer — a stand-in for a driver. */
export function autopilot(e: TestEngine, secs: number, targetSpeed: number): DriveStats {
  const v = e.v;
  const pts = e.trailPts;
  const st: DriveStats = { hits: 0, flights: 0, airTicks: 0, minUp: 1, maxOffRoad: 0, clearance: [], progress: 0 };
  const orig = e.collisionFx.bind(e);
  e.collisionFx = (i: number, nx: number, nz: number) => {
    st.hits++;
    orig(i, nx, nz);
  };
  let wasAir = false;
  for (let k = 0; k < secs * 60; k++) {
    const info = e.trailInfo(v.pos.x, v.pos.z);
    st.maxOffRoad = Math.max(st.maxOffRoad, info.dist);
    const tp = pts[(info.i + Math.floor(8 + Math.abs(v.speed) * 0.55)) % 1400];
    const want = Math.atan2(-(tp.x - v.pos.x), -(tp.z - v.pos.z));
    let err = want - v.yaw;
    while (err > Math.PI) err -= 2 * Math.PI;
    while (err < -Math.PI) err += 2 * Math.PI;
    v.steerTarget = Math.max(-1, Math.min(1, err * 2.2));
    const tgt = targetSpeed * (1 - Math.min(0.55, Math.abs(err) * 0.9));
    v.throttle = v.speed < tgt ? 1 : 0;
    v.brake = v.speed > tgt + 4 ? 0.6 : 0;
    e.updateVehicle(1 / 60);
    if (v.airborne) st.airTicks++;
    if (v.airborne && !wasAir) st.flights++;
    wasAir = v.airborne;
    st.minUp = Math.min(st.minUp, e.rig.up().y);
    if (e.rig.contacts >= 3) st.clearance.push(v.pos.y - e.groundHeight(v.pos.x, v.pos.z));
  }
  e.collisionFx = orig;
  st.progress = v.progress;
  return st;
}
