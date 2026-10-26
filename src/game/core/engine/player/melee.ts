/** Punch, kick, roll, melee resolution and damage taken. */
import { clamp } from "../../noise";
import { applyDamage, revive, spendStamina, type DamageType } from "../../../player/state";
import { MELEE, ROLL_DUR, ROLL_COST } from "../config/foot-constants";
import type { JeepEngine } from "../jeep-engine";

/** Begin a punch / kick / roll, queueing it if a swing is already in flight. */
export function startAction(this: JeepEngine, kind: "punch" | "kick" | "roll"): void {
  const f = this.foot;
  const ex = this.explorer;
  if (!this.onFoot || !ex || f.downT > 0 || this.riding) return;
  if (f.act === "roll") return; // committed
  if (kind !== "roll" && this.armory.gun) return; // hands are full — holster to fight bare-fisted
  if (kind === "roll") {
    if (!f.grounded || this.player.vitals.stamina < ROLL_COST * 0.5) return;
    const yaw = this.footCam.yaw;
    const mx = this.lastMove.x;
    const my = this.lastMove.y;
    const m = Math.hypot(mx, my);
    let dx: number;
    let dz: number;
    if (m > 0.2) {
      dx = (-Math.sin(yaw) * my + Math.cos(yaw) * mx) / m;
      dz = (-Math.cos(yaw) * my - Math.sin(yaw) * mx) / m;
    } else {
      dx = -Math.sin(f.yaw);
      dz = -Math.cos(f.yaw);
    }
    f.rollX = dx;
    f.rollZ = dz;
    f.act = "roll";
    f.actT = 0;
    f.actDur = ROLL_DUR;
    f.queued = null;
    f.crouch = false;
    f.invulnT = ROLL_DUR * 0.75;
    spendStamina(this.player.vitals, ROLL_COST, 0.9);
    this.audio.step("dirt", 1);
    return;
  }
  if (f.act) {
    // chain the next swing once the current one is mostly through
    if (f.actT / f.actDur > 0.45) f.queued = kind;
    return;
  }
  let move: keyof typeof MELEE = "kick";
  if (kind === "punch") {
    f.combo = f.comboT > 0 ? (f.combo + 1) % 3 : 0;
    move = f.combo === 2 ? "hook" : "punch";
    f.actSide = f.combo === 2 ? 0 : ((f.combo % 2) as 0 | 1);
  } else f.actSide = Math.random() < 0.5 ? 0 : 1;
  const spec = MELEE[move];
  f.act = kind;
  f.actMove = move;
  f.actT = 0;
  f.actDur = spec.dur;
  f.hitDone = false;
  f.comboT = 0.9;
  f.crouch = false;
  spendStamina(this.player.vitals, spec.cost, 0.7);
  // soft lock: snap to the nearest animal in front so swings connect
  const dirX = -Math.sin(f.yaw);
  const dirZ = -Math.cos(f.yaw);
  const t = this.animals?.nearestTarget(f.pos.x, f.pos.z, dirX, dirZ, 4.2, -0.2);
  if (t) f.yaw = Math.atan2(-(t.x - f.pos.x), -(t.z - f.pos.z));
  // small lunge into the swing
  f.vx += -Math.sin(f.yaw) * 2.2;
  f.vz += -Math.cos(f.yaw) * 2.2;
}

/** The moment a swing connects: cone test against the wildlife + feedback. */
export function resolveMelee(this: JeepEngine): void {
  const f = this.foot;
  const spec = MELEE[f.actMove];
  const dx = -Math.sin(f.yaw);
  const dz = -Math.cos(f.yaw);
  const r = this.animals?.melee(
    f.pos.x + dx * 0.2, f.pos.z + dz * 0.2, dx, dz, spec.range, spec.arc, spec.dmg, spec.knock,
  );
  if (!r || r.hits === 0) {
    this.audio.step("dirt", 0.5); // whiff
    return;
  }
  this.audio.thump(clamp(0.3 + spec.dmg / 45, 0.3, 0.8));
  this.input.rumble(clamp(0.3 + spec.dmg / 50, 0.3, 0.8), 110);
  this.camState.trauma = Math.min(1, this.camState.trauma + 0.1 + r.kills * 0.15 + (r.heavy ? 0.1 : 0));
  this.slowmoT = Math.max(this.slowmoT, r.kills ? 0.1 : 0.04); // hit-stop
}

/** The player took a hit (animal bite by default). `n` points away from the attacker. All damage goes through the shared vitals rules. */
export function hurtPlayer(this: JeepEngine, dmg: number, nx: number, nz: number, type: DamageType = "animal"): void {
  const f = this.foot;
  if (!this.onFoot || f.downT > 0 || f.invulnT > 0 || dmg <= 0) return;
  const hit = applyDamage(this.player.vitals, dmg, type);
  this.hurtFlash = 1;
  f.vx += nx * 6.5;
  f.vz += nz * 6.5;
  if (f.act && f.act !== "roll") f.act = null; // staggered out of the swing
  f.queued = null;
  f.invulnT = 0.5;
  this.camState.trauma = Math.min(1, this.camState.trauma + 0.35);
  this.audio.thud(0.6);
  this.input.rumble(0.7, 220);
  if (hit.died) {
    this.mouseFire = this.mouseAim = false;
    if (this.riding) this.dismount(true);
    f.downT = 1; // knocked out until the player gets up (F / Y)
    f.act = null;
    f.crouch = false;
    this.camState.trauma = 1;
    this.notify("Knocked out! Press F / Y to get up");
  }
}

/** Back on your feet at the car after a knockout. Manual: the player chooses when. */
export function recoverFromKnockout(this: JeepEngine): void {
  this.foot.downT = 0;
  revive(this.player.vitals, 0.6);
  this.hurtFlash = 0;
  this.spawnExplorerBesideCar();
  this.notify("You got up beside the jeep — 60% health");
}
