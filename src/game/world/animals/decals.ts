import * as THREE from "three";
import type { AnimalCtx } from "./actor";
import { MAX_DECALS } from "./constants";

export function addDecal(ctx: AnimalCtx, x: number, y: number, z: number, r: number): void {
  let slot = ctx.decals.find((d) => d.life <= 0);
  if (!slot) {
    if (ctx.decals.length >= MAX_DECALS) {
      slot = ctx.decals.reduce((m, d) => (d.life < m.life ? d : m), ctx.decals[0]);
    } else {
      const mesh = new THREE.Mesh(ctx.decalGeo, ctx.decalMat.clone());
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 2;
      ctx.host.scene.add(mesh);
      slot = { mesh, life: 0 };
      ctx.decals.push(slot);
    }
  }
  slot.mesh.visible = true;
  slot.mesh.position.set(x, y + 0.035, z);
  slot.mesh.scale.setScalar(r);
  (slot.mesh.material as THREE.MeshBasicMaterial).opacity = 0.78;
  slot.life = 26;
}

export function updateDecals(ctx: AnimalCtx, dt: number): void {
  for (const d of ctx.decals) {
    if (d.life <= 0) continue;
    d.life -= dt;
    const mat = d.mesh.material as THREE.MeshBasicMaterial;
    if (d.life < 6) mat.opacity = 0.78 * Math.max(0, d.life / 6);
    if (d.life <= 0) d.mesh.visible = false;
  }
}
