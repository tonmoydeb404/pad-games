import { Room, type Client } from "@colyseus/core";
import {
  MAX_COMMANDS_PER_MESSAGE,
  MAX_PLAYERS,
  MSG_DAMAGED,
  MSG_EXPLOSION,
  MSG_HIT,
  MSG_INPUT,
  MSG_KILL,
  MSG_PICKUP,
  MSG_PROP_BROKEN,
  MSG_SHOT,
  MSG_SNAPSHOT,
  MSG_WELCOME,
  SIM_DT,
  SKINS,
  SNAPSHOT_RATE,
  initPhysics,
  type InputMessage,
  type WelcomeMessage,
} from "@pad/arena-shared";
import { ArenaGame } from "./ArenaGame";

export class ArenaRoom extends Room {
  maxClients = MAX_PLAYERS;
  private game!: ArenaGame;
  private sinceSnapshot = 0;

  async onCreate(): Promise<void> {
    await initPhysics();
    this.game = new ArenaGame({
      onKill: (e) => this.broadcast(MSG_KILL, e),
      onShot: (e) => this.broadcast(MSG_SHOT, e),
      onHit: (shooterId, victimId, amount, killed, ax, az) => {
        this.clients.getById(shooterId)?.send(MSG_HIT, { victim: victimId, killed });
        this.clients.getById(victimId)?.send(MSG_DAMAGED, { amount, ax, az });
      },
      onExplosion: (e) => this.broadcast(MSG_EXPLOSION, e),
      onPickup: (e) => this.broadcast(MSG_PICKUP, e),
      onPropBroken: (e) => this.broadcast(MSG_PROP_BROKEN, e),
    });

    this.onMessage(MSG_INPUT, (client: Client, msg: InputMessage) => {
      if (!msg || !Array.isArray(msg.cmds)) return;
      this.game.pushInput(client.sessionId, msg.cmds.slice(0, MAX_COMMANDS_PER_MESSAGE), msg.rt);
    });

    this.setSimulationInterval((dt) => {
      this.game.tick(dt);
      this.sinceSnapshot += dt;
      if (this.sinceSnapshot >= 1000 / SNAPSHOT_RATE - 1) {
        this.sinceSnapshot = 0;
        this.broadcast(MSG_SNAPSHOT, this.game.snapshot());
      }
    }, (SIM_DT * 1000) / 2);
  }

  onJoin(client: Client, options?: { name?: unknown; skin?: unknown }): void {
    const name = typeof options?.name === "string" ? options.name : "Player";
    const skin = typeof options?.skin === "number" ? options.skin : 0;
    const p = this.game.addPlayer(client.sessionId, name, Math.min(skin, SKINS.length - 1));
    const welcome: WelcomeMessage = { id: p.id, color: p.color, serverTime: this.game.time };
    client.send(MSG_WELCOME, welcome);
  }

  onLeave(client: Client): void {
    this.game.removePlayer(client.sessionId);
  }
}
