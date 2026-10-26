/** Riding: sizes, saddle, speed build-up and turning. */
import { describe, expect, it } from "vitest";
import { STEP, booted } from "./test-helpers";

describe("AnimalSystem", () => {
  describe("riding", () => {
    it("sizes: normal animals stay natural, small ones grow to rideable, dinosaurs stay giants", async () => {
      const { sys } = await booted();
      let px = -300;
      const heightOf = (f: string): number => {
        px += 40; // far apart so each lookup finds only the one just placed
        expect(sys.place(f, 0, px, 300)).toBe(true);
        return sys.rideInfo(sys.findRideable(px, 300, 1)!).height;
      };
      // already rideable → regular size (authored heights: horse 1.65, cow 1.45, stag 1.75)
      expect(heightOf("Horse")).toBeCloseTo(1.65, 2);
      expect(heightOf("Cow")).toBeCloseTo(1.45, 2);
      expect(heightOf("Stag")).toBeCloseTo(1.75, 2);
      // small → raised just to a rider-carrying size, never beyond
      for (const f of ["Fox", "Husky", "ShibaInu", "Rat", "Frog", "Spider", "Wasp", "Snake"]) {
        const h = heightOf(f);
        expect(h).toBeGreaterThanOrEqual(1.0);
        expect(h).toBeLessThanOrEqual(1.5);
      }
      // dinosaurs keep their giant scale
      expect(heightOf("Trex")).toBeGreaterThan(12);
      expect(heightOf("Apatosaurus")).toBeGreaterThan(10);
      expect(heightOf("Triceratops")).toBeGreaterThan(5);
      sys.destroy();
    });

    it("any animal can be ridden, with its own back height, speed and call", async () => {
      const { sys } = await booted();
      const species = [
        "Deer", "Stag", "Fox", "Wolf", "Husky", "ShibaInu", "Horse", "Horse_White", "Donkey", "Alpaca",
        "Cow", "Bull", "Frog", "Snake", "Snake_angry", "Rat", "Spider", "Trex", "Velociraptor",
        "Triceratops", "Stegosaurus", "Apatosaurus", "Parasaurolophus", "Wasp",
      ];
      const seen = new Map<string, ReturnType<typeof sys.rideInfo>>();
      let x = -300;
      for (const f of species) {
        if (sys.countOf(f) === 0) continue;
        expect(sys.place(f, 0, x, 300)).toBe(true);
        const h = sys.findRideable(x, 300, 1);
        expect(h).not.toBeNull();
        const info = sys.rideInfo(h!);
        seen.set(f, info);
        // the saddle is on the animal: above its belly, at or below its full height
        expect(info.seat.y).toBeGreaterThan(info.height * 0.08); // a snake's back is nearly flat
        expect(info.seat.y).toBeLessThanOrEqual(info.height * 1.05);
        expect(info.seat.halfW).toBeGreaterThan(0.02);
        expect(info.seat.len).toBeGreaterThan(0.2);
        expect(info.call.kind).toBeTruthy();
        x += 12;
      }
      expect(seen.size).toBeGreaterThanOrEqual(20);
      // characters differ: a horse is bigger and faster than a fox; giants call lower
      const horse = seen.get("Horse")!;
      const fox = seen.get("Fox")!;
      expect(horse.height).toBeGreaterThan(fox.height);
      expect(horse.topSpeed).toBeGreaterThan(fox.topSpeed);
      expect(seen.get("Trex")!.call.pitch).toBeLessThan(fox.call.pitch);
      expect(horse.call.kind).toBe("neigh");
      expect(seen.get("Husky")!.call.kind).toBe("bark");
      expect(seen.get("Cow")!.call.kind).toBe("moo");
      expect(seen.get("Trex")!.call.kind).toBe("roar");
      sys.destroy();
    });

    it("a rider drives the mount with its own speed, inertia and turning", async () => {
      const { sys } = await booted();
      expect(sys.place("Horse", 0, 0, 10)).toBe(true);
      expect(sys.place("Trex", 0, 40, 10)).toBe(true);
      const horse = sys.findRideable(0, 10, 2)!;
      const trex = sys.findRideable(40, 10, 2)!;
      sys.startRide(horse);
      sys.startRide(trex);
      // taken: nobody else can mount a ridden animal, and it doesn't wander
      expect(sys.findRideable(0, 10, 2)).toBeNull();

      const speedAfter = (h: object, s: number) => {
        let r = { speed: 0, x: 0, z: 0, yaw: 0, y: 0 };
        for (let i = 0; i < s * 60; i++) r = sys.rideStep(h, STEP, Math.PI, 1);
        return r;
      };
      // inertia: half a second in, the heavy T-Rex is further from top speed than the horse
      const h05 = speedAfter(horse, 0.5).speed / sys.rideInfo(horse).topSpeed;
      const t05 = speedAfter(trex, 0.5).speed / sys.rideInfo(trex).topSpeed;
      expect(h05).toBeGreaterThan(t05);
      // each tops out at its own flee speed
      expect(speedAfter(horse, 6).speed).toBeGreaterThan(sys.rideInfo(horse).topSpeed * 0.95);
      expect(speedAfter(trex, 9).speed).toBeGreaterThan(sys.rideInfo(trex).topSpeed * 0.95);
      expect(sys.rideInfo(horse).topSpeed).toBeGreaterThan(sys.rideInfo(trex).topSpeed);

      // turning: after 0.4 s asked to go the other way, the horse has swung further than the T-Rex
      sys.endRide(horse);
      sys.endRide(trex);
      expect(sys.place("Horse", 0, 0, 100)).toBe(true);
      expect(sys.place("Trex", 0, 40, 100)).toBe(true);
      const h2 = sys.findRideable(0, 100, 2)!;
      const t2 = sys.findRideable(40, 100, 2)!;
      sys.startRide(h2);
      sys.startRide(t2);
      const y0h = sys.rideInfo(h2).yaw;
      const y0t = sys.rideInfo(t2).yaw;
      for (let i = 0; i < 24; i++) {
        sys.rideStep(h2, STEP, y0h + Math.PI, 0.5);
        sys.rideStep(t2, STEP, y0t + Math.PI, 0.5);
      }
      expect(Math.abs(sys.rideInfo(h2).yaw - y0h)).toBeGreaterThan(Math.abs(sys.rideInfo(t2).yaw - y0t));

      // standing still doesn't move it; hits can't land on a ridden animal; letting go frees it
      const a = sys.rideStep(h2, STEP, Math.PI, 0);
      for (let i = 0; i < 200; i++) sys.rideStep(h2, STEP, Math.PI, 0);
      const b = sys.rideStep(h2, STEP, Math.PI, 0);
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(2);
      expect(sys.melee(b.x, b.z + 1, 0, -1, 3, 0, 50, 1).hits).toBe(0);
      sys.endRide(h2);
      expect(sys.findRideable(b.x, b.z, 3)).not.toBeNull();
      sys.destroy();
    });

    it("speed builds gradually while you hold forward, up to a real gallop", async () => {
      const { sys } = await booted();
      expect(sys.place("Horse", 0, 0, 10)).toBe(true);
      const horse = sys.findRideable(0, 10, 2)!;
      sys.startRide(horse);
      const top = sys.rideInfo(horse).topSpeed;
      // a horse gallops faster than the explorer sprints (12.8 u/s)
      expect(top).toBeGreaterThan(16);

      const samples: number[] = [];
      for (let sec = 1; sec <= 5; sec++) {
        let r = { speed: 0 };
        for (let i = 0; i < 60; i++) r = sys.rideStep(horse, STEP, Math.PI, 1);
        samples.push(r.speed);
      }
      // keeps increasing second after second, then settles at the top
      for (let i = 1; i < 4; i++) expect(samples[i]).toBeGreaterThan(samples[i - 1] + 1);
      expect(samples[0]).toBeGreaterThan(2); // gets going right away…
      expect(samples[0]).toBeLessThan(top * 0.4); // …but isn't instantly at full speed
      expect(samples[4]).toBeGreaterThan(top * 0.95);
      expect(samples[4]).toBeLessThanOrEqual(top * 1.1 + 1e-6);

      // letting go brakes much faster than it accelerated
      let r = { speed: samples[4] };
      for (let i = 0; i < 120; i++) r = sys.rideStep(horse, STEP, Math.PI, 0); // 2 s vs 4.2 s to build
      expect(r.speed).toBeLessThan(1);
      sys.destroy();
    });
  });
});
