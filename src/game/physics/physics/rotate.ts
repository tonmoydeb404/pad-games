export function rotate(
  q: { x: number; y: number; z: number; w: number },
  x: number,
  y: number,
  z: number,
  out: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  // v' = v + 2·w·(q×v) + 2·q×(q×v)
  const tx = 2 * (q.y * z - q.z * y);
  const ty = 2 * (q.z * x - q.x * z);
  const tz = 2 * (q.x * y - q.y * x);
  out.x = x + q.w * tx + (q.y * tz - q.z * ty);
  out.y = y + q.w * ty + (q.z * tx - q.x * tz);
  out.z = z + q.w * tz + (q.x * ty - q.y * tx);
  return out;
}
