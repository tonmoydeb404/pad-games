/** Game-feel events: trauma, landings, laps, best-lap storage and jeep damage. */
import { clamp } from "../../noise";
import type { JeepEngine } from "../jeep-engine";
import { fmtTime } from "../ui/format-time";

/** game-feel: decaying trauma 0..1 — shake = trauma². Hits add, never reset. */
export function addTrauma(this: JeepEngine, amount: number): void {
  this.camState.trauma = Math.min(1, this.camState.trauma + amount);
}

/** Layered landing feedback: thud + rumble + shake + FOV punch + dust. */
export function onLand(this: JeepEngine, air: number, impactVy = 0): void {
  const sev = clamp(Math.max(air / 1.1, impactVy / 16), 0.15, 1.4);
  this.audio.thud(0.4 + sev * 0.5);
  this.input.rumble(Math.min(1, 0.35 + sev * 0.55), 200 + sev * 200);
  this.addTrauma(0.18 + sev * 0.4);
  this.fovKick = 2.5 + sev * 5;
  const v = this.v;
  for (let i = 0; i < 8; i++) {
    this.spawnParticle(
      v.pos.x + (Math.random() - 0.5) * 2.4,
      v.pos.y - 0.5 + Math.random() * 0.3,
      v.pos.z + (Math.random() - 0.5) * 2.4,
      (Math.random() - 0.5) * 3,
      0.8 + Math.random() * 1.6,
      (Math.random() - 0.5) * 3,
      "#8a7648",
      0.2,
      0.9,
      0.7,
    );
  }
  if (air > 0.85) this.notify(`Big air — ${air.toFixed(1)}s!`);
  if (impactVy > 20) this.damageJeep((impactVy - 20) * 1.6 / Math.max(0.8, this.perf.mass));
  if (sev > 0.55) {
    this.spawnDebris(v.pos.x, v.pos.y - 0.4, v.pos.z, 2.5 + sev * 3);
  }
}

/** Lap timing hook — fires when the loop start line is crossed. */
export function completeLap(this: JeepEngine): void {
  const v = this.v;
  if (this.lapStartT < 0) {
    // open world: the first crossing arms the optional loop clock
    v.lap++;
    this.lapStartT = this.time;
    this.notify("Loop started — time the trail!");
    return;
  }
  v.lap++;
  const now = this.time;
  const lapTime = now - this.lapStartT;
  this.lapStartT = now;
  if (lapTime > 5) {
    this.lapTimes.push(lapTime);
    let msg = `Lap ${v.lap} — ${fmtTime(lapTime)}`;
    if (!this.bestLap || lapTime < this.bestLap) {
      this.bestLap = lapTime;
      this.saveBestLap();
      msg += " · NEW BEST!";
      this.input.rumble(0.5, 160);
    }
    this.notify(msg);
  }
}

export function loadBestLap(this: JeepEngine): void {
  try {
    const raw = window.localStorage.getItem("jj_best_lap");
    const n = raw ? Number(raw) : 0;
    this.bestLap = isFinite(n) && n > 0 ? n : 0;
  } catch {
    this.bestLap = 0;
  }
}

export function saveBestLap(this: JeepEngine): void {
  try {
    window.localStorage.setItem("jj_best_lap", String(this.bestLap));
  } catch {
    // storage unavailable — best lap stays session-only
  }
}

/**
 * Load the Quaternius animal packs and release the population. Loading is
 * optional at runtime: a failed pack just means fewer (or no) animals —
 * the drive never breaks.
 */
/**
 * Chip the jeep's health. At zero the jeep is wrecked: inputs lock and smoke
 * pours out until the player recovers it (R / RB), which restores it on the trail.
 */
export function damageJeep(this: JeepEngine, amount: number): void {
  if (this.wreckT > 0) return;
  this.jeepHealth = Math.max(0, this.jeepHealth - amount);
  if (this.jeepHealth <= 0) {
    this.wreckT = 3.4;
    this.slowmoT = 0.3;
    this.camState.trauma = 1;
    this.audio.thud(1.4);
    this.input.rumble(1, 900);
    this.notify("Wrecked! Press R / RB to recover");
    // fireball-ish burst over the bonnet
    const rp = this.renderPos;
    const sy = Math.sin(this.v.yaw);
    const cy = Math.cos(this.v.yaw);
    for (let i = 0; i < 46; i++) {
      this.spawnParticle(
        rp.x - sy * 1.4, rp.y + 0.9, rp.z - cy * 1.4,
        (Math.random() - 0.5) * 7,
        2 + Math.random() * 8,
        (Math.random() - 0.5) * 7,
        Math.random() < 0.55 ? "#ff8a3c" : "#2b2b2b",
        0.3 + Math.random() * 0.25, 0.15, 0.7 + Math.random() * 0.6,
      );
    }
  }
}
