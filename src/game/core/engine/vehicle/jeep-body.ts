/** Jeep body. */
import * as THREE from "three";
import type { JeepEngine } from "../jeep-engine";

export function buildJeep(this: JeepEngine): void {
  const scene = this.scene;
  const M = this.M;
  if (!scene) return;
  const jeep = new THREE.Group();
  this.jeep = jeep;
  const bodyGroup = new THREE.Group();
  this.bodyGroup = bodyGroup;
  jeep.add(bodyGroup);

  this.addBodyShell(bodyGroup, M);
  this.addFrontEnd(bodyGroup, M);
  this.addFendersAndGlass(bodyGroup, M);
  this.addCageAndDoors(bodyGroup, M);
  this.addRearAndMounts(bodyGroup, M);

  // interior + undercarriage
  const interior = this.buildInterior();
  interior.position.set(0, -0.12, -0.1);
  bodyGroup.add(interior);
  this.steerWheelObj = interior.getObjectByName("steeringWheel") ?? null;
  // Cache per-frame animated nodes once (performance: no getObjectByName in the hot loop).
  this.speedoNeedle = interior.getObjectByName("speedoNeedle") ?? null;
  this.tachoNeedle = interior.getObjectByName("tachoNeedle") ?? null;
  bodyGroup.add(this.buildUndercarriage());

  // axles
  this.axleF = this.buildAxle(true);
  this.axleF.position.set(0, -0.42, -1.28);
  jeep.add(this.axleF);
  this.axleR = this.buildAxle(false);
  this.axleR.position.set(0, -0.42, 1.32);
  jeep.add(this.axleR);

  // wheels + springs
  for (let i = 0; i < 4; i++) {
    const holder = new THREE.Group();
    const steerG = new THREE.Group();
    const spin = this.buildWheel();
    spin.name = "spin";
    steerG.add(spin);
    holder.add(steerG);
    holder.position.copy(this.wheelPos[i]);
    holder.position.y = -0.42;
    jeep.add(holder);
    this.wheels.push({
      holder,
      steerG,
      spin,
      base: this.wheelPos[i].clone(),
      comp: 0,
      compV: 0,
      contact: 0,
      angle: 0,
      front: i < 2,
    });
    const sp = this.buildSpring();
    sp.position.set(this.wheelPos[i].x * 0.72, -0.42, this.wheelPos[i].z);
    jeep.add(sp);
    this.springs.push(sp);
    this.springParts.push({
      coil: sp.getObjectByName("coil") ?? null,
      rod: sp.getObjectByName("rod") ?? null,
    });
  }

  // --- Kenney car swap rig -------------------------------------------------
  // The car body mounts into bodyGroup (inheriting the vibration shake).
  // The jeep's own body visuals are moved into jeepBodyStash — hidden —
  // only while a Kenney car is active (see applyVehicleVisuals). The
  // interior and the headlight SpotLights always stay in bodyGroup; the
  // stock light transforms are remembered for the restore path.
  for (const sl of this.headlights) {
    this.headlightHome.push({
      light: sl,
      pos: sl.position.clone(),
      target: sl.target.position.clone(),
    });
  }
  jeep.add(this.jeepBodyStash);
  bodyGroup.add(this.carBody);

  scene.add(jeep);
}
