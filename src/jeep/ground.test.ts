import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { HeightGrid } from "./ground";

describe("HeightGrid", () => {
  it("reproduces the rendered PlaneGeometry surface exactly", () => {
    const size = 100;
    const seg = 10;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const heights = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      heights[i] = Math.sin(i * 12.9898) * 3 + Math.cos(i * 4.1) * 2;
      pos.setY(i, heights[i]);
    }
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    mesh.updateMatrixWorld(true);
    const grid = new HeightGrid(size, seg, heights);
    const ray = new THREE.Raycaster();
    for (const [x, z] of [[3.3, -7.1], [-41.2, 18.8], [0.4, 0.4], [29.9, 29.9], [-12.5, -37.7], [10.0, 9.99]]) {
      ray.set(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(mesh)[0];
      expect(grid.sample(x, z)).toBeCloseTo(hit.point.y, 3);
    }
  });
});
