/** Explorer skin swap and physics rig rebuild. */
import { VehicleRig, type VehicleSpec } from "../../../physics/physics";
import type { SkinId } from "../../../player/character";
import { clamp } from "../../noise";
import { GRAVITY } from "../config/world-constants";
import type { JeepEngine } from "../jeep-engine";

/** Change the explorer's skin (character select); resolves once applied. */
export async function setSkin(this: JeepEngine, id: SkinId): Promise<void> {
  this.skin = id;
  await this.explorer?.setSkin(id);
}

/** Vehicle constants → physics spec (the jeep is the baseline). */
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
