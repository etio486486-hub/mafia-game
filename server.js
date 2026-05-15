const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { randomUUID } = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs');
const botBrain = require('./lib/bot-brain');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  pingInterval: 25000,
  pingTimeout: 60000,
  cors: { origin: '*' },
  transports: ['polling', 'websocket']
});

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

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'mafia-game', botAi: botBrain.getStatus() });
});

app.get('/api/info', (req, res) => {
  res.json(buildServerInfo(req));
});
const MIN_PLAYERS = 8;
const MAX_PLAYERS = 12;
const GRACE_PERIOD_MS = 60000;
const TIME_ADJUST_MS = 10000;
const MIN_PHASE_REMAINING_MS = 5000;

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
  [PHASE.NIGHT]: 30000,
  [PHASE.DAY_CHAT]: 120000,
  [PHASE.DAY_VOTE]: 15000,
  [PHASE.LAST_WORDS]: 10000,
  [PHASE.EXECUTION_VOTE]: 10000,
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

function bumpRoomTaskGeneration(room) {
  if (!room) return;
  room.taskGeneration = (room.taskGeneration || 0) + 1;
  room.botActionGeneration = (room.botActionGeneration || 0) + 1;
  room.resolvingDayVote = false;
}

function scheduleRoomTask(room, fn, delayMs) {
  if (!room) return;
  const gen = (room.taskGeneration || 0) + 1;
  room.taskGeneration = gen;
  setTimeout(() => {
    if (!rooms.has(room.code)) return;
    if (room.taskGeneration !== gen) return;
    try {
      fn();
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
    minds[botId] = { knownRoles: {}, trust: {}, accused: {} };
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

function findPlayersMentionedInText(room, text) {
  if (!text) return [];
  const mentioned = [];
  const sorted = Object.values(room.players).sort((a, b) => b.nickname.length - a.nickname.length);
  for (const p of sorted) {
    if (p.nickname && text.includes(p.nickname)) mentioned.push(p.id);
  }
  return mentioned;
}

function buildSuspicionScores(room, voter) {
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
    const voteTally = {};
    for (const targetId of Object.values(g.dayVotes)) {
      if (!targetId) continue;
      voteTally[targetId] = (voteTally[targetId] || 0) + 1;
    }
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

function pickTopSuspect(room, bot, { excludeMafiaTeam = false } = {}) {
  const scores = buildSuspicionScores(room, bot);
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
  const fromChat = pickTopSuspect(room, bot, { excludeMafiaTeam: isMafiaTeam(bot.role) });
  if (fromChat) return fromChat;
  if (isMafiaTeam(bot.role)) return pickRandomTarget(room, bot, { excludeMafiaTeam: true });
  return pickRandomTarget(room, bot);
}

botBrain.configure({
  ROLE_LABELS,
  isMafiaTeam,
  isMafiaRole,
  getPlayerById,
  getAlivePlayers,
  getChatMessages,
  buildSuspicionScores,
  pickBotDayVoteTarget,
  getBotMind
});

function pickBotKillTarget(room, mafiaBot) {
  const scores = buildSuspicionScores(room, mafiaBot);
  for (const p of getAlivePlayers(room)) {
    if (isMafiaTeam(p.role)) scores[p.id] = 0;
    if ([ROLE.POLICE, ROLE.DOCTOR, ROLE.REPORTER].includes(p.role)) {
      scores[p.id] = (scores[p.id] || 0) + 5;
    }
  }
  return pickWeightedFromScores(scores, [mafiaBot.id]) || pickRandomTarget(room, mafiaBot, { excludeMafiaTeam: true });
}

function pickBotHealTarget(room, doctorBot) {
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

function pickBotInvestigateTarget(room, investigator) {
  return pickTopSuspect(room, investigator) || pickRandomTarget(room, investigator);
}

function pickBotNightActionTarget(room, bot, role) {
  switch (role) {
    case ROLE.MAFIA:
      return pickBotKillTarget(room, bot);
    case ROLE.DOCTOR:
      return pickBotHealTarget(room, bot);
    case ROLE.POLICE:
    case ROLE.SPY:
    case ROLE.REPORTER:
      return pickBotInvestigateTarget(room, bot);
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
  [1000, 3500, 7000, 11000].forEach((ms) => {
    scheduleRoomTask(room, () => runBotDayVotes(room), ms);
  });
}

async function runBotDayChat(room) {
  if (room.phase !== PHASE.DAY_CHAT || !room.game) return;
  if (room.botChatInFlight) return;
  const bots = getBots(room).filter(p => p.alive);
  if (!bots.length || Math.random() > 0.55) return;

  const bot = bots[Math.floor(Math.random() * bots.length)];
  room.botChatInFlight = true;
  try {
    const text = await botBrain.generateBotChat(room, bot);
    if (!text || room.phase !== PHASE.DAY_CHAT) return;

    const msg = { from: bot.nickname, fromId: bot.id, text, time: Date.now() };
    pushChat(room, 'day', msg);
    broadcastToRoom(room, 'chatMessage', { channel: 'day', ...msg });
    console.log(`[BOT] ${bot.nickname} day-chat: ${text.slice(0, 40)}`);
  } catch (err) {
    console.warn('[BOT] day-chat error', err.message);
  } finally {
    room.botChatInFlight = false;
  }
}

function scheduleBotDayChat(room) {
  if (!hasBots(room)) return;
  const duration = TIMERS[PHASE.DAY_CHAT];
  const slots = [12000, 28000, 50000, 75000, 95000].filter(ms => ms < duration - 8000);
  slots.forEach((ms) => {
    scheduleRoomTask(room, () => runBotDayChat(room), ms);
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
    if (bot.role === ROLE.SPY && !actions.spyTarget) {
      actions.spyTarget = pickBotNightActionTarget(room, bot, ROLE.SPY);
    }
    if (bot.role === ROLE.POLICE && !actions.policeTarget) {
      actions.policeTarget = pickBotNightActionTarget(room, bot, ROLE.POLICE);
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
  broadcastState(room);
}

function scheduleBotNightActions(room) {
  if (!hasBots(room)) return;
  [2000, 8000, 18000, 24000].forEach((ms) => {
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
    p.joinedMafiaChat = p.role === ROLE.SPY;
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
    pendingAnnouncements: []
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

function toClientState(room, viewerUserId) {
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
    return base;
  });

  const remaining = room.phaseEndsAt ? Math.max(0, room.phaseEndsAt - Date.now()) : 0;

  return {
    roomCode: room.code,
    phase: room.phase,
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
    myExecutionVote: viewer && room.game && room.game.executionVotes[viewerId] ? room.game.executionVotes[viewerId] : null,
    myPlayerId: viewerId,
    myRole: viewer ? viewer.role : null,
    myRoleLabel: viewer && viewer.role ? ROLE_LABELS[viewer.role] : null,
    reporterUsed: viewer ? viewer.reporterUsed : false,
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
    lobbyChat: room.phase === PHASE.LOBBY ? room.chatLog.lobby : null,
    dayChat: room.phase !== PHASE.LOBBY && room.game ? room.chatLog.day : null,
    deadChat: viewer && room.game && (!viewer.alive || viewer.role === ROLE.MEDIUM)
      ? room.chatLog.dead
      : null,
    mafiaChat: viewer && room.game && viewer.alive && (viewer.role === ROLE.MAFIA || viewer.joinedMafiaChat)
      ? room.chatLog.mafia
      : null,
    lastWordsChat: room.game ? room.chatLog.lastWords : null
  };
}

function broadcastState(room) {
  ensurePhaseTimer(room);
  for (const p of Object.values(room.players)) {
    if (!p.connected) continue;
    const sess = sessions.get(p.userID);
    if (!sess || !sess.socketId) continue;
    io.to(sess.socketId).emit('stateSync', toClientState(room, p.userID));
  }
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
  if (police.isBot) botLearnRole(room, police.id, targetId, target.role);
}

function deliverSpyResult(room, spy, targetId) {
  const target = getPlayerById(room, targetId);
  if (!spy || !target || !spy.alive) return;
  const resultRole = target.role;
  const isMafia = isMafiaRole(resultRole);
  if (isMafia) spy.joinedMafiaChat = true;
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
    bots.forEach(bot => {
      if (bot.id === g.executionCandidateId) return;
      if (g.executionVotes[bot.id]) return;
      const votedForCandidate = g.dayVotes[bot.id] === g.executionCandidateId;
      const suspect = buildSuspicionScores(room, bot);
      const candidateScore = suspect[g.executionCandidateId] || 0;
      if (votedForCandidate || candidateScore >= 4) {
        g.executionVotes[bot.id] = 'yes';
      } else if (candidateScore <= 1 && Math.random() < 0.55) {
        g.executionVotes[bot.id] = 'no';
      } else {
        g.executionVotes[bot.id] = Math.random() < 0.55 ? 'yes' : 'no';
      }
    });
    console.log('[BOT] execution votes applied');
  }

  if (room.phase === PHASE.LAST_WORDS) {
    if (room.botLastWordsSent) return;
    const candidate = getPlayerById(room, g.executionCandidateId);
    if (candidate && candidate.isBot) {
      room.botLastWordsSent = true;
      const lines = isMafiaTeam(candidate.role)
        ? ['저는 일반 시민입니다… 오해입니다!', '누명이에요! 다른 사람을 봐주세요.', '제가 마피아일 리가 없잖아요!']
        : ['저는 억울합니다…', '잘못된 지목입니다!', '다시 생각해보세요, 저는 시민이에요.'];
      const text = lines[Math.floor(Math.random() * lines.length)];
      const msg = { from: candidate.nickname, fromId: candidate.id, text, time: Date.now() };
      pushChat(room, 'lastWords', msg);
      broadcastToRoom(room, 'chatMessage', { channel: 'lastWords', ...msg });
    }
  }

  broadcastState(room);
}

function scheduleBotActions(room, durationMs) {
  if (!hasBots(room) || !room.game) return;
  const gen = room.botActionGeneration;
  const runIfCurrent = () => {
    if (room.botActionGeneration !== gen) return;
    if (!isActiveGame(room)) return;
    runBotActions(room);
  };
  setTimeout(runIfCurrent, 800);
  if (durationMs > 5000) {
    setTimeout(runIfCurrent, Math.floor(durationMs * 0.6));
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
  room.botActionGeneration = (room.botActionGeneration || 0) + 1;
  room.phase = phase;
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
  room.game.dayIndex += 1;
  room.game.dayVotes = {};
  room.game.executionVotes = {};
  room.game.executionCandidateId = null;
  room.game.dawnAnnouncements = [];
  setPhase(room, PHASE.DAY_CHAT, TIMERS[PHASE.DAY_CHAT]);
  scheduleBotDayChat(room);
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
  const votes = room.game.nightActions.mafiaVotes;
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
        target.alive = false;
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
      g.nightActions.spyResolved = true;
      deliverSpyResult(room, spy, spyTarget);
    }
  }

  const policeTarget = g.nightActions.policeTarget;
  if (policeTarget) {
    const police = Object.values(room.players).find(p => p.role === ROLE.POLICE && p.alive);
    if (police && !g.nightActions.policeResolved) {
      g.nightActions.policeResolved = true;
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
      graverobber.joinedMafiaChat = isMafiaRole(victim.role) ? false : graverobber.joinedMafiaChat;
      if (victim.role === ROLE.SPY) graverobber.joinedMafiaChat = true;
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
  const tally = {};
  const voterMap = {};
  for (const [voterId, targetId] of Object.entries(votes)) {
    if (!targetId) continue;
    tally[targetId] = (tally[targetId] || 0) + 1;
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
    emitMotion(room, {
      type: 'vote_tie',
      title: '투표 부결',
      message: results.tie
        ? '처형될 사람을 찾지 못하였습니다. (동점)'
        : '처형될 사람을 찾지 못하였습니다.',
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
    else if (v === 'no') no++;
  }

  const majority = Math.floor(voters.length / 2) + 1;
  const executed = yes >= majority;

  console.log(`[EXECUTION] candidate=${candidate.nickname} yes=${yes} no=${no} need=${majority} -> ${executed ? 'EXECUTED' : 'SPARED'}`);

  if (executed) {
    candidate.alive = false;
    room.game.pendingAnnouncements = [`${candidate.nickname}님이 처형되었습니다.`];
    emitMotion(room, {
      type: 'vote_execution',
      title: '투표 처형',
      message: `${candidate.nickname}님이 투표로 처형당하였습니다.`,
      situation: '[상황] 찬성 과반으로 처형이 확정된 경우'
    });
    broadcastAnimation(room, 'anim-mafia-kill');
  } else {
    emitMotion(room, {
      type: 'vote_rejected',
      title: '투표 부결',
      message: `${candidate.nickname} 님의 처형이 부결되었습니다.`,
      situation: '[상황] 찬성이 과반에 미달한 경우'
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

function attachSession(socket, userID, nickname) {
  const existing = sessions.get(userID);
  if (existing && existing.socketId && existing.socketId !== socket.id) {
    io.to(existing.socketId).emit('sessionTaken', { message: '다른 기기에서 접속하여 연결이 종료됩니다.' });
    const oldSocket = io.sockets.sockets.get(existing.socketId);
    if (oldSocket && oldSocket.connected) oldSocket.disconnect(true);
  }

  sessions.set(userID, {
    userID,
    nickname,
    socketId: socket.id,
    roomCode: existing ? existing.roomCode : null,
    playerId: existing ? existing.playerId : null
  });
  socket.userID = userID;
  socket.nickname = nickname;
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
      broadcastState(room);
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

  broadcastState(room);
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
  }
  socket.emit('stateSync', toClientState(room, socket.userID));
  socket.emit('joinResult', { ok: true });
  broadcastState(room);
  console.log(`[SESSION] userID=${socket.userID} reconnected to room ${room.code}`);
}

// ─── action validators ─────────────────────────────────────────────────────────

function getViewer(room, socket) {
  if (!room || !socket) return null;
  return getPlayerByUserId(room, socket.userID);
}

function reject(socket, msg) {
  socket.emit('error', { message: msg });
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
  const valid = validateNightTarget(room, player, targetId);
  if (!valid.ok) return reject(socket, valid.message);
  room.game.nightActions.spyTarget = targetId;
  deliverSpyResult(room, player, targetId);
}

function recordPoliceInvestigate(room, socket, targetId) {
  if (!room || !room.game) return reject(socket, '방을 찾을 수 없습니다.');
  const player = getViewer(room, socket);
  if (!player || !player.alive || player.role !== ROLE.POLICE) return reject(socket, '경찰만 조사할 수 있습니다.');
  if (room.phase !== PHASE.NIGHT) return reject(socket, '밤에만 가능합니다.');
  const valid = validateNightTarget(room, player, targetId);
  if (!valid.ok) return reject(socket, valid.message);
  room.game.nightActions.policeTarget = targetId;
  deliverPoliceResult(room, player, targetId);
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
  const valid = validateNightTarget(room, player, targetId, { aliveOnly: false, deadOnly: true });
  if (!valid.ok) return reject(socket, valid.message);
  room.game.nightActions.mediumTarget = targetId;
  deliverMediumResult(room, player, targetId);
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
  } else if (channel === 'mafia') {
    if (room.phase !== PHASE.NIGHT || !player.alive) return reject(socket, '마피아 채팅 불가');
    if (player.role !== ROLE.MAFIA && !player.joinedMafiaChat) return reject(socket, '권한 없음');
    pushChat(room, 'mafia', msg);
    broadcastToRoom(room, 'chatMessage', { channel: 'mafia', ...msg }, p => p.alive && (p.role === ROLE.MAFIA || p.joinedMafiaChat));
  } else if (channel === 'dead') {
    if (player.alive) return reject(socket, '사망자만 대화할 수 있습니다.');
    pushChat(room, 'dead', msg);
    broadcastToRoom(room, 'chatMessage', { channel: 'dead', ...msg }, p => !p.alive);
  } else if (channel === 'lastWords') {
    if (room.phase !== PHASE.LAST_WORDS) return reject(socket, '최후의 반론 시간이 아닙니다.');
    if (player.id !== room.game.executionCandidateId) return reject(socket, '최다 득표자만 발언할 수 있습니다.');
    pushChat(room, 'lastWords', msg);
    broadcastToRoom(room, 'chatMessage', { channel: 'lastWords', ...msg });
  }
}

// ─── socket handlers ────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  socket.on('join', ({ userID, nickname, roomCode }) => {
    if (!userID || !nickname) return reject(socket, 'userID와 닉네임이 필요합니다.');
    attachSession(socket, userID, nickname);

    const code = roomCode ? String(roomCode).trim().toUpperCase() : '';
    if (!code) {
      socket.emit('stateSync', { phase: 'none', serverInfo: getServerInfoFromSocket(socket) });
      return;
    }

    if (!rooms.has(code)) {
      reject(socket, '존재하지 않는 방 코드입니다. 같은 웹 주소로 접속했는지 확인하세요.');
      socket.emit('stateSync', { phase: 'none', serverInfo: getServerInfoFromSocket(socket) });
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
      reject(socket, '게임이 진행 중입니다. 잠시 후 새로고침하면 다시 연결됩니다.');
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
    socket.emit('stateSync', toClientState(room, userID));
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
    socket.emit('stateSync', toClientState(room, userID));
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
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection', reason);
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
});
