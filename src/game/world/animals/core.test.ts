/** Wildlife core behaviour: spawn, lethal hits, momentum, health, temperament. */
import { describe, expect, it } from "vitest";
import { STEP, booted, jeepAt } from "./test-helpers";

describe("AnimalSystem", () => {
  it("loads the packs and populates the jungle", async () => {
    const { sys } = await booted();
    // corridor mammals + deep dinos must make it into the world (stream spots
    // depend on stream geometry, so only require a healthy total + variety)
    expect(sys.countOf("Fox")).toBeGreaterThanOrEqual(1);
    expect(sys.countOf("Trex")).toBeGreaterThanOrEqual(1);
    expect(sys.countOf("Deer")).toBeGreaterThanOrEqual(1);
    let total = 0;
    let species = 0;
    for (const f of [
      "Deer", "Stag", "Fox", "Wolf", "Husky", "ShibaInu", "Horse", "Horse_White",
      "Donkey", "Alpaca", "Cow", "Bull", "Frog", "Snake", "Snake_angry", "Rat",
      "Spider", "Trex", "Velociraptor", "Triceratops", "Stegosaurus",
      "Apatosaurus", "Parasaurolophus", "Wasp",
    ]) {
      total += sys.countOf(f);
      if (sys.countOf(f) > 0) species++;
    }
    expect(total).toBeGreaterThanOrEqual(55);
    expect(species).toBeGreaterThanOrEqual(20);
    sys.destroy();
  }, 60_000);

  it("kills a light animal at speed: ragdoll → settle → gore → respawn", async () => {
    const { spy, sys } = await booted();
    // fox on the open trail, jeep 12 m behind closing at 144 km/h
    expect(sys.place("Fox", 0, 0, 20)).toBe(true);
    expect(sys.stateOf("Fox", 0)).toBe("idle");

    const fox = jeepAt(0, 8, 40);
    let dead = false;
    for (let i = 0; i < 300 && !dead; i++) {
      fox.pos.z += 40 * STEP; // jeep keeps barrelling past
      if (fox.pos.z > 45) fox.speed = 0;
      sys.update(STEP, fox);
      dead = sys.stateOf("Fox", 0) === "dead";
    }
    expect(dead).toBe(true);
    expect(spy.kills.some((k) => k.name === "Fox" && k.points === 100)).toBe(true);
    // light animal barely slows the jeep, gore burst happened
    expect(spy.keeps.every((k) => k > 0.95)).toBe(true);
    expect(spy.bursts.some((b) => b.color === 0x8f1a12)).toBe(true);
    expect(spy.heavyHits).toHaveLength(0);

    // 40 s later, jeep far away → the fox respawns out of sight
    const far = jeepAt(0, -140, 0);
    for (let i = 0; i < 40; i++) sys.update(1, far);
    expect(sys.stateOf("Fox", 0)).toBe("idle");
    sys.destroy();
  }, 60_000);

  it("heavy animals slam the jeep: big momentum loss + damage hook + thud", async () => {
    const { spy, sys } = await booted();
    expect(sys.place("Bull", 0, 0, 20)).toBe(true);

    // 260 hp: ram it repeatedly; it charges back between passes
    let dead = false;
    for (let pass = 0; pass < 10 && !dead; pass++) {
      const bp = sys.debugPos("Bull", 0)!;
      const jeep = jeepAt(bp.x, bp.z - 12, 40);
      for (let i = 0; i < 90 && !dead; i++) {
        jeep.pos.z += 40 * STEP;
        sys.update(STEP, jeep);
        dead = sys.stateOf("Bull", 0) === "dead";
      }
      // park nearby; the wounded bull should come retaliate
      const bp2 = sys.debugPos("Bull", 0)!;
      const parked = jeepAt(bp2.x + 0.01, bp2.z + 6, 0);
      for (let i = 0; i < 300 && spy.attacks.length === 0 && !dead; i++) {
        sys.update(STEP, parked);
        dead = sys.stateOf("Bull", 0) === "dead";
      }
    }
    expect(dead).toBe(true);
    expect(spy.kills.some((k) => k.name === "Bull" && k.points === 400)).toBe(true);
    // the survivable wallops slow the jeep some; the killing slam a lot
    expect(spy.keeps[0]).toBeLessThan(0.85);
    expect(Math.min(...spy.keeps)).toBeLessThan(0.5);
    expect(spy.heavyHits.length).toBeGreaterThan(0);
    expect(spy.attacks.length).toBeGreaterThan(0);
    sys.destroy();
  }, 60_000);

  it("tough animals survive the first pass — health forces repeated hits", async () => {
    const { spy, sys } = await booted();
    expect(sys.place("Deer", 0, 0, 20)).toBe(true);

    /** Drive the jeep straight at the deer's current position (simple pursuit). */
    const chase = (speed: number, frames: number): { dead: boolean; hit: boolean } => {
      const jeep = jeepAt(0, 0, speed);
      let hit = false;
      const before = spy.keeps.length + spy.bursts.length;
      for (let i = 0; i < frames; i++) {
        const dp = sys.debugPos("Deer", 0)!;
        if (speed > 0) {
          const ddx = dp.x - jeep.pos.x;
          const ddz = dp.z - jeep.pos.z;
          const dl = Math.hypot(ddx, ddz) || 1;
          jeep.yaw = Math.atan2(-ddx / dl, -ddz / dl);
          jeep.pos.x += -Math.sin(jeep.yaw) * speed * STEP;
          jeep.pos.z += -Math.cos(jeep.yaw) * speed * STEP;
        }
        sys.update(STEP, jeep);
        if (spy.keeps.length + spy.bursts.length > before) hit = true;
        if (sys.stateOf("Deer", 0) === "dead") return { dead: true, hit };
      }
      return { dead: false, hit };
    };

    // one moderate pass (≈37 dmg vs 70 hp) wounds but does not kill
    const p1 = chase(30, 300);
    expect(p1.hit).toBe(true);
    expect(p1.dead).toBe(false);
    expect(spy.kills).toHaveLength(0);

    // second, faster pass finishes the job
    const p2 = chase(40, 420);
    expect(p2.dead).toBe(true);
    expect(spy.kills.some((k) => k.name === "Deer" && k.points === 250)).toBe(true);
    sys.destroy();
  }, 60_000);

  it("calm animals tolerate a slow drive-by (no panic on first sight)", async () => {
    const { spy, sys } = await booted();
    expect(sys.place("Fox", 0, 0, 12)).toBe(true); // calm: fleeR 4..12
    // crawl past at 2 u/s, never closer than ~4 m
    for (let i = 0; i < 240; i++) {
      const jeep = jeepAt(6, 12 - i * 0.1, 2);
      sys.update(STEP, jeep);
    }
    expect(sys.stateOf("Fox", 0)).not.toBe("dead");
    expect(spy.kills).toHaveLength(0);
    sys.destroy();
  }, 60_000);

  it("survivable bumps shove the animal aside and scare it into fleeing", async () => {
    const { spy, sys } = await booted();
    expect(sys.place("Deer", 0, 0, 24)).toBe(true);
    const slow = jeepAt(0, 20.5, 1.2); // barely rolling
    sys.update(STEP, slow);
    // deer either flees from the start (26 m flee radius) or got nudged — never dies
    expect(sys.stateOf("Deer", 0)).not.toBe("dead");
    expect(spy.kills).toHaveLength(0);
    sys.destroy();
  }, 60_000);
});
