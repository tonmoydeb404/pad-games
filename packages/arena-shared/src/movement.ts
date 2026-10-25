import { GRAVITY, JUMP_SPEED, MOVE_SPEED, PLAYER_HEIGHT, PLAYER_RADIUS, STEP_HEIGHT } from "./constants";
import { MAP_BOXES } from "./map";
import type { InputCommand, MoveState } from "./types";

const EPS = 1e-4;

type MoveInput = Pick<InputCommand, "mx" | "mz" | "yaw" | "jump">;

interface Solid {
  min: [number, number, number];
  max: [number, number, number];
}

function overlaps(s: MoveState, b: Solid): boolean {
  return (
    s.x + PLAYER_RADIUS > b.min[0] + EPS &&
    s.x - PLAYER_RADIUS < b.max[0] - EPS &&
    s.y + PLAYER_HEIGHT > b.min[1] + EPS &&
    s.y < b.max[1] - EPS &&
    s.z + PLAYER_RADIUS > b.min[2] + EPS &&
    s.z - PLAYER_RADIUS < b.max[2] - EPS
  );
}

function overlapsAny(s: MoveState, solids: Solid[]): boolean {
  for (const b of solids) if (overlaps(s, b)) return true;
  return false;
}

/**
 * Move along one axis, resolving collisions. When the only thing blocking us
 * is a ledge no taller than STEP_HEIGHT and standing on it is clear, climb it
 * instead (stairs, kerbs, rocks) — the FPS-standard auto-step.
 */
function moveAxis(s: MoveState, axis: "x" | "z", delta: number, solids: Solid[]): void {
  s[axis] += delta;
  const dir = Math.sign(delta);
  for (const b of solids) {
    if (!overlaps(s, b)) continue;
    const rise = b.max[1] - s.y;
    if (rise > 0 && rise <= STEP_HEIGHT && (dir === 0 || s.vy <= 0.001)) {
      const lifted: MoveState = { ...s, y: b.max[1] };
      if (!overlapsAny(lifted, solids)) {
        s.y = lifted.y;
        s.onGround = true;
        continue;
      }
    }
    const idx = axis === "x" ? 0 : 2;
    s[axis] = dir > 0 ? b.min[idx] - PLAYER_RADIUS : b.max[idx] + PLAYER_RADIUS;
  }
}

/** Advance one fixed step. Mutates `s`. Identical on client (prediction) and server (authority). */
export function stepMove(s: MoveState, input: MoveInput, dt: number, solids: Solid[] = MAP_BOXES): void {
  let mx = Math.max(-1, Math.min(1, input.mx));
  let mz = Math.max(-1, Math.min(1, input.mz));
  const len = Math.hypot(mx, mz);
  if (len > 1) {
    mx /= len;
    mz /= len;
  }
  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);
  // forward = (-sin, -cos), right = (cos, -sin)
  const vx = (cos * mx - sin * mz) * MOVE_SPEED;
  const vz = (-sin * mx - cos * mz) * MOVE_SPEED;

  moveAxis(s, "x", vx * dt, solids);
  moveAxis(s, "z", vz * dt, solids);

  if (input.jump && s.onGround) s.vy = JUMP_SPEED;
  s.vy -= GRAVITY * dt;
  s.y += s.vy * dt;
  s.onGround = false;
  for (const b of solids) {
    if (!overlaps(s, b)) continue;
    if (s.vy <= 0) {
      s.y = b.max[1];
      s.onGround = true;
    } else {
      s.y = b.min[1] - PLAYER_HEIGHT;
    }
    s.vy = 0;
  }
}
