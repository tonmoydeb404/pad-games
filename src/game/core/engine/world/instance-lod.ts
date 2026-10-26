/**
 * Distance culling for instanced scenery. A single InstancedMesh has one world-sized
 * bounding sphere, so three.js can never frustum-cull it and every tree is drawn twice
 * a frame (main + shadow pass). This keeps each mesh's instances ordered nearest-first
 * and trims `count` per pass: everything within VIEW_R for the main pass, and only
 * what can reach the (small, player-centred) shadow map for the shadow pass.
 */
import type * as THREE from "three";

/** Main-pass radius. Past this FogExp2(0.0026) hides >85% of an object. */
export const VIEW_R = 460;
/** Shadow-pass radius: the shadow box is ±68 around the player, plus casters up-sun. */
export const SHADOW_R = 140;
/** Re-sort only after the focus has moved this far. */
const REFRESH = 6;

interface Entry {
  mesh: THREE.InstancedMesh;
  mats: Float32Array;
  cols: Float32Array | null;
  x: Float32Array;
  z: Float32Array;
  total: number;
  near: number;
  vis: number;
}

export class InstanceLod {
  private readonly entries: Entry[] = [];
  private lastX = NaN;
  private lastZ = NaN;
  /** `?nolod` in the URL draws everything, for before/after comparisons. */
  private readonly off = typeof location !== "undefined" && /[?&]nolod\b/.test(location.search);

  /** Snapshot the mesh's full instance set. Call once, after the matrices are written. */
  register(mesh: THREE.InstancedMesh): void {
    const total = mesh.count;
    const mats = Float32Array.from(mesh.instanceMatrix.array.subarray(0, total * 16));
    const cols = mesh.instanceColor ? Float32Array.from(mesh.instanceColor.array.subarray(0, total * 3)) : null;
    const x = new Float32Array(total);
    const z = new Float32Array(total);
    for (let i = 0; i < total; i++) {
      x[i] = mats[i * 16 + 12];
      z[i] = mats[i * 16 + 14];
    }
    const e: Entry = { mesh, mats, cols, x, z, total, near: total, vis: total };
    mesh.onBeforeShadow = () => {
      mesh.count = e.near;
    };
    mesh.onAfterShadow = () => {
      mesh.count = e.vis;
    };
    this.entries.push(e);
    this.lastX = NaN; // force a refresh on the next update
  }

  /** Reorder + recount for a new focus point (cheap early-out while it barely moves). */
  update(px: number, pz: number): void {
    if (this.off) return;
    if (Math.hypot(px - this.lastX, pz - this.lastZ) < REFRESH) return;
    this.lastX = px;
    this.lastZ = pz;
    const s2 = SHADOW_R * SHADOW_R;
    const v2 = VIEW_R * VIEW_R;
    for (const e of this.entries) {
      const dst = e.mesh.instanceMatrix.array as Float32Array;
      const dcol = e.mesh.instanceColor?.array as Float32Array | undefined;
      let w = 0;
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < e.total; i++) {
          const dx = e.x[i] - px;
          const dz = e.z[i] - pz;
          const d2 = dx * dx + dz * dz;
          if (pass === 0 ? d2 > s2 : d2 <= s2 || d2 > v2) continue;
          const a = i * 16;
          const b = w * 16;
          for (let k = 0; k < 16; k++) dst[b + k] = e.mats[a + k];
          if (e.cols && dcol) {
            dcol[w * 3] = e.cols[i * 3];
            dcol[w * 3 + 1] = e.cols[i * 3 + 1];
            dcol[w * 3 + 2] = e.cols[i * 3 + 2];
          }
          w++;
        }
        if (pass === 0) e.near = w;
      }
      e.vis = w;
      e.mesh.count = w;
      e.mesh.instanceMatrix.needsUpdate = true;
      if (e.mesh.instanceColor) e.mesh.instanceColor.needsUpdate = true;
    }
  }
}
