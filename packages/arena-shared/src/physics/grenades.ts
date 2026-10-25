/**
 * Grenades — Rapier dynamic spheres with a timed fuse. The sim owns flight
 * and bounce; the caller (ArenaGame) resolves the blast: damage with
 * line-of-sight, prop impulses, events.
 */
import { GRENADE_FUSE, GRENADE_SPEED, SIM_DT } from "../constants";
import { GROUPS, type ArenaPhysics } from "./world";
import { RAPIER } from "./world";

export interface Grenade {
  id: number;
  body: RAPIER.RigidBody;
  fuse: number;
}

export interface GrenadeBlast {
  /** grenade id, or -1 for synthetic blasts (barrel detonations) */
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

const RADIUS = 0.14;

export class GrenadeSim {
  private readonly live: Grenade[] = [];
  private nextId = 1;

  constructor(
    private readonly phys: ArenaPhysics,
    /** called when a fuse runs out (position/velocity read before the body is freed) */
    private readonly onExplode: (blast: GrenadeBlast) => void,
  ) {}

  get all(): readonly Grenade[] {
    return this.live;
  }

  throwGrenade(
    from: { x: number; y: number; z: number },
    dir: { x: number; y: number; z: number },
    extraVel: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
  ): number {
    const id = this.nextId++;
    const body = this.phys.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(from.x + dir.x * 0.5, from.y + dir.y * 0.5, from.z + dir.z * 0.5)
        .setLinvel(dir.x * GRENADE_SPEED + extraVel.x, dir.y * GRENADE_SPEED + extraVel.y, dir.z * GRENADE_SPEED + extraVel.z)
        .setAngularDamping(0.2)
        .setCcdEnabled(true)
        .setCanSleep(false),
    );
    this.phys.world.createCollider(
      RAPIER.ColliderDesc.ball(RADIUS).setMass(1.2).setFriction(0.55).setRestitution(0.38).setCollisionGroups(GROUPS.projectile),
      body,
    );
    this.live.push({ id, body, fuse: GRENADE_FUSE });
    return id;
  }

  /** Advance fuses; detonations are reported through the constructor callback. */
  step(): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const g = this.live[i];
      g.fuse -= SIM_DT;
      if (g.fuse <= 0) {
        const t = g.body.translation();
        const v = g.body.linvel();
        this.remove(i);
        this.onExplode({ id: g.id, x: t.x, y: t.y, z: t.z, vx: v.x, vy: v.y, vz: v.z });
      }
    }
  }

  private remove(i: number): void {
    const g = this.live[i];
    this.phys.world.removeRigidBody(g.body);
    this.live.splice(i, 1);
  }

  snapshot(): { id: number; x: number; y: number; z: number }[] {
    return this.live.map((g) => {
      const t = g.body.translation();
      return { id: g.id, x: round2(t.x), y: round2(t.y), z: round2(t.z) };
    });
  }
}

const round2 = (v: number): number => Math.round(v * 100) / 100;
