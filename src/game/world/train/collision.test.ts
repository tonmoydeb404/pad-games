/** Level-crossing detection and the circle-vs-box ram test. */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { obbCircleHit } from "./collision";
import { findCrossings } from "./crossings";

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
