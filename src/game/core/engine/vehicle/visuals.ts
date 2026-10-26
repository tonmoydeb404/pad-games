/** Applies a Kenney car (or the classic jeep) to the vehicle visuals. */
import * as THREE from "three";
import { JEEP_PERF, WHEEL_CONTACT, type LoadedCar } from "../../../player/cars";
import type { JeepEngine } from "../jeep-engine";

export function applyVehicleVisuals(this: JeepEngine, car: LoadedCar | null): void {
  const jeep = this.jeep;
  const bodyGroup = this.bodyGroup;
  if (!jeep || !bodyGroup || car === this.activeCar) return;

  // Stash the jeep's wheel visuals on first swap so they can be restored.
  if (this.jeepWheelStash.length === 0) {
    for (const w of this.wheels) this.jeepWheelStash.push(w.spin.children.slice());
  }

  // --- wheels: swap spin visuals + move holders to the car's footprint
  for (let i = 0; i < this.wheels.length; i++) {
    const w = this.wheels[i];
    w.spin.clear();
    if (car) {
      const cw = car.wheels[i];
      if (cw) {
        for (const p of cw.parts) {
          const m = new THREE.Mesh(p.geometry, p.material);
          m.castShadow = true;
          m.receiveShadow = true;
          w.spin.add(m);
        }
        // base.y = per-wheel lift so wheels of different radii (tractors)
        // all touch the ground despite the shared axle height
        w.base.set(cw.x, cw.radius - this.wheelR, cw.z);
        w.holder.position.set(cw.x, -this.axleOff + w.base.y, cw.z);
      }
    } else {
      for (const obj of this.jeepWheelStash[i] ?? []) w.spin.add(obj);
      w.holder.position.set(this.wheelPos[i].x, -this.axleOff, this.wheelPos[i].z);
    }
    w.base.set(w.holder.position.x, 0, w.holder.position.z);
  }

  // --- body: stash jeep visuals (seats/interior included — they are
  // jeep-only dressing), mount the car's
  if (car) {
    if (!this.activeCar) {
      for (const child of [...bodyGroup.children]) {
        if (child === this.carBody) continue;
        if (this.headlightHome.some((h) => h.light === child || h.light.target === child)) continue;
        this.jeepBodyStash.add(child);
      }
      this.jeepBodyStash.visible = false;
    }
    this.carBody.clear();
    for (const p of car.parts) {
      const m = new THREE.Mesh(p.geometry, p.material);
      m.castShadow = true;
      m.receiveShadow = true;
      this.carBody.add(m);
    }
    // The model's own ground plane sits exactly on the wheel-contact plane.
    this.carBody.position.y = -WHEEL_CONTACT;
  } else {
    this.carBody.clear();
    if (this.activeCar) {
      // Restore stashed jeep body visuals (keeps their local transforms).
      while (this.jeepBodyStash.children.length > 0) {
        bodyGroup.add(this.jeepBodyStash.children[0]);
      }
      this.jeepBodyStash.visible = false;
    }
  }

  // --- jeep-only dressing: springs + axles hide under a car body
  for (const sp of this.springs) sp.visible = !car;
  if (this.axleF) this.axleF.visible = !car;
  if (this.axleR) this.axleR.visible = !car;

  // --- suspension/collision constants per vehicle
  if (car) {
    this.wheelR = car.wheelR;
    this.axleOff = WHEEL_CONTACT - car.wheelR;
    this.carR = Math.max(0.9, car.length * 0.37);
    this.track = Math.max(1.0, car.track);
    this.carLen = car.length;
    this.carWid = car.track + 0.4;
    this.exhaustZ = car.length * 0.48;
    this.perf = car.spec.perf;
  } else {
    this.wheelR = 0.5;
    this.axleOff = 0.42;
    this.carR = 1.3;
    this.track = 1.72;
    this.carLen = 3.55;
    this.carWid = 1.9;
    this.exhaustZ = 1.72;
    this.perf = { ...JEEP_PERF };
  }

  // --- headlights follow the vehicle's nose
  const fz = car ? -car.length / 2 : 0;
  const fy = car ? car.bodyH * 0.55 - WHEEL_CONTACT : 0;
  this.headlightHome.forEach((h, i) => {
    const sx = i === 0 ? -1 : 1;
    if (car) {
      h.light.position.set(sx * this.track * 0.32, fy, fz - 0.08);
      h.light.target.position.set(sx * this.track * 0.3, fy - 1.2, fz - 14);
    } else {
      h.light.position.copy(h.pos);
      h.light.target.position.copy(h.target);
    }
  });

  this.activeCar = car;
  for (const w of this.wheels) {
    w.comp = 0.16;
    w.compV = 0;
  }
  this.rebuildRig();
}
