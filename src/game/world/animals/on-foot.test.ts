/** Wildlife vs. the player on foot. */
import { describe, expect, it } from "vitest";
import { STEP, booted, explorerAt } from "./test-helpers";

describe("AnimalSystem", () => {
  describe("player on foot", () => {
    it("animals stay put when you walk up to them — they only run once hit", async () => {
      const { sys } = await booted();
      expect(sys.place("Deer", 0, 0, 0)).toBe(true);
      const p = sys.debugPos("Deer", 0)!;
      // stand right beside it, even sprinting past, for 10 s
      for (let i = 0; i < 600; i++) sys.update(STEP, explorerAt(p.x + 1.5, p.z, 12.8));
      expect(sys.stateOf("Deer", 0)).toBe("idle");
      const still = sys.debugPos("Deer", 0)!;
      expect(Math.hypot(still.x - p.x, still.z - p.z)).toBeLessThan(0.5);
      // one punch (deer has 70 hp, so it survives) and it bolts
      sys.melee(p.x + 1.2, p.z, -1, 0, 1.9, 0.3, 12, 1.2);
      sys.update(STEP, explorerAt(p.x + 1.5, p.z, 0));
      expect(sys.stateOf("Deer", 0)).toBe("flee");
      sys.destroy();
    });

    it("a charging fierce animal bites the player, not the jeep", async () => {
      const { spy, sys } = await booted();
      expect(sys.place("Wolf", 0, 0, 0)).toBe(true);
      const me = explorerAt(0, 5);
      for (let i = 0; i < 60 * 12 && spy.footAttacks.length === 0; i++) sys.update(STEP, me);
      expect(spy.footAttacks.length).toBeGreaterThan(0);
      expect(spy.footAttacks[0].dmg).toBe(12);
      expect(spy.attacks).toHaveLength(0);
      // knockback points from the animal (z=0) toward the player (z=5)
      expect(spy.footAttacks[0].nz).toBeGreaterThan(0.5);
      sys.destroy();
    });

    it("fists wear an animal down and kill it without hurting the jeep", async () => {
      const { spy, sys } = await booted();
      expect(sys.place("Fox", 0, 0, 0)).toBe(true);
      const p = sys.debugPos("Fox", 0)!;
      // a punch from 1.2 m away, facing it (+z → -z is "forward" here)
      const ox = p.x;
      const oz = p.z + 1.2;
      const miss = sys.melee(ox + 5, oz, 0, -1, 1.9, 0.3, 12, 1.2);
      expect(miss.hits).toBe(0);
      const behind = sys.melee(ox, p.z + 2.6, 0, 1, 3.2, 0.3, 12, 1.2); // in reach but facing away
      expect(behind.hits).toBe(0);
      expect(sys.nearestTarget(ox, oz, 0, -1, 4, -0.2)).not.toBeNull();
      let kills = 0;
      for (let i = 0; i < 4 && !kills; i++) kills += sys.melee(ox, sys.debugPos("Fox", 0)!.z + 1.2, 0, -1, 1.9, 0.3, 12, 1.2).kills;
      expect(kills).toBe(1); // fox has 25 hp
      expect(spy.kills.some((k) => k.name === "Fox")).toBe(true);
      expect(spy.keeps).toHaveLength(0);
      expect(spy.heavyHits).toHaveLength(0);
      sys.destroy();
    });
  });
});
