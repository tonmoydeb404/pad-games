/**
 * Headless smoke test for the wildlife system: loads the real GLBs from
 * public/assets/jeep/animals and drives the full behaviour cycle —
 * spawn → idle → flee → lethal jeep hit → ragdoll → settle → dead → respawn,
 * plus the heavy-animal momentum exchange.
 *
 * GLTFLoader runs fine under Node for these texture-free models (tiny shims
 * below); no WebGL is needed because AnimalSystem only fills the scene graph.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";

if (typeof (globalThis as { self?: unknown }).self === "undefined") {
  (globalThis as { self?: unknown }).self = globalThis;
}

// Serve /assets/jeep/animals/*.glb straight from public/ — Node's undici
// rejects site-relative URLs, so patch Request (three builds one) and fetch.
const ROOT = path.resolve(__dirname, "../..");
const realFetch = globalThis.fetch.bind(globalThis);
// three's FileLoader reports download progress via ProgressEvent
(globalThis as { ProgressEvent?: unknown }).ProgressEvent = class {
  type: string;
  lengthComputable: boolean;
  loaded: number;
  total: number;
  constructor(type: string, init?: { lengthComputable?: boolean; loaded?: number; total?: number }) {
    this.type = type;
    this.lengthComputable = init?.lengthComputable ?? false;
    this.loaded = init?.loaded ?? 0;
    this.total = init?.total ?? 0;
  }
};
const RealRequest = globalThis.Request;
globalThis.Request = class extends RealRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    super(url.startsWith("/") ? `http://localhost${url}` : input as RequestInfo, init);
  }
} as typeof Request;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const pathname = new URL(raw, "http://localhost").pathname;
  if (pathname.startsWith("/assets/jeep/animals/")) {
    const body = fs.readFileSync(path.join(ROOT, "public", pathname));
    return new Response(body, { status: 200 });
  }
  return realFetch(input, init);
}) as typeof fetch;

import { AnimalSystem, type AnimalHost } from "./animals";

interface HostSpy {
  host: AnimalHost;
  kills: { name: string; points: number }[];
  heavyHits: number[];
  keeps: number[];
  attacks: { dmg: number; keep: number }[];
  footAttacks: { dmg: number; nx: number; nz: number }[];
  bursts: { n: number; color: number }[];
}

/** Flat jungle: trail runs down the |x|<80 corridor (kept empty so the test
 *  jeep's path is deterministic); the stream circle sits at (-142,160). */
function makeHost(): HostSpy {
  const spy: HostSpy = {
    kills: [],
    heavyHits: [],
    keeps: [],
    attacks: [],
    footAttacks: [],
    bursts: [],
    host: null as unknown as AnimalHost,
  };
  spy.host = {
    scene: new THREE.Scene(),
    terrainHeight: () => 0,
    // |x| < 80 is the trail corridor (td 30 → inside the 10..55 corridor band),
    // outside is deep jungle (td 200 > 70)
    trailDist: (x) => (Math.abs(x) < 80 ? 30 : 200),
    waterDist: (x, z) => Math.hypot(x + 142, z - 160),
    waterSpawnPoint: (r) => {
      const ang = r() * Math.PI * 2;
      const d = 28 + r() * 26;
      return { x: -142 + Math.cos(ang) * d, z: 160 + Math.sin(ang) * d };
    },
    trailSpawnPoint: (r) => ({ x: (r() - 0.5) * 700, z: (r() - 0.5) * 700 }),
    blocked: () => false,
    burst: (_x, _y, _z, n, color) => {
      spy.bursts.push({ n, color });
    },
    onKill: (name, points) => spy.kills.push({ name, points }),
    onHeavyImpact: (approach) => spy.heavyHits.push(approach),
    onJeepImpact: (keep) => spy.keeps.push(keep),
    onAnimalAttack: (dmg, keep) => spy.attacks.push({ dmg, keep }),
    onAnimalAttackFoot: (dmg, nx, nz) => spy.footAttacks.push({ dmg, nx, nz }),
    camRight: (out) => out.set(1, 0, 0),
    thump: () => {},
    rumble: () => {},
  };
  return spy;
}

/** Jeep snapshot heading toward +z at the given speed (yaw = π). */
const jeepAt = (x: number, z: number, speed: number) => ({
  pos: new THREE.Vector3(x, 0, z),
  speed,
  lateral: 0,
  yaw: Math.PI,
  radius: 1.3,
});

const STEP = 1 / 60;

async function booted() {
  const spy = makeHost();
  const sys = new AnimalSystem(spy.host);
  await sys.load();
  sys.spawnAll();
  return { spy, sys };
}

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

  describe("player on foot", () => {
    const explorerAt = (x: number, z: number, speed = 0) => ({
      pos: new THREE.Vector3(x, 0, z),
      speed,
      lateral: 0,
      yaw: Math.PI,
      radius: 0.45,
      onFoot: true,
      stealth: 1,
    });

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

    /** Settle the mount facing +z (so "ahead" is +z and "behind" is -z). */
    const faceSouth = (sys: AnimalSystem, h: object): void => {
      for (let i = 0; i < 150; i++) sys.rideStep(h, STEP, Math.PI, 0.05);
    };
    const idleSnap = (x: number, z: number) => ({
      pos: new THREE.Vector3(x, 0, z), speed: 0, lateral: 0, yaw: 0, radius: 0.45, onFoot: true, stealth: 1,
    });

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
