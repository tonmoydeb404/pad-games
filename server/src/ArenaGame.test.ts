import { beforeAll, describe, expect, it, vi } from "vitest";
import { MAP_PICKUPS, WEAPONS, initPhysics, type InputCommand } from "@pad/arena-shared";
import { ArenaGame } from "./ArenaGame";

beforeAll(async () => {
  await initPhysics();
});

const cmd = (seq: number, over: Partial<InputCommand> = {}): InputCommand => ({
  seq, mx: 0, mz: 0, yaw: 0, pitch: 0, jump: false, fire: false, reload: false, weapon: -1, throw: false, zoom: false, ...over,
});

describe("ArenaGame", () => {
  it("kills a player standing in front of the shooter", () => {
    const onKill = vi.fn();
    const g = new ArenaGame({ onKill, onShot: () => {}, onHit: () => {}, onExplosion: () => {}, onPickup: () => {}, onPropBroken: () => {} });
    const a = g.addPlayer("a", "A");
    const b = g.addPlayer("b", "B");
    // NW room is open ground: b directly ahead (-z) of a, no spawn protection
    a.move = { x: -11, y: 0.01, z: -11.5, vy: 0, onGround: true };
    b.move = { x: -11, y: 0.01, z: -12.5, vy: 0, onGround: true };
    a.protectT = b.protectT = 0;
    let seq = 0;
    for (let i = 0; i < 400 && b.alive; i++) {
      g.pushInput("a", [cmd(++seq, { fire: true, yaw: 0, pitch: 0.0 })], g.time);
      g.pushInput("b", [cmd(seq)], g.time);
      g.tick(1000 / 60);
      a.move.x = -11; a.move.z = -11.5;
      b.move.x = -11; b.move.z = -12.5;
    }
    expect(b.alive).toBe(false);
    expect(a.kills).toBe(1);
    expect(onKill).toHaveBeenCalledOnce();
  });

  it("grants health from a potion pickup and respawns it", () => {
    const picked: string[] = [];
    const g = new ArenaGame({
      onKill: () => {},
      onShot: () => {},
      onHit: () => {},
      onExplosion: () => {},
      onPickup: (e) => picked.push(e.kind),
      onPropBroken: () => {},
    });
    const p = g.addPlayer("p", "P");
    // damage down to 50
    p.hp = 50;
    p.armor = 0;
    // dais health pickup at (0, 1.45, 0)
    p.move = { x: 0, y: 0.9, z: 0, vy: 0, onGround: true };
    p.protectT = 0;
    g.tick(1000 / 60);
    expect(p.hp).toBe(90);
    expect(picked).toContain("health");
    // taken: a second tick grants nothing
    p.hp = 50;
    g.tick(1000 / 60);
    expect(p.hp).toBe(50);
    // after the 15 s respawn it works again (tick() clamps at 250 ms/call)
    p.move.x = 30; // walk away (can't re-collect while standing on it)
    for (let i = 0; i < 64; i++) g.tick(250);
    p.move = { x: 0, y: 0.9, z: 0, vy: 0, onGround: true };
    g.tick(1000 / 60);
    expect(p.hp).toBe(90);
  });

  it("grants a weapon from a crate pickup and blocks unowned switches", () => {
    const g = new ArenaGame({
      onKill: () => {},
      onShot: () => {},
      onHit: () => {},
      onExplosion: () => {},
      onPickup: () => {},
      onPropBroken: () => {},
    });
    const p = g.addPlayer("p", "P");
    // sniper crate in the SE room at tile (16,21) → world (9, 19)
    p.move = { x: 9, y: 0.01, z: 19, vy: 0, onGround: true };
    g.tick(1000 / 60);
    expect(p.weapons & (1 << 4)).not.toBe(0);
    expect(p.weapon).toBe(4);
    expect(p.mag[4]).toBe(WEAPONS[4].magSize);
    // dying resets the loadout
    p.alive = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (g as any).spawn(p);
    expect(p.weapons & (1 << 4)).toBe(0);
  });

  it("damages players with a grenade blast", () => {
    const g = new ArenaGame({
      onKill: () => {},
      onShot: () => {},
      onHit: () => {},
      onExplosion: () => {},
      onPickup: () => {},
      onPropBroken: () => {},
    });
    const a = g.addPlayer("a", "A");
    const b = g.addPlayer("b", "B");
    a.protectT = b.protectT = 0;
    // open ground in the middle strip; b stands where the grenade comes to rest
    a.move = { x: 1, y: 0.01, z: -16, vy: 0, onGround: true };
    b.move = { x: 1, y: 0.01, z: -5, vy: 0, onGround: true };
    let seq = 0;
    let blasts = 0;
    // throw once, then wait out the fuse
    for (let i = 0; i < 400; i++) {
      g.pushInput("a", [cmd(++seq, { throw: i === 1, yaw: Math.PI, pitch: 0.1 })], g.time);
      g.pushInput("b", [cmd(seq)], g.time);
      const before = g.grenades.all.length;
      g.tick(1000 / 60);
      if (before > 0 && g.grenades.all.length === 0) blasts++;
      a.move.x = 1; a.move.z = -16; a.move.y = 0.01;
      b.move.x = 1; b.move.z = -5; b.move.y = 0.01;
      if (blasts > 0) break;
    }
    expect(blasts).toBe(1);
    // the grenade settles within ~1 m of b: near-full 85 damage
    expect(b.hp).toBeLessThan(100);
    expect(b.hp).toBeGreaterThan(0);
  });
});
