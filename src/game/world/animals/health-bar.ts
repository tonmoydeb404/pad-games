import * as THREE from "three";
import type { Actor, AnimalCtx } from "./actor";
import { clamp } from "../../core/noise";
import { THINK_DIST } from "./constants";

/** Floating health bar (created lazily on first damage). */
export function ensureBar(ctx: AnimalCtx, a: Actor): void {
  if (a.bar) return;
  const w = a.def.height * 1.1 + 0.5;
  const h = Math.max(0.12, a.def.height * 0.055);
  const bg = new THREE.Sprite(ctx.barMats.bg);
  bg.scale.set(w + 0.08, h + 0.04, 1);
  bg.renderOrder = 10;
  const fg = new THREE.Sprite(ctx.barMats.fg);
  // anchor the fill's LEFT edge: scaling now depletes right→left only
  fg.center.set(0, 0.5);
  fg.scale.set(w, h, 1);
  fg.renderOrder = 11;
  const group = new THREE.Group();
  group.add(bg, fg);
  group.visible = false;
  ctx.host.scene.add(group);
  a.bar = { group, fg, w };
}

/** Health bar shows only shortly after taking damage. */
export function updateBar(ctx: AnimalCtx, a: Actor, dist: number): void {
  if (a.hurtT > 0 && a.hp > 0 && dist < THINK_DIST) {
    ensureBar(ctx, a);
    const bar = a.bar!;
    bar.group.visible = true;
    bar.group.position.set(a.pos.x, a.pos.y + a.def.height + 0.45, a.pos.z);
    // keep the fill's left edge pinned to the bar's left end, whatever
    // direction the camera looks from (screen-right axis)
    const cr = ctx.host.camRight(ctx.tmpV2);
    bar.fg.position.set(-cr.x * bar.w * 0.5, -cr.y * bar.w * 0.5, -cr.z * bar.w * 0.5);
    bar.fg.scale.x = bar.w * clamp(a.hp / a.maxHp, 0, 1);
  } else if (a.bar) {
    a.bar.group.visible = false;
  }
}
