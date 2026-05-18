import type { Server as HttpServer } from "node:http";
import { randomBytes } from "node:crypto";
import express from "express";
import { createServer } from "node:http";
import cors from "cors";
import { Server } from "socket.io";
import {
  createOnlineInitialState,
  transitionConfirmTax,
  transitionPass,
  transitionPlayCards,
  transitionProceedFromRoundEnd,
} from "../src/lib/gameTransitions";
import type { GameState } from "../src/types/game";

const PORT = Number(process.env.PORT) || 3333;
const FRONTEND_ORIGINS = (
  process.env.FRONTEND_ORIGIN ??
  "http://localhost:3000,http://127.0.0.1:3000"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

type Room = {
  code: string;
  hostSocketId: string;
  seats: (string | null)[];
  names: (string | null)[];
  game: GameState | null;
};

const rooms = new Map<string, Room>();

function makeRoomCode(): string {
  return randomBytes(3).toString("hex").toUpperCase();
}

function getRoomBySocket(socketId: string): Room | undefined {
  for (const room of rooms.values()) {
    if (room.seats.includes(socketId)) return room;
  }
  return undefined;
}

let io: Server;

function broadcastGame(room: Room) {
  if (!room.game) return;
  for (let seat = 0; seat < 4; seat++) {
    const sid = room.seats[seat];
    if (!sid) continue;
    const stripped: GameState = {
      ...room.game,
      players: room.game.players.map((p) => ({ ...p, hand: [] })),
    };
    io.to(sid).emit("game-sync", {
      state: stripped,
      mySeatIndex: seat,
      myHand: room.game.players[seat].hand,
    });
  }
}

function emitLobby(code: string) {
  const room = rooms.get(code);
  if (!room) return;
  io.to(code).emit("room-lobby", {
    roomCode: code,
    members: room.seats.map((sid, i) => ({
      seatIndex: i,
      name: room.names[i],
      connected: !!sid,
    })),
    hostSocketId: room.hostSocketId,
  });
}

const app = express();
app.use(
  cors({
    origin: FRONTEND_ORIGINS,
    credentials: true,
  }),
);
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const httpServer: HttpServer = createServer(app);
io = new Server(httpServer, {
  cors: {
    origin: FRONTEND_ORIGINS,
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  socket.on(
    "create-room",
    (payload: { name: string }, ack: (r: unknown) => void) => {
      const name = payload?.name?.trim() || "플레이어";
      let code = makeRoomCode();
      while (rooms.has(code)) code = makeRoomCode();

      const room: Room = {
        code,
        hostSocketId: socket.id,
        seats: [socket.id, null, null, null],
        names: [name, null, null, null],
        game: null,
      };
      rooms.set(code, room);
      socket.join(code);
      socket.data.roomCode = code;
      socket.data.seat = 0;
      ack({ ok: true, roomCode: code, seatIndex: 0 });
      emitLobby(code);
    },
  );

  socket.on(
    "join-room",
    (
      payload: { code: string; name: string },
      ack: (r: unknown) => void,
    ) => {
      const raw = payload?.code?.trim().toUpperCase();
      const name = payload?.name?.trim() || "플레이어";
      const room = raw ? rooms.get(raw) : undefined;
      if (!room || room.game) {
        ack({ ok: false, error: room?.game ? "ALREADY_STARTED" : "NOT_FOUND" });
        return;
      }
      const idx = room.seats.findIndex((s) => s === null);
      if (idx === -1) {
        ack({ ok: false, error: "FULL" });
        return;
      }
      room.seats[idx] = socket.id;
      room.names[idx] = name;
      socket.join(raw);
      socket.data.roomCode = raw;
      socket.data.seat = idx;
      ack({ ok: true, roomCode: raw, seatIndex: idx });
      emitLobby(raw);
    },
  );

  socket.on("start-game", (_payload: unknown, ack: (r: unknown) => void) => {
    const room = getRoomBySocket(socket.id);
    if (!room || socket.id !== room.hostSocketId) {
      ack({ ok: false, error: "FORBIDDEN" });
      return;
    }
    if (room.seats.some((s) => s === null)) {
      ack({ ok: false, error: "NOT_FULL" });
      return;
    }
    const displayNames = room.names.map(
      (n, i) => n?.trim() || `플레이어 ${i + 1}`,
    );
    const init = createOnlineInitialState(displayNames);
    if (!init.ok) {
      ack({ ok: false, error: "INIT_FAIL" });
      return;
    }
    room.game = {
      ...init.state,
      mode: "online",
      mySeatIndex: null,
    };
    room.game.players = room.game.players.map((p) => ({
      ...p,
      isHuman: true,
    }));
    broadcastGame(room);
    ack({ ok: true });
  });

  socket.on(
    "game:play",
    (
      payload: { cardIds: string[] },
      ack: (r: unknown) => void,
    ) => {
      const room = getRoomBySocket(socket.id);
      const seat = socket.data.seat as number | undefined;
      if (!room?.game || seat === undefined || room.game.phase !== "playing") {
        ack({ ok: false, error: "BAD_STATE" });
        return;
      }
      if (room.seats[seat] !== socket.id) {
        ack({ ok: false, error: "SEAT" });
        return;
      }
      const playerId = `player-${seat}`;
      const hand = room.game.players[seat].hand;
      const ids = new Set(payload.cardIds);
      const cards = hand.filter((c) => ids.has(c.id));
      const res = transitionPlayCards(room.game, playerId, cards);
      if (!res.ok) {
        ack({ ok: false, error: res.code });
        return;
      }
      room.game = { ...res.state, mode: "online", mySeatIndex: null };
      broadcastGame(room);
      ack({ ok: true });
    },
  );

  socket.on("game:pass", (_payload: unknown, ack: (r: unknown) => void) => {
    const room = getRoomBySocket(socket.id);
    const seat = socket.data.seat as number | undefined;
    if (!room?.game || seat === undefined || room.game.phase !== "playing") {
      ack({ ok: false, error: "BAD_STATE" });
      return;
    }
    const playerId = `player-${seat}`;
    const res = transitionPass(room.game, playerId);
    if (!res.ok) {
      ack({ ok: false, error: res.code });
      return;
    }
    room.game = { ...res.state, mode: "online", mySeatIndex: null };
    broadcastGame(room);
    ack({ ok: true });
  });

  socket.on(
    "game:tax",
    (payload: { cardIds: string[] }, ack: (r: unknown) => void) => {
      const room = getRoomBySocket(socket.id);
      const seat = socket.data.seat as number | undefined;
      if (!room?.game || seat === undefined || room.game.phase !== "tax") {
        ack({ ok: false, error: "BAD_STATE" });
        return;
      }
      const playerId = `player-${seat}`;
      const hand = room.game.players[seat].hand;
      const ids = new Set(payload.cardIds);
      const cards = hand.filter((c) => ids.has(c.id));
      const res = transitionConfirmTax(room.game, playerId, cards);
      if (!res.ok) {
        ack({ ok: false, error: res.code });
        return;
      }
      room.game = { ...res.state, mode: "online", mySeatIndex: null };
      broadcastGame(room);
      ack({ ok: true });
    },
  );

  socket.on("game:next-round", (_payload: unknown, ack: (r: unknown) => void) => {
    const room = getRoomBySocket(socket.id);
    if (!room?.game || room.game.phase !== "roundEnd") {
      ack({ ok: false, error: "BAD_STATE" });
      return;
    }
    const res = transitionProceedFromRoundEnd(room.game);
    if (!res.ok) {
      ack({ ok: false, error: res.code });
      return;
    }
    room.game = { ...res.state, mode: "online", mySeatIndex: null };
    broadcastGame(room);
    ack({ ok: true });
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode as string | undefined;
    const seat = socket.data.seat as number | undefined;
    if (!code || seat === undefined) return;

    const room = rooms.get(code);
    if (!room) return;

    if (socket.id === room.hostSocketId && !room.game) {
      rooms.delete(code);
      io.to(code).emit("session-ended", { reason: "host-left" });
      return;
    }

    if (room.game) {
      io.to(code).emit("session-ended", { reason: "player-left" });
      rooms.delete(code);
      return;
    }

    room.seats[seat] = null;
    room.names[seat] = null;
    emitLobby(code);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Dalmuti multiplayer server http://localhost:${PORT}`);
});
