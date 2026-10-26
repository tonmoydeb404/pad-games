/** Constructor-time world maths: trail spline + spatial hash, rail loop, Port Marin site. */
import * as THREE from "three";
import { CitySite, JUNCTION_T } from "../../../world/city";
import { RailPath, findCrossings } from "../../../world/train";
import { smooth, TAU } from "../../noise";
import { CTRL, SAMPLES, CELL, gridKey } from "../config/world-constants";
import type { JeepEngine } from "../jeep-engine";

/** Trail spline + samples + spatial hash (pure math, fast). */
export function initTrail(this: JeepEngine): void {
  // trail spline + samples + spatial hash (pure math, fast)
  const curvePts = CTRL.map((p) => new THREE.Vector3(p[0], 0, p[1]));
  const trail = new THREE.CatmullRomCurve3(curvePts, true, "catmullrom", 0.5);
  this.trailPts = trail.getSpacedPoints(SAMPLES);
  for (let i = 0; i <= SAMPLES; i++) {
    const a = this.trailPts[i];
    const b = this.trailPts[(i + 1) % SAMPLES];
    this.trailTan.push(new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize());
  }
  this.segLen = Math.max(0.2, this.trailPts[0].distanceTo(this.trailPts[1]));
  // Road height = smoothed base terrain (kills the generator's short-wavelength
  // noise) + a designed rolling-hills profile. The base alone measures ≈1°
  // grade at p50 / 4° max at ring scale — a billiard table that left the jeep
  // glued level — so three detuned harmonics add 5–15° crests and dips.
  // Periodic in t, so the closed loop stays seamless.
  {
    const raw = new Float32Array(SAMPLES + 1);
    for (let i = 0; i <= SAMPLES; i++) {
      raw[i] = this.baseTerrain(this.trailPts[i].x, this.trailPts[i].z) + 0.9;
    }
    const WIN = 46; // ≈ ±52 world units of smoothing along the track
    const hill = (i: number): number => {
      const t = (i % SAMPLES) / SAMPLES;
      return (
        4.0 * Math.sin(TAU * 5 * t + 0.7) +
        3.0 * Math.sin(TAU * 9 * t + 2.1) +
        2.2 * Math.sin(TAU * 14 * t + 4.4)
      );
    };
    for (let i = 0; i <= SAMPLES; i++) {
      let s = 0;
      for (let k = -WIN; k <= WIN; k++) s += raw[(i + k + SAMPLES) % SAMPLES];
      this.trailPts[i].y = s / (2 * WIN + 1) + hill(i);
    }
  }
  for (let i = 0; i < SAMPLES; i++) {
    const p = this.trailPts[i];
    const cx = Math.floor(p.x / CELL);
    const cz = Math.floor(p.z / CELL);
    for (let ox = -1; ox <= 1; ox++)
      for (let oz = -1; oz <= 1; oz++) {
        const k = gridKey(cx + ox, cz + oz);
        let arr = this.trailGrid.get(k);
        if (!arr) {
          arr = [];
          this.trailGrid.set(k, arr);
        }
        arr.push(i);
      }
  }
  this.pickKickers();
}

/** Rail loop, the town site and water levels — all pure math on the finished trail. */
export function initSites(this: JeepEngine): void {
  // railway loop around the trail: bed heights smoothed off the base terrain
  // (wide window — trains hate grades), pulled level with the trail bed
  // through the level crossings so both cross at grade
  this.rail = RailPath.build(
    (x, z) => this.baseTerrain(x, z),
    (x, z) => {
      const ti = this.trailInfo(x, z);
      return ti.dist < 26 ? { y: ti.y + 0.1, w: smooth(1 - ti.dist / 26) } : null;
    },
  );
  this.railCrossings = findCrossings(this.rail.pts, this.trailPts);

  // Port Marin: the town beside the jungle. Its shelf and access road
  // carve the terrain (terrainHeight consults it from here on), so the
  // site exists before any mesh or asset does — pure math, like the rail.
  this.city = CitySite.build({
    base: (x, z) => this.baseTerrain(x, z),
    junction: (() => {
      const i = Math.floor(SAMPLES * JUNCTION_T);
      const p = this.trailPts[i];
      const t = this.trailTan[i];
      return { x: p.x, z: p.z, y: p.y, tx: t.x, tz: t.z };
    })(),
    trailNear: (x, z) => {
      const ti = this.trailInfo(x, z);
      return ti.dist < 18 ? { y: ti.y, w: smooth(1 - ti.dist / 18) } : null;
    },
    railNear: (x, z) => {
      const ri = this.rail.info(x, z, this.tmpRailInfo);
      return ri.dist < 22 ? { y: ri.y, w: smooth(1 - ri.dist / 22) } : null;
    },
  });

  // water levels sit on the finished terrain (city carve included)
  this.stream.level = this.terrainHeight(this.stream.c.x, this.stream.c.z) + 0.62;
  for (const p of this.ponds) p.level = this.terrainHeight(p.x, p.z) + 0.55;
}
