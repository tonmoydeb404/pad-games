/** Headless check: N bots join, wander and shoot each other. `pnpm --filter @pad/arena-server smoke [bots] [seconds]` */
import { ColyseusSDK } from "@colyseus/sdk";
import {
  MSG_INPUT, MSG_KILL, MSG_SNAPSHOT, ROOM_NAME, type InputCommand, type Snapshot,
} from "@pad/arena-shared";

const bots = Number(process.argv[2] ?? 2);
const seconds = Number(process.argv[3] ?? 6);
const url = process.env.ARENA_URL ?? "ws://localhost:2567";
let snaps = 0;
let kills = 0;
let maxAck = 0;

async function bot(i: number) {
  const room = await new ColyseusSDK(url).joinOrCreate(ROOM_NAME, { name: `bot${i}` });
  let seq = 0;
  let latest: Snapshot | null = null;
  room.onMessage(MSG_SNAPSHOT, (s: Snapshot) => {
    latest = s;
    if (i === 0) snaps++;
    const me = s.players.find((p) => p.id === room.sessionId);
    if (me) maxAck = Math.max(maxAck, me.ack);
  });
  room.onMessage(MSG_KILL, () => { if (i === 0) kills++; });
  const timer = setInterval(() => {
    const s = latest as Snapshot | null;
    const me = s?.players.find((p) => p.id === room.sessionId);
    if (!s || !me) return;
    const target = s.players.find((p) => p.id !== me.id && p.alive);
    let yaw = me.yaw, pitch = 0;
    if (target) {
      const dx = target.x - me.x, dz = target.z - me.z;
      yaw = Math.atan2(-dx, -dz);
      pitch = Math.atan2(target.y + 1.2 - (me.y + 1.62), Math.hypot(dx, dz));
    }
    const cmds: InputCommand[] = [];
    for (let k = 0; k < 2; k++)
      cmds.push({ seq: ++seq, mx: Math.sin(Date.now() / 700 + i), mz: 0.3, yaw, pitch, jump: false, fire: true, reload: false, weapon: -1 });
    room.send(MSG_INPUT, { cmds, rt: s.t - 100 });
  }, 1000 / 30);
  return () => { clearInterval(timer); void room.leave(); };
}

const stops = await Promise.all(Array.from({ length: bots }, (_, i) => bot(i)));
await new Promise((r) => setTimeout(r, seconds * 1000));
stops.forEach((s) => s());
console.log(`bots=${bots} snapshots/s=${(snaps / seconds).toFixed(1)} kills=${kills} maxAck=${maxAck}`);
process.exit(0);
