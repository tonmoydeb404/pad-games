/**
 * Port Marin — the suburban town beside the jungle.
 *
 * Kenney "City Kit (Suburban)" 2.0 + "City Kit (Roads)" (both CC0, see
 * public/assets/jeep/CREDITS.md), served from /assets/jeep/city/{town,roads}.
 * Two halves:
 *   - `CitySite`   — pure math (shelf, access road, street plan, carve and
 *     surface queries), built before any asset loads.
 *   - `CitySystem` — the three.js half: loads the kit GLBs and lays tiles,
 *     lots and props as InstancedMeshes plus building colliders.
 */
export { CitySite } from "./city-site";
export { CitySystem, type CityHost } from "./city-system";
export {
  JUNCTION_T,
  RING,
  TILE,
  TOWN_BLEND,
  TOWN_BOUND,
  TOWN_CX,
  TOWN_CZ,
  TOWN_FLAT,
} from "./constants";
export type {
  CityBuilding,
  CityHooks,
  CityNear,
  CityProp,
  CityTile,
  RoadInfo,
} from "./types";
