/** Gun firing, ray casting and tracers. */
import * as THREE from "three";
import { damageAt, type GunDef } from "../../../weapons/weapons";
import { clamp, TAU } from "../../noise";
import { FOOT_RUN } from "../config/foot-constants";
import type { JeepEngine } from "../jeep-engine";

/** First solid thing along a ray: terrain or a trunk/boulder (distance, or `maxT` if clear). */
export function rayWorld(this: JeepEngine, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): number {
  const STEP = 0.6;
  let prevT = 0;
  for (let t = STEP; t <= maxT; t += STEP) {
    const x = ox + dx * t;
    const y = oy + dy * t;
    const z = oz + dz * t;
    const gh = this.groundHeight(x, z);
    if (y <= gh) {
      // refine inside the last step so impacts land on the surface, not 0.6 m early
      let lo = prevT;
      let hi = t;
      for (let i = 0; i < 5; i++) {
        const mid = (lo + hi) / 2;
        if (oy + dy * mid <= this.groundHeight(ox + dx * mid, oz + dz * mid)) hi = mid;
        else lo = mid;
      }
      return hi;
    }
    if (y - gh < 12) {
      for (const b of this.colliders) {
        const cx = x - b.x;
        const cz = z - b.z;
        const r = b.r * 0.9;
        if (cx * cx + cz * cz < r * r) return t;
      }
    }
    prevT = t;
  }
  return maxT;
}

export function fireGun(this: JeepEngine, g: GunDef, aiming: boolean, speed: number): void {
  const ar = this.armory;
  const cam = this.camera;
  const ex = this.explorer;
  const an = this.animals;
  if (!cam || !ex || !ar.fire()) return;
  const f = this.foot;

  // aim ray = straight through the crosshair, starting just in front of the player
  cam.getWorldDirection(this.gv1); // gv1 = camera forward
  const head = this.gv2.set(f.pos.x, f.pos.y + 1.45, f.pos.z);
  const along = Math.max(0.5, this.gv3.subVectors(head, cam.position).dot(this.gv1));
  const ox = cam.position.x + this.gv1.x * along;
  const oy = cam.position.y + this.gv1.y * along;
  const oz = cam.position.z + this.gv1.z * along;
  const muzzle = this.gv4;
  if (!ex.muzzleWorld(muzzle)) muzzle.set(f.pos.x, f.pos.y + 1.3, f.pos.z);

  // spread: tight when aiming and standing, wide from the hip and on the move
  const cone = g.spread * (aiming ? 1 : g.hipSpread) * (1 + clamp(speed / FOOT_RUN, 0, 1) * 1.2);
  let anyHit = false;
  let anyKill = false;
  for (let i = 0; i < g.pellets; i++) {
    const ang = Math.sqrt(Math.random()) * cone;
    const phi = Math.random() * TAU;
    // perpendicular basis around the aim direction
    const fx = this.gv1.x;
    const fy = this.gv1.y;
    const fz = this.gv1.z;
    let ux = -fz;
    let uz = fx;
    const ul = Math.hypot(ux, uz) || 1;
    ux /= ul;
    uz /= ul;
    const vx = fy * uz;
    const vy = fz * ux - fx * uz;
    const vz = -fy * ux;
    const sa = Math.sin(ang);
    const ca = Math.cos(ang);
    const dx = fx * ca + (ux * Math.cos(phi) + vx * Math.sin(phi)) * sa;
    const dy = fy * ca + (vy * Math.sin(phi)) * sa;
    const dz = fz * ca + (uz * Math.cos(phi) + vz * Math.sin(phi)) * sa;

    const worldT = this.rayWorld(ox, oy, oz, dx, dy, dz, g.range);
    const hit = an?.shoot(ox, oy, oz, dx, dy, dz, worldT, (t) => damageAt(g, t), g.knock) ?? null;
    const t = hit ? hit.t : worldT;
    const ex2 = ox + dx * t;
    const ey = oy + dy * t;
    const ez = oz + dz * t;
    if (hit) {
      anyHit = true;
      if (hit.killed) anyKill = true;
    } else if (worldT < g.range) {
      // dust and chips where it struck the ground or a trunk
      for (let k = 0; k < 4; k++)
        this.spawnParticle(
          ex2, ey, ez, (Math.random() - 0.5) * 2.2, 0.8 + Math.random() * 1.6, (Math.random() - 0.5) * 2.2,
          "#b7a47c", 0.1, 0.3, 0.35,
        );
    }
    this.addTracer(muzzle.x, muzzle.y, muzzle.z, ex2, ey, ez, g.pellets > 1 ? 0.5 : 0.9);
  }

  // muzzle flash, sound, recoil
  for (let k = 0; k < 3; k++)
    this.spawnParticle(
      muzzle.x, muzzle.y, muzzle.z, (Math.random() - 0.5) * 1.2, (Math.random() - 0.2) * 1.2, (Math.random() - 0.5) * 1.2,
      k === 0 ? "#fff3c4" : "#ffb84a", 0.32, 0.04, 0.07,
    );
  this.audio.gunshot(g.sound);
  ex.kickGun(1);
  // GTA-style: the reticle lifts a little and eases back on its own — it never walks off target
  this.camKick = Math.min(0.07, this.camKick + g.recoil * (aiming ? 0.55 : 0.9));
  this.camState.trauma = Math.min(1, this.camState.trauma + 0.012 + g.recoil * 0.6);
  this.input.rumble(clamp(0.18 + g.recoil * 8, 0.2, 0.7), 70);
  if (anyHit) {
    this.hitMarkT = 0.18;
    this.hitKill = anyKill;
    this.audio.hitMarker(anyKill);
  }
}

export function addTracer(this: JeepEngine, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, opacity: number): void {
  const scene = this.scene;
  if (!scene) return;
  const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
  if (len < 0.2) return;
  const mat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity, depthWrite: false });
  const m = new THREE.Mesh(this.tracerGeo, mat);
  m.scale.set(0.035, 0.035, len);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.lookAt(x1, y1, z1);
  m.frustumCulled = false;
  scene.add(m);
  this.tracers.push({ mesh: m, life: 0.07, max: 0.07 });
}

export function updateTracers(this: JeepEngine, dt: number): void {
  for (let i = this.tracers.length - 1; i >= 0; i--) {
    const t = this.tracers[i];
    t.life -= dt;
    if (t.life <= 0) {
      this.scene?.remove(t.mesh);
      (t.mesh.material as THREE.Material).dispose();
      this.tracers.splice(i, 1);
    } else {
      (t.mesh.material as THREE.MeshBasicMaterial).opacity *= 0.85;
    }
  }
}
