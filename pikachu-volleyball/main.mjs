import {
  PikachuVolleyballSim,
  getPlayerControls,
  WIN_SCORE,
} from "./game-core.mjs";
import { createRenderer } from "./render.mjs";

const canvas = document.getElementById("game");
const scoreAEl = document.getElementById("scoreA");
const scoreBEl = document.getElementById("scoreB");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayBody = document.getElementById("overlayBody");
const lobbyPanel = document.getElementById("lobbyPanel");
const gamePanel = document.getElementById("gamePanel");
const startBtn = document.getElementById("startBtn");
const connectBtn = document.getElementById("connectBtn");
const hostStartBtn = document.getElementById("hostStartBtn");
const playerNameInput = document.getElementById("playerName");
const serverHostInput = document.getElementById("serverHost");
const slotPicker = document.getElementById("slotPicker");
const lobbyList = document.getElementById("lobbyList");
const netStatus = document.getElementById("netStatus");
const modeLocalBtn = document.getElementById("modeLocal");
const modeOnlineBtn = document.getElementById("modeOnline");
const hostHint = document.getElementById("hostHint");
const myControlsEl = document.getElementById("myControls");

const renderer = createRenderer(canvas);
const keys = Object.create(null);

let mode = "local";
let sim = null;
let ws = null;
let clientId = null;
let hostId = null;
let mySlot = null;
let onlineSnapshot = null;
let inputInterval = null;
let last = performance.now();

const NET_INPUT = {
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  jump: ["KeyW", "ArrowUp", "Space"],
  thunder: ["KeyS", "ArrowDown"],
};

function isNetKey(codes) {
  return codes.some((c) => keys[c]);
}

function getNetInput() {
  return {
    left: isNetKey(NET_INPUT.left),
    right: isNetKey(NET_INPUT.right),
    jump: isNetKey(NET_INPUT.jump),
    thunder: isNetKey(NET_INPUT.thunder),
  };
}

function defaultServerHost() {
  const { protocol, hostname, port } = window.location;
  if (protocol.startsWith("http") && hostname) {
    return hostname + (port ? `:${port}` : "");
  }
  return "127.0.0.1:3847";
}

serverHostInput.value = defaultServerHost();

window.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
    e.preventDefault();
  }
  if (mode === "online" && ws?.readyState === 1) {
    ws.send(JSON.stringify({ type: "input", ...getNetInput() }));
  }
});
window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
  if (mode === "online" && ws?.readyState === 1) {
    ws.send(JSON.stringify({ type: "input", ...getNetInput() }));
  }
});

function setMode(next) {
  mode = next;
  modeLocalBtn.classList.toggle("active", mode === "local");
  modeOnlineBtn.classList.toggle("active", mode === "online");
  lobbyPanel.classList.toggle("hidden", mode !== "online");
  gamePanel.classList.toggle("hidden", mode !== "local");
  hostStartBtn.classList.toggle("hidden", mode !== "online");
  startBtn.classList.toggle("hidden", mode !== "local");
  updateControlsHelp();
}

function updateControlsHelp() {
  if (mode === "online" && mySlot) {
    myControlsEl.innerHTML =
      `<strong>내 캐릭터: P${mySlot}</strong> — ` +
      `<kbd>W</kbd>/<kbd>↑</kbd> 점프 · <kbd>A</kbd><kbd>D</kbd> 이동 · <kbd>S</kbd>/<kbd>↓</kbd> 번개`;
  } else if (mode === "online") {
    myControlsEl.textContent = "슬롯(P1~P4)을 선택한 뒤 플레이하세요.";
  } else {
    myControlsEl.innerHTML = document.getElementById("localControlsHelp").innerHTML;
  }
}

function updateScoreHUD(scoreA, scoreB) {
  scoreAEl.textContent = scoreA;
  scoreBEl.textContent = scoreB;
}

function showOverlay(title, html, showStart = true) {
  overlay.classList.remove("hidden");
  overlayTitle.textContent = title;
  overlayBody.innerHTML = html;
  startBtn.classList.toggle("hidden", mode !== "local" || !showStart);
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

function wsUrlFromHost(hostStr) {
  let h = hostStr.trim();
  if (!h) h = "127.0.0.1:3847";
  if (!h.includes("://")) h = "ws://" + h;
  else if (h.startsWith("http://")) h = "ws://" + h.slice(7);
  else if (h.startsWith("https://")) h = "wss://" + h.slice(8);
  const u = new URL(h);
  if (!u.port) u.port = "3847";
  u.pathname = "/";
  return u.toString().replace(/\/$/, "");
}

function renderLobby(data) {
  hostId = data.hostId;
  const isHost = clientId === hostId;
  hostHint.textContent = isHost
    ? "당신이 방장입니다. 2명 이상 모이면 게임 시작을 누르세요."
    : "방장이 게임을 시작할 때까지 대기하세요.";
  hostStartBtn.classList.toggle("hidden", !isHost || data.gameRunning);
  hostStartBtn.disabled = !data.canStart;

  lobbyList.innerHTML = data.players
    .map((p) => {
      const slot = p.slot ? `P${p.slot}` : "—";
      const tag = p.isHost ? " 👑" : "";
      const me = p.id === clientId ? " (나)" : "";
      return `<li>${slot} · ${escapeHtml(p.name)}${me}${tag}</li>`;
    })
    .join("");

  if (!data.players.some((p) => p.id === clientId && p.slot)) {
    slotPicker.querySelectorAll("button").forEach((b) => (b.disabled = false));
  }
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function connectOnline() {
  if (inputInterval) {
    clearInterval(inputInterval);
    inputInterval = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
  const name = playerNameInput.value.trim() || "플레이어";
  const url = wsUrlFromHost(serverHostInput.value);
  netStatus.textContent = "접속 중…";
  netStatus.className = "status connecting";

  ws = new WebSocket(url);

  ws.onopen = () => {
    netStatus.textContent = "연결됨";
    netStatus.className = "status ok";
    const picked = slotPicker.querySelector(".selected");
    ws.send(
      JSON.stringify({
        type: "join",
        name,
        slot: picked ? Number(picked.dataset.slot) : null,
      })
    );
    inputInterval = setInterval(() => {
      if (ws?.readyState === 1 && mySlot) {
        ws.send(JSON.stringify({ type: "input", ...getNetInput() }));
      }
    }, 50);
  };

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    switch (msg.type) {
      case "welcome":
        clientId = msg.clientId;
        hostId = msg.hostId;
        mySlot = msg.slot;
        highlightSlot(mySlot);
        if (msg.addresses?.length) {
          const urls = msg.addresses
            .filter((ip) => ip !== "127.0.0.1")
            .map((ip) => `http://${ip}:${msg.port}`);
          const list = urls.length ? urls : [`http://127.0.0.1:${msg.port}`];
          hostHint.innerHTML =
            "다른 PC 접속 주소:<br>" +
            list.map((u) => `<code>${u}</code>`).join("<br>");
        }
        if (msg.lobby) renderLobby(msg.lobby);
        updateControlsHelp();
        hideOverlay();
        break;
      case "lobby":
        renderLobby(msg);
        if (!onlineSnapshot) showOverlay("온라인 로비", "", false);
        break;
      case "slot":
        mySlot = msg.slot;
        highlightSlot(mySlot);
        updateControlsHelp();
        break;
      case "started":
        hideOverlay();
        onlineSnapshot = null;
        break;
      case "game":
        onlineSnapshot = msg;
        updateScoreHUD(msg.state.scoreA, msg.state.scoreB);
        break;
      case "ended":
        showOverlay(
          `팀 ${msg.winner} 승리!`,
          `${msg.scoreA} : ${msg.scoreB}<br>방장이 다시 시작할 수 있습니다.`,
          false
        );
        onlineSnapshot = null;
        break;
      case "error":
        netStatus.textContent = msg.message;
        netStatus.className = "status err";
        break;
      default:
        break;
    }
  };

  ws.onclose = () => {
    netStatus.textContent = "연결 끊김";
    netStatus.className = "status err";
    mySlot = null;
    onlineSnapshot = null;
    highlightSlot(null);
  };

  ws.onerror = () => {
    netStatus.textContent = "접속 실패 — 서버 주소를 확인하세요";
    netStatus.className = "status err";
  };
}

function highlightSlot(slot) {
  slotPicker.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("selected", Number(b.dataset.slot) === slot);
  });
}

function pickSlot(slot) {
  if (!ws || ws.readyState !== 1) {
    netStatus.textContent = "먼저 서버에 접속하세요";
    return;
  }
  ws.send(JSON.stringify({ type: "pickSlot", slot }));
  highlightSlot(slot);
}

function startLocal() {
  sim = new PikachuVolleyballSim();
  sim.startMatch();
  hideOverlay();
  updateScoreHUD(0, 0);
}

function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  if (mode === "local" && sim) {
    sim.setLocalKeys(keys);
    const result = sim.tick(dt);
    updateScoreHUD(sim.state.scoreA, sim.state.scoreB);
    renderer.render(sim.getSnapshot(), null);
    if (result?.gameOver) {
      const st = sim.state;
      showOverlay(
        `팀 ${result.winner} 승리!`,
        `${st.scoreA} : ${st.scoreB}`,
        true
      );
      sim = null;
    }
  } else if (mode === "online" && onlineSnapshot) {
    renderer.render(onlineSnapshot, mySlot);
  } else if (mode === "online") {
    renderer.render(
      {
        state: { message: "", messageTimer: 0 },
        ball: { x: 450, y: 400, r: 14, spin: 0 },
        players: [],
      },
      null
    );
  }

  requestAnimationFrame(loop);
}

modeLocalBtn.addEventListener("click", () => setMode("local"));
modeOnlineBtn.addEventListener("click", () => setMode("online"));
connectBtn.addEventListener("click", connectOnline);
startBtn.addEventListener("click", startLocal);
hostStartBtn.addEventListener("click", () => {
  if (ws?.readyState === 1) ws.send(JSON.stringify({ type: "start" }));
});
slotPicker.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-slot]");
  if (btn) pickSlot(Number(btn.dataset.slot));
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Space" && mode === "local" && (!sim || sim.state.paused)) {
    e.preventDefault();
    startLocal();
  }
});

setMode("local");
updateControlsHelp();
showOverlay(
  "피카츄배구 4인",
  "로컬 4인 또는 <strong>온라인</strong> 탭에서 IP로 접속하세요.",
  true
);
requestAnimationFrame(loop);
