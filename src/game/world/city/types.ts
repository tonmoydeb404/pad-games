export interface CityNear {
  y: number;
  /** 0..1 blend weight. */
  w: number;
}

export interface CityHooks {
  /** Base terrain (rim included) — the shelf and road bed are cut from it. */
  base(x: number, z: number): number;
  /** The trail sample the access road starts from (bed height + tangent). */
  junction: { x: number; z: number; y: number; tx: number; tz: number };
  /** Trail bed pull: `{y, w}` near the trail, null elsewhere. */
  trailNear(x: number, z: number): CityNear | null;
  /** Rail bed pull: `{y, w}` near the railway, null elsewhere. */
  railNear(x: number, z: number): CityNear | null;
}

export interface CityTile {
  model: string;
  u: number;
  v: number;
  /** Quarter-turn in city-local space (resolved from TILE_LINKS). */
  yaw: number;
}

export interface CityBuilding {
  model: string;
  /** World position (shelf is flat — one height for the whole town). */
  x: number;
  y: number;
  z: number;
  /** World yaw — house fronts (kit −Z) face the street. */
  yaw: number;
  /** Collision halves (world units); `rotY` orients the box. */
  hx: number;
  hz: number;
  rotY: number;
  /** Collision half-height (tops stay unsolid, like tree canopies). */
  colH: number;
}

export interface CityProp {
  model: string;
  /** Which kit the GLB loads from. */
  dir: "town" | "roads";
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Shadow casting (road paint never casts). */
  cast: boolean;
}

export interface RoadInfo {
  dist: number;
  /** Bed height at the nearest centreline point. */
  y: number;
}

export interface RoadPose {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
}

/** A spline-paved straight (yaw + grade roll). */
export interface RoadPiece {
  x: number;
  y: number;
  z: number;
  yaw: number;
  roll: number;
}
