import type { Actor, AnimalCtx } from "./actor";
import { hurt } from "./combat";

/**
 * Distance along a ray to the nearest living animal's body, or null. Each
 * body is an ellipsoid fitted to the model (length from the measured
 * back, height from the def), turned to the animal's heading.
 */
function rayActor(
  a: Actor, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
): number | null {
  const def = a.def;
  const half = {
    f: Math.max(a.saddle.len * 0.5, a.radius),
    u: Math.max(def.height * 0.5, 0.15),
    s: Math.max(a.saddle.halfW * 1.15, def.height * 0.16, 0.15),
  };
  // into the animal's frame: side (x), up (y), heading (z)
  const hx = -Math.sin(a.yaw);
  const hz = -Math.cos(a.yaw);
  const sx = Math.cos(a.yaw);
  const sz = -Math.sin(a.yaw);
  const cx = a.pos.x;
  const cy = a.pos.y + def.height * 0.5;
  const cz = a.pos.z;
  const px = ox - cx;
  const py = oy - cy;
  const pz = oz - cz;
  const o = [(px * sx + pz * sz) / half.s, py / half.u, (px * hx + pz * hz) / half.f];
  const d = [(dx * sx + dz * sz) / half.s, dy / half.u, (dx * hx + dz * hz) / half.f];
  const A = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const B = 2 * (o[0] * d[0] + o[1] * d[1] + o[2] * d[2]);
  const C = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - 1;
  const disc = B * B - 4 * A * C;
  if (disc < 0 || A < 1e-9) return null;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  if (t >= 0) return t;
  const t2 = (-B + Math.sqrt(disc)) / (2 * A);
  return t2 >= 0 ? 0 : null; // origin inside the body: point blank
}

/** Nearest living, un-ridden animal on a ray within `maxT`. */
function nearestOnRay(
  ctx: AnimalCtx, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number,
): { a: Actor; t: number } | null {
  let best: Actor | null = null;
  let bestT = maxT;
  for (const a of ctx.actors) {
    if (a.ridden || a.state === "dead" || a.state === "ragdoll") continue;
    // cheap reject: the ray must pass within the body's bounding sphere
    const rx = a.pos.x - ox;
    const ry = a.pos.y + a.def.height * 0.5 - oy;
    const rz = a.pos.z - oz;
    const along = rx * dx + ry * dy + rz * dz;
    const reach = Math.max(a.saddle.len * 0.5, a.def.height) + 1;
    if (along < -reach || along > maxT + reach) continue;
    const perp2 = rx * rx + ry * ry + rz * rz - along * along;
    if (perp2 > reach * reach) continue;
    const t = rayActor(a, ox, oy, oz, dx, dy, dz);
    if (t !== null && t < bestT) {
      bestT = t;
      best = a;
    }
  }
  return best ? { a: best, t: bestT } : null;
}

/** Distance to the animal under a ray without hurting it (aim assist, crosshair colour). */
export function probe(
  ctx: AnimalCtx, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number,
): number | null {
  return nearestOnRay(ctx, ox, oy, oz, dx, dy, dz, maxT)?.t ?? null;
}

/**
 * Fire one pellet along a ray (unit `dir`) up to `maxT` metres. The nearest
 * animal on the line takes `dmg` (+ knock-back along the shot); returns where
 * it hit, or null on a miss. `dmg` may be a function of the hit distance (range
 * falloff). Animals being ridden are not targets.
 */
export function shoot(
  ctx: AnimalCtx,
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  maxT: number, dmg: number | ((t: number) => number), knock: number,
): { t: number; dmg: number; killed: boolean; heavy: boolean; name: string } | null {
  const hit = nearestOnRay(ctx, ox, oy, oz, dx, dy, dz, maxT);
  if (!hit) return null;
  const inv = 1 / Math.max(Math.hypot(dx, dz), 1e-5);
  const dealt = typeof dmg === "function" ? dmg(hit.t) : dmg;
  const killed = hurt(ctx, hit.a, dealt, dx * inv, dz * inv, knock);
  return { t: hit.t, dmg: dealt, killed, heavy: hit.a.def.tier === "heavy", name: hit.a.def.name };
}
