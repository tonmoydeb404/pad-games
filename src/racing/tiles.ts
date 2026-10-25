/**
 * Kenney "Racing Kit" (CC0 1.0) — tile catalog for the racing free-roam world.
 * Assets live in `/assets/racing` as Collada (.dae); they load at runtime
 * through ColladaLoader (cached per tile) and render as InstancedMeshes.
 *
 * The kit is tile-based: every piece spans a whole-number grid of 1-unit
 * cells. We build the world at CELL = 10 m per cell so the kit's 4 race cars
 * (1.35 u long natively) scale up to real-car size (~3.6 m) against 8.5 m
 * wide roads, and the whole physics world keeps the jeep engine's proven
 * metre scale.
 *
 * Native orientations were measured from the DAE geometry (see the repo's
 * planning notes):
 *   - straights run along Z, connecting the N and S edges;
 *   - corners natively connect the N edge (left cell for 2×2/3×3) to the E
 *     edge (bottom cell);
 *   - ramps rise from the N edge (y = 0) up to the S edge;
 *   - the bridge family climbs N(low) → S(deck at 0.52) with `Mid` pieces
 *     riding entirely at deck height (0.39–0.52 incl. rails).
 *
 * Placements rotate tiles in quarter turns (`rot` 0..3, clockwise seen from
 * above); `rotateDir`/`rotateAnchor` below are the single source of truth for
 * that transform, shared by the track builder and the tests.
 */
import * as THREE from "three";
import { ColladaLoader } from "three/examples/jsm/loaders/ColladaLoader.js";

/** World metres per kit cell (kit tiles are 1 unit). */
export const CELL = 10;

/** Quarter-turn rotation index, clockwise seen from above. */
export type Rot = 0 | 1 | 2 | 3;

/** Compass edge of a tile, native orientation. N = -Z, E = +X, S = +Z, W = -X. */
export type Dir = 0 | 1 | 2 | 3;
export const N: Dir = 0;
export const E: Dir = 1;
export const S: Dir = 2;
export const W: Dir = 3;

/** Unit vector of a heading, grid space (dx, dz). */
export function dirVec(d: Dir): { x: number; z: number } {
  return [
    { x: 0, z: -1 },
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: -1, z: 0 },
  ][d];
}

/** Opposite edge (the one a car driving `d` enters through). */
export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir;

/** Rotate a heading by `r` quarter turns clockwise. */
export const rotateDir = (d: Dir, r: Rot): Dir => ((d + r) % 4) as Dir;

/**
 * Rotate a cell anchor (relative to a tile's min-corner cell) by `r` quarter
 * turns clockwise about the tile's footprint centre. Anchors may sit half a
 * cell outside the footprint (edge-adjacent cells); the maths works in
 * cell-centre space and floors back to cell indices, which stays exact for
 * 90° steps.
 */
export function rotateAnchor(
  ax: number,
  az: number,
  w: number,
  d: number,
  r: Rot,
): { x: number; z: number } {
  const cx = w / 2;
  const cz = d / 2;
  // anchor cell centre, relative to the pivot
  let x = ax + 0.5 - cx;
  let z = az + 0.5 - cz;
  for (let i = 0; i < r; i++) {
    // clockwise seen from above (Y-up): (x, z) → (-z, x)
    const nx = -z;
    z = x;
    x = nx;
  }
  // back to cell indices (centre → floor)
  // the rotated rect swaps its extents on odd quarter turns
  const odd = r % 2 === 1;
  return { x: Math.floor(x + (odd ? cz : cx)), z: Math.floor(z + (odd ? cx : cz)) };
}

/** mesh rotation.y for a placement rotation (clockwise from above = negative). */
export const rotYOf = (r: Rot): number => -r * (Math.PI / 2);

/** Extra world-space footprint of a w×d tile under rotation (cells). */
export function rotatedSize(w: number, d: number, r: Rot): { w: number; d: number } {
  return r % 2 === 0 ? { w, d } : { w: d, d: w };
}

/* -------------------------------------------------------------------------
   Catalog
   ------------------------------------------------------------------------- */

/** Static collision for one placed prop (world metres, tile-local axes). */
export type PropCollider =
  | { kind: "box"; x: number; z: number; hw: number; hd: number; h: number }
  | { kind: "cylinder"; x: number; z: number; r: number; h: number };

/**
 * Collision for one placed road tile. Flat tiles ride the single ground
 * plane at y = 0; anything 3D gets a trimesh built from its loaded geometry
 * (there are only ever a few dozen of those in a map).
 */
export type TileCollider =
  | { kind: "flat" }
  | { kind: "trimesh" };

export interface TileDef {
  /** Catalog id (also the asset file stem, kebab-cased). */
  id: string;
  /** Footprint in cells (w along X, d along Z) at native rotation. */
  w: number;
  d: number;
  /** Connected road edges at native rotation. */
  sockets: Dir[];
  /**
   * Native-units shift applied before centring so a piece whose road strip
   * sits off the bbox centre (the start gantry) still lands on the grid.
   */
  shift?: [number, number];
  collider: TileCollider;
  /** Static prop colliders (barriers, posts, trunks…), tile-local, metres. */
  propColliders?: PropCollider[];
  /** Flat road pieces paint the minimap; decks draw as raised lines. */
  minimap?: "road" | "deck";
  /** Cast shadows (props and trees; roads are receive-only for perf). */
  shadow?: boolean;
  /** Tight along-road walls block the tile's sides (ramp walls, bridge rails). */
  walls?: boolean;
  /**
   * Asymmetric height pieces (bridge ramps): the edge whose road sits at
   * ground level. The builder rotates the tile so this edge faces traffic
   * that is still on the ground.
   */
  lowEdge?: Dir;
}

const flat = { kind: "flat" } as const;
const mesh = { kind: "trimesh" } as const;

/** Barrier-box helper: full-cell along X at native rot, world metres. */
const wallBox = (len: number, h = 1.4): PropCollider => ({
  kind: "box",
  x: 0,
  z: 0,
  hw: (len * CELL) / 2,
  hd: 0.7,
  h,
});

/**
 * The tiles the free-roam world uses. Everything here is grid-aligned (the
 * kit's staggered junction/split pieces are intentionally left out — the map
 * is loops and crossovers, so every road edge lines up cell-perfect).
 */
export const TILES: Record<string, TileDef> = {
  /* ---- road, straight family (native N↔S) ------------------------------ */
  "road-straight": { id: "road-straight", w: 1, d: 1, sockets: [N, S], collider: flat, minimap: "road" },
  "road-straight-long": { id: "road-straight-long", w: 1, d: 2, sockets: [N, S], collider: flat, minimap: "road" },
  "road-straight-long-mid": { id: "road-straight-long-mid", w: 1, d: 2, sockets: [N, S], collider: flat, minimap: "road" },
  "road-straight-arrow": { id: "road-straight-arrow", w: 1, d: 1, sockets: [N, S], collider: flat, minimap: "road" },
  "road-straight-skew": { id: "road-straight-skew", w: 1, d: 1, sockets: [N, S], collider: flat, minimap: "road" },
  "road-bump": { id: "road-bump", w: 1, d: 2, sockets: [N, S], collider: mesh, minimap: "road" },
  "road-end": { id: "road-end", w: 1, d: 1, sockets: [N], collider: flat, minimap: "road" },

  /* ---- corners (native N↔E) -------------------------------------------- */
  "road-corner-small": { id: "road-corner-small", w: 1, d: 1, sockets: [N, E], collider: flat, minimap: "road" },
  "road-corner-large": { id: "road-corner-large", w: 2, d: 2, sockets: [N, E], collider: flat, minimap: "road" },
  "road-corner-larger": { id: "road-corner-larger", w: 3, d: 3, sockets: [N, E], collider: flat, minimap: "road" },

  /* ---- ramps (native: low at N, high at S) ------------------------------ */
  "road-ramp": { id: "road-ramp", w: 1, d: 1, sockets: [N, S], collider: mesh, minimap: "road" },
  "road-ramp-long": { id: "road-ramp-long", w: 1, d: 2, sockets: [N, S], collider: mesh, minimap: "road" },
  "road-ramp-long-wall": { id: "road-ramp-long-wall", w: 1, d: 2, sockets: [N, S], collider: mesh, minimap: "road", walls: true },

  /* ---- bridge (deck 0.52u = 5.2 m; Start climbs N-low → S-high) ---------- */
  "road-bridge-start": { id: "road-straight-bridge-start", w: 1, d: 1, sockets: [N, S], collider: mesh, minimap: "deck", lowEdge: N },
  "road-bridge-mid": { id: "road-straight-bridge-mid", w: 1, d: 1, sockets: [N, S], collider: mesh, minimap: "deck", walls: true },

  /* ---- pit lane / start line (native N↔S, road centred) ----------------- */
  "road-pit-straight": { id: "road-pit-straight", w: 1, d: 1, sockets: [N, S], collider: flat, minimap: "road" },
  "road-pit-straight-long": { id: "road-pit-straight-long", w: 1, d: 2, sockets: [N, S], collider: flat, minimap: "road" },
  "road-pit-garage": {
    id: "road-pit-garage",
    w: 1,
    d: 1,
    sockets: [N, S],
    collider: flat,
    minimap: "road",
    // garage box occupies the E half of the tile (road on the W half)
    propColliders: [{ kind: "box", x: 5, z: 0, hw: 2.6, hd: 4.9, h: 7 }],
    shadow: true,
  },
  "road-start-positions": { id: "road-start-positions", w: 1, d: 2, sockets: [N, S], collider: flat, minimap: "road" },
  "road-start-gantry": {
    id: "road-start",
    w: 1,
    d: 2,
    sockets: [N, S],
    // the road strip sits at x ≈ 0.63 native; re-centre it on the grid line
    shift: [-0.13, 0],
    collider: flat,
    minimap: "road",
    shadow: true,
  },

  /* ---- props ------------------------------------------------------------ */
  grass: { id: "grass", w: 1, d: 1, sockets: [], collider: flat },
  "barrier-red": {
    id: "barrier-red",
    w: 1,
    d: 1,
    sockets: [],
    collider: flat,
    propColliders: [{ kind: "box", x: 0, z: 0, hw: 1.2, hd: 0.6, h: 1.3 }],
    shadow: true,
  },
  "barrier-white": {
    id: "barrier-white",
    w: 1,
    d: 1,
    sockets: [],
    collider: flat,
    propColliders: [{ kind: "box", x: 0, z: 0, hw: 1.2, hd: 0.6, h: 1.3 }],
    shadow: true,
  },
  "barrier-wall": {
    id: "barrier-wall",
    w: 1,
    d: 1,
    sockets: [],
    collider: flat,
    propColliders: [wallBox(1)],
    shadow: true,
  },
  "fence-straight": {
    id: "fence-straight",
    w: 1,
    d: 1,
    sockets: [],
    collider: flat,
    // fence rail is thin — cars bash through the posts, not the rail
    propColliders: [{ kind: "box", x: 0, z: 0, hw: 4.9, hd: 0.25, h: 5 }],
  },
  "fence-curved": {
    id: "fence-curved",
    w: 1,
    d: 1,
    sockets: [],
    collider: flat,
    shadow: true,
  },
  "tree-small": {
    id: "tree-small",
    w: 1,
    d: 1,
    sockets: [],
    collider: flat,
    propColliders: [{ kind: "cylinder", x: 0, z: 0, r: 0.7, h: 11 }],
    shadow: true,
  },
  "tree-large": {
    id: "tree-large",
    w: 1,
    d: 1,
    sockets: [],
    collider: flat,
    propColliders: [{ kind: "cylinder", x: 0, z: 0, r: 1.0, h: 15 }],
    shadow: true,
  },
  "billboard-low": {
    id: "billboard-low",
    w: 1,
    d: 1,
    sockets: [],
    collider: flat,
    propColliders: [{ kind: "box", x: 0, z: 0, hw: 4.6, hd: 0.8, h: 7 }],
    shadow: true,
  },
  "banner-tower-green": {
    id: "banner-tower-green",
    w: 1,
    d: 1,
    sockets: [],
    collider: flat,
    propColliders: [{ kind: "cylinder", x: 0, z: 0, r: 0.9, h: 12.5 }],
    shadow: true,
  },
  "banner-tower-red": {
    id: "banner-tower-red",
    w: 1,
    d: 1,
    sockets: [],
    collider: flat,
    propColliders: [{ kind: "cylinder", x: 0, z: 0, r: 0.9, h: 12.5 }],
    shadow: true,
  },
  "light-post-modern": {
    id: "light-post-modern",
    w: 1,
    d: 1,
    sockets: [],
    collider: flat,
    propColliders: [{ kind: "cylinder", x: 0, z: 0, r: 0.5, h: 8 }],
  },
  "light-post-large": {
    id: "light-post-large",
    w: 1,
    d: 1,
    sockets: [],
    collider: flat,
    propColliders: [{ kind: "cylinder", x: 0, z: 0, r: 0.5, h: 8 }],
  },
  overhead: {
    id: "overhead",
    w: 1,
    d: 1,
    sockets: [],
    // gantry straddles the road — drive under it; no colliders on the span
    collider: flat,
    shift: [-0.13, 0],
  },
  "overhead-round": {
    id: "overhead-round",
    w: 2,
    d: 1,
    sockets: [],
    collider: flat,
  },
  "grand-stand": {
    id: "grand-stand",
    w: 1,
    d: 1,
    sockets: [],
    collider: flat,
    propColliders: [{ kind: "box", x: 0, z: 0, hw: 4.9, hd: 4.9, h: 9 }],
    shadow: true,
  },
  "grand-stand-round": {
    id: "grand-stand-round",
    w: 2,
    d: 2,
    sockets: [],
    collider: flat,
    propColliders: [{ kind: "cylinder", x: 0, z: 0, r: 8, h: 9 }],
    shadow: true,
  },
  tent: {
    id: "tent",
    w: 1,
    d: 1,
    sockets: [],
    collider: flat,
    propColliders: [{ kind: "box", x: 0, z: 0, hw: 4.4, hd: 4.4, h: 7 }],
    shadow: true,
  },
  "tent-long": {
    id: "tent-long",
    w: 2,
    d: 1,
    sockets: [],
    collider: flat,
    propColliders: [{ kind: "box", x: 0, z: 0, hw: 9.4, hd: 4.4, h: 7 }],
    shadow: true,
  },
  "pits-garage": {
    id: "pits-garage",
    w: 1,
    d: 1,
    sockets: [],
    collider: flat,
    propColliders: [{ kind: "box", x: 0, z: 0, hw: 4.9, hd: 4.9, h: 7 }],
    shadow: true,
  },
  "pits-office": {
    id: "pits-office",
    w: 1,
    d: 1,
    sockets: [],
    collider: flat,
    propColliders: [{ kind: "box", x: 0, z: 0, hw: 4.9, hd: 4.9, h: 5 }],
    shadow: true,
  },
  pylon: {
    id: "pylon",
    w: 1,
    d: 1,
    sockets: [],
    collider: flat,
    // light marker cone — drive-through (knocking cones around is fun)
  },
  ramp: {
    id: "ramp",
    w: 1,
    d: 1,
    sockets: [],
    collider: mesh,
    shadow: true,
  },
  "flag-checkers": {
    id: "flag-checkers",
    w: 1,
    d: 1,
    sockets: [],
    collider: flat,
    propColliders: [{ kind: "cylinder", x: 0, z: 0, r: 0.4, h: 12 }],
  },
  "radar-equipment": {
    id: "radar-equipment",
    w: 1,
    d: 1,
    sockets: [],
    collider: flat,
    propColliders: [{ kind: "box", x: 0, z: 0, hw: 2.8, hd: 2, h: 5.4 }],
    shadow: true,
  },
};

/** Tile ids whose meshes cast shadows (derived, single source of truth). */
export const castsShadow = (def: TileDef): boolean => def.shadow === true;

/* -------------------------------------------------------------------------
   Loading
   ------------------------------------------------------------------------- */

export interface LoadedTile {
  def: TileDef;
  /** Normalised: bbox centre on XZ origin, ground at y = 0, scaled to metres. */
  group: THREE.Object3D;
  /** Distinct materials across the tile's meshes (for instancing). */
  parts: { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] }[];
}

const loader = new ColladaLoader();
const cache = new Map<string, Promise<LoadedTile | null>>();

/**
 * Load + normalise one tile. The mesh group is scaled by CELL into world
 * metres, re-centred so the footprint centre sits on the placement origin
 * and the ground plane is y = 0. All failures resolve to null — the world
 * builder simply skips missing tiles, never crashes.
 */
export function loadTile(id: string): Promise<LoadedTile | null> {
  const def = TILES[id];
  if (!def) return Promise.resolve(null);
  const hit = cache.get(id);
  if (hit) return hit;
  {
    const p: Promise<LoadedTile | null> = (async () => {
      try {
        const collada = await loader.loadAsync(`/assets/racing/${def.id}.dae`);
        if (!collada) return null;
        const group = collada.scene;
        group.updateMatrixWorld(true);

        // Bake each mesh's world transform, collect parts, drop empties.
        const parts: LoadedTile["parts"] = [];
        group.traverse((obj) => {
          const m = obj as THREE.Mesh;
          if (!m.isMesh || !m.geometry) return;
          const geom = m.geometry.clone().applyMatrix4(m.matrixWorld);
          // multi-primitive meshes carry one material per geometry group —
          // keep every one (road asphalt, edge paint, accents)
          const toLambert = (src: THREE.Material): THREE.MeshLambertMaterial => {
            const phong = src as THREE.MeshPhongMaterial;
            return new THREE.MeshLambertMaterial({
              color: phong.color?.clone() ?? new THREE.Color(0xcccccc),
              map: phong.map ?? null,
              transparent: phong.transparent,
              opacity: phong.opacity,
              alphaTest: phong.map ? 0.4 : 0,
              side: phong.map ? THREE.DoubleSide : THREE.FrontSide,
              vertexColors: !!geom.getAttribute("color"),
            });
          };
          const lambert = Array.isArray(m.material) ? m.material.map(toLambert) : toLambert(m.material);
          parts.push({ geometry: geom, material: lambert });
        });
        if (parts.length === 0) return null;

        // Clear children; the group becomes a pure placement root.
        group.clear();

        // Normalise: shift (road-centring), then centre XZ on the bbox and
        // ground minY — all in native units, then scale to metres.
        const box = new THREE.Box3();
        for (const { geometry } of parts) {
          geometry.computeBoundingBox();
          box.union(geometry.boundingBox!);
        }
        const [sx, sz] = def.shift ?? [0, 0];
        const cx = (box.min.x + box.max.x) / 2 - sx;
        const cz = (box.min.z + box.max.z) / 2 - sz;
        const gy = Math.min(box.min.y, 0);
        for (const { geometry } of parts) {
          geometry.translate(-cx, -gy, -cz);
        }
        group.scale.setScalar(CELL);
        return { def, group, parts };
      } catch (err) {
        console.warn(`[racing] tile ${id} failed to load`, err);
        return null;
      }
    })();
    cache.set(id, p);
    return p;
  }
}

/** World position of a tile footprint's centre from its min-corner cell. */
export function tileCenter(gx: number, gz: number, w: number, d: number): { x: number; z: number } {
  return { x: (gx + w / 2) * CELL, z: (gz + d / 2) * CELL };
}

/** True when world point (x, z) is inside a tile's footprint rect. */
export function inFootprint(gx: number, gz: number, w: number, d: number, x: number, z: number): boolean {
  return x >= gx * CELL && x < (gx + w) * CELL && z >= gz * CELL && z < (gz + d) * CELL;
}
