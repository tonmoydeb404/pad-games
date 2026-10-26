import type { HeightGrid } from "../ground";
import { RAPIER } from "./rapier";
import type { PhysicsWorld } from "./physics-world";

export class TerrainStreamer {
  private readonly chunks = new Map<number, RAPIER.Collider>();
  private lastCx = NaN;
  private lastCz = NaN;
  private readonly step: number;

  /**
   * @param cells   lattice cells per chunk side (collider per chunk)
   * @param radius  chunks kept around the car, each way (1 = 3×3)
   */
  constructor(
    private readonly pw: PhysicsWorld,
    private readonly grid: HeightGrid,
    private readonly cells = 32,
    private readonly radius = 1,
  ) {
    this.step = grid.size / grid.seg;
  }

  get loaded(): number {
    return this.chunks.size;
  }

  private key(cx: number, cz: number): number {
    return (cx + 1024) * 4096 + (cz + 1024);
  }

  private add(cx: number, cz: number): void {
    const g = this.grid;
    const i0 = cx * this.cells;
    const j0 = cz * this.cells;
    if (i0 < 0 || j0 < 0 || i0 >= g.seg || j0 >= g.seg) return;
    const nx = Math.min(this.cells, g.seg - i0);
    const nz = Math.min(this.cells, g.seg - j0);
    const n = g.seg + 1;
    // Rapier layout: heights[ix * (nz + 1) + iz] — first index runs along x
    const H = new Float32Array((nx + 1) * (nz + 1));
    for (let ix = 0; ix <= nx; ix++)
      for (let iz = 0; iz <= nz; iz++) H[ix * (nz + 1) + iz] = g.heights[(j0 + iz) * n + (i0 + ix)];
    const sx = nx * this.step;
    const sz = nz * this.step;
    const desc = RAPIER.ColliderDesc.heightfield(nx, nz, H, { x: sx, y: 1, z: sz })
      .setTranslation(-g.size / 2 + i0 * this.step + sx / 2, 0, -g.size / 2 + j0 * this.step + sz / 2)
      .setFriction(0.9);
    this.chunks.set(this.key(cx, cz), this.pw.world.createCollider(desc));
  }

  /** Call every tick — cheap unless the car crossed a chunk border. */
  update(x: number, z: number, force = false): void {
    const size = this.cells * this.step;
    const cx = Math.floor((x + this.grid.size / 2) / size);
    const cz = Math.floor((z + this.grid.size / 2) / size);
    if (!force && cx === this.lastCx && cz === this.lastCz) return;
    this.lastCx = cx;
    this.lastCz = cz;
    const r = this.radius;
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        const k = this.key(cx + dx, cz + dz);
        if (!this.chunks.has(k)) this.add(cx + dx, cz + dz);
      }
    for (const [k, col] of this.chunks) {
      const kx = Math.floor(k / 4096) - 1024;
      const kz = (k % 4096) - 1024;
      if (Math.abs(kx - cx) > r + 1 || Math.abs(kz - cz) > r + 1) {
        this.pw.world.removeCollider(col, false);
        this.chunks.delete(k);
      }
    }
  }
}
