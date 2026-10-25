import { beforeAll, describe, expect, it } from "vitest";
import {
  ArenaPhysics,
  GRENADE_FUSE,
  MAP_PROPS,
  PropSim,
  SIM_DT,
  initPhysics,
} from "../index";

let phys: ArenaPhysics;
let props: PropSim;

beforeAll(async () => {
  await initPhysics();
  phys = new ArenaPhysics();
  props = new PropSim(phys);
});

const stepSeconds = (s: number): void => {
  const steps = Math.round(s / SIM_DT);
  for (let i = 0; i < steps; i++) {
    phys.step(SIM_DT);
    props.step(SIM_DT * 1000);
  }
};

function findProp(pred: (kind: string, i: number) => boolean): number {
  for (let i = 0; i < MAP_PROPS.length; i++) if (pred(MAP_PROPS[i].kind, i)) return i;
  throw new Error("no prop matched");
}

describe("ArenaPhysics static world", () => {
  it("blocks rays with walls and floors", () => {
    // straight into the outer wall from the middle of the map
    const d = phys.castRay({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, 100);
    expect(d).toBeLessThan(24);
    // down at the floor (open field tile, away from the dais)
    const down = phys.castRay({ x: 0, y: 1, z: 5 }, { x: 0, y: -1, z: 0 }, 100);
    expect(down).toBeCloseTo(1, 1);
    // empty sky
    const up = phys.castRay({ x: 0, y: 1, z: 5 }, { x: 0, y: 1, z: 0 }, 100);
    expect(up).toBe(100);
  });
});

describe("PropSim", () => {
  it("spawns props at rest and lets them settle", () => {
    stepSeconds(2);
    const snap = props.snapshot();
    // everything is awake initially; after 2 s all dynamic props should have
    // settled and dropped out of the snapshot
    const awake = snap.filter((p) => !props.isGone(p.i));
    expect(awake.length).toBeLessThanOrEqual(MAP_PROPS.length);
    const crate = findProp((k) => k === "crate");
    expect(props.isGone(crate)).toBe(false);
  });

  it("moves a crate when shot", () => {
    const crate = findProp((k) => k === "crate");
    const body = props.bodyAt(crate)!;
    const before = body.translation();
    props.hitImpulse(crate, { x: 1, y: 0, z: 0 }, 8);
    stepSeconds(0.5);
    const after = body.translation();
    expect(Math.abs(after.x - before.x)).toBeGreaterThan(0.2);
  });

  it("pushes players out of overlapping crates", () => {
    const crate = findProp((k) => k === "crate");
    const body = props.bodyAt(crate)!;
    const t = body.translation();
    // stand dead centre inside the crate
    const push = props.pushOut(t.x, t.y - 0.3, t.z);
    expect(Math.hypot(push.dx, push.dz)).toBeGreaterThan(0.4);
  });

  it("blasts props radially", () => {
    stepSeconds(3); // let the world settle first
    const crate = findProp((k) => k === "crate");
    const body = props.bodyAt(crate)!;
    const t = body.translation();
    // detonate 2 units to the side so the radial direction is horizontal
    props.blast(t.x + 2, t.y, t.z, 6, 10);
    stepSeconds(0.5);
    const after = body.translation();
    expect(after.x).toBeLessThan(t.x + 1.5); // shoved away from the blast
    expect(Math.hypot(after.x - t.x, after.z - t.z)).toBeGreaterThan(0.3);
  });

  it("destroys and respawns targets", () => {
    const target = findProp((k) => k === "target");
    expect(props.isGone(target)).toBe(false);
    expect(props.damage(target, 10_000)).toBe("break");
    expect(props.isGone(target)).toBe(true);
    stepSeconds(16);
    expect(props.isGone(target)).toBe(false);
  });

  it("explodes barrels only when they are barrels", () => {
    const barrel = findProp((kind, i) => kind === "barrel" && MAP_PROPS[i].explosive);
    expect(props.explode(barrel)).toBe(true);
    expect(props.isGone(barrel)).toBe(true);
    const crate = findProp((k) => k === "crate");
    expect(props.explode(crate)).toBe(false);
  });
});

describe("GrenadeSim", () => {
  it("flies, bounces and detonates on fuse", async () => {
    const { GrenadeSim } = await import("../physics/grenades");
    const blasts: { x: number; y: number; z: number }[] = [];
    const grenades = new GrenadeSim(phys, (blast) => {
      blasts.push({ x: blast.x, y: blast.y, z: blast.z });
    });
    const id = grenades.throwGrenade({ x: 0, y: 1.6, z: 5 }, { x: 0, y: 0.1, z: -1 });
    expect(id).toBeGreaterThan(0);
    const steps = Math.round((GRENADE_FUSE + 0.2) / SIM_DT);
    for (let i = 0; i < steps; i++) {
      phys.step(SIM_DT);
      grenades.step();
    }
    expect(blasts.length).toBe(1);
    // flew north and stayed inside the map
    expect(blasts[0].z).toBeLessThan(0);
    expect(Math.abs(blasts[0].x)).toBeLessThan(24);
    expect(grenades.snapshot().length).toBe(0);
  });
});
