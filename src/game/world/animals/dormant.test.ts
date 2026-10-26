import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { Actor } from "./actor";
import { HIDE_DIST } from "./constants";
import { setDormant } from "./dormant";

const actor = (): Actor => ({ root: new THREE.Group() }) as unknown as Actor;

describe("setDormant", () => {
  it("hides far animals and stops their matrix updates", () => {
    const a = actor();
    setDormant(a, HIDE_DIST + 1);
    expect(a.root.visible).toBe(false);
    expect(a.root.matrixWorldAutoUpdate).toBe(false);
  });

  it("wakes them when they come back, with hysteresis at the edge", () => {
    const a = actor();
    setDormant(a, HIDE_DIST + 1);
    setDormant(a, HIDE_DIST - 5); // inside the hide radius but not yet inside the wake radius
    expect(a.root.visible).toBe(false);
    setDormant(a, HIDE_DIST - 30);
    expect(a.root.visible).toBe(true);
    expect(a.root.matrixWorldAutoUpdate).toBe(true);
  });

  it("leaves near animals alone", () => {
    const a = actor();
    setDormant(a, 10);
    expect(a.root.visible).toBe(true);
  });
});
