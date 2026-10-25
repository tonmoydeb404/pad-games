import {
  AMMO_PICKUP_MAGS,
  GRENADE_DAMAGE,
  GRENADE_MAX,
  GRENADE_PICKUP_GIVE,
  GRENADE_RADIUS,
  GRENADE_START,
  INTERMISSION_SECONDS,
  KILL_LIMIT,
  MAX_ARMOR,
  MAX_HEALTH,
  MAX_REWIND_MS,
  MAP_PICKUPS,
  PITCH_LIMIT,
  RESPAWN_SECONDS,
  ROUND_SECONDS,
  SIM_DT,
  SPAWN_POINTS,
  SPAWN_PROTECTION_SECONDS,
  STARTING_WEAPONS,
  WEAPONS,
  WEAPON_PICKUP_MAGS,
  ArenaPhysics,
  GrenadeSim,
  PropSim,
  SKINS,
  aimDir,
  eyePos,
  rayPlayer,
  rayWorld,
  stepMove,
  type GrenadeBlast,
  type InputCommand,
  type KillEvent,
  type MoveState,
  type ShotEvent,
  type Snapshot,
  type Vec3,
} from "@pad/arena-shared";

const HISTORY_MS = 500;
const MAX_QUEUE = 12;
const COLORS = [0xe05555, 0x55b0e0, 0x6fd16f, 0xe0c455, 0xb06fe0, 0xe08a3c, 0x4fd1c5, 0xe06fb0];
const GRENADE_COOLDOWN = 0.8;
const HEALTH_PICKUP_AMOUNT = 40;
const ARMOR_PICKUP_AMOUNT = 50;

interface Player {
  id: string;
  name: string;
  color: number;
  skin: number;
  move: MoveState;
  yaw: number;
  pitch: number;
  hp: number;
  armor: number;
  alive: boolean;
  weapon: number;
  /** bit i = owns WEAPONS[i] */
  weapons: number;
  mag: number[];
  reserve: number[];
  grenades: number;
  grenadeCd: number;
  reloadT: number;
  cooldownT: number;
  respawnT: number;
  protectT: number;
  kills: number;
  deaths: number;
  ack: number;
  queue: InputCommand[];
  history: { t: number; x: number; y: number; z: number }[];
  lastFire: boolean;
}

export interface GameEvents {
  onKill(e: KillEvent): void;
  onShot(e: ShotEvent): void;
  /** `to` shot someone for `amount` damage; (ax, az) = attacker position for the damage indicator */
  onHit(shooterId: string, victimId: string, amount: number, killed: boolean, ax: number, az: number): void;
  onExplosion(e: { x: number; y: number; z: number }): void;
  onPickup(e: { playerId: string; i: number; kind: string }): void;
  onPropBroken(e: { i: number; x: number; y: number; z: number; explosive: boolean }): void;
}

interface PickupState {
  taken: boolean;
  respawnT: number;
}

/** Authoritative game state. No networking: the Room feeds it input and reads snapshots. */
export class ArenaGame {
  readonly players = new Map<string, Player>();
  /** server time in ms */
  time = 0;
  phase: "playing" | "intermission" = "playing";
  phaseLeft = ROUND_SECONDS;
  readonly physics: ArenaPhysics;
  readonly props: PropSim;
  readonly grenades: GrenadeSim;
  private pickups: PickupState[] = [];
  private acc = 0;
  private colorIdx = 0;

  constructor(private events: GameEvents) {
    this.physics = new ArenaPhysics();
    this.props = new PropSim(this.physics);
    this.grenades = new GrenadeSim(this.physics, (blast) => {
      this.events.onExplosion({ x: blast.x, y: blast.y, z: blast.z });
      this.applyBlast(blast, null, 0);
    });
  }

  addPlayer(id: string, name: string, skin = 0): Player {
    const p: Player = {
      id,
      name: name.trim().slice(0, 16) || "Player",
      color: COLORS[this.colorIdx++ % COLORS.length],
      skin: Number.isInteger(skin) && skin >= 0 && skin < SKINS.length ? skin : 0,
      move: { x: 0, y: 0, z: 0, vy: 0, onGround: false },
      yaw: 0,
      pitch: 0,
      hp: MAX_HEALTH,
      armor: 0,
      alive: true,
      weapon: STARTING_WEAPONS[0],
      weapons: 0,
      mag: WEAPONS.map((w) => w.magSize),
      reserve: WEAPONS.map((w) => (w.infinite ? Infinity : 0)),
      grenades: GRENADE_START,
      grenadeCd: 0,
      reloadT: 0,
      cooldownT: 0,
      respawnT: 0,
      protectT: 0,
      kills: 0,
      deaths: 0,
      ack: 0,
      queue: [],
      history: [],
      lastFire: false,
    };
    for (const w of STARTING_WEAPONS) p.weapons |= 1 << w;
    this.players.set(id, p);
    this.spawn(p);
    return p;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
  }

  pushInput(id: string, cmds: InputCommand[], rt: number): void {
    const p = this.players.get(id);
    if (!p) return;
    for (const c of cmds) {
      // reject stale/replayed commands and malformed numbers
      if (c.seq <= p.ack || p.queue.some((q) => q.seq === c.seq)) continue;
      if (![c.mx, c.mz, c.yaw, c.pitch].every(Number.isFinite)) continue;
      p.queue.push({ ...c, rt } as InputCommand & { rt: number });
    }
    if (p.queue.length > MAX_QUEUE) p.queue.splice(0, p.queue.length - MAX_QUEUE);
  }

  tick(deltaMs: number): void {
    this.acc += Math.min(deltaMs, 250);
    const stepMs = SIM_DT * 1000;
    while (this.acc >= stepMs) {
      this.acc -= stepMs;
      this.step();
    }
  }

  private step(): void {
    this.time += SIM_DT * 1000;

    this.phaseLeft -= SIM_DT;
    if (this.phase === "playing") {
      const leader = Math.max(0, ...[...this.players.values()].map((p) => p.kills));
      if (this.phaseLeft <= 0 || leader >= KILL_LIMIT) this.startIntermission();
    } else if (this.phaseLeft <= 0) {
      this.startRound();
    }

    for (const p of this.players.values()) {
      p.protectT = Math.max(0, p.protectT - SIM_DT);
      p.grenadeCd = Math.max(0, p.grenadeCd - SIM_DT);
      if (!p.alive) {
        p.respawnT -= SIM_DT;
        if (p.respawnT <= 0 && this.phase === "playing") this.spawn(p);
        p.queue.length = 0;
        continue;
      }
      // Normally 1 command per tick; drain faster if the queue is backing up.
      const n = p.queue.length > 3 ? 2 : 1;
      for (let i = 0; i < n && p.queue.length; i++) {
        const cmd = p.queue.shift() as InputCommand & { rt: number };
        this.applyCommand(p, cmd, cmd.rt);
      }
      // props shove players around (server-side; prediction ignores props)
      const push = this.props.pushOut(p.move.x, p.move.y, p.move.z);
      if (push.dx !== 0 || push.dz !== 0) {
        p.move.x += push.dx;
        p.move.z += push.dz;
      }
      p.history.push({ t: this.time, x: p.move.x, y: p.move.y, z: p.move.z });
      while (p.history.length && p.history[0].t < this.time - HISTORY_MS) p.history.shift();
    }

    this.physics.step(SIM_DT);
    this.props.step(SIM_DT * 1000);
    this.grenades.step();
    this.stepPickups();
  }

  private applyCommand(p: Player, cmd: InputCommand, rt: number): void {
    p.ack = cmd.seq;
    p.yaw = cmd.yaw;
    p.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, cmd.pitch));
    stepMove(p.move, cmd, SIM_DT);

    p.cooldownT = Math.max(0, p.cooldownT - SIM_DT);
    if (p.reloadT > 0) {
      p.reloadT -= SIM_DT;
      if (p.reloadT <= 0) this.finishReload(p);
    }
    if (
      cmd.weapon >= 0 &&
      cmd.weapon < WEAPONS.length &&
      cmd.weapon !== p.weapon &&
      (p.weapons & (1 << cmd.weapon)) !== 0
    ) {
      p.weapon = cmd.weapon;
      p.reloadT = 0;
    }
    const def = WEAPONS[p.weapon];
    if (cmd.reload && p.reloadT <= 0 && p.mag[p.weapon] < def.magSize && this.reserveOf(p, p.weapon) > 0) {
      p.reloadT = def.reloadSeconds;
    }

    if (cmd.throw === true && p.grenadeCd <= 0 && p.grenades > 0 && this.phase === "playing") {
      p.grenades--;
      p.grenadeCd = GRENADE_COOLDOWN;
      const from = eyePos(p.move.x, p.move.y, p.move.z);
      const dir = aimDir(p.yaw, p.pitch);
      this.grenades.throwGrenade(
        { x: from[0], y: from[1], z: from[2] },
        { x: dir[0], y: dir[1], z: dir[2] },
        { x: 0, y: 1.2, z: 0 },
      );
    }

    const wantsFire = cmd.fire && this.phase === "playing";
    if (wantsFire && p.cooldownT <= 0 && p.reloadT <= 0) {
      if (p.mag[p.weapon] > 0) {
        p.mag[p.weapon]--;
        p.cooldownT = def.cooldown;
        this.fire(p, cmd.zoom === true, rt);
      } else if (this.reserveOf(p, p.weapon) > 0) {
        p.reloadT = def.reloadSeconds;
      }
    }
    p.lastFire = cmd.fire;
  }

  private reserveOf(p: Player, weapon: number): number {
    return WEAPONS[weapon].infinite ? Infinity : p.reserve[weapon];
  }

  private finishReload(p: Player): void {
    const def = WEAPONS[p.weapon];
    const need = def.magSize - p.mag[p.weapon];
    if (def.infinite) {
      p.mag[p.weapon] = def.magSize;
    } else {
      const take = Math.min(need, p.reserve[p.weapon]);
      p.mag[p.weapon] += take;
      p.reserve[p.weapon] -= take;
    }
  }

  private posAt(target: Player, t: number): { x: number; y: number; z: number } {
    const h = target.history;
    for (let i = h.length - 1; i >= 0; i--) if (h[i].t <= t) return h[i];
    return h[0] ?? target.move;
  }

  private fire(shooter: Player, zoomed: boolean, rt: number): void {
    const def = WEAPONS[shooter.weapon];
    const rewindTo = Math.max(this.time - MAX_REWIND_MS, Math.min(this.time, Number.isFinite(rt) ? rt : this.time));
    const origin = eyePos(shooter.move.x, shooter.move.y, shooter.move.z);
    const spread = zoomed && def.scopedSpread !== undefined ? def.scopedSpread : def.spread;
    const ends: Vec3[] = [];
    const damage = new Map<string, number>();

    for (let i = 0; i < def.pellets; i++) {
      const a = shooter.yaw + (Math.random() * 2 - 1) * spread;
      const b = shooter.pitch + (Math.random() * 2 - 1) * spread;
      const dir = aimDir(a, b);
      const dv = { x: dir[0], y: dir[1], z: dir[2] };
      // world + props occlude (Rapier); players are tested against rewound capsules
      let best = this.physics.castRay({ x: origin[0], y: origin[1], z: origin[2] }, dv, def.range);
      let hit: Player | null = null;
      for (const t of this.players.values()) {
        if (t === shooter || !t.alive || t.protectT > 0) continue;
        const pos = this.posAt(t, rewindTo);
        const dist = rayPlayer(origin, dir, pos.x, pos.y, pos.z, best);
        if (dist !== null && dist < best) {
          best = dist;
          hit = t;
        }
      }
      // nearest prop closer than the player hit?
      const prop = this.propAlongRay(origin, dv, best);
      if (prop !== null) {
        best = prop.dist;
        hit = null;
      }
      ends.push([origin[0] + dir[0] * best, origin[1] + dir[1] * best, origin[2] + dir[2] * best]);
      const dmg = def.damage * (1 - (1 - def.falloff) * (best / def.range));
      if (hit) {
        damage.set(hit.id, (damage.get(hit.id) ?? 0) + dmg);
      } else if (prop !== null) {
        const broken = this.props.damage(prop.i, dmg);
        this.props.hitImpulse(prop.i, dv);
        if (broken === "break") {
          const pos = this.props.posAt(prop.i);
          this.events.onPropBroken({ i: prop.i, x: pos.x, y: pos.y, z: pos.z, explosive: false });
        } else if (broken === "explode") {
          this.detonateBarrel(prop.i, shooter.id);
        }
      }
    }
    this.events.onShot({ shooter: shooter.id, from: origin, to: ends, weapon: shooter.weapon });

    for (const [id, amount] of damage) {
      const victim = this.players.get(id);
      if (!victim || !victim.alive) continue;
      this.damagePlayer(victim, amount, shooter, {
        x: ends[0][0],
        y: 0.2,
        z: ends[0][2] - origin[2],
      });
    }
  }

  /** March the ray through prop bodies to find the first one hit within `best`. */
  private propAlongRay(
    origin: Vec3,
    dir: { x: number; y: number; z: number },
    best: number,
  ): { i: number; dist: number } | null {
    let found: { i: number; dist: number } | null = null;
    for (let i = 0; i < this.props.count; i++) {
      if (this.props.isGone(i)) continue;
      const body = this.props.bodyAt(i);
      if (!body) continue;
      const t = body.translation();
      // cheap bounding-sphere test
      const r = 0.8;
      const ox = t.x - origin[0];
      const oy = t.y - origin[1];
      const oz = t.z - origin[2];
      const tca = ox * dir.x + oy * dir.y + oz * dir.z;
      if (tca < 0 || tca > best) continue;
      const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
      if (d2 > r * r) continue;
      if (!found || tca < found.dist) found = { i, dist: tca };
    }
    return found;
  }

  private damagePlayer(victim: Player, amount: number, attacker: Player | null, impulse: { x: number; y: number; z: number }): void {
    if (!victim.alive) return;
    // armour soaks first
    if (victim.armor > 0) {
      const soaked = Math.min(victim.armor, amount * 0.6);
      victim.armor -= soaked;
      amount -= soaked;
    }
    victim.hp -= amount;
    const killed = victim.hp <= 0;
    const ax = attacker ? attacker.move.x : victim.move.x;
    const az = attacker ? attacker.move.z : victim.move.z;
    this.events.onHit(attacker?.id ?? victim.id, victim.id, Math.round(amount), killed, ax, az);
    if (killed) {
      victim.hp = 0;
      victim.alive = false;
      victim.deaths++;
      victim.respawnT = RESPAWN_SECONDS;
      if (attacker && attacker !== victim) attacker.kills++;
      const ilen = Math.hypot(impulse.x, impulse.y, impulse.z) || 1;
      this.events.onKill({
        killer: attacker?.id ?? victim.id,
        victim: victim.id,
        weapon: attacker === victim ? -1 : (attacker?.weapon ?? -1),
        x: victim.move.x,
        y: victim.move.y,
        z: victim.move.z,
        ix: impulse.x / ilen,
        iy: (Math.abs(impulse.y) / ilen) * 0.4 + 0.35,
        iz: impulse.z / ilen,
      });
    }
  }

  private detonateBarrel(index: number, attackerId: string | null): void {
    const pos = this.props.posAt(index);
    this.events.onPropBroken({ i: index, x: pos.x, y: pos.y, z: pos.z, explosive: true });
    const attacker = attackerId ? (this.players.get(attackerId) ?? null) : null;
    this.applyBlast({ id: -1, x: pos.x, y: pos.y, z: pos.z, vx: 0, vy: 0, vz: 0 }, attacker, 1);
  }

  /** Radial damage (LOS-checked) + prop impulses + barrel chains. */
  private applyBlast(blast: GrenadeBlast, attacker: Player | null, depth: number): void {
    this.props.blast(blast.x, blast.y, blast.z, GRENADE_RADIUS, 9);

    for (const p of this.players.values()) {
      if (!p.alive) continue;
      const dx = p.move.x - blast.x;
      const dy = p.move.y + 0.9 - blast.y;
      const dz = p.move.z - blast.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > GRENADE_RADIUS) continue;
      // line of sight through static geometry
      const inv = dist > 1e-4 ? 1 / dist : 0;
      const blocked = rayWorld([blast.x, blast.y, blast.z], [dx * inv, dy * inv, dz * inv], dist) < dist - 0.1;
      if (blocked) continue;
      const dmg = GRENADE_DAMAGE * (1 - dist / GRENADE_RADIUS);
      this.damagePlayer(p, dmg, attacker?.id === p.id ? p : attacker, {
        x: dx * inv,
        y: Math.abs(dy * inv) + 0.5,
        z: dz * inv,
      });
    }

    // chain-react nearby barrels (bounded depth)
    if (depth < 3) {
      for (let i = 0; i < this.props.count; i++) {
        if (this.props.isGone(i)) continue;
        if (!this.props.isExplosive(i)) continue;
        const pos = this.props.posAt(i);
        const d = Math.hypot(pos.x - blast.x, pos.z - blast.z);
        if (d > GRENADE_RADIUS) continue;
        if (this.props.explode(i)) {
          this.events.onPropBroken({ i, x: pos.x, y: pos.y, z: pos.z, explosive: true });
          this.applyBlast({ id: -1, x: pos.x, y: pos.y, z: pos.z, vx: 0, vy: 0, vz: 0 }, attacker, depth + 1);
        }
      }
    }
  }

  private stepPickups(): void {
    for (let i = 0; i < this.pickups.length; i++) {
      const st = this.pickups[i];
      if (!st.taken) continue;
      st.respawnT -= SIM_DT;
      if (st.respawnT <= 0) st.taken = false;
    }
    if (this.phase !== "playing") return;
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      for (let i = 0; i < MAP_PICKUPS.length; i++) {
        const st = this.pickupState(i);
        if (st.taken) continue;
        const def = MAP_PICKUPS[i];
        const d = Math.hypot(p.move.x - def.x, p.move.z - def.z);
        const dy = Math.abs(p.move.y - (def.y - 0.55));
        if (d > 1.0 || dy > 1.6) continue;
        if (!this.applyPickup(p, def.kind, def.weapon)) continue;
        st.taken = true;
        st.respawnT = def.respawn;
        this.events.onPickup({ playerId: p.id, i, kind: def.kind });
      }
    }
  }

  private pickupState(i: number): PickupState {
    while (this.pickups.length <= i) this.pickups.push({ taken: false, respawnT: 0 });
    return this.pickups[i];
  }

  private applyPickup(p: Player, kind: string, weapon?: number): boolean {
    switch (kind) {
      case "health":
        if (p.hp >= MAX_HEALTH) return false;
        p.hp = Math.min(MAX_HEALTH, p.hp + HEALTH_PICKUP_AMOUNT);
        return true;
      case "armor":
        if (p.armor >= MAX_ARMOR) return false;
        p.armor = Math.min(MAX_ARMOR, p.armor + ARMOR_PICKUP_AMOUNT);
        return true;
      case "grenade":
        if (p.grenades >= GRENADE_MAX) return false;
        p.grenades = Math.min(GRENADE_MAX, p.grenades + GRENADE_PICKUP_GIVE);
        return true;
      case "ammo": {
        // fill the current weapon, or the first owned non-pistol
        let w = p.weapon;
        if (WEAPONS[w].infinite) {
          w = STARTING_WEAPONS.find((id) => !WEAPONS[id].infinite && (p.weapons & (1 << id)) !== 0) ?? w;
        }
        if (WEAPONS[w].infinite) return false;
        if (p.reserve[w] >= WEAPONS[w].magSize * 4) return false;
        p.reserve[w] += AMMO_PICKUP_MAGS * WEAPONS[w].magSize;
        return true;
      }
      case "weapon": {
        if (weapon === undefined) return false;
        const had = (p.weapons & (1 << weapon)) !== 0;
        p.weapons |= 1 << weapon;
        p.weapon = weapon;
        p.reloadT = 0;
        p.mag[weapon] = WEAPONS[weapon].magSize;
        p.reserve[weapon] = (had ? p.reserve[weapon] : 0) + WEAPON_PICKUP_MAGS * WEAPONS[weapon].magSize;
        return true;
      }
      default:
        return false;
    }
  }

  private spawn(p: Player): void {
    const others = [...this.players.values()].filter((o) => o !== p && o.alive);
    let best = SPAWN_POINTS[0];
    let bestScore = -1;
    for (const sp of SPAWN_POINTS) {
      const score = others.length
        ? Math.min(...others.map((o) => Math.hypot(o.move.x - sp[0], o.move.z - sp[2])))
        : Math.random();
      if (score > bestScore) {
        bestScore = score;
        best = sp;
      }
    }
    p.move = { x: best[0], y: best[1], z: best[2], vy: 0, onGround: false };
    p.hp = MAX_HEALTH;
    p.armor = 0;
    p.alive = true;
    p.protectT = SPAWN_PROTECTION_SECONDS;
    p.grenades = GRENADE_START;
    p.grenadeCd = 0;
    p.weapon = STARTING_WEAPONS[0];
    p.weapons = 0;
    for (const w of STARTING_WEAPONS) p.weapons |= 1 << w;
    p.mag = WEAPONS.map((w) => w.magSize);
    p.reserve = WEAPONS.map((w) => (w.infinite ? Infinity : 0));
    p.reloadT = 0;
    p.cooldownT = 0;
    p.history.length = 0;
    // face the arena centre
    p.yaw = Math.atan2(best[0], best[2]);
    p.pitch = 0;
  }

  private startIntermission(): void {
    this.phase = "intermission";
    this.phaseLeft = INTERMISSION_SECONDS;
  }

  private startRound(): void {
    this.phase = "playing";
    this.phaseLeft = ROUND_SECONDS;
    this.resetWorld();
    for (const p of this.players.values()) {
      p.kills = 0;
      p.deaths = 0;
      p.queue.length = 0;
      this.spawn(p);
    }
  }

  /** Restore every prop and pickup for a fresh round. */
  private resetWorld(): void {
    this.props.resetAll();
    this.pickups.length = 0;
  }

  snapshot(): Snapshot {
    return {
      t: this.time,
      phase: this.phase,
      timeLeft: Math.max(0, this.phaseLeft),
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        x: p.move.x,
        y: p.move.y,
        z: p.move.z,
        vy: p.move.vy,
        og: p.move.onGround,
        yaw: p.yaw,
        pitch: p.pitch,
        hp: Math.round(p.hp),
        armor: Math.round(p.armor),
        alive: p.alive,
        weapon: p.weapon,
        weapons: p.weapons,
        ammo: p.mag[p.weapon],
        reserve: Number.isFinite(p.reserve[p.weapon]) ? p.reserve[p.weapon] : -1,
        grenades: p.grenades,
        skin: p.skin,
        kills: p.kills,
        deaths: p.deaths,
        ack: p.ack,
      })),
      props: this.props.snapshot(),
      grenades: this.grenades.snapshot(),
      pickupsTaken: this.pickups.flatMap((s, i) => (s.taken ? [i] : [])),
      propsGone: this.props.goneIndices(),
    };
  }
}
