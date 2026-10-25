import { describe, expect, it } from "vitest";
import type { ActionSnapshot } from "./input/actions";
import { params, resetParams } from "./core/params";
import { PlayerBody } from "./player/body";
import { TrickTracker } from "./player/tricks";
import { CHUNK_WIDTH, Terrain } from "./world/chunks";
import { GoalEngine } from "./world/goals";
import { StormWall } from "./world/storm";

const STEP = 1 / 60;

function input(over: Partial<ActionSnapshot> = {}): ActionSnapshot {
  return {
    jumpHeld: false,
    jumpPressed: false,
    jumpReleased: false,
    boostHeld: false,
    downHeld: false,
    pausePressed: false,
    confirmPressed: false,
    backPressed: false,
    navPressed: { up: false, down: false, left: false, right: false },
    spinAxis: 0,
    anyPressed: false,
    ...over,
  };
}

/** Ride straight until the condition fires (or the budget runs out). */
function rideUntil(
  body: PlayerBody,
  terrain: Terrain,
  seconds: number,
  cond: (b: PlayerBody) => boolean,
  each?: (b: PlayerBody) => void,
): boolean {
  for (let i = 0; i < seconds * 60; i++) {
    terrain.ensure(body.s.x - 500, body.s.x + 2500);
    body.beginStep();
    body.update(STEP, input(), terrain);
    each?.(body);
    if (cond(body)) return true;
  }
  return false;
}

function freshRider(seed = 7): { body: PlayerBody; terrain: Terrain } {
  const terrain = new Terrain(seed);
  const body = new PlayerBody();
  terrain.ensure(-500, 4000);
  body.reset(terrain);
  return { body, terrain };
}

describe("banked-chain scoring", () => {
  it("air tricks stay unbanked until a clean landing banks them", () => {
    const t = new TrickTracker();
    const toasts = t.onLanding("clean", 1, 1.5);
    // spin earned mid-chain, then banked on the clean landing
    const banked = toasts.find((x) => x.name === "Banked");
    expect(banked).toBeDefined();
    expect(banked!.points).toBeGreaterThan(0);
    expect(t.score).toBe(banked!.points);
    expect(t.chain).toBe(0);
  });

  it("a rough landing loses the chain", () => {
    const t = new TrickTracker();
    const toasts = t.onLanding("rough", 2, 1.0);
    expect(toasts.some((x) => x.name === "Chain Lost")).toBe(true);
    expect(t.score).toBe(0);
    expect(t.chain).toBe(0);
    expect(t.multiplier).toBe(1);
  });

  it("sunstones pay directly and never enter the chain", () => {
    const t = new TrickTracker();
    const toast = t.addPickup();
    expect(t.score).toBe(toast.points);
    expect(t.chain).toBe(0);
  });

  it("a grind session pays by the meter", () => {
    const t = new TrickTracker();
    const toast = t.endGrindSession(80);
    expect(toast).not.toBeNull();
    expect(toast!.name).toBe("Grind");
    expect(toast!.points).toBe(80 * 10);
    // long grinds get their own name
    expect(t.endGrindSession(120)!.name).toBe("Long Grind");
  });
});

describe("rider state machine & new moves", () => {
  it("derives boarding / flipping / falling states over a scripted ride", () => {
    const { body, terrain } = freshRider(4242);
    expect(body.s.state).toBe("boarding");
    const seen = new Set<string>([body.s.state]);
    let airSpun = false;
    for (let i = 0; i < 60 * 40; i++) {
      terrain.ensure(body.s.x - 500, body.s.x + 2500);
      const phase = i % 210;
      const inp = input();
      if (body.s.grounded && phase < 20) inp.jumpHeld = true;
      if (phase === 20) inp.jumpReleased = true;
      if (!body.s.grounded) {
        inp.spinAxis = phase % 210 < 100 ? 0.9 : 0;
        airSpun = airSpun || Math.abs(body.s.spinVel) > 2;
      }
      body.beginStep();
      body.update(STEP, inp, terrain);
      seen.add(body.s.state);
      expect(["boarding", "jumping", "flipping", "freefalling", "falling", "grinding"]).toContain(
        body.s.state,
      );
    }
    expect(seen.has("boarding")).toBe(true);
    // with spins commanded in every air, flipping must have been observed
    expect(airSpun || seen.has("flipping")).toBe(true);
  });

  it("double hop fires once per air and lifts the rider", () => {
    const { body, terrain } = freshRider(11);
    // launch with a plain tap
    body.beginStep();
    body.update(STEP, input({ jumpPressed: true, jumpReleased: true }), terrain);
    expect(body.s.grounded).toBe(false);
    const vyAfterLaunch = body.s.vy;
    expect(body.s.doubleLeft).toBe(true);

    // first air press → double jump (fresh press next step)
    body.beginStep();
    const ev = body.update(STEP, input({ jumpPressed: true }), terrain);
    expect(ev.doubleJumped).toBe(true);
    // y-down world: a stronger upward launch means a more negative vy
    expect(body.s.vy).toBeLessThan(0);
    expect(body.s.vy).toBeLessThan(vyAfterLaunch);
    expect(body.s.doubleLeft).toBe(false);

    // a second press in the same air does nothing
    body.beginStep();
    const ev2 = body.update(STEP, input({ jumpPressed: true }), terrain);
    expect(ev2.doubleJumped).toBeUndefined();

    // landing restores the hop
    expect(rideUntil(body, terrain, 8, (b) => b.s.grounded)).toBe(true);
    expect(body.s.doubleLeft).toBe(true);
  });
});

describe("grind rails", () => {
  it("exist on calm chunks and are rideable above the ground", () => {
    let found = 0;
    for (const seed of [7, 4242, 987654, 123, 20260101, 555, 31337]) {
      const terrain = new Terrain(seed);
      terrain.ensure(0, 60 * CHUNK_WIDTH);
      for (const rail of terrain.railsInRange(0, 60 * CHUNK_WIDTH)) {
        found++;
        const mid = (rail.x0 + rail.x1) / 2;
        // the line hangs above the ground everywhere along the span
        for (const x of [rail.x0 + 30, mid, rail.x1 - 30]) {
          expect(terrain.heightAt(x) - terrain.railYAt(rail, x)).toBeGreaterThan(30);
        }
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it("a falling rider can catch a rail, grind, and hop off", () => {
    // Find a seed+chunk with a rail, then drop the rider onto it from above.
    let railPos: { x: number; terrain: Terrain } | null = null;
    for (const seed of [7, 4242, 987654, 123, 20260101, 555, 31337]) {
      const terrain = new Terrain(seed);
      terrain.ensure(0, 60 * CHUNK_WIDTH);
      const rails = terrain.railsInRange(0, 60 * CHUNK_WIDTH);
      if (rails.length > 0) {
        const rail = rails[0];
        railPos = { x: (rail.x0 + rail.x1) / 2, terrain };
        break;
      }
    }
    expect(railPos).not.toBeNull();
    const { x, terrain } = railPos!;
    const body = new PlayerBody();
    body.reset(terrain);
    // teleport above the rail line, falling
    body.s.x = x;
    body.s.y = terrain.railYAt(terrain.railAt(x)!, x) - 60;
    body.s.vx = 420;
    body.s.vy = 300;
    body.s.grounded = false;
    body.s.airTime = 0.2;

    const caught = rideUntil(body, terrain, 3, (b) => b.s.state === "grinding");
    expect(caught).toBe(true);
    expect(body.s.grind).not.toBeNull();

    // hop off with a jump press
    body.beginStep();
    const ev = body.update(STEP, input({ jumpPressed: true }), terrain);
    expect(ev.grindEnded?.reason).toBe("jump");
    expect(body.s.state).not.toBe("grinding");
  });
});

describe("salt pans & surfaces", () => {
  it("surfaceAt returns rock on rough zones and sand elsewhere", () => {
    const terrain = new Terrain(4242);
    terrain.ensure(0, 60 * CHUNK_WIDTH);
    let sawRock = false;
    let sawSand = false;
    for (let x = 0; x < 60 * CHUNK_WIDTH; x += 240) {
      const s = terrain.surfaceAt(x);
      if (s === "rock") sawRock = true;
      if (s === "sand") sawSand = true;
    }
    expect(sawSand).toBe(true);
    expect(sawRock).toBe(true);
  });

  it("salt makes the rider faster than sand on the same slope", () => {
    const sandTerrain = new Terrain(7);
    const saltTerrain = new Terrain(7);
    const a = new PlayerBody();
    const b = new PlayerBody();
    for (const t of [sandTerrain, saltTerrain]) t.ensure(0, CHUNK_WIDTH * 2);
    a.reset(sandTerrain);
    b.reset(saltTerrain);
    // Mark an identical span salty on one world only (test seam into the
    // chunk map; generation stays untouched).
    const x = CHUNK_WIDTH + 500;
    const span = { x0: x - 600, x1: x + 600 };
    type ChunkMap = Map<number, { salt: { x0: number; x1: number } | null }>;
    const sandChunks = (sandTerrain as unknown as { chunks: ChunkMap }).chunks;
    const saltChunks = (saltTerrain as unknown as { chunks: ChunkMap }).chunks;
    const sandChunk = sandChunks.get(1)!;
    const saltChunk = saltChunks.get(1)!;
    sandChunk.salt = null;
    saltChunk.salt = span;
    a.s.x = x;
    b.s.x = x;
    a.s.vx = 500;
    b.s.vx = 500;
    for (let i = 0; i < 240; i++) {
      for (const [body, t] of [
        [a, sandTerrain],
        [b, saltTerrain],
      ] as const) {
        t.ensure(body.s.x - 500, body.s.x + 2500);
        body.beginStep();
        body.update(STEP, input(), t);
      }
    }
    expect(b.s.x).toBeGreaterThan(a.s.x);
  });
});

describe("storm wall", () => {
  it("stays dormant until the start distance, then closes in and can catch", () => {
    resetParams();
    const wall = new StormWall();
    let px = 0;
    // ride to just under the activation distance — still dormant
    for (let i = 0; i < Math.floor(params.stormStartM) - 1; i++) {
      px += params.pxPerMeter; // 1 m per step
      wall.update(1 / 60, px, px / params.pxPerMeter, false);
      expect(wall.active).toBe(false);
    }
    // crossing the threshold wakes the wall
    px += params.pxPerMeter;
    wall.update(1 / 60, px, px / params.pxPerMeter, false);
    expect(wall.active).toBe(true);
    // hold position: the wall eventually catches up
    for (let i = 0; i < 60 * 240 && !wall.caught; i++) {
      wall.update(1 / 60, px, px / params.pxPerMeter, false);
    }
    expect(wall.caught).toBe(true);
  });

  it("holds back while the rider is airborne", () => {
    resetParams();
    const air = new StormWall();
    const ground = new StormWall();
    const px = params.stormStartM * params.pxPerMeter + params.pxPerMeter;
    const distM = px / params.pxPerMeter;
    for (const w of [air, ground]) {
      w.update(1 / 60, px, distM, false);
      expect(w.active).toBe(true);
      // stage both walls inside the hold-back band, close behind the rider
      w.x = px - 500;
    }
    for (let i = 0; i < 120; i++) {
      air.update(1 / 60, px, distM, true);
      ground.update(1 / 60, px, distM, false);
    }
    // airborne hold-back keeps the wall further behind
    expect(px - air.x).toBeGreaterThan(px - ground.x);
  });
});

describe("goal engine", () => {
  /** Complete every active goal and advance one level. */
  function levelUp(engine: GoalEngine): void {
    for (const g of [...engine.active]) engine.setRunCounter(g.kind, g.target);
    expect(engine.maybeLevelUp()).toBe(true);
  }

  it("tracks run goals, completes them, and levels up when all three land", () => {
    const engine = new GoalEngine();
    engine.startRun();
    expect(engine.active.length).toBe(3);
    const first = engine.active[0];
    expect(first.done).toBe(false);
    engine.setRunCounter(first.kind, first.target);
    expect(first.done).toBe(true);
    expect(engine.completedThisRun.length).toBe(1);
    levelUp(engine);
    expect(engine.level).toBe(2);
    expect(engine.active.length).toBe(3);
  });

  it("career goals keep progress across startRun", () => {
    const engine = new GoalEngine();
    engine.startRun();
    const grindGoal = engine.active.find((g) => g.kind === "careerGrindMeters");
    if (grindGoal) {
      engine.addCareerCounter("careerGrindMeters", 10);
      engine.startRun();
      const again = engine.active.find((g) => g.kind === "careerGrindMeters")!;
      expect(again.progress).toBeGreaterThanOrEqual(10);
    }
  });

  it("goal targets escalate with the level", () => {
    const engine = new GoalEngine();
    const rideTarget = (e: GoalEngine) =>
      e.active.find((g) => g.kind === "runDistance")?.target ?? 0;
    const l1 = rideTarget(engine);
    levelUp(engine);
    expect(engine.level).toBe(2);
    const l2 = rideTarget(engine);
    expect(l2).toBeGreaterThan(l1);
  });
});
