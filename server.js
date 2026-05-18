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
const botChatFilter = require('./lib/bot-chat-filter');
const m42Bluff = require('./lib/m42-bluff');
const policeFmt = require('./lib/police-report-format');
const m42Cult = require('./lib/m42-cult');
const chatSuspicion = require('./lib/bot-chat-suspicion');
const mediumPurify = require('./lib/bot-medium-purify');

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
  const candidates = [
    path.join(__dirname, 'public', 'assets', 'motions', filename),
    path.join(__dirname, 'assets', filename)
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
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
  'mafia', 'spy', 'citizen', 'police', 'doctor',
  'soldier', 'politician', 'medium', 'reporter', 'graverobber', 'cult_leader'
];

const MOTION_ASSET_NAMES = [
  'vote_execution.png', 'vote_rejected.png', 'quiet_night.png', 'mafia_kill.png',
  'doctor_heal.png', 'soldier_block.png', 'police_mafia.png', 'police_innocent.png',
  'spy_contact.png', 'spy_investigate.png', 'politician_immunity.png',
  'reporter_scoop.png', 'graverobber_inherit.png', 'cult_proselytize.png'
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

ensurePublicAssets();

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
const MAX_PLAYERS = 12;
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
  MIN_GAP_MS: 14000,
  MAX_PER_DAY_PHASE: 5,
  HUMAN_REPLY_WAIT_MS: 9000,
  SCHEDULED_SLOTS_MS: [18000, 75000]
};

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

app.get('/health', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ok: true,
    service: 'mafia-game',
    stability: '2026-05-16e',
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

function getPublicBaseUrl(req) {
  const fromEnv = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;
  if (fromEnv) return String(fromEnv).replace(/\/$/, '');

  if (!req) return null;
  const host = req.get('x-forwarded-host') || req.get('host');
  if (!host) return null;
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
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
  return buildServerInfo(socket.request);
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
  if (!viewer || !viewer.alive) return false;
  return isCultMember(viewer);
}

function isVisibleCultFollower(viewer, target) {
  if (!viewer || !target || target.id === viewer.id) return false;
  if (viewer.role !== ROLE.CULT_LEADER || !viewer.alive) return false;
  return isCultMember(target);
}

/** 마피아 채팅·팀 표시 권한 (마피아 또는 접선한 스파이) */
function viewerOnMafiaSide(viewer) {
  if (!viewer || !viewer.alive) return false;
  return viewer.role === ROLE.MAFIA || viewer.joinedMafiaChat;
}

/** 시청자에게 보이는 마피아 팀 동료 (본인 제외) */
function isVisibleMafiaAlly(viewer, target) {
  if (!viewer || !target || target.id === viewer.id) return false;
  if (!viewerOnMafiaSide(viewer)) return false;
  if (isMafiaRole(target.role)) return true;
  return target.role === ROLE.SPY && target.joinedMafiaChat;
}

function getMafiaTeammatesForViewer(room, viewer) {
  if (!viewerOnMafiaSide(viewer)) return [];
  return Object.values(room.players).filter(p => isVisibleMafiaAlly(viewer, p));
}

function emitMafiaTeamInfo(room, viewer) {
  if (!viewer) return;
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

function clearBotChatTimers(room) {
  if (!room) return;
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
  player.alive = false;
  if (player.isBot) scheduleBotDeadChatOnDeath(room, player);
}

function resetBotChatStats(room) {
  if (!room || !room.game) return;
  room.game.botChatStats = { count: 0, lastAt: 0 };
}

function canBotChatNow(room) {
  if (!room || !room.game) return false;
  if (room.botChatInFlight) {
    const started = room._botChatStartedAt || 0;
    if (started && Date.now() - started > 12000) {
      console.warn(`[BOT] reset stuck botChatInFlight room=${room.code}`);
      room.botChatInFlight = false;
    } else {
      return false;
    }
  }
  const st = room.game.botChatStats || { count: 0, lastAt: 0 };
  room.game.botChatStats = st;
  const now = Date.now();
  if (st.count >= BOT_CHAT.MAX_PER_DAY_PHASE) return false;
  if (st.lastAt && now - st.lastAt < BOT_CHAT.MIN_GAP_MS) return false;
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

const VOTE_RESULTS_DISPLAY_MS = 4500;

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

function isPoliceReportRequest(text) {
  if (!text) return false;
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

/** 공개 조결용: 이번 밤 수사 1건, 낮이면 가장 최근 수사 1건 */
function getPoliceIntelForReport(room, policeId) {
  const list = room.game?.policeIntel?.[policeId] || [];
  if (!list.length) return [];

  const idx = room.game?.nightIndex || 0;
  const inNight = room.phase === PHASE.NIGHT;
  const thisNight = list
    .filter((r) => r.nightIndex === idx)
    .sort((a, b) => (b.at || 0) - (a.at || 0));
  if (thisNight.length) return [thisNight[0]];

  if (!inNight) {
    const latest = [...list].sort((a, b) => (b.at || 0) - (a.at || 0))[0];
    return latest ? [latest] : [];
  }
  return [];
}

function recordPoliceInvestigation(room, policeId, targetId, isMafia) {
  if (!room.game) return;
  const target = getPlayerById(room, targetId);
  if (!target) return;
  if (!room.game.policeIntel) room.game.policeIntel = {};
  if (!room.game.policeIntel[policeId]) room.game.policeIntel[policeId] = [];
  const list = room.game.policeIntel[policeId];
  const nightIndex = room.game.nightIndex || 0;
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
    console.log(`[POLICE] public report (no intel) by ${police.nickname}`);
    return;
  }

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
  scheduleMafiaMatgyeongAfterReport(room, police.id);
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

/** 「영매 성불」 등 채팅 요청 → 영매 봇이 의심 사망자 성불 후 결과 공개 */
function runBotMediumPurifyFromChat(room, mediumBot) {
  if (!room?.game || !mediumBot?.alive || mediumBot.role !== ROLE.MEDIUM) return;
  if (room.phase !== PHASE.DAY_CHAT) return;

  const na = room.game.nightActions;
  if (!na) return;

  const dead = Object.values(room.players).filter((p) => !p.alive);
  if (!dead.length) {
    postBotDayMessage(room, mediumBot, '지금 성불할 사망자가 없습니다.');
    return;
  }

  if (na.mediumResolved) {
    const known = mediumPurify.pickKnownDeadForAnnounce(room, mediumBot, voteFactHelpers);
    if (known) {
      const label = ROLE_LABELS[known.role] || known.role;
      const line = mediumPurify.formatPurifyAnnounce(known.nickname, label);
      postBotDayMessage(room, mediumBot, line);
      voteIntel.ingestMediumPurifyReveal(room, known.id, known.role, botLearnRole);
      return;
    }
    const next = mediumPurify.pickSuspiciousDeadTarget(room, mediumBot, voteFactHelpers);
    postBotDayMessage(
      room,
      mediumBot,
      next
        ? `이번 밤 성불은 이미 사용했습니다. 다음 밤에 ${next.nickname}님부터 성불하겠습니다.`
        : '이번 밤 성불은 이미 사용했습니다.'
    );
    return;
  }

  const target = mediumPurify.pickSuspiciousDeadTarget(room, mediumBot, voteFactHelpers);
  if (!target) {
    postBotDayMessage(room, mediumBot, '성불할 사망자가 없습니다.');
    return;
  }

  na.mediumTarget = target.id;
  deliverMediumResult(room, mediumBot, target.id);
  if (!na.mediumResolved) {
    postBotDayMessage(room, mediumBot, '성불에 실패했습니다. 사망자를 다시 확인하겠습니다.');
    return;
  }

  const line = mediumPurify.formatPurifyAnnounce(
    target.nickname,
    ROLE_LABELS[target.role] || target.role
  );
  postBotDayMessage(room, mediumBot, line);
  voteIntel.ingestMediumPurifyReveal(room, target.id, target.role, botLearnRole);
  console.log(`[MEDIUM] bot purify chat ${mediumBot.nickname} → ${target.nickname} (${target.role})`);
}

function handleMediumPurifyChatRequest(room) {
  if (!room.game || room.phase !== PHASE.DAY_CHAT || !hasBots(room)) return;

  const mediumBot = getBots(room).find((b) => b.alive && b.role === ROLE.MEDIUM);
  if (!mediumBot) return;

  const delay = 700 + Math.floor(Math.random() * 900);
  scheduleRoomTask(room, () => runBotMediumPurifyFromChat(room, mediumBot), delay);
}

/** 경조결 요청: 인간 경찰은 채팅 자동 게시 없음(비공개 안내·직접 입력만) */
function handlePoliceReportRequest(room, requester) {
  if (!room.game || room.phase !== PHASE.DAY_CHAT) return;
  const policeList = Object.values(room.players).filter(
    (p) => p.role === ROLE.POLICE && p.alive
  );
  if (!policeList.length) {
    scheduleMafiaHolgyeongOnReportRequest(room);
    pushGameSystemMessage(room, '생존 경찰이 없어 조결을 받을 수 없습니다.');
    return;
  }

  scheduleMafiaHolgyeongOnReportRequest(room);

  const humanRequester = requester && requester.alive && requester.role === ROLE.POLICE && !requester.isBot
    ? requester
    : null;

  policeList.forEach((police, i) => {
    const delay = 400 + i * 500;
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
  const text = report && report.hasIntel && report.text
    ? report.text
    : '조결 요청 확인했습니다. 이번 밤 수사 기록이 없습니다. 밤에 대상을 지목해 주시면 낮에 조결로 말씀드리겠습니다.';
  postBotDayMessage(room, policeBot, text);
  scheduleMafiaMatgyeongAfterReport(room, policeBot.id);
}

/** 홀경 조결 직후 마피아 봇이 맞경(둘째 경찰) 주장 */
function scheduleMafiaMatgyeongAfterReport(room, reporterId) {
  if (!room.game || room.phase !== PHASE.DAY_CHAT || !reporterId) return;
  if (!hasBots(room)) return;

  const reporter = getPlayerById(room, reporterId);
  if (!reporter || !reporter.alive) return;

  const mafiaBots = getBots(room).filter(
    (b) => b.alive && isMafiaTeam(b.role) && b.id !== reporterId && b.role !== ROLE.POLICE
  );
  if (!mafiaBots.length) return;

  const bluffer = mafiaBots[Math.floor(Math.random() * mafiaBots.length)];
  const delay = 500 + Math.floor(Math.random() * 700);
  scheduleRoomTask(room, () => {
    if (room.phase !== PHASE.DAY_CHAT) return;
    const rival = getPlayerById(room, reporterId);
    const text = m42Bluff.buildFakePoliceReportLine(room, bluffer, voteFactHelpers, {
      avoidName: rival ? rival.nickname : undefined
    });
    if (text) postBotDayMessage(room, bluffer, text);
  }, delay);
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
  if (policeAlive) return;

  const mafiaBots = getBots(room).filter(
    (b) => b.alive && isMafiaTeam(b.role) && b.role !== ROLE.POLICE
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

/** 낮 시작 직후 마피아 홀경 — 가짜 조결로 먼저 말함 (직공 메타 없음) */
function scheduleMafiaEarlyPoliceBluff(room) {
  if (!room.game || room.phase !== PHASE.DAY_CHAT || !hasBots(room)) return;
  const mafiaBots = getBots(room).filter((b) => b.alive && isMafiaTeam(b.role) && b.role !== ROLE.POLICE);
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
    pushGameSystemMessage(room, '생존 경찰이 없어 조결을 받을 수 없습니다.');
    return;
  }
  policeList.forEach((police, i) => {
    const delay = 400 + i * 500;
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

  const cleared = voteFacts.getClearedIds(room, voter, voteFactHelpers);
  for (const id of cleared) {
    scores[id] = 0;
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

function pickBotDayVoteTarget(room, bot) {
  const factTarget = voteFacts.pickFactBasedDayVote(room, bot, voteFactHelpers);
  if (factTarget && factTarget !== bot.id) {
    if (voteFacts.isPlayerCleared(room, bot, factTarget, voteFactHelpers)) {
      const alt = voteFacts.pickFallbackDayVoteTarget(room, bot, voteFactHelpers);
      if (alt && alt !== bot.id) return alt;
    } else {
      return factTarget;
    }
  }

  const fallback = voteFacts.pickFallbackDayVoteTarget(room, bot, voteFactHelpers);
  if (fallback && fallback !== bot.id) return fallback;

  const cleared = voteFacts.getClearedIds(room, bot, voteFactHelpers);
  const m42CultBots = require('./lib/m42-cult-bots');
  const alive = getAlivePlayers(room).filter((p) => {
    if (p.id === bot.id) return false;
    if (cleared.has(p.id)) return false;
    if (m42CultBots.isCultAlly(room, bot, p)) return false;
    return true;
  });
  if (alive.length === 1) return alive[0].id;
  if (alive.length > 1) {
    const chatPick = chatSuspicion.pickTopSuspectId(room, bot, voteFactHelpers, { clearedIds: cleared });
    if (chatPick) return chatPick;
    const scores = buildSuspicionScores(room, bot);
    alive.sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
    if ((scores[alive[0].id] || 0) >= 5) return alive[0].id;
  }

  return null;
}

function pickBotExecutionVoteFromFacts(room, bot, candidate) {
  return voteFacts.pickFactBasedExecutionVote(room, bot, candidate, voteFactHelpers);
}

const voteFactHelpers = {
  isMafiaTeam,
  isMafiaRole,
  getPlayerById,
  getBotMind,
  getChatMessages,
  buildSuspicionScores,
  botLearnRole
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
  isPlayerClearedByFacts: (room, bot, id) => voteFacts.isPlayerCleared(room, bot, id, voteFactHelpers),
  parsePoliceReportFromText: (room, text) => voteFacts.parsePoliceReportFromText(room, text),
  getAccuseReasonForTarget: (room, bot, id) => voteFacts.getAccuseReasonForTarget(room, bot, id, voteFactHelpers),
  formatAccuseLine: (room, bot, id, speaker) => voteFacts.formatAccuseLine(room, bot, id, voteFactHelpers, speaker),
  getBotMind,
  getBotFakeClaim: (room, botId) => getBotMind(room, botId).fakeClaim,
  setBotFakeClaim: (room, botId, role) => {
    getBotMind(room, botId).fakeClaim = role;
  },
  isPoliceReportRequest,
  buildPolicePublicReport,
  isRoleClaimRequest,
  isRoleRollCallQuestion,
  isPublicPoliceClaim: (room, playerId) => !!(room.game?.publicPoliceClaimIds?.[playerId]),
  getPublicPoliceClaimTargets: (room, excludeId) => getPublicPoliceClaimTargets(room, excludeId),
  isSelfVoteRequest
});

function pickBotKillTarget(room, mafiaBot) {
  const scores = buildSuspicionScores(room, mafiaBot);
  const firstNight = room.game && room.game.nightIndex <= 1;
  for (const p of getAlivePlayers(room)) {
    if (isMafiaTeam(p.role)) scores[p.id] = 0;
    if ([ROLE.POLICE, ROLE.DOCTOR, ROLE.REPORTER].includes(p.role)) {
      let bonus = 5;
      if (firstNight && p.role === ROLE.POLICE) bonus = 1;
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
  console.log(`[BOT] ${mafiaBot.nickname} mafia-kill -> ${playerName(room, targetId)}`);
  return true;
}

function pickBotHealTarget(room, doctorBot) {
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
  const humans = alive.filter((p) => !p.isBot);
  const mind = getBotMind(room, reporter.id);
  const unknownHumans = humans.filter((p) => !mind.knownRoles[p.id]);
  if (unknownHumans.length && Math.random() < 0.65) {
    return unknownHumans[Math.floor(Math.random() * unknownHumans.length)].id;
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

  const nightIndex = room.game?.nightIndex || 0;
  const intel = (room.game?.policeIntel?.[police.id]) || [];
  const investigatedTonight = new Set(
    intel.filter((r) => r.nightIndex === nightIndex).map((r) => r.targetId)
  );
  let pool = alive.filter((p) => !investigatedTonight.has(p.id));
  if (!pool.length) pool = alive;

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
    if ([ROLE.POLICE, ROLE.DOCTOR, ROLE.REPORTER, ROLE.POLITICIAN].includes(p.role)) {
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
      const dead = Object.values(room.players).filter(p => !p.alive);
      if (!dead.length) return null;
      const scores = buildSuspicionScores(room, bot);
      dead.sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
      return dead[0].id;
    }
    default:
      return null;
  }
}

function applyBotDayVote(room, bot) {
  const g = room.game;
  if (!g || g.dayVotes[bot.id]) return false;
  const targetId = pickBotDayVoteTarget(room, bot);
  if (!targetId) return false;
  g.dayVotes[bot.id] = targetId;
  console.log(`[BOT] ${bot.nickname} day-votes ${playerName(room, targetId)}`);
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
  ingestAllDayChatSuspicion(room);
  const bots = getBots(room).filter(p => p.alive);
  let voted = 0;
  for (const bot of bots) {
    if (applyBotDayVote(room, bot)) voted++;
  }
  if (voted > 0) broadcastState(room);
}

function scheduleBotDayVotes(room) {
  if (!hasBots(room)) return;
  runBotDayVotes(room);
  [2500, 7000, 11000].forEach((ms) => {
    scheduleRoomTask(room, () => runBotDayVotes(room), ms);
  });
}

function postBotDayMessage(room, bot, text) {
  if (!text || !bot?.alive || room.phase !== PHASE.DAY_CHAT) return;
  if (!canEmitRoomEvent(room, 'chat')) {
    console.warn(`[BOT] chat rate-limited room=${room.code}`);
    return;
  }
  const safe = botChatFilter.sanitizeBotChatLine(text, bot, isMafiaTeam, room, voteFactHelpers);
  if (safe !== text) {
    console.warn(`[BOT] filtered chat from ${bot.nickname}`);
  }
  text = policeFmt.rewriteFormalPoliceReport(text);
  const msg = { from: bot.nickname, fromId: bot.id, text, time: Date.now() };
  if (policeFmt.looksLikePoliceReport(text) || isPoliceSelfClaim(text)) {
    notePublicPoliceClaim(room, bot.id);
    voteIntel.ingestPoliceReportsFromDayChat(room, voteFactHelpers);
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
  if (isRoleClaimRequest(text) || isRoleRollCallQuestion(text)) {
    scheduleBotRoleRollCall(room, text, bot.id);
  }
}

async function runBotDayChat(room, ctx = {}) {
  if (room.phase !== PHASE.DAY_CHAT || !room.game) return;
  if (!canBotChatNow(room)) return;

  const bots = getBots(room).filter(p => p.alive);
  if (!bots.length) return;

  room.botChatInFlight = true;
  room._botChatStartedAt = Date.now();
  try {
    let bot;
    const trigger = ctx.triggerText || '';
    if (m42Bluff.wantsMatgyeongAsk(trigger)) {
      const mafiaBots = bots.filter((b) => isMafiaTeam(b.role) && b.role !== ROLE.POLICE);
      bot = mafiaBots.length ? shuffle(mafiaBots)[0] : shuffle(bots)[0];
    } else if (ctx.policeReport && isPoliceReportRequest(trigger)) {
      const mafiaBluffers = bots.filter(
        (b) => isMafiaTeam(b.role) && b.role !== ROLE.POLICE
      );
      bot = mafiaBluffers.length
        ? shuffle(mafiaBluffers)[0]
        : (bots.find((p) => p.role === ROLE.POLICE) || shuffle(bots)[0]);
    } else {
      bot = shuffle(bots)[0];
    }
    const text = await Promise.race([
      botBrain.generateBotChat(room, bot, ctx),
      new Promise((resolve) => setTimeout(() => resolve(null), 9000))
    ]);
    if (!text) {
      const fallback = botBrain.generateRuleBased
        ? botBrain.generateRuleBased(room, bot, ctx)
        : null;
      if (fallback) postBotDayMessage(room, bot, fallback);
      return;
    }
    postBotDayMessage(room, bot, text);
  } catch (err) {
    console.warn('[BOT] day-chat error', err.message);
    room.botChatInFlight = false;
  } finally {
    room.botChatInFlight = false;
  }
}

function scheduleBotRoleRollCall(room, triggerText, excludeBotId = null) {
  if (!hasBots(room) || room.phase !== PHASE.DAY_CHAT) return;
  const t = String(triggerText || '');
  if (!isRoleClaimRequest(t) && !isRoleRollCallQuestion(t)) return;

  room._rollCallGen = (room._rollCallGen || 0) + 1;
  const gen = room._rollCallGen;

  const bots = shuffle(getBots(room).filter((b) => b.alive && b.id !== excludeBotId));
  if (!bots.length) return;

  console.log(`[BOT] role roll-call: ${bots.length} bots (gen=${gen})`);

  bots.forEach((bot, i) => {
    const delay = 900 + i * (1200 + Math.floor(Math.random() * 500));
    scheduleRoomTask(room, () => {
      if (room._rollCallGen !== gen || room.phase !== PHASE.DAY_CHAT) return;
      if (!bot.alive) return;
      const isMafia = isMafiaTeam(bot.role);
      const line = botBrain.buildRoleRollCallAnswer(room, bot, isMafia);
      if (line) postBotDayMessage(room, bot, line);
    }, delay);
  });
}

function scheduleBotReplyToHuman(room, opts = {}) {
  if (!hasBots(room) || room.phase !== PHASE.DAY_CHAT) return;
  const triggerText = opts.triggerText || '';
  const timeAdj = parseTimeAdjustRequest(triggerText);
  if (timeAdj) scheduleBotTimeAdjustReaction(room, timeAdj);

  if (isRoleClaimRequest(triggerText) || isRoleRollCallQuestion(triggerText)) {
    scheduleBotRoleRollCall(room, triggerText);
    return;
  }

  if (isMediumPurifyRequest(triggerText)) {
    handleMediumPurifyChatRequest(room);
    return;
  }

  if (room._botHumanReplyTimer) clearTimeout(room._botHumanReplyTimer);
  const policeReport = !!opts.policeReport || isPoliceReportRequest(triggerText);
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

  const reporter = Object.values(room.players).find((p) => p.role === ROLE.REPORTER);
  const doctor = Object.values(room.players).find((p) => p.role === ROLE.DOCTOR && p.alive);
  const soldier = s.soldierBlockTargetId ? getPlayerById(room, s.soldierBlockTargetId) : null;

  return {
    nightIndex: g.nightIndex,
    deaths,
    quietNight: deaths.length === 0 && !s.healBlockedKill && !s.soldierBlockedKill,
    healSave: !!s.healBlockedKill,
    soldierBlock: !!s.soldierBlockedKill,
    reporterReveal,
    reporterBotId: reporter ? reporter.id : null,
    doctorBotId: doctor ? doctor.id : null,
    soldierBotId: soldier ? soldier.id : null,
    announcementText: annText,
    botActs: s.botActs || {}
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

  for (const bot of bots) {
    const text = botBrain.generateBotDawnReaction(room, bot, report);
    if (text) {
      postBotDayMessage(room, bot, text);
      return;
    }
  }
}

function scheduleBotDawnSkillReactions(room) {
  if (!hasBots(room) || !room.game?.lastNightReport) return;
  DAWN_SKILL_REACTION_SLOTS_MS.forEach((ms) => {
    scheduleRoomTask(room, () => runBotDawnSkillReaction(room), ms);
  });
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
        deliverSpyResult(room, bot, actions.spyTarget);
      }
    }
    if (bot.role === ROLE.POLICE && !actions.policeResolved) {
      if (!actions.policeTarget) {
        actions.policeTarget = pickBotNightActionTarget(room, bot, ROLE.POLICE);
      }
      if (actions.policeTarget && !actions.policeResolved) {
        deliverPoliceResult(room, bot, actions.policeTarget);
      }
    }
    if (bot.role === ROLE.DOCTOR && !actions.doctorTarget) {
      actions.doctorTarget = pickBotNightActionTarget(room, bot, ROLE.DOCTOR);
    }
    if (bot.role === ROLE.REPORTER && !bot.reporterUsed && !actions.reporterTarget && room.game.nightIndex >= 2) {
      actions.reporterTarget = pickBotNightActionTarget(room, bot, ROLE.REPORTER);
    }
    if (bot.role === ROLE.MEDIUM && !actions.mediumResolved && !actions.mediumTarget) {
      actions.mediumTarget = pickBotNightActionTarget(room, bot, ROLE.MEDIUM);
    }
    if (bot.role === ROLE.CULT_LEADER && m42Cult.canProselytizeTonight(room, bot)) {
      if (!actions.cultTarget) {
        actions.cultTarget = pickBotCultTarget(room, bot);
      }
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
  return Math.min(2, Math.floor(total / 6));
}

function assignRoles(playerIds) {
  const total = playerIds.length;
  const mafiaCount = getMafiaCount(total);
  const roles = [];

  for (let i = 0; i < mafiaCount; i++) roles.push(ROLE.MAFIA);
  if (total >= 9) roles.push(ROLE.SPY);

  const civilianPriority = [
    ROLE.POLICE, ROLE.DOCTOR, ROLE.SOLDIER, ROLE.POLITICIAN,
    ROLE.MEDIUM, ROLE.REPORTER, ROLE.GRAVEROBBER
  ];

  for (const role of civilianPriority) {
    if (roles.length < total) roles.push(role);
  }
  if (total >= 10 && roles.length < total) roles.push(ROLE.CULT_LEADER);
  while (roles.length < total) roles.push(ROLE.CITIZEN);

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
    p.joinedCult = p.role === ROLE.CULT_LEADER;
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
    mafiaVotes: {},
    firstNightDeathId: null,
    graverobberInherited: false,
    dawnAnnouncements: [],
    pendingAnnouncements: [],
    policeIntel: {},
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
    spyResolved: false,
    policeResolved: false,
    mediumResolved: false,
    cultTarget: null,
    cultResolved: false,
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

// ─── client state ─────────────────────────────────────────────────────────────

function toClientState(room, viewerUserId, opts = {}) {
  const includeChat = !!opts.includeChat;
  const viewer = getPlayerByUserId(room, viewerUserId);
  const viewerId = viewer ? viewer.id : null;

  const players = Object.values(room.players).map(p => {
    const base = {
      id: p.id,
      nickname: p.nickname,
      alive: p.alive,
      connected: p.connected,
      isHost: p.userID === room.hostUserId,
      isBot: !!p.isBot
    };
    if (room.phase === PHASE.LOBBY) return base;
    if (room.phase === PHASE.GAME_OVER) {
      return { ...base, role: p.role, roleLabel: ROLE_LABELS[p.role] };
    }
    if (p.id === viewerId) {
      return { ...base, role: p.role, roleLabel: ROLE_LABELS[p.role] };
    }
    if (viewer && isVisibleMafiaAlly(viewer, p)) {
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

  return {
    roomCode: room.code,
    phase: room.phase,
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
    cultResolved: !!(viewer && room.game?.nightActions?.cultResolved),
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
  if (isMafia) spy.joinedMafiaChat = true;
  if (isMafia) {
    emitMafiaTeamInfo(room, spy);
    for (const p of Object.values(room.players)) {
      if (isMafiaRole(p.role)) emitMafiaTeamInfo(room, p);
    }
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

function deliverReporterScoop(room, reporter, targetId) {
  const target = getPlayerById(room, targetId);
  if (!reporter || !target || reporter.reporterUsed) return;
  if (!room.game || room.game.nightIndex < 2) return;
  reporter.reporterUsed = true;
  room.pendingReporterRevealData = {
    targetId: target.id,
    targetName: target.nickname,
    role: target.role,
    roleLabel: ROLE_LABELS[target.role]
  };
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

function deliverMediumResult(room, medium, targetId) {
  const target = getPlayerById(room, targetId);
  if (!medium || !target || !medium.alive || target.alive) return;
  if (room.game?.nightActions?.mediumResolved) return;
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
  if (room.game && room.game.nightActions) room.game.nightActions.mediumResolved = true;
  if (medium.isBot) botLearnRole(room, medium.id, targetId, target.role);
}

function emitMotionToUser(userID, motion) {
  const sess = sessions.get(userID);
  if (sess && sess.socketId) io.to(sess.socketId).emit('gameMotion', motion);
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
  for (const motion of motions) {
    broadcastToRoom(room, 'skillNotice', {
      scope: 'public',
      kind: motion.type,
      title: motion.title || '밤 사건',
      message: motion.message || ''
    });
  }
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

  broadcastToRoom(room, 'phaseChanged', {
    phase,
    remainingMs: durationMs || 0,
    nightIndex: room.game ? room.game.nightIndex : 0,
    dayIndex: room.game ? room.game.dayIndex : 0
  });
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

  setPhase(room, PHASE.DAWN, TIMERS[PHASE.DAWN]);
  flushDawnMotions(room);
  room.pendingReporterMotion = null;
  broadcastAnimation(room, 'anim-dawn-rise');
}

function startDayChat(room) {
  const g = room.game;
  g.dayIndex += 1;
  g.chatSuspicion = { byPlayer: {}, keywords: [] };
  g.dayVotes = {};
  g.executionVotes = {};
  g.executionCandidateId = null;
  g.lastNightReport = buildLastNightReport(room);
  voteIntel.ingestFromNightReport(room, g.lastNightReport, botLearnRole);
  g.dawnAnnouncements = [];
  g._nightSummary = null;
  resetBotChatStats(room);
  clearBotChatTimers(room);
  const debateMs = computeDayChatDurationMs(room);
  setPhase(room, PHASE.DAY_CHAT, debateMs);
  scheduleBotDawnSkillReactions(room);
  scheduleBotDayChat(room);
  scheduleMafiaEarlyPoliceBluff(room);
  scheduleRoomTask(room, () => {
    const policeBot = Object.values(room.players).find(
      (p) => p.role === ROLE.POLICE && p.alive && p.isBot
    );
    if (policeBot && getPoliceIntelForReport(room, policeBot.id).length) {
      replyBotPoliceReport(room, policeBot);
    }
  }, 3500);
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

function resolveCultProselytize(room) {
  const g = room.game;
  const na = g?.nightActions;
  if (!na || na.cultResolved) return;

  const leader = Object.values(room.players).find(
    (p) => p.role === ROLE.CULT_LEADER && p.alive
  );
  if (!leader || !m42Cult.isOddProselytizeNight(room)) {
    na.cultResolved = true;
    return;
  }

  na.cultResolved = true;
  const targetId = na.cultTarget;
  if (!targetId) return;

  const target = getPlayerById(room, targetId);
  const valid = m42Cult.isValidProselytizeTarget(room, leader, target, {
    isMafiaTeam,
    isMafiaRole
  });

  if (!valid.ok) {
    if (valid.failType === 'mafia') {
      na.cultFailed = true;
      na.cultFailedTargetId = targetId;
      emitSkillNotice(leader.userID, {
        scope: 'private',
        kind: 'cult',
        title: '포교 실패',
        message: `${playerName(room, targetId)}님의 포교에 실패하였습니다. (마피아)`
      });
      console.log(`[NIGHT][CULT] proselytize FAIL mafia target=${playerName(room, targetId)}`);
    }
    return;
  }

  target.joinedCult = true;
  if (!g.cultProselytizedIds) g.cultProselytizedIds = [];
  if (!g.cultProselytizedIds.includes(target.id)) g.cultProselytizedIds.push(target.id);

  const roleLabel = ROLE_LABELS[target.role] || target.role;
  g.pendingAnnouncements.push('교주의 종소리가 울려퍼졌습니다.');
  emitMotionToUser(target.userID, {
    type: 'cult_proselytize',
    title: '포교',
    message: '교주에게 포교당했습니다. 이제 신도입니다.',
    situation: '[상황] 교주에게 포교당한 경우',
    duration: 4200
  });
  broadcastToRoom(room, 'gameMotion', {
    type: 'cult_proselytize',
    title: '종소리',
    message: '교주의 종소리가 울려퍼졌습니다.',
    situation: '[상황] 교주가 포교에 성공한 경우',
    duration: 3800
  }, (p) => p.userID !== target.userID);
  broadcastToRoom(room, 'skillNotice', {
    scope: 'public',
    kind: 'cult',
    title: '종소리',
    message: '교주의 종소리가 울려퍼졌습니다.'
  });
  emitSkillNotice(leader.userID, {
    scope: 'private',
    kind: 'cult',
    title: '포교 성공',
    message: `${target.nickname}님을 포교하였습니다. (직업: ${roleLabel})`
  });
  console.log(`[NIGHT][CULT] proselytize OK ${target.nickname} (${roleLabel})`);
}

function recordCultProselytize(room, socket, targetId) {
  if (!room || !room.game) return reject(socket, '방을 찾을 수 없습니다.');
  const player = getViewer(room, socket);
  if (!player || !player.alive || player.role !== ROLE.CULT_LEADER) {
    return reject(socket, '교주만 포교할 수 있습니다.');
  }
  if (room.phase !== PHASE.NIGHT) return reject(socket, '밤에만 가능합니다.');
  if (!m42Cult.canProselytizeTonight(room, player)) {
    return reject(socket, '이번 밤에는 포교할 수 없습니다. (홀수 밤만 가능)');
  }

  const target = getPlayerById(room, targetId);
  const valid = m42Cult.isValidProselytizeTarget(room, player, target, {
    isMafiaTeam,
    isMafiaRole
  });
  if (!valid.ok) return reject(socket, valid.message);

  room.game.nightActions.cultTarget = targetId;
  emitSkillNotice(player.userID, {
    scope: 'private',
    kind: 'cult',
    title: '포교 지목',
    message: `${playerName(room, targetId)}님을 포교 대상으로 정했습니다. 밤이 끝나면 처리됩니다.`
  });
  socket.emit('privateInfo', {
    type: 'actionConfirm',
    action: 'cult',
    targetId,
    targetName: playerName(room, targetId),
    message: `${playerName(room, targetId)}님에게 포교를 시도했습니다.`
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
    if (medium && !g.nightActions.mediumResolved) {
      g.nightActions.mediumResolved = true;
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
      else if (victim.role === ROLE.SPY) graverobber.joinedMafiaChat = !!victim.joinedMafiaChat;
      else graverobber.joinedMafiaChat = false;
      g.graverobberInherited = true;
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

  g._nightSummary = {
    deaths: [...deaths],
    healBlockedKill,
    soldierBlockedKill,
    soldierBlockTargetId: soldierBlockedKill ? killTarget : null,
    reporterReveal: room.pendingReporterRevealData
      ? { ...room.pendingReporterRevealData }
      : null,
    botActs: collectBotNightActs(room, g)
  };

  g.pendingAnnouncements = [];

  const win = checkWin(room);
  if (win) {
    endGame(room, win);
    return;
  }

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
    voterIds: voterMap[p.id] || []
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
    emitMafiaTeamInfo(room, player);
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

function recordMafiaVote(room, socket, targetId) {
  if (!room || !room.game) return reject(socket, '방을 찾을 수 없습니다.');
  const player = getViewer(room, socket);
  if (!player || !player.alive || player.role !== ROLE.MAFIA) return reject(socket, '마피아만 투표할 수 있습니다.');
  if (room.phase !== PHASE.NIGHT) return reject(socket, '밤에만 가능합니다.');
  const valid = validateNightTarget(room, player, targetId);
  if (!valid.ok) return reject(socket, valid.message);
  room.game.nightActions.mafiaVotes[player.id] = targetId;
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
  const valid = validateNightTarget(room, player, targetId, { allowSelf: true });
  if (!valid.ok) return reject(socket, valid.message);
  room.game.nightActions.doctorTarget = targetId;
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
  deliverReporterScoop(room, player, targetId);
}

function recordMediumPurify(room, socket, targetId) {
  if (!room || !room.game) return reject(socket, '방을 찾을 수 없습니다.');
  const player = getViewer(room, socket);
  if (!player || !player.alive || player.role !== ROLE.MEDIUM) return reject(socket, '영매만 성불할 수 있습니다.');
  if (room.phase !== PHASE.NIGHT) return reject(socket, '밤에만 가능합니다.');
  if (room.game.nightActions.mediumResolved) return reject(socket, '이번 밤에는 이미 성불했습니다.');
  const deadCount = Object.values(room.players).filter((p) => !p.alive).length;
  if (!deadCount) return reject(socket, '성불할 사망자가 없습니다. (이번 밤에 죽은 사람은 다음 낮부터 성불할 수 있습니다.)');
  const valid = validateNightTarget(room, player, targetId, { aliveOnly: false, deadOnly: true });
  if (!valid.ok) return reject(socket, valid.message);
  room.game.nightActions.mediumTarget = targetId;
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
    if (player.role === ROLE.POLICE && policeFmt.looksLikePoliceReport(msg.text)) {
      notePublicPoliceClaim(room, player.id);
      voteIntel.publishPoliceIntelToPublic(room);
      if (voteIntel.ingestPoliceReportsFromDayChat) {
        voteIntel.ingestPoliceReportsFromDayChat(room, voteFactHelpers);
      }
      scheduleMafiaMatgyeongAfterReport(room, player.id);
    }
    const timeAdj = parseTimeAdjustRequest(msg.text);
    if (timeAdj && hasBots(room)) {
      scheduleBotTimeAdjustReaction(room, timeAdj);
    }
    if (isMediumPurifyRequest(msg.text)) {
      handleMediumPurifyChatRequest(room);
    } else if (isPoliceReportRequest(msg.text)) {
      handlePoliceReportRequest(room, player);
    } else if (hasBots(room) && !player.isBot) {
      scheduleBotReplyToHuman(room, { triggerText: msg.text });
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
    emitMafiaTeamInfoToAll(room);
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
  console.log('  Stability patch: 2026-05-15w (lobby reconnect, chat suspicion)');
});
