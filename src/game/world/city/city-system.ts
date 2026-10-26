import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ROADS_BASE, TILE, TOWN_BASE } from "./constants";
import type { CitySite } from "./city-site";

export interface CityHost {
  scene: THREE.Scene;
  /** One solid box per building (engine owns the physics world). */
  addSolid(x: number, z: number, hx: number, hy: number, hz: number, rotY: number): void;
}

export class CitySystem {
  private readonly protos = new Map<string, THREE.Object3D>();
  private readonly meshes: THREE.Object3D[] = [];
  private built = false;

  constructor(private readonly site: CitySite) {}

  /** Load every model the plan references; failures degrade to bare ground. */
  async load(onProgress?: (k: number) => void): Promise<void> {
    const wanted = new Map<string, "town" | "roads">();
    for (const t of this.site.tiles) wanted.set(t.model, "roads");
    for (const p of this.site.props) wanted.set(p.model, p.dir);
    for (const b of this.site.buildings) wanted.set(b.model, "town");

    const loader = new GLTFLoader();
    const entries = [...wanted];
    let done = 0;
    await Promise.all(
      entries.map(
        ([name, dir]) =>
          new Promise<void>((resolve) => {
            loader.load(
              `${dir === "town" ? TOWN_BASE : ROADS_BASE}/${name}.glb`,
              (g) => {
                this.protos.set(name, g.scene);
                onProgress?.(++done / entries.length);
                resolve();
              },
              undefined,
              () => {
                console.warn(`[jeep] city asset missing: ${dir}/${name}.glb`);
                onProgress?.(++done / entries.length);
                resolve();
              },
            );
          }),
      ),
    );
  }

  /** Build the instanced town + register the building colliders. */
  spawn(host: CityHost): void {
    if (this.built) return;
    const xfs = new Map<string, { x: number; y: number; z: number; yaw: number; roll?: number }[]>();
    const put = (model: string, x: number, y: number, z: number, yaw: number, roll?: number): void => {
      let arr = xfs.get(model);
      if (!arr) xfs.set(model, (arr = []));
      arr.push({ x, y, z, yaw, roll });
    };
    for (const t of this.site.tiles) {
      const w = this.site.toWorld(t.u, t.v);
      put(t.model, w.x, this.site.plateauY + 0.02, w.z, this.site.yaw + t.yaw);
    }
    for (const p of this.site.roadPieces) put("road-straight", p.x, p.y, p.z, p.yaw, p.roll);
    for (const p of this.site.props) put(p.model, p.x, p.y, p.z, p.yaw);
    for (const b of this.site.buildings) {
      put(b.model, b.x, b.y, b.z, b.yaw);
      host.addSolid(b.x, b.z, Math.max(0.4, b.hx - 0.45), b.colH, Math.max(0.4, b.hz - 0.45), b.rotY);
    }

    const d = new THREE.Object3D();
    for (const [model, list] of xfs) {
      const proto = this.protos.get(model);
      if (!proto) continue;
      const parts: { mesh: THREE.Mesh; cast: boolean }[] = [];
      proto.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) parts.push({ mesh: m, cast: !model.startsWith("road-") && model !== "path-long" });
      });
      for (const { mesh } of parts) {
        const im = new THREE.InstancedMesh(mesh.geometry, mesh.material as THREE.Material, list.length);
        im.receiveShadow = true;
        im.castShadow = parts[0].cast;
        for (let i = 0; i < list.length; i++) {
          const xf = list[i];
          d.position.set(xf.x, xf.y, xf.z);
          // road pieces carry a grade roll ("YXZ": roll tips the long axis
          // onto the slope before yaw orients it)
          d.rotation.set(0, xf.yaw, xf.roll ?? 0, "YXZ");
          d.scale.setScalar(TILE);
          d.updateMatrix();
          im.setMatrixAt(i, d.matrix);
        }
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        host.scene.add(im);
        this.meshes.push(im);
      }
    }
    this.built = true;
  }

  get instanceCount(): number {
    return this.meshes.length;
  }

  destroy(): void {
    for (const m of this.meshes) m.removeFromParent();
    this.meshes.length = 0;
    this.built = false;
  }
}
