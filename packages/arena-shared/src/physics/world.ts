/**
 * Rapier physics for Dungeon Blaster — the server owns the authoritative
 * world: static map colliders, dynamic props and grenade projectiles.
 * Clients never simulate these; they interpolate server snapshots and run
 * cheap cosmetic debris in plain three.js (no WASM on the client).
 *
 * Same Rapier version everywhere; only the local player is predicted (with
 * the deterministic kinematic mover in movement.ts), so float drift at worst
 * becomes a tiny reconciliation correction.
 */
import RAPIER from "@dimforge/rapier3d-compat";
import { GRAVITY } from "../constants";
import { MAP_BOXES } from "../map";

export { RAPIER };

let ready: Promise<void> | null = null;
/** Load the WASM module once (the compat build embeds it — no asset config). */
export function initPhysics(): Promise<void> {
  return (ready ??= RAPIER.init());
}

/** Collision groups (Rapier layout: high 16 bits membership, low 16 filter). */
export const GROUP_WORLD = 1 << 0;
export const GROUP_PROP = 1 << 1;
export const GROUP_PROJECTILE = 1 << 2;

const g = (membership: number, filter: number): number => (membership << 16) | filter;

export const GROUPS = {
  static: g(GROUP_WORLD, GROUP_PROP | GROUP_PROJECTILE),
  prop: g(GROUP_PROP, GROUP_WORLD | GROUP_PROP | GROUP_PROJECTILE),
  projectile: g(GROUP_PROJECTILE, GROUP_WORLD | GROUP_PROP),
  /** occlusion rays: world + props block shots (ray membership must overlap collider filters) */
  ray: g(0xffff, GROUP_WORLD | GROUP_PROP),
} as const;

/** One shared Rapier world with the map's static colliders. */
export class ArenaPhysics {
  readonly world: RAPIER.World;

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
    for (const b of MAP_BOXES) {
      const hx = (b.max[0] - b.min[0]) / 2;
      const hy = (b.max[1] - b.min[1]) / 2;
      const hz = (b.max[2] - b.min[2]) / 2;
      if (hx <= 0 || hy <= 0 || hz <= 0) continue;
      const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(b.min[0] + hx, b.min[1] + hy, b.min[2] + hz)
        .setFriction(0.85)
        .setCollisionGroups(GROUPS.static);
      this.world.createCollider(desc);
    }
    // Rapier's broad-phase is only queryable after the first step — run one
    // so castRay works immediately (nothing dynamic exists yet).
    this.world.timestep = 1 / 60;
    this.world.step();
  }

  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step();
  }

  /**
   * Nearest hit of a ray against static geometry + props (occlusion for
   * hitscan and explosion line-of-sight). Returns the distance, or `maxDist`.
   */
  castRay(o: { x: number; y: number; z: number }, d: { x: number; y: number; z: number }, maxDist: number): number {
    const hit = this.world.castRay(
      new RAPIER.Ray(o, d),
      maxDist,
      true,
      undefined,
      GROUPS.ray,
    );
    return hit ? hit.timeOfImpact : maxDist;
  }

  dispose(): void {
    this.world.free();
  }
}
