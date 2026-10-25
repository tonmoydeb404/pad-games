/** Shared types across game core, rendering and the React shell. */

export type GameState = "booting" | "menu" | "running" | "paused" | "crashing" | "gameover";

export type RunMode = "daily" | "free" | "attract";

/** Slow-changing snapshot pushed to the UI (~10 Hz), never per-frame. */
export interface HudData {
  score: number;
  multiplier: number;
  distance: number;
  speedKph: number;
  boost: number;
  fps: number;
  padConnected: boolean;
  /** Live trick readout while airborne. */
  grounded: boolean;
  airTime: number;
  /** Degrees of rotation accumulated in the current air. */
  spinDeg: number;
  /** Unbanked trick points at risk on a rough landing. */
  chain: number;
  /** Goal progression: level index + the three active goals. */
  level: number;
  goals: GoalProgress[];
  /** Meters of headroom in front of the storm wall (null = calm). */
  stormMeters: number | null;
}

export interface GoalProgress {
  label: string;
  progress: number;
  target: number;
  done: boolean;
}

export function initialHud(): HudData {
  return {
    score: 0,
    multiplier: 1,
    distance: 0,
    speedKph: 0,
    boost: 1,
    fps: 0,
    padConnected: false,
    grounded: true,
    airTime: 0,
    spinDeg: 0,
    chain: 0,
    level: 1,
    goals: [],
    stormMeters: null,
  };
}

export interface TrickLog {
  name: string;
  points: number;
}

export interface RunSummary {
  mode: RunMode;
  seed: number;
  score: number;
  distance: number;
  duration: number;
  maxCombo: number;
  spins: number;
  cleanLandings: number;
  roughLandings: number;
  tricks: TrickLog[];
  endedBy: "crash" | "fall" | "obstacle" | "storm" | "quit";
  date: number;
}

export interface Settings {
  name: string;
  music: boolean;
  sfx: boolean;
  rumble: boolean;
  shake: boolean;
  /** Tone down impact motion: hit-stop freezes and rider squash/stretch. */
  reducedMotion: boolean;
  /** Colorblind-safe sunstone rendering. */
  highContrast: boolean;
  /** HUD text scale (1 = 100%, 1.15, 1.3). */
  hudScale: number;
  showFps: boolean;
  debug: boolean;
}

/** HUD text scale options, cycled in settings. */
export const HUD_SCALES = [1, 1.15, 1.3] as const;

export const defaultSettings: Settings = {
  name: "Rider",
  music: true,
  sfx: true,
  rumble: true,
  shake: true,
  reducedMotion: false,
  highContrast: false,
  hudScale: 1,
  showFps: false,
  debug: false,
};

export type MenuAction = "up" | "down" | "left" | "right" | "confirm" | "back";

export interface ToastEvent {
  id: number;
  text: string;
  sub?: string;
  tone: "good" | "bad" | "info";
}

export interface PadEvent {
  connected: boolean;
  id: string;
}

export interface GameEvents {
  state: GameState;
  hud: HudData;
  runEnd: RunSummary;
  menu: MenuAction;
  toast: ToastEvent;
  pad: PadEvent;
}
