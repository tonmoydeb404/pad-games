export type JeepQuality = "low" | "medium" | "high";

/** Per-quality-tier budget: render scale, shadow map, vegetation counts, particles. */
export const QUALITY: Record<
  JeepQuality,
  {
    pixelRatio: number;
    shadow: number;
    trees: number;
    palms: number;
    bushes: number;
    ferns: number;
    grass: number;
    rocks: number;
    far: number;
    particles: number;
    terrainSeg: number;
    shadowsOn: boolean;
  }
> = {
  low: { pixelRatio: 1.0, shadow: 1024, trees: 300, palms: 70, bushes: 240, ferns: 300, grass: 800, rocks: 160, far: 420, particles: 180, terrainSeg: 190, shadowsOn: true },
  medium: { pixelRatio: 1.4, shadow: 2048, trees: 460, palms: 100, bushes: 360, ferns: 480, grass: 1300, rocks: 260, far: 560, particles: 300, terrainSeg: 270, shadowsOn: true },
  high: { pixelRatio: 2.0, shadow: 4096, trees: 640, palms: 130, bushes: 520, ferns: 720, grass: 1900, rocks: 360, far: 750, particles: 420, terrainSeg: 340, shadowsOn: true },
};

export interface JeepOptions {
  container: HTMLElement;
  quality?: JeepQuality;
}
