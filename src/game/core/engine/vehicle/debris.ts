/** Crash debris pool and collision effects. */
import * as THREE from "three";
import { loadDebrisParts } from "../../../player/cars";
import { clamp, TAU } from "../../noise";
import type { JeepEngine } from "../jeep-engine";

/** Fetch the debris models and build the mesh pool (once, best-effort). */
export async function initDebris(this: JeepEngine): Promise<void> {
  try {
    const parts = await loadDebrisParts();
    if (parts.length === 0 || !this.scene || this.destroyed) return;
    this.debrisParts = parts;
    for (let i = 0; i < 22; i++) {
      const grp = new THREE.Group();
      grp.visible = false;
      this.scene.add(grp);
      this.debrisPool.push({ grp, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, life: 0 });
    }
  } catch {
    // debris is pure juice — silently skip when the pack is missing
  }
}

/** Toss a burst of debris parts at a crash point. power ≈ impact speed. */
export function spawnDebris(this: JeepEngine, x: number, y: number, z: number, power: number): void {
  if (this.debrisPool.length === 0 || this.debrisParts.length === 0) return;
  const n = Math.min(5, 1 + Math.floor(power / 1.6));
  for (let k = 0; k < n; k++) {
    const d = this.debrisPool[this.debrisHead];
    this.debrisHead = (this.debrisHead + 1) % this.debrisPool.length;
    // pick a fresh part each spawn (the pool reuses groups, not meshes)
    const p = this.debrisParts[(Math.random() * this.debrisParts.length) | 0];
    d.grp.clear();
    const m = new THREE.Mesh(p.geometry, p.material);
    m.castShadow = true;
    d.grp.add(m);
    d.grp.position.set(x + (Math.random() - 0.5) * 0.6, y + Math.random() * 0.5, z + (Math.random() - 0.5) * 0.6);
    d.grp.rotation.set(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU);
    const sp = 1.5 + Math.random() * power * 0.45;
    d.vx = (Math.random() - 0.5) * sp * 1.6;
    d.vy = 2 + Math.random() * sp * 0.8;
    d.vz = (Math.random() - 0.5) * sp * 1.6;
    d.rx = (Math.random() - 0.5) * 9;
    d.ry = (Math.random() - 0.5) * 9;
    d.life = 1.5;
    d.grp.scale.setScalar(0.9 + Math.random() * 0.5);
    d.grp.visible = true;
  }
}

export function updateDebris(this: JeepEngine, dt: number): void {
  for (const d of this.debrisPool) {
    if (d.life <= 0) continue;
    d.life -= dt;
    if (d.life <= 0) {
      d.grp.visible = false;
      continue;
    }
    d.vy -= 7.5 * dt;
    d.grp.position.x += d.vx * dt;
    d.grp.position.y += d.vy * dt;
    d.grp.position.z += d.vz * dt;
    d.grp.rotation.x += d.rx * dt;
    d.grp.rotation.y += d.ry * dt;
    const gh = this.terrainHeight(d.grp.position.x, d.grp.position.z);
    if (d.grp.position.y < gh + 0.06 && d.vy < 0) {
      d.grp.position.y = gh + 0.06;
      d.vy *= -0.35;
      d.vx *= 0.6;
      d.vz *= 0.6;
      d.rx *= 0.5;
      d.ry *= 0.5;
    }
    if (d.life < 0.4) d.grp.scale.setScalar(Math.max(0.01, d.grp.scale.x * (1 - dt * 2.4)));
  }
}

/** Impact feedback (sound, shake, sparks, debris) for a hit of `impact` u/s. */
export function collisionFx(this: JeepEngine, impact: number, nx: number, nz: number): void {
  const v = this.v;
  v.bumpImpulse = Math.min(1, v.bumpImpulse + impact * 0.09);
  // light vehicles rattle their driver more; heavy ones shrug it off
  const massShake = clamp(1.15 - 0.35 * (this.perf.mass - 1), 0.45, 1.3);
  this.addTrauma(Math.min(0.55, impact * 0.05 * massShake));
  if (impact > 5.5) this.slowmoT = 0.09;
  this.audio.thump(impact * 0.3);
  this.input.rumble(clamp(0.3 + impact * 0.08, 0.3, 1), 120 + clamp(impact * 25, 0, 300));
  for (let k = 0; k < 4; k++) {
    this.spawnParticle(
      v.pos.x - nx * 1.3 + (Math.random() - 0.5),
      v.pos.y - 0.2 + Math.random() * 0.7,
      v.pos.z - nz * 1.3 + (Math.random() - 0.5),
      nx * 2 + (Math.random() - 0.5) * 1.6,
      1.2 + Math.random() * 1.4,
      nz * 2 + (Math.random() - 0.5) * 1.6,
      "#a8946a",
      0.14,
      0.6,
      0.6,
    );
  }
  if (impact > 2.2) this.spawnDebris(v.pos.x - nx * 1.1, v.pos.y - 0.3, v.pos.z - nz * 1.1, impact);
  if (impact > 4) this.notify("Ouch! Watch the obstacles");
}
