/** Mounting, dismounting and calling animals. */
import type { RideHandle, RideInfo } from "../../../world/animals";
import { clamp } from "../../noise";
import { heal } from "../../../player/state";
import { RIDE_REACH, ENTER_DIST } from "../config/foot-constants";
import type { JeepEngine } from "../jeep-engine";

export function refreshNearRide(this: JeepEngine): void {
  const f = this.foot;
  const h = this.animals?.findRideable(f.pos.x, f.pos.z, RIDE_REACH) ?? null;
  if (!h || f.downT > 0) {
    this.nearRide = null;
    return;
  }
  const info = this.animals!.rideInfo(h);
  this.nearRide = { h, name: info.name, dist: Math.hypot(info.x - f.pos.x, info.z - f.pos.z) };
}

/** F on foot: climb onto the nearest rideable animal, else hop in the car. */
export function tryEnterOrMount(this: JeepEngine): void {
  if (this.riding) {
    this.dismount(true);
    return;
  }
  const r = this.nearRide;
  if (r && this.ridePreferred()) this.mount(r.h);
  else this.tryEnterCar();
}

/** An animal within reach beats the car unless the car is clearly closer. */
export function ridePreferred(this: JeepEngine): boolean {
  const r = this.nearRide;
  if (!r) return false;
  const carD = Math.hypot(this.foot.pos.x - this.v.pos.x, this.foot.pos.z - this.v.pos.z);
  return carD > ENTER_DIST || r.dist < carD + 1.2;
}

export function mount(this: JeepEngine, h: RideHandle): void {
  const ex = this.explorer;
  const an = this.animals;
  if (!ex || !an || this.foot.downT > 0) return;
  const f = this.foot;
  an.startRide(h); // measures the back from the live pose — read the seat after this
  const info = an.rideInfo(h);
  this.holster();
  this.riding = h;
  this.rideName = info.name;
  this.rideSeat = info.seat;
  this.rideSpecialName = info.special.name;
  this.rideRadius = info.radius;
  // the camera backs off and rises with the mount's size
  this.rideCamDist = 0.8 + info.seat.len * 0.9;
  this.rideCamLift = 0.3 + info.seat.y * 0.35;
  f.act = null;
  f.queued = null;
  f.crouch = false;
  f.vx = f.vz = f.vy = 0;
  f.grounded = true;
  f.yaw = info.yaw;
  this.footCam.yaw = info.yaw;
  this.nearRide = null;
  this.audio.thump(0.2);
  this.input.rumble(0.2, 120);
  this.setTip();
  this.notify(`Riding the ${info.name.replace(/_/g, " ")} — Space jump · Q ${info.special.name}`);
}

/** Slide off beside the animal (or, `place=false`, leave placement to the caller). */
export function dismount(this: JeepEngine, place: boolean): void {
  const h = this.riding;
  const an = this.animals;
  const f = this.foot;
  if (!h || !an) {
    this.riding = null;
    return;
  }
  const info = an.rideInfo(h);
  an.endRide(h);
  this.riding = null;
  this.explorer?.setSeated(0);
  f.vx = f.vz = f.vy = 0;
  if (place) {
    // step off on the animal's right-hand side
    const side = info.radius + 0.9;
    f.pos.x = info.x + Math.cos(info.yaw) * side;
    f.pos.z = info.z - Math.sin(info.yaw) * side;
    f.pos.y = this.groundHeight(f.pos.x, f.pos.z);
    f.grounded = true;
    this.audio.thump(0.15);
    this.setTip();
    this.notify("On foot");
  }
}

/** Special-move key while mounted: each species has its own (charge, leap, roar, web…). */
export function mountSpecial(this: JeepEngine): void {
  const h = this.riding;
  const an = this.animals;
  if (!h || !an) return;
  const r = an.rideSpecial(h);
  if (!r.ready) {
    this.notify(`${r.name} — ready in ${Math.ceil(r.cdLeft)}s`);
    return;
  }
  if (r.call) this.audio.animalCall(r.call.kind, r.call.pitch);
  this.audio.thump(r.thud);
  if (r.shake > 0.4) this.audio.thud(r.shake);
  this.camState.trauma = Math.min(1, this.camState.trauma + r.shake);
  this.input.rumble(clamp(0.25 + r.shake, 0.25, 1), 160);
  if (r.heal > 0) heal(this.player.vitals, r.heal);
  this.notify(r.text);
}

/** Horn key while mounted: the animal's own call (bark, neigh, roar…). */
export function mountCall(this: JeepEngine): void {
  const h = this.riding;
  const an = this.animals;
  if (!h || !an) return;
  const info: RideInfo = an.rideInfo(h);
  this.audio.animalCall(info.call.kind, info.call.pitch);
  an.rideCall(h);
  this.camState.trauma = Math.min(1, this.camState.trauma + 0.05 + info.mass / 40000);
  this.notify(info.call.text);
}
