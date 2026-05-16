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
  const filename = `${role}.png`;
  const candidates = [
    path.join(__dirname, 'public', 'assets', 'roles', filename),
    path.join(__dirname, 'assets', 'roles', filename)
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const ROLE_ASSET_NAMES = [
  'mafia', 'spy', 'citizen', 'police', 'doctor',
  'soldier', 'politician', 'medium', 'reporter', 'graverobber'
];

const MOTION_ASSET_NAMES = [
  'vote_execution.png', 'vote_rejected.png', 'quiet_night.png', 'mafia_kill.png',
  'doctor_heal.png', 'soldier_block.png', 'police_mafia.png', 'police_innocent.png',
  'spy_contact.png', 'spy_investigate.png', 'politician_immunity.png',
  'reporter_scoop.png', 'graverobber_inherit.png'
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
  }

  let motionsCopied = 0;
  for (const name of MOTION_ASSET_NAMES) {
    const dst = path.join(motionDstDir, name);
    const sources = [
      path.join(__dirname, 'assets', 'motions', name),
      path.join(__dirname, 'assets', name)
    ];
    for (const src of sources) {
      if (copyIfExists(src, dst)) { motionsCopied++; break; }
    }
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
  if (!file) return next();
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
  GRAVEROBBER: 'graverobber'
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
  [ROLE.GRAVEROBBER]: '도굴꾼'
};

// ─── global state ─────────────────────────────────────────────────────────────

const rooms = new Map();
const sessions = new Map();

app.get('/health', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ok: true,
    service: 'mafia-game',
    stability: '2026-05-15a',
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
  if (room.phase === PHASE.DAY_CHAT) {
    pushChat(room, 'day', deadMsg);
    broadcastToRoom(room, 'chatMessage', { channel: 'day', ...deadMsg });
    return;
  }
  broadcastToRoom(room, 'chatMessage', { channel: 'dead', ...deadMsg }, canReceiveDeadChat);
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
  if (!room || !room.game || room.botChatInFlight) return false;
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

function bumpRoomTaskGeneration(room) {
  if (!room) return;
  if (room._broadcastStateTimer) {
    clearTimeout(room._broadcastStateTimer);
    room._broadcastStateTimer = null;
  }
  clearBotChatTimers(room);
  room.taskGeneration = (room.taskGeneration || 0) + 1;
  room.botActionGeneration = (room.botActionGeneration || 0) + 1;
  room.resolvingDayVote = false;
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
  return /직공|직업공개|직업ㄱㅇ|홀경|홀의|홀군|직적/.test(c);
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

  const parts = [];
  for (const row of intel) {
    const t = getPlayerById(room, row.targetId);
    const name = (t && t.nickname) || row.targetName;
    if (!name || String(name).trim() === '?' || String(name).trim() === '') continue;
    if (row.isMafia) parts.push(`${name}님은 마피아입니다`);
    else parts.push(`${name}님은 마피아가 아닙니다`);
  }
  if (!parts.length) {
    return { police, hasIntel: false, text: null };
  }

  return {
    police,
    hasIntel: true,
    text: `수사 결과입니다. ${parts.join('. ')}.`
  };
}

function postPolicePublicReport(room, policeIdOptional, opts = {}) {
  if (room.phase !== PHASE.DAY_CHAT || !room.game) return;
  const report = buildPolicePublicReport(room, policeIdOptional);
  if (!report || !report.police) return;

  if (!report.hasIntel) {
    if (opts.silentIfNoIntel) return;
    const text = '조결 요청입니다. 아직 이번 밤에 수사한 기록이 없습니다. 밤에 대상을 지목한 뒤 다시 조결해 주세요.';
    const msg = {
      from: report.police.nickname,
      fromId: report.police.id,
      text,
      time: Date.now()
    };
    pushChat(room, 'day', msg);
    broadcastToRoom(room, 'chatMessage', { channel: 'day', ...msg });
    notePublicPoliceClaim(room, report.police.id);
    console.log(`[POLICE] public report (no intel) by ${report.police.nickname}`);
    return;
  }

  const msg = {
    from: report.police.nickname,
    fromId: report.police.id,
    text: report.text,
    time: Date.now()
  };
  pushChat(room, 'day', msg);
  broadcastToRoom(room, 'chatMessage', { channel: 'day', ...msg });
  notePublicPoliceClaim(room, report.police.id);
  voteIntel.publishPoliceIntelToPublic(room);
  console.log(`[POLICE] public report by ${report.police.nickname} intel=true`);
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

/** 경조결 요청: 인간 경찰은 무기록 멘트를 낮 채팅에 올리지 않음 */
function handlePoliceReportRequest(room, requester) {
  if (!room.game || room.phase !== PHASE.DAY_CHAT) return;
  const policeList = Object.values(room.players).filter(
    (p) => p.role === ROLE.POLICE && p.alive
  );
  if (!policeList.length) {
    pushGameSystemMessage(room, '생존 경찰이 없어 조결을 받을 수 없습니다.');
    return;
  }

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
  aliveOthers.forEach(p => { scores[p.id] = 1; });

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

  if (voter.isBot && !skipBotHumanBias) {
    const botOthers = aliveOthers.filter(p => p.isBot);
    const humanOthers = aliveOthers.filter(p => !p.isBot);

    for (const p of humanOthers) {
      scores[p.id] = Math.max(1, (scores[p.id] || 0) - 3);
    }
    for (const p of botOthers) {
      scores[p.id] = (scores[p.id] || 0) + 2 + Math.floor(Math.random() * 4);
    }

    const pileOn = {};
    for (const msg of dayChat.slice(-12)) {
      if (msg.system || !msg.text || !msg.fromId) continue;
      const speaker = getPlayerById(room, msg.fromId);
      if (!speaker || !speaker.isBot) continue;
      if (!CHAT_ACCUSE_PATTERNS.some((re) => re.test(msg.text))) continue;
      for (const id of findPlayersMentionedInText(room, msg.text)) {
        if (id !== voter.id) pileOn[id] = (pileOn[id] || 0) + 1;
      }
    }
    for (const [id, n] of Object.entries(pileOn)) {
      if (n >= 2) scores[id] = Math.max(0, (scores[id] || 0) - 6);
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
    if (!isMafiaTeam(bot.role) && room.game?.publicPoliceClaimIds?.[factTarget]) {
      return bot.id;
    }
    return factTarget;
  }
  return bot.id;
}

function pickBotExecutionVoteFromFacts(room, bot, candidate) {
  return voteFacts.pickFactBasedExecutionVote(room, bot, candidate, voteFactHelpers);
}

const voteFactHelpers = {
  isMafiaTeam,
  isMafiaRole,
  getPlayerById,
  getBotMind
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

function pickBotNightActionTarget(room, bot, role) {
  switch (role) {
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

function runBotDayVotes(room) {
  if (room.phase !== PHASE.DAY_VOTE || !room.game) return;
  const bots = getBots(room).filter(p => p.alive);
  let voted = 0;
  for (const bot of bots) {
    if (applyBotDayVote(room, bot)) voted++;
  }
  if (voted > 0) broadcastState(room);
}

function scheduleBotDayVotes(room) {
  if (!hasBots(room)) return;
  scheduleRoomTask(room, () => runBotDayVotes(room), 5000);
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
  text = safe;
  const msg = { from: bot.nickname, fromId: bot.id, text, time: Date.now() };
  if (isPoliceSelfClaim(text) || (bot.role === ROLE.POLICE && /수사\s*결과/.test(text))) {
    notePublicPoliceClaim(room, bot.id);
  }
  pushChat(room, 'day', msg);
  broadcastToRoom(room, 'chatMessage', { channel: 'day', ...msg });
  recordBotChat(room);
  console.log(`[BOT] ${bot.nickname} day-chat: ${text.slice(0, 40)}`);
}

async function runBotDayChat(room, ctx = {}) {
  if (room.phase !== PHASE.DAY_CHAT || !room.game) return;
  if (!canBotChatNow(room)) return;

  const bots = getBots(room).filter(p => p.alive);
  if (!bots.length) return;

  room.botChatInFlight = true;
  try {
    let bot;
    const trigger = ctx.triggerText || '';
    if (ctx.policeReport && isPoliceReportRequest(trigger)) {
      bot = bots.find((p) => p.role === ROLE.POLICE)
        || bots.find((p) => p.role !== ROLE.POLICE);
    } else {
      bot = shuffle(bots)[0];
    }
    const text = await botBrain.generateBotChat(room, bot, ctx);
    if (!text) return;
    postBotDayMessage(room, bot, text);
  } catch (err) {
    console.warn('[BOT] day-chat error', err.message);
  } finally {
    room.botChatInFlight = false;
  }
}

function scheduleBotReplyToHuman(room, opts = {}) {
  if (!hasBots(room) || room.phase !== PHASE.DAY_CHAT) return;
  if (room._botHumanReplyTimer) clearTimeout(room._botHumanReplyTimer);
  const triggerText = opts.triggerText || '';
  const policeReport = !!opts.policeReport || isPoliceReportRequest(triggerText);
  const delay = policeReport ? 2200 : BOT_CHAT.HUMAN_REPLY_WAIT_MS;
  room._botHumanReplyTimer = setTimeout(() => {
    room._botHumanReplyTimer = null;
    if (room.phase !== PHASE.DAY_CHAT) return;
    runBotDayChat(room, { triggerText, policeReport });
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

  const mafiaBots = bots.filter(p => p.role === ROLE.MAFIA);
  if (mafiaBots.length) {
    const killTarget = pickBotNightActionTarget(room, mafiaBots[0], ROLE.MAFIA);
    mafiaBots.forEach(m => { if (killTarget) actions.mafiaVotes[m.id] = killTarget; });
  }

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
    if (bot.role === ROLE.MEDIUM && !actions.mediumTarget) {
      actions.mediumTarget = pickBotNightActionTarget(room, bot, ROLE.MEDIUM);
    }
  }
  console.log(`[BOT] smart night actions (${bots.length} bots)`);
}

function scheduleBotNightActions(room) {
  if (!hasBots(room)) return;
  scheduleRoomTask(room, () => runBotNightActions(room), 5000);
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
    chatLog: { lobby: [], day: [], mafia: [], dead: [], lastWords: [] },
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
    publicPoliceClaimIds: {}
  };
  room.chatLog = { lobby: [], day: [], mafia: [], dead: [], lastWords: [] };
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
    mediumResolved: false
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
  const aliveMafiaTeam = alive.filter(p => isMafiaTeam(p.role));
  const aliveCitizenTeam = alive.filter(p => !isMafiaTeam(p.role));

  if (aliveMafiaTeam.length === 0) {
    return { winner: 'citizens', message: '시민 팀 승리! 마피아 팀이 모두 제거되었습니다.' };
  }
  if (aliveMafiaTeam.length >= aliveCitizenTeam.length) {
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
    reporterUsed: viewer ? viewer.reporterUsed : false,
    spyResolved: !!(viewer && room.game && room.game.nightActions && room.game.nightActions.spyResolved),
    policeResolved: !!(viewer && room.game && room.game.nightActions && room.game.nightActions.policeResolved),
    mediumResolved: !!(viewer && room.game && room.game.nightActions && room.game.nightActions.mediumResolved),
    joinedMafiaChat: viewer ? viewer.joinedMafiaChat : false,
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
      ? getMergedDayChatLog(room).slice(-STATE_SYNC_CHAT_LIMIT)
      : undefined,
    deadChat: includeChat && viewer && room.game && canReceiveDeadChat(viewer)
      ? room.chatLog.dead.slice(-STATE_SYNC_CHAT_LIMIT)
      : undefined,
    mafiaChat: includeChat && viewer && room.game && viewer.alive
      && (viewer.role === ROLE.MAFIA || viewer.joinedMafiaChat)
      ? room.chatLog.mafia.slice(-STATE_SYNC_CHAT_LIMIT)
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
    const candidate = getPlayerById(room, g.executionCandidateId);
    bots.forEach((bot) => {
      if (bot.id === g.executionCandidateId) return;
      if (g.executionVotes[bot.id]) return;
      if (candidate) {
        g.executionVotes[bot.id] = botBrain.pickBotExecutionVote(room, bot, candidate);
      }
    });
    console.log('[BOT] execution votes applied (m42)');
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
  if (room.phaseTimer || room.phaseAdvancing || room.resolvingDayVote) return;
  if (room.game && room.game.winner) return;
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
}

function setPhase(room, phase, durationMs) {
  clearPhaseTimer(room);
  bumpRoomTaskGeneration(room);
  room.botActionGeneration = (room.botActionGeneration || 0) + 1;
  room.phase = phase;
  room.botChatInFlight = false;
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

function startExecutionVote(room) {
  room.game.executionVotes = {};
  setPhase(room, PHASE.EXECUTION_VOTE, TIMERS[PHASE.EXECUTION_VOTE]);
  broadcastAnimation(room, 'anim-execution');
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

// ─── night resolver ─────────────────────────────────────────────────────────────

function getMafiaKillTarget(room) {
  const mafiaAlive = getAlivePlayers(room).filter((p) => p.role === ROLE.MAFIA);
  const votes = room.game.nightActions.mafiaVotes || {};

  if (mafiaAlive.length >= 2) {
    const allVoted = mafiaAlive.every((m) => votes[m.id]);
    if (!allVoted) {
      console.log('[NIGHT][3-Kill] mafia unanimous required — not all voted yet');
      return null;
    }
    const targets = mafiaAlive.map((m) => votes[m.id]);
    const unique = [...new Set(targets)];
    if (unique.length !== 1) {
      console.log('[NIGHT][3-Kill] mafia votes split — no kill');
      return null;
    }
    return unique[0];
  }

  const tally = {};
  for (const targetId of Object.values(votes)) {
    if (!targetId) continue;
    tally[targetId] = (tally[targetId] || 0) + 1;
  }
  let max = 0;
  let candidates = [];
  for (const [id, count] of Object.entries(tally)) {
    if (count > max) { max = count; candidates = [id]; }
    else if (count === max) candidates.push(id);
  }
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) return candidates[Math.floor(Math.random() * candidates.length)];
  return null;
}

function resolveNight(room) {
  const g = room.game;
  const deaths = [];
  room.pendingMotions = room.pendingMotions || [];

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

const VOTE_RESULTS_DISPLAY_MS = 4500;

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
  if (room.resolvingDayVote) return;
  if (!isActiveGame(room)) return;
  room.resolvingDayVote = true;

  const results = buildDayVoteResults(room);
  broadcastToRoom(room, 'dayVoteResults', results);

  scheduleRoomTask(room, () => {
    room.resolvingDayVote = false;
    if (!isActiveGame(room) || room.phase !== PHASE.DAY_VOTE) return;
    proceedDayVoteAfterResults(room, results);
  }, VOTE_RESULTS_DISPLAY_MS);
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
  const player = (sess.playerId && room.players[sess.playerId])
    || getPlayerByUserId(room, socket.userID);
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

    if (room.phase !== PHASE.LOBBY && room.phase !== PHASE.GAME_OVER) {
      console.log(`[SESSION] userID=${userID} offline during game, slot kept`);
      return;
    }

    delete room.players[player.id];
    if (room.hostUserId === userID) {
      const remaining = Object.values(room.players);
      if (remaining.length > 0) room.hostUserId = remaining[0].userID;
    }
    if (Object.keys(room.players).length === 0) {
      rooms.delete(room.code);
    } else {
      broadcastState(room);
    }
    console.log(`[SESSION] userID=${userID} removed after grace period`);
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
  emitSkillNotice(player.userID, {
    scope: 'private',
    kind: 'mafia',
    title: '암살 투표',
    message: `${playerName(room, targetId)}님을 지목했습니다.`
  });
  socket.emit('privateInfo', { type: 'actionConfirm', action: 'mafia', targetId, targetName: playerName(room, targetId) });
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
  broadcastState(room);
}

// ─── chat ─────────────────────────────────────────────────────────────────────

function pushChat(room, channel, entry) {
  if (!room.chatLog[channel]) room.chatLog[channel] = [];
  room.chatLog[channel].push(entry);
  if (room.chatLog[channel].length > 200) room.chatLog[channel].shift();
}

function getMergedDayChatLog(room) {
  const day = room.chatLog.day || [];
  const dead = room.chatLog.dead || [];
  const keys = new Set(day.map(m => `${m.time}|${m.fromId}|${m.text}`));
  const merged = [...day];
  for (const m of dead) {
    const key = `${m.time}|${m.fromId}|${m.text}`;
    if (keys.has(key)) continue;
    keys.add(key);
    merged.push({ ...m, isDead: true });
  }
  return merged.sort((a, b) => (a.time || 0) - (b.time || 0));
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
  const msg = { from: player.nickname, fromId: player.id, text: String(text).trim(), time: Date.now() };

  if (channel === 'lobby') {
    if (room.phase !== PHASE.LOBBY) return reject(socket, '로비에서만 사용할 수 있습니다.');
    pushChat(room, 'lobby', msg);
    broadcastToRoom(room, 'chatMessage', { channel: 'lobby', ...msg });
  } else if (channel === 'day') {
    if (![PHASE.DAY_CHAT].includes(room.phase) || !player.alive) {
      return reject(socket, '낮 채팅 시간이 아니거나 사망했습니다.');
    }
    pushChat(room, 'day', msg);
    broadcastToRoom(room, 'chatMessage', { channel: 'day', ...msg });
    if (isPoliceSelfClaim(msg.text)) {
      notePublicPoliceClaim(room, player.id);
    }
    if (isPoliceReportRequest(msg.text)) {
      handlePoliceReportRequest(room, player);
    } else if (hasBots(room) && !player.isBot) {
      scheduleBotReplyToHuman(room, { triggerText: msg.text });
    }
  } else if (channel === 'mafia') {
    if (room.phase !== PHASE.NIGHT || !player.alive) return reject(socket, '마피아 채팅 불가');
    if (player.role !== ROLE.MAFIA && !player.joinedMafiaChat) return reject(socket, '권한 없음');
    pushChat(room, 'mafia', msg);
    broadcastToRoom(room, 'chatMessage', { channel: 'mafia', ...msg }, p => p.alive && (p.role === ROLE.MAFIA || p.joinedMafiaChat));
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
      soldierShieldUsed: false, reporterUsed: false, joinedMafiaChat: false, disconnectTimer: null,
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
  console.log('  Stability patch: 2026-05-14b (light stateSync, rate limits)');
});
