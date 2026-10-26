/** Per-tick on-foot intent shared by the explorer update phases. */
export interface FootIntent {
  /** Knocked out. */
  KO: boolean;
  /** Camera-relative move direction (unit or zero). */
  mx: number;
  mz: number;
  /** Target planar speed for this tick. */
  top: number;
  sprinting: boolean;
  gunOut: boolean;
  aiming: boolean;
  trigger: boolean;
  surface: string;
}
