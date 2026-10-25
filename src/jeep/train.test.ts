/**
 * Headless tests for the Jungle Express: loads the real GLBs from
 * public/assets/jeep/train (tiny Node shims below, like animals.test.ts),
 * drives a TrainSystem against a spy host, and verifies the rail geometry —
 * closed loop, gentle grades, curve radius that fits the consist, arc-length
 * poses, crossing detection and the circle-vs-box ram test.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";

if (typeof (globalThis as { self?: unknown }).self === "undefined") {
  (globalThis as { self?: unknown }).self = globalThis;
}

// Serve /assets/jeep/train/*.glb straight from public/ — Node's undici
// rejects site-relative URLs, so patch Request and fetch.
const ROOT = path.resolve(__dirname, "../..");
const realFetch = globalThis.fetch.bind(globalThis);
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
  if (pathname.startsWith("/assets/jeep/train/")) {
    const body = fs.readFileSync(path.join(ROOT, "public", pathname));
    return new Response(body, { status: 200 });
  }
  return realFetch(input, init);
}) as typeof fetch;

import {
  RailPath,
  RAIL_SAMPLES,
  TRAIN_SPEED,
  TrainSystem,
  findCrossings,
  obbCircleHit,
  type RailPose,
  type TrainHost,
} from "./train";

const flat = (): RailPath => RailPath.build(() => 0);

interface Spy {
  puffs: number;
  whistles: number;
  rams: { closing: number }[];
  boxes: { added: number; moved: number; removed: number };
}

function makeSpyHost(rail: RailPath, crossings: { x: number; z: number }[] = []): { host: TrainHost; spy: Spy } {
  const spy: Spy = { puffs: 0, whistles: 0, rams: [], boxes: { added: 0, moved: 0, removed: 0 } };
  const host: TrainHost = {
    scene: new THREE.Scene(),
    rail,
    crossings,
    puff: () => {
      spy.puffs++;
    },
    whistle: () => {
      spy.whistles++;
    },
    onRam: (closing) => {
      spy.rams.push({ closing });
    },
    addBox: () => {
      spy.boxes.added++;
    },
    moveBox: () => {
      spy.boxes.moved++;
    },
    removeBox: () => {
      spy.boxes.removed++;
    },
    camRight: (out) => out.set(1, 0, 0),
  };
  return { host, spy };
}

describe("RailPath", () => {
  const rail = flat();

  it("closes seamlessly and samples uniformly", () => {
    expect(rail.pts.length).toBe(RAIL_SAMPLES);
    const wrap = rail.pts[RAIL_SAMPLES - 1].distanceTo(rail.pts[0]);
    expect(Math.abs(wrap - rail.segLen) / rail.segLen).toBeLessThan(0.01);
    for (let i = 0; i < RAIL_SAMPLES; i++) {
      const p = rail.pts[i];
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      expect(Number.isFinite(p.z)).toBe(true);
    }
  });

  it("keeps grades gentle and curve radii long enough for the consist", () => {
    let maxGrade = 0;
    let minR = 1e9;
    for (let i = 0; i < RAIL_SAMPLES; i++) {
      const a = rail.pts[(i - 1 + RAIL_SAMPLES) % RAIL_SAMPLES];
      const b = rail.pts[i];
      const c = rail.pts[(i + 1) % RAIL_SAMPLES];
      maxGrade = Math.max(maxGrade, Math.abs(c.y - b.y) / rail.segLen);
      const ab = Math.hypot(b.x - a.x, b.z - a.z);
      const bc = Math.hypot(c.x - b.x, c.z - b.z);
      const ac = Math.hypot(c.x - a.x, c.z - a.z);
      const area2 = Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z));
      if (area2 > 1e-9) minR = Math.min(minR, (ab * bc * ac) / (2 * area2));
    }
    expect(maxGrade).toBeLessThan(0.06); // ≈ 3.4°
    expect(minR).toBeGreaterThan(90); // the consist is 34.5u long
  });

  it("queries the nearest point exactly on the centreline", () => {
    for (const i of [0, 100, 450, 800]) {
      const p = rail.pts[i];
      const info = rail.info(p.x, p.z);
      expect(info.dist).toBeLessThan(0.01);
      expect(Math.abs(info.y - p.y)).toBeLessThan(0.05);
    }
    // lateral offset reads as distance
    const p = rail.pts[200];
    const t = rail.tan[200];
    const info = rail.info(p.x - t.z * 10, p.z + t.x * 10);
    expect(Math.abs(info.dist - 10)).toBeLessThan(0.05);
  });

  it("poses wrap and advance by arc length", () => {
    const a: RailPose = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
    const b: RailPose = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
    rail.pose(0, a);
    rail.pose(rail.length, b);
    expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(0.05);
    rail.pose(50, a);
    rail.pose(0, b);
    // chord ≈ arc over 50u at these radii
    expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeGreaterThan(49.5);
    expect(Math.hypot(a.tx, a.ty, a.tz)).toBeCloseTo(1, 5);
  });
});

describe("findCrossings", () => {
  const circle = (cx: number, cz: number, r: number, n: number): THREE.Vector3[] => {
    const out: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      out.push(new THREE.Vector3(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r));
    }
    return out;
  };

  it("finds both intersections of two overlapping rings", () => {
    const crossings = findCrossings(circle(0, 0, 250, 360), circle(400, 0, 250, 360));
    expect(crossings.length).toBe(2);
    // circles r=250 centred 400 apart meet at x=200, z=±150
    for (const c of crossings) {
      expect(Math.abs(c.x - 200)).toBeLessThan(1);
      expect(Math.abs(Math.abs(c.z) - 150)).toBeLessThan(1);
    }
  });

  it("finds none when the rings are apart", () => {
    expect(findCrossings(circle(0, 0, 250, 360), circle(900, 0, 250, 360)).length).toBe(0);
  });
});

describe("obbCircleHit", () => {
  const hit = { nx: 0, nz: 0, depth: 0 };

  it("misses beside the box, hits with a push-out normal", () => {
    // box half-extents: x=1, z=3 — face plane at x=1
    expect(obbCircleHit(6, 0, 1, 0, 0, 3, 1, 0, hit)).toBe(0);
    const depth = obbCircleHit(1.5, 0, 1, 0, 0, 3, 1, 0, hit);
    expect(depth).toBeCloseTo(0.5, 5);
    expect(hit.nx).toBeCloseTo(1, 5);
    expect(hit.nz).toBeCloseTo(0, 5);
  });

  it("resolves a centred circle along the shallowest face and honours yaw", () => {
    const inside = obbCircleHit(0, 0, 1.5, 0, 0, 3, 1, 0, hit);
    expect(inside).toBeCloseTo(0.5, 5); // face is 1 away, radius 1.5
    expect(Math.abs(hit.nx)).toBeCloseTo(1, 5); // exits through the near x-face
    // 90° yaw rotates the box: the shallowest face now faces world ∓Z
    obbCircleHit(0, 0, 1.5, 0, 0, 3, 1, Math.PI / 2, hit);
    expect(Math.abs(hit.nz)).toBeCloseTo(1, 5);
  });
});

describe("TrainSystem", () => {
  const STEP = 1 / 60;

  async function booted() {
    const rail = flat();
    const { host, spy } = makeSpyHost(rail, [{ x: rail.pts[0].x, z: rail.pts[0].z }]);
    const sys = new TrainSystem(host);
    await sys.load();
    sys.spawn();
    return { rail, spy, sys };
  }

  it("builds the five-car consist from the shipped GLBs", async () => {
    const { sys } = await booted();
    expect(sys.carCount).toBe(5);
  });

  it("runs forever: advances, smokes, tracks colliders and rams the player", async () => {
    const { rail, spy, sys } = await booted();
    const pose: RailPose = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
    let d = 0;
    let soundGained = false;
    for (let k = 0; k < 60 * 10; k++) {
      // ride along ON the track — the player stands where the loco will be
      rail.pose(d + 1, pose);
      sys.update(STEP, new THREE.Vector3(pose.x, pose.y, pose.z));
      soundGained ||= sys.sound.gain > 0.5;
      d += TRAIN_SPEED * STEP;
    }
    expect(sys.sound.gain).toBeGreaterThan(0.5); // never silent up close
    expect(soundGained).toBe(true);
    expect(spy.puffs).toBeGreaterThan(75); // chimney never stops (~0.11s cadence)
    expect(spy.boxes.added).toBeGreaterThanOrEqual(5); // one collider per car
    expect(spy.boxes.removed).toBe(0); // cars stay live while the player rides along
    expect(spy.rams.length).toBeGreaterThanOrEqual(5); // run over, repeatedly
    expect(spy.whistles).toBeGreaterThanOrEqual(1); // announced the crossing
  });

  it("goes quiet when the player is far away", async () => {
    const { sys } = await booted();
    sys.update(STEP, new THREE.Vector3(5000, 0, 5000));
    expect(sys.sound.gain).toBe(0);
  });
});
