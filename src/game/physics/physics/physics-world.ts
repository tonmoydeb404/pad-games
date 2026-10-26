import { RAPIER } from "./rapier";

export class PhysicsWorld {
  readonly world: RAPIER.World;
  readonly events = new RAPIER.EventQueue(true);

  constructor(gravity: number) {
    this.world = new RAPIER.World({ x: 0, y: -gravity, z: 0 });
  }

  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step(this.events);
  }

  /** Highest solid surface under (x, z), or null. Debug/tests/camera. */
  groundAt(x: number, z: number, fromY = 500): number | null {
    const hit = this.world.castRay(new RAPIER.Ray({ x, y: fromY, z }, { x: 0, y: -1, z: 0 }), fromY + 500, true);
    return hit ? fromY - hit.timeOfImpact : null;
  }

  dispose(): void {
    this.events.free();
    this.world.free();
  }
}
