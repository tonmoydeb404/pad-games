import { ColyseusSDK, type Room } from "@colyseus/sdk";
import {
  GRENADE_MAX,
  MSG_DAMAGED,
  MSG_EXPLOSION,
  MSG_HIT,
  MSG_INPUT,
  MSG_KILL,
  MSG_PICKUP,
  MSG_PROP_BROKEN,
  MSG_SHOT,
  MSG_SNAPSHOT,
  RESPAWN_SECONDS,
  ROOM_NAME,
  SIM_DT,
  WEAPONS,
  aimDir,
  stepMove,
  type InputCommand,
  type InputMessage,
  type KillEvent,
  type MoveState,
  type PlayerSnapshot,
  type PropSnapshot,
  type ShotEvent,
  type Snapshot,
} from "@pad/arena-shared";
import { Emitter } from "@/game/core/events";
import { Loop } from "@/game/core/loop";
import { ArenaAudio } from "./audio";
import { ArenaInput } from "./input";
import { interpolate } from "./interp";
import { ArenaRenderer } from "./renderer";

const INTERP_DELAY_MS = 100;

export interface ScoreRow {
  id: string;
  name: string;
  kills: number;
  deaths: number;
  self: boolean;
}

export interface HudState {
  hp: number;
  armor: number;
  ammo: number;
  reserve: number;
  magSize: number;
  weaponName: string;
  weaponId: number;
  /** bitmask of owned weapons */
  weapons: number;
  grenades: number;
  alive: boolean;
  scoped: boolean;
  respawnIn: number;
  phase: "playing" | "intermission";
  timeLeft: number;
  rows: ScoreRow[];
}

export interface FeedEntry {
  killer: string;
  victim: string;
  weapon: string;
  involvesSelf: boolean;
}

export type ArenaEvents = {
  status: { state: "connecting" | "loading" | "connected" | "error" | "disconnected"; message?: string; progress?: number };
  hud: HudState;
  feed: FeedEntry;
  hitmarker: { killed: boolean };
  damaged: { amount: number; angle: number };
  lock: boolean;
  scoreboard: boolean;
};

export interface ArenaOptions {
  container: HTMLElement;
  serverUrl: string;
  name: string;
  skin: number;
  sensitivity: number;
  volume: number;
  fov: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class Arena {
  readonly events = new Emitter<ArenaEvents>();
  private renderer: ArenaRenderer;
  private input: ArenaInput;
  private audio = new ArenaAudio();
  private loop: Loop;
  private room: Room | null = null;
  private selfId = "";
  private destroyed = false;
  private assetsReady = false;

  private buffer: Snapshot[] = [];
  private offset = 0; // serverTime - performance.now()
  private haveOffset = false;
  private names = new Map<string, string>();
  private latest: Snapshot | null = null;
  private latestProps: PropSnapshot[] = [];
  private takenPickups: number[] = [];
  private goneProps: number[] = [];

  private pos: MoveState = { x: 0, y: 0, z: 0, vy: 0, onGround: false };
  private prev = { x: 0, y: 0, z: 0 };
  private spawned = false;
  private wasAlive = false;
  private deadAt = 0;
  private seq = 0;
  private pending: InputCommand[] = [];
  private outbox: InputCommand[] = [];
  private stepCount = 0;
  private fireCd = 0;
  private grenadeCd = 0;
  private localWeapon = 0;
  private scoped = false;
  private stepSpeed = 0;
  private hudTick = 0;

  constructor(private opts: ArenaOptions) {
    this.renderer = new ArenaRenderer(opts.container);
    this.input = new ArenaInput(this.renderer.canvas);
    this.input.sensitivity = opts.sensitivity;
    this.audio.volume = opts.volume;
    this.input.onLockChange = (l) => {
      if (l) this.audio.startAmbience();
      this.events.emit("lock", l);
    };
    this.input.onScoreboard = (s) => this.events.emit("scoreboard", s);
    this.loop = new Loop({
      update: () => this.update(),
      render: (alpha, dt) => this.render(alpha, dt),
    });
  }

  requestLock(): void {
    this.input.requestLock();
    // creating the AudioContext inside a user gesture
    this.audio.startAmbience();
  }

  setSensitivity(v: number): void {
    this.input.sensitivity = v;
  }

  setVolume(v: number): void {
    this.audio.setVolume(v);
  }

  async connect(): Promise<void> {
    this.events.emit("status", { state: "loading", progress: 0 });
    const ok = await this.renderer.loadAssets((frac) => {
      if (!this.destroyed) this.events.emit("status", { state: "loading", progress: frac });
    });
    this.assetsReady = ok;
    if (this.destroyed) return;
    this.renderer.setViewmodel(0);

    this.events.emit("status", { state: "connecting" });
    try {
      const client = new ColyseusSDK(this.opts.serverUrl);
      const room = await client.joinOrCreate(ROOM_NAME, { name: this.opts.name, skin: this.opts.skin });
      if (this.destroyed) {
        void room.leave();
        return;
      }
      this.room = room;
      this.selfId = room.sessionId;
      room.onMessage(MSG_SNAPSHOT, (s: Snapshot) => this.onSnapshot(s));
      room.onMessage(MSG_KILL, (e: KillEvent) => this.onKill(e));
      room.onMessage(MSG_SHOT, (e: ShotEvent) => this.onShot(e));
      room.onMessage(MSG_HIT, (e: { killed: boolean }) => {
        this.audio[e.killed ? "kill" : "hit"]();
        this.events.emit("hitmarker", { killed: e.killed });
      });
      room.onMessage(MSG_DAMAGED, (e: { amount: number; ax: number; az: number }) => {
        this.audio.damaged();
        this.renderer.addShake(Math.min(0.3, e.amount / 60));
        const dx = e.ax - this.pos.x;
        const dz = e.az - this.pos.z;
        // screen-space angle: 0 = ahead, π = behind
        const worldAngle = Math.atan2(dx, -dz);
        const rel = worldAngle - this.input.yaw;
        this.events.emit("damaged", { amount: e.amount, angle: rel });
      });
      room.onMessage(MSG_EXPLOSION, (e: { x: number; y: number; z: number }) => {
        const d = Math.hypot(e.x - this.pos.x, e.z - this.pos.z);
        this.renderer.explosionFX([e.x, e.y, e.z]);
        this.audio.explosion(d);
      });
      room.onMessage(MSG_PICKUP, (e: { playerId: string; kind: string }) => {
        if (e.playerId === this.selfId) {
          if (e.kind === "weapon") this.audio.weaponPickup();
          else this.audio.pickup();
        }
      });
      room.onMessage(MSG_PROP_BROKEN, (e: { i: number; x: number; y: number; z: number; explosive: boolean }) => {
        this.renderer.breakFX([e.x, e.y, e.z], e.explosive ? "barrel" : "target-large");
        if (!e.explosive) this.audio.hit();
      });
      room.onLeave(() => {
        if (!this.destroyed) this.events.emit("status", { state: "disconnected" });
      });
      room.onError((_code: number, message?: string) => {
        this.events.emit("status", { state: "error", message });
      });
      this.events.emit("status", { state: "connected" });
      this.loop.start();
    } catch (err) {
      this.events.emit("status", {
        state: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ---- network ----

  private onSnapshot(s: Snapshot): void {
    const now = performance.now();
    const sample = s.t - now;
    if (!this.haveOffset) {
      this.offset = sample;
      this.haveOffset = true;
    } else {
      // latency only ever delays a snapshot, so the true offset is the max sample
      this.offset = sample > this.offset ? sample : lerp(this.offset, sample, 0.05);
    }
    this.buffer.push(s);
    while (this.buffer.length > 2 && this.buffer[0].t < s.t - 1000) this.buffer.shift();
    this.latest = s;
    this.latestProps = s.props;
    this.takenPickups = s.pickupsTaken;
    this.goneProps = s.propsGone;
    for (const p of s.players) this.names.set(p.id, p.name);

    const me = s.players.find((p) => p.id === this.selfId);
    if (me) {
      this.reconcile(me);
      this.input.owned = me.weapons;
      this.input.setLastWeapon(me.weapon);
    }
    this.emitHud(s, me);
  }

  private reconcile(me: PlayerSnapshot): void {
    const respawned = me.alive && !this.wasAlive;
    if (!me.alive && this.wasAlive) this.deadAt = performance.now();
    this.wasAlive = me.alive;

    this.pending = this.pending.filter((c) => c.seq > me.ack);
    const st: MoveState = { x: me.x, y: me.y, z: me.z, vy: me.vy, onGround: me.og };
    for (const c of this.pending) stepMove(st, c, SIM_DT);

    const jump = Math.hypot(st.x - this.pos.x, st.z - this.pos.z) > 5;
    if (!this.spawned || respawned || jump) {
      this.input.yaw = me.yaw;
      this.input.pitch = 0;
      this.prev = { x: st.x, y: st.y, z: st.z };
      this.pending = [];
    } else {
      // keep the render interpolation continuous across small corrections
      this.prev.x += st.x - this.pos.x;
      this.prev.y += st.y - this.pos.y;
      this.prev.z += st.z - this.pos.z;
    }
    this.pos = st;
    this.spawned = true;
    this.renderer.setViewmodelVisible(me.alive);
  }

  private onKill(e: KillEvent): void {
    // cosmetic ragdoll for remote victims
    if (e.victim !== this.selfId) {
      this.renderer.ragdoll(e.victim, { x: e.ix, y: e.iy, z: e.iz });
    } else {
      this.renderer.addShake(0.25);
    }
    this.events.emit("feed", {
      killer: this.names.get(e.killer) ?? "?",
      victim: this.names.get(e.victim) ?? "?",
      weapon: e.killer === e.victim ? "grenade" : (WEAPONS[e.weapon]?.name ?? ""),
      involvesSelf: e.killer === this.selfId || e.victim === this.selfId,
    });
  }

  private onShot(e: ShotEvent): void {
    const self = e.shooter === this.selfId;
    let from = e.from;
    if (self) {
      // draw the tracer from the viewmodel muzzle rather than the eye
      const f = aimDir(this.input.yaw, this.input.pitch);
      const r = [Math.cos(this.input.yaw), 0, -Math.sin(this.input.yaw)];
      from = [
        e.from[0] + r[0] * 0.22 + f[0] * 0.5,
        e.from[1] - 0.18 + f[1] * 0.5,
        e.from[2] + r[2] * 0.22 + f[2] * 0.5,
      ];
    } else if (Math.hypot(e.from[0] - this.pos.x, e.from[2] - this.pos.z) < 35) {
      this.audio.shoot(e.weapon);
    }
    this.renderer.addTracers(from, e.to);
    // impact FX at the shot endpoints
    for (const end of e.to) this.renderer.impactFX(end);
  }

  private emitHud(s: Snapshot, me: PlayerSnapshot | undefined): void {
    // ~10 Hz to React
    if (++this.hudTick % 2 !== 0 && s.phase === "playing") return;
    const rows = s.players
      .map((p) => ({ id: p.id, name: p.name, kills: p.kills, deaths: p.deaths, self: p.id === this.selfId }))
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    const def = WEAPONS[me?.weapon ?? 0];
    this.events.emit("hud", {
      hp: me?.hp ?? 0,
      armor: me?.armor ?? 0,
      ammo: me?.ammo ?? 0,
      reserve: me?.reserve ?? 0,
      magSize: def.magSize,
      weaponName: def.name,
      weaponId: me?.weapon ?? 0,
      weapons: me?.weapons ?? 0b11,
      grenades: me?.grenades ?? 0,
      alive: me?.alive ?? true,
      scoped: this.scoped,
      respawnIn: me && !me.alive ? Math.max(0, RESPAWN_SECONDS - (performance.now() - this.deadAt) / 1000) : 0,
      phase: s.phase,
      timeLeft: s.timeLeft,
      rows,
    });
  }

  // ---- loop ----

  private renderTime(): number {
    return performance.now() + this.offset - INTERP_DELAY_MS;
  }

  private update(): void {
    if (!this.spawned || !this.room) return;
    this.fireCd = Math.max(0, this.fireCd - SIM_DT);
    this.grenadeCd = Math.max(0, this.grenadeCd - SIM_DT);
    if (!this.wasAlive) return;

    const s = this.input.sample();
    if (s.weapon >= 0 && s.weapon < WEAPONS.length && (this.input.owned & (1 << s.weapon)) !== 0) {
      this.localWeapon = s.weapon;
      this.renderer.setViewmodel(s.weapon);
    }
    const swayed = this.input.takeMouseDelta();
    this.renderer.sway(swayed.dx, swayed.dy);
    const wantScope = s.zoom && WEAPONS[this.localWeapon].scope === true;
    if (wantScope !== this.scoped) {
      this.scoped = wantScope;
      this.renderer.setZoomed(wantScope);
    }
    const cmd: InputCommand = {
      seq: ++this.seq,
      mx: s.mx,
      mz: s.mz,
      yaw: this.input.yaw,
      pitch: this.input.pitch,
      jump: s.jump,
      fire: s.fire && !(wantScope && WEAPONS[this.localWeapon].scope === true && !this.assetsReady),
      reload: s.reload,
      weapon: s.weapon,
      throw: s.throw,
      zoom: s.zoom,
    };
    const px = this.pos.x;
    const pz = this.pos.z;
    this.prev = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
    stepMove(this.pos, cmd, SIM_DT);
    this.stepSpeed = Math.hypot(this.pos.x - px, this.pos.z - pz) / SIM_DT;
    this.pending.push(cmd);
    this.outbox.push(cmd);

    const me = this.latest?.players.find((p) => p.id === this.selfId);
    const phase = this.latest?.phase;
    if (s.throw && this.grenadeCd <= 0 && me && me.grenades > 0 && phase === "playing") {
      this.grenadeCd = 0.8;
      this.audio.throwGrenade();
    }

    if (s.reload && me && me.ammo < WEAPONS[this.localWeapon].magSize) {
      this.renderer.viewmodelReload(WEAPONS[this.localWeapon].reloadSeconds);
      this.audio.reload();
    }

    if (s.fire && this.fireCd <= 0) {
      if (me && me.ammo > 0 && phase === "playing") {
        this.fireCd = WEAPONS[this.localWeapon].cooldown;
        this.renderer.muzzleFlash();
        this.audio.shoot(this.localWeapon);
      } else if (me && me.ammo <= 0) {
        this.fireCd = 0.3;
        this.audio.empty();
      }
    }

    this.audio.updateFootsteps(this.stepSpeed, SIM_DT, this.pos.onGround);

    if (++this.stepCount % 2 === 0) this.flush();
  }

  private flush(): void {
    if (!this.outbox.length || !this.room) return;
    const msg: InputMessage = { cmds: this.outbox, rt: this.renderTime() };
    this.room.send(MSG_INPUT, msg);
    this.outbox = [];
  }

  private render(alpha: number, dt: number): void {
    const players = interpolate(this.buffer, this.renderTime());
    this.renderer.syncPlayers(players, this.selfId);
    this.renderer.syncProps(this.latestProps, this.goneProps);
    if (this.latest) {
      this.renderer.syncGrenades(this.latest.grenades);
      this.renderer.syncPickupsTaken(this.takenPickups);
    }
    this.renderer.update(dt);
    const me = this.latest?.players.find((p) => p.id === this.selfId);
    this.renderer.render(
      lerp(this.prev.x, this.pos.x, alpha),
      lerp(this.prev.y, this.pos.y, alpha),
      lerp(this.prev.z, this.pos.z, alpha),
      this.input.yaw,
      this.input.pitch,
      me ? Math.hypot(me.x - this.prev.x, me.z - this.prev.z) : 0,
    );
  }

  destroy(): void {
    this.destroyed = true;
    this.loop.stop();
    void this.room?.leave();
    this.room = null;
    this.input.destroy();
    this.renderer.destroy();
    this.audio.destroy();
    this.events.clear();
  }
}

export async function createArena(opts: ArenaOptions): Promise<Arena> {
  const arena = new Arena(opts);
  return arena;
}
