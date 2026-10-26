import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { InstanceLod, SHADOW_R, VIEW_R } from "./instance-lod";

function meshAt(xs: number[]): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), xs.length);
  const d = new THREE.Object3D();
  xs.forEach((x, i) => {
    d.position.set(x, 0, 0);
    d.updateMatrix();
    im.setMatrixAt(i, d.matrix);
    im.setColorAt(i, new THREE.Color(i / 10, 0, 0));
  });
  return im;
}
const xsOf = (im: THREE.InstancedMesh, n: number): number[] => Array.from({ length: n }, (_, i) => im.instanceMatrix.array[i * 16 + 12]);

describe("InstanceLod", () => {
  it("orders near instances first and trims each pass", () => {
    const far = VIEW_R + 50;
    const mid = (SHADOW_R + VIEW_R) / 2;
    const im = meshAt([mid, 5, far, 20]);
    const lod = new InstanceLod();
    lod.register(im);
    lod.update(0, 0);
    expect(im.count).toBe(3); // the one past VIEW_R is gone
    expect(xsOf(im, 3)).toEqual([5, 20, mid]); // shadow-reach instances first
    (im.onBeforeShadow as () => void)();
    expect(im.count).toBe(2);
    (im.onAfterShadow as () => void)();
    expect(im.count).toBe(3);
  });

  it("moves the colour with its instance", () => {
    const im = meshAt([300, 5]);
    const lod = new InstanceLod();
    lod.register(im);
    lod.update(0, 0);
    expect(im.instanceColor!.array[0]).toBeCloseTo(0.1); // instance 1 (x=5) is now first
    expect(im.instanceColor!.array[3]).toBeCloseTo(0);
  });

  it("brings instances back when the focus moves toward them", () => {
    const im = meshAt([0, VIEW_R + 200]);
    const lod = new InstanceLod();
    lod.register(im);
    lod.update(0, 0);
    expect(im.count).toBe(1);
    lod.update(VIEW_R + 150, 0);
    expect(im.count).toBe(1);
    expect(xsOf(im, 1)).toEqual([VIEW_R + 200]);
  });

  it("skips the resort while the focus barely moves", () => {
    const im = meshAt([5]);
    const lod = new InstanceLod();
    lod.register(im);
    lod.update(0, 0);
    im.count = 99;
    lod.update(2, 0);
    expect(im.count).toBe(99);
  });
});
