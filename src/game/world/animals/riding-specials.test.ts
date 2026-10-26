/** Riding: per-species special moves. */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { STEP, booted, faceSouth, idleSnap } from "./test-helpers";

describe("AnimalSystem", () => {
  describe("riding", () => {
    it("each species has its own special, with a cooldown", async () => {
      const { sys } = await booted();
      const names = new Map<string, string>();
      let x = -300;
      for (const f of [
        "Deer", "Stag", "Fox", "Wolf", "Husky", "ShibaInu", "Horse", "Donkey", "Alpaca", "Cow", "Bull",
        "Frog", "Snake", "Rat", "Spider", "Wasp", "Trex", "Velociraptor", "Triceratops", "Stegosaurus",
        "Apatosaurus", "Parasaurolophus",
      ]) {
        if (sys.countOf(f) === 0) continue;
        x += 25;
        expect(sys.place(f, 0, x, 300)).toBe(true);
        const info = sys.rideInfo(sys.findRideable(x, 300, 2)!);
        names.set(f, info.special.name);
        expect(info.special.name.length).toBeGreaterThan(2);
        expect(info.special.cd).toBeGreaterThan(1);
      }
      expect(new Set(names.values()).size).toBeGreaterThanOrEqual(16); // mostly all different
      // cooldown: a second press right away isn't ready, and counts down while riding
      expect(sys.place("Cow", 0, 0, 10)).toBe(true);
      const cow = sys.findRideable(0, 10, 2)!;
      sys.startRide(cow);
      const first = sys.rideSpecial(cow);
      expect(first.ready).toBe(true);
      expect(first.heal).toBe(30); // fresh milk
      const again = sys.rideSpecial(cow);
      expect(again.ready).toBe(false);
      expect(again.cdLeft).toBeGreaterThan(15);
      for (let i = 0; i < 60 * 5; i++) sys.rideStep(cow, STEP, 0, 0);
      expect(sys.rideInfo(cow).special.cdLeft).toBeLessThan(16);
      sys.destroy();
    });

    it("bull charge: a burst of speed well past top speed that then fades", async () => {
      const { sys } = await booted();
      expect(sys.place("Bull", 0, 0, 10)).toBe(true);
      const bull = sys.findRideable(0, 10, 2)!;
      sys.startRide(bull);
      const top = sys.rideInfo(bull).topSpeed;
      expect(sys.rideSpecial(bull).ready).toBe(true);
      let peak = 0;
      for (let i = 0; i < 60 * 3; i++) peak = Math.max(peak, sys.rideStep(bull, STEP, 0, 0).speed); // no stick at all
      expect(peak).toBeGreaterThan(top * 1.5);
      let end = 0;
      for (let i = 0; i < 60 * 4; i++) end = sys.rideStep(bull, STEP, 0, 0).speed;
      expect(end).toBeLessThan(top * 0.3); // charge over, no input: it slows right down
      sys.destroy();
    });

    it("T-Rex roar scares and freezes the animals around it; the stun wears off", async () => {
      const { sys } = await booted();
      expect(sys.place("Trex", 0, 0, 0)).toBe(true);
      expect(sys.place("Deer", 0, 12, 0)).toBe(true);
      const trex = sys.findRideable(0, 0, 3)!;
      sys.startRide(trex);
      expect(sys.rideSpecial(trex).call?.kind).toBe("roar");
      expect(sys.stateOf("Deer", 0)).toBe("flee");
      const deer0 = sys.debugPos("Deer", 0)!; // after the roar's own shove
      // stunned: it does not run for a moment…
      for (let i = 0; i < 60; i++) sys.update(STEP, idleSnap(0, 0));
      const mid = sys.debugPos("Deer", 0)!;
      expect(Math.hypot(mid.x - deer0.x, mid.z - deer0.z)).toBeLessThan(0.6);
      // …and then it bolts
      for (let i = 0; i < 60 * 4; i++) sys.update(STEP, idleSnap(0, 0));
      const late = sys.debugPos("Deer", 0)!;
      expect(Math.hypot(late.x - deer0.x, late.z - deer0.z)).toBeGreaterThan(5);
      sys.destroy();
    });

    it("donkey rear kick hits what is BEHIND it, not what is ahead", async () => {
      const { sys } = await booted();
      expect(sys.countOf("Fox")).toBeGreaterThanOrEqual(2);
      expect(sys.place("Donkey", 0, 0, 0)).toBe(true);
      const donkey = sys.findRideable(0, 0, 3)!;
      sys.startRide(donkey);
      faceSouth(sys, donkey);
      const d = sys.rideInfo(donkey);
      // heading is +z: ahead = +z, behind = -z
      expect(sys.place("Fox", 0, d.x, d.z + 5)).toBe(true); // ahead
      expect(sys.place("Fox", 1, d.x, d.z - 5)).toBe(true); // behind
      expect(sys.rideSpecial(donkey).ready).toBe(true);
      expect(["dead", "ragdoll"]).toContain(sys.stateOf("Fox", 1)); // 38 dmg vs 25 hp
      expect(sys.stateOf("Fox", 0)).toBe("idle");
      sys.destroy();
    });

    it("frog mega leap: launches high and the landing splash hurts what is near", async () => {
      const { sys } = await booted();
      expect(sys.place("Frog", 0, 0, 0)).toBe(true);
      const frog = sys.findRideable(0, 0, 3)!;
      sys.startRide(frog);
      faceSouth(sys, frog);
      const f0 = sys.rideInfo(frog);
      // leap: ~1.8 s airborne at ~9.6 u/s (hop travel is 1.6×) → lands ~17 m ahead; the fox waits near there
      expect(sys.place("Fox", 0, f0.x, f0.z + 17)).toBe(true);
      expect(sys.rideSpecial(frog).ready).toBe(true);
      let peak = 0;
      for (let i = 0; i < 60 * 4; i++) {
        const r = sys.rideStep(frog, STEP, Math.PI, 0);
        peak = Math.max(peak, r.y);
        if (i === 20) expect(sys.stateOf("Fox", 0)).toBe("idle"); // nothing happens while it is still in the air
      }
      expect(peak).toBeGreaterThan(8);
      expect(sys.stateOf("Fox", 0)).not.toBe("idle"); // the splash (18 dmg) hit it on landing
      sys.destroy();
    });

    it("a ridden heavy animal rams another animal with its own weight — without hurting the jeep", async () => {
      const { spy, sys } = await booted();
      expect(sys.place("Trex", 0, 0, 0)).toBe(true);
      expect(sys.place("Fox", 0, 0, -12)).toBe(true);
      const trex = sys.findRideable(0, 0, 2)!;
      sys.startRide(trex);
      let pos = sys.rideInfo(trex);
      let dead = false;
      for (let i = 0; i < 600 && !dead; i++) {
        const r = sys.rideStep(trex, STEP, 0, 1); // north (-z)
        pos = { ...pos, ...r };
        sys.update(STEP, {
          pos: new THREE.Vector3(r.x, 0, r.z), speed: r.speed, lateral: 0, yaw: r.yaw,
          radius: pos.radius, onFoot: true, stealth: 1, mountMass: pos.mass,
        });
        dead = sys.stateOf("Fox", 0) === "dead" || sys.stateOf("Fox", 0) === "ragdoll";
      }
      expect(dead).toBe(true);
      expect(spy.kills.some((k) => k.name === "Fox")).toBe(true);
      expect(spy.keeps).toHaveLength(0); // the real car is never touched
      expect(spy.heavyHits).toHaveLength(0);
      sys.destroy();
    });
  });
});
