const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { randomUUID } = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs');
const botBrain = require('./lib/bot-brain');
const voteFacts = require('./lib/bot-vote-facts');
const voteIntel = require('./lib/bot-vote-intel');
const { agentLog } = require('./lib/debug-agent-log');
const botChatFilter = require('./lib/bot-chat-filter');
const m42Bluff = require('./lib/m42-bluff');
const policeFmt = require('./lib/police-report-format');
const m42Cult = require('./lib/m42-cult');
const chatSuspicion = require('./lib/bot-chat-suspicion');
const mediumPurify = require('./lib/bot-medium-purify');
const m42PoliceCitizen = require('./lib/m42-police-citizen');
const m42Matclaim = require('./lib/m42-matclaim-playbook');
const m42PrivateDetective = require('./lib/m42-private-detective');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  pingInterval: 25000,
  pingTimeout: 120000,
  connectTimeout: 45000,
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
  perMessageDeflate: false,
  maxHttpBufferSize: 512000
});

httpServer.keepAliveTimeout = 120000;
httpServer.headersTimeout = 125000;

function resolveMotionAsset(filename) {
  const base = String(filename || '').replace(/\.(png|svg)$/i, '');
  for (const ext of ['.png', '.svg']) {
    const name = `${base}${ext}`;
    const candidates = [
      path.join(__dirname, 'public', 'assets', 'motions', name),
      path.join(__dirname, 'assets', 'motions', name),
      path.join(__dirname, 'assets', name)
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

function resolveRoleAsset(role) {
  const base = String(role || '').replace(/\.(png|svg)$/i, '');
  for (const ext of ['.png', '.svg']) {
    const filename = `${base}${ext}`;
    const candidates = [
      path.join(__dirname, 'public', 'assets', 'roles', filename),
      path.join(__dirname, 'assets', 'roles', filename)
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

const ROLE_ASSET_NAMES = [
  'mafia', 'spy', 'citizen', 'private_detective', 'police', 'doctor',
  'soldier', 'politician', 'medium', 'reporter', 'graverobber', 'cult_leader'
];

const MOTION_ASSET_NAMES = [
  'vote_execution.png', 'vote_rejected.png', 'quiet_night.png', 'mafia_kill.png',
  'doctor_heal.png', 'soldier_block.png', 'police_mafia.png', 'police_innocent.png',
  'spy_contact.png', 'spy_investigate.png', 'politician_immunity.png',
  'reporter_scoop.png', 'graverobber_inherit.png', 'cult_proselytize.png',
  'private_detective_search.png'
];

function copyIfExists(src, dst) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  return true;
}

function ensurePublicAssets() {
  const roleDstDir = path.join(__dirname, 'public', 'assets', 'roles');
  const motionDstDir = path.join(__dirname, 'public', 'assets', 'motions');
  const uiDstDir = path.join(__dirname, 'public', 'assets', 'ui');
  fs.mkdirSync(roleDstDir, { recursive: true });
  fs.mkdirSync(motionDstDir, { recursive: true });
  fs.mkdirSync(uiDstDir, { recursive: true });

  let rolesCopied = 0;
  for (const role of ROLE_ASSET_NAMES) {
    const dst = path.join(roleDstDir, `${role}.png`);
    const src = path.join(__dirname, 'assets', 'roles', `${role}.png`);
    if (copyIfExists(src, dst)) rolesCopied++;
    const dstSvg = path.join(roleDstDir, `${role}.svg`);
    const srcSvg = path.join(__dirname, 'assets', 'roles', `${role}.svg`);
    if (copyIfExists(srcSvg, dstSvg)) rolesCopied++;
  }
  const pdPortraitRoot = path.join(__dirname, 'assets', 'private_detective.png');
  const pdPortraitDst = path.join(roleDstDir, 'private_detective.png');
  if (copyIfExists(pdPortraitRoot, pdPortraitDst)) rolesCopied++;

  let motionsCopied = 0;
  for (const name of MOTION_ASSET_NAMES) {
    const dst = path.join(motionDstDir, name);
    const base = name.replace(/\.png$/i, '');
    const sources = [
      path.join(__dirname, 'assets', 'motions', name),
      path.join(__dirname, 'assets', name),
      path.join(__dirname, 'assets', 'motions', `${base}.svg`),
      path.join(__dirname, 'assets', `${base}.svg`)
    ];
    for (const src of sources) {
      if (copyIfExists(src, dst)) { motionsCopied++; break; }
    }
    const dstSvg = path.join(motionDstDir, `${base}.svg`);
    const srcSvg = path.join(__dirname, 'assets', 'motions', `${base}.svg`);
    if (copyIfExists(srcSvg, dstSvg)) motionsCopied++;
  }
  const pdMotionRoot = path.join(__dirname, 'assets', 'private_detective_search.png');
  const pdMotionDst = path.join(motionDstDir, 'private_detective_search.png');
  if (copyIfExists(pdMotionRoot, pdMotionDst)) motionsCopied++;

  const PHASE_UI_VARIANTS = 5;
  const UI_ASSET_NAMES = ['bg_night.png', 'bg_day.png'];
  for (let i = 1; i <= PHASE_UI_VARIANTS; i += 1) {
    UI_ASSET_NAMES.push(`day_dawn_${i}.png`, `night_fall_${i}.png`);
  }
  UI_ASSET_NAMES.push('day_dawn.png', 'night_fall.png', 'vote_time.png');
  let uiCopied = 0;
  for (const name of UI_ASSET_NAMES) {
    const dst = path.join(uiDstDir, name);
    const sources = [
      path.join(__dirname, 'assets', 'ui', name),
      path.join(__dirname, 'assets', name)
    ];
    for (const src of sources) {
      if (copyIfExists(src, dst)) { uiCopied++; break; }
    }
    const base = name.replace(/\.png$/i, '');
    const dstSvg = path.join(uiDstDir, `${base}.svg`);
    const srcSvg = path.join(__dirname, 'assets', 'ui', `${base}.svg`);
    if (copyIfExists(srcSvg, dstSvg)) uiCopied++;
  }

  for (const [legacy, numbered] of [['day_dawn.png', 'day_dawn_1.png'], ['night_fall.png', 'night_fall_1.png']]) {
    const legacyPath = path.join(uiDstDir, legacy);
    const numberedPath = path.join(uiDstDir, numbered);
    if (!fs.existsSync(legacyPath) && fs.existsSync(numberedPath)) {
      fs.copyFileSync(numberedPath, legacyPath);
      uiCopied++;
    }
  }

  return { rolesCopied, motionsCopied, uiCopied };
}

function ensurePlaceholderAssets() {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    require('./scripts/ensure-placeholder-assets');
  } catch (err) {
    console.warn('[ASSETS] ensure-placeholder-assets:', err.message);
  }
}

ensurePublicAssets();
ensurePlaceholderAssets();

const PUBLIC_DIR = path.join(__dirname, 'public');

// Render/CDN 환경에서 ?v= 캐시버스트 쿼리가 404(text/plain)로 떨어지는 문제 방지
app.use((req, res, next) => {
  if (req.url.includes('?')) {
    const clean = req.url.split('?')[0];
    if (/\.(js|css|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|map)$/i.test(clean)) {
      req.url = clean;
    }
  }
  next();
});

app.get('/assets/roles/:role', (req, res, next) => {
  const role = req.params.role.replace(/\.(png|svg)$/i, '');
  const file = resolveRoleAsset(role);
  if (!file) {
    const svg = path.join(__dirname, 'public', 'assets', 'roles', `${role}.svg`);
    if (fs.existsSync(svg)) return res.sendFile(svg);
    return next();
  }
  res.sendFile(file);
});

app.get('/assets/motions/:filename', (req, res, next) => {
  const file = resolveMotionAsset(req.params.filename);
  if (!file) return next();
  res.sendFile(file);
});

app.use('/assets/ui', express.static(path.join(__dirname, 'public', 'assets', 'ui')));
app.use('/assets/ui', express.static(path.join(__dirname, 'assets', 'ui')));
app.use('/assets/motions', express.static(path.join(__dirname, 'public', 'assets', 'motions')));
app.use('/assets/roles', express.static(path.join(__dirname, 'public', 'assets', 'roles')));
app.use('/assets/motions', express.static(path.join(__dirname, 'assets')));
app.use(express.static(PUBLIC_DIR, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    else if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css; charset=utf-8');
  }
}));

// ─── constants ───────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.set('trust proxy', 1);

app.get('/api/info', (req, res) => {
  res.json(buildServerInfo(req));
});
const MIN_PLAYERS = 8;
const MAX_PLAYERS = 16;
const GRACE_PERIOD_MS = 60000;
/** 마피아42 클래식 룰 참고 (교주 제외) */
const M42 = {
  DAY_CHAT_MS_PER_ALIVE: 15000,
  DAY_CHAT_MS_MIN: 75000,
  DAY_CHAT_MS_MAX: 180000,
  NIGHT_MS: 25000,
  EXECUTION_VOTE_MS: 5000,
  TIME_ADJUST_MS: 15000,
  VOTE_TALLY_HIDE_MS: 5000,
  NIGHT_LIMIT_MAFIA_WIN: 10
};

const TIME_ADJUST_MS = M42.TIME_ADJUST_MS;
const MIN_PHASE_REMAINING_MS = 5000;

/** Bot day-chat rate limits (prevents socket flood / disconnects) */
const BOT_CHAT = {
  MIN_GAP_MS: 3000,
  MAX_GAP_MS: 5000,
  MAX_PER_DAY_PHASE: 14,
  HUMAN_REPLY_WAIT_MS: 3500,
  SCHEDULED_SLOTS_MS: [12000, 28000, 45000, 62000]
};

/** 맞경·홀경 페어/맞박 — 큐 없이 즉시 (나머지 봇 채팅은 3~5초 간격) */
function isMatgyeongFastBotChat(opts = {}) {
  return !!(
    opts.mafiaFakePolice
    || opts.policeMatgyeongBicker
    || opts._pairedHolgyeong
  );
}

function botChatGapMs() {
  return BOT_CHAT.MIN_GAP_MS + Math.floor(Math.random() * (BOT_CHAT.MAX_GAP_MS - BOT_CHAT.MIN_GAP_MS + 1));
}

function clearBotDayMessageQueue(room) {
  if (!room) return;
  room._botDayMsgQueue = [];
  room._botDayMsgQueueBusy = false;
}

function pumpBotDayMessageQueue(room) {
  if (!room || room._botDayMsgQueueBusy) return;
  const q = room._botDayMsgQueue;
  if (!q || !q.length) return;
  if (room.phase !== PHASE.DAY_CHAT) {
    clearBotDayMessageQueue(room);
    return;
  }
  room._botDayMsgQueueBusy = true;
  const item = q.shift();
  const delay = botChatGapMs();
  scheduleRoomTask(room, () => {
    room._botDayMsgQueueBusy = false;
    if (room.phase !== PHASE.DAY_CHAT) {
      clearBotDayMessageQueue(room);
      return;
    }
    postBotDayMessage(room, item.bot, item.text, { ...item.opts, _fromBotChatQueue: true });
    pumpBotDayMessageQueue(room);
  }, delay);
}

function enqueueBotDayMessage(room, bot, text, opts = {}) {
  if (!room._botDayMsgQueue) room._botDayMsgQueue = [];
  room._botDayMsgQueue.push({ bot, text, opts });
  pumpBotDayMessageQueue(room);
}

const BOT_DEAD_CHAT = {
  MAX_PER_DEATH: 2,
  FIRST_DELAY_MS: 4000,
  GAP_MS: 9000
};

const ROOM_EMIT_BUDGET = { maxPerSecond: 18, maxChatPerSecond: 6 };
const STATE_SYNC_CHAT_LIMIT = 80;

const PHASE = {
  LOBBY: 'lobby',
  NIGHT: 'night',
  DAWN: 'dawn',
  DAY_CHAT: 'day_chat',
  DAY_VOTE: 'day_vote',
  LAST_WORDS: 'last_words',
  EXECUTION_VOTE: 'execution_vote',
  GAME_OVER: 'game_over'
};

const ROLE = {
  MAFIA: 'mafia',
  SPY: 'spy',
  CITIZEN: 'citizen',
  PRIVATE_DETECTIVE: 'private_detective',
  POLICE: 'police',
  DOCTOR: 'doctor',
  SOLDIER: 'soldier',
  POLITICIAN: 'politician',
  MEDIUM: 'medium',
  REPORTER: 'reporter',
  GRAVEROBBER: 'graverobber',
  CULT_LEADER: m42Cult.ROLE_CULT_LEADER
};

const MAFIA_ROLES = new Set([ROLE.MAFIA, ROLE.SPY]);
const TIMERS = {
  [PHASE.NIGHT]: M42.NIGHT_MS,
  [PHASE.DAY_CHAT]: M42.DAY_CHAT_MS_MAX,
  [PHASE.DAY_VOTE]: 15000,
  [PHASE.LAST_WORDS]: 15000,
  [PHASE.EXECUTION_VOTE]: M42.EXECUTION_VOTE_MS,
  [PHASE.DAWN]: 5000
};

const ROLE_LABELS = {
  [ROLE.MAFIA]: '마피아',
  [ROLE.SPY]: '스파이',
  [ROLE.CITIZEN]: '일반 시민',
  [ROLE.PRIVATE_DETECTIVE]: '사립탐정',
  [ROLE.POLICE]: '경찰',
  [ROLE.DOCTOR]: '의사',
  [ROLE.SOLDIER]: '군인',
  [ROLE.POLITICIAN]: '정치인',
  [ROLE.MEDIUM]: '영매',
  [ROLE.REPORTER]: '기자',
  [ROLE.GRAVEROBBER]: '도굴꾼',
  [ROLE.CULT_LEADER]: '교주'
};

// ─── global state ─────────────────────────────────────────────────────────────

const rooms = new Map();
const sessions = new Map();
const SERVER_STABILITY = '2026-05-20-private-detective';

app.get('/health', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ok: true,
    service: 'mafia-game',
    stability: SERVER_STABILITY,
    botAi: botBrain.getStatus(),
    rooms: rooms.size,
    sessions: sessions.size,
    uptime: Math.floor(process.uptime()),
    memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024)
  });
});

// ─── helpers ──────────────────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function getLocalIPv4() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

function getRequestHeader(req, name) {
  if (!req) return null;
  if (typeof req.get === 'function') return req.get(name);
  const key = String(name).toLowerCase();
  const headers = req.headers || {};
  return headers[key] ?? headers[name] ?? null;
}

function getPublicBaseUrl(req) {
  const fromEnv = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;
  if (fromEnv) return String(fromEnv).replace(/\/$/, '');

  if (!req) return null;
  const host = getRequestHeader(req, 'x-forwarded-host') || getRequestHeader(req, 'host');
  if (!host) return null;
  const protoRaw = getRequestHeader(req, 'x-forwarded-proto')
    || req.protocol
    || (req.socket?.encrypted ? 'https' : 'http');
  const proto = String(protoRaw).split(',')[0].trim();
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) return null;
  return `${proto}://${host}`;
}

function buildServerInfo(req) {
  const publicUrl = getPublicBaseUrl(req);
  const localIp = getLocalIPv4();
  const lanUrl = `http://${localIp}:${PORT}`;
  const accessMode = publicUrl ? 'web' : 'local';

  return {
    port: Number(PORT),
    localIp,
    publicUrl,
    playUrl: publicUrl || lanUrl,
    legacyLanUrl: lanUrl,
    accessMode,
    botAi: botBrain.getStatus()
  };
}

function getServerInfoFromSocket(socket) {
  const req = socket?.request || null;
  if (req && typeof req.get !== 'function' && socket?.handshake?.headers) {
    req.headers = { ...req.headers, ...socket.handshake.headers };
  }
  return buildServerInfo(req);
}

function isMafiaTeam(role) {
  return role === ROLE.MAFIA || role === ROLE.SPY;
}

function isMafiaRole(role) {
  return role === ROLE.MAFIA;
}

function isCultMember(player) {
  return m42Cult.isCultMember(player);
}

function viewerOnCultSide(viewer) {
  if (!viewer) return false;
  return isCultMember(viewer);
}

function isVisibleCultFollower(viewer, target) {
  if (!viewer || !target || target.id === viewer.id) return false;
  if (viewer.role !== ROLE.CULT_LEADER) return false;
  return isCultMember(target);
}

/** 마피아 채팅·팀 표시 권한 (마피아 또는 접선한 스파이) */
function viewerOnMafiaSide(viewer) {
  if (!viewer) return false;
  return viewer.role === ROLE.MAFIA || viewer.joinedMafiaChat;
}

/** 시청자에게 보이는 마피아 팀 동료 (본인 제외) */
function isVisibleMafiaAlly(viewer, target, room) {
  if (!viewer || !target || target.id === viewer.id) return false;
  if (!viewerOnMafiaSide(viewer)) return false;
  if (isMafiaRole(target.role)) return true;
  if (target.role !== ROLE.SPY || !target.spyRevealedToMafia) return false;
  if (room && room.phase === PHASE.NIGHT) return false;
  return true;
}

function getMafiaTeammatesForViewer(room, viewer) {
  if (!viewerOnMafiaSide(viewer)) return [];
  return Object.values(room.players).filter((p) => isVisibleMafiaAlly(viewer, p, room));
}

function hasAliveHumanPolice(room) {
  return Object.values(room.players || {}).some(
    (p) => p && p.alive && p.role === ROLE.POLICE && !p.isBot
  );
}

function emitMafiaTeamInfo(room, viewer) {
  if (!viewer || !viewerOnMafiaSide(viewer)) return;
  const teammates = getMafiaTeammatesForViewer(room, viewer).map(p => ({
    id: p.id,
    nickname: p.nickname,
    role: p.role,
    roleLabel: ROLE_LABELS[p.role]
  }));
  const sess = sessions.get(viewer.userID);
  if (sess && sess.socketId) {
    io.to(sess.socketId).emit('privateInfo', { type: 'mafiaTeam', teammates });
  }
}

function emitMafiaTeamInfoToAll(room) {
  for (const p of Object.values(room.players)) {
    emitMafiaTeamInfo(room, p);
  }
}

function emitCultTeamInfo(room, viewer) {
  if (!viewer || !isCultMember(viewer)) return;
  const leader = Object.values(room.players).find(
    (p) => p.role === ROLE.CULT_LEADER && p.alive
  );
  const followers = Object.values(room.players)
    .filter((p) => p.id !== viewer.id && p.alive && isCultMember(p) && p.role !== ROLE.CULT_LEADER)
    .map((p) => ({
      id: p.id,
      nickname: p.nickname,
      roleLabel: ROLE_LABELS[p.role] || p.role
    }));
  const sess = sessions.get(viewer.userID);
  if (!sess || !sess.socketId) return;
  io.to(sess.socketId).emit('privateInfo', {
    type: 'cultTeam',
    leaderNickname: leader ? leader.nickname : null,
    followers
  });
}

function emitCultTeamInfoToAll(room) {
  for (const p of Object.values(room.players)) {
    if (isCultMember(p)) emitCultTeamInfo(room, p);
  }
}

function getAlivePlayers(room) {
  return Object.values(room.players).filter(p => p.alive);
}

function getPlayerByUserId(room, userID) {
  return Object.values(room.players).find(p => p.userID === userID);
}

function getPlayerById(room, playerId) {
  return room.players[playerId];
}

function playerName(room, playerId) {
  const p = getPlayerById(room, playerId);
  return p ? p.nickname : playerId;
}

function hasBots(room) {
  return Object.values(room.players).some(p => p.isBot);
}

function getBots(room) {
  return Object.values(room.players).filter(p => p.isBot);
}

function isActiveGame(room) {
  return !!(room && room.game && room.phase !== PHASE.GAME_OVER && !room.game.winner);
}

function clearPoliceAckTimers(room) {
  if (!room?._policeAckTimers?.length) return;
  for (const t of room._policeAckTimers) clearTimeout(t);
  room._policeAckTimers = [];
}

function clearMafiaFakeReportTimers(room) {
  if (!room?._mafiaFakeReportTimers?.length) return;
  for (const t of room._mafiaFakeReportTimers) clearTimeout(t);
  room._mafiaFakeReportTimers = [];
}

function clearBotChatTimers(room) {
  if (!room) return;
  clearBotDayMessageQueue(room);
  clearPoliceAckTimers(room);
  clearMafiaFakeReportTimers(room);
  if (room._botHumanReplyTimer) {
    clearTimeout(room._botHumanReplyTimer);
    room._botHumanReplyTimer = null;
  }
  if (room._policeReportTimer) {
    clearTimeout(room._policeReportTimer);
    room._policeReportTimer = null;
  }
  if (room._botDeadChatTimers) {
    for (const t of room._botDeadChatTimers) clearTimeout(t);
    room._botDeadChatTimers = [];
  }
  room.botChatInFlight = false;
}

function canReceiveDeadChat(player) {
  return !!player && (!player.alive || player.role === ROLE.MEDIUM);
}

function broadcastDeadChatMessage(room, deadMsg) {
  broadcastToRoom(room, 'chatMessage', { channel: 'dead', ...deadMsg }, canReceiveDeadChat);
}

function getDayChatForViewer(room, viewer) {
  const day = (room.chatLog.day || []).filter((m) => !m.isDead);
  if (!viewer || !canReceiveDeadChat(viewer)) {
    return day;
  }
  const dead = room.chatLog.dead || [];
  const keys = new Set(day.map((m) => `${m.time}|${m.fromId}|${m.text}`));
  const merged = [...day];
  for (const m of dead) {
    const key = `${m.time}|${m.fromId}|${m.text}`;
    if (keys.has(key)) continue;
    keys.add(key);
    merged.push({ ...m, isDead: true });
  }
  return merged.sort((a, b) => (a.time || 0) - (b.time || 0));
}

function postBotDeadMessage(room, bot, text) {
  if (!text || !bot || bot.alive) return;
  if (!canEmitRoomEvent(room, 'chat')) return;
  const safe = botChatFilter.sanitizeBotChatLine(
    String(text).trim(), bot, isMafiaTeam, room, voteFactHelpers
  );
  const deadMsg = {
    from: bot.nickname,
    fromId: bot.id,
    text: safe,
    time: Date.now(),
    isDead: true
  };
  pushChat(room, 'dead', deadMsg);
  broadcastDeadChatMessage(room, deadMsg);
  console.log(`[BOT] dead-chat ${bot.nickname}: ${deadMsg.text.slice(0, 50)}`);
}

function scheduleBotDeadReply(room, triggerMsg) {
  if (!hasBots(room) || !triggerMsg.fromId) return;
  const triggerPlayer = getPlayerById(room, triggerMsg.fromId);
  if (!triggerPlayer || triggerPlayer.isBot) return;
  const deadBots = Object.values(room.players).filter((p) => p.isBot && !p.alive && p.id !== triggerMsg.fromId);
  if (!deadBots.length) return;
  const replier = deadBots[Math.floor(Math.random() * deadBots.length)];
  if (replier._deadRepliedAt && Date.now() - replier._deadRepliedAt < 12000) return;
  scheduleRoomTask(room, () => {
    if (!replier.alive) {
      const text = botBrain.generateBotDeadChat(room, replier, { replyTo: triggerMsg });
      if (text) {
        replier._deadRepliedAt = Date.now();
        postBotDeadMessage(room, replier, text);
      }
    }
  }, 5000 + Math.floor(Math.random() * 4000));
}

function scheduleBotDeadChatOnDeath(room, bot) {
  if (!bot.isBot || bot.alive) return;
  if (!room._botDeadChatTimers) room._botDeadChatTimers = [];
  for (let i = 0; i < BOT_DEAD_CHAT.MAX_PER_DEATH; i++) {
    const delay = BOT_DEAD_CHAT.FIRST_DELAY_MS + i * BOT_DEAD_CHAT.GAP_MS;
    const timer = setTimeout(() => {
      if (room._botDeadChatTimers) {
        room._botDeadChatTimers = room._botDeadChatTimers.filter((t) => t !== timer);
      }
      if (!isActiveGame(room) || bot.alive) return;
      const text = botBrain.generateBotDeadChat(room, bot, { onDeath: true, pass: i });
      if (text) postBotDeadMessage(room, bot, text);
    }, delay);
    room._botDeadChatTimers.push(timer);
  }
}

function markPlayerDead(room, player) {
  if (!player || !player.alive) return;
  const wasPolice = player.role === ROLE.POLICE;
  player.alive = false;
  if (room.game && player.deadSinceNightIndex == null) {
    player.deadSinceNightIndex = room.game.nightIndex || 0;
  }
  if (player.isBot) scheduleBotDeadChatOnDeath(room, player);
  if (wasPolice) {
    scheduleRoomTask(room, () => {
      m42Bluff.promoteMafiaPoliceBluffer(room, voteFactHelpers);
      scheduleMafiaBluffPoliceMaintains(room);
    }, 400);
  }
}

function isRealPoliceAlive(room) {
  return Object.values(room.players || {}).some(
    (p) => p && p.role === ROLE.POLICE && p.alive
  );
}

/** 진경 사망 후 지정 마피아 봇이 낮에 가짜 조결을 주기적으로 냄 */
function scheduleMafiaBluffPoliceMaintains(room) {
  if (!room.game || !hasBots(room) || isRealPoliceAlive(room)) return;
  if (room.phase !== PHASE.DAY_CHAT) return;

  m42Bluff.promoteMafiaPoliceBluffer(room, voteFactHelpers);
  const bluffer = m42Bluff.getMafiaPoliceBlufferBot(room, voteFactHelpers);
  if (!bluffer || !bluffer.alive) return;

  const wave = `bluff_police_d${room.game.dayIndex || 0}`;
  if (!room._mafiaBluffPoliceWave) room._mafiaBluffPoliceWave = {};
  if (room._mafiaBluffPoliceWave[wave]) return;
  room._mafiaBluffPoliceWave[wave] = true;

  [1600, 4200, 7800, 11500].forEach((ms) => {
    scheduleRoomTask(room, () => {
      if (room.phase !== PHASE.DAY_CHAT || isRealPoliceAlive(room)) return;
      if (!bluffer.alive) return;
      const text = m42Bluff.buildFakePoliceReportLine(room, bluffer, voteFactHelpers, {
        forceInnocent: true,
        preferClearMafiaAlly: Math.random() < 0.7
      });
      if (text) postBotDayMessage(room, bluffer, text);
    }, ms);
  });
}

function resetBotChatStats(room) {
  if (!room || !room.game) return;
  room.game.botChatStats = { count: 0, lastAt: 0 };
}

function canBotChatNow(room, ctx = {}) {
  if (!room || !room.game) return false;
  const policeAck = !!(ctx && ctx.policeReportAck);
  if (room.botChatInFlight) {
    if (policeAck) {
      // 조결 확인 연쇄 응답은 inFlight와 별도로 허용
    } else {
      const started = room._botChatStartedAt || 0;
      if (started && Date.now() - started > 12000) {
        console.warn(`[BOT] reset stuck botChatInFlight room=${room.code}`);
        room.botChatInFlight = false;
      } else {
        return false;
      }
    }
  }
  if (policeAck) return true;

  const st = room.game.botChatStats || { count: 0, lastAt: 0 };
  room.game.botChatStats = st;
  const now = Date.now();
  if (st.count >= BOT_CHAT.MAX_PER_DAY_PHASE) {
    // #region agent log
    agentLog({
      hypothesisId: 'F',
      location: 'server.js:canBotChatNow',
      message: 'blocked MAX_PER_DAY_PHASE',
      data: { count: st.count, max: BOT_CHAT.MAX_PER_DAY_PHASE }
    });
    // #endregion
    return false;
  }
  if (st.lastAt && now - st.lastAt < BOT_CHAT.MIN_GAP_MS) {
    // #region agent log
    agentLog({
      hypothesisId: 'F',
      location: 'server.js:canBotChatNow',
      message: 'blocked MIN_GAP_MS',
      data: { gapMs: now - st.lastAt, minGap: BOT_CHAT.MIN_GAP_MS }
    });
    // #endregion
    return false;
  }
  return true;
}

function recordBotChat(room) {
  if (!room || !room.game) return;
  const st = room.game.botChatStats || { count: 0, lastAt: 0 };
  st.count = (st.count || 0) + 1;
  st.lastAt = Date.now();
  room.game.botChatStats = st;
}

function canEmitRoomEvent(room, kind = 'general') {
  const now = Date.now();
  if (!room._emitBucket || now > room._emitBucket.resetAt) {
    room._emitBucket = { count: 0, chatCount: 0, resetAt: now + 1000 };
  }
  const b = room._emitBucket;
  if (kind === 'chat') {
    if (b.chatCount >= ROOM_EMIT_BUDGET.maxChatPerSecond) return false;
    b.chatCount++;
  }
  if (b.count >= ROOM_EMIT_BUDGET.maxPerSecond) return false;
  b.count++;
  return true;
}

const VOTE_RESULTS_DISPLAY_MS = 5600;

function clearDayVoteResultsTimer(room) {
  if (!room) return;
  if (room._dayVoteResultsTimer) {
    clearTimeout(room._dayVoteResultsTimer);
    room._dayVoteResultsTimer = null;
  }
  if (room._dayVoteWatchdogTimer) {
    clearTimeout(room._dayVoteWatchdogTimer);
    room._dayVoteWatchdogTimer = null;
  }
}

function scheduleDayVoteResolveWatchdog(room) {
  if (!room) return;
  if (room._dayVoteWatchdogTimer) clearTimeout(room._dayVoteWatchdogTimer);
  room._dayVoteWatchdogTimer = setTimeout(() => {
    room._dayVoteWatchdogTimer = null;
    if (!room.resolvingDayVote || room.phase !== PHASE.DAY_VOTE) return;
    console.warn(`[ROOM ${room.code}] day vote watchdog — force finish`);
    finishDayVoteResolve(room);
  }, VOTE_RESULTS_DISPLAY_MS + 5000);
}

function finishDayVoteResolve(room) {
  if (!room) return;
  clearDayVoteResultsTimer(room);
  room.resolvingDayVote = false;
  room._dayVoteResolveAt = null;
  const results = room._voteResultsPayload || (room.game ? buildDayVoteResults(room) : null);
  room._voteResultsPayload = null;
  if (!results || !isActiveGame(room) || room.phase !== PHASE.DAY_VOTE) return;
  proceedDayVoteAfterResults(room, results);
}

function bumpRoomTaskGeneration(room) {
  if (!room) return;
  if (room._broadcastStateTimer) {
    clearTimeout(room._broadcastStateTimer);
    room._broadcastStateTimer = null;
  }
  clearBotChatTimers(room);
  clearDayVoteResultsTimer(room);
  room.taskGeneration = (room.taskGeneration || 0) + 1;
  room.botActionGeneration = (room.botActionGeneration || 0) + 1;
}

function scheduleRoomTask(room, fn, delayMs) {
  if (!room) return;
  const gen = room.taskGeneration || 0;
  setTimeout(() => {
    if (!rooms.has(room.code)) return;
    if ((room.taskGeneration || 0) !== gen) return;
    try {
      const result = fn();
      if (result && typeof result.then === 'function') {
        result.catch((err) => {
          console.error(`[ROOM TASK async] room=${room.code}`, err);
        });
      }
    } catch (err) {
      console.error(`[ROOM TASK] room=${room.code}`, err);
    }
  }, delayMs);
}

function getRoomForSocket(socket) {
  const sess = sessions.get(socket.userID);
  if (!sess || !sess.roomCode) return { room: null, sess: null };
  const room = rooms.get(sess.roomCode);
  if (!room) return { room: null, sess };
  return { room, sess };
}

function validateNightTarget(room, actor, targetId, opts = {}) {
  const { aliveOnly = true, allowSelf = false, deadOnly = false } = opts;
  if (!targetId) return { ok: false, message: '대상을 선택하세요.' };
  const target = getPlayerById(room, targetId);
  if (!target) return { ok: false, message: '존재하지 않는 대상입니다.' };
  if (aliveOnly && !target.alive) return { ok: false, message: '생존자만 선택할 수 있습니다.' };
  if (deadOnly && target.alive) return { ok: false, message: '사망자만 선택할 수 있습니다.' };
  if (!allowSelf && target.id === actor.id) return { ok: false, message: '자신은 선택할 수 없습니다.' };
  if (actor && isMafiaRole(actor.role) && isMafiaTeam(target.role)) {
    return { ok: false, message: '마피아 팀원은 살해할 수 없습니다.' };
  }
  return { ok: true, target };
}

function rememberNightActor(room, actorId, kind, targetId) {
  if (!actorId || !targetId || !room.game?.nightActions) return;
  const na = room.game.nightActions;
  if (!na.actorNightTarget) na.actorNightTarget = {};
  na.actorNightTarget[actorId] = { kind, targetId };
}

function pickRandomTarget(room, actor, opts = {}) {
  const { excludeSelf = true, aliveOnly = true, excludeIds = [] } = opts;
  const candidates = Object.values(room.players).filter(p => {
    if (aliveOnly && !p.alive) return false;
    if (excludeSelf && p.id === actor.id) return false;
    if (excludeIds.includes(p.id)) return false;
    if (opts.excludeMafia && isMafiaRole(p.role)) return false;
    if (opts.excludeMafiaTeam && isMafiaTeam(p.role)) return false;
    return true;
  });
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)].id;
}

const CHAT_ACCUSE_PATTERNS = [
  /마피아/, /의심/, /수상/, /이상/, /거짓/, /범인/, /살인/, /죽였/, /죽인/,
  /처형/, /지목/, /투표/, /공범/, /속였/, /거짓말/, /거짓/, /거짓말쟁이/,
  /수상해/, /수상한/, /이상해/, /이상한/, /거슬/, /불안/, /기억해/, /기억이/
];

const CHAT_DEFEND_PATTERNS = [
  /아니에요/, /아닙니다/, /억울/, /무고/, /믿어/, /시민/, /아니야/, /아니요/,
  /누명/, /오해/, /잘못/, /아닌데/, /진짜/
];

const CHAT_TRUST_PATTERNS = [
  /믿어/, /신뢰/, /시민인 것 같/, /마피아 아닌/, /아닌 것 같/, /확신/, /보호/
];

function ensureBotMinds(room) {
  const g = room.game;
  if (!g.botMinds) g.botMinds = {};
  return g.botMinds;
}

function getBotMind(room, botId) {
  const minds = ensureBotMinds(room);
  if (!minds[botId]) {
    minds[botId] = { knownRoles: {}, trust: {}, accused: {}, fakeClaim: null };
  }
  return minds[botId];
}

function botLearnRole(room, botId, targetId, role) {
  if (!botId || !targetId || !role) return;
  getBotMind(room, botId).knownRoles[targetId] = role;
}

function getChatMessages(room, channel) {
  return (room.chatLog && room.chatLog[channel]) ? room.chatLog[channel] : [];
}

function countChatMessagesByPlayer(room, channel) {
  const counts = {};
  for (const msg of getChatMessages(room, channel)) {
    if (msg.system || !msg.fromId) continue;
    counts[msg.fromId] = (counts[msg.fromId] || 0) + 1;
  }
  return counts;
}

function findPlayersMentionedInText(room, text, { aliveOnly = true } = {}) {
  if (!text) return [];
  const mentioned = [];
  const sorted = Object.values(room.players).sort((a, b) => b.nickname.length - a.nickname.length);
  for (const p of sorted) {
    if (aliveOnly && !p.alive) continue;
    if (p.nickname && text.includes(p.nickname)) mentioned.push(p.id);
  }
  return mentioned;
}

function isMediumPurifyRequest(text) {
  return mediumPurify.isMediumPurifyRequest(text);
}

function isPoliceReportRequest(text, room = null) {
  if (!text) return false;
  if (room && voteFacts.isPoliceReportProviding(text, room)) return false;
  const raw = String(text);
  const compact = raw.replace(/\s+/g, '');
  if (/경조결|경찰조사|경찰수사|수사결과|조사결과|경찰결과|조결|조사결|경찰조사결과/.test(compact)) {
    return true;
  }
  if (/경조/.test(compact)) return true;
  if (/경찰/.test(compact) && /(조사|수사|결과|ㄱㅈ|알려|말해|공개|발표|조결)/.test(compact)) return true;
  if (/경찰/.test(raw) && /(누구|마피아)/.test(raw)) return true;
  return false;
}

function isRoleClaimRequest(text) {
  if (!text) return false;
  const c = String(text).replace(/\s+/g, '');
  return /직공|ㅈㄱ|풍지|직업공개|직업ㄱㅇ|홀경|홀의|홀군|직적|각자직업|직업해|직업말/.test(c);
}

function isPoliceSelfClaim(text) {
  if (!text) return false;
  const c = String(text).replace(/\s+/g, '');
  if (!/경찰|홀경/.test(c)) return false;
  return /(저는|나는|제가|홀경|경찰입니다|경찰이|진경|맞경|진짜경찰)/.test(c);
}

function notePublicPoliceClaim(room, playerId) {
  if (!room.game || !playerId) return;
  if (!room.game.publicPoliceClaimIds) room.game.publicPoliceClaimIds = {};
  room.game.publicPoliceClaimIds[playerId] = Date.now();
}

function getPublicPoliceClaimTargets(room, excludeId = null) {
  const claims = room.game?.publicPoliceClaimIds || {};
  const out = [];
  for (const id of Object.keys(claims)) {
    if (excludeId && id === excludeId) continue;
    const p = getPlayerById(room, id);
    if (p && p.alive) out.push(p);
  }
  return out;
}

function isRoleRollCallQuestion(text) {
  if (!text) return false;
  const c = String(text).replace(/\s+/g, '').toLowerCase();
  return /각자직업|직업뭐|직업이뭐|직업다|직업말|직업알려|직업공개|다들직업|직업좀|직업해봐|직업말해|무슨직업|직업이뭔|직업이/.test(c)
    || /직업/.test(c) && /(뭐|무엇|말|공개|알려|해봐|해줘|각자|다들)/.test(c);
}

function isSelfVoteRequest(text) {
  if (!text) return false;
  const c = String(text).replace(/\s+/g, '');
  return /자투|무투|자투표|무투표|투표스킵|넘기자/.test(c);
}

/** 시단·시간단축 ㄱㄱ 등 */
function isTimeShortenRequest(text) {
  if (!text) return false;
  const c = String(text).replace(/\s+/g, '').toLowerCase();
  if (/^시단$|^시간단$/.test(c)) return true;
  if (/시단[ㄱㅎ합하갑]|시간단[ㄱㅎ합하갑]/.test(c)) return true;
  if (/시간단축|타임단축|시간줄여|시간줄이|시간줄입|시간줄여|시간빨리|빨리투표|투표가자|투표ㄱ/.test(c)) return true;
  if (/시간/.test(c) && /단축|줄여|줄이|빨리|스킵/.test(c)) return true;
  if (/단축/.test(c) && /(ㄱㄱ|가자|합시|하자|해주|부탁|좀|갑시|가봅|가요)/.test(c)) return true;
  return false;
}

/** 시증·시간증가 등 */
function isTimeExtendRequest(text) {
  if (!text) return false;
  const c = String(text).replace(/\s+/g, '').toLowerCase();
  if (/^시증$|^시간증$/.test(c)) return true;
  if (/시증[ㄱㅎ합하갑]|시간증[ㄱㅎ합하갑]/.test(c)) return true;
  if (/시간증가|시간연장|시간늘려|시간늘리|시간더|타임증가|타임연장/.test(c)) return true;
  if (/시간/.test(c) && /증가|늘려|늘리|연장|더줘|더주/.test(c)) return true;
  if (/연장/.test(c) && /(ㄱㄱ|가자|합시|하자|해주|부탁|좀|갑시)/.test(c)) return true;
  return false;
}

function parseTimeAdjustRequest(text) {
  if (!text) return null;
  const shorten = isTimeShortenRequest(text);
  const extend = isTimeExtendRequest(text);
  if (shorten && !extend) return 'shorten';
  if (extend && !shorten) return 'extend';
  if (shorten && extend) {
    const c = String(text).replace(/\s+/g, '');
    if (/증가|연장|늘려|늘리|시증/.test(c)) return 'extend';
    return 'shorten';
  }
  return null;
}

function tryApplyBotTimeAdjust(room, bot, type) {
  if (!bot?.alive || !room || room.phase !== PHASE.DAY_CHAT) return false;
  const result = adjustPhaseTime(room, bot, type);
  if (!result.ok) {
    console.log(`[BOT] ${bot.nickname} time ${type} skipped: ${result.message}`);
    return false;
  }
  console.log(`[BOT] ${bot.nickname} time ${type} applied`);
  if (Math.random() < 0.4) {
    const line = type === 'shorten' ? '시간 단축했습니다.' : '시간 늘렸습니다.';
    postBotDayMessage(room, bot, line);
  }
  return true;
}

function scheduleBotTimeAdjustReaction(room, type) {
  if (!type || !hasBots(room) || room.phase !== PHASE.DAY_CHAT) return;

  const now = Date.now();
  if (!room._botTimeAdjDebounce) room._botTimeAdjDebounce = {};
  if (room._botTimeAdjDebounce[type] && now - room._botTimeAdjDebounce[type] < 2500) return;
  room._botTimeAdjDebounce[type] = now;

  const bots = shuffle(getBots(room).filter((p) => p.alive));
  const eligible = bots.filter((b) =>
    type === 'shorten' ? !b.timeShortened : !b.timeIncreased
  );
  if (!eligible.length) return;

  const pick = eligible.slice(0, Math.min(3, eligible.length));
  pick.forEach((bot, i) => {
    scheduleRoomTask(room, () => tryApplyBotTimeAdjust(room, bot, type), 350 + i * 550);
  });
}

function getDayVoteWeight(player) {
  if (!player || !player.alive) return 0;
  if (player.role === ROLE.POLITICIAN) return 2;
  if (player.role === ROLE.CULT_LEADER) return 2;
  if (player.joinedCult) return 2;
  return 1;
}

function computeDayChatDurationMs(room) {
  const alive = getAlivePlayers(room).length;
  const ms = alive * M42.DAY_CHAT_MS_PER_ALIVE;
  return Math.min(M42.DAY_CHAT_MS_MAX, Math.max(M42.DAY_CHAT_MS_MIN, ms));
}

function buildDayVoteTally(room) {
  const votes = room.game ? room.game.dayVotes : {};
  const tally = {};
  for (const [voterId, targetId] of Object.entries(votes)) {
    if (!targetId) continue;
    const voter = getPlayerById(room, voterId);
    const w = getDayVoteWeight(voter);
    if (!w) continue;
    tally[targetId] = (tally[targetId] || 0) + w;
  }
  return tally;
}

/** 공개 조결용: 현재 nightIndex 수사 1건만 (이전 밤 결과 재공표 방지) */
function getPoliceIntelForReport(room, policeId) {
  const list = room.game?.policeIntel?.[policeId] || [];
  if (!list.length) return [];

  const idx = room.game?.nightIndex || 0;
  const thisNight = list
    .filter((r) => r.nightIndex === idx)
    .sort((a, b) => (b.at || 0) - (a.at || 0));
  if (thisNight.length) {
    // #region agent log
    agentLog({
      hypothesisId: 'Pc1',
      location: 'server.js:getPoliceIntelForReport',
      message: 'intel this night',
      runId: 'police-fix',
      data: {
        policeId,
        nightIndex: idx,
        target: thisNight[0].targetName,
        isMafia: thisNight[0].isMafia
      }
    });
    // #endregion
    return [thisNight[0]];
  }

  // #region agent log
  agentLog({
    hypothesisId: 'Pc1',
    location: 'server.js:getPoliceIntelForReport',
    message: 'no intel this night (stale blocked)',
    runId: 'police-fix',
    data: { policeId, nightIndex: idx, phase: room.phase, historyCount: list.length }
  });
  // #endregion
  return [];
}

function hasPoliceReportInDayChat(room, policeId) {
  if (!policeId) return false;
  const openedAt = room.game?.dayChatOpenedAt;
  const messages = getDayMessages(room).filter(
    (m) => m && m.fromId === policeId && m.text && policeFmt.looksLikePoliceReport(m.text, room)
  );
  const inWindow = messages.filter(
    (m) => openedAt == null || (typeof m.time === 'number' && m.time >= openedAt)
  );
  // #region agent log
  if (messages.length && openedAt != null) {
    const stale = messages.filter((m) => typeof m.time === 'number' && m.time < openedAt).length;
    if (stale > 0) {
      agentLog({
        hypothesisId: 'H1',
        location: 'server.js:hasPoliceReportInDayChat',
        message: 'police report in chat spans day boundary (stale ignored for current day)',
        runId: 'matgyeong-holgyeong',
        data: {
          policeId,
          stale,
          inWindow: inWindow.length,
          dayIndex: room.game?.dayIndex || 0
        }
      });
    }
  }
  // #endregion
  return inWindow.length > 0;
}

function syncPolicePublicIntelAfterReport(room) {
  voteIntel.publishPoliceIntelToPublic(room);
  if (voteIntel.ingestPoliceReportsFromDayChat) {
    voteIntel.ingestPoliceReportsFromDayChat(room, voteFactHelpers);
  }
}

function policeReportDayKey(room, policeId) {
  const g = room.game || {};
  return `${policeId}:${g.nightIndex || 0}:${g.dayIndex || 0}`;
}

function hasPolicePublishedReportToday(room, policeId) {
  if (!room.game?.policeDayReportPublished) return false;
  const v = room.game.policeDayReportPublished[policeReportDayKey(room, policeId)];
  return v === 'substantive' || v === true;
}

function markPolicePublishedReport(room, policeId, opts = {}) {
  if (!room.game) return;
  if (!room.game.policeDayReportPublished) room.game.policeDayReportPublished = {};
  const substantive = !!(opts && opts.substantive);
  room.game.policeDayReportPublished[policeReportDayKey(room, policeId)] = substantive
    ? 'substantive'
    : 'meta';
}

function recordPoliceInvestigation(room, policeId, targetId, isMafia) {
  if (!room.game) return;
  const target = getPlayerById(room, targetId);
  if (!target) return;
  if (!room.game.policeIntel) room.game.policeIntel = {};
  if (!room.game.policeIntel[policeId]) room.game.policeIntel[policeId] = [];
  const list = room.game.policeIntel[policeId];
  const nightIndex = room.game.nightIndex || 0;
  const existing = list.find((r) => r.nightIndex === nightIndex);
  if (existing && existing.targetId === targetId && !!existing.isMafia === !!isMafia) {
    // #region agent log
    agentLog({
      hypothesisId: 'Pc2',
      location: 'server.js:recordPoliceInvestigation',
      message: 'duplicate investigation skipped',
      runId: 'police-fix',
      data: { policeId, targetId, nightIndex }
    });
    // #endregion
    return;
  }
  if (existing && existing.targetId !== targetId) {
    // #region agent log
    agentLog({
      hypothesisId: 'Pc2',
      location: 'server.js:recordPoliceInvestigation',
      message: 'same night target replaced',
      runId: 'police-fix',
      data: {
        policeId,
        nightIndex,
        from: existing.targetId,
        to: targetId
      }
    });
    // #endregion
  }
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].nightIndex === nightIndex) list.splice(i, 1);
  }
  list.push({
    targetId,
    targetName: target.nickname,
    isMafia: !!isMafia,
    nightIndex,
    at: Date.now()
  });
}

function buildPolicePublicReport(room, policeIdOptional) {
  let police;
  if (policeIdOptional) {
    police = getPlayerById(room, policeIdOptional);
    if (!police || police.role !== ROLE.POLICE || !police.alive) return null;
  } else {
    police = Object.values(room.players).find((p) => p.role === ROLE.POLICE && p.alive);
  }
  if (!police) return null;

  const intel = getPoliceIntelForReport(room, police.id);
  if (!intel.length) {
    return {
      police,
      hasIntel: false,
      text: null
    };
  }

  const entries = [];
  for (const row of intel) {
    const t = getPlayerById(room, row.targetId);
    const name = (t && t.nickname) || row.targetName;
    if (!name || String(name).trim() === '?' || String(name).trim() === '') continue;
    entries.push({ name, isMafia: !!row.isMafia });
  }
  if (!entries.length) {
    return { police, hasIntel: false, text: null };
  }

  return {
    police,
    hasIntel: true,
    text: policeFmt.formatPoliceReportLines(entries)
  };
}

function notifyPoliceReportDraft(room, police, text) {
  if (!police || !police.userID) return;
  emitSkillNotice(police.userID, {
    scope: 'private',
    kind: 'police',
    title: '조사 결과 — 직접 채팅에 올려 주세요',
    message: text
  });
}

/** 봇 경찰만 낮 채팅에 조결을 자동 게시. 인간 경찰은 비공개 안내만. */
function postPolicePublicReport(room, policeIdOptional, opts = {}) {
  if (room.phase !== PHASE.DAY_CHAT || !room.game) return;
  const report = buildPolicePublicReport(room, policeIdOptional);
  if (!report || !report.police) return;
  const { police } = report;

  if (!police.isBot) {
    if (!report.hasIntel) {
      if (!opts.silentIfNoIntel) notifyPoliceNoIntel(room, police);
      return;
    }
    notifyPoliceReportDraft(room, police, report.text);
    console.log(`[POLICE] draft-only (human) ${police.nickname}`);
    return;
  }

  if (!report.hasIntel) {
    if (opts.silentIfNoIntel) return;
    if (hasPolicePublishedReportToday(room, police.id)) return;
    const text = '조결 요청입니다. 아직 이번 밤에 수사한 기록이 없습니다. 밤에 대상을 지목한 뒤 다시 조결해 주세요.';
    const msg = {
      from: police.nickname,
      fromId: police.id,
      text,
      time: Date.now()
    };
    pushChat(room, 'day', msg);
    broadcastToRoom(room, 'chatMessage', { channel: 'day', ...msg });
    notePublicPoliceClaim(room, police.id);
    markPolicePublishedReport(room, police.id, { substantive: false });
    console.log(`[POLICE] public report (no intel) by ${police.nickname}`);
    return;
  }

  if (hasPolicePublishedReportToday(room, police.id)) return;

  const msg = {
    from: police.nickname,
    fromId: police.id,
    text: report.text,
    time: Date.now()
  };
  pushChat(room, 'day', msg);
  chatSuspicion.ingestDayMessage(room, msg, voteFactHelpers);
  broadcastToRoom(room, 'chatMessage', { channel: 'day', ...msg });
  notePublicPoliceClaim(room, police.id);
  voteIntel.publishPoliceIntelToPublic(room);
  if (voteIntel.ingestPoliceReportsFromDayChat) {
    voteIntel.ingestPoliceReportsFromDayChat(room, voteFactHelpers);
  }
  console.log(`[POLICE] public report by ${police.nickname} intel=true`);
  markPolicePublishedReport(room, police.id, { substantive: true });
  postPoliceWithHolgyeongPair(room, police, report.text, { alreadyPosted: true });
}

function notifyPoliceNoIntel(room, police) {
  if (!police || !police.alive) return;
  emitSkillNotice(police.userID, {
    scope: 'private',
    kind: 'police',
    title: '조사 기록 없음',
    message: '밤에 대상을 고른 뒤 「마피아 조사」를 눌러야 합니다. 조사 후 낮에 경조결·조결을 채팅에 적으면 결과를 공개할 수 있습니다.'
  });
}

/** 「영매 성불」 등 채팅 요청 → 이미 성불한 결과만 공개(새 성불은 밤 1회만) */
function runBotMediumPurifyFromChat(room, mediumBot) {
  if (!room?.game || !mediumBot?.alive || mediumBot.role !== ROLE.MEDIUM) return;
  if (room.phase !== PHASE.DAY_CHAT) return;

  const na = room.game.nightActions;
  if (!na) return;

  const eligible = mediumPurify.listEligibleDead(room);
  if (!eligible.length) {
    postBotDayMessage(room, mediumBot, '지금 성불할 수 있는 사망자가 없습니다. 이번 밤에 죽은 분은 다음 밤부터 가능합니다.');
    return;
  }

  const known = mediumPurify.pickKnownDeadForAnnounce(room, mediumBot, voteFactHelpers);
  if (known) {
    const mind = getBotMind(room, mediumBot.id);
    const role = (mind.knownRoles && mind.knownRoles[known.id]) || known.role;
    const label = ROLE_LABELS[role] || role;
    const line = mediumPurify.formatPurifyAnnounce(known.nickname, label);
    postBotDayMessage(room, mediumBot, line, { mediumRevealAck: true });
    voteIntel.ingestMediumPurifyReveal(room, known.id, role, botLearnRole, mediumBot.id);
    return;
  }

  if (na.mediumResolved) {
    const next = mediumPurify.pickSuspiciousDeadTarget(room, mediumBot, voteFactHelpers);
    postBotDayMessage(
      room,
      mediumBot,
      next
        ? `이번 밤 성불은 이미 사용했습니다. 다음 밤에 ${next.nickname}님부터 성불하겠습니다.`
        : '이번 밤 성불은 이미 사용했습니다.',
      { mediumRevealAck: true }
    );
    return;
  }

  const next = mediumPurify.pickSuspiciousDeadTarget(room, mediumBot, voteFactHelpers);
  postBotDayMessage(
    room,
    mediumBot,
    next
      ? `성불은 밤에 한 번만 가능합니다. 오늘 밤 ${next.nickname}님부터 성불하겠습니다.`
      : '성불은 밤에 한 번만 할 수 있습니다. 밤에 사망자를 선택해 성불해 주세요.',
    { mediumRevealAck: true }
  );
}

function handleMediumPurifyChatRequest(room, requester) {
  if (!room.game || room.phase !== PHASE.DAY_CHAT || !hasBots(room)) return;

  const mediumBot = getBots(room).find((b) => b.alive && b.role === ROLE.MEDIUM);
  if (mediumBot) {
    const delay = 700 + Math.floor(Math.random() * 900);
    scheduleRoomTask(room, () => runBotMediumPurifyFromChat(room, mediumBot), delay);
    return;
  }

  const humanMedium = Object.values(room.players).find(
    (p) => p.alive && p.role === ROLE.MEDIUM && !p.isBot
  );
  if (!humanMedium) return;
  const eligible = mediumPurify.listEligibleDead(room);
  const bot = pickRandomCitizenBot(room, requester?.id);
  if (!bot) return;
  const reqName = requester?.nickname || '플레이어';
  const line = eligible.length
    ? `${reqName}님, ${humanMedium.nickname}님(영매)께 밤에 ${eligible[0].nickname}님부터 성불 부탁드립니다.`
    : `${humanMedium.nickname}님(영매), 밤에 사망자 성불 부탁드립니다.`;
  scheduleRoomTask(room, () => {
    if (room.phase !== PHASE.DAY_CHAT) return;
    postBotDayMessage(room, bot, line, { mediumRevealAck: true });
  }, 800 + Math.floor(Math.random() * 600));
}

/** 경조결 요청: 인간 경찰은 채팅 자동 게시 없음(비공개 안내·직접 입력만) */
function handlePoliceReportRequest(room, requester) {
  if (!room.game || room.phase !== PHASE.DAY_CHAT) return;
  const reqKey = `d${room.game.dayIndex || 0}n${room.game.nightIndex || 0}`;
  if (room.game.policeReportRequestKey === reqKey) return;
  room.game.policeReportRequestKey = reqKey;

  const policeList = Object.values(room.players).filter(
    (p) => p.role === ROLE.POLICE && p.alive
  );
  if (!policeList.length) {
    scheduleMafiaHolgyeongOnReportRequest(room);
    return;
  }

  scheduleMafiaHolgyeongOnReportRequest(room);

  const humanRequester = requester && requester.alive && requester.role === ROLE.POLICE && !requester.isBot
    ? requester
    : null;

  policeList.forEach((police, i) => {
    const delay = 320 + i * (140 + Math.floor(Math.random() * 60));
    if (humanRequester && police.id === humanRequester.id) {
      scheduleRoomTask(room, () => {
        const report = buildPolicePublicReport(room, police.id);
        if (report && report.hasIntel && report.text) {
          postPolicePublicReport(room, police.id);
        } else {
          notifyPoliceNoIntel(room, police);
        }
      }, delay);
      return;
    }
    if (!police.isBot) {
      scheduleMafiaFakeReportsInSync(room, delay + Math.floor(Math.random() * 120), {
        waveId: `report_req_${police.id}`,
        excludeIds: [police.id],
        count: 1,
        throttleMs: 800
      });
    }
    scheduleRoomTask(room, () => {
      if (police.isBot) replyBotPoliceReport(room, police);
      else postPolicePublicReport(room, police.id);
    }, delay);
  });
}

/** 경찰 봇: 조결·경찰조사 요청 시 즉시 답변 */
function replyBotPoliceReport(room, policeBot) {
  if (!policeBot || !policeBot.alive || policeBot.role !== ROLE.POLICE || !policeBot.isBot) return;
  if (room.phase !== PHASE.DAY_CHAT) return;
  const report = buildPolicePublicReport(room, policeBot.id);
  const hasIntel = !!(report && report.hasIntel && report.text);
  if (hasPolicePublishedReportToday(room, policeBot.id) || hasPoliceReportInDayChat(room, policeBot.id)) {
    // #region agent log
    agentLog({
      hypothesisId: 'Pc3',
      location: 'server.js:replyBotPoliceReport',
      message: 'duplicate substantive report blocked',
      runId: 'police-fix',
      data: { police: policeBot.nickname, hasIntel }
    });
    // #endregion
    return;
  }
  const text = hasIntel
    ? report.text
    : '조결 요청 확인했습니다. 이번 밤 수사 기록이 없습니다. 밤에 대상을 지목해 주시면 낮에 조결로 말씀드리겠습니다.';
  postPoliceWithHolgyeongPair(room, policeBot, text);
  if (hasIntel) {
    syncPolicePublicIntelAfterReport(room);
    markPolicePublishedReport(room, policeBot.id, { substantive: true });
    // #region agent log
    agentLog({
      hypothesisId: 'Pc4',
      location: 'server.js:replyBotPoliceReport',
      message: 'substantive report posted',
      runId: 'police-fix',
      data: { police: policeBot.nickname, preview: String(text).slice(0, 80) }
    });
    // #endregion
  } else {
    markPolicePublishedReport(room, policeBot.id, { substantive: false });
  }
}

/** 마피아·교주팀 봇 중 가짜 경찰 조결을 낼 수 있는 대상 (이미 비경찰 직공으로 고정된 봇 제외) */
function pickEvilPoliceBluffers(room, excludeIds = []) {
  const ex = new Set(excludeIds || []);
  return getBots(room).filter((b) => {
    if (!b.alive || ex.has(b.id) || b.role === ROLE.POLICE) return false;
    const fc = getBotMind(room, b.id).fakeClaim;
    if (fc && fc !== 'police' && fc !== 'mafia' && fc !== 'spy' && fc !== 'cult_leader') {
      return false;
    }
    if (isMafiaTeam(b.role)) {
      return m42Bluff.mayMafiaTeamBotBluffPolice(room, b, voteFactHelpers);
    }
    if (isCultMember(b)) return true;
    return false;
  });
}

/** 채팅에 진경 조결이 올라오면 홀경(맞경) 봇이 반박 조결을 스케줄 */
function maybeTriggerHolgyeongOnPoliceReport(room, speaker, reportText) {
  if (!room?.game || room.phase !== PHASE.DAY_CHAT || !hasBots(room) || !reportText) return;
  if (hasAliveHumanPolice(room)) {
    agentLog({
      hypothesisId: 'no-matgyeong-human-police',
      location: 'server.js:maybeTriggerHolgyeongOnPoliceReport',
      message: 'skip holgyeong when human police alive',
      data: { roomCode: room.code, speaker: speaker?.nickname || null }
    });
    return;
  }
  const isReport = policeFmt.looksLikePoliceReport(reportText)
    || voteFacts.isPoliceReportProviding(reportText, room);
  if (!isReport) return;
  if (speaker?.role === ROLE.POLICE) return;

  const bluffer = m42Bluff.ensureMafiaPoliceBlufferClaim(room, voteFactHelpers)
    || m42Bluff.getMafiaPoliceBlufferBot(room, voteFactHelpers);
  if (!bluffer?.alive) return;
  if (speaker?.id === bluffer.id) return;

  const blufferAlreadyPosted = getDayMessages(room).some(
    (m) => m.fromId === bluffer.id && policeFmt.looksLikePoliceReport(m.text)
  );
  const isRealPoliceSpeaker = speaker?.role === ROLE.POLICE;
  if (blufferAlreadyPosted && !isRealPoliceSpeaker) return;

  const day = room.game.dayIndex || 0;
  if (!room._holgyeongTriggered) room._holgyeongTriggered = {};
  const key = `d${day}_${speaker?.id || 'x'}_${String(reportText).slice(0, 36)}`;
  if (room._holgyeongTriggered[key]) return;
  room._holgyeongTriggered[key] = true;

  const rival = speaker && speaker.id !== bluffer.id
    ? speaker
    : (() => {
      const reps = m42Bluff.scanPoliceReporters(room, voteFactHelpers)
        .filter((r) => r.id !== bluffer.id);
      return reps.length ? getPlayerById(room, reps[0].id) : null;
    })();
  if (!rival) return;

  // #region agent log
  agentLog({
    hypothesisId: 'M',
    location: 'server.js:maybeTriggerHolgyeongOnPoliceReport',
    message: 'schedule matgyeong after police chat',
    runId: 'mafia-bluff',
    data: {
      rival: rival.nickname,
      bluffer: bluffer.nickname,
      preview: String(reportText).slice(0, 60)
    }
  });
  // #endregion

  scheduleMafiaHolgyeongAfterRealReport(room, rival, reportText, 30);
}

/** 진경 조결에 맞춘 홀경(맞경) 멘트 생성 — 당일 첫 가짜 조결(ledger) 유지 */
function buildHolgyeongResponseText(room, realPolice, realReportText) {
  if (!room.game || room.phase !== PHASE.DAY_CHAT || !hasBots(room)) return null;
  if (hasAliveHumanPolice(room)) return null;
  const bluffer = m42Bluff.ensureMafiaPoliceBlufferClaim(room, voteFactHelpers)
    || m42Bluff.getMafiaPoliceBlufferBot(room, voteFactHelpers);
  if (!bluffer?.alive || bluffer.id === realPolice?.id) return null;

  m42Bluff.ensureLedgerFromDayChat(room, bluffer.id);
  const ledger = m42Bluff.getBotPoliceBluffLedger(room, bluffer.id);
  const rival = (realPolice && realPolice.id !== bluffer.id)
    ? realPolice
    : m42Bluff.pickPoliceBluffRival(room, bluffer, voteFactHelpers);
  const bicker = rival
    ? m42Bluff.pickPoliceVersusBicker(bluffer.nickname, rival.nickname, true)
    : m42Bluff.pickMatgyeongNoRivalBicker();

  if (ledger?.line) {
    // #region agent log
    agentLog({
      hypothesisId: 'R',
      location: 'server.js:buildHolgyeongResponseText',
      message: 'holgyeong reuses ledger',
      runId: 'mafia-bluff',
      data: {
        bluffer: bluffer.nickname,
        ledgerLine: String(ledger.line).slice(0, 70),
        target: ledger.targetNickname
      }
    });
    // #endregion
    return `${bicker} ${ledger.line}`;
  }

  const parsed = voteFacts.parsePoliceReportFromText(room, realReportText || '');
  const reportOpts = {
    avoidName: realPolice?.nickname,
    preferClearMafiaAlly: true
  };
  if (parsed.innocent.length) reportOpts.forceMafia = true;
  else if (parsed.mafia.length) reportOpts.forceInnocent = true;

  const report = m42Bluff.buildFakePoliceReportLine(room, bluffer, voteFactHelpers, reportOpts);
  if (report) return `${bicker} ${report}`;
  return bicker || null;
}

/** 진경 조결 직후 홀경 봇이 맞경(우김+다른 조결)으로 응답 */
function postMafiaHolgyeongReportSync(room, realPolice, realReportText) {
  const bluffer = m42Bluff.ensureMafiaPoliceBlufferClaim(room, voteFactHelpers)
    || m42Bluff.getMafiaPoliceBlufferBot(room, voteFactHelpers);
  const text = buildHolgyeongResponseText(room, realPolice, realReportText);

  // #region agent log
  agentLog({
    hypothesisId: 'M',
    location: 'server.js:postMafiaHolgyeongReportSync',
    message: 'holgyeong report',
    runId: 'mafia-bluff',
    data: {
      bluffer: bluffer?.nickname,
      realPolice: realPolice?.nickname,
      hasText: !!text,
      preview: text ? String(text).slice(0, 70) : null
    }
  });
  // #endregion

  if (text) {
    postBotDayMessage(room, bluffer, text, { mafiaFakePolice: true, _pairedHolgyeong: true });
  }
}

/** 진경 조결 + 홀경 맞경을 거의 동시에 채팅에 올림 */
function postPoliceWithHolgyeongPair(room, policeSpeaker, policeText, opts = {}) {
  if (!room?.game || room.phase !== PHASE.DAY_CHAT || !policeSpeaker || !policeText) return;
  if (hasAliveHumanPolice(room)) {
    if (!opts.alreadyPosted && policeSpeaker.isBot) {
      postBotDayMessage(room, policeSpeaker, policeText, {
        _pairedHolgyeong: false,
        _skipHolgyeongTrigger: true
      });
    }
    return;
  }

  const mafiaTeamBots = m42Bluff.getAliveMafiaTeamBotPlayers
    ? m42Bluff.getAliveMafiaTeamBotPlayers(room, voteFactHelpers)
    : [];
  const bluffer = m42Bluff.ensureMafiaPoliceBlufferClaim(room, voteFactHelpers)
    || m42Bluff.getMafiaPoliceBlufferBot(room, voteFactHelpers);
  const canPair = !!(bluffer?.alive && bluffer.id !== policeSpeaker.id);
  const holgText = canPair ? buildHolgyeongResponseText(room, policeSpeaker, policeText) : null;

  // #region agent log
  agentLog({
    hypothesisId: 'P',
    location: 'server.js:postPoliceWithHolgyeongPair',
    message: 'police holgyeong pair',
    runId: 'mafia-bluff',
    data: {
      police: policeSpeaker.nickname,
      bluffer: bluffer?.nickname,
      mafiaBotCount: mafiaTeamBots.length,
      hasGetAlivePlayers: !!voteFactHelpers.getAlivePlayers,
      canPair,
      hasHolg: !!holgText,
      alreadyPosted: !!opts.alreadyPosted,
      previewPolice: String(policeText).slice(0, 50),
      previewHolg: holgText ? String(holgText).slice(0, 50) : null,
      ledgerTarget: m42Bluff.getBotPoliceBluffLedger(room, bluffer?.id)?.targetNickname || null
    }
  });
  // #endregion

  if (!opts.alreadyPosted) {
    if (policeSpeaker.isBot) {
      postBotDayMessage(room, policeSpeaker, policeText, {
        _pairedHolgyeong: true,
        _skipHolgyeongTrigger: true
      });
      if (policeSpeaker.role === ROLE.POLICE && policeFmt.looksLikePoliceReport(policeText)) {
        syncPolicePublicIntelAfterReport(room);
      }
    }
  }

  if (holgText) {
    if (room.game) room.game.roleRollCallOpen = true;
    const delay = Math.max(22, (opts.pairDelayMs != null ? opts.pairDelayMs : 28)
      + Math.floor(Math.random() * 32));
    const timer = setTimeout(() => {
      if (!rooms.has(room.code) || room.phase !== PHASE.DAY_CHAT) return;
      postBotDayMessage(room, bluffer, holgText, { mafiaFakePolice: true, _pairedHolgyeong: true });
      scheduleMatgyeongTikiTaka(room, policeSpeaker, bluffer);
    }, delay);
    if (!room._mafiaFakeReportTimers) room._mafiaFakeReportTimers = [];
    room._mafiaFakeReportTimers.push(timer);
  }
}

/** 맞경(진경·홀경) 직후 2~4턴 티키타카 — 조결 쌍 다음 짧은 맞받기 */
function scheduleMatgyeongTikiTaka(room, policeSpeaker, bluffer) {
  if (!room?.game || room.phase !== PHASE.DAY_CHAT || !policeSpeaker || !bluffer) return;
  if (!bluffer.alive) return;

  const day = room.game.dayIndex || 0;
  if (!room._matgyeongTikiTaka) room._matgyeongTikiTaka = {};
  const waveKey = `d${day}_${policeSpeaker.id}_${bluffer.id}`;
  if (room._matgyeongTikiTaka[waveKey]) return;
  room._matgyeongTikiTaka[waveKey] = true;

  const realPoliceBot = policeSpeaker.isBot && policeSpeaker.role === ROLE.POLICE && policeSpeaker.alive
    ? policeSpeaker
    : Object.values(room.players).find(
      (p) => p && p.alive && p.isBot && p.role === ROLE.POLICE
    );

  const rounds = realPoliceBot && realPoliceBot.id !== bluffer.id
    ? [
      { speaker: bluffer, rival: realPoliceBot, isEvil: true, delay: 720 },
      { speaker: realPoliceBot, rival: bluffer, isEvil: false, delay: 1850 },
      { speaker: bluffer, rival: realPoliceBot, isEvil: true, delay: 3050 },
      { speaker: realPoliceBot, rival: bluffer, isEvil: false, delay: 4400 }
    ]
    : [
      // 플레이어 경찰 상대 시 홀경 봇 단독 스팸 방지: 1회 반박만 허용
      { speaker: bluffer, rival: policeSpeaker, isEvil: true, delay: 900 }
    ];

  // #region agent log
  agentLog({
    hypothesisId: 'T',
    location: 'server.js:scheduleMatgyeongTikiTaka',
    message: 'matgyeong tiki-taka scheduled',
    runId: 'mafia-bluff',
    data: {
      bluffer: bluffer.nickname,
      police: policeSpeaker.nickname,
      realPoliceBot: realPoliceBot?.nickname || null,
      roundCount: rounds.length
    }
  });
  // #endregion

  if (!room._mafiaFakeReportTimers) room._mafiaFakeReportTimers = [];

  rounds.forEach((r, i) => {
    if (!r.speaker?.alive || !r.rival?.alive || !r.speaker.isBot) return;
    const jitter = Math.floor(Math.random() * 380);
    const timer = setTimeout(() => {
      if (!rooms.has(room.code) || room.phase !== PHASE.DAY_CHAT) return;
      if (!r.speaker.alive || !r.rival.alive) return;
      const line = m42Bluff.pickMatgyeongTikiTakaLine
        ? m42Bluff.pickMatgyeongTikiTakaLine(room, r.speaker, r.rival, { round: i, isEvil: r.isEvil })
        : m42Bluff.pickPoliceVersusBicker(r.speaker.nickname, r.rival.nickname, r.isEvil);
      if (!line) return;
      postBotDayMessage(room, r.speaker, line, {
        mafiaFakePolice: r.isEvil,
        policeMatgyeongBicker: true,
        _pairedHolgyeong: true
      });
    }, r.delay + jitter);
    room._mafiaFakeReportTimers.push(timer);
  });
}

function scheduleMafiaHolgyeongAfterRealReport(room, realPolice, realReportText, delayMs = 30) {
  if (!room || !realPolice) return;
  if (hasAliveHumanPolice(room)) return;
  const delay = Math.max(22, delayMs + Math.floor(Math.random() * 35));
  const timer = setTimeout(() => {
    if (!rooms.has(room.code) || room.phase !== PHASE.DAY_CHAT) return;
    postMafiaHolgyeongReportSync(room, realPolice, realReportText);
  }, delay);
  if (!room._mafiaFakeReportTimers) room._mafiaFakeReportTimers = [];
  room._mafiaFakeReportTimers.push(timer);
}

/**
 * 진경 조결과 거의 동시에 가짜 조결 (늦경 방지).
 * baseDelayMs: 진경이 조결을 내는 시점과 맞춤.
 */
function scheduleMafiaFakeReportsInSync(room, baseDelayMs, opts = {}) {
  if (!room.game || room.phase !== PHASE.DAY_CHAT || !hasBots(room)) return;

  const waveId = opts.waveId || 'sync';
  const throttleMs = opts.throttleMs != null ? opts.throttleMs : 1600;
  const now = Date.now();
  if (!room._mafiaFakeReportAt) room._mafiaFakeReportAt = {};
  if (room._mafiaFakeReportAt[waveId] && now - room._mafiaFakeReportAt[waveId] < throttleMs) {
    return;
  }
  room._mafiaFakeReportAt[waveId] = now;

  m42Bluff.ensureMafiaPoliceBlufferClaim(room, voteFactHelpers);

  const reporter = opts.reporterId ? getPlayerById(room, opts.reporterId) : null;
  if (reporter && opts.useHolgyeongSync !== false) {
    const recent = getDayMessages(room).filter((m) => m.fromId === reporter.id).pop();
    const timer = setTimeout(() => {
      postMafiaHolgyeongReportSync(room, reporter, recent?.text || opts.realReportText);
    }, Math.max(0, baseDelayMs || 0));
    if (!room._mafiaFakeReportTimers) room._mafiaFakeReportTimers = [];
    room._mafiaFakeReportTimers.push(timer);
    return;
  }

  const blufferOnly = m42Bluff.getMafiaPoliceBlufferBot(room, voteFactHelpers);
  const pool = blufferOnly
    ? [blufferOnly]
    : pickEvilPoliceBluffers(room, opts.excludeIds || []);
  if (!pool.length) {
    // #region agent log
    agentLog({
      hypothesisId: 'M',
      location: 'server.js:scheduleMafiaFakeReportsInSync',
      message: 'no evil police bluffers',
      runId: 'mafia-bluff',
      data: { waveId, realPolice: isRealPoliceAlive(room) }
    });
    // #endregion
    return;
  }

  const count = Math.min(pool.length, opts.count != null ? opts.count : 1);
  const picked = blufferOnly ? [blufferOnly] : shuffle(pool).slice(0, count);
  const avoidName = reporter ? reporter.nickname : opts.avoidName;

  if (!room._mafiaFakeReportTimers) room._mafiaFakeReportTimers = [];

  picked.forEach((bluffer, i) => {
    const stagger = opts.staggerMs != null ? opts.staggerMs : 45;
    const jitter = Math.floor(Math.random() * (opts.jitterMs != null ? opts.jitterMs : 95));
    const delay = Math.max(0, (baseDelayMs || 0) + i * stagger + jitter);
    const timer = setTimeout(() => {
      if (!rooms.has(room.code) || room.phase !== PHASE.DAY_CHAT) return;
      let text = m42Bluff.buildMatgyeongCounterClaim
        ? m42Bluff.buildMatgyeongCounterClaim(room, bluffer, voteFactHelpers)
        : null;
      if (!text || opts.forceReportOnly) {
        text = m42Bluff.buildFakePoliceReportLine(room, bluffer, voteFactHelpers, {
          forceInnocent: opts.forceInnocent !== false,
          preferClearMafiaAlly: opts.preferClearMafiaAlly !== false,
          avoidName
        });
      }
      // #region agent log
      agentLog({
        hypothesisId: 'M',
        location: 'server.js:mafiaFakeReportTimer',
        message: 'mafia fake report attempt',
        runId: 'mafia-bluff',
        data: {
          bot: bluffer.nickname,
          waveId,
          hasText: !!text,
          preview: text ? String(text).slice(0, 60) : null,
          fakeClaim: getBotMind(room, bluffer.id).fakeClaim
        }
      });
      // #endregion
      if (text) postBotDayMessage(room, bluffer, text, { mafiaFakePolice: true });
    }, delay);
    room._mafiaFakeReportTimers.push(timer);
  });
}

/** 진경이 살아 있어도 홀경 봇이 낮에 가짜 조결·맞경을 냄 */
function scheduleMafiaBluffWhileRealPolice(room) {
  if (!room.game || room.phase !== PHASE.DAY_CHAT || !hasBots(room)) return;
  if (!isRealPoliceAlive(room)) return;

  const bluffer = m42Bluff.ensureMafiaPoliceBlufferClaim(room, voteFactHelpers);
  if (!bluffer) return;

  const wave = `real_police_d${room.game.dayIndex || 0}`;
  if (!room._mafiaBluffPoliceWave) room._mafiaBluffPoliceWave = {};
  if (room._mafiaBluffPoliceWave[wave]) return;
  room._mafiaBluffPoliceWave[wave] = true;

  const tryHolgyeong = () => {
    if (room.phase !== PHASE.DAY_CHAT || !isRealPoliceAlive(room)) return;
    const reps = m42Bluff.scanPoliceReporters(room, voteFactHelpers);
    const blufferPosted = getDayMessages(room).some(
      (m) => m.fromId === bluffer.id && policeFmt.looksLikePoliceReport(m.text)
    );
    if (blufferPosted || reps.length >= 2) return;
    const rival = reps.find((r) => r.id !== bluffer.id);
    if (!rival) return;
    const sp = getPlayerById(room, rival.id);
    const last = getDayMessages(room).filter(
      (m) => m.fromId === rival.id && policeFmt.looksLikePoliceReport(m.text)
    ).pop();
    postMafiaHolgyeongReportSync(room, sp, last?.text || '');
  };

  [900, 3200, 6500, 15000, 30000, 50000].forEach((ms) => {
    const timer = setTimeout(tryHolgyeong, ms);
    if (!room._mafiaFakeReportTimers) room._mafiaFakeReportTimers = [];
    room._mafiaFakeReportTimers.push(timer);
  });
}

/** 홀경 조결 직후 마피아 봇이 맞경(둘째 경찰) 조결 — 진경과 동시권 */
function scheduleMafiaMatgyeongAfterReport(room, reporterId, reportText) {
  if (!room.game || room.phase !== PHASE.DAY_CHAT || !reporterId) return;
  const reporter = getPlayerById(room, reporterId);
  if (!reporter) return;
  const text = reportText
    || getDayMessages(room).filter((m) => m.fromId === reporterId).pop()?.text
    || '';
  scheduleMafiaHolgyeongAfterRealReport(room, reporter, text, 30);
}

/** 경조결 요청 시 진경이 없으면 마피아가 먼저 가짜 조결 (늦경 방지) */
function scheduleMafiaHolgyeongOnReportRequest(room) {
  if (!room.game || room.phase !== PHASE.DAY_CHAT || !hasBots(room)) return;
  const hasReport = getDayMessages(room).some(
    (m) => m && m.text && policeFmt.looksLikePoliceReport(m.text)
  );
  if (hasReport) return;

  const policeAlive = Object.values(room.players).some(
    (p) => p.role === ROLE.POLICE && p.alive
  );
  if (policeAlive) {
    scheduleMafiaFakeReportsInSync(room, 350 + Math.floor(Math.random() * 450), {
      waveId: 'holgyeong_req_real_police',
      count: 1,
      throttleMs: 1400,
      forceInnocent: false
    });
    return;
  }

  const mafiaBots = getBots(room).filter(
    (b) => b.alive && isMafiaTeam(b.role) && b.role !== ROLE.POLICE
      && m42Bluff.mayMafiaTeamBotBluffPolice(room, b, voteFactHelpers)
  );
  if (!mafiaBots.length) return;

  const bluffer = mafiaBots[Math.floor(Math.random() * mafiaBots.length)];
  scheduleRoomTask(room, () => {
    if (room.phase !== PHASE.DAY_CHAT) return;
    const text = m42Bluff.buildFakePoliceReportLine(room, bluffer, voteFactHelpers);
    if (text) postBotDayMessage(room, bluffer, text);
  }, 280 + Math.floor(Math.random() * 320));
}

function getDayMessages(room) {
  return (room.chatLog && room.chatLog.day) ? room.chatLog.day : [];
}

/** 진경 봇: 낮에 조결·맞경·투표로 시민 주도 멘트를 주기적으로 올림 */
/** 맞직 갈등 시 봇 티키타카·의심·검증 멘트 */
function scheduleMatClaimDayPlaybook(room) {
  if (!room.game || room.phase !== PHASE.DAY_CHAT || !hasBots(room)) return;
  if (!room.game.roleRollCallOpen) return;
  if (!m42Matclaim.hasActiveMatConflicts(room, voteFactHelpers)) return;

  const waveKey = `d${room.game.dayIndex || 0}_n${room.game.nightIndex || 0}`;
  if (!room._matClaimPlaybookWave) room._matClaimPlaybookWave = {};
  if (room._matClaimPlaybookWave[waveKey]) return;
  room._matClaimPlaybookWave[waveKey] = true;

  const slots = [
    { delay: 5400, kind: 'suspect' },
    { delay: 10200, kind: 'tiki', round: 0 },
    { delay: 15100, kind: 'tiki', round: 1 },
    { delay: 20800, kind: 'suspect' },
    { delay: 26500, kind: 'tiki', round: 2 },
    { delay: 32200, kind: 'defend' }
  ];

  // #region agent log
  agentLog({
    hypothesisId: 'Mc3',
    location: 'server.js:scheduleMatClaimDayPlaybook',
    message: 'mat claim day playbook scheduled',
    runId: 'matclaim',
    data: {
      conflicts: m42Matclaim.scanMatClaimConflicts(room, voteFactHelpers).map((c) => ({
        role: c.role,
        n: c.claimants.length,
        names: c.claimants.map((x) => x.nickname)
      }))
    }
  });
  // #endregion

  slots.forEach((slot, slotIdx) => {
    scheduleRoomTask(room, () => {
      if (room.phase !== PHASE.DAY_CHAT) return;
      if (!m42Matclaim.hasActiveMatConflicts(room, voteFactHelpers)) return;

      const bots = shuffle(getBots(room).filter((b) => b.alive)).slice(0, 2);
      bots.forEach((bot, bi) => {
        scheduleRoomTask(room, () => {
          if (room.phase !== PHASE.DAY_CHAT || !bot.alive) return;
          let line = null;
          if (slot.kind === 'suspect') {
            line = m42Matclaim.pickMatClaimSuspectLine(room, bot, voteFactHelpers, { round: slot.round });
          } else if (slot.kind === 'tiki') {
            line = m42Matclaim.pickMatClaimTikiTakaLine(room, bot, voteFactHelpers, {
              round: slot.round,
              conflictIndex: slotIdx + bi
            });
          } else {
            line = m42Matclaim.pickMatClaimTikiTakaLine(room, bot, voteFactHelpers, { round: 3 })
              || m42Matclaim.pickMatClaimSuspectLine(room, bot, voteFactHelpers);
          }
          if (line) postBotDayMessage(room, bot, line, { matClaimTikiTaka: true });
        }, bi * (420 + Math.floor(Math.random() * 280)));
      });
    }, slot.delay + Math.floor(Math.random() * 450));
  });
}

/** 맞직 주장자가 밤에 죽었을 때 성불·조사·취재 검증 유도 */
function scheduleMatClaimDeathAnalysis(room) {
  const report = room.game?.lastNightReport;
  if (!report?.deaths?.length || !hasBots(room)) return;

  const deathIds = report.deaths.map((d) => d.id || d);
  const deadMat = m42Matclaim.findDeadMatClaimants(room, voteFactHelpers, deathIds);
  if (!deadMat.length) return;

  const waveKey = `d${room.game.dayIndex || 0}_dead`;
  if (!room._matClaimDeathWave) room._matClaimDeathWave = {};
  if (room._matClaimDeathWave[waveKey]) return;
  room._matClaimDeathWave[waveKey] = true;

  // #region agent log
  agentLog({
    hypothesisId: 'Mc2',
    location: 'server.js:scheduleMatClaimDeathAnalysis',
    message: 'dead mat claimant analysis scheduled',
    runId: 'matclaim',
    data: { dead: deadMat.map((d) => ({ name: d.name, matRoles: d.matRoles })) }
  });
  // #endregion

  const bots = shuffle(getBots(room).filter((b) => b.alive));
  deadMat.forEach((deadInfo, i) => {
    const bot = bots[i % bots.length];
    if (!bot) return;
    scheduleRoomTask(room, () => {
      if (room.phase !== PHASE.DAY_CHAT) return;
      const line = m42Matclaim.pickDeadClaimantAnalysisLine(room, bot, voteFactHelpers, deadInfo);
      if (line) postBotDayMessage(room, bot, line, { matClaimTikiTaka: true });
    }, 2600 + i * (1900 + Math.floor(Math.random() * 500)));
  });
}

function schedulePoliceCitizenDayPlaybook(room) {
  if (!room.game || room.phase !== PHASE.DAY_CHAT || !hasBots(room)) return;
  const policeBot = Object.values(room.players).find(
    (p) => p && p.alive && p.isBot && p.role === ROLE.POLICE
  );
  if (!policeBot) return;

  const waveKey = `d${room.game.dayIndex || 0}_n${room.game.nightIndex || 0}`;
  if (!room._policeCitizenWave) room._policeCitizenWave = {};
  if (room._policeCitizenWave[waveKey]) return;
  room._policeCitizenWave[waveKey] = true;

  const waves = [3800, 9200, 14800, 20500];
  waves.forEach((baseMs, waveIndex) => {
    scheduleRoomTask(room, () => {
      if (room.phase !== PHASE.DAY_CHAT || !policeBot.alive) return;
      if (waveIndex > 0 && !hasPolicePublishedReportToday(room, policeBot.id)
        && !hasPoliceReportInDayChat(room, policeBot.id)) {
        return;
      }
      const line = m42PoliceCitizen.pickScheduledCitizenLine(
        room,
        policeBot,
        voteFactHelpers,
        waveIndex
      );
      if (!line) return;
      if (waveIndex === 0) {
        const report = buildPolicePublicReport(room, policeBot.id);
        if (report && report.hasIntel && report.text
          && !hasPoliceReportInDayChat(room, policeBot.id)
          && !hasPolicePublishedReportToday(room, policeBot.id)) {
          replyBotPoliceReport(room, policeBot);
          return;
        }
      }
      if (policeBot.role === ROLE.POLICE) {
        m42PoliceCitizen.applyMatgyeongStrategyEffects(room, policeBot, line, voteFactHelpers);
      }
      postBotDayMessage(room, policeBot, line, { policeCitizenLead: true });
    }, baseMs + Math.floor(Math.random() * 500));
  });
}

/** 낮 시작 직후 마피아 홀경 — 가짜 조결로 먼저 말함 (직공 메타 없음) */
function scheduleMafiaEarlyPoliceBluff(room) {
  if (!room.game || room.phase !== PHASE.DAY_CHAT || !hasBots(room)) return;
  if (isRealPoliceAlive(room)) return;
  const mafiaBots = getBots(room).filter(
    (b) => b.alive && isMafiaTeam(b.role) && b.role !== ROLE.POLICE
      && m42Bluff.mayMafiaTeamBotBluffPolice(room, b, voteFactHelpers)
  );
  if (!mafiaBots.length) return;
  const bluffer = mafiaBots[Math.floor(Math.random() * mafiaBots.length)];
  scheduleRoomTask(room, () => {
    if (room.phase !== PHASE.DAY_CHAT) return;
    const day1 = (room.game?.dayIndex || 0) <= 1;
    const reporters = m42Bluff.scanPoliceReporters(room, voteFactHelpers);
    if (!day1 && reporters.length >= 2) return;
    const text = day1 || reporters.length === 0
      ? m42Bluff.buildFakePoliceReportLine(room, bluffer, voteFactHelpers)
      : m42Bluff.buildMatgyeongCounterClaim(room, bluffer, voteFactHelpers);
    if (text) postBotDayMessage(room, bluffer, text);
  }, 800 + Math.floor(Math.random() * 600));
}

/** 누가 요청해도 생존 경찰(사람·봇)이 조결 응답 */
function schedulePoliceReportResponses(room) {
  if (!room.game || room.phase !== PHASE.DAY_CHAT) return;
  const policeList = Object.values(room.players).filter(
    (p) => p.role === ROLE.POLICE && p.alive
  );
  if (!policeList.length) {
    scheduleMafiaHolgyeongOnReportRequest(room);
    return;
  }
  policeList.forEach((police, i) => {
    const delay = 320 + i * (140 + Math.floor(Math.random() * 60));
    if (police.isBot) {
      scheduleRoomTask(room, () => replyBotPoliceReport(room, police), delay);
    } else {
      scheduleRoomTask(room, () => postPolicePublicReport(room, police.id), delay);
    }
  });
}

function schedulePolicePublicReport(room, policeId) {
  if (!room.game || room.phase !== PHASE.DAY_CHAT || !policeId) return;
  if (room._policeReportTimer) clearTimeout(room._policeReportTimer);
  room._policeReportTimer = setTimeout(() => {
    room._policeReportTimer = null;
    if (room.phase !== PHASE.DAY_CHAT) return;
    postPolicePublicReport(room, policeId);
  }, 350);
}

function buildSuspicionScores(room, voter, opts = {}) {
  const skipBotHumanBias = !!opts.skipBotHumanBias;
  const now = Date.now();
  if (!skipBotHumanBias && room._susCache && room._susCache.voterId === voter.id && now - room._susCache.at < 2500) {
    return room._susCache.scores;
  }

  const scores = {};
  const g = room.game;
  const aliveOthers = getAlivePlayers(room).filter(p => p.id !== voter.id);
  aliveOthers.forEach(p => { scores[p.id] = 0; });

  const dayChat = getChatMessages(room, 'day');
  const accuseCount = {};
  const defendCount = {};
  const trustCount = {};

  for (const msg of dayChat) {
    if (msg.system || !msg.text) continue;
    const text = msg.text;
    const mentioned = findPlayersMentionedInText(room, text);
    const accuse = CHAT_ACCUSE_PATTERNS.some(p => p.test(text));
    const defend = CHAT_DEFEND_PATTERNS.some(p => p.test(text));
    const trust = CHAT_TRUST_PATTERNS.some(p => p.test(text));

    if (accuse) {
      for (const id of mentioned) {
        if (id === voter.id) continue;
        accuseCount[id] = (accuseCount[id] || 0) + 1;
      }
    }
    if (defend && msg.fromId) {
      defendCount[msg.fromId] = (defendCount[msg.fromId] || 0) + 1;
      for (const id of mentioned) {
        if (id !== msg.fromId) scores[id] = Math.max(0, (scores[id] || 0) - 1);
      }
    }
    if (trust && msg.fromId) {
      trustCount[msg.fromId] = (trustCount[msg.fromId] || 0) + 1;
      for (const id of mentioned) {
        if (id !== msg.fromId) scores[id] = Math.max(0, (scores[id] || 0) - 2);
      }
    }

    for (const id of mentioned) {
      if (id === voter.id) continue;
      const target = getPlayerById(room, id);
      if (!target || !target.alive) continue;
      if (accuse) scores[id] = (scores[id] || 0) + 3 + (accuseCount[id] || 0);
      if (defend && msg.fromId === id) scores[id] = Math.max(0, (scores[id] || 0) - 2);
    }

    if (/투표|지목|처형/.test(text)) {
      for (const id of mentioned) {
        if (id !== voter.id) scores[id] = (scores[id] || 0) + 2;
      }
    }
  }

  const chatCounts = countChatMessagesByPlayer(room, 'day');
  const avgChat = aliveOthers.length
    ? aliveOthers.reduce((s, p) => s + (chatCounts[p.id] || 0), 0) / aliveOthers.length
    : 0;
  for (const p of aliveOthers) {
    const c = chatCounts[p.id] || 0;
    if (avgChat >= 2 && c === 0) scores[p.id] = (scores[p.id] || 0) + 2;
    if (c >= avgChat * 2 && accuseCount[p.id]) scores[p.id] = (scores[p.id] || 0) + 1;
  }

  if (g && g.dayVotes) {
    const voteTally = buildDayVoteTally(room);
    for (const [id, count] of Object.entries(voteTally)) {
      if (id === voter.id) continue;
      scores[id] = (scores[id] || 0) + count * 2;
    }
  }

  const mind = getBotMind(room, voter.id);
  for (const [id, role] of Object.entries(mind.knownRoles)) {
    const p = getPlayerById(room, id);
    if (!p || !p.alive || id === voter.id) continue;
    if (isMafiaTeam(voter.role)) {
      if (!isMafiaTeam(role)) scores[id] = (scores[id] || 0) + 5;
    } else if (isMafiaRole(role)) {
      scores[id] = (scores[id] || 0) + 8;
    } else if (role === ROLE.SPY) {
      scores[id] = (scores[id] || 0) + 6;
    }
  }


  if (accuseCount[voter.id] >= 2) {
    for (const p of aliveOthers) {
      if (accuseCount[p.id]) scores[p.id] = Math.max(0, (scores[p.id] || 0) - 2);
    }
  }

  if (isMafiaTeam(voter.role)) {
    for (const p of aliveOthers) {
      if (isMafiaTeam(p.role)) scores[p.id] = 0;
      else {
        const powerRoles = [ROLE.POLICE, ROLE.DOCTOR, ROLE.REPORTER];
        if (powerRoles.includes(p.role)) scores[p.id] = (scores[p.id] || 0) + 4;
        scores[p.id] = (scores[p.id] || 0) + 2;
      }
    }
  } else {
    for (const p of aliveOthers) {
      if (trustCount[p.id] >= 2) scores[p.id] = Math.max(0, (scores[p.id] || 0) - 3);
    }
  }

  const chatScores = chatSuspicion.getSuspicionScores(room, voter, voteFactHelpers);
  for (const p of aliveOthers) {
    const chatW = chatScores[p.id] || 0;
    if (chatW > 0) scores[p.id] = (scores[p.id] || 0) + chatW * 2;
  }

  if (voter.isBot && !skipBotHumanBias) {
    const pileOn = {};
    for (const msg of dayChat.slice(-14)) {
      if (msg.system || !msg.text || !msg.fromId) continue;
      if (!CHAT_ACCUSE_PATTERNS.some((re) => re.test(msg.text))) continue;
      for (const id of findPlayersMentionedInText(room, msg.text)) {
        if (id !== voter.id) pileOn[id] = (pileOn[id] || 0) + 1;
      }
    }
    for (const [id, n] of Object.entries(pileOn)) {
      if (n >= 2) scores[id] = (scores[id] || 0) + n * 3;
    }
  }

  for (const p of aliveOthers) {
    if (!p.alive) scores[p.id] = 0;
  }
  for (const p of Object.values(room.players)) {
    if (!p.alive && scores[p.id] != null) scores[p.id] = 0;
  }

  voteFacts.ingestVoteIntelFromChat(room, voteFactHelpers);
  for (const p of aliveOthers) {
    if (voteFacts.isDayVoteTargetForbidden(room, voter, p.id, voteFactHelpers)) {
      scores[p.id] = 0;
    }
  }

  const m42CultBots = require('./lib/m42-cult-bots');
  if (m42Cult.isCultMember(voter)) {
    for (const p of aliveOthers) {
      if (m42CultBots.isCultAlly(room, voter, p)) scores[p.id] = 0;
    }
  }

  if (!skipBotHumanBias) {
    room._susCache = { voterId: voter.id, at: Date.now(), scores };
  }
  return scores;
}

function pickWeightedFromScores(scores, excludeIds = []) {
  const entries = Object.entries(scores)
    .filter(([id, w]) => w > 0 && !excludeIds.includes(id));
  if (!entries.length) return null;
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = Math.random() * total;
  for (const [id, w] of entries) {
    roll -= w;
    if (roll <= 0) return id;
  }
  return entries[entries.length - 1][0];
}

function pickTopSuspect(room, bot, { excludeMafiaTeam = false, skipBotHumanBias = false } = {}) {
  const scores = buildSuspicionScores(room, bot, { skipBotHumanBias });
  const sorted = Object.entries(scores)
    .filter(([id]) => id !== bot.id)
    .sort((a, b) => b[1] - a[1]);
  for (const [id] of sorted) {
    const p = getPlayerById(room, id);
    if (!p || !p.alive) continue;
    if (excludeMafiaTeam && isMafiaTeam(p.role)) continue;
    return id;
  }
  return null;
}

function sanitizeBotDayVoteTarget(room, bot, targetId) {
  if (!targetId) return null;
  if (targetId === bot.id) {
    if (voteFacts.isJatuCoordinationDay(room)) return bot.id;
    return null;
  }
  if (voteFacts.isDayVoteTargetForbidden(room, bot, targetId, voteFactHelpers)) {
    return null;
  }
  return targetId;
}

function pickBotDayVoteTarget(room, bot) {
  voteFacts.ingestVoteIntelFromChat(room, voteFactHelpers);
  voteFacts.syncJatuCoordinationFromDayChat(room, voteFactHelpers);

  const logVotePath = (path, targetId) => {
    // #region agent log
    agentLog({
      hypothesisId: 'VotePile',
      location: 'server.js:pickBotDayVoteTarget',
      message: 'bot day vote target picked',
      runId: 'vote-pile',
      data: {
        bot: bot.nickname,
        role: bot.role,
        path,
        target: targetId ? playerName(room, targetId) : null,
        chatAccusers: targetId
          ? voteFacts.countRecentChatAccusers(room, targetId, voteFactHelpers)
          : 0,
        jatuDay: voteFacts.isJatuCoordinationDay(room),
        selfVote: targetId === bot.id
      }
    });
    // #endregion
  };

  const resolve = (path, rawId) => {
    const id = sanitizeBotDayVoteTarget(room, bot, rawId);
    if (id) logVotePath(path, id);
    return id;
  };

  if (isMafiaTeam(bot.role)) {
    const mafiaJatu = resolve(
      'jatu_coordination',
      voteFacts.pickJatuCoordinationDayVote(room, bot, voteFactHelpers)
    );
    if (mafiaJatu) return mafiaJatu;
    const mafiaTarget = resolve(
      'mafia_team',
      voteFacts.pickMafiaTeamDayVote(room, bot, voteFactHelpers)
    );
    if (mafiaTarget) return mafiaTarget;
  }

  const policeMafia = resolve(
    'police_or_chat_accuse',
    voteFacts.pickPoliceAccusedMafia(room, bot, voteFactHelpers)
  );
  if (policeMafia) return policeMafia;

  const jatuCoord = resolve(
    'jatu_coordination',
    voteFacts.pickJatuCoordinationDayVote(room, bot, voteFactHelpers)
  );
  if (jatuCoord) return jatuCoord;

  if (
    !isMafiaTeam(bot.role)
    && voteFacts.isJatuCoordinationDay(room)
    && !voteFacts.hasConfirmedMafiaTarget(room, bot, voteFactHelpers)
  ) {
    return null;
  }

  if (!isMafiaTeam(bot.role)) {
    const matAfterRealDead = resolve(
      'matgyeong_after_real_police_death',
      voteFacts.pickMatgyeongAfterRealPoliceDeathVote(room, bot, voteFactHelpers)
    );
    if (matAfterRealDead) return matAfterRealDead;

    const matPolice = resolve(
      'matgyeong_police',
      voteFacts.pickMatgyeongPoliceDayVote(room, bot, voteFactHelpers)
    );
    if (matPolice) return matPolice;
  }

  const chatPile = resolve(
    'chat_pile_on',
    voteFacts.pickChatPileOnDayVote(room, bot, voteFactHelpers)
  );
  if (chatPile) return chatPile;

  const factTarget = resolve(
    'fact',
    voteFacts.pickFactBasedDayVote(room, bot, voteFactHelpers)
  );
  if (factTarget) return factTarget;

  const consensus = resolve(
    'consensus',
    voteFacts.pickConsensusDayVote(room, bot, voteFactHelpers)
  );
  if (consensus) return consensus;

  const chatKeyword = resolve(
    'chat_keyword',
    voteFacts.pickChatKeywordDayVote(room, bot, voteFactHelpers)
  );
  if (chatKeyword) return chatKeyword;

  const fallback = resolve(
    'fallback',
    voteFacts.pickFallbackDayVoteTarget(room, bot, voteFactHelpers)
  );
  if (fallback) return fallback;

  const consolidated = resolve(
    'consolidated',
    voteFacts.pickConsolidatedDayVote(room, bot, voteFactHelpers)
  );
  return consolidated;
}

function pickBotExecutionVoteFromFacts(room, bot, candidate) {
  return voteFacts.pickFactBasedExecutionVote(room, bot, candidate, voteFactHelpers);
}

const voteFactHelpers = {
  isMafiaTeam,
  isMafiaRole,
  getPlayerById,
  getAlivePlayers,
  getBotMind,
  getChatMessages,
  buildSuspicionScores,
  botLearnRole,
  buildDayVoteTally
};

/** Day-chat accuse target: skill 팩트로 확인된 대상만 (추측 지목 금지) */
function pickBotChatAccuseTarget(room, bot) {
  return voteFacts.pickFactChatAccuseTarget(room, bot, voteFactHelpers);
}

botBrain.configure({
  ROLE_LABELS,
  isMafiaTeam,
  isMafiaRole,
  getPlayerById,
  getAlivePlayers,
  getChatMessages,
  buildSuspicionScores,
  pickBotChatAccuseTarget,
  pickBotDayVoteTarget,
  pickFactChatAccuseTarget: (room, bot) => voteFacts.pickFactChatAccuseTarget(room, bot, voteFactHelpers),
  pickFactBasedExecutionVote: pickBotExecutionVoteFromFacts,
  getClearedPlayerIds: (room, bot) => voteFacts.getClearedIds(room, bot, voteFactHelpers),
  isPlayerClearedByFacts: (room, bot, id) => voteFacts.isDayVoteTargetForbidden(room, bot, id, voteFactHelpers),
  parsePoliceReportFromText: (room, text) => voteFacts.parsePoliceReportFromText(room, text),
  getAccuseReasonForTarget: (room, bot, id) => voteFacts.getAccuseReasonForTarget(room, bot, id, voteFactHelpers),
  formatAccuseLine: (room, bot, id, speaker) => voteFacts.formatAccuseLine(room, bot, id, voteFactHelpers, speaker),
  getBotMind,
  getBotFakeClaim: (room, botId) => m42Bluff.getBotFakeClaim(room, botId, voteFactHelpers),
  setBotFakeClaim: (room, botId, role, opts = {}) => {
    m42Bluff.setBotFakeClaim(room, botId, role, voteFactHelpers, opts);
  },
  isPoliceReportRequest,
  isPoliceReportProviding: (text, r) => voteFacts.isPoliceReportProviding(text, r),
  buildPolicePublicReport,
  hasPolicePublishedReportToday,
  hasPoliceReportInDayChat,
  getPoliceIntelForReport,
  isRoleClaimRequest,
  isRoleRollCallQuestion,
  isPublicPoliceClaim: (room, playerId) => !!(room.game?.publicPoliceClaimIds?.[playerId]),
  getPublicPoliceClaimTargets: (room, excludeId) => getPublicPoliceClaimTargets(room, excludeId),
  isSelfVoteRequest
});

Object.assign(voteFactHelpers, {
  buildPolicePublicReport,
  hasPolicePublishedReportToday,
  hasPoliceReportInDayChat
});

function pickBotKillTarget(room, mafiaBot) {
  const scores = buildSuspicionScores(room, mafiaBot);
  const firstNight = room.game && room.game.nightIndex <= 1;
  for (const p of getAlivePlayers(room)) {
    if (isMafiaTeam(p.role)) scores[p.id] = 0;
    if ([ROLE.POLICE, ROLE.DOCTOR, ROLE.REPORTER, ROLE.PRIVATE_DETECTIVE].includes(p.role)) {
      let bonus = 5;
      if (firstNight && p.role === ROLE.POLICE) bonus = 1;
      if (p.role === ROLE.PRIVATE_DETECTIVE) bonus = 3;
      scores[p.id] = (scores[p.id] || 0) + bonus;
    }
  }
  return pickWeightedFromScores(scores, [mafiaBot.id]) || pickRandomTarget(room, mafiaBot, { excludeMafiaTeam: true });
}

function pickMafiaKillConsensus(room, leadMafia) {
  const mafiaAlive = getAlivePlayers(room).filter((p) => p.role === ROLE.MAFIA);
  const lead = leadMafia || mafiaAlive[0];
  if (!lead) return null;
  const targetId = pickBotKillTarget(room, lead) || pickRandomTarget(room, lead, { excludeMafiaTeam: true });
  if (!targetId) return null;
  const valid = validateNightTarget(room, lead, targetId);
  return valid.ok ? targetId : null;
}

function applyBotMafiaKillVote(room, mafiaBot) {
  const actions = room.game?.nightActions;
  if (!actions || room.phase !== PHASE.NIGHT) return false;
  if (!actions.mafiaVotes) actions.mafiaVotes = {};
  if (actions.mafiaVotes[mafiaBot.id]) return false;
  const targetId = pickMafiaKillConsensus(room, mafiaBot);
  if (!targetId) return false;
  actions.mafiaVotes[mafiaBot.id] = targetId;
  rememberNightActor(room, mafiaBot.id, 'mafia_kill', targetId);
  console.log(`[BOT] ${mafiaBot.nickname} mafia-kill -> ${playerName(room, targetId)}`);
  return true;
}

function pickBotHealTarget(room, doctorBot) {
  if ((room.game?.nightIndex || 0) <= 1) {
    const claimants = m42Bluff.scanPoliceReporters(room, voteFactHelpers)
      .map((r) => getPlayerById(room, r.id))
      .filter((p) => p && p.alive && p.id !== doctorBot.id);
    if (claimants.length >= 2) {
      const pick = claimants[Math.floor(Math.random() * Math.min(2, claimants.length))];
      agentLog({
        hypothesisId: 'doctor-night1-matched-heal',
        location: 'server.js:pickBotHealTarget',
        message: 'doctor heals one of matched police claimants',
        data: { doctor: doctorBot.nickname, target: pick.nickname, nightIndex: room.game?.nightIndex || 0 }
      });
      return pick.id;
    }
  }
  if ((room.game?.nightIndex || 0) <= 1) {
    agentLog({
      hypothesisId: 'doctor-night1-self-heal',
      location: 'server.js:pickBotHealTarget',
      message: 'force doctor self-heal on first night',
      data: { doctor: doctorBot.nickname, nightIndex: room.game?.nightIndex || 0 }
    });
    return doctorBot.id;
  }

  const healHintId = room.game?.botDoctorHealHintPlayerId;
  if (healHintId != null) {
    const hintP = getPlayerById(room, healHintId);
    if (hintP && hintP.alive && hintP.id !== doctorBot.id) {
      delete room.game.botDoctorHealHintPlayerId;
      agentLog({
        hypothesisId: 'H_pd_doctor_heal_hint',
        location: 'server.js:pickBotHealTarget',
        message: 'doctor bot follows PD heal hint',
        runId: 'pd-heal-hint',
        data: { doctor: doctorBot.nickname, target: hintP.nickname, targetRole: hintP.role }
      });
      return hintP.id;
    }
    delete room.game.botDoctorHealHintPlayerId;
  }

  const revealedPolice = getPublicPoliceClaimTargets(room, doctorBot.id);
  const killTarget = getMafiaKillTarget(room);

  if (revealedPolice.length) {
    const policeHit = killTarget && revealedPolice.some((p) => p.id === killTarget);
    if (policeHit) return killTarget;
    if (Math.random() < 0.88) {
      return revealedPolice[Math.floor(Math.random() * revealedPolice.length)].id;
    }
  }

  if (killTarget && killTarget !== doctorBot.id && Math.random() < 0.55) {
    return killTarget;
  }

  const alive = getAlivePlayers(room).filter((p) => p.id !== doctorBot.id);
  const humans = alive.filter((p) => !p.isBot);
  const powerRoles = [ROLE.POLICE, ROLE.REPORTER, ROLE.SOLDIER, ROLE.POLITICIAN];
  const powerHumans = humans.filter((p) => powerRoles.includes(p.role));
  if (powerHumans.length && Math.random() < 0.48) {
    return powerHumans[Math.floor(Math.random() * powerHumans.length)].id;
  }
  if (humans.length && Math.random() < 0.4) {
    return humans[Math.floor(Math.random() * humans.length)].id;
  }

  const scores = buildSuspicionScores(room, doctorBot);
  const selfSuspicion = scores[doctorBot.id] || 0;
  if (selfSuspicion >= 5) return doctorBot.id;

  const sorted = Object.entries(scores)
    .filter(([id]) => id !== doctorBot.id)
    .sort((a, b) => b[1] - a[1]);
  for (const [id, s] of sorted) {
    if (s >= 4) return id;
  }
  return pickRandomTarget(room, doctorBot, { excludeSelf: false });
}

function pickBotReporterTarget(room, reporter) {
  const alive = getAlivePlayers(room).filter((p) => p.id !== reporter.id);
  const nightIdx = room.game ? room.game.nightIndex || 0 : 0;
  if (nightIdx >= 2) {
    const policeClaimants = m42Bluff.scanPoliceReporters(room, voteFactHelpers)
      .filter((r) => r.id !== reporter.id);
    if (policeClaimants.length >= 2 && Math.random() < 0.78) {
      const pick = policeClaimants[Math.floor(Math.random() * policeClaimants.length)];
      const target = getPlayerById(room, pick.id);
      if (target && target.alive) {
        // #region agent log
        agentLog({
          hypothesisId: 'R1',
          location: 'server.js:pickBotReporterTarget',
          message: 'reporter pick matgyeong claimant',
          runId: 'reporter-fix',
          data: {
            reporter: reporter.nickname,
            target: target.nickname,
            matgyeongCount: policeClaimants.length,
            nightIndex: nightIdx
          }
        });
        // #endregion
        return target.id;
      }
    }
    if (policeClaimants.length === 1 && Math.random() < 0.62) {
      const target = getPlayerById(room, policeClaimants[0].id);
      if (target && target.alive) return target.id;
    }
  }
  const humans = alive.filter((p) => !p.isBot);
  const mind = getBotMind(room, reporter.id);
  const unknownHumans = humans.filter((p) => !mind.knownRoles[p.id]);
  if (unknownHumans.length && Math.random() < 0.65) {
    const id = unknownHumans[Math.floor(Math.random() * unknownHumans.length)].id;
    // #region agent log
    agentLog({
      hypothesisId: 'R2',
      location: 'server.js:pickBotReporterTarget',
      message: 'reporter pick unknown human',
      runId: 'reporter-fix',
      data: { reporter: reporter.nickname, nightIndex: nightIdx }
    });
    // #endregion
    return id;
  }
  if (humans.length && Math.random() < 0.5) {
    return humans[Math.floor(Math.random() * humans.length)].id;
  }
  return pickRandomTarget(room, reporter);
}

function pickBotSpyTarget(room, spy) {
  const alive = getAlivePlayers(room).filter((p) => p.id !== spy.id);
  const humans = alive.filter((p) => !p.isBot);
  const mind = getBotMind(room, spy.id);
  const unknownHumans = humans.filter((p) => !mind.knownRoles[p.id]);
  if (unknownHumans.length && Math.random() < 0.6) {
    return unknownHumans[Math.floor(Math.random() * unknownHumans.length)].id;
  }
  const scores = buildSuspicionScores(room, spy, { skipBotHumanBias: true });
  return pickWeightedFromScores(scores, [spy.id]) || pickRandomTarget(room, spy);
}

function pickBotPoliceInvestigateTarget(room, police) {
  const alive = getAlivePlayers(room).filter((p) => p.id !== police.id);
  if (!alive.length) return null;

  const pinnedRival = room.game?.botMatgyeongInvestigateRivalId;
  if (pinnedRival) {
    const pinP = getPlayerById(room, pinnedRival);
    delete room.game.botMatgyeongInvestigateRivalId;
    if (pinP && pinP.alive && pinP.id !== police.id) {
      agentLog({
        hypothesisId: 'H_mat_invest_rival',
        location: 'server.js:pickBotPoliceInvestigateTarget',
        message: 'police investigates matgyeong rival from strategy hint',
        runId: 'mat-strategy',
        data: { police: police.nickname, target: pinP.nickname }
      });
      return pinP.id;
    }
  }

  const claimants = m42Bluff.scanPoliceReporters(room, voteFactHelpers)
    .map((r) => getPlayerById(room, r.id))
    .filter((p) => p && p.alive && p.id !== police.id);
  if (claimants.length >= 2) {
    const nonPolice = claimants.filter((p) => p.role !== ROLE.POLICE);
    const pick = (nonPolice.length ? nonPolice : claimants)[
      Math.floor(Math.random() * (nonPolice.length ? nonPolice.length : claimants.length))
    ];
    agentLog({
      hypothesisId: 'matched-police-matgyeong-investigate',
      location: 'server.js:pickBotPoliceInvestigateTarget',
      message: 'real police investigates matched rival',
      runId: 'mat-strategy',
      data: { police: police.nickname, target: pick.nickname, nightIndex: room.game?.nightIndex || 0 }
    });
    return pick.id;
  }
  if ((room.game?.nightIndex || 0) <= 1 && claimants.length) {
    const pick = claimants[Math.floor(Math.random() * claimants.length)];
    agentLog({
      hypothesisId: 'matched-police-night1-investigate',
      location: 'server.js:pickBotPoliceInvestigateTarget',
      message: 'real police investigates matched rival on first night',
      data: { police: police.nickname, target: pick.nickname, nightIndex: room.game?.nightIndex || 0 }
    });
    return pick.id;
  }

  const intel = (room.game?.policeIntel?.[police.id]) || [];
  const everInvestigated = new Set(intel.map((r) => r.targetId).filter(Boolean));
  let pool = alive.filter((p) => !everInvestigated.has(p.id));
  if (!pool.length && intel.length) {
    const oldest = [...intel].sort((a, b) => (a.nightIndex || 0) - (b.nightIndex || 0))[0];
    if (oldest) {
      pool = alive.filter((p) => p.id !== oldest.targetId);
    }
  }
  if (!pool.length) pool = alive;

  // #region agent log
  agentLog({
    hypothesisId: 'I',
    location: 'server.js:pickBotPoliceInvestigateTarget',
    message: 'police investigate pick',
    runId: 'police-intel',
    data: {
      police: police.nickname,
      poolSize: pool.length,
      excluded: everInvestigated.size,
      nightIndex: room.game?.nightIndex || 0
    }
  });
  // #endregion

  const humans = pool.filter((p) => !p.isBot);
  const mind = getBotMind(room, police.id);
  const unknownHumans = humans.filter((p) => !mind.knownRoles[p.id]);

  if (unknownHumans.length && Math.random() < 0.62) {
    return unknownHumans[Math.floor(Math.random() * unknownHumans.length)].id;
  }
  if (humans.length && Math.random() < 0.48) {
    return humans[Math.floor(Math.random() * humans.length)].id;
  }

  const scores = buildSuspicionScores(room, police, { skipBotHumanBias: true });
  const pick = pickWeightedFromScores(scores, [police.id, ...pool.map((p) => p.id)]);
  if (pick && pool.some((p) => p.id === pick)) return pick;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

function pickBotInvestigateTarget(room, investigator) {
  if (investigator.role === ROLE.POLICE) {
    return pickBotPoliceInvestigateTarget(room, investigator);
  }
  return pickTopSuspect(room, investigator, { skipBotHumanBias: true })
    || pickRandomTarget(room, investigator);
}

function pickBotCultTarget(room, cultBot) {
  const scores = buildSuspicionScores(room, cultBot);
  for (const p of getAlivePlayers(room)) {
    if (isMafiaTeam(p.role) || isMafiaRole(p.role)) scores[p.id] = 0;
    if (isCultMember(p)) scores[p.id] = 0;
    if ([ROLE.POLICE, ROLE.DOCTOR, ROLE.REPORTER, ROLE.POLITICIAN, ROLE.PRIVATE_DETECTIVE].includes(p.role)) {
      scores[p.id] = (scores[p.id] || 0) + 6;
    }
  }
  return pickWeightedFromScores(scores, [cultBot.id])
    || pickRandomTarget(room, cultBot, { excludeMafiaTeam: true, excludeIds: [cultBot.id] });
}

function pickBotNightActionTarget(room, bot, role) {
  switch (role) {
    case ROLE.CULT_LEADER:
      return pickBotCultTarget(room, bot);
    case ROLE.MAFIA:
      return pickBotKillTarget(room, bot);
    case ROLE.DOCTOR:
      return pickBotHealTarget(room, bot);
    case ROLE.POLICE:
      return pickBotInvestigateTarget(room, bot);
    case ROLE.SPY:
      return pickBotSpyTarget(room, bot);
    case ROLE.REPORTER:
      return pickBotReporterTarget(room, bot);
    case ROLE.MEDIUM: {
      const pick = mediumPurify.pickSuspiciousDeadTarget(room, bot, voteFactHelpers);
      return pick ? pick.id : null;
    }
    case ROLE.PRIVATE_DETECTIVE:
      return pickRandomTarget(room, bot, { excludeSelf: true });
    default:
      return null;
  }
}

function applyBotDayVote(room, bot) {
  const g = room.game;
  if (!g || g.dayVotes[bot.id]) return false;
  let targetId = pickBotDayVoteTarget(room, bot);
  if (
    !targetId
    && voteFacts.isJatuCoordinationDay(room)
    && !voteFacts.hasConfirmedMafiaTarget(room, bot, voteFactHelpers)
    && bot.alive
  ) {
    targetId = bot.id;
    agentLog({
      hypothesisId: 'H_jatu_fallback',
      location: 'server.js:applyBotDayVote',
      message: 'jatu day fallback self-vote',
      runId: 'jatu-fix',
      data: { bot: bot.nickname, role: bot.role }
    });
  }
  if (!targetId) {
    // #region agent log
    agentLog({
      hypothesisId: 'VoteImmune',
      location: 'server.js:applyBotDayVote',
      message: 'bot day vote skipped no valid target',
      runId: 'vote-fix',
      data: { bot: bot.nickname, role: bot.role, alive: getAlivePlayers(room).length }
    });
    // #endregion
    return false;
  }
  g.dayVotes[bot.id] = targetId;
  console.log(`[BOT] ${bot.nickname} day-votes ${playerName(room, targetId)}`);
  // #region agent log
  agentLog({
    hypothesisId: 'V2',
    location: 'server.js:applyBotDayVote',
    message: 'bot day vote cast',
    runId: 'vote-fix',
    data: { bot: bot.nickname, target: playerName(room, targetId), selfVote: targetId === bot.id }
  });
  // #endregion
  return true;
}

function ingestAllDayChatSuspicion(room) {
  if (!room.game) return;
  if (room.game._chatSuspicionVoteGen === room.game.dayIndex) return;
  room.game._chatSuspicionVoteGen = room.game.dayIndex;
  for (const msg of getChatMessages(room, 'day')) {
    chatSuspicion.ingestDayMessage(room, msg, voteFactHelpers);
  }
}

function runBotDayVotes(room) {
  if (room.phase !== PHASE.DAY_VOTE || !room.game) return;
  if (voteIntel.ingestPoliceReportsFromDayChat) {
    voteIntel.ingestPoliceReportsFromDayChat(room, voteFactHelpers);
  }
  if (voteIntel.ingestPoliticianClaimsFromDayChat) {
    voteIntel.ingestPoliticianClaimsFromDayChat(room, voteFactHelpers);
  }
  voteFacts.ingestVoteIntelFromChat(room, voteFactHelpers);
  ingestAllDayChatSuspicion(room);
  const bots = getBots(room).filter(p => p.alive);
  let voted = 0;
  for (const bot of bots) {
    if (applyBotDayVote(room, bot)) voted++;
  }

  const g = room.game;
  const pileTarget = voteFacts.pickChatPileOnDayVote(room, bots[0] || { id: '' }, voteFactHelpers);
  if (pileTarget && g.dayVotes) {
    agentLog({
      hypothesisId: 'VotePile',
      location: 'server.js:runBotDayVotes',
      message: 'explicit chat pile-on detected; keep own votes (no forced sync)',
      runId: 'vote-pile',
      data: { pileTarget: playerName(room, pileTarget), botCount: bots.length }
    });
  }

  if (voted > 0) broadcastState(room);
}

function scheduleBotDayVotes(room) {
  if (!hasBots(room)) return;
  runBotDayVotes(room);
  [2500, 7000, 11000, 13500].forEach((ms) => {
    scheduleRoomTask(room, () => runBotDayVotes(room), ms);
  });
}

function postBotDayMessage(room, bot, text, opts = {}) {
  if (!opts._fromBotChatQueue && !isMatgyeongFastBotChat(opts)) {
    enqueueBotDayMessage(room, bot, text, opts);
    return;
  }
  if (!text || !bot?.alive || room.phase !== PHASE.DAY_CHAT) {
    if (opts.policeReportAck) {
      // #region agent log
      agentLog({
        hypothesisId: 'L',
        location: 'server.js:postBotDayMessage',
        message: 'police ack post skipped',
        runId: 'post-fix',
        data: {
          bot: bot?.nickname,
          hasText: !!text,
          alive: !!bot?.alive,
          phase: room?.phase
        }
      });
      // #endregion
    }
    return;
  }
  const priorityChat = !!(
    opts.policeReportAck
    || opts.mafiaFakePolice
    || opts.policeMatgyeongBicker
    || opts.policeCitizenLead
    || opts.matClaimTikiTaka
    || opts.reporterRevealAck
    || opts.mediumRevealAck
    || opts.privateDetectiveReasonAck
    || opts.privateDetectiveBriefAck
  );
  const roleCallOpen = !!room.game?.roleRollCallOpen;
  const preRoleCall = !roleCallOpen;
  if (preRoleCall && bot?.role !== ROLE.POLICE) {
    const allowFakePolice = !!opts.mafiaFakePolice
      && /경찰|홀경|맞경|짭경|진경|조결|수사|조사/.test(String(text || ''));
    const allowSkillPriority = !!(
      opts.reporterRevealAck
      || opts.mediumRevealAck
      || opts.privateDetectiveReasonAck
      || opts.privateDetectiveBriefAck
    );
    if (!allowFakePolice && !opts.policeMatgyeongBicker && !allowSkillPriority) {
      // #region agent log
      agentLog({
        hypothesisId: 'CHAT_CTRL_5',
        location: 'server.js:postBotDayMessage',
        message: 'blocked non-police line before role-call open',
        runId: 'chat-control',
        data: {
          bot: bot?.nickname,
          role: bot?.role,
          opts: {
            mafiaFakePolice: !!opts.mafiaFakePolice,
            policeMatgyeongBicker: !!opts.policeMatgyeongBicker,
            reporterRevealAck: !!opts.reporterRevealAck,
            mediumRevealAck: !!opts.mediumRevealAck,
            privateDetectiveReasonAck: !!opts.privateDetectiveReasonAck,
            privateDetectiveBriefAck: !!opts.privateDetectiveBriefAck
          },
          preview: String(text || '').slice(0, 80)
        }
      });
      // #endregion
      return;
    }
  }
  if (!priorityChat && !canEmitRoomEvent(room, 'chat')) {
    console.warn(`[BOT] chat rate-limited room=${room.code}`);
    return;
  }
  const safe = botChatFilter.sanitizeBotChatLine(text, bot, isMafiaTeam, room, voteFactHelpers);
  if (safe !== text) {
    console.warn(`[BOT] filtered chat from ${bot.nickname}`);
  }
  text = policeFmt.rewriteFormalPoliceReport(text);
  if (bot.isBot && text && !opts.policeReportAck && !opts.mafiaFakePolice) {
    const recent = getDayMessages(room).slice(-14);
    if (recent.some((m) => m && m.text === text)) {
      // #region agent log
      agentLog({
        hypothesisId: 'Dup1',
        location: 'server.js:postBotDayMessage',
        message: 'skip duplicate bot day line',
        data: {
          bot: bot.nickname,
          preview: String(text).slice(0, 56),
          recentTail: recent.slice(-3).map((m) => (m && m.text ? String(m.text).slice(0, 24) : ''))
        }
      });
      // #endregion
      return;
    }
  }
  if (policeFmt.looksLikePoliceReport(text)) {
    const bluffer = m42Bluff.getMafiaPoliceBlufferBot(room, voteFactHelpers);
    if (opts.mafiaFakePolice || (bluffer && bluffer.id === bot.id && bot.role !== ROLE.POLICE)) {
      m42Bluff.rememberPoliceBluffLine(room, bot.id, text);
    }
  }
  const msg = { from: bot.nickname, fromId: bot.id, text, time: Date.now() };
  if (policeFmt.looksLikePoliceReport(text) || isPoliceSelfClaim(text)) {
    notePublicPoliceClaim(room, bot.id);
    voteIntel.ingestPoliceReportsFromDayChat(room, voteFactHelpers);
    if (!opts.mafiaFakePolice && !opts._skipHolgyeongTrigger && !opts._pairedHolgyeong) {
      if (bot.role !== ROLE.POLICE) {
        maybeTriggerHolgyeongOnPoliceReport(room, bot, text);
      }
    }
  }
  if (mediumPurify.MEDIUM_ANNOUNCE_RE.test(text)) {
    voteIntel.ingestMediumPurifyFromDayChat(room, voteFactHelpers, ROLE_LABELS);
  }
  pushChat(room, 'day', msg);
  chatSuspicion.ingestDayMessage(room, msg, voteFactHelpers);
  broadcastToRoom(room, 'chatMessage', { channel: 'day', ...msg });
  recordBotChat(room);
  console.log(`[BOT] ${bot.nickname} day-chat: ${text.slice(0, 40)}`);
  const timeAdj = parseTimeAdjustRequest(text);
  if (timeAdj) scheduleBotTimeAdjustReaction(room, timeAdj);
  // 봇 직공 멘트에 "직공" 등이 들어가면 전원 롤콜이 재귀 예약되어 채팅이 도배됨 → 인간 발화만 롤콜 트리거
  if (!bot.isBot && (isRoleClaimRequest(text) || isRoleRollCallQuestion(text))) {
    scheduleBotRoleRollCall(room, text, bot.id);
  }
}

async function runBotDayChat(room, ctx = {}) {
  if (room.phase !== PHASE.DAY_CHAT || !room.game) return;
  if (!ctx.policeReportAck && room.botChatInFlight) {
    // #region agent log
    agentLog({
      hypothesisId: 'E',
      location: 'server.js:runBotDayChat',
      message: 'skipped botChatInFlight',
      data: { ctxKeys: Object.keys(ctx), phase: room.phase }
    });
    // #endregion
    return;
  }
  if (!canBotChatNow(room, ctx)) {
    // #region agent log
    agentLog({
      hypothesisId: 'F',
      location: 'server.js:runBotDayChat',
      message: 'skipped canBotChatNow',
      data: { ctxKeys: Object.keys(ctx), policeReportAck: !!ctx.policeReportAck }
    });
    // #endregion
    return;
  }

  const bots = getBots(room).filter(p => p.alive);
  if (!bots.length) return;

  const lockChat = !ctx.policeReportAck;
  if (lockChat) {
    room.botChatInFlight = true;
    room._botChatStartedAt = Date.now();
  }
  try {
    let bot = ctx.forceBotId ? getPlayerById(room, ctx.forceBotId) : null;
    if (bot && (!bot.alive || !bot.isBot)) bot = null;
    const trigger = ctx.triggerText || '';
    const matLikeTrigger = /맞경|맞의|맞기|맞직|짭경|진경|쓰리경|홀경|홀의|홀기/.test(trigger);
    const hasMatConflicts = m42Matclaim.hasActiveMatConflicts(room, voteFactHelpers);
    if (!bot && m42Bluff.wantsMatgyeongAsk(trigger)) {
      const mafiaBots = bots.filter(
        (b) => isMafiaTeam(b.role) && b.role !== ROLE.POLICE
          && m42Bluff.mayMafiaTeamBotBluffPolice(room, b, voteFactHelpers)
      );
      const mafiaAny = bots.filter((b) => isMafiaTeam(b.role) && b.role !== ROLE.POLICE);
      bot = mafiaBots.length
        ? shuffle(mafiaBots)[0]
        : (mafiaAny.length ? shuffle(mafiaAny)[0] : shuffle(bots)[0]);
    } else if (!bot && ctx.policeReport && isPoliceReportRequest(trigger, room)) {
      const mafiaBluffers = bots.filter(
        (b) => isMafiaTeam(b.role) && b.role !== ROLE.POLICE
          && m42Bluff.mayMafiaTeamBotBluffPolice(room, b, voteFactHelpers)
      );
      bot = mafiaBluffers.length
        ? shuffle(mafiaBluffers)[0]
        : (bots.find((p) => p.role === ROLE.POLICE) || shuffle(bots)[0]);
    } else if (!bot) {
      const policeAlive = bots.find((p) => p.role === ROLE.POLICE);
      const skillAck = !!(
        ctx.policeReportAck
        || ctx.reporterRevealAck
        || ctx.mediumRevealAck
        || ctx.privateDetectiveReasonAck
        || ctx.privateDetectiveBriefAck
        || ctx.matClaimTikiTaka
        || ctx.policeMatgyeongBicker
        || ctx.policeCitizenLead
      );
      if (!skillAck && !matLikeTrigger && !hasMatConflicts) {
        bot = policeAlive || null;
        // #region agent log
        agentLog({
          hypothesisId: 'CHAT_CTRL_1',
          location: 'server.js:runBotDayChat',
          message: 'quiet day mode picks police-only speaker',
          runId: 'chat-control',
          data: {
            picked: bot ? bot.nickname : null,
            trigger: String(trigger).slice(0, 60),
            hasMatConflicts
          }
        });
        // #endregion
      } else {
        bot = policeAlive && !matLikeTrigger && !hasMatConflicts
          ? policeAlive
          : shuffle(bots)[0];
      }
    }
    if (!bot) {
      // #region agent log
      agentLog({
        hypothesisId: 'CHAT_CTRL_2',
        location: 'server.js:runBotDayChat',
        message: 'no eligible bot speaker in quiet day mode',
        runId: 'chat-control',
        data: { trigger: String(trigger).slice(0, 60), hasMatConflicts }
      });
      // #endregion
      return;
    }
    const text = await Promise.race([
      botBrain.generateBotChat(room, bot, ctx),
      new Promise((resolve) => setTimeout(() => resolve(null), 9000))
    ]);
    // #region agent log
    agentLog({
      hypothesisId: 'C',
      location: 'server.js:runBotDayChat',
      message: 'bot chat result',
      data: {
        bot: bot?.nickname,
        policeReportAck: !!ctx.policeReportAck,
        hasText: !!text,
        textPreview: text ? String(text).slice(0, 60) : null,
        trigger: String(trigger).slice(0, 60)
      }
    });
    // #endregion
    if (!text) {
      const fallback = botBrain.generateRuleBased
        ? botBrain.generateRuleBased(room, bot, ctx)
        : null;
      if (fallback) postBotDayMessage(room, bot, fallback, { policeReportAck: !!ctx.policeReportAck });
      return;
    }
    postBotDayMessage(room, bot, text, { policeReportAck: !!ctx.policeReportAck });
  } catch (err) {
    console.warn('[BOT] day-chat error', err.message);
    if (lockChat) room.botChatInFlight = false;
  } finally {
    if (lockChat) room.botChatInFlight = false;
  }
}

function scheduleBotRoleRollCall(room, triggerText, excludeBotId = null) {
  if (!hasBots(room) || room.phase !== PHASE.DAY_CHAT) return;
  const t = String(triggerText || '');
  if (!isRoleClaimRequest(t) && !isRoleRollCallQuestion(t)) return;

  room._rollCallGen = (room._rollCallGen || 0) + 1;
  const gen = room._rollCallGen;

  const shuffled = shuffle(getBots(room).filter((b) => b.alive && b.id !== excludeBotId));
  if (!shuffled.length) return;
  const targetedBot = shuffled.find((b) => t.includes(b.nickname) && /직업|직공|뭐야|뭔|공개|말해/.test(t));
  const policeBots = shuffled.filter((b) => b.role === ROLE.POLICE);
  const hasMat = m42Matclaim.hasActiveMatConflicts(room, voteFactHelpers);
  const noisyTrigger = /맞경|맞의|맞기|맞직|짭경|진경|쓰리경|홀경|홀의|홀기/.test(t);
  let bots = targetedBot ? [targetedBot] : [...policeBots];
  if (!targetedBot && (hasMat || noisyTrigger)) {
    const others = shuffle(shuffled.filter((b) => b.role !== ROLE.POLICE)).slice(0, 2);
    bots = [...policeBots, ...others];
  }
  if (!bots.length) return;
  if (!targetedBot && !hasMat && !noisyTrigger) {
    bots = bots.slice(0, 1);
  }
  // #region agent log
  agentLog({
    hypothesisId: 'CHAT_CTRL_3',
    location: 'server.js:scheduleBotRoleRollCall',
    message: 'role roll-call speakers narrowed by police-first policy',
    runId: 'chat-control',
    data: {
      trigger: t.slice(0, 60),
      targetedBot: targetedBot ? `${targetedBot.nickname}:${targetedBot.role}` : null,
      hasMat,
      noisyTrigger,
      speakers: bots.map((b) => `${b.nickname}:${b.role}`)
    }
  });
  // #endregion

  console.log(`[BOT] role roll-call: ${bots.length} bots (gen=${gen})`);

  bots.forEach((bot, i) => {
    const delay = 600 + i * botChatGapMs();
    scheduleRoomTask(room, () => {
      if (room._rollCallGen !== gen || room.phase !== PHASE.DAY_CHAT) return;
      if (!bot.alive) return;
      const isMafia = isMafiaTeam(bot.role);
      const line = botBrain.buildRoleRollCallAnswer(room, bot, isMafia);
      if (line) {
        postBotDayMessage(room, bot, line);
        scheduleRoomTask(room, () => {
          if (room._rollCallGen !== gen || room.phase !== PHASE.DAY_CHAT) return;
          const claimedRoles = m42Matclaim.getPlayerClaimedRoles(room, bot.id) || [];
          const conflicts = m42Matclaim.scanMatClaimConflicts(room, voteFactHelpers);
          const conflict = conflicts.find((c) => c.claimants.some((cl) => cl.id === bot.id));
          if (!conflict) {
            if (!claimedRoles.includes('soldier')) return;
            const aliveSoldier = getBots(room).find(
              (b) => b.alive && b.id !== bot.id && b.role === ROLE.SOLDIER
            );
            if (!aliveSoldier) return;
            const counter = `저는 군인입니다. ${bot.nickname}님, 거짓말하지 마세요. 제가 군인입니다.`;
            agentLog({
              hypothesisId: 'rollcall-mat-soldier-counter',
              location: 'server.js:scheduleBotRoleRollCall',
              message: 'soldier duplicate counterclaim reply',
              data: { first: bot.nickname, responder: aliveSoldier.nickname }
            });
            postBotDayMessage(room, aliveSoldier, counter);
            return;
          }
          const responderEntry = conflict.claimants.find((cl) => cl.id !== bot.id);
          if (!responderEntry) return;
          const responder = getPlayerById(room, responderEntry.id);
          if (!responder || !responder.alive || !responder.isBot) return;
          const label = conflict.label || '직업';
          const counter = `저는 ${label}입니다. ${bot.nickname}님, 거짓말하지 마세요. 제가 ${label}입니다.`;
          agentLog({
            hypothesisId: 'rollcall-mat-counter',
            location: 'server.js:scheduleBotRoleRollCall',
            message: 'matched role counterclaim reply',
            data: {
              trigger: t.slice(0, 60),
              role: conflict.role,
              first: bot.nickname,
              responder: responder.nickname
            }
          });
          postBotDayMessage(room, responder, counter);
        }, 320 + i * 120);
      }
    }, delay);
  });
}

function buildPoliceAckFallback(room, reportMsg, parsed) {
  const speaker = getPlayerById(room, reportMsg?.fromId);
  if (!speaker || !parsed) return null;
  const who = speaker.role === ROLE.POLICE
    ? (speaker.nickname || '경찰')
    : (speaker.nickname || '플레이어');
  if (parsed.mafia?.length) {
    const t = parsed.mafia[0];
    return `${who}님 조결 확인했습니다. ${t.nickname}님 대상으로 표를 맞추겠습니다.`;
  }
  if (parsed.innocent?.length) {
    const n = parsed.innocent[0].nickname;
    return `${who}님 조결대로 ${n}님은 일단 무죄로 보겠습니다.`;
  }
  return null;
}

/** 인간 경찰 조결 공개 후 다른 봇이 따라 말하도록 (generation 무관 setTimeout) */
function scheduleBotReplyToPoliceReport(room, reportMsg) {
  if (!hasBots(room) || room.phase !== PHASE.DAY_CHAT || !reportMsg?.text) return;
  const parsed = voteFacts.parsePoliceReportFromText(room, reportMsg.text);
  if (!parsed.mafia.length && !parsed.innocent.length) return;
  const responders = shuffle(
    getBots(room).filter((b) => b.alive && b.id !== reportMsg.fromId)
  ).slice(0, 3);
  // #region agent log
  agentLog({
    hypothesisId: 'C',
    location: 'server.js:scheduleBotReplyToPoliceReport',
    message: 'schedule police report ack',
    runId: 'post-fix',
    data: {
      text: String(reportMsg.text).slice(0, 80),
      mafia: parsed.mafia.map((p) => p.nickname),
      innocent: parsed.innocent.map((p) => p.nickname),
      responders: responders.map((b) => b.nickname),
      phase: room.phase
    }
  });
  // #endregion
  if (!responders.length) return;
  clearPoliceAckTimers(room);
  const postPoliceAck = (bot, lineSource) => {
    let line = buildPoliceAckFallback(room, reportMsg, parsed);
    if (!line) {
      try {
        line = botBrain.generateRuleBased(room, bot, {
          triggerText: reportMsg.text,
          policeReportAck: true,
          reportFromId: reportMsg.fromId
        });
      } catch (err) {
        // #region agent log
        agentLog({
          hypothesisId: 'C',
          location: 'server.js:policeAckTimer',
          message: 'ack generateRuleBased error',
          runId: 'post-fix',
          data: { bot: bot.nickname, err: String(err.message || err), lineSource }
        });
        // #endregion
        console.warn('[BOT] police ack error', err.message);
        line = buildPoliceAckFallback(room, reportMsg, parsed);
      }
    }
    // #region agent log
    agentLog({
      hypothesisId: 'C',
      location: 'server.js:policeAckTimer',
      message: 'ack line ready',
      runId: 'post-fix',
      data: {
        bot: bot.nickname,
        lineSource,
        hasLine: !!line,
        preview: line ? String(line).slice(0, 60) : null
      }
    });
    // #endregion
    if (line) postBotDayMessage(room, bot, line, { policeReportAck: true });
  };

  responders.forEach((bot, i) => {
    const delayMs = 800 + i * botChatGapMs();
    const timer = setTimeout(() => {
      if (!rooms.has(room.code) || room.phase !== PHASE.DAY_CHAT) {
        // #region agent log
        agentLog({
          hypothesisId: 'L',
          location: 'server.js:policeAckTimer',
          message: 'ack timer skipped phase',
          runId: 'post-fix',
          data: { bot: bot.nickname, phase: room.phase, hasRoom: rooms.has(room.code) }
        });
        // #endregion
        return;
      }
      postPoliceAck(bot, i === 0 ? 'primary' : 'follow');
    }, delayMs);
    if (!room._policeAckTimers) room._policeAckTimers = [];
    room._policeAckTimers.push(timer);
  });
}

function scheduleBotReplyToHuman(room, opts = {}) {
  if (!hasBots(room) || room.phase !== PHASE.DAY_CHAT) return;
  const triggerText = opts.triggerText || '';
  const timeAdj = parseTimeAdjustRequest(triggerText);
  if (timeAdj) scheduleBotTimeAdjustReaction(room, timeAdj);

  if (isRoleClaimRequest(triggerText) || isRoleRollCallQuestion(triggerText)) {
    if (room.game) room.game.roleRollCallOpen = true;
    // #region agent log
    agentLog({
      hypothesisId: 'CHAT_CTRL_4',
      location: 'server.js:scheduleBotReplyToHuman',
      message: 'role roll-call opened by human trigger',
      runId: 'chat-control',
      data: { trigger: String(triggerText).slice(0, 60) }
    });
    // #endregion
    m42Bluff.scheduleMafiaRoleBluffWaves(room, voteFactHelpers, scheduleRoomTask, postBotDayMessage);
    scheduleMatClaimDayPlaybook(room);
    scheduleBotRoleRollCall(room, triggerText);
    return;
  }

  if (isMediumPurifyRequest(triggerText)) {
    handleMediumPurifyChatRequest(room);
    return;
  }

  if (room._botHumanReplyTimer) clearTimeout(room._botHumanReplyTimer);
  const policeReport = !!opts.policeReport
    || (isPoliceReportRequest(triggerText, room) && !voteFacts.isPoliceReportProviding(triggerText, room));
  const delay = policeReport ? 2200 : (timeAdj ? 900 : BOT_CHAT.HUMAN_REPLY_WAIT_MS);
  room._botHumanReplyTimer = setTimeout(() => {
    room._botHumanReplyTimer = null;
    if (room.phase !== PHASE.DAY_CHAT) return;
    runBotDayChat(room, { triggerText, policeReport, timeAdjust: timeAdj });
  }, delay);
}

function scheduleBotDayChat(room) {
  if (!hasBots(room)) return;
  const duration = room.phaseEndsAt
    ? Math.max(0, room.phaseEndsAt - Date.now())
    : computeDayChatDurationMs(room);
  BOT_CHAT.SCHEDULED_SLOTS_MS
    .filter((ms) => ms < duration - 8000)
    .forEach((ms) => {
      scheduleRoomTask(room, () => runBotDayChat(room), ms);
    });
}

const DAWN_SKILL_REACTION_SLOTS_MS = [4000, 9500, 15000];

function collectBotNightActs(room, g) {
  const na = g.nightActions || {};
  const acts = {};
  const botWithRole = (role) => Object.values(room.players).find((p) => p.isBot && p.role === role && p.alive);

  const record = (bot, type, targetId, extra = {}) => {
    if (!bot || !targetId) return;
    const target = getPlayerById(room, targetId);
    if (!target) return;
    acts[bot.id] = {
      type,
      targetName: target.nickname,
      roleLabel: ROLE_LABELS[target.role],
      ...extra
    };
  };

  const policeBot = botWithRole(ROLE.POLICE);
  if (policeBot && na.policeTarget) {
    const t = getPlayerById(room, na.policeTarget);
    record(policeBot, 'police', na.policeTarget, { isMafia: t ? isMafiaRole(t.role) : null });
  }
  const spyBot = botWithRole(ROLE.SPY);
  if (spyBot && na.spyTarget) {
    const t = getPlayerById(room, na.spyTarget);
    record(spyBot, 'spy', na.spyTarget, {
      joinedMafia: !!(t && isMafiaRole(t.role) && spyBot.joinedMafiaChat)
    });
  }
  const reporterBot = botWithRole(ROLE.REPORTER);
  if (reporterBot && na.reporterTarget && g.nightIndex >= 2) {
    record(reporterBot, 'reporter', na.reporterTarget, {});
  }
  const doctorBot = botWithRole(ROLE.DOCTOR);
  if (doctorBot && na.doctorTarget) {
    record(doctorBot, 'doctor', na.doctorTarget, {});
  }
  const mediumBot = botWithRole(ROLE.MEDIUM);
  if (mediumBot && na.mediumTarget) {
    const t = getPlayerById(room, na.mediumTarget);
    if (t && !t.alive) record(mediumBot, 'medium', na.mediumTarget, {});
  }

  const pdBot = botWithRole(ROLE.PRIVATE_DETECTIVE);
  if (pdBot && na.privateDetectiveWatchId) {
    const watch = getPlayerById(room, na.privateDetectiveWatchId);
    const row = na.actorNightTarget?.[na.privateDetectiveWatchId];
    const pointed = row?.targetId ? getPlayerById(room, row.targetId) : null;
    acts[pdBot.id] = {
      type: 'private_detective',
      targetName: watch ? watch.nickname : playerName(room, na.privateDetectiveWatchId),
      watchId: na.privateDetectiveWatchId,
      pointedName: pointed ? pointed.nickname : null,
      skillKind: row?.kind || null
    };
  }

  return acts;
}

function buildLastNightReport(room) {
  const g = room.game;
  const s = g._nightSummary || {};
  const deaths = (s.deaths || []).map((id) => ({ id, name: playerName(room, id) }));
  const annText = (g.dawnAnnouncements || []).join(' ');

  let reporterReveal = s.reporterReveal ? { ...s.reporterReveal } : null;
  if (!reporterReveal && room.pendingReporterRevealData) {
    reporterReveal = { ...room.pendingReporterRevealData };
  }
  if (!reporterReveal) {
    const m = annText.match(/기자 취재:\s*(.+?)의 직업은 \[(.+?)\]/);
    if (m) reporterReveal = { targetName: m[1], roleLabel: m[2] };
  }

  let mediumPurifyReveal = null;
  const pendingMed = g.pendingMediumReveal;
  if (pendingMed) {
    mediumPurifyReveal = { ...pendingMed };
  } else if (s.botActs) {
    const medBot = Object.values(room.players).find((p) => p.role === ROLE.MEDIUM);
    if (medBot && s.botActs[medBot.id]?.type === 'medium') {
      const tid = s.botActs[medBot.id].targetId;
      const t = tid ? getPlayerById(room, tid) : null;
      if (t) {
        mediumPurifyReveal = {
          targetId: t.id,
          targetName: t.nickname,
          role: t.role,
          roleLabel: ROLE_LABELS[t.role],
          mediumId: medBot.id
        };
      }
    }
  }

  const reporter = Object.values(room.players).find((p) => p.role === ROLE.REPORTER && p.alive);
  const scoopReporterId = reporterReveal && reporterReveal.reporterId
    ? reporterReveal.reporterId
    : (reporter ? reporter.id : null);
  const doctor = Object.values(room.players).find((p) => p.role === ROLE.DOCTOR && p.alive);
  const soldier = s.soldierBlockTargetId ? getPlayerById(room, s.soldierBlockTargetId) : null;

  return {
    nightIndex: g.nightIndex,
    deaths,
    quietNight: deaths.length === 0 && !s.healBlockedKill && !s.soldierBlockedKill,
    healSave: !!s.healBlockedKill,
    soldierBlock: !!s.soldierBlockedKill,
    reporterReveal,
    mediumPurify: mediumPurifyReveal,
    reporterBotId: scoopReporterId,
    doctorBotId: doctor ? doctor.id : null,
    soldierBotId: soldier ? soldier.id : null,
    announcementText: annText,
    botActs: s.botActs || {},
    privateDetective: s.privateDetective || null
  };
}

function scoreBotDawnReaction(bot, report) {
  if (!report) return 0;
  let s = Math.random();
  if (report.reporterReveal) {
    if (bot.role === ROLE.REPORTER) s += 8;
    if (bot.role === ROLE.POLICE) s += 4;
    if (isMafiaTeam(bot.role)) s += 3;
  }
  if (report.mediumPurify) {
    if (bot.role === ROLE.MEDIUM) s += 8;
    if (bot.role === ROLE.POLICE) s += 3;
    if (isMafiaTeam(bot.role)) s += 2;
  }
  if (report.privateDetective) {
    if (bot.role === ROLE.PRIVATE_DETECTIVE) s += 9;
    if (bot.role === ROLE.POLICE) s += 3;
    if (isMafiaTeam(bot.role)) s += 2;
  }
  if (report.healSave && bot.role === ROLE.DOCTOR) s += 7;
  if (report.soldierBlock && bot.role === ROLE.SOLDIER) s += 7;
  if (report.deaths && report.deaths.length) {
    if (bot.role === ROLE.MEDIUM) s += 5;
    if (isMafiaTeam(bot.role)) s += 2;
  }
  if (report.quietNight) s += 1;
  if (report.botActs && report.botActs[bot.id]) s += 6;
  return s;
}

function runBotDawnSkillReaction(room) {
  if (room.phase !== PHASE.DAY_CHAT || !room.game) return;
  if (!canBotChatNow(room) || room.botChatInFlight) return;
  const report = room.game.lastNightReport;
  if (!report) return;

  const bots = getBots(room).filter((p) => p.alive);
  bots.sort((a, b) => scoreBotDawnReaction(b, report) - scoreBotDawnReaction(a, report));

  const maxPosts = (report.reporterReveal || report.mediumPurify || report.privateDetective) ? 2 : 1;
  let posted = 0;
  for (const bot of bots) {
    if (posted >= maxPosts) break;
    const text = botBrain.generateBotDawnReaction(room, bot, report);
    if (text) {
      // #region agent log
      agentLog({
        hypothesisId: 'PD_FACT_3',
        location: 'server.js:runBotDawnSkillReaction',
        message: 'bot dawn reaction posted',
        runId: 'pd-fact-check',
        data: {
          bot: bot.nickname,
          role: bot.role,
          hasPdReport: !!report.privateDetective,
          textPreview: String(text).slice(0, 90)
        }
      });
      // #endregion
      postBotDayMessage(room, bot, text, {
        reporterRevealAck: !!report.reporterReveal,
        mediumRevealAck: !!report.mediumPurify
      });
      posted += 1;
    }
  }
}

function buildPrivateDetectiveReasonLine(room, watched, pdReport) {
  if (!watched || !pdReport) return null;
  const watchName = pdReport.watchName || watched.nickname;
  const targetName = pdReport.targetName || '누군가';
  const kind = pdReport.kind || '';
  if (!targetName || targetName === '누군가') {
    return `${watchName}님이 제 밤 행동을 물으셨군요. 어젯밤에는 확정할 행동이 없어 손을 멈췄습니다.`;
  }
  if (kind === 'doctor') {
    return `${watchName}님 관찰 맞습니다. ${targetName}님을 살리려고 의사로서 치료 대상을 지정했습니다.`;
  }
  if (kind === 'police') {
    return `${watchName}님 관찰대로 ${targetName}님을 경찰 조사 대상으로 골랐습니다. 수사하려고 손을 댔습니다.`;
  }
  if (kind === 'reporter') {
    return `${watchName}님이 본 손 방향 맞습니다. ${targetName}님을 기자 취재 대상으로 지정했습니다.`;
  }
  if (kind === 'medium') {
    return `${watchName}님 관찰대로 ${targetName}님을 영매 성불 대상으로 지정했습니다. 직업 확인 목적이었습니다.`;
  }
  if (kind === 'spy') {
    return `${watchName}님 관찰대로 ${targetName}님을 조사 대상으로 골랐습니다. 정보 확인 목적이었습니다.`;
  }
  if (kind === 'cult') {
    return `${watchName}님이 본 대로 ${targetName}님에게 손을 댄 건 제 밤 능력 대상 지정 때문입니다.`;
  }
  if (kind === 'mafia_kill') {
    return `${watchName}님 관찰대로 ${targetName}님을 밤 행동 대상으로 잡았습니다. 제 판단으로 의심 대상 확인이 필요했습니다.`;
  }
  return `${watchName}님 관찰대로 ${targetName}님을 밤 행동 대상으로 지정한 것이 맞습니다.`;
}

function schedulePrivateDetectiveReasonReply(room) {
  const pd = room.game?.lastNightReport?.privateDetective;
  if (!pd || !pd.watchId || !pd.targetId) return;
  const watched = getPlayerById(room, pd.watchId);
  if (!watched || !watched.alive || !watched.isBot) return;
  scheduleRoomTask(room, () => {
    if (room.phase !== PHASE.DAY_CHAT) return;
    const line = buildPrivateDetectiveReasonLine(room, watched, pd);
    if (!line) return;
    // #region agent log
    agentLog({
      hypothesisId: 'PD_REASON_1',
      location: 'server.js:schedulePrivateDetectiveReasonReply',
      message: 'watched bot explains detective observed hand target',
      runId: 'pd-reason',
      data: {
        watched: watched.nickname,
        kind: pd.kind || null,
        targetName: pd.targetName || null,
        linePreview: line.slice(0, 120)
      }
    });
    // #endregion
    postBotDayMessage(room, watched, line, { privateDetectiveReasonAck: true });
  }, 1800);
}

function scheduleBotDawnSkillReactions(room) {
  if (!hasBots(room) || !room.game?.lastNightReport) return;
  DAWN_SKILL_REACTION_SLOTS_MS.forEach((ms) => {
    scheduleRoomTask(room, () => runBotDawnSkillReaction(room), ms);
  });
}

function pickRandomCitizenBot(room, excludeId) {
  const bots = getBots(room).filter((p) => {
    if (!p.alive || p.id === excludeId) return false;
    return !isMafiaTeam(p.role) && p.role !== ROLE.CULT_LEADER && !m42Cult.isCultMember(p);
  });
  if (!bots.length) return null;
  return bots[Math.floor(Math.random() * bots.length)];
}

function scheduleReporterRevealDayChat(room) {
  const reveal = room.game?.lastNightReport?.reporterReveal;
  if (!reveal || !hasBots(room)) return;
  const aliveBots = getBots(room).filter((p) => p.alive);
  const reporterBot = aliveBots.find((p) => p.role === ROLE.REPORTER);
  const others = aliveBots
    .filter((p) => !reporterBot || p.id !== reporterBot.id)
    .sort(() => Math.random() - 0.5)
    .slice(0, 2);
  const ordered = reporterBot ? [reporterBot, ...others] : aliveBots.sort(() => Math.random() - 0.5).slice(0, 3);
  ordered.forEach((bot, i) => {
    scheduleRoomTask(room, () => {
      if (room.phase !== PHASE.DAY_CHAT || !bot.alive) return;
      const line = botBrain.pickReporterRevealDayLine(room, bot, reveal);
      if (line) postBotDayMessage(room, bot, line, { reporterRevealAck: true });
    }, 750 + i * 1100);
  });
}

/** 사립탐정 봇: 밤 관찰 직후 매 낮 브리핑(클라이언트 사설 결과와 동일 문장) */
function schedulePrivateDetectiveBotDayBrief(room) {
  const pdBot = Object.values(room.players).find(
    (p) => p && p.alive && p.isBot && p.role === ROLE.PRIVATE_DETECTIVE
  );
  if (!pdBot) return;
  const pd = room.game?.lastNightReport?.privateDetective;
  if (!pd || !pd.watchName) return;
  const line = m42PrivateDetective.formatDetectiveResultLine(pd);
  if (!line) return;
  scheduleRoomTask(room, () => {
    if (room.phase !== PHASE.DAY_CHAT || !pdBot.alive) return;
    // #region agent log
    agentLog({
      hypothesisId: 'H_pd_brief',
      location: 'server.js:schedulePrivateDetectiveBotDayBrief',
      message: 'pd bot day briefing posted',
      runId: 'pd-brief',
      data: {
        pd: pdBot.nickname,
        watch: pd.watchName,
        target: pd.targetName || null,
        preview: line.slice(0, 88)
      }
    });
    // #endregion
    postBotDayMessage(room, pdBot, line, { privateDetectiveBriefAck: true });
  }, 2300);
}

/** 맞경 중 진경(실제 경찰)이 밤 사망 시: 사탐 봇이 몰표·의사 눈힐 유도 */
function schedulePdMatgyeongPoliceKilledLead(room) {
  if (!room.game?.lastNightReport?.deaths?.length) return;
  const diedPolice = room.game.lastNightReport.deaths
    .map((d) => (d && typeof d === 'object' ? d.id : d))
    .map((id) => (id != null ? getPlayerById(room, id) : null))
    .find((p) => p && p.role === ROLE.POLICE);
  if (!diedPolice) return;
  if (getAlivePlayers(room).some((p) => p.role === ROLE.POLICE)) return;

  const pdAny = Object.values(room.players).find((p) => p && p.alive && p.role === ROLE.PRIVATE_DETECTIVE);
  if (pdAny) room.game.botDoctorHealHintPlayerId = pdAny.id;

  if (!hasBots(room)) return;

  const pd = Object.values(room.players).find(
    (p) => p && p.alive && p.isBot && p.role === ROLE.PRIVATE_DETECTIVE
  );
  if (!pd) return;

  const reporters = m42Bluff.scanPoliceReporters(room, voteFactHelpers);
  const suspects = reporters
    .map((r) => getPlayerById(room, r.id))
    .filter((p) => p && p.alive && p.role !== ROLE.POLICE && p.id !== pd.id);

  const waveKey = `pd_matkill_d${room.game.dayIndex || 0}_n${room.game.nightIndex || 0}`;
  if (!room._pdMatgyeongPoliceKillWave) room._pdMatgyeongPoliceKillWave = {};
  if (room._pdMatgyeongPoliceKillWave[waveKey]) return;
  room._pdMatgyeongPoliceKillWave[waveKey] = true;

  agentLog({
    hypothesisId: 'H_pd_matkill_lead',
    location: 'server.js:schedulePdMatgyeongPoliceKilledLead',
    message: 'PD matgyeong lead scheduled after real police night death',
    runId: 'pd-matkill',
    data: {
      diedPolice: diedPolice.nickname,
      suspectCount: suspects.length,
      healHint: pdAny?.id || null
    }
  });

  const primary = suspects.length === 1
    ? suspects[0]
    : (suspects.length ? suspects[Math.floor(Math.random() * suspects.length)] : null);

  const line1 = primary
    ? `맞경 중 어젯밤 ${diedPolice.nickname}님이 마피아에게 제거됐습니다. 진경이 사망했으니 남은 경찰 주장자는 짭경일 가능성이 큽니다. 시민은 ${primary.nickname}님에게 표를 모읍시다.`
    : `맞경 중 실제 경찰에 가까운 분이 어젯밤 마피아에게 제거됐습니다. 남은 경찰 주장 라인은 짭경 가능성이 큽니다. 맞경 한쪽부터 투표로 정리합시다.`;
  const line2 = room.game?.botPdLeadOnPoliceDeath
    ? '진경이 밤에 죽기 전에 사탐에게 맡기라고 했습니다. 제가 관찰로 맞경·밤 킬을 보고, 의사님은 사립탐정이나 수상한 분께 눈치 힐 부탁드립니다.'
    : '이번 밤에는 제가 관찰로 누가 손을 올리는지 다시 보겠습니다. 의사님은 진경이 없으니 사립탐정이나 수상한 분께 눈치 힐 부탁드립니다.';

  scheduleRoomTask(room, () => {
    if (room.phase !== PHASE.DAY_CHAT || !pd.alive) return;
    postBotDayMessage(room, pd, line1, { policeCitizenLead: true });
  }, 3200);
  scheduleRoomTask(room, () => {
    if (room.phase !== PHASE.DAY_CHAT || !pd.alive) return;
    postBotDayMessage(room, pd, line2, { policeCitizenLead: true });
  }, 6200);

  if (room.game) {
    delete room.game.botPdLeadOnPoliceDeath;
    delete room.game.botMatgyeongVoteRivalIfPoliceDies;
  }
}

function scheduleReporterMatgyeongPrompt(room) {
  if (!hasBots(room) || !room.game) return;
  const reporter = Object.values(room.players).find(
    (p) => p.alive && p.role === ROLE.REPORTER
  );
  if (!reporter || reporter.reporterUsed) return;
  const claimants = m42Bluff.scanPoliceReporters(room, voteFactHelpers)
    .filter((r) => r.id !== reporter.id);
  if (claimants.length < 2) return;
  const bot = pickRandomCitizenBot(room, reporter.id);
  if (!bot) return;
  const nightIdx = room.game.nightIndex || 0;
  const a = claimants[0].nickname;
  const b = claimants[1].nickname;
  const line = nightIdx < 2
    ? `${reporter.nickname}님(기자), 2밤에 ${a}·${b} 맞경 중 한 분 취재 부탁드립니다.`
    : `${reporter.nickname}님, 맞경 ${a}·${b} 중 한 분 취재로 직업 확인 부탁드립니다.`;
  scheduleRoomTask(room, () => {
    if (room.phase !== PHASE.DAY_CHAT) return;
    postBotDayMessage(room, bot, line, { reporterRevealAck: true });
  }, 4800);
}

function scheduleMediumPurifyDayAnnounce(room) {
  const pending = room.game?.pendingMediumReveal;
  if (!pending) return;
  const medium = getPlayerById(room, pending.mediumId);
  if (!medium || !medium.alive || medium.role !== ROLE.MEDIUM) {
    room.game.pendingMediumReveal = null;
    return;
  }
  if (!medium.isBot) return;
  scheduleRoomTask(room, () => {
    if (room.phase !== PHASE.DAY_CHAT) return;
    const line = mediumPurify.formatPurifyAnnounce(pending.targetName, pending.roleLabel);
    postBotDayMessage(room, medium, line, { mediumRevealAck: true });
    voteIntel.ingestMediumPurifyReveal(
      room,
      pending.targetId,
      pending.role,
      botLearnRole,
      medium.id
    );
    room.game.pendingMediumReveal = null;
  }, 1400);
}

function scheduleMediumDeathPurifyPrompt(room) {
  const report = room.game?.lastNightReport;
  if (!report?.deaths?.length || !hasBots(room)) return;

  scheduleMatClaimDeathAnalysis(room);

  const medium = Object.values(room.players).find(
    (p) => p.alive && p.role === ROLE.MEDIUM
  );
  if (!medium) return;
  const eligible = mediumPurify.listEligibleDead(room);
  if (!eligible.length) return;
  const bot = pickRandomCitizenBot(room, medium.id);
  if (!bot) return;

  const deathIds = report.deaths.map((d) => d.id || d);
  const deadMat = m42Matclaim.findDeadMatClaimants(room, voteFactHelpers, deathIds);
  let line;
  if (deadMat.length) {
    line = m42Matclaim.pickDeadClaimantAnalysisLine(room, bot, voteFactHelpers, deadMat[0])
      || `${medium.nickname}님(영매), ${deadMat[0].name}님 맞직 사망입니다. 성불로 직업 확인 부탁드립니다.`;
  } else {
    const deadNames = report.deaths.map((d) => d.name).join(', ');
    line = `${medium.nickname}님(영매), ${deadNames}님 사망 확인했습니다. 사망자 채팅·밤 성불 부탁드립니다.`;
  }
  scheduleRoomTask(room, () => {
    if (room.phase !== PHASE.DAY_CHAT) return;
    postBotDayMessage(room, bot, line, { mediumRevealAck: true, matClaimTikiTaka: !!deadMat.length });
  }, 3200);
}

/** 도굴 기자 계승은 본인 비공개 안내(motion/privateInfo)만 — 낮 공개 채팅 멘트 없음 */
function scheduleInheritedReporterDayChat(_room) {
  return;
}

function runBotNightActions(room) {
  if (room.phase !== PHASE.NIGHT || !room.game) return;
  const bots = getBots(room).filter(p => p.alive);
  const actions = room.game.nightActions;
  if (!actions) return;

  const mafiaBots = bots.filter((p) => p.role === ROLE.MAFIA);
  let mafiaVotesApplied = 0;
  for (const bot of mafiaBots) {
    if (applyBotMafiaKillVote(room, bot)) mafiaVotesApplied++;
  }
  if (mafiaBots.length) syncMafiaKillVotes(room);

  for (const bot of bots) {
    if (bot.role === ROLE.SPY && !actions.spyResolved) {
      if (!actions.spyTarget) {
        actions.spyTarget = pickBotNightActionTarget(room, bot, ROLE.SPY);
      }
      if (actions.spyTarget && !actions.spyResolved) {
        rememberNightActor(room, bot.id, 'spy', actions.spyTarget);
        deliverSpyResult(room, bot, actions.spyTarget);
      }
    }
    if (bot.role === ROLE.POLICE && !actions.policeResolved) {
      if (!actions.policeTarget) {
        actions.policeTarget = pickBotNightActionTarget(room, bot, ROLE.POLICE);
      }
      if (actions.policeTarget && !actions.policeResolved) {
        rememberNightActor(room, bot.id, 'police', actions.policeTarget);
        deliverPoliceResult(room, bot, actions.policeTarget);
      }
    }
    if (bot.role === ROLE.DOCTOR && !actions.doctorTarget) {
      actions.doctorTarget = pickBotNightActionTarget(room, bot, ROLE.DOCTOR);
      if (actions.doctorTarget) rememberNightActor(room, bot.id, 'doctor', actions.doctorTarget);
    }
    if (bot.role === ROLE.REPORTER && !bot.reporterUsed && !actions.reporterTarget && room.game.nightIndex >= 2) {
      actions.reporterTarget = pickBotNightActionTarget(room, bot, ROLE.REPORTER);
      if (actions.reporterTarget) rememberNightActor(room, bot.id, 'reporter', actions.reporterTarget);
    }
    if (bot.role === ROLE.MEDIUM && !actions.mediumResolved) {
      if (!actions.mediumTarget) {
        actions.mediumTarget = pickBotNightActionTarget(room, bot, ROLE.MEDIUM);
      }
      if (actions.mediumTarget) {
        const t = getPlayerById(room, actions.mediumTarget);
        if (t && mediumPurify.isMediumPurifyEligible(room, t)) {
          rememberNightActor(room, bot.id, 'medium', actions.mediumTarget);
          deliverMediumResult(room, bot, actions.mediumTarget);
        } else {
          actions.mediumTarget = null;
        }
      }
    }
    if (bot.role === ROLE.CULT_LEADER && m42Cult.canProselytizeTonight(room, bot)) {
      const cultTargetId = pickBotCultTarget(room, bot);
      if (cultTargetId) {
        const cultResult = applyCultProselytizeAttempt(room, bot, cultTargetId);
        if (!cultResult.ok && cultResult.failType === 'mafia') {
          const retryId = pickBotCultTarget(room, bot);
          if (retryId && retryId !== cultTargetId) {
            applyCultProselytizeAttempt(room, bot, retryId);
          }
        }
      }
    }
  }
  for (const bot of bots) {
    if (bot.role === ROLE.PRIVATE_DETECTIVE && !actions.privateDetectiveWatchId) {
      const wid = pickBotNightActionTarget(room, bot, ROLE.PRIVATE_DETECTIVE);
      if (wid) actions.privateDetectiveWatchId = wid;
    }
  }
  if (mafiaVotesApplied > 0) broadcastState(room);
  console.log(`[BOT] smart night actions (${bots.length} bots, mafiaVotes=${mafiaVotesApplied})`);
}

function scheduleBotNightActions(room) {
  if (!hasBots(room)) return;
  runBotNightActions(room);
  [2200, 5500, 9000, 13000].forEach((ms) => {
    scheduleRoomTask(room, () => runBotNightActions(room), ms);
  });
}

function createBotPlayer(room) {
  const botNum = getBots(room).length + 1;
  return {
    id: randomUUID(),
    userID: `bot:${randomUUID()}`,
    nickname: `봇${botNum}`,
    isBot: true,
    role: null,
    alive: true,
    connected: true,
    soldierShieldUsed: false,
    reporterUsed: false,
    joinedMafiaChat: false,
    spyRevealedToMafia: false,
    joinedCult: false,
    disconnectTimer: null,
    timeShortened: false,
    timeIncreased: false
  };
}

function addBotToRoom(room) {
  if (Object.keys(room.players).length >= MAX_PLAYERS) return { ok: false, message: '방이 가득 찼습니다.' };
  const bot = createBotPlayer(room);
  room.players[bot.id] = bot;
  console.log(`[BOT] added ${bot.nickname} to room ${room.code}`);
  return { ok: true, bot };
}

function removeBotFromRoom(room) {
  const bots = getBots(room);
  if (!bots.length) return { ok: false, message: '제거할 봇이 없습니다.' };
  const bot = bots[bots.length - 1];
  delete room.players[bot.id];
  console.log(`[BOT] removed ${bot.nickname} from room ${room.code}`);
  return { ok: true, bot };
}

// ─── role assignment ──────────────────────────────────────────────────────────

function getMafiaCount(total) {
  if (total <= 7) return 1;
  if (total >= 15) return 3;
  return 2;
}

function assignRoles(playerIds) {
  const total = playerIds.length;
  const mafiaCount = getMafiaCount(total);
  const roles = [];

  for (let i = 0; i < mafiaCount; i++) roles.push(ROLE.MAFIA);
  if (total >= 9) roles.push(ROLE.SPY);

  const civilianPriority = [
    ROLE.PRIVATE_DETECTIVE,
    ROLE.POLICE, ROLE.DOCTOR, ROLE.SOLDIER, ROLE.POLITICIAN,
    ROLE.MEDIUM, ROLE.REPORTER, ROLE.GRAVEROBBER
  ];

  for (const role of civilianPriority) {
    if (roles.length < total) roles.push(role);
  }
  if (total >= 10 && roles.length < total) roles.push(ROLE.CULT_LEADER);
  const fillerPool = shuffle([
    ROLE.SOLDIER, ROLE.SOLDIER, ROLE.SOLDIER, ROLE.SOLDIER,
    ROLE.POLITICIAN, ROLE.POLITICIAN, ROLE.POLITICIAN, ROLE.POLITICIAN
  ]);
  let fi = 0;
  while (roles.length < total) {
    roles.push(fillerPool[fi % fillerPool.length]);
    fi += 1;
  }

  const shuffledRoles = shuffle(roles);
  const assignment = {};
  playerIds.forEach((id, i) => { assignment[id] = shuffledRoles[i]; });
  return assignment;
}

// ─── room manager ─────────────────────────────────────────────────────────────

function createRoom(hostUserId, hostNickname) {
  const code = generateRoomCode();
  const hostPlayerId = randomUUID();
  const room = {
    code,
    hostUserId,
    phase: PHASE.LOBBY,
    players: {
      [hostPlayerId]: {
        id: hostPlayerId,
        userID: hostUserId,
        nickname: hostNickname,
        role: null,
        alive: true,
        connected: true,
        soldierShieldUsed: false,
        reporterUsed: false,
        joinedMafiaChat: false,
        disconnectTimer: null,
        isBot: false,
        timeShortened: false,
        timeIncreased: false
      }
    },
    game: null,
    phaseTimer: null,
    phaseEndsAt: null,
    chatLog: { lobby: [], day: [], mafia: [], cult: [], dead: [], lastWords: [] },
    pendingReporterReveal: null,
    pendingReporterRevealData: null,
    pendingMotions: [],
    pendingReporterMotion: null,
    resolvingDayVote: false,
    taskGeneration: 0,
    botActionGeneration: 0,
    botLastWordsSent: false,
    phaseAdvancing: false
  };
  rooms.set(code, room);
  return room;
}

function initGameState(room) {
  const playerIds = Object.keys(room.players);
  const roleMap = assignRoles(playerIds);

  for (const id of playerIds) {
    const p = room.players[id];
    p.role = roleMap[id];
    p.alive = true;
    p.soldierShieldUsed = false;
    p.reporterUsed = false;
    p.joinedMafiaChat = p.role === ROLE.MAFIA;
    p.spyRevealedToMafia = false;
    p.joinedCult = p.role === ROLE.CULT_LEADER;
    p.deadSinceNightIndex = null;
  }

  room.game = {
    nightIndex: 0,
    dayIndex: 0,
    winner: null,
    dayTopVotedId: null,
    executionCandidateId: null,
    nightActions: {},
    dayVotes: {},
    executionVotes: {},
    roleRollCallOpen: false,
    mafiaVotes: {},
    firstNightDeathId: null,
    graverobberInherited: false,
    dawnAnnouncements: [],
    pendingAnnouncements: [],
    policeIntel: {},
    botFakePoliceHistory: {},
    publicVoteIntel: [],
    publicPoliceClaimIds: {},
    cultProselytizedIds: []
  };
  room.chatLog = { lobby: [], day: [], mafia: [], cult: [], dead: [], lastWords: [] };
  room.pendingReporterReveal = null;
  room.pendingReporterRevealData = null;
  room.pendingMotions = [];
  room.pendingReporterMotion = null;
  bumpRoomTaskGeneration(room);
  room.botLastWordsSent = false;
  room.game.botMinds = {};
}

function resetNightActions(room) {
  room.game.nightActions = {
    mafiaVotes: {},
    spyTarget: null,
    policeTarget: null,
    policeActorId: null,
    doctorTarget: null,
    reporterTarget: null,
    mediumTarget: null,
    actorNightTarget: {},
    privateDetectiveWatchId: null,
    spyResolved: false,
    policeResolved: false,
    mediumResolved: false,
    cultTarget: null,
    cultResolved: false,
    cultProselytizedSuccess: false,
    cultFailed: false,
    cultFailedTargetId: null
  };
  room.game.mafiaVotes = {};
}

// ─── win checker ──────────────────────────────────────────────────────────────

function checkWin(room) {
  const g = room.game;
  if (g && g.nightIndex >= M42.NIGHT_LIMIT_MAFIA_WIN) {
    return {
      winner: 'mafia',
      message: `${M42.NIGHT_LIMIT_MAFIA_WIN}번째 밤이 지나 마피아 팀이 승리했습니다.`
    };
  }

  const alive = getAlivePlayers(room);
  const aliveMafiaTeam = alive.filter((p) => isMafiaTeam(p.role));
  const aliveCitizenTeam = alive.filter((p) => !isMafiaTeam(p.role) && !isCultMember(p));

  if (aliveMafiaTeam.length === 0) {
    const cultWin = m42Cult.checkCultWinAfterMafiaGone(room, alive, {
      isMafiaTeam,
      getDayVoteWeight
    });
    if (cultWin) return cultWin;
    return { winner: 'citizens', message: '시민 팀 승리! 마피아 팀이 모두 제거되었습니다.' };
  }
  const aliveForMafiaCompare = alive.filter((p) => !isCultMember(p));
  if (aliveMafiaTeam.length >= aliveForMafiaCompare.length && aliveMafiaTeam.length > 0) {
    return { winner: 'mafia', message: '마피아 팀 승리! 마피아 팀이 우위를 점했습니다.' };
  }
  return null;
}

/** 공개 스킬·조결 등으로 UI에 고정 표시할 직업 힌트 (플레이어 id → role 키) */
function computePublicRoleHints(room) {
  const list = room.game?.publicVoteIntel;
  if (!Array.isArray(list) || !list.length) return {};
  const HARD_PUBLIC_ROLE_SOURCES = new Set([
    'reporter',
    'soldier_block',
    'medium'
  ]);
  const byId = {};
  for (const row of list) {
    const id = row.targetId;
    if (id == null || !row.role) continue;
    if (!HARD_PUBLIC_ROLE_SOURCES.has(row.source)) continue;
    byId[id] = row.role;
  }
  agentLog({
    hypothesisId: 'strict-public-role-hints',
    location: 'computePublicRoleHints',
    message: 'only hard public role sources can pin portraits',
    data: {
      roomCode: room.code,
      phase: room.phase,
      totalIntelRows: list.length,
      acceptedRows: list
        .filter((r) => r && r.targetId != null && r.role && HARD_PUBLIC_ROLE_SOURCES.has(r.source))
        .map((r) => ({ targetId: r.targetId, role: r.role, source: r.source })),
      ignoredRows: list
        .filter((r) => !r || r.targetId == null || !r.role || !HARD_PUBLIC_ROLE_SOURCES.has(r.source))
        .slice(-12)
        .map((r) => ({
          targetId: r?.targetId ?? null,
          role: r?.role ?? null,
          isMafia: r?.isMafia ?? null,
          source: r?.source ?? null
        }))
    }
  });
  return byId;
}

// ─── client state ─────────────────────────────────────────────────────────────

function toClientState(room, viewerUserId, opts = {}) {
  const includeChat = !!opts.includeChat;
  const viewer = getPlayerByUserId(room, viewerUserId);
  const viewerId = viewer ? viewer.id : null;

  const publicRoleHints =
    room.game && room.phase !== PHASE.LOBBY && room.phase !== PHASE.GAME_OVER
      ? computePublicRoleHints(room)
      : {};
  const policeClaimants = new Set();
  if (room.phase === PHASE.DAY_CHAT) {
    const dayMsgs = getDayMessages(room).slice(-32);
    for (const msg of dayMsgs) {
      if (!msg || !msg.fromId || !msg.text || msg.system) continue;
      if (policeFmt.looksLikePoliceReport(msg.text, room)) policeClaimants.add(msg.fromId);
    }
  }
  const confirmedPoliceIds = new Set(
    Object.entries(publicRoleHints)
      .filter(([, role]) => role === ROLE.POLICE)
      .map(([pid]) => pid)
  );
  const matchedPoliceClaimIds = new Set();
  if (!confirmedPoliceIds.size && policeClaimants.size >= 2) {
    for (const pid of policeClaimants) matchedPoliceClaimIds.add(pid);
  }
  const matchedClaimRoleById = {};
  if (room.phase === PHASE.DAY_CHAT) {
    const conflicts = m42Matclaim.scanMatClaimConflicts(room, voteFactHelpers);
    for (const c of conflicts) {
      for (const cl of c.claimants || []) {
        if (!cl || cl.id == null) continue;
        matchedClaimRoleById[cl.id] = c.role;
      }
    }
  }

  const players = Object.values(room.players).map(p => {
    const base = {
      id: p.id,
      nickname: p.nickname,
      alive: p.alive,
      connected: p.connected,
      isHost: p.userID === room.hostUserId,
      isBot: !!p.isBot,
      deadSinceNightIndex: !p.alive && room.game ? (p.deadSinceNightIndex ?? null) : null,
      publicConfirmedRole: room.phase !== PHASE.GAME_OVER ? (publicRoleHints[p.id] || null) : null,
      isMatchedPoliceClaim: room.phase !== PHASE.GAME_OVER ? matchedPoliceClaimIds.has(p.id) : false,
      matchedClaimRole: room.phase !== PHASE.GAME_OVER ? (matchedClaimRoleById[p.id] || null) : null
    };
    if (room.phase === PHASE.LOBBY) return base;
    if (room.phase === PHASE.GAME_OVER) {
      return { ...base, role: p.role, roleLabel: ROLE_LABELS[p.role] };
    }
    if (p.id === viewerId) {
      return { ...base, role: p.role, roleLabel: ROLE_LABELS[p.role] };
    }
    if (viewer && isVisibleMafiaAlly(viewer, p, room)) {
      return {
        ...base,
        isMafiaTeammate: true,
        role: p.role,
        roleLabel: ROLE_LABELS[p.role]
      };
    }
    if (viewer && isVisibleCultFollower(viewer, p)) {
      return {
        ...base,
        isCultFollower: true,
        role: p.role,
        roleLabel: ROLE_LABELS[p.role]
      };
    }
    return base;
  });

  const remaining = room.phaseEndsAt ? Math.max(0, room.phaseEndsAt - Date.now()) : 0;

  let dayVoteLiveTally;
  let dayVoteTallyHidden = false;
  if (room.game && room.phase === PHASE.DAY_VOTE) {
    dayVoteTallyHidden = remaining > 0 && remaining <= M42.VOTE_TALLY_HIDE_MS;
    if (!dayVoteTallyHidden) dayVoteLiveTally = buildDayVoteTally(room);
  }
  const pdWatchId = viewer && viewer.role === ROLE.PRIVATE_DETECTIVE && room.game?.nightActions
    ? (room.game.nightActions.privateDetectiveWatchId || null)
    : null;
  const pdSummary = viewer && viewer.role === ROLE.PRIVATE_DETECTIVE
    ? (room.game?.lastNightReport?.privateDetective || null)
    : null;
  const pdPointedId = pdSummary ? (pdSummary.targetId || null) : null;
  if (policeClaimants.size >= 2 || confirmedPoliceIds.size) {
    agentLog({
      hypothesisId: 'matched-police-visual-state',
      location: 'toClientState',
      message: 'matched police visual state snapshot',
      data: {
        roomCode: room.code,
        phase: room.phase,
        viewerId,
        policeClaimants: Array.from(policeClaimants),
        confirmedPoliceIds: Array.from(confirmedPoliceIds),
        matchedPoliceClaimIds: Array.from(matchedPoliceClaimIds),
        matchedClaimRoleById
      }
    });
  }
  if (viewer && !viewer.alive) {
    const visibleRoleCards = players
      .filter((p) => p.publicConfirmedRole || p.isMafiaTeammate || p.isCultFollower)
      .map((p) => ({
        id: p.id,
        role: p.publicConfirmedRole || p.role || null,
        mafiaTeam: !!p.isMafiaTeammate,
        cultTeam: !!p.isCultFollower
      }));
    agentLog({
      hypothesisId: 'dead-grid-visibility',
      location: 'toClientState.deadViewerSnapshot',
      message: 'dead viewer grid visibility sync',
      data: {
        roomCode: room.code,
        phase: room.phase,
        viewerId,
        viewerRole: viewer.role,
        visibleRoleCardsCount: visibleRoleCards.length,
        visibleRoleCards,
        pdWatchId,
        pdPointedId
      }
    });
  }

  return {
    roomCode: room.code,
    phase: room.phase,
    serverStability: SERVER_STABILITY,
    rulesProfile: 'm42-classic',
    players,
    isHost: viewer && viewer.userID === room.hostUserId,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    playerCount: Object.keys(room.players).length,
    botCount: getBots(room).length,
    phaseRemainingMs: remaining,
    executionCandidateId: room.game ? room.game.executionCandidateId : null,
    dayTopVotedId: room.game ? room.game.dayTopVotedId : null,
    nightIndex: room.game ? room.game.nightIndex : 0,
    dayIndex: room.game ? room.game.dayIndex : 0,
    winner: room.game ? room.game.winner : null,
    dawnAnnouncements: room.game ? room.game.dawnAnnouncements : [],
    canMafiaChat: viewer && (viewer.role === ROLE.MAFIA || viewer.joinedMafiaChat) && viewer.alive,
    canDeadChatView: viewer && (!viewer.alive || viewer.role === ROLE.MEDIUM),
    canDeadChatSend: viewer && !viewer.alive,
    myDayVoteTarget: viewer && room.game && room.game.dayVotes[viewerId] ? room.game.dayVotes[viewerId] : null,
    myDayVoteWeight: viewer && viewer.alive ? getDayVoteWeight(viewer) : 0,
    dayVoteLiveTally,
    dayVoteTallyHidden,
    myExecutionVote: viewer && room.game && room.game.executionVotes[viewerId] ? room.game.executionVotes[viewerId] : null,
    myPlayerId: viewerId,
    myRole: viewer ? viewer.role : null,
    myRoleLabel: viewer && viewer.role ? ROLE_LABELS[viewer.role] : null,
    myMafiaKillTarget: viewer && viewer.role === ROLE.MAFIA && room.game?.nightActions?.mafiaVotes
      ? (room.game.nightActions.mafiaVotes[viewerId] || null)
      : null,
    mafiaKillStatus: buildMafiaKillStatus(room),
    mafiaNightVoteBreakdown: buildMafiaNightVoteBreakdown(room, viewer),
    reporterUsed: viewer ? viewer.reporterUsed : false,
    spyResolved: !!(viewer && room.game && room.game.nightActions && room.game.nightActions.spyResolved),
    policeResolved: !!(viewer && room.game && room.game.nightActions && room.game.nightActions.policeResolved),
    mediumResolved: !!(viewer && room.game && room.game.nightActions && room.game.nightActions.mediumResolved),
    joinedMafiaChat: viewer ? viewer.joinedMafiaChat : false,
    joinedCult: viewer ? isCultMember(viewer) : false,
    canCultChat: !!(viewer && viewer.alive && room.phase === PHASE.NIGHT
      && (viewer.role === ROLE.CULT_LEADER || isCultMember(viewer))),
    cultProselytizeTonight: !!(viewer && m42Cult.canProselytizeTonight(room, viewer)),
    myCultProselytizeTarget: viewer && viewer.role === ROLE.CULT_LEADER && room.game?.nightActions?.cultTarget
      ? room.game.nightActions.cultTarget
      : null,
    cultResolved: !!(viewer && room.game?.nightActions?.cultProselytizedSuccess),
    cultProselytizedSuccess: !!(viewer && room.game?.nightActions?.cultProselytizedSuccess),
    myPrivateDetectiveWatchId: pdWatchId,
    myPrivateDetectivePointedId: pdPointedId,
    canTimeShorten: !!(viewer && viewer.alive && room.phaseTimer && !viewer.timeShortened &&
      room.phase !== PHASE.NIGHT && room.phase !== PHASE.DAWN &&
      room.phase !== PHASE.DAY_VOTE && room.phase !== PHASE.EXECUTION_VOTE && room.phase !== PHASE.LAST_WORDS),
    canTimeExtend: !!(viewer && viewer.alive && room.phaseTimer && !viewer.timeIncreased &&
      room.phase !== PHASE.NIGHT && room.phase !== PHASE.DAWN &&
      room.phase !== PHASE.DAY_VOTE && room.phase !== PHASE.EXECUTION_VOTE && room.phase !== PHASE.LAST_WORDS),
    debugRoles: viewer && viewer.userID === room.hostUserId && hasBots(room) && room.phase !== PHASE.LOBBY
      ? Object.values(room.players).map(p => ({
          nickname: p.nickname,
          roleLabel: p.role ? ROLE_LABELS[p.role] : '?',
          isBot: !!p.isBot,
          alive: p.alive
        }))
      : null,
    lobbyChat: includeChat && room.phase === PHASE.LOBBY ? room.chatLog.lobby.slice(-STATE_SYNC_CHAT_LIMIT) : undefined,
    dayChat: includeChat && room.phase !== PHASE.LOBBY && room.game
      ? getDayChatForViewer(room, viewer).slice(-STATE_SYNC_CHAT_LIMIT)
      : undefined,
    deadChat: includeChat && viewer && room.game && canReceiveDeadChat(viewer)
      ? room.chatLog.dead.slice(-STATE_SYNC_CHAT_LIMIT)
      : undefined,
    mafiaChat: includeChat && viewer && room.game && viewer.alive
      && (viewer.role === ROLE.MAFIA || viewer.joinedMafiaChat)
      ? room.chatLog.mafia.slice(-STATE_SYNC_CHAT_LIMIT)
      : undefined,
    cultChat: includeChat && viewer && room.game && viewer.alive && isCultMember(viewer)
      ? (room.chatLog.cult || []).slice(-STATE_SYNC_CHAT_LIMIT)
      : undefined,
    lastWordsChat: includeChat && room.game
      ? room.chatLog.lastWords.slice(-STATE_SYNC_CHAT_LIMIT)
      : undefined
  };
}

function broadcastStateNow(room) {
  if (!room) return;
  if (!canEmitRoomEvent(room, 'general')) return;
  ensurePhaseTimer(room);
  for (const p of Object.values(room.players)) {
    if (!p.connected || p.isBot) continue;
    const sess = sessions.get(p.userID);
    if (!sess || !sess.socketId) continue;
    io.to(sess.socketId).emit('stateSync', toClientState(room, p.userID, { includeChat: false }));
  }
}

function broadcastState(room) {
  if (!room) return;
  if (room._broadcastStateTimer) clearTimeout(room._broadcastStateTimer);
  room._broadcastStateTimer = setTimeout(() => {
    room._broadcastStateTimer = null;
    broadcastStateNow(room);
  }, 200);
}

function broadcastToRoom(room, event, data, filterFn) {
  for (const p of Object.values(room.players)) {
    if (!p.connected) continue;
    if (filterFn && !filterFn(p)) continue;
    const sess = sessions.get(p.userID);
    if (sess && sess.socketId) io.to(sess.socketId).emit(event, data);
  }
}

function broadcastAnimation(room, animClass, filterFn) {
  broadcastToRoom(room, 'animation', { className: animClass }, filterFn);
}

function emitSkillNotice(userID, payload) {
  const sess = sessions.get(userID);
  if (sess && sess.socketId) {
    io.to(sess.socketId).emit('skillNotice', payload);
  }
}

function deliverPoliceResult(room, police, targetId) {
  const target = getPlayerById(room, targetId);
  if (!police || !target || !police.alive) return;
  if (room.game?.nightActions?.policeResolved) return;
  const nightIdx = room.game?.nightIndex || 0;
  const prior = (room.game?.policeIntel?.[police.id] || []).find((r) => r.nightIndex === nightIdx);
  if (prior) {
    if (room.game.nightActions) {
      room.game.nightActions.policeResolved = true;
      room.game.nightActions.policeTarget = prior.targetId;
      room.game.nightActions.policeActorId = police.id;
    }
    return;
  }
  if (room.game?.nightActions) {
    room.game.nightActions.policeTarget = targetId;
    room.game.nightActions.policeActorId = police.id;
  }
  const isMafia = isMafiaRole(target.role);
  emitMotionToUser(police.userID, isMafia ? {
    type: 'police_mafia',
    title: '경찰 수색',
    message: `${target.nickname}님은 마피아입니다.`,
    situation: '[상황] 경찰 조사 결과'
  } : {
    type: 'police_innocent',
    title: '경찰 조사',
    message: `${target.nickname}님은 마피아가 아닙니다.`,
    situation: '밤에 조사한 플레이어가 마피아가 아닐 경우'
  });
  const sess = sessions.get(police.userID);
  if (sess && sess.socketId) {
    io.to(sess.socketId).emit('privateInfo', {
      type: 'police',
      targetId,
      targetName: target.nickname,
      isMafia,
      instant: true
    });
  }
  emitSkillNotice(police.userID, {
    scope: 'private',
    kind: 'police',
    title: '경찰 조사 결과',
    message: isMafia
      ? `${target.nickname}님은 마피아입니다.`
      : `${target.nickname}님은 마피아가 아닙니다.`
  });
  if (room.game && room.game.nightActions) room.game.nightActions.policeResolved = true;
  recordPoliceInvestigation(room, police.id, targetId, isMafia);
  if (police.isBot) botLearnRole(room, police.id, targetId, target.role);
}

function deliverSpyResult(room, spy, targetId) {
  const target = getPlayerById(room, targetId);
  if (!spy || !target || !spy.alive) return;
  if (room.game?.nightActions?.spyResolved) return;
  const resultRole = target.role;
  const isMafia = isMafiaRole(resultRole);
  if (isMafia) {
    spy.joinedMafiaChat = true;
    spy.spyRevealedToMafia = true;
    emitMafiaTeamInfo(room, spy);
    for (const p of Object.values(room.players)) {
      if (!isMafiaRole(p.role) || !p.alive) continue;
      emitMafiaTeamInfo(room, p);
      emitSkillNotice(p.userID, {
        scope: 'private',
        kind: 'mafia',
        title: '스파이 접선',
        message: `${spy.nickname}님(스파이)과 접선했습니다. 플레이어 목록에 표시됩니다.`
      });
    }
    // #region agent log
    agentLog({
      hypothesisId: 'S',
      location: 'server.js:deliverSpyResult',
      message: 'spy revealed to mafia after contact',
      runId: 'spy-contact',
      data: { spy: spy.nickname, target: target.nickname, isMafia: true }
    });
    // #endregion
  }
  emitMotionToUser(spy.userID, isMafia ? {
    type: 'spy_contact',
    title: '스파이 접선',
    message: '마피아와 접선했습니다.',
    situation: '[상황] 스파이와 마피아가 접선을 함'
  } : {
    type: 'spy_investigate',
    title: '스파이 조사',
    message: `그 사람의 직업은 ${ROLE_LABELS[resultRole]}입니다.`,
    situation: '[상황] 밤에 조사한 플레이어의 직업을 확인한 경우'
  });
  const sess = sessions.get(spy.userID);
  if (sess && sess.socketId) {
    io.to(sess.socketId).emit('privateInfo', {
      type: 'spy',
      targetId,
      targetName: target.nickname,
      role: resultRole,
      roleLabel: ROLE_LABELS[resultRole],
      joinedMafiaChat: isMafia,
      instant: true
    });
  }
  emitSkillNotice(spy.userID, {
    scope: 'private',
    kind: 'spy',
    title: '스파이 조사 결과',
    message: isMafia
      ? `${target.nickname} — 마피아 (마피아 채팅 합류)`
      : `${target.nickname}의 직업: ${ROLE_LABELS[resultRole]}`
  });
  if (room.game && room.game.nightActions) room.game.nightActions.spyResolved = true;
  if (spy.isBot) botLearnRole(room, spy.id, targetId, resultRole);
  broadcastState(room);
}

function canReporterScoop(room, reporter) {
  return !!(
    reporter
    && reporter.alive
    && reporter.role === ROLE.REPORTER
    && !reporter.reporterUsed
    && room.game
    && (room.game.nightIndex || 0) >= 2
  );
}

function deliverReporterScoop(room, reporter, targetId) {
  const target = getPlayerById(room, targetId);
  if (!reporter || !target || reporter.reporterUsed) return;
  if (!canReporterScoop(room, reporter)) {
    // #region agent log
    agentLog({
      hypothesisId: 'R3',
      location: 'server.js:deliverReporterScoop',
      message: 'reporter scoop blocked',
      runId: 'reporter-fix',
      data: {
        reporter: reporter?.nickname,
        role: reporter?.role,
        reporterUsed: !!reporter?.reporterUsed,
        nightIndex: room.game?.nightIndex
      }
    });
    // #endregion
    return;
  }
  reporter.reporterUsed = true;
  room.pendingReporterRevealData = {
    targetId: target.id,
    targetName: target.nickname,
    role: target.role,
    roleLabel: ROLE_LABELS[target.role],
    reporterId: reporter.id,
    reporterName: reporter.nickname
  };
  // #region agent log
  agentLog({
    hypothesisId: 'R4',
    location: 'server.js:deliverReporterScoop',
    message: 'reporter scoop recorded',
    runId: 'reporter-fix',
    data: {
      reporter: reporter.nickname,
      target: target.nickname,
      roleLabel: ROLE_LABELS[target.role],
      nightIndex: room.game.nightIndex,
      inherited: !!reporter._inheritedReporterFrom
    }
  });
  // #endregion
  room.pendingReporterReveal = `기자 취재: ${target.nickname}의 직업은 [${ROLE_LABELS[target.role]}] 입니다.`;
  emitMotionToUser(reporter.userID, {
    type: 'reporter_scoop',
    title: '기자 취재',
    message: `그 사람의 직업은 ${ROLE_LABELS[target.role]}입니다.`,
    situation: '[상황] 취재 결과는 다음 날 아침에 공표됩니다.'
  });
  const sess = sessions.get(reporter.userID);
  if (sess && sess.socketId) {
    io.to(sess.socketId).emit('privateInfo', {
      type: 'reporter',
      targetId,
      targetName: target.nickname,
      role: target.role,
      roleLabel: ROLE_LABELS[target.role],
      instant: true
    });
  }
  emitSkillNotice(reporter.userID, {
    scope: 'private',
    kind: 'reporter',
    title: '기자 취재 결과',
    message: `${target.nickname} → ${ROLE_LABELS[target.role]} (아침에 전원 공표)`
  });
  broadcastAnimation(room, 'anim-reporter-flash', p => p.id === reporter.id);
  if (reporter.isBot) botLearnRole(room, reporter.id, targetId, target.role);
}

function canMediumPurifyTarget(room, medium, targetId) {
  const target = getPlayerById(room, targetId);
  if (!medium || !target || !medium.alive || medium.role !== ROLE.MEDIUM) return false;
  if (target.alive) return false;
  if (room.game?.nightActions?.mediumResolved) return false;
  return mediumPurify.isMediumPurifyEligible(room, target);
}

function deliverMediumResult(room, medium, targetId) {
  const target = getPlayerById(room, targetId);
  if (!medium || !target || !medium.alive || target.alive) return;
  if (room.game?.nightActions?.mediumResolved) return;
  if (!mediumPurify.isMediumPurifyEligible(room, target)) {
    // #region agent log
    agentLog({
      hypothesisId: 'M1',
      location: 'server.js:deliverMediumResult',
      message: 'medium purify blocked ineligible',
      runId: 'medium-fix',
      data: {
        target: target.nickname,
        deadSinceNightIndex: target.deadSinceNightIndex,
        nightIndex: room.game?.nightIndex
      }
    });
    // #endregion
    return;
  }
  // #region agent log
  agentLog({
    hypothesisId: 'M2',
    location: 'server.js:deliverMediumResult',
    message: 'medium purify success',
    runId: 'medium-fix',
    data: {
      medium: medium.nickname,
      target: target.nickname,
      roleLabel: ROLE_LABELS[target.role],
      nightIndex: room.game?.nightIndex
    }
  });
  // #endregion
  emitMotionToUser(medium.userID, {
    type: 'spy_investigate',
    title: '영매 성불',
    message: `${target.nickname}의 직업은 ${ROLE_LABELS[target.role]}입니다.`,
    situation: '[상황] 성불로 사망자의 직업을 확인한 경우'
  });
  const sess = sessions.get(medium.userID);
  if (sess && sess.socketId) {
    io.to(sess.socketId).emit('privateInfo', {
      type: 'medium',
      targetId,
      targetName: target.nickname,
      role: target.role,
      roleLabel: ROLE_LABELS[target.role],
      instant: true
    });
  }
  emitSkillNotice(medium.userID, {
    scope: 'private',
    kind: 'medium',
    title: '영매 성불 결과',
    message: `${target.nickname} → ${ROLE_LABELS[target.role]}`
  });
  if (room.game && room.game.nightActions) {
    room.game.nightActions.mediumResolved = true;
    room.game.nightActions.mediumTarget = targetId;
    room.game.pendingMediumReveal = {
      mediumId: medium.id,
      targetId: target.id,
      targetName: target.nickname,
      role: target.role,
      roleLabel: ROLE_LABELS[target.role],
      nightIndex: room.game.nightIndex
    };
  }
  if (medium.isBot) botLearnRole(room, medium.id, targetId, target.role);
  broadcastState(room);
}

function emitMotionToUser(userID, motion) {
  const sess = sessions.get(userID);
  if (sess && sess.socketId) io.to(sess.socketId).emit('gameMotion', motion);
}

function buildPrivateDetectiveNightSummary(room) {
  const na = room.game?.nightActions;
  if (!na?.privateDetectiveWatchId) return null;
  const watchId = na.privateDetectiveWatchId;
  const watched = getPlayerById(room, watchId);
  const watchName = watched ? watched.nickname : playerName(room, watchId);
  let row = na.actorNightTarget?.[watchId];
  if (!row && watched?.role === ROLE.MAFIA && na.mafiaVotes?.[watchId]) {
    row = { kind: 'mafia_kill', targetId: na.mafiaVotes[watchId] };
  }
  if (!row?.targetId) {
    // #region agent log
    agentLog({
      hypothesisId: 'PD_FACT_2',
      location: 'server.js:buildPrivateDetectiveNightSummary',
      message: 'detective summary no actionable target',
      runId: 'pd-fact-check',
      data: {
        watchId,
        watchName,
        hasActorMap: !!na.actorNightTarget?.[watchId],
        hasMafiaVote: !!na.mafiaVotes?.[watchId]
      }
    });
    // #endregion
    return { watchId, watchName, targetId: null, targetName: null, kind: null };
  }
  const t = getPlayerById(room, row.targetId);
  const summary = {
    watchId,
    watchName,
    targetId: row.targetId,
    targetName: t ? t.nickname : playerName(room, row.targetId),
    kind: row.kind || null
  };
  // #region agent log
  agentLog({
    hypothesisId: 'PD_FACT_1',
    location: 'server.js:buildPrivateDetectiveNightSummary',
    message: 'detective summary resolved from recorded night action',
    runId: 'pd-fact-check',
    data: {
      watchId: summary.watchId,
      watchName: summary.watchName,
      targetId: summary.targetId,
      targetName: summary.targetName,
      kind: summary.kind,
      source: na.actorNightTarget?.[watchId] ? 'actorNightTarget' : 'mafiaVotesFallback'
    }
  });
  // #endregion
  return summary;
}

function emitPrivateDetectiveDawnResults(room, summary) {
  if (!summary) return;
  const message = m42PrivateDetective.formatDetectiveResultLine(summary);
  const detectives = Object.values(room.players).filter(
    (p) => p.alive && p.role === ROLE.PRIVATE_DETECTIVE
  );
  const motion = {
    type: 'private_detective_search',
    title: '사립탐정 · 관찰',
    message,
    situation: '[추리] 밤에 한 생존자의 능력 지목 방향을 포착한 경우',
    duration: 5200
  };
  for (const pd of detectives) {
    emitMotionToUser(pd.userID, motion);
    emitSkillNotice(pd.userID, {
      scope: 'private',
      kind: 'private_detective',
      title: '관찰 결과',
      message
    });
  }
}

function emitMotion(room, motion, filterFn) {
  broadcastToRoom(room, 'gameMotion', motion, filterFn);
}

function queueDawnMotion(room, motion) {
  if (!room.pendingMotions) room.pendingMotions = [];
  room.pendingMotions.push(motion);
}

function flushDawnMotions(room) {
  if (!room.pendingMotions || !room.pendingMotions.length) return;
  const motions = [...room.pendingMotions];
  broadcastToRoom(room, 'gameMotionBatch', { motions });
  room.pendingMotions = [];
}

// ─── bot AI ───────────────────────────────────────────────────────────────────

function runBotActions(room) {
  if (!isActiveGame(room) || room.phase === PHASE.DAWN) return;

  const bots = getBots(room).filter(p => p.alive);
  if (!bots.length) return;

  const g = room.game;

  if (room.phase === PHASE.NIGHT) {
    runBotNightActions(room);
  }

  if (room.phase === PHASE.DAY_VOTE) {
    runBotDayVotes(room);
    return;
  }

  if (room.phase === PHASE.EXECUTION_VOTE) {
    runBotExecutionVotes(room);
  }

  if (room.phase === PHASE.LAST_WORDS) {
    if (room.botLastWordsSent) return;
    const candidate = getPlayerById(room, g.executionCandidateId);
    if (candidate && candidate.isBot) {
      room.botLastWordsSent = true;
      const text = botBrain.generateBotLastWords(room, candidate);
      const msg = { from: candidate.nickname, fromId: candidate.id, text, time: Date.now() };
      pushChat(room, 'lastWords', msg);
      broadcastToRoom(room, 'chatMessage', { channel: 'lastWords', ...msg });
    }
  }

  if (room.phase !== PHASE.NIGHT) {
    broadcastState(room);
  }
}

function scheduleBotActions(room, durationMs) {
  if (!hasBots(room) || !room.game) return;
  const gen = room.botActionGeneration;
  const runIfCurrent = () => {
    if (room.botActionGeneration !== gen) return;
    if (!isActiveGame(room)) return;
    runBotActions(room);
  };
  scheduleRoomTask(room, runIfCurrent, 1200);
  if (durationMs > 12000) {
    scheduleRoomTask(room, runIfCurrent, Math.floor(durationMs * 0.55));
  }
}

// ─── phase controller ─────────────────────────────────────────────────────────

function ensurePhaseTimer(room) {
  if (!room || !room.phaseEndsAt || room.phase === PHASE.LOBBY || room.phase === PHASE.GAME_OVER) return;
  if (room.game && room.game.winner) return;

  if (room.resolvingDayVote) {
    const stuckMs = room._dayVoteResolveAt ? Date.now() - room._dayVoteResolveAt : 99999;
    if (stuckMs > VOTE_RESULTS_DISPLAY_MS + 4000) {
      console.warn(`[ROOM ${room.code}] day vote resolve stuck ${stuckMs}ms — recover`);
      finishDayVoteResolve(room);
    }
    return;
  }

  if (room.phaseTimer || room.phaseAdvancing) return;
  const remaining = room.phaseEndsAt - Date.now();
  if (remaining <= 0) {
    onPhaseTimeout(room);
    return;
  }
  room.phaseTimer = setTimeout(() => onPhaseTimeout(room), remaining);
}

function clearPhaseTimer(room) {
  if (room.phaseTimer) {
    clearTimeout(room.phaseTimer);
    room.phaseTimer = null;
  }
  clearDayVoteResultsTimer(room);
}

function setPhase(room, phase, durationMs) {
  clearPhaseTimer(room);
  clearDayVoteResultsTimer(room);
  room.resolvingDayVote = false;
  room._dayVoteResolveAt = null;
  room._voteResultsPayload = null;
  bumpRoomTaskGeneration(room);
  room.botActionGeneration = (room.botActionGeneration || 0) + 1;
  room.phase = phase;
  room.botChatInFlight = false;
  if (phase === PHASE.DAY_CHAT && room.game) resetBotChatStats(room);
  room.phaseEndsAt = durationMs ? Date.now() + durationMs : null;
  if (phase === PHASE.LAST_WORDS) room.botLastWordsSent = false;

  for (const p of Object.values(room.players)) {
    p.timeShortened = false;
    p.timeIncreased = false;
  }

  if (durationMs) {
    room.phaseTimer = setTimeout(() => onPhaseTimeout(room), durationMs);
  }

  const phasePayload = {
    phase,
    remainingMs: durationMs || 0,
    nightIndex: room.game ? room.game.nightIndex : 0,
    dayIndex: room.game ? room.game.dayIndex : 0
  };
  if (room.game && (phase === PHASE.EXECUTION_VOTE || phase === PHASE.LAST_WORDS)) {
    phasePayload.executionCandidateId = room.game.executionCandidateId || null;
  }
  broadcastToRoom(room, 'phaseChanged', phasePayload);
  broadcastState(room);
  scheduleBotActions(room, durationMs || 0);
}

function adjustPhaseTime(room, player, type) {
  if (!room.phaseTimer || !room.phaseEndsAt) {
    return { ok: false, message: '지금은 시간을 조절할 수 없습니다.' };
  }
  if (room.phase === PHASE.LOBBY || room.phase === PHASE.GAME_OVER) {
    return { ok: false, message: '이 페이즈에서는 시간 조절이 불가합니다.' };
  }
  if (room.phase === PHASE.NIGHT) {
    return { ok: false, message: '밤에는 시간 조절이 불가합니다.' };
  }
  if (room.phase === PHASE.DAWN) {
    return { ok: false, message: '아침 결과 확인 중에는 시간 조절이 불가합니다.' };
  }
  if (room.phase === PHASE.DAY_VOTE || room.phase === PHASE.EXECUTION_VOTE || room.phase === PHASE.LAST_WORDS) {
    return { ok: false, message: '투표·찬반·최후변론 중에는 시간 조절이 불가합니다.' };
  }

  let delta;
  if (type === 'shorten') {
    if (player.timeShortened) return { ok: false, message: '이미 시간 단축을 사용했습니다.' };
    player.timeShortened = true;
    delta = -TIME_ADJUST_MS;
  } else if (type === 'extend') {
    if (player.timeIncreased) return { ok: false, message: '이미 시간 연장을 사용했습니다.' };
    player.timeIncreased = true;
    delta = TIME_ADJUST_MS;
  } else {
    return { ok: false, message: '잘못된 요청입니다.' };
  }

  const remaining = room.phaseEndsAt - Date.now();
  const newRemaining = Math.max(MIN_PHASE_REMAINING_MS, remaining + delta);

  clearPhaseTimer(room);
  room.phaseEndsAt = Date.now() + newRemaining;
  room.phaseTimer = setTimeout(() => onPhaseTimeout(room), newRemaining);

  console.log(`[TIME] ${player.nickname} ${type} ${delta > 0 ? '+' : ''}${delta / 1000}s -> ${Math.ceil(newRemaining / 1000)}s left`);
  broadcastToRoom(room, 'phaseChanged', {
    phase: room.phase,
    remainingMs: newRemaining,
    timerAdjust: true,
    nightIndex: room.game ? room.game.nightIndex : 0,
    dayIndex: room.game ? room.game.dayIndex : 0
  });
  broadcastState(room);
  return { ok: true };
}

function startNight(room) {
  if (room.game) room.game.dawnAnnouncements = [];
  room.game.nightIndex += 1;
  resetNightActions(room);

  console.log(`\n=== NIGHT ${room.game.nightIndex} (room ${room.code}) ===`);

  setPhase(room, PHASE.NIGHT, TIMERS[PHASE.NIGHT]);
  broadcastAnimation(room, 'anim-night-fall');
  scheduleBotNightActions(room);
}

function startDawn(room) {
  const g = room.game;
  if (g.pendingAnnouncements.length > 0) {
    g.dawnAnnouncements = [...g.pendingAnnouncements];
    g.pendingAnnouncements = [];
  }

  if (room.pendingReporterRevealData) {
    const reveal = room.pendingReporterRevealData;
    g.dawnAnnouncements.push(
      room.pendingReporterReveal
      || `기자 취재: ${reveal.targetName}의 직업은 [${reveal.roleLabel}] 입니다.`
    );
    broadcastToRoom(room, 'reporterReveal', reveal);
    room.pendingReporterReveal = null;
    room.pendingReporterRevealData = null;
  } else if (room.pendingReporterReveal) {
    g.dawnAnnouncements.push(room.pendingReporterReveal);
    room.pendingReporterReveal = null;
  }

  const motionCount = room.pendingMotions ? room.pendingMotions.length : 0;
  const dawnMs = Math.max(TIMERS[PHASE.DAWN], 4000 + motionCount * 4200 + 2000);
  setPhase(room, PHASE.DAWN, dawnMs);
  flushDawnMotions(room);
  room.pendingReporterMotion = null;
  broadcastAnimation(room, 'anim-dawn-rise');
}

function startDayChat(room) {
  const g = room.game;
  g.dayIndex += 1;
  /** 낮 채팅 로그는 날짜별로 비우지 않으므로, '오늘' 조결 여부 판별에 사용 */
  g.dayChatOpenedAt = Date.now();
  g.chatSuspicion = { byPlayer: {}, keywords: [] };
  g.dayVotes = {};
  g.executionVotes = {};
  g.roleRollCallOpen = false;
  g.executionCandidateId = null;
  g.lastNightReport = buildLastNightReport(room);
  voteIntel.ingestFromNightReport(room, g.lastNightReport, botLearnRole);
  g.dawnAnnouncements = [];
  g._nightSummary = null;
  resetBotChatStats(room);
  clearBotChatTimers(room);
  if (room.game) room.game.botPoliceBluffLedger = {};
  if (room.game) {
    delete room.game.botDoctorHealHintPlayerId;
    delete room.game.botMatgyeongJatuDay;
    delete room.game.botMatgyeongInvestigateRivalId;
  }
  const debateMs = computeDayChatDurationMs(room);
  setPhase(room, PHASE.DAY_CHAT, debateMs);
  scheduleBotDawnSkillReactions(room);
  schedulePrivateDetectiveReasonReply(room);
  schedulePrivateDetectiveBotDayBrief(room);
  schedulePdMatgyeongPoliceKilledLead(room);
  scheduleReporterRevealDayChat(room);
  scheduleInheritedReporterDayChat(room);
  scheduleReporterMatgyeongPrompt(room);
  scheduleMediumPurifyDayAnnounce(room);
  scheduleMediumDeathPurifyPrompt(room);
  scheduleBotDayChat(room);
  m42Bluff.ensureAllEvilFakeClaims(room, voteFactHelpers);
  m42Bluff.ensureMafiaPoliceBlufferClaim(room, voteFactHelpers);
  m42Bluff.scheduleMafiaRoleBluffWaves(room, voteFactHelpers, scheduleRoomTask, postBotDayMessage);
  scheduleMafiaEarlyPoliceBluff(room);
  if (!isRealPoliceAlive(room)) {
    scheduleMafiaBluffPoliceMaintains(room);
  } else {
    scheduleMafiaBluffWhileRealPolice(room);
  }
  schedulePoliceCitizenDayPlaybook(room);
  scheduleMatClaimDayPlaybook(room);
  const policePairDelay = isRealPoliceAlive(room) ? 1200 : 3500;
  scheduleRoomTask(room, () => {
    const policeBot = Object.values(room.players).find(
      (p) => p.role === ROLE.POLICE && p.alive && p.isBot
    );
    if (policeBot && getPoliceIntelForReport(room, policeBot.id).length) {
      replyBotPoliceReport(room, policeBot);
    }
  }, policePairDelay);
}

function startDayVote(room) {
  room.game.dayVotes = {};
  setPhase(room, PHASE.DAY_VOTE, TIMERS[PHASE.DAY_VOTE]);
  broadcastAnimation(room, 'anim-vote');
  scheduleBotDayVotes(room);
}

function startLastWords(room, candidateId) {
  room.game.executionCandidateId = candidateId;
  room.chatLog.lastWords = [];
  setPhase(room, PHASE.LAST_WORDS, TIMERS[PHASE.LAST_WORDS]);
}

function runBotExecutionVotes(room) {
  if (room.phase !== PHASE.EXECUTION_VOTE || !room.game) return;
  const g = room.game;
  const candidate = getPlayerById(room, g.executionCandidateId);
  if (!candidate) return;
  const bots = getBots(room).filter((p) => p.alive);
  let voted = 0;
  for (const bot of bots) {
    if (bot.id === g.executionCandidateId) continue;
    if (g.executionVotes[bot.id]) continue;
    g.executionVotes[bot.id] = botBrain.pickBotExecutionVote(room, bot, candidate);
    voted++;
  }
  if (voted > 0) {
    console.log(`[BOT] execution votes: ${voted} bots (candidate=${candidate.nickname})`);
    broadcastState(room);
  }
}

function scheduleBotExecutionVotes(room) {
  if (!hasBots(room)) return;
  runBotExecutionVotes(room);
  [1200, 2800, 4200].forEach((ms) => {
    scheduleRoomTask(room, () => runBotExecutionVotes(room), ms);
  });
}

function startExecutionVote(room) {
  room.game.executionVotes = {};
  setPhase(room, PHASE.EXECUTION_VOTE, TIMERS[PHASE.EXECUTION_VOTE]);
  broadcastAnimation(room, 'anim-execution');
  scheduleBotExecutionVotes(room);
}

function endGame(room, win) {
  bumpRoomTaskGeneration(room);
  clearPhaseTimer(room);
  room.game.winner = win.winner;
  room.phase = PHASE.GAME_OVER;
  room.phaseEndsAt = null;
  room.resolvingDayVote = false;
  broadcastToRoom(room, 'gameOver', win);
  broadcastState(room);
  console.log(`[GAME OVER] room=${room.code} winner=${win.winner}: ${win.message}`);
}

function resetRoomToLobby(room) {
  bumpRoomTaskGeneration(room);
  clearPhaseTimer(room);
  room.phase = PHASE.LOBBY;
  room.phaseEndsAt = null;
  room.game = null;
  room.chatLog = { lobby: [], day: [], mafia: [], dead: [], lastWords: [] };
  room.pendingReporterReveal = null;
  room.pendingReporterRevealData = null;
  room.pendingMotions = [];
  room.pendingReporterMotion = null;
  room.resolvingDayVote = false;

  for (const p of Object.values(room.players)) {
    p.role = null;
    p.alive = true;
    p.soldierShieldUsed = false;
    p.reporterUsed = false;
    p.joinedMafiaChat = false;
    p.spyRevealedToMafia = false;
    p.joinedCult = false;
    p.timeShortened = false;
    p.timeIncreased = false;
  }

  broadcastState(room);
  console.log(`[ROOM] ${room.code} reset to lobby for new game`);
}

function onPhaseTimeout(room) {
  if (room.phaseAdvancing) return;
  room.phaseAdvancing = true;
  clearPhaseTimer(room);
  try {
    switch (room.phase) {
      case PHASE.NIGHT:
        resolveNight(room);
        break;
      case PHASE.DAWN: {
        const win = checkWin(room);
        if (win) {
          endGame(room, win);
          break;
        }
        startDayChat(room);
        break;
      }
      case PHASE.DAY_CHAT:
        startDayVote(room);
        break;
      case PHASE.DAY_VOTE:
        resolveDayVote(room);
        break;
      case PHASE.LAST_WORDS:
        startExecutionVote(room);
        break;
      case PHASE.EXECUTION_VOTE:
        resolveExecutionVote(room);
        break;
      default:
        break;
    }
  } finally {
    room.phaseAdvancing = false;
  }
}

function buildMafiaNightVoteBreakdown(room, viewer) {
  if (!room.game || room.phase !== PHASE.NIGHT || !viewer || viewer.role !== ROLE.MAFIA || !viewer.alive) {
    return null;
  }
  const votes = room.game.nightActions?.mafiaVotes || {};
  const mafiaAlive = getAlivePlayers(room).filter((p) => p.role === ROLE.MAFIA);
  if (mafiaAlive.length <= 1) return null;

  const rows = mafiaAlive.map((m) => {
    const tid = votes[m.id];
    const tgt = tid ? getPlayerById(room, tid) : null;
    return {
      mafiaId: m.id,
      mafiaName: m.nickname,
      targetId: tid || null,
      targetName: tgt ? tgt.nickname : null
    };
  });

  const tally = {};
  for (const r of rows) {
    if (!r.targetId) continue;
    tally[r.targetId] = (tally[r.targetId] || 0) + 1;
  }
  const split = Object.keys(tally).length > 1;
  const undecided = rows.some((r) => !r.targetId);
  return { rows, tally, split, undecided };
}

function buildMafiaKillStatus(room) {
  if (!room.game || room.phase !== PHASE.NIGHT) return null;
  const mafiaAlive = getAlivePlayers(room).filter((p) => p.role === ROLE.MAFIA);
  if (!mafiaAlive.length) return null;
  const votes = room.game.nightActions?.mafiaVotes || {};
  const voted = mafiaAlive.filter((m) => votes[m.id]);
  const tally = {};
  for (const m of voted) {
    const t = votes[m.id];
    tally[t] = (tally[t] || 0) + 1;
  }
  const targets = Object.keys(tally);
  if (mafiaAlive.length === 1) {
    return votes[mafiaAlive[0].id] ? 'solo_ready' : 'solo_need_vote';
  }
  if (voted.length < mafiaAlive.length) return 'need_all_votes';
  if (targets.length > 1) return 'split_vote';
  return 'ready';
}

// ─── night resolver ─────────────────────────────────────────────────────────────

/** 생존 마피아 봇 표를 사람 표·합의 대상에 맞춤 */
function syncMafiaKillVotes(room) {
  if (!room.game?.nightActions) return;
  const actions = room.game.nightActions;
  if (!actions.mafiaVotes) actions.mafiaVotes = {};

  const mafiaAlive = getAlivePlayers(room).filter((p) => p.role === ROLE.MAFIA);
  if (!mafiaAlive.length) return;

  const humanMafia = mafiaAlive.filter((m) => !m.isBot);
  const botMafia = mafiaAlive.filter((m) => m.isBot);
  const allBots = mafiaAlive.every((m) => m.isBot);
  const solo = mafiaAlive.length === 1;

  const humanVotes = [...new Set(humanMafia.map((m) => actions.mafiaVotes[m.id]).filter(Boolean))];
  let consensus = null;

  if (humanVotes.length === 1) {
    consensus = humanVotes[0];
  } else if (humanVotes.length > 1) {
    return;
  } else {
    const botVotes = [...new Set(botMafia.map((m) => actions.mafiaVotes[m.id]).filter(Boolean))];
    if (botVotes.length === 1) consensus = botVotes[0];
    else consensus = pickMafiaKillConsensus(room, mafiaAlive[0]);
  }

  if (!consensus) return;

  if (solo || allBots) {
    for (const m of mafiaAlive) {
      actions.mafiaVotes[m.id] = consensus;
    }
    return;
  }

  if (!botMafia.length) return;
  for (const m of botMafia) {
    actions.mafiaVotes[m.id] = consensus;
  }
}

/** 밤 결산 직전: 미투표 마피아(봇·미입력 인간)를 합의 대상으로 채움 */
function ensureMafiaKillBeforeResolve(room) {
  syncMafiaKillVotes(room);
  if (!room.game?.nightActions) return;
  const actions = room.game.nightActions;
  if (!actions.mafiaVotes) actions.mafiaVotes = {};

  const mafiaAlive = getAlivePlayers(room).filter((p) => p.role === ROLE.MAFIA);
  if (!mafiaAlive.length) return;

  const botMafia = mafiaAlive.filter((m) => m.isBot);
  const humanMafia = mafiaAlive.filter((m) => !m.isBot);
  const allBots = mafiaAlive.every((m) => m.isBot);
  const solo = mafiaAlive.length === 1;

  const tally = {};
  for (const m of mafiaAlive) {
    const t = actions.mafiaVotes[m.id];
    if (t) tally[t] = (tally[t] || 0) + 1;
  }
  let consensus = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  if (!consensus) consensus = pickMafiaKillConsensus(room, mafiaAlive[0]);
  if (!consensus) return;

  if (solo || allBots) {
    for (const m of mafiaAlive) {
      actions.mafiaVotes[m.id] = consensus;
    }
    return;
  }

  for (const m of botMafia) {
    actions.mafiaVotes[m.id] = consensus;
  }

  const botVoteList = botMafia.map((m) => actions.mafiaVotes[m.id]).filter(Boolean);
  const botsUnanimous = botMafia.length > 0
    && botVoteList.length === botMafia.length
    && new Set(botVoteList).size === 1;
  if (botsUnanimous) {
    for (const h of humanMafia) {
      if (!actions.mafiaVotes[h.id]) {
        actions.mafiaVotes[h.id] = botVoteList[0];
        console.log(
          `[NIGHT][3-Kill] human mafia follows bot consensus -> ${playerName(room, botVoteList[0])}`
        );
      }
    }
  }
}

function getMafiaKillTarget(room) {
  if (!room.game?.nightActions) return null;
  ensureMafiaKillBeforeResolve(room);

  const mafiaAlive = getAlivePlayers(room).filter((p) => p.role === ROLE.MAFIA);
  const votes = room.game.nightActions.mafiaVotes || {};
  if (!mafiaAlive.length) return null;

  const voteSnapshot = mafiaAlive.map((m) => ({
    id: m.id,
    nick: m.nickname,
    bot: !!m.isBot,
    target: votes[m.id] || null
  }));

  if (mafiaAlive.length === 1) {
    const target = votes[mafiaAlive[0].id] || null;
    if (!target) console.log('[NIGHT][3-Kill] solo mafia — no vote', voteSnapshot);
    return target;
  }

  const tally = {};
  for (const m of mafiaAlive) {
    const t = votes[m.id];
    if (t) tally[t] = (tally[t] || 0) + 1;
  }
  const n = mafiaAlive.length;
  const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) {
    console.log('[NIGHT][3-Kill] no mafia votes', voteSnapshot);
    return null;
  }

  const [top, topCount] = sorted[0];
  const tiedTop = sorted.filter(([, c]) => c === topCount);
  const allVoted = mafiaAlive.every((m) => votes[m.id]);

  if (topCount === n) {
    console.log(`[NIGHT][3-Kill] unanimous → ${playerName(room, top)}`, voteSnapshot);
    return top;
  }
  if (tiedTop.length > 1) {
    console.log('[NIGHT][3-Kill] split vote', voteSnapshot, tally);
    return null;
  }
  if (!allVoted) {
    console.log('[NIGHT][3-Kill] not all mafia voted', voteSnapshot, tally);
    return null;
  }

  console.log(`[NIGHT][3-Kill] majority → ${playerName(room, top)}`, voteSnapshot);
  return top;
}

function flushPendingCultBell(room) {
  const g = room.game;
  if (!g || g._cultBellFired || !g._cultBellPending || !g.nightActions?.cultProselytizedSuccess) {
    if (g) g._cultBellPending = null;
    return;
  }
  const leader = getPlayerById(room, g._cultBellPending.leaderId);
  const target = getPlayerById(room, g._cultBellPending.targetId);
  if (leader && target) broadcastCultBellMotions(room, leader, target);
  else g._cultBellPending = null;
}

/** 포교 성공 후 밤 남은 시간 안에서 랜덤 시각에 종소리 */
function scheduleCultBellMotions(room, leader, target) {
  const g = room.game;
  if (!g) return;
  g._cultBellFired = false;
  g._cultBellPending = { leaderId: leader.id, targetId: target.id };

  const nightRemaining = room.phaseEndsAt
    ? Math.max(10000, room.phaseEndsAt - Date.now())
    : 55000;
  const minMs = Math.min(18000, Math.max(12000, Math.floor(nightRemaining * 0.22)));
  const maxMs = Math.max(minMs + 4000, Math.floor(nightRemaining * 0.88));
  const delayMs = minMs + Math.floor(Math.random() * (maxMs - minMs + 1));

  // #region agent log
  agentLog({
    hypothesisId: 'CultBellDelay',
    location: 'server.js:scheduleCultBellMotions',
    message: 'cult bell scheduled',
    data: {
      leader: leader.nickname,
      target: target.nickname,
      delayMs,
      nightRemaining
    }
  });
  // #endregion

  scheduleRoomTask(room, () => {
    if (g._cultBellFired) return;
    if (room.phase !== PHASE.NIGHT || !g.nightActions?.cultProselytizedSuccess) {
      flushPendingCultBell(room);
      return;
    }
    const l = getPlayerById(room, g._cultBellPending?.leaderId);
    const t = getPlayerById(room, g._cultBellPending?.targetId);
    if (l && t) broadcastCultBellMotions(room, l, t);
    else g._cultBellPending = null;
  }, delayMs);
}

function broadcastCultBellMotions(room, leader, target) {
  const g = room.game;
  if (!g) return;
  g._cultBellFired = true;
  g._cultBellPending = null;
  g.pendingAnnouncements = g.pendingAnnouncements || [];
  g.pendingAnnouncements.push('교주의 종소리가 울려퍼졌습니다.');
  const bellMotion = {
    type: 'cult_proselytize',
    title: '종소리',
    message: '교주의 종소리가 울려퍼졌습니다.',
    situation: '[상황] 교주가 포교에 성공한 경우',
    duration: 4200
  };
  emitMotionToUser(leader.userID, {
    ...bellMotion,
    title: '포교 성공',
    message: `${target.nickname}님을 포교하였습니다. 종소리가 울립니다.`
  });
  if (target.userID) {
    emitMotionToUser(target.userID, {
      type: 'cult_proselytize',
      title: '포교',
      message: '교주에게 포교당했습니다. 이제 신도입니다.',
      situation: '[상황] 교주에게 포교당한 경우',
      duration: 4200
    });
  }
  broadcastToRoom(room, 'gameMotion', bellMotion, (p) => {
    if (p.userID === leader.userID || p.userID === target.userID) return false;
    return true;
  });
  broadcastToRoom(room, 'skillNotice', {
    scope: 'public',
    kind: 'cult',
    title: '종소리',
    message: '교주의 종소리가 울려퍼졌습니다.'
  });
  broadcastToRoom(room, 'animation', { className: 'anim-cult-proselytize', silent: false });
}

function applyCultProselytizeAttempt(room, leader, targetId) {
  const g = room.game;
  const na = g.nightActions;
  if (!na) return { ok: false, message: '게임 상태 오류' };
  if (na.cultProselytizedSuccess) {
    return { ok: false, message: '이번 밤에는 이미 포교에 성공했습니다.' };
  }
  if (!m42Cult.canProselytizeTonight(room, leader)) {
    return { ok: false, message: '이번 밤에는 포교할 수 없습니다. (홀수 밤만 가능)' };
  }

  const target = getPlayerById(room, targetId);
  const valid = m42Cult.isValidProselytizeTarget(room, leader, target, {
    isMafiaTeam,
    isMafiaRole
  });
  if (!valid.ok) {
    if (valid.failType === 'mafia') {
      na.cultTarget = null;
      na.cultFailed = true;
      na.cultFailedTargetId = targetId;
      // #region agent log
      agentLog({
        hypothesisId: 'CultFail',
        location: 'server.js:applyCultProselytizeAttempt',
        message: 'proselytize mafia fail retry allowed',
        data: { leader: leader.nickname, target: playerName(room, targetId) }
      });
      // #endregion
    }
    return { ok: false, message: valid.message, failType: valid.failType };
  }

  target.joinedCult = true;
  if (!g.cultProselytizedIds) g.cultProselytizedIds = [];
  if (!g.cultProselytizedIds.includes(target.id)) g.cultProselytizedIds.push(target.id);

  na.cultTarget = targetId;
  rememberNightActor(room, leader.id, 'cult', targetId);
  na.cultProselytizedSuccess = true;
  na.cultResolved = true;
  na.cultFailed = false;
  na.cultFailedTargetId = null;

  const roleLabel = ROLE_LABELS[target.role] || target.role;
  scheduleCultBellMotions(room, leader, target);
  emitSkillNotice(leader.userID, {
    scope: 'private',
    kind: 'cult',
    title: '포교 성공',
    message: `${target.nickname}님을 포교했습니다. 종소리는 밤 중 잠시 후 울립니다. (직업: ${roleLabel})`
  });
  emitCultTeamInfo(room, target);
  emitCultTeamInfo(room, leader);
  console.log(`[NIGHT][CULT] proselytize OK ${target.nickname} (${roleLabel})`);
  // #region agent log
  agentLog({
    hypothesisId: 'CultOk',
    location: 'server.js:applyCultProselytizeAttempt',
    message: 'proselytize success bell motion',
    data: { leader: leader.nickname, target: target.nickname, nightIndex: g.nightIndex }
  });
  // #endregion
  return { ok: true, target, roleLabel };
}

function resolveCultProselytize(room) {
  const g = room.game;
  const na = g?.nightActions;
  if (!na || na.cultProselytizedSuccess) return;

  const leader = Object.values(room.players).find(
    (p) => p.role === ROLE.CULT_LEADER && p.alive
  );
  if (!leader || !m42Cult.isOddProselytizeNight(room)) return;

  const targetId = na.cultTarget;
  if (!targetId) return;
  applyCultProselytizeAttempt(room, leader, targetId);
}

function recordCultProselytize(room, socket, targetId) {
  if (!room || !room.game) return reject(socket, '방을 찾을 수 없습니다.');
  const player = getViewer(room, socket);
  if (!player || !player.alive || player.role !== ROLE.CULT_LEADER) {
    return reject(socket, '교주만 포교할 수 있습니다.');
  }
  if (room.phase !== PHASE.NIGHT) return reject(socket, '밤에만 가능합니다.');

  const result = applyCultProselytizeAttempt(room, player, targetId);
  if (!result.ok) {
    if (result.failType === 'mafia') {
      emitSkillNotice(player.userID, {
        scope: 'private',
        kind: 'cult',
        title: '포교 실패',
        message: `${playerName(room, targetId)}님은 마피아입니다. 다른 대상을 선택해 다시 시도하세요.`
      });
    }
    return reject(socket, result.message);
  }

  socket.emit('privateInfo', {
    type: 'actionConfirm',
    action: 'cult',
    targetId,
    targetName: playerName(room, targetId),
    message: `${playerName(room, targetId)}님 포교 성공 · 종소리가 울렸습니다.`
  });
  broadcastState(room);
}

function resolveNight(room) {
  const g = room.game;
  const deaths = [];
  room.pendingMotions = room.pendingMotions || [];
  ensureMafiaKillBeforeResolve(room);

  // 1) Doctor heal target
  let healedId = null;
  let doctor = null;
  const doctorAction = g.nightActions.doctorTarget;
  if (doctorAction) {
    doctor = Object.values(room.players).find(p => p.role === ROLE.DOCTOR && p.alive);
    if (doctor) {
      healedId = doctorAction;
      console.log(`[NIGHT][2-Heal] doctor ${doctor.nickname} -> ${playerName(room, healedId)}`);
    }
  } else {
    console.log('[NIGHT][2-Heal] no doctor action');
  }

  // 3) Mafia kill
  const killTarget = getMafiaKillTarget(room);
  let killedId = null;
  let healBlockedKill = false;
  let soldierBlockedKill = false;
  if (killTarget) {
    const target = getPlayerById(room, killTarget);
    if (target && target.alive) {
      if (healedId === killTarget) {
        healBlockedKill = true;
        console.log(`[NIGHT][3-Kill] mafia target=${playerName(room, killTarget)} -> SURVIVED (heal)`);
        queueDawnMotion(room, {
          type: 'doctor_heal',
          title: '의사 치료',
          message: `${playerName(room, killTarget)}님이 의사의 치료를 받고 살아났습니다!`,
          situation: '[상황] 마피아의 공격을 막아낸 경우'
        });
      } else if (target.role === ROLE.SOLDIER && !target.soldierShieldUsed) {
        target.soldierShieldUsed = true;
        soldierBlockedKill = true;
        console.log(`[NIGHT][3-Kill] mafia target=${playerName(room, killTarget)} -> SURVIVED (soldier shield)`);
        queueDawnMotion(room, {
          type: 'soldier_block',
          title: '군인 방탄',
          message: `군인 ${playerName(room, killTarget)}님이 공격을 버텨냈습니다.`,
          situation: '[상태] 방탄: 마피아의 공격을 버텨낸 경우'
        });
      } else {
        markPlayerDead(room, target);
        killedId = killTarget;
        deaths.push(killTarget);
        if (g.nightIndex === 1 && !g.firstNightDeathId) g.firstNightDeathId = killTarget;
        console.log(`[NIGHT][3-Kill] mafia target=${playerName(room, killTarget)} -> DEAD`);
        queueDawnMotion(room, {
          type: 'mafia_kill',
          title: '살해',
          message: `${playerName(room, killTarget)}님이 살해당하였습니다.`,
          situation: '[상황] 마피아가 지목한 대상이 사망한 경우'
        });
        broadcastAnimation(room, 'anim-mafia-kill');
      }
    }
  } else {
    console.log('[NIGHT][3-Kill] no mafia consensus target');
  }

  if (healedId && doctor) {
    const sess = sessions.get(doctor.userID);
    if (sess && sess.socketId) {
      io.to(sess.socketId).emit('privateInfo', {
        type: 'heal',
        targetId: healedId,
        targetName: playerName(room, healedId),
        saved: healBlockedKill
      });
    }
    emitSkillNotice(doctor.userID, {
      scope: 'private',
      kind: 'doctor',
      title: healBlockedKill ? '치료 성공' : '치료 완료',
      message: healBlockedKill
        ? `${playerName(room, healedId)}님을 치료해 공격을 막았습니다!`
        : `${playerName(room, healedId)}님에게 치료했습니다.`
    });
    if (healBlockedKill) broadcastAnimation(room, 'anim-doctor-heal');
  }

  // 4) Investigations
  const spyTarget = g.nightActions.spyTarget;
  if (spyTarget) {
    const spy = Object.values(room.players).find(p => p.role === ROLE.SPY && p.alive);
    const target = getPlayerById(room, spyTarget);
    if (spy && target && !g.nightActions.spyResolved) {
      deliverSpyResult(room, spy, spyTarget);
    }
  }

  const policeTarget = g.nightActions.policeTarget;
  if (policeTarget) {
    const police = getPlayerById(room, g.nightActions.policeActorId)
      || Object.values(room.players).find((p) => p.role === ROLE.POLICE && p.alive);
    if (police && !g.nightActions.policeResolved) {
      deliverPoliceResult(room, police, policeTarget);
    }
  }

  const reporterTarget = g.nightActions.reporterTarget;
  if (reporterTarget && g.nightIndex >= 2) {
    const reporter = Object.values(room.players).find(p => p.role === ROLE.REPORTER && p.alive);
    if (reporter && !reporter.reporterUsed) {
      deliverReporterScoop(room, reporter, reporterTarget);
    }
  }

  const mediumTarget = g.nightActions.mediumTarget;
  if (mediumTarget) {
    const medium = Object.values(room.players).find(p => p.role === ROLE.MEDIUM && p.alive);
    if (medium && !g.nightActions.mediumResolved && canMediumPurifyTarget(room, medium, mediumTarget)) {
      deliverMediumResult(room, medium, mediumTarget);
    }
  }

  resolveCultProselytize(room);

  // Soldier investigated by spy - handled in spy block via role reveal

  // 5) Graverobber inheritance
  if (g.nightIndex === 1 && g.firstNightDeathId && !g.graverobberInherited) {
    const graverobber = Object.values(room.players).find(p => p.role === ROLE.GRAVEROBBER && p.alive);
    const victim = getPlayerById(room, g.firstNightDeathId);
    if (graverobber && victim) {
      const oldRole = graverobber.role;
      graverobber.role = victim.role;
      if (victim.role === ROLE.MAFIA) graverobber.joinedMafiaChat = true;
      else if (victim.role === ROLE.SPY) {
        graverobber.joinedMafiaChat = !!victim.joinedMafiaChat;
        graverobber.spyRevealedToMafia = !!victim.spyRevealedToMafia;
      } else {
        graverobber.joinedMafiaChat = false;
        graverobber.spyRevealedToMafia = false;
      }
      if (victim.role === ROLE.REPORTER) {
        graverobber.reporterUsed = false;
        graverobber._inheritedReporterFrom = victim.nickname;
      } else {
        delete graverobber._inheritedReporterFrom;
      }
      g.graverobberInherited = true;
      // #region agent log
      agentLog({
        hypothesisId: 'R5',
        location: 'server.js:resolveNight:graverobber',
        message: 'graverobber inherit role',
        runId: 'reporter-fix',
        data: {
          graverobber: graverobber.nickname,
          victim: victim.nickname,
          newRole: victim.role,
          reporterUsed: graverobber.reporterUsed,
          nightIndex: g.nightIndex
        }
      });
      // #endregion
      console.log(`[NIGHT][5-Graverobber] ${graverobber.nickname} inherits ${ROLE_LABELS[victim.role]} from ${victim.nickname} (was ${ROLE_LABELS[oldRole]})`);
      emitMotionToUser(graverobber.userID, {
        type: 'graverobber_inherit',
        title: '도굴꾼 계승',
        message: `${victim.nickname}의 직업 [${ROLE_LABELS[victim.role]}]을(를) 계승했습니다.`,
        situation: '[상황] 첫 번째 밤 첫 사망자의 직업을 계승한 경우'
      });
      const sess = sessions.get(graverobber.userID);
      if (sess && sess.socketId) {
        io.to(sess.socketId).emit('privateInfo', {
          type: 'inherit', role: victim.role, roleLabel: ROLE_LABELS[victim.role],
          fromName: victim.nickname
        });
      }
      if (viewerOnMafiaSide(graverobber)) emitMafiaTeamInfo(room, graverobber);
      broadcastState(room);
    }
  }

  if (deaths.length > 0) {
    const names = deaths.map(id => playerName(room, id)).join(', ');
    g.dawnAnnouncements.push(`밤 사이에 ${names}님이 사망했습니다.`);
  } else if (g.dawnAnnouncements.length === 0) {
    g.dawnAnnouncements.push('밤 사이에 사망자는 없었습니다.');
  }

  if (deaths.length === 0 && !healBlockedKill && !soldierBlockedKill) {
    queueDawnMotion(room, {
      type: 'quiet_night',
      title: '조용한 밤',
      message: '조용하게 밤이 넘어갔습니다.',
      situation: '[상황] 밤에 아무 일도 일어나지 않았을 경우'
    });
  }

  const privateDetectiveSummary = buildPrivateDetectiveNightSummary(room);
  emitPrivateDetectiveDawnResults(room, privateDetectiveSummary);

  g._nightSummary = {
    deaths: [...deaths],
    healBlockedKill,
    soldierBlockedKill,
    soldierBlockTargetId: soldierBlockedKill ? killTarget : null,
    reporterReveal: room.pendingReporterRevealData
      ? { ...room.pendingReporterRevealData }
      : null,
    botActs: collectBotNightActs(room, g),
    privateDetective: privateDetectiveSummary
  };

  g.pendingAnnouncements = [];

  const win = checkWin(room);
  if (win) {
    endGame(room, win);
    return;
  }

  flushPendingCultBell(room);
  startDawn(room);
}

function buildDayVoteResults(room) {
  const votes = room.game.dayVotes;
  const tally = buildDayVoteTally(room);
  const voterMap = {};
  for (const [voterId, targetId] of Object.entries(votes)) {
    if (!targetId) continue;
    if (!voterMap[targetId]) voterMap[targetId] = [];
    voterMap[targetId].push(voterId);
  }

  let max = 0;
  let topCandidates = [];
  for (const [id, count] of Object.entries(tally)) {
    if (count > max) { max = count; topCandidates = [id]; }
    else if (count === max) topCandidates.push(id);
  }

  const rows = getAlivePlayers(room).map((p) => ({
    playerId: p.id,
    nickname: p.nickname,
    votes: tally[p.id] || 0,
    voterIds: voterMap[p.id] || [],
    voterNames: (voterMap[p.id] || []).map((vid) => playerName(room, vid)).filter(Boolean)
  })).sort((a, b) => b.votes - a.votes);

  return {
    rows,
    maxVotes: max,
    topCandidateId: topCandidates.length === 1 ? topCandidates[0] : null,
    tie: topCandidates.length > 1,
    noVotes: max === 0
  };
}

function proceedDayVoteAfterResults(room, results) {
  if (!isActiveGame(room)) return;
  if (room.phase !== PHASE.DAY_VOTE) return;

  const topCandidates = results.topCandidateId
    ? [results.topCandidateId]
    : (results.tie
      ? results.rows.filter((r) => r.votes === results.maxVotes && r.votes > 0).map((r) => r.playerId)
      : []);

  room.game.dayTopVotedId = topCandidates.length === 1 ? topCandidates[0] : null;

  // #region agent log
  agentLog({
    hypothesisId: 'V3',
    location: 'server.js:proceedDayVoteAfterResults',
    message: 'day vote outcome',
    runId: 'vote-fix',
    data: {
      tie: results.tie,
      noVotes: results.noVotes,
      maxVotes: results.maxVotes,
      topCount: topCandidates.length,
      top: topCandidates.map((id) => playerName(room, id))
    }
  });
  // #endregion

  if (topCandidates.length !== 1) {
    console.log(`[DAY VOTE] tie or no votes - skipping execution (candidates=${topCandidates.length})`);
    room.game.pendingAnnouncements = [
      results.tie
        ? '낮 투표가 동점이어서 처형 후보가 없습니다.'
        : '낮 투표가 없어 처형 후보가 없습니다.'
    ];
    emitMotion(room, {
      type: 'vote_tie',
      title: '낮 투표 무효',
      message: results.tie
        ? '최다 득표가 동점입니다. 처형 후보가 없습니다.'
        : '투표가 없습니다. 처형 후보가 없습니다.',
      situation: '[상황] 낮 투표에서 최다 득표자가 없거나 동점인 경우'
    });
    broadcastState(room);
    startNight(room);
    return;
  }

  const candidateId = topCandidates[0];
  console.log(`[DAY VOTE] top voted: ${playerName(room, candidateId)} (${results.maxVotes} votes) -> last words`);
  startLastWords(room, candidateId);
}

function resolveDayVote(room) {
  if (!isActiveGame(room)) return;
  runBotDayVotes(room);
  if (room.resolvingDayVote) {
    if (room._dayVoteResultsTimer) return;
    const stuckMs = room._dayVoteResolveAt ? Date.now() - room._dayVoteResolveAt : 0;
    if (stuckMs < VOTE_RESULTS_DISPLAY_MS + 4000) return;
    console.warn(`[ROOM ${room.code}] forcing day vote resolve`);
    finishDayVoteResolve(room);
    return;
  }

  room.resolvingDayVote = true;
  room._dayVoteResolveAt = Date.now();
  const results = buildDayVoteResults(room);
  room._voteResultsPayload = results;
  broadcastToRoom(room, 'dayVoteResults', results);

  clearDayVoteResultsTimer(room);
  room._dayVoteResultsTimer = setTimeout(() => finishDayVoteResolve(room), VOTE_RESULTS_DISPLAY_MS);
  scheduleDayVoteResolveWatchdog(room);
}

function resolveExecutionVote(room) {
  const candidateId = room.game.executionCandidateId;
  const candidate = getPlayerById(room, candidateId);
  if (!candidate) {
    startNight(room);
    return;
  }

  if (candidate.role === ROLE.POLITICIAN && candidate.alive) {
    console.log(`[EXECUTION] ${candidate.nickname} is politician - execution VOID`);
    room.game.pendingAnnouncements = [`${candidate.nickname}(정치인)은 처형이 무효화되었습니다.`];
    emitMotion(room, {
      type: 'politician_immunity',
      title: '정치인',
      message: '정치인은 투표로 죽지 않습니다.',
      situation: `[상황] ${candidate.nickname} 님의 처형이 부결되었습니다.`
    });
    broadcastState(room);
    startNight(room);
    return;
  }

  const votes = room.game.executionVotes;
  let yes = 0;
  let no = 0;
  const voters = getAlivePlayers(room).filter(p => p.id !== candidateId);

  for (const p of voters) {
    const v = votes[p.id];
    if (v === 'yes') yes++;
    else no++;
  }

  const executed = yes > no && yes > 0;

  console.log(`[EXECUTION] candidate=${candidate.nickname} yes=${yes} no=${no} (미투표=반대) -> ${executed ? 'EXECUTED' : 'SPARED'}`);
  // #region agent log
  agentLog({
    hypothesisId: 'V4',
    location: 'server.js:resolveExecutionVote',
    message: 'execution vote result',
    runId: 'vote-fix',
    data: {
      candidate: candidate.nickname,
      role: candidate.role,
      yes,
      no,
      voters: voters.length,
      executed
    }
  });
  // #endregion

  if (executed) {
    markPlayerDead(room, candidate);
    room.game.pendingAnnouncements = [`${candidate.nickname}님이 찬반 투표로 처형되었습니다.`];
    emitMotion(room, {
      type: 'vote_execution',
      title: '투표 처형',
      message: `${candidate.nickname}님이 찬반 투표로 처형되었습니다.`,
      situation: '[상황] 찬성이 반대보다 많아 처형이 확정된 경우'
    });
    broadcastAnimation(room, 'anim-mafia-kill');
  } else {
    room.game.pendingAnnouncements = [`${candidate.nickname}님의 찬반 처형이 부결되었습니다.`];
    emitMotion(room, {
      type: 'vote_rejected',
      title: '찬반 부결',
      message: `${candidate.nickname}님의 처형이 부결되었습니다. (찬성 ${yes} · 반대 ${no})`,
      situation: '[상황] 찬성이 반대보다 많지 않아 처형되지 않은 경우'
    });
  }

  const win = checkWin(room);
  if (win) {
    endGame(room, win);
    return;
  }

  startNight(room);
}

// ─── session manager ──────────────────────────────────────────────────────────

const RECONNECT_GRACE_MS = 12000;

function attachSession(socket, userID, nickname) {
  const existing = sessions.get(userID);
  const now = Date.now();

  if (existing && existing.socketId && existing.socketId !== socket.id) {
    const oldSocket = io.sockets.sockets.get(existing.socketId);
    const isReconnectFlap = existing.lastDisconnectAt
      && (now - existing.lastDisconnectAt) < RECONNECT_GRACE_MS;

    if (oldSocket && oldSocket.connected) {
      if (isReconnectFlap) {
        console.log(`[SESSION] replace socket userID=${userID} (reconnect flap)`);
        oldSocket.disconnect(true);
      } else {
        io.to(existing.socketId).emit('sessionTaken', {
          message: '다른 탭/기기에서 접속하여 연결이 종료됩니다.'
        });
        oldSocket.disconnect(true);
      }
    }
  }

  sessions.set(userID, {
    userID,
    nickname,
    socketId: socket.id,
    roomCode: existing ? existing.roomCode : null,
    playerId: existing ? existing.playerId : null,
    lastDisconnectAt: existing ? existing.lastDisconnectAt : null
  });
  socket.userID = userID;
  socket.nickname = nickname;
}

function tryResumeSession(socket) {
  const sess = sessions.get(socket.userID);
  if (!sess || !sess.roomCode) return false;

  if (!rooms.has(sess.roomCode)) {
    console.log(`[SESSION] room ${sess.roomCode} gone — clear session userID=${socket.userID}`);
    emitRoomLost(socket, { silent: true });
    return true;
  }

  const room = rooms.get(sess.roomCode);
  let player = (sess.playerId && room.players[sess.playerId])
    || getPlayerByUserId(room, socket.userID);

  if (!player && room.phase === PHASE.LOBBY) {
    const playerId = randomUUID();
    room.players[playerId] = {
      id: playerId,
      userID: socket.userID,
      nickname: socket.nickname || sess.nickname || '플레이어',
      role: null,
      alive: true,
      connected: true,
      soldierShieldUsed: false,
      reporterUsed: false,
      joinedMafiaChat: false,
      joinedCult: false,
      disconnectTimer: null,
      isBot: false,
      timeShortened: false,
      timeIncreased: false
    };
    player = room.players[playerId];
    sess.playerId = playerId;
    pushLobbySystemMessage(room, `${player.nickname}님이 다시 입장했습니다.`);
    console.log(`[SESSION] userID=${socket.userID} re-admitted to lobby ${room.code}`);
  }

  if (!player) {
    sess.roomCode = null;
    sess.playerId = null;
    return false;
  }

  reconnectPlayer(socket, room, player);
  return true;
}

function cleanupPlayerGameState(room, playerId) {
  const g = room.game;
  if (!g) return;
  delete g.dayVotes[playerId];
  delete g.executionVotes[playerId];
  if (g.executionCandidateId === playerId) g.executionCandidateId = null;
  const na = g.nightActions;
  if (!na) return;
  delete na.mafiaVotes[playerId];
  if (na.spyTarget === playerId) na.spyTarget = null;
  if (na.policeTarget === playerId) na.policeTarget = null;
  if (na.doctorTarget === playerId) na.doctorTarget = null;
  if (na.reporterTarget === playerId) na.reporterTarget = null;
  if (na.mediumTarget === playerId) na.mediumTarget = null;
  if (na.privateDetectiveWatchId === playerId) na.privateDetectiveWatchId = null;
  if (na.actorNightTarget && na.actorNightTarget[playerId]) delete na.actorNightTarget[playerId];
}

function removePlayerFromRoom(room, userID, { announce = false } = {}) {
  const player = getPlayerByUserId(room, userID);
  if (!player) return { ok: false, message: '플레이어를 찾을 수 없습니다.' };

  if (player.disconnectTimer) {
    clearTimeout(player.disconnectTimer);
    player.disconnectTimer = null;
  }

  const nickname = player.nickname;
  const wasInGame = room.phase !== PHASE.LOBBY && room.phase !== PHASE.GAME_OVER;
  if (wasInGame) cleanupPlayerGameState(room, player.id);

  delete room.players[player.id];

  if (room.hostUserId === userID) {
    const remaining = Object.values(room.players);
    room.hostUserId = remaining.length > 0 ? remaining[0].userID : null;
  }

  const playerCount = Object.keys(room.players).length;
  if (playerCount === 0) {
    rooms.delete(room.code);
  } else {
    if (announce) {
      if (room.phase === PHASE.LOBBY) {
        pushLobbySystemMessage(room, `${nickname}님이 나갔습니다.`);
      } else if (room.phase !== PHASE.GAME_OVER) {
        pushGameSystemMessage(room, `${nickname}님이 방을 나갔습니다.`);
      }
    }
    if (wasInGame) {
      const win = checkWin(room);
      if (win) endGame(room, win);
      else broadcastState(room);
    } else if (announce) {
      broadcastState(room);
    }
  }

  return { ok: true, nickname, empty: playerCount === 0, wasInGame };
}

function leaveRoomBySocket(socket) {
  const sess = sessions.get(socket.userID);
  if (!sess || !sess.roomCode) {
    socket.emit('stateSync', { phase: 'none', serverInfo: getServerInfoFromSocket(socket) });
    return;
  }

  const room = rooms.get(sess.roomCode);
  if (!room) {
    sess.roomCode = null;
    sess.playerId = null;
    socket.emit('stateSync', { phase: 'none', serverInfo: getServerInfoFromSocket(socket) });
    return;
  }

  const roomCode = room.code;
  removePlayerFromRoom(room, socket.userID, { announce: true });
  socket.leave(roomCode);
  sess.roomCode = null;
  sess.playerId = null;
  socket.emit('stateSync', { phase: 'none', serverInfo: getServerInfoFromSocket(socket) });
}

function handleDisconnect(socket) {
  const userID = socket.userID;
  if (!userID) return;

  const sess = sessions.get(userID);
  if (!sess || sess.socketId !== socket.id) {
    console.log(`[SESSION] ignore stale disconnect userID=${userID} socket=${socket.id}`);
    return;
  }

  sess.socketId = null;
  sess.lastDisconnectAt = Date.now();

  const roomCode = sess.roomCode;
  if (!roomCode || !rooms.has(roomCode)) return;

  const room = rooms.get(roomCode);
  const player = getPlayerByUserId(room, userID);
  if (!player) return;

  player.connected = false;

  if (player.disconnectTimer) clearTimeout(player.disconnectTimer);

  player.disconnectTimer = setTimeout(() => {
    const latest = sessions.get(userID);
    if (latest && latest.socketId) return;

    console.log(`[SESSION] userID=${userID} offline, slot kept (phase=${room.phase})`);
    broadcastState(room);
  }, GRACE_PERIOD_MS);

  console.log(`[SESSION] userID=${userID} disconnected, grace period started`);
}

function reconnectPlayer(socket, room, player) {
  if (player.disconnectTimer) {
    clearTimeout(player.disconnectTimer);
    player.disconnectTimer = null;
  }
  player.connected = true;
  if (socket.nickname) player.nickname = socket.nickname;
  const sess = sessions.get(socket.userID);
  if (sess) {
    sess.socketId = socket.id;
    sess.roomCode = room.code;
    sess.playerId = player.id;
  }
  socket.join(room.code);
  if (player.role) {
    socket.emit('privateInfo', { type: 'role', role: player.role, roleLabel: ROLE_LABELS[player.role] });
    if (viewerOnMafiaSide(player)) emitMafiaTeamInfo(room, player);
    else if (isCultMember(player)) emitCultTeamInfo(room, player);
  }
  socket.emit('stateSync', toClientState(room, socket.userID, { includeChat: true }));
  socket.emit('joinResult', { ok: true, resumed: true });
  console.log(`[SESSION] userID=${socket.userID} reconnected to room ${room.code}`);
}

// ─── action validators ─────────────────────────────────────────────────────────

function getViewer(room, socket) {
  if (!room || !socket) return null;
  return getPlayerByUserId(room, socket.userID);
}

function reject(socket, msg, opts = {}) {
  socket.emit('error', { message: msg, silent: !!opts.silent, code: opts.code || null });
}

function emitRoomLost(socket, { silent = true } = {}) {
  const sess = socket.userID ? sessions.get(socket.userID) : null;
  if (sess) {
    sess.roomCode = null;
    sess.playerId = null;
  }
  socket.emit('joinResult', { ok: false, reason: 'room_expired', silent });
  socket.emit('stateSync', {
    phase: 'none',
    roomExpired: true,
    serverInfo: getServerInfoFromSocket(socket)
  });
}

function recordPrivateDetectiveObserve(room, socket, targetId) {
  if (!room || !room.game) return reject(socket, '방을 찾을 수 없습니다.');
  const player = getViewer(room, socket);
  if (!player || !player.alive || player.role !== ROLE.PRIVATE_DETECTIVE) {
    return reject(socket, '사립탐정만 관찰 대상을 지정할 수 있습니다.');
  }
  if (room.phase !== PHASE.NIGHT) return reject(socket, '밤에만 가능합니다.');
  if (room.game.nightActions.privateDetectiveWatchId) {
    const lockedId = room.game.nightActions.privateDetectiveWatchId;
    const lockedName = playerName(room, lockedId);
    agentLog({
      hypothesisId: 'private-detective-lock',
      location: 'server.js:recordPrivateDetectiveObserve',
      message: 'private detective retarget blocked',
      data: {
        player: player.nickname,
        lockedId,
        attemptedTargetId: targetId
      }
    });
    socket.emit('privateInfo', {
      type: 'actionConfirm',
      action: 'private_detective',
      targetId: lockedId,
      targetName: lockedName,
      message: `이번 밤 관찰 대상은 ${lockedName}님으로 이미 확정되어 변경할 수 없습니다.`
    });
    return reject(socket, `이번 밤 관찰 대상은 ${lockedName}님으로 이미 확정되었습니다.`);
  }
  const valid = validateNightTarget(room, player, targetId);
  if (!valid.ok) return reject(socket, valid.message);
  room.game.nightActions.privateDetectiveWatchId = targetId;
  emitSkillNotice(player.userID, {
    scope: 'private',
    kind: 'private_detective',
    title: '관찰 대상 지정',
    message: `${playerName(room, targetId)}님의 밤 행동을 주시합니다. 새벽에 결과가 전달됩니다.`
  });
  socket.emit('privateInfo', {
    type: 'actionConfirm',
    action: 'private_detective',
    targetId,
    targetName: playerName(room, targetId),
    message: `${playerName(room, targetId)}님을 관찰합니다.`
  });
  broadcastState(room);
}

function recordMafiaVote(room, socket, targetId) {
  if (!room || !room.game) return reject(socket, '방을 찾을 수 없습니다.');
  const player = getViewer(room, socket);
  if (!player || !player.alive || player.role !== ROLE.MAFIA) return reject(socket, '마피아만 투표할 수 있습니다.');
  if (room.phase !== PHASE.NIGHT) return reject(socket, '밤에만 가능합니다.');
  const valid = validateNightTarget(room, player, targetId);
  if (!valid.ok) return reject(socket, valid.message);
  room.game.nightActions.mafiaVotes[player.id] = targetId;
  rememberNightActor(room, player.id, 'mafia_kill', targetId);
  syncMafiaKillVotes(room);
  emitSkillNotice(player.userID, {
    scope: 'private',
    kind: 'mafia',
    title: '암살 투표',
    message: `${playerName(room, targetId)}님을 지목했습니다.`
  });
  socket.emit('privateInfo', {
    type: 'actionConfirm',
    action: 'mafia',
    targetId,
    targetName: playerName(room, targetId),
    message: `${playerName(room, targetId)}님에게 암살 투표했습니다. 밤이 끝나면 처리됩니다.`
  });
  broadcastState(room);
}

function recordSpyInvestigate(room, socket, targetId) {
  if (!room || !room.game) return reject(socket, '방을 찾을 수 없습니다.');
  const player = getViewer(room, socket);
  if (!player || !player.alive || player.role !== ROLE.SPY) return reject(socket, '스파이만 조사할 수 있습니다.');
  if (room.phase !== PHASE.NIGHT) return reject(socket, '밤에만 가능합니다.');
  if (room.game.nightActions.spyResolved) return reject(socket, '이번 밤에는 이미 조사했습니다.');
  const valid = validateNightTarget(room, player, targetId);
  if (!valid.ok) return reject(socket, valid.message);
  room.game.nightActions.spyTarget = targetId;
  rememberNightActor(room, player.id, 'spy', targetId);
  deliverSpyResult(room, player, targetId);
  if (!room.game.nightActions.spyResolved) {
    return reject(socket, '조사에 실패했습니다. 대상을 다시 선택해 주세요.');
  }
}

function recordPoliceInvestigate(room, socket, targetId) {
  if (!room || !room.game) return reject(socket, '방을 찾을 수 없습니다.');
  const player = getViewer(room, socket);
  if (!player || !player.alive || player.role !== ROLE.POLICE) return reject(socket, '경찰만 조사할 수 있습니다.');
  if (room.phase !== PHASE.NIGHT) return reject(socket, '밤에만 가능합니다.');
  if (room.game.nightActions.policeResolved) return reject(socket, '이번 밤에는 이미 조사했습니다.');
  const valid = validateNightTarget(room, player, targetId);
  if (!valid.ok) return reject(socket, valid.message);
  room.game.nightActions.policeTarget = targetId;
  room.game.nightActions.policeActorId = player.id;
  rememberNightActor(room, player.id, 'police', targetId);
  deliverPoliceResult(room, player, targetId);
  if (!room.game.nightActions.policeResolved) {
    return reject(socket, '조사에 실패했습니다. 대상을 다시 선택해 주세요.');
  }
  socket.emit('privateInfo', {
    type: 'actionConfirm',
    action: 'police',
    targetId,
    targetName: playerName(room, targetId)
  });
  console.log(`[POLICE] ${player.nickname} investigated ${playerName(room, targetId)} night=${room.game.nightIndex}`);
  broadcastState(room);
}

function recordDoctorHeal(room, socket, targetId) {
  if (!room || !room.game) return reject(socket, '방을 찾을 수 없습니다.');
  const player = getViewer(room, socket);
  if (!player || !player.alive || player.role !== ROLE.DOCTOR) return reject(socket, '의사만 치료할 수 있습니다.');
  if (room.phase !== PHASE.NIGHT) return reject(socket, '밤에만 가능합니다.');
  let forcedMatchedHeal = false;
  if ((room.game.nightIndex || 0) <= 1) {
    const attemptedTargetId = targetId;
    const claimants = m42Bluff.scanPoliceReporters(room, voteFactHelpers)
      .map((r) => getPlayerById(room, r.id))
      .filter((p) => p && p.alive && p.id !== player.id);
    if (claimants.length >= 2) {
      const forced = claimants[Math.floor(Math.random() * Math.min(2, claimants.length))];
      targetId = forced.id;
      forcedMatchedHeal = true;
      agentLog({
        hypothesisId: 'doctor-night1-matched-heal',
        location: 'server.js:recordDoctorHeal',
        message: 'override doctor target to matched claimant on first night',
        data: { doctor: player.nickname, attemptedTargetId, forcedTargetId: targetId }
      });
    }
  }
  if ((room.game.nightIndex || 0) <= 1 && !forcedMatchedHeal) {
    if (targetId !== player.id) {
      agentLog({
        hypothesisId: 'doctor-night1-self-heal',
        location: 'server.js:recordDoctorHeal',
        message: 'override doctor target to self on first night',
        data: { doctor: player.nickname, attemptedTargetId: targetId, forcedTargetId: player.id }
      });
    }
    targetId = player.id;
  }
  const valid = validateNightTarget(room, player, targetId, { allowSelf: true });
  if (!valid.ok) return reject(socket, valid.message);
  room.game.nightActions.doctorTarget = targetId;
  rememberNightActor(room, player.id, 'doctor', targetId);
  emitSkillNotice(player.userID, {
    scope: 'private',
    kind: 'doctor',
    title: '치료 대상 지정',
    message: `${playerName(room, targetId)}님에게 치료를 준비했습니다.`
  });
  socket.emit('privateInfo', { type: 'actionConfirm', action: 'doctor', targetId, targetName: playerName(room, targetId) });
}

function recordReporterScoop(room, socket, targetId) {
  if (!room || !room.game) return reject(socket, '방을 찾을 수 없습니다.');
  const player = getViewer(room, socket);
  if (!player || !player.alive || player.role !== ROLE.REPORTER) return reject(socket, '기자만 취재할 수 있습니다.');
  if (player.reporterUsed) return reject(socket, '이미 취재를 사용했습니다.');
  if (room.phase !== PHASE.NIGHT) return reject(socket, '밤에만 가능합니다.');
  if (room.game.nightIndex < 2) return reject(socket, '기자 취재는 2번째 밤부터 가능합니다.');
  const valid = validateNightTarget(room, player, targetId);
  if (!valid.ok) return reject(socket, valid.message);
  room.game.nightActions.reporterTarget = targetId;
  rememberNightActor(room, player.id, 'reporter', targetId);
  deliverReporterScoop(room, player, targetId);
}

function recordMediumPurify(room, socket, targetId) {
  if (!room || !room.game) return reject(socket, '방을 찾을 수 없습니다.');
  const player = getViewer(room, socket);
  if (!player || !player.alive || player.role !== ROLE.MEDIUM) return reject(socket, '영매만 성불할 수 있습니다.');
  if (room.phase !== PHASE.NIGHT) return reject(socket, '밤에만 가능합니다.');
  if (room.game.nightActions.mediumResolved) return reject(socket, '이번 밤에는 이미 성불했습니다.');
  const eligible = mediumPurify.listEligibleDead(room);
  if (!eligible.length) {
    return reject(socket, '성불할 사망자가 없습니다. (이번 밤에 죽은 사람은 다음 밤부터 성불할 수 있습니다.)');
  }
  const valid = validateNightTarget(room, player, targetId, { aliveOnly: false, deadOnly: true });
  if (!valid.ok) return reject(socket, valid.message);
  if (!canMediumPurifyTarget(room, player, targetId)) {
    return reject(socket, '이번 밤에 사망한 사람은 다음 밤부터 성불할 수 있습니다.');
  }
  room.game.nightActions.mediumTarget = targetId;
  rememberNightActor(room, player.id, 'medium', targetId);
  deliverMediumResult(room, player, targetId);
  if (!room.game.nightActions.mediumResolved) {
    return reject(socket, '성불에 실패했습니다. 사망자를 다시 선택해 주세요.');
  }
  socket.emit('privateInfo', {
    type: 'actionConfirm',
    action: 'medium',
    targetId,
    targetName: playerName(room, targetId)
  });
  broadcastState(room);
}

function recordDayVote(room, socket, targetId) {
  if (!room || !room.game) return reject(socket, '방을 찾을 수 없습니다.');
  const player = getViewer(room, socket);
  if (!player || !player.alive) return reject(socket, '생존자만 투표할 수 있습니다.');
  if (room.phase !== PHASE.DAY_VOTE) return reject(socket, '투표 시간이 아닙니다.');
  if (!targetId || room.game.dayVotes[player.id] === targetId) {
    delete room.game.dayVotes[player.id];
  } else {
    const target = getPlayerById(room, targetId);
    if (!target || !target.alive) return reject(socket, '생존자에게만 투표할 수 있습니다.');
    voteFacts.ingestVoteIntelFromChat(room, voteFactHelpers);
    if (voteFacts.isDayVoteTargetForbidden(room, player, targetId, voteFactHelpers)) {
      if (target.role === ROLE.POLITICIAN) {
        return reject(socket, '정치인은 투표로 처형되지 않습니다. 다른 대상을 선택하세요.');
      }
      agentLog({
        hypothesisId: 'day-vote-forbidden-soften',
        location: 'server.js:recordDayVote',
        message: 'non-politician forbidden vote softened to allow',
        data: {
          voter: player.nickname,
          target: target.nickname,
          targetRole: target.role || null
        }
      });
    }
    room.game.dayVotes[player.id] = targetId;
  }
  broadcastState(room);
}

function recordExecutionVote(room, socket, vote) {
  if (!room || !room.game) return reject(socket, '방을 찾을 수 없습니다.');
  const player = getViewer(room, socket);
  if (!player || !player.alive) return reject(socket, '생존자만 투표할 수 있습니다.');
  if (room.phase !== PHASE.EXECUTION_VOTE) return reject(socket, '찬반 투표 시간이 아닙니다.');
  if (player.id === room.game.executionCandidateId) return reject(socket, '후보자는 투표할 수 없습니다.');
  if (vote !== 'yes' && vote !== 'no') return reject(socket, '잘못된 투표입니다.');
  room.game.executionVotes[player.id] = vote;
  console.log(`[EXECUTION] vote recorded player=${player.nickname} vote=${vote}`);
  broadcastState(room);
}

// ─── chat ─────────────────────────────────────────────────────────────────────

function pushChat(room, channel, entry) {
  if (!room.chatLog[channel]) room.chatLog[channel] = [];
  room.chatLog[channel].push(entry);
  if (room.chatLog[channel].length > 200) room.chatLog[channel].shift();
}

function pushLobbySystemMessage(room, text) {
  const entry = { from: '시스템', fromId: null, text, system: true, time: Date.now() };
  pushChat(room, 'lobby', entry);
  broadcastToRoom(room, 'chatMessage', { channel: 'lobby', ...entry });
}

function pushGameSystemMessage(room, text) {
  const entry = { from: '시스템', fromId: null, text, system: true, time: Date.now() };
  pushChat(room, 'day', entry);
  broadcastToRoom(room, 'chatMessage', { channel: 'day', ...entry });
}

function handleChat(room, socket, channel, text) {
  if (!room || !text || !String(text).trim()) return;
  const player = getViewer(room, socket);
  if (!player) return;
  let msgText = String(text).trim();
  if (channel === 'day' && player.isBot) {
    msgText = policeFmt.rewriteFormalPoliceReport(msgText);
  }
  const msg = { from: player.nickname, fromId: player.id, text: msgText, time: Date.now() };

  if (channel === 'lobby') {
    if (room.phase !== PHASE.LOBBY) return reject(socket, '로비에서만 사용할 수 있습니다.');
    pushChat(room, 'lobby', msg);
    broadcastToRoom(room, 'chatMessage', { channel: 'lobby', ...msg });
  } else if (channel === 'day') {
    if (![PHASE.DAY_CHAT].includes(room.phase) || !player.alive) {
      return reject(socket, '낮 채팅 시간이 아니거나 사망했습니다.');
    }
    pushChat(room, 'day', msg);
    chatSuspicion.ingestDayMessage(room, msg, voteFactHelpers);
    broadcastToRoom(room, 'chatMessage', { channel: 'day', ...msg });
    if (isPoliceSelfClaim(msg.text)) {
      notePublicPoliceClaim(room, player.id);
    }
    if (room.game && isSelfVoteRequest(msg.text)) {
      if (player.role === ROLE.POLICE || player.role === ROLE.PRIVATE_DETECTIVE) {
        room.game.botMatgyeongJatuDay = true;
      }
    }
    if (player.role === ROLE.POLICE && room.game) {
      const matClaimants = m42Bluff.scanPoliceReporters(room, voteFactHelpers);
      if (matClaimants.length >= 2) {
        m42PoliceCitizen.applyMatgyeongStrategyEffects(room, player, msg.text, voteFactHelpers);
      }
    }
    const looksReport = policeFmt.looksLikePoliceReport(msg.text);
    const providing = voteFacts.isPoliceReportProviding(msg.text, room);
    const parsedReport = voteFacts.parsePoliceReportFromText(room, msg.text);
    const policeProviding = player.role === ROLE.POLICE && (looksReport || providing);
    const hasParsedVerdict = !!(parsedReport.mafia.length || parsedReport.innocent.length);
    const scheduleAck = !player.isBot && hasBots(room) && hasParsedVerdict;
    // #region agent log
    agentLog({
      hypothesisId: 'A',
      location: 'server.js:dayChat',
      message: 'day chat branch',
      data: {
        from: player.nickname,
        role: player.role,
        isBot: player.isBot,
        text: String(msg.text).slice(0, 80),
        looksReport,
        providing,
        policeProviding,
        scheduleAck,
        isRequest: isPoliceReportRequest(msg.text, room),
        mafia: parsedReport.mafia.map((p) => p.nickname),
        innocent: parsedReport.innocent.map((p) => p.nickname)
      },
      runId: 'post-fix'
    });
    // #endregion
    if (looksReport || providing) {
      if (!policeProviding) {
        maybeTriggerHolgyeongOnPoliceReport(room, player, msg.text);
      }
    }
    if (policeProviding) {
      notePublicPoliceClaim(room, player.id);
      voteIntel.publishPoliceIntelToPublic(room);
      if (voteIntel.ingestPoliceReportsFromDayChat) {
        voteIntel.ingestPoliceReportsFromDayChat(room, voteFactHelpers);
      }
      postPoliceWithHolgyeongPair(room, player, msg.text, { alreadyPosted: true });
    }
    if (scheduleAck) {
      scheduleBotReplyToPoliceReport(room, msg);
      if (!policeProviding) {
        scheduleMafiaMatgyeongAfterReport(room, player.id, msg.text);
      }
    }
    if (!policeProviding) {
      const timeAdj = parseTimeAdjustRequest(msg.text);
      if (timeAdj && hasBots(room)) {
        scheduleBotTimeAdjustReaction(room, timeAdj);
      }
      if (isMediumPurifyRequest(msg.text)) {
        handleMediumPurifyChatRequest(room, player);
      } else if (isPoliceReportRequest(msg.text, room)) {
        // #region agent log
        agentLog({
          hypothesisId: 'D',
          location: 'server.js:dayChat',
          message: 'handlePoliceReportRequest',
          data: { text: String(msg.text).slice(0, 80) }
        });
        // #endregion
        handlePoliceReportRequest(room, player);
      } else if (hasBots(room) && !player.isBot) {
        scheduleBotReplyToHuman(room, { triggerText: msg.text });
      }
    }
  } else if (channel === 'mafia') {
    if (room.phase !== PHASE.NIGHT || !player.alive) return reject(socket, '마피아 채팅 불가');
    if (player.role !== ROLE.MAFIA && !player.joinedMafiaChat) return reject(socket, '권한 없음');
    pushChat(room, 'mafia', msg);
    broadcastToRoom(room, 'chatMessage', { channel: 'mafia', ...msg }, p => p.alive && (p.role === ROLE.MAFIA || p.joinedMafiaChat));
  } else if (channel === 'cult') {
    if (room.phase !== PHASE.NIGHT || !player.alive) return reject(socket, '밤에만 교주팀 채팅을 사용할 수 있습니다.');
    if (player.role !== ROLE.CULT_LEADER) return reject(socket, '교주만 교주팀 밤챗을 보낼 수 있습니다.');
    pushChat(room, 'cult', msg);
    broadcastToRoom(room, 'chatMessage', { channel: 'cult', ...msg }, (p) => p.alive && isCultMember(p));
  } else if (channel === 'dead') {
    if (player.alive) return reject(socket, '사망자만 대화할 수 있습니다.');
    const deadMsg = { ...msg, isDead: true };
    pushChat(room, 'dead', deadMsg);
    broadcastDeadChatMessage(room, deadMsg);
    if (!player.isBot && hasBots(room)) {
      scheduleBotDeadReply(room, deadMsg);
    }
  } else if (channel === 'lastWords') {
    if (room.phase !== PHASE.LAST_WORDS) return reject(socket, '최후의 반론 시간이 아닙니다.');
    if (player.id !== room.game.executionCandidateId) return reject(socket, '최다 득표자만 발언할 수 있습니다.');
    pushChat(room, 'lastWords', msg);
    broadcastToRoom(room, 'chatMessage', { channel: 'lastWords', ...msg });
  }
}

// ─── socket handlers ────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  socket.on('resumeSession', ({ userID, nickname } = {}) => {
    if (userID && nickname) attachSession(socket, userID, nickname);
    if (!socket.userID) return reject(socket, '세션 정보가 없습니다.');
    if (tryResumeSession(socket)) return;
    socket.emit('stateSync', { phase: 'none', serverInfo: getServerInfoFromSocket(socket) });
  });

  socket.on('join', ({ userID, nickname, roomCode, autoReconnect }) => {
    if (!userID || !nickname) return reject(socket, 'userID와 닉네임이 필요합니다.');
    attachSession(socket, userID, nickname);

    const code = roomCode ? String(roomCode).trim().toUpperCase() : '';
    if (!code) {
      socket.emit('stateSync', { phase: 'none', serverInfo: getServerInfoFromSocket(socket) });
      return;
    }

    if (!rooms.has(code)) {
      if (autoReconnect) {
        emitRoomLost(socket, { silent: true });
      } else {
        const sess = sessions.get(userID);
        if (sess) {
          sess.roomCode = null;
          sess.playerId = null;
        }
        reject(socket, '존재하지 않는 방 코드입니다. 코드를 확인하거나 새 방을 만들어 주세요.');
        socket.emit('stateSync', { phase: 'none', serverInfo: getServerInfoFromSocket(socket) });
      }
      return;
    }

    const room = rooms.get(code);
    for (const [, otherRoom] of rooms) {
      if (otherRoom !== room && getPlayerByUserId(otherRoom, userID)) {
        return reject(socket, '이미 다른 방에 참가 중입니다.');
      }
    }

    const existing = getPlayerByUserId(room, userID);
    if (existing) {
      reconnectPlayer(socket, room, existing);
      return;
    }
    if (Object.keys(room.players).length >= MAX_PLAYERS) return reject(socket, '방이 가득 찼습니다.');
    if (room.phase !== PHASE.LOBBY) {
      reject(socket, '게임이 진행 중입니다. 같은 브라우저 탭에서 새로고침해 주세요.');
      socket.emit('joinResult', { ok: false, reason: 'game_in_progress' });
      return;
    }

    const playerId = randomUUID();
    room.players[playerId] = {
      id: playerId, userID, nickname, role: null, alive: true, connected: true,
      soldierShieldUsed: false, reporterUsed: false, joinedMafiaChat: false, joinedCult: false,
      disconnectTimer: null,
      isBot: false, timeShortened: false, timeIncreased: false
    };
    const sess = sessions.get(userID);
    sess.roomCode = room.code;
    sess.playerId = playerId;
    socket.join(room.code);
    pushLobbySystemMessage(room, `${nickname}님이 입장했습니다.`);
    socket.emit('stateSync', toClientState(room, userID, { includeChat: true }));
    socket.emit('joinResult', { ok: true });
    broadcastState(room);
  });

  socket.on('createRoom', ({ userID, nickname }) => {
    if (!userID || !nickname) return reject(socket, 'userID와 닉네임이 필요합니다.');
    attachSession(socket, userID, nickname);

    for (const [, r] of rooms) {
      if (getPlayerByUserId(r, userID)) return reject(socket, '이미 다른 방에 있습니다.');
    }

    const room = createRoom(userID, nickname);
    const host = Object.values(room.players)[0];
    const sess = sessions.get(userID);
    sess.roomCode = room.code;
    sess.playerId = host.id;
    socket.join(room.code);
    pushLobbySystemMessage(room, `${nickname}님이 방을 만들었습니다.`);
    socket.emit('stateSync', toClientState(room, userID, { includeChat: true }));
    console.log(`[ROOM] created ${room.code} by ${nickname}`);
  });

  socket.on('startGame', () => {
    const sess = sessions.get(socket.userID);
    if (!sess || !sess.roomCode) return reject(socket, '방에 없습니다.');
    const room = rooms.get(sess.roomCode);
    if (!room) return reject(socket, '방을 찾을 수 없습니다.');
    if (room.hostUserId !== socket.userID) return reject(socket, '호스트만 시작할 수 있습니다.');
    if (room.phase !== PHASE.LOBBY) return reject(socket, '이미 시작됨');
    const count = Object.keys(room.players).length;
    if (count < MIN_PLAYERS) return reject(socket, `최소 ${MIN_PLAYERS}명이 필요합니다.`);

    initGameState(room);
    console.log(`[GAME] started room=${room.code} players=${count}`);
    if (hasBots(room)) {
      console.log('[GAME] role assignment (debug):');
      for (const p of Object.values(room.players)) {
        console.log(`  ${p.nickname}${p.isBot ? ' [BOT]' : ''}: ${ROLE_LABELS[p.role]}`);
      }
    }
    for (const p of Object.values(room.players)) {
      const s = sessions.get(p.userID);
      if (s && s.socketId) {
        io.to(s.socketId).emit('privateInfo', {
          type: 'role', role: p.role, roleLabel: ROLE_LABELS[p.role]
        });
      }
    }
    for (const p of Object.values(room.players)) {
      if (isMafiaRole(p.role)) emitMafiaTeamInfo(room, p);
      if (isCultMember(p)) emitCultTeamInfo(room, p);
    }
    startNight(room);
  });

  socket.on('newGame', () => {
    const sess = sessions.get(socket.userID);
    if (!sess || !sess.roomCode) return reject(socket, '방에 없습니다.');
    const room = rooms.get(sess.roomCode);
    if (!room) return reject(socket, '방을 찾을 수 없습니다.');
    if (room.hostUserId !== socket.userID) return reject(socket, '호스트만 새 게임을 시작할 수 있습니다.');
    if (room.phase !== PHASE.GAME_OVER) return reject(socket, '게임 종료 후에만 새 게임을 시작할 수 있습니다.');
    resetRoomToLobby(room);
  });

  socket.on('leaveRoom', () => leaveRoomBySocket(socket));

  socket.on('lobbyChat', (data) => {
    const { room } = getRoomForSocket(socket);
    if (!room) return reject(socket, '방을 찾을 수 없습니다.');
    handleChat(room, socket, 'lobby', data && data.text);
  });

  socket.on('chat', (data) => {
    const { room } = getRoomForSocket(socket);
    if (!room) return reject(socket, '방을 찾을 수 없습니다.');
    handleChat(room, socket, 'day', data && data.text);
  });

  socket.on('mafiaChat', (data) => {
    const { room } = getRoomForSocket(socket);
    if (!room) return reject(socket, '방을 찾을 수 없습니다.');
    handleChat(room, socket, 'mafia', data && data.text);
  });

  socket.on('cultChat', (data) => {
    const { room } = getRoomForSocket(socket);
    if (!room) return reject(socket, '방을 찾을 수 없습니다.');
    handleChat(room, socket, 'cult', data && data.text);
  });

  socket.on('deadChat', (data) => {
    const { room } = getRoomForSocket(socket);
    if (!room) return reject(socket, '방을 찾을 수 없습니다.');
    handleChat(room, socket, 'dead', data && data.text);
  });

  socket.on('lastWordsChat', (data) => {
    const { room } = getRoomForSocket(socket);
    if (!room) return reject(socket, '방을 찾을 수 없습니다.');
    handleChat(room, socket, 'lastWords', data && data.text);
  });

  socket.on('mafiaVote', ({ targetId } = {}) => {
    const { room } = getRoomForSocket(socket);
    if (!room) return reject(socket, '방을 찾을 수 없습니다.');
    recordMafiaVote(room, socket, targetId);
  });

  socket.on('cultProselytize', ({ targetId } = {}) => {
    const { room } = getRoomForSocket(socket);
    if (!room) return reject(socket, '방을 찾을 수 없습니다.');
    recordCultProselytize(room, socket, targetId);
  });

  socket.on('spyInvestigate', ({ targetId } = {}) => {
    const { room } = getRoomForSocket(socket);
    if (!room) return reject(socket, '방을 찾을 수 없습니다.');
    recordSpyInvestigate(room, socket, targetId);
  });

  socket.on('policeInvestigate', ({ targetId } = {}) => {
    const { room } = getRoomForSocket(socket);
    if (!room) return reject(socket, '방을 찾을 수 없습니다.');
    recordPoliceInvestigate(room, socket, targetId);
  });

  socket.on('doctorHeal', ({ targetId } = {}) => {
    const { room } = getRoomForSocket(socket);
    if (!room) return reject(socket, '방을 찾을 수 없습니다.');
    recordDoctorHeal(room, socket, targetId);
  });

  socket.on('reporterScoop', ({ targetId } = {}) => {
    const { room } = getRoomForSocket(socket);
    if (!room) return reject(socket, '방을 찾을 수 없습니다.');
    recordReporterScoop(room, socket, targetId);
  });

  socket.on('mediumPurify', ({ targetId } = {}) => {
    const { room } = getRoomForSocket(socket);
    if (!room) return reject(socket, '방을 찾을 수 없습니다.');
    recordMediumPurify(room, socket, targetId);
  });

  socket.on('privateDetectiveObserve', ({ targetId } = {}) => {
    const { room } = getRoomForSocket(socket);
    if (!room) return reject(socket, '방을 찾을 수 없습니다.');
    recordPrivateDetectiveObserve(room, socket, targetId);
  });

  socket.on('dayVote', ({ targetId } = {}) => {
    const { room } = getRoomForSocket(socket);
    if (!room) return reject(socket, '방을 찾을 수 없습니다.');
    recordDayVote(room, socket, targetId);
  });

  socket.on('executionVote', ({ vote } = {}) => {
    const { room } = getRoomForSocket(socket);
    if (!room) return reject(socket, '방을 찾을 수 없습니다.');
    recordExecutionVote(room, socket, vote);
  });

  socket.on('addBot', () => {
    const sess = sessions.get(socket.userID);
    if (!sess || !sess.roomCode) return reject(socket, '방에 없습니다.');
    const room = rooms.get(sess.roomCode);
    if (!room) return reject(socket, '방을 찾을 수 없습니다.');
    if (room.hostUserId !== socket.userID) return reject(socket, '호스트만 봇을 추가할 수 있습니다.');
    if (room.phase !== PHASE.LOBBY) return reject(socket, '로비에서만 봇을 추가할 수 있습니다.');
    const result = addBotToRoom(room);
    if (!result.ok) return reject(socket, result.message);
    broadcastState(room);
  });

  socket.on('removeBot', () => {
    const sess = sessions.get(socket.userID);
    if (!sess || !sess.roomCode) return reject(socket, '방에 없습니다.');
    const room = rooms.get(sess.roomCode);
    if (!room) return reject(socket, '방을 찾을 수 없습니다.');
    if (room.hostUserId !== socket.userID) return reject(socket, '호스트만 봇을 제거할 수 있습니다.');
    if (room.phase !== PHASE.LOBBY) return reject(socket, '로비에서만 봇을 제거할 수 있습니다.');
    const result = removeBotFromRoom(room);
    if (!result.ok) return reject(socket, result.message);
    broadcastState(room);
  });

  socket.on('adjustTime', ({ type }) => {
    const sess = sessions.get(socket.userID);
    if (!sess || !sess.roomCode) return reject(socket, '방에 없습니다.');
    const room = rooms.get(sess.roomCode);
    if (!room) return reject(socket, '방을 찾을 수 없습니다.');
    const player = getPlayerByUserId(room, socket.userID);
    if (!player) return reject(socket, '플레이어를 찾을 수 없습니다.');
    const result = adjustPhaseTime(room, player, type);
    if (!result.ok) return reject(socket, result.message);
  });

  socket.on('disconnect', () => handleDisconnect(socket));
});

process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException', err);
  // Keep process alive on Render — dropping one bad tick is better than full restart
});

process.on('warning', (w) => {
  if (w.name === 'MaxListenersExceededWarning') console.warn('[WARN]', w.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection', reason);
});

process.on('SIGTERM', () => {
  console.log('[SERVER] SIGTERM — shutting down gracefully');
  for (const room of rooms.values()) {
    clearPhaseTimer(room);
    bumpRoomTaskGeneration(room);
  }
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
});

httpServer.listen(PORT, HOST, () => {
  const info = buildServerInfo();
  const assets = ensurePublicAssets();
  console.log('Mafia Game Server running');
  console.log(`  Local:   http://localhost:${PORT}`);
  if (info.publicUrl) {
    console.log(`  Web:     ${info.publicUrl}`);
  } else {
    console.log(`  LAN:     http://${info.localIp}:${PORT}`);
    console.log('  Tip: Set PUBLIC_URL or deploy (see render.yaml) for web access.');
  }
  const roleReady = ROLE_ASSET_NAMES.filter((r) => resolveRoleAsset(r)).length;
  const motionReady = MOTION_ASSET_NAMES.filter((n) => resolveMotionAsset(n)).length;
  console.log(`  Role portraits: ${roleReady}/${ROLE_ASSET_NAMES.length} (copied ${assets.rolesCopied})`);
  console.log(`  Motion art: ${motionReady}/${MOTION_ASSET_NAMES.length} (copied ${assets.motionsCopied})`);
  const botAi = botBrain.getStatus();
  console.log(`  Bot AI: ${botAi.mode}${botAi.llmEnabled ? ` (${botAi.model})` : ''}`);
  console.log(`  Stability patch: ${SERVER_STABILITY} (police report ack)`);
  // #region agent log
  agentLog({
    hypothesisId: 'init',
    location: 'server.js:listen',
    message: 'server started',
    data: { stability: SERVER_STABILITY, port: PORT, logPath: require('./lib/debug-agent-log').LOG_PATH },
    runId: 'post-fix'
  });
  // #endregion
});
