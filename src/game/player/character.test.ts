/**
 * Explorer rig — runs the real character.glb through loadJungleCharacter
 * (textures stubbed) and checks the procedural poses against the skeleton.
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
  if (pathname.startsWith("/assets/jeep/character/") && pathname.endsWith(".glb")) {
    return new Response(fs.readFileSync(path.join(ROOT, "public", pathname)), { status: 200 });
  }
  return realFetch(input, init);
}) as typeof fetch;
// no DOM Image in Node — a blank texture is enough for pose tests
THREE.TextureLoader.prototype.loadAsync = async () => new THREE.Texture();

import { loadJungleCharacter } from "./character";

/** Lowest foot/toe bone height above the character's feet origin. */
function lowestFoot(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  let min = Infinity;
  for (const n of ["LeftFoot", "RightFoot", "LeftToes", "RightToes"]) {
    const b = root.getObjectByName(n);
    if (!b) continue;
    b.getWorldPosition(v);
    min = Math.min(min, root.worldToLocal(v).y);
  }
  return min;
}

describe("explorer rig", () => {
  it("crouching keeps the feet on the ground (legs never sink into the surface)", async () => {
    const ch = await loadJungleCharacter();
    expect(ch).not.toBeNull();
    if (!ch) return;
    ch.setSpeed(0);
    ch.update(1 / 60);
    const standing = lowestFoot(ch.root);

    for (const k of [0.3, 0.6, 1]) {
      ch.setCrouch(k);
      ch.update(1 / 60);
      // soles stay within a couple of cm of where they were standing
      expect(Math.abs(lowestFoot(ch.root) - standing)).toBeLessThan(0.03);
    }
    // …also while walking crouched (run clip underneath)
    ch.setSpeed(3);
    for (let i = 0; i < 40; i++) {
      ch.update(1 / 60);
      expect(lowestFoot(ch.root)).toBeGreaterThan(standing - 0.06);
    }
    // and the pose really is lower: the head dropped
    ch.setSpeed(0);
    ch.setCrouch(0);
    ch.update(1 / 60);
    const head = ch.root.getObjectByName("Head")!;
    const hv = new THREE.Vector3();
    head.getWorldPosition(hv);
    const standHead = ch.root.worldToLocal(hv).y;
    ch.setCrouch(1);
    ch.update(1 / 60);
    head.getWorldPosition(hv);
    expect(standHead - ch.root.worldToLocal(hv).y).toBeGreaterThan(0.2);
  }, 60_000);
});
