/** Gunfire: ray hits, falloff, nearest target. */
import { describe, expect, it } from "vitest";
import { booted } from "./test-helpers";

describe("AnimalSystem", () => {
  describe("gunfire", () => {
    it("a bullet hits the animal on the line, ignores ones off it or beyond range, and falls to damage", async () => {
      const { spy, sys } = await booted();
      expect(sys.place("Deer", 0, 0, 0)).toBe(true);
      expect(sys.place("Fox", 0, 30, 0)).toBe(true);
      const d = sys.debugPos("Deer", 0)!;
      const f = sys.debugPos("Fox", 0)!;
      // from 20 m south, aimed at the deer's body, level with its middle (1.5 m tall)
      const y = 0.7;
      const hit = sys.shoot(d.x, y, d.z + 20, 0, 0, -1, 60, 16, 0.5);
      expect(hit).not.toBeNull();
      expect(hit!.name).toBe("Deer");
      expect(hit!.t).toBeGreaterThan(17);
      expect(hit!.t).toBeLessThan(20.5);
      expect(hit!.killed).toBe(false);
      expect(sys.stateOf("Deer", 0)).toBe("flee"); // wounded → runs

      // the same aim falls short when range ends before the body
      sys.place("Deer", 0, 0, 0);
      expect(sys.shoot(d.x, y, d.z + 20, 0, 0, -1, 10, 16, 0.5)).toBeNull();
      // aimed well to the side, or far over its head: a miss
      expect(sys.shoot(d.x + 8, y, d.z + 20, 0, 0, -1, 60, 16, 0.5)).toBeNull();
      expect(sys.shoot(d.x, 40, d.z + 20, 0, 0, -1, 60, 16, 0.5)).toBeNull();
      // a different animal along another line is found instead
      const other = sys.shoot(f.x, y, f.z + 15, 0, 0, -1, 60, 5, 0.2);
      expect(other?.name).toBe("Fox");
      expect(spy.kills).toHaveLength(0);
      sys.destroy();
    });

    it("hits the NEAREST animal on the line, and enough damage kills it like any other hit", async () => {
      const { spy, sys } = await booted();
      expect(sys.place("Fox", 0, 0, 0)).toBe(true);
      expect(sys.place("Husky", 0, 0, -12)).toBe(true);
      const f = sys.debugPos("Fox", 0)!;
      const first = sys.shoot(f.x, 0.6, f.z + 15, 0, 0, -1, 80, 5, 0.1);
      expect(first?.name).toBe("Fox"); // the fox stands in front of the husky
      // fox has 25 hp; 5 already taken
      const kill = sys.shoot(f.x, 0.6, f.z + 15, 0, 0, -1, 80, 40, 0.1);
      expect(kill?.killed).toBe(true);
      expect(spy.kills.some((k) => k.name === "Fox")).toBe(true);
      // the fox is down, so the next bullet reaches the husky behind it
      const next = sys.shoot(f.x, 0.6, f.z + 15, 0, 0, -1, 80, 5, 0.1);
      expect(next?.name).toBe("Husky");
      sys.destroy();
    });

    it("a ridden animal is never a target", async () => {
      const { sys } = await booted();
      expect(sys.place("Horse", 0, 0, 0)).toBe(true);
      const h = sys.findRideable(0, 0, 2)!;
      sys.startRide(h);
      const p = sys.rideInfo(h);
      expect(sys.shoot(p.x, 1, p.z + 10, 0, 0, -1, 40, 50, 1)).toBeNull();
      sys.destroy();
    });
  });
});
