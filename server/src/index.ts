import { defineRoom, defineServer } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ROOM_NAME } from "@pad/arena-shared";
import { ArenaRoom } from "./ArenaRoom";

const port = Number(process.env.PORT ?? 2567);

const server = defineServer({
  transport: new WebSocketTransport(),
  rooms: { [ROOM_NAME]: defineRoom(ArenaRoom) },
});

await server.listen(port);
console.log(`[arena] listening on ws://localhost:${port}`);
