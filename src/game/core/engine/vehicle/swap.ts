/** Vehicle and skin swapping, preview rig and physics rig rebuild. */
import * as THREE from "three";
import { VehicleRig, type VehicleSpec } from "../../../physics/physics";
import { loadCar } from "../../../player/cars";
import type { SkinId } from "../../../player/character";
import { clamp } from "../../noise";
import { GRAVITY } from "../config/world-constants";
import type { JeepEngine } from "../jeep-engine";

/**
 * Swap the visible vehicle. `null` restores the classic jeep. Loads the
 * model on first use (then cached); resolves false when unavailable.
 */
export async function setVehicle(this: JeepEngine, id: string | null): Promise<boolean> {
  const serial = ++this.vehicleSerial;
  if (!id) {
    if (serial === this.vehicleSerial) this.applyVehicleVisuals(null);
    this.notify("Jungle Jeep");
    return true;
  }
  const car = await loadCar(id);
  if (!car) {
    this.notify("Vehicle unavailable");
    return false;
  }
  if (serial === this.vehicleSerial) this.applyVehicleVisuals(car);
  this.notify(car.spec.label);
  return true;
}

/** Change the explorer's skin (character select); resolves once applied. */
export async function setSkin(this: JeepEngine, id: SkinId): Promise<void> {
  this.skin = id;
  await this.explorer?.setSkin(id);
}

/**
 * Clone of the classic jeep (body + wheels, shared geometry) for the
 * start-screen turntable. The rig is lifted so the wheels touch y = 0,
 * matching the loader's car convention. Null before the world exists or
 * while nothing is built yet.
 */
export function getJeepPreviewRig(this: JeepEngine): THREE.Group | null {
  const bodyGroup = this.bodyGroup;
  if (!this.jeep || !bodyGroup) return null;

  const rig = new THREE.Group();
  const mounted = new Set<THREE.Object3D>([this.carBody]);
  for (const h of this.headlightHome) {
    mounted.add(h.light);
    mounted.add(h.light.target);
  }
  const addClone = (child: THREE.Object3D): void => {
    if (mounted.has(child)) return;
    rig.add(child.clone(true));
  };
  // the jeep body lives in bodyGroup (jeep active) or the stash (car active)
  for (const child of bodyGroup.children) addClone(child);
  for (const child of this.jeepBodyStash.children) addClone(child);
  // wheels likewise (spin groups vs stash)
  for (let i = 0; i < 4; i++) {
    const src = this.jeepWheelStash.length > 0 ? this.jeepWheelStash[i] : (this.wheels[i]?.spin.children ?? []);
    for (const obj of src) {
      const clone = obj.clone(true);
      clone.position.set(this.wheelPos[i].x, -0.42, this.wheelPos[i].z);
      rig.add(clone);
    }
  }

  const outer = new THREE.Group();
  outer.add(rig);
  rig.position.y = 0.92; // wheel bottoms (r 0.5 at axle −0.42) land on y 0
  return outer;
}

/** Vehicle constants → physics spec (per car; the jeep is the baseline). */
export function vehicleSpec(this: JeepEngine): VehicleSpec {
  return {
    mass: 1000 * this.perf.mass,
    length: this.carLen,
    width: this.carWid,
    wheelR: this.wheelR,
    axleOff: this.axleOff,
    wheels: this.wheels.map((w) => ({ x: w.base.x, z: w.base.z })),
    spring: this.perf.spring,
    damp: this.perf.damp,
    // tall vehicles carry their weight higher → lean and tip more
    comY: -0.55 + 0.25 * this.perf.roll,
    gravity: GRAVITY,
    // heavy vehicles plow through, light ones ricochet
    restitution: clamp(0.3 / this.perf.mass, 0.05, 0.5),
  };
}

/** (Re)build the rigid body + vehicle controller for the active vehicle. */
export function rebuildRig(this: JeepEngine): void {
  if (!this.pw || this.wheels.length < 4) return;
  const spec = this.vehicleSpec();
  if (this.rig) this.rig.build(spec);
  else {
    const v = this.v;
    this.physEuler.set(0, v.yaw, 0, "YXZ");
    const q = this.physQuat.setFromEuler(this.physEuler);
    this.terrainStream?.update(v.pos.x, v.pos.z, true);
    this.rig = new VehicleRig(this.pw, spec, { x: v.pos.x, y: v.pos.y, z: v.pos.z }, { x: q.x, y: q.y, z: q.z, w: q.w });
  }
}
