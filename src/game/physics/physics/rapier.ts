/**
 * Rapier physics for Jungle Jeep — world, streamed colliders, vehicle rig.
 *
 * Designed for an open world: nothing here assumes the map is finite or that
 * everything exists at once.
 *   - Terrain collision is a set of heightfield CHUNKS, created around the car
 *     and dropped behind it (`TerrainStreamer`). Chunks are cut from the same
 *     height lattice as the rendered mesh, and Rapier's heightfield uses the
 *     same cell diagonal as three's PlaneGeometry, so wheels touch exactly the
 *     surface you see.
 *   - Props (trunks, boulders, logs) are registered as cheap definitions in a
 *     spatial hash and only become Rapier colliders while the car is near
 *     (`PropStreamer`) — a world with 100k trees costs the same as one with 100.
 *   - The car is a dynamic body with a raycast-vehicle controller (suspension,
 *     friction, steering). The engine feeds it arcade-level intents (drive
 *     acceleration, steering target, grip) and stays out of the physics.
 *
 * Conventions match the engine's rig space: the vehicle drives toward -Z,
 * local +X is right, +Y is up. Gravity and units are the engine's (u, s).
 */
import RAPIER from "@dimforge/rapier3d-compat";

export { RAPIER };

let ready: Promise<void> | null = null;
/** Load the WASM module once (the compat build embeds it — no asset config). */
export function initPhysics(): Promise<void> {
  return (ready ??= RAPIER.init());
}
