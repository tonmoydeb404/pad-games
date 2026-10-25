/**
 * Goal progression: three active goals per level, escalating targets, all
 * persisted locally. Run-scoped goals reset each run; career goals count
 * across runs. Completing all three advances the level.
 *
 * The structure mirrors classic endless-runner goal ladders: early levels
 * check single mechanics (first spin, first grind, distance), later levels
 * combine them and raise the bar.
 */

import { params } from "../core/params";
import type { GoalProgress } from "../core/types";

export type GoalKind =
  | "runDistance"
  | "runSpins"
  | "runSunstones"
  | "runGrindMeters"
  | "runBigAirs"
  | "runCleanLandings"
  | "runMaxCombo"
  | "careerGrindMeters"
  | "careerStormEscapes";

export interface GoalDef {
  kind: GoalKind;
  /** {n} is replaced with the target. */
  label: (n: number) => string;
  /** Base target at level 1; scaled per level. */
  base: number;
  /** Per-level growth of the target. */
  growth: number;
  /** Career goals keep progress across runs. */
  career?: boolean;
  /** Fixed round target (no per-level scaling). */
  fixed?: boolean;
}

export const GOAL_DEFS: Record<GoalKind, GoalDef> = {
  runDistance: {
    kind: "runDistance",
    label: (n) => `Ride ${n.toLocaleString()} m in one run`,
    base: 400,
    growth: 0.3,
  },
  runSpins: {
    kind: "runSpins",
    label: (n) => `Land ${n} spins in one run`,
    base: 2,
    growth: 0.5,
  },
  runSunstones: {
    kind: "runSunstones",
    label: (n) => `Collect ${n} sunstones in one run`,
    base: 6,
    growth: 0.4,
  },
  runGrindMeters: {
    kind: "runGrindMeters",
    label: (n) => `Grind ${n} m in one run`,
    base: 30,
    growth: 0.5,
  },
  runBigAirs: {
    kind: "runBigAirs",
    label: (n) => `Stick ${n} big airs in one run`,
    base: 1,
    growth: 0.5,
  },
  runCleanLandings: {
    kind: "runCleanLandings",
    label: (n) => `Land ${n} clean landings in one run`,
    base: 4,
    growth: 0.35,
  },
  runMaxCombo: {
    kind: "runMaxCombo",
    label: (n) => `Reach a ×${n} combo`,
    base: 3,
    growth: 0.34,
    fixed: true,
  },
  careerGrindMeters: {
    kind: "careerGrindMeters",
    label: (n) => `Grind ${n.toLocaleString()} m in total`,
    base: 120,
    growth: 0.6,
    career: true,
  },
  careerStormEscapes: {
    kind: "careerStormEscapes",
    label: (n) => `Outrun the wall ${n} times`,
    base: 1,
    growth: 1,
    career: true,
    fixed: true,
  },
};

/** Deterministic per-level triple, escalating like a classic goal ladder. */
function goalKindsForLevel(level: number): [GoalKind, GoalKind, GoalKind] {
  const ladder: Array<[GoalKind, GoalKind, GoalKind]> = [
    ["runDistance", "runSpins", "runSunstones"],
    ["runCleanLandings", "runDistance", "runGrindMeters"],
    ["runSpins", "runSunstones", "runMaxCombo"],
    ["runDistance", "runGrindMeters", "runBigAirs"],
    ["careerGrindMeters", "runCleanLandings", "runSpins"],
    ["runMaxCombo", "runDistance", "runSunstones"],
    ["runBigAirs", "runGrindMeters", "runSpins"],
    ["careerStormEscapes", "runDistance", "runMaxCombo"],
  ];
  return ladder[(level - 1) % ladder.length];
}

function targetFor(def: GoalDef, level: number): number {
  if (def.fixed) return def.base;
  const raw = def.base * (1 + def.growth * (level - 1));
  return def.base >= 100 ? Math.round(raw / 50) * 50 : Math.round(raw);
}

interface StoredGoals {
  level: number;
  career: Partial<Record<GoalKind, number>>;
}

const STORE_KEY = "duneglide.goals.v1";

function load(): StoredGoals {
  if (typeof window === "undefined") return { level: 1, career: {} };
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return { level: 1, career: {} };
    const parsed = JSON.parse(raw) as StoredGoals;
    if (typeof parsed.level !== "number" || typeof parsed.career !== "object") {
      return { level: 1, career: {} };
    }
    return parsed;
  } catch {
    return { level: 1, career: {} };
  }
}

function save(data: StoredGoals): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    // private mode / quota — progression stays session-only
  }
}

export interface ActiveGoal {
  kind: GoalKind;
  label: string;
  target: number;
  progress: number;
  done: boolean;
}

export class GoalEngine {
  level = 1;
  private career: Partial<Record<GoalKind, number>> = {};
  /** The three goals for the current level (readable by UI/tests). */
  active: ActiveGoal[] = [];
  /** Goals completed during the current run (for end-of-run summary). */
  completedThisRun: ActiveGoal[] = [];
  private careerDelta: Partial<Record<GoalKind, number>> = {};

  constructor() {
    const stored = load();
    this.level = Math.max(1, Math.floor(stored.level) || 1);
    this.career = stored.career ?? {};
    this.buildActive();
  }

  private buildActive(): void {
    const kinds = goalKindsForLevel(this.level);
    this.active = kinds.map((kind) => {
      const def = GOAL_DEFS[kind];
      const target = targetFor(def, this.level);
      return {
        kind,
        label: def.label(target),
        target,
        progress: def.career ? (this.career[kind] ?? 0) : 0,
        done: false,
      };
    });
  }

  /** Reset run-scoped progress; keep career totals. */
  startRun(): void {
    this.completedThisRun = [];
    this.careerDelta = {};
    for (const g of this.active) {
      const career = GOAL_DEFS[g.kind].career === true;
      g.progress = career ? (this.career[g.kind] ?? 0) : 0;
      g.done = career ? g.progress >= g.target : false;
    }
  }

  /**
   * Feed a counter delta. Career goals are also recorded so persistence
   * survives even when the goal is already done (totals keep counting).
   */
  private add(kind: GoalKind, amount: number): void {
    const def = GOAL_DEFS[kind];
    if (def.career) {
      this.career[kind] = (this.career[kind] ?? 0) + amount;
      this.careerDelta[kind] = (this.careerDelta[kind] ?? 0) + amount;
    }
    const goal = this.active.find((g) => g.kind === kind);
    if (!goal || goal.done) return;
    goal.progress += amount;
    if (goal.progress >= goal.target) {
      goal.done = true;
      this.completedThisRun.push(goal);
    }
  }

  /** Run-scoped setters (called from the game loop). */
  setRunCounter(kind: GoalKind, value: number): void {
    const goal = this.active.find((g) => g.kind === kind);
    if (!goal || goal.done) return;
    const def = GOAL_DEFS[kind];
    if (def.career) return;
    goal.progress = value;
    if (goal.progress >= goal.target) {
      goal.done = true;
      this.completedThisRun.push(goal);
    }
  }

  addCareerCounter(kind: GoalKind, amount: number): void {
    this.add(kind, amount);
  }

  /** Maximum-run-combo style absolute counters. */
  setMaxCounter(kind: GoalKind, value: number): void {
    const goal = this.active.find((g) => g.kind === kind);
    if (!goal || goal.done) return;
    if (value > goal.progress) this.setRunCounter(kind, value);
  }

  get allDone(): boolean {
    return this.active.every((g) => g.done);
  }

  /** Advance the level when everything is complete. */
  maybeLevelUp(): boolean {
    if (!this.allDone) return false;
    this.level++;
    save({ level: this.level, career: this.career });
    this.buildActive();
    return true;
  }

  /** Persist career counters after a run. */
  persist(): void {
    save({ level: this.level, career: this.career });
  }

  snapshot(): { level: number; goals: GoalProgress[] } {
    return {
      level: this.level,
      goals: this.active.map((g) => ({
        label: g.label,
        progress: Math.min(g.progress, g.target),
        target: g.target,
        done: g.done,
      })),
    };
  }

  /** Total grind meters recorded in career storage (for stats screens). */
  get careerGrindMeters(): number {
    return this.career.careerGrindMeters ?? 0;
  }
}

/** Meters-per-px conversion shared by goal feeders. */
export function pxToMeters(px: number): number {
  return px / params.pxPerMeter;
}
