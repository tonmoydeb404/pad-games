import { clamp, smooth } from "../../core/noise";
import { buildAccessRoad, type RoadData } from "./access-road";
import {
  RING,
  ROAD_BLEND,
  ROAD_CORE,
  ROAD_SHOULDER,
  TILE,
  TOWN_BLEND,
  TOWN_BOUND,
  TOWN_CX,
  TOWN_CZ,
  TOWN_DIG,
  TOWN_FLAT,
} from "./constants";
import { layoutFurniture } from "./street-furniture";
import { layoutTiles } from "./street-plan";
import { layoutLots } from "./town-lots";
import { pavePieces, roadInfoAt, roadPoseAt } from "./road-queries";
import type {
  CityBuilding,
  CityHooks,
  CityProp,
  CityTile,
  RoadInfo,
  RoadPiece,
  RoadPose,
} from "./types";

/**
 * Pure town math: footprint, access road, street plan, carve and surface
 * queries. See the folder's index for the overview.
 */
export class CitySite {
  /** Shelf height (flat everywhere inside TOWN_FLAT). */
  readonly plateauY: number;
  /** Town yaw — local +v points from the junction toward the centre. */
  readonly yaw: number;
  /** Trail junction (access road mouth). */
  readonly junction: { x: number; z: number; y: number };
  /** Where the road crosses the railway (level crossing). */
  readonly crossing = { x: 0, z: 0 };
  /** Arc distance along the road of the level crossing. */
  crossingArc = 0;

  /** Street plan (grid tiles + the zebra at the gate). */
  readonly tiles: CityTile[] = [];
  /** Spline-paved straights between the junction and the gate (yaw + grade roll). */
  readonly roadPieces: RoadPiece[] = [];
  readonly buildings: CityBuilding[] = [];
  readonly props: CityProp[] = [];

  private readonly hooks: CityHooks;
  private road!: RoadData;

  private constructor(hooks: CityHooks) {
    this.hooks = hooks;
    const j = hooks.junction;
    this.junction = { x: j.x, z: j.z, y: j.y };

    // Town yaw: local +v points from the junction toward the centre.
    this.yaw = Math.atan2(TOWN_CX - j.x, TOWN_CZ - j.z);

    // Shelf height: the local rim height, dug in so the town sits in a
    // hollow instead of on a mesa top.
    let s = 0;
    for (const [dx, dz] of [[0, 0], [20, 0], [-20, 0], [0, 20], [0, -20]] as const) {
      s += hooks.base(TOWN_CX + dx, TOWN_CZ + dz);
    }
    this.plateauY = s / 5 - TOWN_DIG;
  }

  /* ---- construction ----------------------------------------------------- */

  static build(hooks: CityHooks): CitySite {
    const site = new CitySite(hooks);
    const gate = site.toWorld(0, -44);
    site.road = buildAccessRoad(hooks, gate, site.plateauY);
    site.crossing.x = site.road.crossing.x;
    site.crossing.z = site.road.crossing.z;
    site.crossingArc = site.road.crossingArc;
    site.roadPieces.push(...pavePieces(site.road));
    site.layoutTown();
    return site;
  }

  /** Street plan + lots + furniture (deterministic). */
  private layoutTown(): void {
    this.tiles.push(...layoutTiles());
    layoutLots(this);
    layoutFurniture(this, this.hooks.junction, this.roadLength, (d) => this.roadPose(d));
  }

  /** Position + tangent (with grade, `ty`) at arc distance `d` along the road. */
  roadPose(d: number): RoadPose {
    return roadPoseAt(this.road, d);
  }

  /** Arc length of the access road (junction → gate). */
  get roadLength(): number {
    return this.road.length;
  }

  /* ---- coordinate transforms ------------------------------------------- */

  /** City-local (u, v) → world. Local +v points junction → centre. */
  toWorld(u: number, v: number): { x: number; z: number } {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    return { x: this.cx0 + u * c + v * s, z: this.cz0 - u * s + v * c };
  }

  /** World → city-local (u, v). */
  toLocal(x: number, z: number): { u: number; v: number } {
    const dx = x - this.cx0;
    const dz = z - this.cz0;
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    return { u: dx * c - dz * s, v: dx * s + dz * c };
  }

  private readonly cx0 = TOWN_CX;
  private readonly cz0 = TOWN_CZ;

  /* ---- queries (hot paths: terrain carve / surface / bounds) ------------ */

  private readonly tmpRoad: RoadInfo = { dist: 1e9, y: 0 };

  /** Nearest access-road centreline point (dist + interpolated bed y). */
  roadInfo(x: number, z: number, out: RoadInfo = this.tmpRoad): RoadInfo {
    return roadInfoAt(this.road, x, z, out);
  }

  /**
   * Terrain carve for the town: the shelf, then the road (the road wins in
   * its corridor — it cuts the terrace where it climbs). The engine applies
   * this BEFORE the railway carve, so the Jungle Express keeps right of way
   * at the level crossing.
   */
  carve(x: number, z: number, h: number): number {
    // shelf: flat inside TOWN_FLAT, blending back to the rim over TOWN_BLEND
    const d = Math.hypot(x - this.cx0, z - this.cz0);
    const k = 1 - smooth(clamp((d - TOWN_FLAT) / TOWN_BLEND, 0, 1));
    if (k > 0) h += (this.plateauY - h) * k;
    // access road: flat tile core, then a long berm blend out to the
    // surroundings — the climb reads as an embankment, never a canyon
    const ri = this.roadInfo(x, z);
    if (ri.dist < ROAD_SHOULDER + ROAD_BLEND) {
      const w = 1 - smooth(clamp((ri.dist - ROAD_CORE) / (ROAD_SHOULDER + ROAD_BLEND - ROAD_CORE), 0, 1));
      h += (ri.y - h) * w;
    }
    return h;
  }

  /** Asphalt? (access road core + town streets) — drives the surface model. */
  asphaltAt(x: number, z: number): boolean {
    if (this.roadInfo(x, z).dist < ROAD_CORE + 0.8) return true;
    const { u, v } = this.toLocal(x, z);
    return this.onStreet(u, v);
  }

  /** Inside a street's asphalt band (grid lines + spurs). */
  private onStreet(u: number, v: number): boolean {
    let du = 1e9;
    let dv = 1e9;
    for (const L of [-RING, 0, RING]) {
      du = Math.min(du, Math.abs(u - L));
      dv = Math.min(dv, Math.abs(v - L));
    }
    return (du <= 2.9 && Math.abs(v) <= RING + 2.9) || (dv <= 2.9 && Math.abs(u) <= 2 * RING + TILE + 4.5);
  }

  /** Terrain paint kind for `buildTerrain`: 0 jungle, 1 asphalt, 2 town lawn. */
  groundKind(x: number, z: number): 0 | 1 | 2 {
    if (this.roadInfo(x, z).dist < ROAD_SHOULDER + 0.4) return 1;
    if (Math.hypot(x - this.cx0, z - this.cz0) < TOWN_FLAT + 2) return 2;
    return 0;
  }

  /** Keep-out for the jungle scatter: town shelf + a road-side margin. */
  exclusion(x: number, z: number): boolean {
    if (Math.hypot(x - this.cx0, z - this.cz0) < TOWN_FLAT + 6) return true;
    return this.roadInfo(x, z).dist < 16;
  }

  /** Extra soft world bound at this point (0 = the default rim bound holds). */
  bound(x: number, z: number): number {
    if (Math.hypot(x - this.cx0, z - this.cz0) < 130) return TOWN_BOUND;
    return this.roadInfo(x, z).dist < 26 ? TOWN_BOUND : 0;
  }
}
