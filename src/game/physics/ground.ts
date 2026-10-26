/**
 * Terrain height lookup that matches the *rendered* terrain mesh exactly.
 *
 * The visible ground is a `PlaneGeometry(size, size, seg, seg)` whose vertex
 * heights come from the analytic terrain function. Between vertices the GPU
 * linearly interpolates each triangle, which can differ from the analytic
 * function by decimetres on bumpy ground — enough for wheels to sink visibly
 * into (or hover above) the surface. Physics samples this grid instead, using
 * the same triangulation, so what the wheels touch is what you see.
 *
 * Vertex layout (three.js PlaneGeometry after `rotateX(-π/2)`):
 *   x = -size/2 + ix·step,  z = -size/2 + iz·step,  index = iz·(seg+1) + ix
 * Cell triangles: (a,b,d) and (b,c,d) with a=(ix,iz) b=(ix,iz+1) c=(ix+1,iz+1)
 * d=(ix+1,iz) — i.e. the diagonal runs b–d.
 */
export class HeightGrid {
  private readonly half: number;
  private readonly step: number;
  private readonly n: number;

  constructor(
    readonly size: number,
    readonly seg: number,
    /** (seg+1)² heights, row-major by z then x. */
    readonly heights: Float32Array,
  ) {
    this.half = size / 2;
    this.step = size / seg;
    this.n = seg + 1;
  }

  sample(x: number, z: number): number {
    const gx = (x + this.half) / this.step;
    const gz = (z + this.half) / this.step;
    let ix = Math.floor(gx);
    let iz = Math.floor(gz);
    if (ix < 0) ix = 0;
    else if (ix > this.seg - 1) ix = this.seg - 1;
    if (iz < 0) iz = 0;
    else if (iz > this.seg - 1) iz = this.seg - 1;
    let u = gx - ix;
    let w = gz - iz;
    if (u < 0) u = 0;
    else if (u > 1) u = 1;
    if (w < 0) w = 0;
    else if (w > 1) w = 1;
    const H = this.heights;
    const i = iz * this.n + ix;
    const a = H[i];
    const b = H[i + this.n];
    const c = H[i + this.n + 1];
    const d = H[i + 1];
    return u + w <= 1 ? a + u * (d - a) + w * (b - a) : c + (1 - u) * (b - c) + (1 - w) * (d - c);
  }
}
