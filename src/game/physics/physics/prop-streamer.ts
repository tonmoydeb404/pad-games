import { RAPIER } from "./rapier";
import type { PhysicsWorld } from "./physics-world";

export type PropShape =
  | { kind: "cylinder"; halfHeight: number; radius: number }
  | { kind: "ball"; radius: number }
  /** Horizontal capsule along local X (cylinder part is 2·halfLen long). */
  | { kind: "log"; halfLen: number; radius: number }
  /** Axis-aligned-then-yawed box (city buildings). */
  | { kind: "box"; hx: number; hy: number; hz: number };

export interface PropDef {
  shape: PropShape;
  /** Centre of the shape. */
  x: number;
  y: number;
  z: number;
  /** Heading about Y (radians) — logs. */
  rotY?: number;
  /** Bounciness 0..1. */
  e: number;
}

export class PropStreamer {
  private readonly cell = 32;
  private readonly defs = new Map<number, PropDef[]>();
  private readonly live = new Map<PropDef, RAPIER.Collider>();
  private count = 0;

  constructor(private readonly pw: PhysicsWorld) {}

  get total(): number {
    return this.count;
  }
  get active(): number {
    return this.live.size;
  }

  private key(cx: number, cz: number): number {
    return (cx + 2048) * 8192 + (cz + 2048);
  }

  add(def: PropDef): void {
    const k = this.key(Math.floor(def.x / this.cell), Math.floor(def.z / this.cell));
    let arr = this.defs.get(k);
    if (!arr) this.defs.set(k, (arr = []));
    arr.push(def);
    this.count++;
  }

  private make(def: PropDef): RAPIER.Collider {
    const s = def.shape;
    let desc: RAPIER.ColliderDesc;
    if (s.kind === "cylinder") desc = RAPIER.ColliderDesc.cylinder(s.halfHeight, s.radius);
    else if (s.kind === "ball") desc = RAPIER.ColliderDesc.ball(s.radius);
    else if (s.kind === "box") {
      const h = (def.rotY ?? 0) / 2;
      desc = RAPIER.ColliderDesc.cuboid(s.hx, s.hy, s.hz).setRotation({
        x: 0,
        y: Math.sin(h),
        z: 0,
        w: Math.cos(h),
      });
    } else {
      // capsules stand along Y; lay it along X (Rz 90°) then yaw it (Ry)
      const h = (def.rotY ?? 0) / 2;
      const a = Math.SQRT1_2;
      const qy = { x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) };
      const qz = { x: 0, y: 0, z: a, w: a };
      desc = RAPIER.ColliderDesc.capsule(s.halfLen, s.radius).setRotation({
        x: qy.w * qz.x + qy.y * qz.z - qy.z * qz.y + qy.x * qz.w,
        y: qy.w * qz.y + qy.z * qz.x - qy.x * qz.z + qy.y * qz.w,
        z: qy.w * qz.z + qy.x * qz.y - qy.y * qz.x + qy.z * qz.w,
        w: qy.w * qz.w - qy.x * qz.x - qy.y * qz.y - qy.z * qz.z,
      });
    }
    desc.setTranslation(def.x, def.y, def.z).setRestitution(def.e).setFriction(0.35);
    return this.pw.world.createCollider(desc);
  }

  /** Activate props within `radius` of (x, z); retire those beyond radius+margin. */
  update(x: number, z: number, radius = 90): void {
    const c0x = Math.floor((x - radius) / this.cell);
    const c1x = Math.floor((x + radius) / this.cell);
    const c0z = Math.floor((z - radius) / this.cell);
    const c1z = Math.floor((z + radius) / this.cell);
    const r2 = radius * radius;
    for (let cx = c0x; cx <= c1x; cx++)
      for (let cz = c0z; cz <= c1z; cz++) {
        const arr = this.defs.get(this.key(cx, cz));
        if (!arr) continue;
        for (const d of arr) {
          if (this.live.has(d)) continue;
          const dx = d.x - x;
          const dz = d.z - z;
          if (dx * dx + dz * dz <= r2) this.live.set(d, this.make(d));
        }
      }
    const keep = (radius + 40) * (radius + 40);
    for (const [d, col] of this.live) {
      const dx = d.x - x;
      const dz = d.z - z;
      if (dx * dx + dz * dz > keep) {
        this.pw.world.removeCollider(col, false);
        this.live.delete(d);
      }
    }
  }
}
