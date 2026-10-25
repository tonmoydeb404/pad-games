import type { PlayerSnapshot, Snapshot } from "@pad/arena-shared";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Interpolate every player between the two snapshots bracketing `t` (server ms). */
export function interpolate(buffer: Snapshot[], t: number): PlayerSnapshot[] {
  if (!buffer.length) return [];
  if (t <= buffer[0].t) return buffer[0].players;
  const last = buffer[buffer.length - 1];
  if (t >= last.t) return last.players;
  let i = buffer.length - 1;
  while (i > 0 && buffer[i - 1].t > t) i--;
  const a = buffer[i - 1];
  const b = buffer[i];
  const k = (t - a.t) / (b.t - a.t || 1);
  const prev = new Map(a.players.map((p) => [p.id, p]));
  return b.players.map((pb) => {
    const pa = prev.get(pb.id);
    if (!pa) return pb;
    return {
      ...pb,
      x: lerp(pa.x, pb.x, k),
      y: lerp(pa.y, pb.y, k),
      z: lerp(pa.z, pb.z, k),
      yaw: lerpAngle(pa.yaw, pb.yaw, k),
      pitch: lerp(pa.pitch, pb.pitch, k),
    };
  });
}
