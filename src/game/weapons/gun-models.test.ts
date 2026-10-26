/**
 * Gun models — the real Blaster Kit GLBs through loadGunModel.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";

if (typeof (globalThis as { self?: unknown }).self === "undefined") {
  (globalThis as { self?: unknown }).self = globalThis;
}
const ROOT = path.resolve(__dirname, "../../..");
const realFetch = globalThis.fetch.bind(globalThis);
(globalThis as { ProgressEvent?: unknown }).ProgressEvent = class {
  type: string;
  lengthComputable = false;
  loaded = 0;
  total = 0;
  constructor(type: string) {
    this.type = type;
  }
};
const RealRequest = globalThis.Request;
globalThis.Request = class extends RealRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    super(url.startsWith("/") ? `http://localhost${url}` : (input as RequestInfo), init);
  }
} as typeof Request;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const pathname = new URL(raw, "http://localhost").pathname;
  if (pathname.startsWith("/assets/jeep/blasters/") && pathname.endsWith(".glb")) {
    return new Response(fs.readFileSync(path.join(ROOT, "public", pathname)), { status: 200 });
  }
  return realFetch(input, init);
}) as typeof fetch;


import { loadGunModel } from "./gun-models";
import { GUNS } from "./weapons";

/** Vertical extent (m) of the model's vertices in the front / rear quarter along +Z. */
function quarterHeights(root: THREE.Object3D): { front: number; rear: number; zmin: number; zmax: number } {
  root.updateMatrixWorld(true);
  const pts: number[][] = [];
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const a = m.geometry.getAttribute("position");
    for (let i = 0; i < a.count; i++) {
      v.fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld);
      pts.push([v.y, v.z]);
    }
  });
  const zs = pts.map((p) => p[1]);
  const zmin = Math.min(...zs);
  const zmax = Math.max(...zs);
  const span = (lo: number, hi: number): number => {
    const ys = pts.filter((p) => p[1] >= lo && p[1] <= hi).map((p) => p[0]);
    return Math.max(...ys) - Math.min(...ys);
  };
  const q = (zmax - zmin) / 4;
  return { front: span(zmax - q, zmax), rear: span(zmin, zmin + q), zmin, zmax };
}

describe("gun models", () => {
  it("every blaster loads, is sized to its length, with the grip at the origin and the muzzle ahead", async () => {
    for (const g of GUNS) {
      const m = await loadGunModel(g);
      expect(m, g.name).not.toBeNull();
      const { zmin, zmax } = quarterHeights(m!.root);
      expect(zmax - zmin, g.name).toBeCloseTo(m!.length, 1);
      expect(zmin, g.name).toBeLessThan(0); // stock behind the hand
      expect(zmax, g.name).toBeGreaterThan(0.1); // barrel ahead of it
      expect(Math.abs(zmin), g.name).toBeLessThan(zmax); // grip sits toward the back
      expect(m!.muzzle.z, g.name).toBeCloseTo(zmax, 1);
    }
  }, 60_000);

  it("the barrel points along +Z (not backwards): the slim barrel end is in front, the stock behind", async () => {
    // Longshot (rifle) is the unambiguous one — a long thin barrel ahead of a bulky stock/grip
    const m = await loadGunModel(GUNS[2]);
    const { front, rear } = quarterHeights(m!.root);
    expect(front).toBeLessThan(rear);
  }, 60_000);
});
