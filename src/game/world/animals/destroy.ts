import type { AnimalCtx } from "./actor";

export function destroyAnimals(ctx: AnimalCtx): void {
  for (const a of ctx.actors) {
    ctx.host.scene.remove(a.root);
    if (a.bar) ctx.host.scene.remove(a.bar.group);
    a.mixer.stopAllAction();
  }
  ctx.actors = [];
  for (const d of ctx.decals) ctx.host.scene.remove(d.mesh);
  ctx.decals = [];
  ctx.decalGeo.dispose();
  ctx.decalMat.dispose();
}
