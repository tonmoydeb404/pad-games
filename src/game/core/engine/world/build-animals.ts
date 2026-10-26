/** Wildlife system construction. */
import { AnimalSystem, type AnimalHost } from "../../../world/animals";
import { animalHitRumble } from "../../input";
import { clamp } from "../../noise";
import type { JeepEngine } from "../jeep-engine";

export async function buildAnimals(this: JeepEngine): Promise<void> {
  const host: AnimalHost = {
    scene: this.scene!,
    terrainHeight: (x, z) => this.terrainHeight(x, z),
    trailDist: (x, z) => this.trailInfo(x, z).dist,
    waterDist: (x, z) => this.waterDist(x, z),
    waterSpawnPoint: (r) => {
      const bodies: { x: number; z: number; r: number }[] = [
        { x: this.stream.c.x, z: this.stream.c.z, r: this.stream.r },
        ...this.ponds,
      ];
      const b = bodies[Math.floor(r() * bodies.length)];
      const ang = r() * Math.PI * 2;
      const d = b.r + 2 + r() * 26;
      return { x: b.x + Math.cos(ang) * d, z: b.z + Math.sin(ang) * d };
    },
    trailSpawnPoint: (r, offMin, offMax) => {
      const pts = this.trailPts;
      const i = Math.floor(r() * pts.length);
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      let tx = q.x - p.x;
      let tz = q.z - p.z;
      const l = Math.hypot(tx, tz) || 1;
      tx /= l;
      tz /= l;
      const off = offMin + r() * (offMax - offMin);
      const side = r() < 0.5 ? -1 : 1;
      // normal of the tangent
      return { x: p.x - tz * off * side, z: p.z + tx * off * side };
    },
    blocked: (x, z, r) => {
      if (this.rail.dist(x, z) < r + 4.2) return true; // never on the railway
      for (const c of this.colliders) {
        const dx = x - c.x;
        const dz = z - c.z;
        const rr = c.r + r;
        if (dx * dx + dz * dz < rr * rr) return true;
      }
      return false;
    },
    burst: (x, y, z, n, color, spread, size) => {
      for (let i = 0; i < n; i++) {
        this.spawnParticle(
          x, y, z,
          (Math.random() - 0.5) * spread,
          Math.random() * spread * 0.7 + 0.6,
          (Math.random() - 0.5) * spread,
          color, size, size * 0.25, 0.45 + Math.random() * 0.5,
        );
      }
    },
    onKill: (name, points) => {
      this.kills++;
      if (this.el.hKills) this.el.hKills.textContent = String(this.kills);
      this.notify(`${name} down! +${points}`);
    },
    onHeavyImpact: (approach) => {
      // heavy vehicles tank animal strikes; light ones get wrecked
      const massSoak = clamp(1.15 - 0.35 * (this.perf.mass - 1), 0.4, 1.3);
      this.damageJeep(clamp(approach / 46, 0.18, 0.55) * 32 * massSoak);
      this.slowmoT = 0.12;
      this.camState.trauma = Math.min(1, this.camState.trauma + 0.55);
      this.audio.thud(0.9);
      this.input.rumble(clamp(0.45 + approach / 46, 0.45, 1), 340);
    },
    onJeepImpact: (keep) => {
      this.v.speed *= keep;
    },
    onAnimalAttack: (dmg, keep, nx, nz) => {
      this.damageJeep(dmg);
      this.v.speed *= keep;
      // shove the jeep sideways in its own local frame
      const cy = Math.cos(this.v.yaw);
      const sy = Math.sin(this.v.yaw);
      this.v.lateral = clamp(this.v.lateral + (nx * cy + nz * -sy) * (2.5 + dmg * 0.12), -3.2, 3.2);
      this.camState.trauma = Math.min(1, this.camState.trauma + 0.3);
      this.audio.thud(0.7);
      this.input.rumble(0.7, 240);
    },
    onAnimalAttackFoot: (dmg, nx, nz) => this.hurtPlayer(dmg, nx, nz),
    thump: (s) => this.audio.thump(s),
    rumble: (m, ms) => {
      const h = animalHitRumble(m, ms);
      this.input.rumble(h.strength, h.ms);
    },
    camRight: (out) =>
      this.camera ? out.setFromMatrixColumn(this.camera.matrixWorld, 0) : out.set(1, 0, 0),
  };
  const sys = new AnimalSystem(host);
  await sys.load((k) => {
    if (!this.destroyed) this.onProgress?.(80 + k * 8, "Releasing the wildlife…");
  });
  sys.spawnAll();
  this.animals = sys;
}
