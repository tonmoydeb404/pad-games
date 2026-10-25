/**
 * Free-roam challenges: speed traps, drift zones and collectible tokens.
 * Pure state + scoring (no rendering) so it runs headless in tests. The
 * engine calls update() each tick with the car snapshot and consumes events
 * (toasts, chimes, pickups) to drive HUD + audio.
 *
 * Bests persist in localStorage (`racing.v1.*`), degrading gracefully in
 * private mode.
 */
import type { DriftZoneSpec, SpeedTrapSpec, TokenSpec, WorldMap } from "./track";
import { kph } from "./util";

export type ChallengeEvent =
  | { kind: "trap"; id: string; kph: number; target: number; passed: boolean; best: number }
  | { kind: "drift-bank"; id: string; score: number; best: number }
  | { kind: "token"; id: string; total: number; collected: number };

interface Bests {
  traps: Record<string, number>;
  drift: Record<string, number>;
  tokens: number;
}

const KEY = "racing.v1.bests";

function loadBests(): Bests {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return { traps: {}, drift: {}, tokens: 0, ...JSON.parse(raw) };
  } catch {
    // private mode — session bests only
  }
  return { traps: {}, drift: {}, tokens: 0 };
}

function saveBests(b: Bests): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(b));
  } catch {
    // ignore
  }
}

export class ChallengeSystem {
  readonly traps: SpeedTrapSpec[];
  readonly driftZones: DriftZoneSpec[];
  readonly tokens: TokenSpec[];
  readonly tokenCount: number;

  /** Set of collected token ids this session (persisted across visits). */
  collected = new Set<string>();
  bests: Bests;
  /** Live drift accumulation per zone id. */
  private driftLive: Record<string, number> = {};
  /** Zones the car was inside on the previous tick. */
  private inside = new Set<string>();
  /** Tokens the car was within pickup range of on the previous tick. */
  private nearToken = new Set<string>();
  private trapsArmed = new Set<string>();

  onEvent: ((e: ChallengeEvent) => void) | null = null;

  constructor(map: WorldMap) {
    this.traps = map.challenges.traps;
    this.driftZones = map.challenges.driftZones;
    this.tokens = map.challenges.tokens;
    this.tokenCount = this.tokens.length;
    this.bests = loadBests();
  }

  /** Token world positions for rendering/collection. */
  tokenPos(id: string): { x: number; z: number; y: number } | null {
    const t = this.tokens.find((tok) => tok.id === id);
    return t ? { x: t.x, z: t.z, y: t.y } : null;
  }

  update(
    dt: number,
    car: { x: number; z: number; speed: number; drift: number; grounded: boolean },
  ): void {
    this.updateTraps(car);
    this.updateDrift(dt, car);
    this.updateTokens(car);
  }

  /** Traps trip when the car passes within the gate radius fast enough. */
  private updateTraps(car: { x: number; z: number; speed: number }): void {
    for (const trap of this.traps) {
      const dx = car.x - (trap.gx + 0.5) * 10;
      const dz = car.z - (trap.gz + 0.5) * 10;
      const near = dx * dx + dz * dz < 13 * 13;
      if (!near) {
        this.trapsArmed.delete(trap.id);
        continue;
      }
      if (this.trapsArmed.has(trap.id)) continue; // already scored this pass
      this.trapsArmed.add(trap.id);
      const speed = kph(Math.abs(car.speed));
      const best = this.bests.traps[trap.id] ?? 0;
      const passed = speed >= trap.target;
      if (speed > best) {
        this.bests.traps[trap.id] = Math.round(speed * 10) / 10;
        saveBests(this.bests);
      }
      this.onEvent?.({
        kind: "trap",
        id: trap.id,
        kph: Math.round(speed),
        target: trap.target,
        passed,
        best: this.bests.traps[trap.id],
      });
    }
  }

  /** Drift zones bank points continuously; banked on exit or when landing. */
  private updateDrift(dt: number, car: { x: number; z: number; drift: number; grounded: boolean }): void {
    for (const zone of this.driftZones) {
      const dx = car.x - zone.x;
      const dz = car.z - zone.z;
      const inside = dx * dx + dz * dz <= zone.r * zone.r;
      const wasInside = this.inside.has(zone.id);
      if (inside && car.grounded && car.drift > 0.25) {
        this.driftLive[zone.id] = (this.driftLive[zone.id] ?? 0) + car.drift * dt * 100;
      }
      if (wasInside && !inside) {
        this.bank(zone.id);
        this.inside.delete(zone.id);
      } else if (inside) {
        this.inside.add(zone.id);
      }
    }
  }

  private bank(zoneId: string): void {
    const score = Math.round(this.driftLive[zoneId] ?? 0);
    this.driftLive[zoneId] = 0;
    if (score < 10) return;
    const best = this.bests.drift[zoneId] ?? 0;
    if (score > best) {
      this.bests.drift[zoneId] = score;
      saveBests(this.bests);
    }
    this.onEvent?.({ kind: "drift-bank", id: zoneId, score, best: this.bests.drift[zoneId] });
  }

  /** Tokens collect within 3.2 m (2D) of the car. */
  private updateTokens(car: { x: number; z: number }): void {
    for (const tok of this.tokens) {
      if (this.collected.has(tok.id)) continue;
      const dx = car.x - tok.x;
      const dz = car.z - tok.z;
      if (dx * dx + dz * dz < 3.2 * 3.2) {
        this.collected.add(tok.id);
        this.bests.tokens = Math.max(this.bests.tokens, this.collected.size);
        saveBests(this.bests);
        this.onEvent?.({ kind: "token", id: tok.id, total: this.tokenCount, collected: this.collected.size });
      }
    }
  }

  /** Drift score currently accumulating in a zone (HUD). */
  liveDrift(zoneId: string): number {
    return Math.round(this.driftLive[zoneId] ?? 0);
  }

  /** Active zone under the car (HUD highlight). */
  activeZone(x: number, z: number): DriftZoneSpec | null {
    for (const zone of this.driftZones) {
      const dx = x - zone.x;
      const dz = z - zone.z;
      if (dx * dx + dz * dz <= zone.r * zone.r) return zone;
    }
    return null;
  }
}
