const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { randomUUID } = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs');

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
  res.json({ ok: true, service: 'mafia-game' });
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
  [PHASE.DAWN]: 8000
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
    accessMode
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

function pickRandomTarget(room, actor, opts = {}) {
  const { excludeSelf = true, aliveOnly = true, excludeIds = [] } = opts;
  const candidates = Object.values(room.players).filter(p => {
    if (aliveOnly && !p.alive) return false;
    if (excludeSelf && p.id === actor.id) return false;
    if (excludeIds.includes(p.id)) return false;
    if (opts.excludeMafia && isMafiaRole(p.role)) return false;
    return true;
  });
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)].id;
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
    pendingReporterMotion: null
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
}

function resetNightActions(room) {
  room.game.nightActions = {
    mafiaVotes: {},
    spyTarget: null,
    policeTarget: null,
    doctorTarget: null,
    reporterTarget: null,
    mediumTarget: null
  };
  room.game.mafiaVotes = {};
}

// ─── win checker ──────────────────────────────────────────────────────────────

function checkWin(room) {
  const alive = getAlivePlayers(room);
  const aliveMafia = alive.filter(p => isMafiaRole(p.role));
  const aliveNonMafia = alive.filter(p => !isMafiaRole(p.role));

  if (aliveMafia.length === 0) {
    return { winner: 'citizens', message: '시민 팀 승리! 모든 마피아가 제거되었습니다.' };
  }
  if (aliveMafia.length >= aliveNonMafia.length) {
    return { winner: 'mafia', message: '마피아 팀 승리! 마피아가 우위를 점했습니다.' };
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
      room.phase !== PHASE.NIGHT &&
      room.phase !== PHASE.DAY_VOTE && room.phase !== PHASE.EXECUTION_VOTE && room.phase !== PHASE.LAST_WORDS),
    canTimeExtend: !!(viewer && viewer.alive && room.phaseTimer && !viewer.timeIncreased &&
      room.phase !== PHASE.NIGHT &&
      room.phase !== PHASE.DAY_VOTE && room.phase !== PHASE.EXECUTION_VOTE && room.phase !== PHASE.LAST_WORDS),
    debugRoles: viewer && viewer.userID === room.hostUserId && hasBots(room) && room.phase !== PHASE.LOBBY
      ? Object.values(room.players).map(p => ({
          nickname: p.nickname,
          roleLabel: p.role ? ROLE_LABELS[p.role] : '?',
          isBot: !!p.isBot,
          alive: p.alive
        }))
      : null,
    lobbyChat: room.phase === PHASE.LOBBY ? room.chatLog.lobby : null
  };
}

function broadcastState(room) {
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
  broadcastToRoom(room, 'gameMotionBatch', { motions: [...room.pendingMotions] });
  room.pendingMotions = [];
}

// ─── bot AI ───────────────────────────────────────────────────────────────────

function runBotActions(room) {
  if (!room.game || room.phase === PHASE.LOBBY || room.phase === PHASE.GAME_OVER || room.phase === PHASE.DAWN) return;

  const bots = getBots(room).filter(p => p.alive);
  if (!bots.length) return;

  const g = room.game;
  const actions = g.nightActions;

  if (room.phase === PHASE.NIGHT) {
    const mafiaBots = bots.filter(p => p.role === ROLE.MAFIA);
    if (mafiaBots.length) {
      const killTarget = pickRandomTarget(room, mafiaBots[0], { excludeMafia: true });
      mafiaBots.forEach(m => { actions.mafiaVotes[m.id] = killTarget; });
    }

    const spyBot = bots.find(p => p.role === ROLE.SPY);
    if (spyBot && !actions.spyTarget) actions.spyTarget = pickRandomTarget(room, spyBot);

    const policeBot = bots.find(p => p.role === ROLE.POLICE);
    if (policeBot && !actions.policeTarget) actions.policeTarget = pickRandomTarget(room, policeBot);

    const doctorBot = bots.find(p => p.role === ROLE.DOCTOR);
    if (doctorBot && !actions.doctorTarget) {
      actions.doctorTarget = pickRandomTarget(room, doctorBot, { excludeSelf: false });
    }

    const reporterBot = bots.find(p => p.role === ROLE.REPORTER && !p.reporterUsed);
    if (reporterBot && !actions.reporterTarget && room.game.nightIndex >= 2) {
      actions.reporterTarget = pickRandomTarget(room, reporterBot);
    }

    const mediumBot = bots.find(p => p.role === ROLE.MEDIUM);
    if (mediumBot && !actions.mediumTarget) {
      const dead = Object.values(room.players).filter(p => !p.alive);
      if (dead.length) {
        actions.mediumTarget = dead[Math.floor(Math.random() * dead.length)].id;
      }
    }

    console.log(`[BOT] night actions applied (${bots.length} bots)`);
  }

  if (room.phase === PHASE.DAY_VOTE) {
    bots.forEach(bot => {
      if (!g.dayVotes[bot.id]) {
        g.dayVotes[bot.id] = pickRandomTarget(room, bot);
      }
    });
    console.log('[BOT] day votes applied');
  }

  if (room.phase === PHASE.EXECUTION_VOTE) {
    bots.forEach(bot => {
      if (bot.id === g.executionCandidateId) return;
      if (!g.executionVotes[bot.id]) {
        g.executionVotes[bot.id] = Math.random() < 0.6 ? 'yes' : 'no';
      }
    });
    console.log('[BOT] execution votes applied');
  }

  if (room.phase === PHASE.LAST_WORDS) {
    const candidate = getPlayerById(room, g.executionCandidateId);
    if (candidate && candidate.isBot) {
      const msg = { from: candidate.nickname, fromId: candidate.id, text: '저는 억울합니다...', time: Date.now() };
      pushChat(room, 'lastWords', msg);
      broadcastToRoom(room, 'chatMessage', { channel: 'lastWords', ...msg });
    }
  }

  broadcastState(room);
}

function scheduleBotActions(room, durationMs) {
  if (!hasBots(room) || !room.game) return;
  setTimeout(() => runBotActions(room), 800);
  if (durationMs > 5000) {
    setTimeout(() => runBotActions(room), Math.floor(durationMs * 0.6));
  }
}

// ─── phase controller ─────────────────────────────────────────────────────────

function clearPhaseTimer(room) {
  if (room.phaseTimer) {
    clearTimeout(room.phaseTimer);
    room.phaseTimer = null;
  }
}

function setPhase(room, phase, durationMs) {
  clearPhaseTimer(room);
  room.phase = phase;
  room.phaseEndsAt = durationMs ? Date.now() + durationMs : null;

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
  room.game.nightIndex += 1;
  resetNightActions(room);

  console.log(`\n=== NIGHT ${room.game.nightIndex} (room ${room.code}) ===`);

  setPhase(room, PHASE.NIGHT, TIMERS[PHASE.NIGHT]);
  broadcastAnimation(room, 'anim-night-fall');
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
  clearPhaseTimer(room);
  room.phaseTimer = setTimeout(() => {
    const win = checkWin(room);
    if (win) return endGame(room, win);
    startDayChat(room);
  }, TIMERS[PHASE.DAWN]);
}

function startDayChat(room) {
  room.game.dayIndex += 1;
  room.game.dayVotes = {};
  room.game.executionVotes = {};
  room.game.executionCandidateId = null;
  setPhase(room, PHASE.DAY_CHAT, TIMERS[PHASE.DAY_CHAT]);
}

function startDayVote(room) {
  room.game.dayVotes = {};
  setPhase(room, PHASE.DAY_VOTE, TIMERS[PHASE.DAY_VOTE]);
  broadcastAnimation(room, 'anim-vote');
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
  clearPhaseTimer(room);
  room.game.winner = win.winner;
  room.phase = PHASE.GAME_OVER;
  room.phaseEndsAt = null;
  broadcastToRoom(room, 'gameOver', win);
  broadcastState(room);
  console.log(`[GAME OVER] room=${room.code} winner=${win.winner}: ${win.message}`);
}

function resetRoomToLobby(room) {
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
  switch (room.phase) {
    case PHASE.NIGHT:
      resolveNight(room);
      break;
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

  // 1) Doctor heal
  let healedId = null;
  const doctorAction = g.nightActions.doctorTarget;
  if (doctorAction) {
    const doctor = Object.values(room.players).find(p => p.role === ROLE.DOCTOR && p.alive);
    if (doctor) {
      healedId = doctorAction;
      console.log(`[NIGHT][2-Heal] doctor ${doctor.nickname} -> ${playerName(room, healedId)} (healed)`);
      const sess = sessions.get(doctor.userID);
      if (sess && sess.socketId) {
        io.to(sess.socketId).emit('privateInfo', { type: 'heal', targetId: healedId, targetName: playerName(room, healedId) });
      }
      broadcastAnimation(room, 'anim-doctor-heal');
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

  // 4) Investigations
  const spyTarget = g.nightActions.spyTarget;
  if (spyTarget) {
    const spy = Object.values(room.players).find(p => p.role === ROLE.SPY && p.alive);
    const target = getPlayerById(room, spyTarget);
    if (spy && target) {
      const resultRole = target.role;
      const isMafia = isMafiaRole(resultRole);
      if (isMafia) spy.joinedMafiaChat = true;
      console.log(`[NIGHT][4-Spy] ${spy.nickname} investigates ${target.nickname} -> ${ROLE_LABELS[resultRole]}${isMafia ? ' (joined mafia chat)' : ''}`);
      emitMotionToUser(spy.userID, isMafia ? {
        type: 'spy_contact',
        title: '스파이 접선',
        message: '접선했습니다.',
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
          type: 'spy', targetId: spyTarget, targetName: target.nickname,
          role: resultRole, roleLabel: ROLE_LABELS[resultRole], joinedMafiaChat: isMafia
        });
      }
    }
  }

  const policeTarget = g.nightActions.policeTarget;
  if (policeTarget) {
    const police = Object.values(room.players).find(p => p.role === ROLE.POLICE && p.alive);
    const target = getPlayerById(room, policeTarget);
    if (police && target) {
      const isMafia = isMafiaRole(target.role);
      console.log(`[NIGHT][4-Police] ${police.nickname} investigates ${target.nickname} -> ${isMafia ? 'MAFIA' : 'NOT MAFIA'}`);
      emitMotionToUser(police.userID, isMafia ? {
        type: 'police_mafia',
        title: '경찰 수색',
        message: `${target.nickname}님은 마피아입니다.`,
        situation: '[상황] 경찰에게 검거되었습니다.'
      } : {
        type: 'police_innocent',
        title: '경찰 조사',
        message: `${target.nickname}은 마피아가 아닙니다.`,
        situation: '밤에 조사한 플레이어가 마피아가 아닐 경우'
      });
      const sess = sessions.get(police.userID);
      if (sess && sess.socketId) {
        io.to(sess.socketId).emit('privateInfo', {
          type: 'police', targetId: policeTarget, targetName: target.nickname, isMafia
        });
      }
    }
  }

  const reporterTarget = g.nightActions.reporterTarget;
  if (reporterTarget && g.nightIndex >= 2) {
    const reporter = Object.values(room.players).find(p => p.role === ROLE.REPORTER && p.alive && !p.reporterUsed);
    const target = getPlayerById(room, reporterTarget);
    if (reporter && target) {
      reporter.reporterUsed = true;
      room.pendingReporterRevealData = {
        targetId: target.id,
        targetName: target.nickname,
        role: target.role,
        roleLabel: ROLE_LABELS[target.role]
      };
      room.pendingReporterReveal = `기자 취재: ${target.nickname}의 직업은 [${ROLE_LABELS[target.role]}] 입니다.`;
      console.log(`[NIGHT][4-Reporter] ${reporter.nickname} scoops ${target.nickname} -> ${ROLE_LABELS[target.role]} (reveal at dawn)`);
      emitMotionToUser(reporter.userID, {
        type: 'reporter_scoop',
        title: '기자 취재',
        message: `그 사람의 직업은 ${ROLE_LABELS[target.role]}입니다.`,
        situation: '[상황] 취재 결과는 다음 날 아침에 공표됩니다.'
      });
      broadcastAnimation(room, 'anim-reporter-flash');
      const sess = sessions.get(reporter.userID);
      if (sess && sess.socketId) {
        io.to(sess.socketId).emit('privateInfo', {
          type: 'reporter', targetId: reporterTarget, targetName: target.nickname,
          role: target.role, roleLabel: ROLE_LABELS[target.role]
        });
      }
    }
  }

  const mediumTarget = g.nightActions.mediumTarget;
  if (mediumTarget) {
    const medium = Object.values(room.players).find(p => p.role === ROLE.MEDIUM && p.alive);
    const target = getPlayerById(room, mediumTarget);
    if (medium && target && !target.alive) {
      console.log(`[NIGHT][4b-Medium] ${medium.nickname} purifies ${target.nickname} -> ${ROLE_LABELS[target.role]}`);
      const sess = sessions.get(medium.userID);
      if (sess && sess.socketId) {
        io.to(sess.socketId).emit('privateInfo', {
          type: 'medium',
          targetId: mediumTarget,
          targetName: target.nickname,
          role: target.role,
          roleLabel: ROLE_LABELS[target.role]
        });
      }
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
  room.resolvingDayVote = true;

  const results = buildDayVoteResults(room);
  broadcastToRoom(room, 'dayVoteResults', results);

  setTimeout(() => {
    room.resolvingDayVote = false;
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
    if (oldSocket) oldSocket.disconnect(true);
  }

  sessions.set(userID, { userID, nickname, socketId: socket.id, roomCode: existing ? existing.roomCode : null, playerId: existing ? existing.playerId : null });
  socket.userID = userID;
  socket.nickname = nickname;
}

function removePlayerFromRoom(room, userID, { announce = false } = {}) {
  const player = getPlayerByUserId(room, userID);
  if (!player) return { ok: false, message: '플레이어를 찾을 수 없습니다.' };

  if (player.disconnectTimer) {
    clearTimeout(player.disconnectTimer);
    player.disconnectTimer = null;
  }

  const nickname = player.nickname;
  delete room.players[player.id];

  if (room.hostUserId === userID) {
    const remaining = Object.values(room.players);
    room.hostUserId = remaining.length > 0 ? remaining[0].userID : null;
  }

  const playerCount = Object.keys(room.players).length;
  if (playerCount === 0) {
    rooms.delete(room.code);
  } else if (announce) {
    pushLobbySystemMessage(room, `${nickname}님이 나갔습니다.`);
    broadcastState(room);
  }

  return { ok: true, nickname, empty: playerCount === 0 };
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

  if (room.phase !== PHASE.LOBBY) {
    return reject(socket, '게임이 진행 중일 때는 나갈 수 없습니다.');
  }

  removePlayerFromRoom(room, socket.userID, { announce: true });
  socket.leave(room.code);
  sess.roomCode = null;
  sess.playerId = null;
  socket.emit('stateSync', { phase: 'none', serverInfo: getServerInfoFromSocket(socket) });
}

function handleDisconnect(socket) {
  const userID = socket.userID;
  if (!userID) return;

  const sess = sessions.get(userID);
  if (sess) sess.socketId = null;

  const roomCode = sess && sess.roomCode;
  if (!roomCode || !rooms.has(roomCode)) return;

  const room = rooms.get(roomCode);
  const player = getPlayerByUserId(room, userID);
  if (!player) return;

  player.connected = false;

  if (player.disconnectTimer) clearTimeout(player.disconnectTimer);

  player.disconnectTimer = setTimeout(() => {
    if (sessions.get(userID) && sessions.get(userID).socketId) return;

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
  broadcastState(room);
  console.log(`[SESSION] userID=${socket.userID} reconnected to room ${room.code}`);
}

// ─── action validators ─────────────────────────────────────────────────────────

function getViewer(room, socket) {
  return getPlayerByUserId(room, socket.userID);
}

function reject(socket, msg) {
  socket.emit('error', { message: msg });
}

function recordMafiaVote(room, socket, targetId) {
  const player = getViewer(room, socket);
  if (!player || !player.alive || player.role !== ROLE.MAFIA) return reject(socket, '마피아만 투표할 수 있습니다.');
  if (room.phase !== PHASE.NIGHT) return reject(socket, '밤에만 가능합니다.');
  room.game.nightActions.mafiaVotes[player.id] = targetId;
  broadcastState(room);
}

function recordSpyInvestigate(room, socket, targetId) {
  const player = getViewer(room, socket);
  if (!player || !player.alive || player.role !== ROLE.SPY) return reject(socket, '스파이만 조사할 수 있습니다.');
  if (room.phase !== PHASE.NIGHT) return reject(socket, '밤에만 가능합니다.');
  room.game.nightActions.spyTarget = targetId;
  socket.emit('privateInfo', { type: 'actionConfirm', action: 'spy', targetId });
}

function recordPoliceInvestigate(room, socket, targetId) {
  const player = getViewer(room, socket);
  if (!player || !player.alive || player.role !== ROLE.POLICE) return reject(socket, '경찰만 조사할 수 있습니다.');
  if (room.phase !== PHASE.NIGHT) return reject(socket, '밤에만 가능합니다.');
  room.game.nightActions.policeTarget = targetId;
  socket.emit('privateInfo', { type: 'actionConfirm', action: 'police', targetId });
}

function recordDoctorHeal(room, socket, targetId) {
  const player = getViewer(room, socket);
  if (!player || !player.alive || player.role !== ROLE.DOCTOR) return reject(socket, '의사만 치료할 수 있습니다.');
  if (room.phase !== PHASE.NIGHT) return reject(socket, '밤에만 가능합니다.');
  room.game.nightActions.doctorTarget = targetId;
  socket.emit('privateInfo', { type: 'actionConfirm', action: 'doctor', targetId });
}

function recordReporterScoop(room, socket, targetId) {
  const player = getViewer(room, socket);
  if (!player || !player.alive || player.role !== ROLE.REPORTER) return reject(socket, '기자만 취재할 수 있습니다.');
  if (player.reporterUsed) return reject(socket, '이미 취재를 사용했습니다.');
  if (room.phase !== PHASE.NIGHT) return reject(socket, '밤에만 가능합니다.');
  if (!room.game || room.game.nightIndex < 2) return reject(socket, '기자 취재는 2번째 밤부터 가능합니다.');
  room.game.nightActions.reporterTarget = targetId;
  socket.emit('privateInfo', { type: 'actionConfirm', action: 'reporter', targetId });
}

function recordMediumPurify(room, socket, targetId) {
  const player = getViewer(room, socket);
  if (!player || !player.alive || player.role !== ROLE.MEDIUM) return reject(socket, '영매만 성불할 수 있습니다.');
  if (room.phase !== PHASE.NIGHT) return reject(socket, '밤에만 가능합니다.');
  const target = getPlayerById(room, targetId);
  if (!target || target.alive) return reject(socket, '사망자만 성불할 수 있습니다.');
  room.game.nightActions.mediumTarget = targetId;
  socket.emit('privateInfo', { type: 'actionConfirm', action: 'medium', targetId });
  broadcastState(room);
}

function recordDayVote(room, socket, targetId) {
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
    if (room.phase !== PHASE.DAY_CHAT || !player.alive) return reject(socket, '낮 채팅 시간이 아니거나 사망했습니다.');
    pushChat(room, 'day', msg);
    broadcastToRoom(room, 'chatMessage', { channel: 'day', ...msg }, p => p.alive);
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
    if (room.phase !== PHASE.LOBBY) return reject(socket, '이미 게임이 진행 중입니다.');

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
    const sess = sessions.get(socket.userID);
    if (!sess || !sess.roomCode) return;
    handleChat(rooms.get(sess.roomCode), socket, 'lobby', data.text);
  });

  socket.on('chat', (data) => {
    const sess = sessions.get(socket.userID);
    if (!sess || !sess.roomCode) return;
    handleChat(rooms.get(sess.roomCode), socket, 'day', data.text);
  });

  socket.on('mafiaChat', (data) => {
    const sess = sessions.get(socket.userID);
    if (!sess || !sess.roomCode) return;
    handleChat(rooms.get(sess.roomCode), socket, 'mafia', data.text);
  });

  socket.on('deadChat', (data) => {
    const sess = sessions.get(socket.userID);
    if (!sess || !sess.roomCode) return;
    handleChat(rooms.get(sess.roomCode), socket, 'dead', data.text);
  });

  socket.on('lastWordsChat', (data) => {
    const sess = sessions.get(socket.userID);
    if (!sess || !sess.roomCode) return;
    handleChat(rooms.get(sess.roomCode), socket, 'lastWords', data.text);
  });

  socket.on('mafiaVote', ({ targetId }) => {
    const sess = sessions.get(socket.userID);
    if (!sess || !sess.roomCode) return;
    recordMafiaVote(rooms.get(sess.roomCode), socket, targetId);
  });

  socket.on('spyInvestigate', ({ targetId }) => {
    const sess = sessions.get(socket.userID);
    if (!sess || !sess.roomCode) return;
    recordSpyInvestigate(rooms.get(sess.roomCode), socket, targetId);
  });

  socket.on('policeInvestigate', ({ targetId }) => {
    const sess = sessions.get(socket.userID);
    if (!sess || !sess.roomCode) return;
    recordPoliceInvestigate(rooms.get(sess.roomCode), socket, targetId);
  });

  socket.on('doctorHeal', ({ targetId }) => {
    const sess = sessions.get(socket.userID);
    if (!sess || !sess.roomCode) return;
    recordDoctorHeal(rooms.get(sess.roomCode), socket, targetId);
  });

  socket.on('reporterScoop', ({ targetId }) => {
    const sess = sessions.get(socket.userID);
    if (!sess || !sess.roomCode) return;
    recordReporterScoop(rooms.get(sess.roomCode), socket, targetId);
  });

  socket.on('mediumPurify', ({ targetId }) => {
    const sess = sessions.get(socket.userID);
    if (!sess || !sess.roomCode) return;
    recordMediumPurify(rooms.get(sess.roomCode), socket, targetId);
  });

  socket.on('dayVote', ({ targetId }) => {
    const sess = sessions.get(socket.userID);
    if (!sess || !sess.roomCode) return;
    recordDayVote(rooms.get(sess.roomCode), socket, targetId);
  });

  socket.on('executionVote', ({ vote }) => {
    const sess = sessions.get(socket.userID);
    if (!sess || !sess.roomCode) return;
    recordExecutionVote(rooms.get(sess.roomCode), socket, vote);
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
});
