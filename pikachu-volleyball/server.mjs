import http from "http";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import { PikachuVolleyballSim } from "./game-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3847;
const TICK_RATE = 60;
const TICK_MS = 1000 / TICK_RATE;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
};

function getLocalAddresses() {
  const ips = new Set(["127.0.0.1"]);
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const iface of list || []) {
      if (iface.family === "IPv4" && !iface.internal) ips.add(iface.address);
    }
  }
  return [...ips];
}

function serveStatic(req, res) {
  let urlPath = req.url.split("?")[0];
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.join(__dirname, urlPath.replace(/^\//, ""));
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

const clients = new Map();
let hostId = null;
let sim = null;
let tickTimer = null;
let gameRunning = false;

function lobbyPayload() {
  const players = [];
  for (const [id, c] of clients) {
    players.push({
      id,
      name: c.name,
      slot: c.slot,
      isHost: id === hostId,
    });
  }
  players.sort((a, b) => (a.slot || 99) - (b.slot || 99));
  const occupied = players.filter((p) => p.slot).length;
  return {
    players,
    occupied,
    canStart: occupied >= 2 && !gameRunning,
    gameRunning,
    hostId,
  };
}

function broadcast(msg, except = null) {
  const raw = JSON.stringify(msg);
  for (const [id, c] of clients) {
    if (id === except) continue;
    if (c.ws.readyState === 1) c.ws.send(raw);
  }
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function stopGameLoop() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
  gameRunning = false;
  sim = null;
}

function startGameLoop() {
  stopGameLoop();
  sim = new PikachuVolleyballSim();
  sim.startMatch();
  gameRunning = true;

  tickTimer = setInterval(() => {
    if (!sim || !gameRunning) return;

    for (const [, c] of clients) {
      if (c.slot) sim.setPlayerInput(c.slot, c.input);
    }

    const result = sim.tick(TICK_MS / 1000);
    const snapshot = sim.getSnapshot();

    broadcast({ type: "game", ...snapshot });

    if (result?.gameOver) {
      const st = sim.state;
      broadcast({
        type: "ended",
        winner: result.winner,
        scoreA: st.scoreA,
        scoreB: st.scoreB,
      });
      stopGameLoop();
      broadcast({ type: "lobby", ...lobbyPayload() });
    }
  }, TICK_MS);
}

function assignHost() {
  const first = clients.keys().next().value;
  hostId = first ?? null;
}

function handleJoin(ws, data) {
  const id = crypto.randomUUID();
  const name = String(data.name || "플레이어").slice(0, 16);
  let slot = data.slot ? Number(data.slot) : null;
  if (slot && (slot < 1 || slot > 4 || slotTaken(slot, id))) slot = null;

  if (!hostId) hostId = id;

  clients.set(id, {
    ws,
    id,
    name,
    slot,
    input: { left: false, right: false, jump: false, thunder: false },
  });

  const lobby = lobbyPayload();
  send(ws, {
    type: "welcome",
    clientId: id,
    hostId,
    slot,
    addresses: getLocalAddresses(),
    port: PORT,
    lobby,
  });
  broadcast({ type: "lobby", ...lobby });
  return id;
}

function slotTaken(slot, exceptId) {
  for (const [id, c] of clients) {
    if (id !== exceptId && c.slot === slot) return true;
  }
  return false;
}

function handleMessage(ws, raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }

  const client = [...clients.values()].find((c) => c.ws === ws);
  if (!client && data.type !== "join") return;

  switch (data.type) {
    case "join": {
      if (gameRunning) {
        send(ws, { type: "error", message: "게임 진행 중입니다. 잠시 후 다시 접속하세요." });
        return;
      }
      handleJoin(ws, data);
      break;
    }
    case "pickSlot": {
      if (gameRunning) return;
      const slot = Number(data.slot);
      if (slot < 1 || slot > 4 || slotTaken(slot, client.id)) {
        send(ws, { type: "error", message: "이미 사용 중인 슬롯입니다." });
        return;
      }
      client.slot = slot;
      send(ws, { type: "slot", slot });
      broadcast({ type: "lobby", ...lobbyPayload() });
      break;
    }
    case "input": {
      if (!client.slot || !gameRunning) return;
      client.input = {
        left: !!data.left,
        right: !!data.right,
        jump: !!data.jump,
        thunder: !!data.thunder,
      };
      break;
    }
    case "start": {
      if (client.id !== hostId || gameRunning) return;
      const occupied = [...clients.values()].filter((c) => c.slot).length;
      if (occupied < 2) {
        send(ws, { type: "error", message: "최소 2명이 슬롯을 선택해야 합니다." });
        return;
      }
      broadcast({ type: "started" });
      startGameLoop();
      break;
    }
    case "stop": {
      if (client.id !== hostId) return;
      stopGameLoop();
      broadcast({ type: "lobby", ...lobbyPayload() });
      break;
    }
    default:
      break;
  }
}

function handleClose(ws) {
  const entry = [...clients.entries()].find(([, c]) => c.ws === ws);
  if (!entry) return;
  const [id] = entry;
  clients.delete(id);
  if (hostId === id) assignHost();
  if (clients.size === 0) stopGameLoop();
  broadcast({ type: "lobby", ...lobbyPayload() });
}

const server = http.createServer(serveStatic);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  ws.on("message", (raw) => handleMessage(ws, raw.toString()));
  ws.on("close", () => handleClose(ws));
});

server.listen(PORT, "0.0.0.0", () => {
  const ips = getLocalAddresses().filter((ip) => ip !== "127.0.0.1");
  console.log("\n⚡ 피카츄배구 4인 — 네트워크 서버");
  console.log(`   로컬:  http://127.0.0.1:${PORT}`);
  for (const ip of ips) console.log(`   LAN:   http://${ip}:${PORT}`);
  console.log("\n   다른 PC에서는 위 LAN 주소로 접속하세요.\n");
});
