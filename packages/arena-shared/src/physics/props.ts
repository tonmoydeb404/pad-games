/**
 * Dynamic props — crates, barrels, furniture — as Rapier rigid bodies, plus
 * the two breakable kinds (explosive barrels, target boards).
 *
 * The server simulates them; snapshots carry awake (or recently settled)
 * bodies and clients interpolate. Players push props by overlap: the game
 * asks `pushOut` for the separation to apply to a player capsule and gives
 * the prop a matching impulse (mass-proportional, so a crate budges and a
 * chest barely).
 */
import { BARREL_HEALTH, PROP_RESPAWN_SECONDS, TARGET_HEALTH } from "../constants";
import { MAP_PROPS, type PropDef } from "../map";
import type { PropSnapshot } from "../types";
import { GROUPS, type ArenaPhysics } from "./world";
import { RAPIER } from "./world";

export interface PropShape {
  /** collider half extents */
  hx: number;
  hy: number;
  hz: number;
  mass: number;
  friction: number;
  restitution: number;
}

/** Physics shape per prop kind (models are scaled by `PropDef.scale`/2 vs kit units). */
export const PROP_SHAPES: Record<string, PropShape> = {
  crate: { hx: 0.5, hy: 0.37, hz: 0.75, mass: 30, friction: 0.6, restitution: 0.1 },
  barrel: { hx: 0.44, hy: 0.41, hz: 0.44, mass: 40, friction: 0.5, restitution: 0.2 },
  pot: { hx: 0.42, hy: 0.3, hz: 0.3, mass: 10, friction: 0.5, restitution: 0.1 },
  chair: { hx: 0.3, hy: 0.42, hz: 0.32, mass: 8, friction: 0.5, restitution: 0.1 },
  table: { hx: 0.78, hy: 0.28, hz: 0.55, mass: 22, friction: 0.55, restitution: 0.1 },
  chest: { hx: 0.4, hy: 0.35, hz: 0.4, mass: 35, friction: 0.6, restitution: 0.05 },
  target: { hx: 0.06, hy: 0.34, hz: 0.34, mass: 0, friction: 0.8, restitution: 0 },
};

/** Keep sending a settled prop for this long after it last moved (ms). */
const DIRTY_LINGER_MS = 600;
/** Snap epsilon: a body within this of its last sent state counts as settled. */
const SETTLED_EPS = 0.005;

interface PropBody {
  def: PropDef;
  body: RAPIER.RigidBody | null;
  hp: number;
  gone: boolean;
  respawnT: number;
  /** last value sent in a snapshot */
  sent: { x: number; y: number; z: number; ry: number } | null;
  lastMoveT: number;
}

export class PropSim {
  private readonly props: PropBody[] = [];
  private time = 0;

  constructor(private readonly phys: ArenaPhysics) {
    for (const def of MAP_PROPS) {
      this.props.push({ def, body: this.make(def), hp: def.explosive ? BARREL_HEALTH : def.target ? TARGET_HEALTH : Infinity, gone: false, respawnT: 0, sent: null, lastMoveT: -Infinity });
    }
  }

  private make(def: PropDef): RAPIER.RigidBody | null {
    const shape = PROP_SHAPES[def.kind];
    if (!shape) return null;
    const world = this.phys.world;
    if (def.target) {
      // targets are static boards until something breaks them
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed()
          .setTranslation(def.x, def.y + shape.hy, def.z)
          .setRotation(yawQuat(def.ry)),
      );
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(shape.hx, shape.hy, shape.hz).setCollisionGroups(GROUPS.static),
        body,
      );
      return body;
    }
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(def.x, def.y + shape.hy, def.z)
        .setRotation(yawQuat(def.ry))
        .setLinearDamping(0.4)
        .setAngularDamping(0.6)
        .setCanSleep(true),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(shape.hx, shape.hy, shape.hz)
        .setMass(shape.mass)
        .setFriction(shape.friction)
        .setRestitution(shape.restitution)
        .setCollisionGroups(GROUPS.prop),
      body,
    );
    return body;
  }

  get count(): number {
    return this.props.length;
  }

  isGone(i: number): boolean {
    return this.props[i]?.gone ?? false;
  }

  isExplosive(i: number): boolean {
    return this.props[i]?.def.explosive ?? false;
  }

  /** Restore every prop to its authored state (fresh round). */
  resetAll(): void {
    for (const p of this.props) {
      if (p.body) {
        this.phys.world.removeRigidBody(p.body);
        p.body = null;
      }
      p.gone = false;
      p.hp = p.def.explosive ? BARREL_HEALTH : p.def.target ? TARGET_HEALTH : Infinity;
      p.body = this.make(p.def);
      p.sent = null;
      p.lastMoveT = -Infinity;
    }
  }

  bodyAt(i: number): RAPIER.RigidBody | null {
    return this.props[i]?.body ?? null;
  }

  step(dtMs: number): void {
    this.time += dtMs;
    for (const p of this.props) {
      if (!p.gone) continue;
      p.respawnT -= dtMs / 1000;
      if (p.respawnT <= 0) this.restore(p);
    }
  }

  /** Damage a prop (bullet). Returns "break" | "explode" | null. */
  damage(i: number, amount: number): "break" | "explode" | null {
    const p = this.props[i];
    if (!p || p.gone) return null;
    p.hp -= amount;
    if (p.hp > 0) return null;
    this.remove(p);
    return p.def.explosive ? "explode" : "break";
  }

  /** Destroy without damage (grenade blast on a barrel). */
  explode(i: number): boolean {
    const p = this.props[i];
    if (!p || p.gone || !p.def.explosive) return false;
    this.remove(p);
    return true;
  }

  private remove(p: PropBody): void {
    if (p.body) {
      this.phys.world.removeRigidBody(p.body);
      p.body = null;
    }
    p.gone = true;
    p.respawnT = PROP_RESPAWN_SECONDS;
    p.sent = null;
  }

  private restore(p: PropBody): void {
    p.gone = false;
    p.hp = p.def.explosive ? BARREL_HEALTH : p.def.target ? TARGET_HEALTH : Infinity;
    p.body = this.make(p.def);
  }

  /** Bullet hit: impulse at the hit point along the ray. */
  hitImpulse(i: number, dir: { x: number; y: number; z: number }, strength = 6): void {
    const p = this.props[i];
    if (!p?.body || p.gone) return;
    const shape = PROP_SHAPES[p.def.kind];
    p.body.applyImpulse({ x: dir.x * strength * shape.mass, y: dir.y * strength * shape.mass * 0.4 + shape.mass * 0.4, z: dir.z * strength * shape.mass }, true);
  }

  /** Radial impulse from an explosion at (x,y,z). */
  blast(x: number, y: number, z: number, radius: number, dv: number): void {
    for (const p of this.props) {
      const b = p.body;
      if (!b || p.gone || p.def.target) continue;
      const t = b.translation();
      const dx = t.x - x;
      const dy = t.y - y;
      const dz = t.z - z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > radius) continue;
      const falloff = 1 - dist / radius;
      const inv = dist > 1e-4 ? 1 / dist : 0;
      const shape = PROP_SHAPES[p.def.kind];
      const j = shape.mass * dv * falloff;
      b.applyImpulse({ x: dx * inv * j, y: Math.abs(dy * inv * j) * 0.5 + j * 0.45, z: dz * inv * j }, true);
      b.applyTorqueImpulse({ x: (Math.random() - 0.5) * j * 0.02, y: (Math.random() - 0.5) * j * 0.02, z: (Math.random() - 0.5) * j * 0.02 }, true);
    }
  }

  /**
   * Push a player capsule (feet at x,y,z) out of any prop it overlaps.
   * Returns the separation applied, and shoves the prop the other way.
   */
  pushOut(x: number, y: number, z: number): { dx: number; dz: number } {
    let dx = 0;
    let dz = 0;
    for (const p of this.props) {
      const b = p.body;
      if (!b || p.gone || p.def.target) continue;
      const shape = PROP_SHAPES[p.def.kind];
      const t = b.translation();
      const rot = yawOnly(b.rotation());
      // player capsule vs yaw-rotated box, flat 2D approximation
      const px = x - t.x;
      const pz = z - t.z;
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      const lx = px * c + pz * s;
      const lz = -px * s + pz * c;
      const overlapX = shape.hx + 0.4 - Math.abs(lx);
      const overlapZ = shape.hz + 0.4 - Math.abs(lz);
      const feet = y;
      const head = y + 1.8;
      if (overlapX <= 0 || overlapZ <= 0 || head < t.y - shape.hy || feet > t.y + shape.hy) continue;
      // separate along the smaller penetration (local space), then to world
      let ox = 0;
      let oz = 0;
      if (overlapX < overlapZ) ox = lx >= 0 ? overlapX : -overlapX;
      else oz = lz >= 0 ? overlapZ : -overlapZ;
      const wx = ox * c - oz * s;
      const wz = ox * s + oz * c;
      dx += wx;
      dz += wz;
      // nudge the prop away from the player
      b.applyImpulse({ x: -wx * 8, y: 0, z: -wz * 8 }, true);
    }
    return { dx, dz };
  }

  /** Snapshot: awake bodies + settled-but-unsent ones. Compact and idempotent. */
  snapshot(): PropSnapshot[] {
    const out: PropSnapshot[] = [];
    for (let i = 0; i < this.props.length; i++) {
      const p = this.props[i];
      const b = p.body;
      if (!b || p.gone || p.def.target) continue;
      if (b.isSleeping() && p.sent && this.time - p.lastMoveT > DIRTY_LINGER_MS) continue;
      const t = b.translation();
      const ry = yawOnly(b.rotation());
      const x = round2(t.x);
      const y = round2(t.y);
      const z = round2(t.z);
      const r = round2(ry);
      const snt = p.sent;
      if (snt && Math.abs(snt.x - x) < SETTLED_EPS && Math.abs(snt.y - y) < SETTLED_EPS && Math.abs(snt.z - z) < SETTLED_EPS && Math.abs(snt.ry - r) < 0.01) continue;
      if (!b.isSleeping()) p.lastMoveT = this.time;
      p.sent = { x, y, z, ry: r };
      out.push({ i, x, y, z, ry: r });
    }
    return out;
  }

  goneIndices(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.props.length; i++) if (this.props[i].gone) out.push(i);
    return out;
  }

  /** Where a (gone) prop would reappear — for tests. */
  defAt(i: number): PropDef {
    return this.props[i].def;
  }

  /** Prop position for FX (explosion placement). */
  posAt(i: number): { x: number; y: number; z: number } {
    const p = this.props[i];
    const b = p.body;
    if (b) {
      const t = b.translation();
      return { x: t.x, y: t.y, z: t.z };
    }
    return { x: p.def.x, y: p.def.y, z: p.def.z };
  }
}

function yawQuat(ry: number): { x: number; y: number; z: number; w: number } {
  return { x: 0, y: Math.sin(ry / 2), z: 0, w: Math.cos(ry / 2) };
}

function yawOnly(rot: { x: number; y: number; z: number; w: number }): number {
  const s = 2 * (rot.w * rot.y + rot.x * rot.z);
  const c = 1 - 2 * (rot.y * rot.y + rot.x * rot.x);
  return Math.atan2(s, c);
}

const round2 = (v: number): number => Math.round(v * 100) / 100;
