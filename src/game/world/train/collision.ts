import { clamp } from "../../core/noise";

/**
 * Circle-vs-oriented-box overlap in the ground plane (the train-ram sting).
 * Returns the push-out normal length (0 = no hit) and writes the normal.
 */
export function obbCircleHit(
  px: number,
  pz: number,
  pr: number,
  cx: number,
  cz: number,
  halfLen: number,
  halfWid: number,
  yaw: number,
  out: { nx: number; nz: number; depth: number },
): number {
  // world → car local (car forward is -Z at yaw 0)
  const dx = px - cx;
  const dz = pz - cz;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const lx = c * dx - s * dz;
  const lz = s * dx + c * dz;
  const qx = clamp(lx, -halfWid, halfWid);
  const qz = clamp(lz, -halfLen, halfLen);
  let nx = lx - qx;
  let nz = lz - qz;
  let d = Math.hypot(nx, nz);
  if (d > pr) return 0;
  if (d < 1e-5) {
    // centre inside the box — push out along the shallowest face
    const penX = halfWid - Math.abs(lx);
    const penZ = halfLen - Math.abs(lz);
    if (penX < penZ) {
      nx = Math.sign(lx) || 1;
      nz = 0;
      d = penX;
    } else {
      nx = 0;
      nz = Math.sign(lz) || 1;
      d = penZ;
    }
  } else {
    nx /= d;
    nz /= d;
  }
  // local → world normal (inverse of the rotation above)
  out.nx = c * nx + s * nz;
  out.nz = -s * nx + c * nz;
  out.depth = pr - d;
  return out.depth;
}
