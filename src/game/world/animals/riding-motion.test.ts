/** Riding: jumps, frog hops and flyers. */
import { describe, expect, it } from "vitest";
import { STEP, booted, faceSouth } from "./test-helpers";

describe("AnimalSystem", () => {
  describe("riding", () => {
    it("every ridden animal jumps with its own height; the jump is a real arc", async () => {
      const { sys } = await booted();
      expect(sys.place("Horse", 0, 0, 10)).toBe(true);
      expect(sys.place("Cow", 0, 40, 10)).toBe(true);
      const horse = sys.findRideable(0, 10, 2)!;
      const cow = sys.findRideable(40, 10, 2)!;
      sys.startRide(horse);
      sys.startRide(cow);
      expect(sys.rideInfo(horse).jumpHeight).toBeGreaterThan(sys.rideInfo(cow).jumpHeight);

      const peakOf = (h: object): number => {
        expect(sys.rideJump(h)).toBe(true);
        expect(sys.rideJump(h)).toBe(false); // no double jump in the air
        let peak = 0;
        let landed = false;
        for (let i = 0; i < 240 && !landed; i++) {
          const r = sys.rideStep(h, STEP, 0, 0);
          peak = Math.max(peak, r.y);
          landed = i > 5 && r.y === 0;
        }
        expect(landed).toBe(true);
        return peak; // (the loop above ends grounded, so the next call can jump again)
      };
      expect(peakOf(horse)).toBeGreaterThan(1.8);
      expect(peakOf(horse)).toBeLessThan(2.3);
      expect(peakOf(cow)).toBeGreaterThan(0.8);
      expect(peakOf(cow)).toBeLessThan(1.1);
      sys.destroy();
    });

    it("a frog travels in real hops, and the rider's level follows the body exactly", async () => {
      const { sys } = await booted();
      expect(sys.place("Frog", 0, 0, 10)).toBe(true);
      const frog = sys.findRideable(0, 10, 2)!;
      sys.startRide(frog);
      faceSouth(sys, frog);
      const start = sys.rideInfo(frog);
      let landings = 0;
      let prevY = 0;
      let maxY = 0;
      let groundedMoves = 0;
      let prevPos = { x: start.x, z: start.z };
      for (let i = 0; i < 60 * 4; i++) {
        const r = sys.rideStep(frog, STEP, Math.PI, 1);
        // the engine seats the rider at r.y + seat.y: the body y IS the arc, nothing else
        expect(r.y).toBe(sys.rideInfo(frog).y);
        if (prevY > 0 && r.y === 0) landings++;
        if (r.y === 0 && Math.hypot(r.x - prevPos.x, r.z - prevPos.z) > 0.05) groundedMoves++;
        prevY = r.y;
        maxY = Math.max(maxY, r.y);
        prevPos = { x: r.x, z: r.z };
      }
      const end = sys.rideInfo(frog);
      expect(landings).toBeGreaterThanOrEqual(4); // hop, hop, hop, hop…
      expect(maxY).toBeGreaterThan(0.2);
      expect(maxY).toBeLessThan(1.2);
      expect(groundedMoves).toBeLessThan(10); // ground is covered in the air, not by sliding
      expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeGreaterThan(4);
      // Space = a big leap, far higher than a travelling hop
      for (let i = 0; i < 120; i++) sys.rideStep(frog, STEP, Math.PI, 0);
      expect(sys.rideJump(frog)).toBe(true);
      let peak = 0;
      for (let i = 0; i < 200; i++) peak = Math.max(peak, sys.rideStep(frog, STEP, Math.PI, 0).y);
      expect(peak).toBeGreaterThan(4);
      sys.destroy();
    });

    it("a flyer climbs while the jump key is held and settles back when released", async () => {
      const { sys } = await booted();
      expect(sys.place("Wasp", 0, 0, 10)).toBe(true);
      const wasp = sys.findRideable(0, 10, 3)!;
      sys.startRide(wasp);
      expect(sys.rideJump(wasp)).toBe(false); // it flies, it doesn't jump
      const base = sys.rideStep(wasp, STEP, 0, 0).y;
      let y = base;
      for (let i = 0; i < 120; i++) y = sys.rideStep(wasp, STEP, 0, 0, true).y;
      expect(y).toBeGreaterThan(base + 8);
      for (let i = 0; i < 240; i++) y = sys.rideStep(wasp, STEP, 0, 0, false).y;
      expect(y).toBeLessThan(base + 2);
      sys.destroy();
    });
  });
});
