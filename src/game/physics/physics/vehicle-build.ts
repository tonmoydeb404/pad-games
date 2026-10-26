import { RAPIER } from "./rapier";
import type { PhysicsWorld } from "./physics-world";
import { SUSPENSION_REST, SUSPENSION_TRAVEL, type Quat, type Vec3, type VehicleSpec } from "./vehicle-types";

export interface BuiltVehicle {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  controller: RAPIER.DynamicRayCastVehicleController;
  inertia: Vec3;
}

/** Create the body, shell collider, mass properties and wheel controller. */
export function createVehicle(pw: PhysicsWorld, spec: VehicleSpec, pos: Vec3, quat: Quat, vel: Vec3): BuiltVehicle {
  const world = pw.world;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation(quat)
      .setLinvel(vel.x, vel.y, vel.z)
      .setCanSleep(false)
      .setCcdEnabled(true)
      .setAngularDamping(0.15),
  );
  // slab shell: sits above the wheels, slightly shorter than the footprint
  const hh = 0.5;
  const collider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(spec.width / 2 - 0.05, hh, spec.length / 2 - 0.1)
      .setTranslation(0, 0.2, 0)
      .setDensity(0)
      .setFriction(0.25)
      .setRestitution(spec.restitution ?? 0.1)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(spec.mass * 6), // report even gentle contact (Δv ≈ 0.1/tick)
    body,
  );
  // box inertia about the (lowered) COM; a touch generous for stability
  const w = spec.width;
  const h = 1.4;
  const l = spec.length;
  const m = spec.mass;
  const inertia = { x: (m * (h * h + l * l)) / 12, y: (m * (w * w + l * l)) / 12, z: (m * (w * w + h * h)) / 12 };
  body.setAdditionalMassProperties(
    m,
    { x: 0, y: spec.comY, z: 0 },
    { x: inertia.x * 1.25, y: inertia.y * 1.25, z: inertia.z * 1.25 },
    { x: 0, y: 0, z: 0, w: 1 },
    true,
  );

  const c = world.createVehicleController(body);
  const k = spec.spring / 4; // mass-normalised per-wheel stiffness
  const eq = spec.gravity / spec.spring; // static compression
  const zeta = Math.min(0.9, Math.max(0.25, spec.damp / (2 * Math.sqrt(spec.spring))));
  const dW = (zeta * 2 * Math.sqrt(spec.spring)) / 4;
  for (let i = 0; i < 4; i++) {
    const wh = spec.wheels[i];
    // connection point so the wheel centre rests at -axleOff when compressed by `eq`
    const connY = -spec.axleOff + SUSPENSION_REST - eq;
    c.addWheel({ x: wh.x, y: connY, z: wh.z }, { x: 0, y: -1, z: 0 }, { x: 1, y: 0, z: 0 }, SUSPENSION_REST, spec.wheelR);
    c.setWheelSuspensionStiffness(i, k);
    c.setWheelSuspensionCompression(i, dW * 0.9);
    c.setWheelSuspensionRelaxation(i, dW * 1.1);
    c.setWheelMaxSuspensionTravel(i, SUSPENSION_TRAVEL);
    c.setWheelMaxSuspensionForce(i, m * spec.gravity * 12);
    c.setWheelFrictionSlip(i, 10.5);
    c.setWheelSideFrictionStiffness(i, 1);
  }
  return { body, collider, controller: c, inertia };
}
