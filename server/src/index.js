import colyseus from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { monitor } from "@colyseus/monitor";
import express from "express";
import { createServer } from "http";
const { Server } = colyseus.default || colyseus;
import { ArenaRoom } from "./ArenaRoom.js";
import { NET } from "../../shared/index.js";

const PORT = Number(process.env.PORT || 2567);

const app = express();
app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.use("/colyseus", monitor());

const httpServer = createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// v0.0.3.4: фильтр по lobbyId — игроки вводят одинаковое число → попадают в одну комнату
gameServer.define(NET.ROOM_NAME, ArenaRoom).filterBy(["lobbyId"]);

gameServer.listen(PORT).then(() => {
  console.log(`[server] Rrrrrrain listening on :${PORT}`);
  console.log(`[server] monitor: http://localhost:${PORT}/colyseus`);
});
