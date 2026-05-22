/* ─── AudioManager (사운드 뼈대) ─────────────────────────────────────────── */

/** public/sounds/*.mp3 배치 후 true 로 바꾸거나 localStorage mafia_sounds=1 */
const SOUNDS_ENABLED = localStorage.getItem('mafia_sounds') === '1';

const AudioManager = {
  muted: localStorage.getItem('mafia_muted') === 'true',
  bgm: null,
  cache: {},

  playBGM(name) {
    if (!SOUNDS_ENABLED || this.muted) return;
    try {
      if (this.bgm) { this.bgm.pause(); this.bgm = null; }
      this.bgm = new Audio(`/sounds/${name}.mp3`);
      this.bgm.loop = true;
      this.bgm.volume = 0.4;
      this.bgm.play().catch(() => {});
    } catch (_) {}
  },

  playSFX(name) {
    if (!SOUNDS_ENABLED || this.muted) return;
    try {
      if (!this.cache[name]) this.cache[name] = new Audio(`/sounds/${name}.mp3`);
      const sfx = this.cache[name].cloneNode();
      sfx.volume = 0.7;
      sfx.play().catch(() => {});
    } catch (_) {}
  },

  setMuted(m) {
    this.muted = m;
    localStorage.setItem('mafia_muted', String(m));
    if (m && this.bgm) this.bgm.pause();
  }
};

/* ─── State ───────────────────────────────────────────────────────────────── */

const PHASE_LABELS = {
  lobby: '로비',
  night: '밤',
  dawn: '아침',
  day_chat: '낮 채팅',
  day_vote: '투표',
  last_words: '최후의 반론',
  execution_vote: '찬반 투표',
  game_over: '게임 종료'
};

const ROLE = {
  MAFIA: 'mafia', SPY: 'spy', CITIZEN: 'citizen',
  PRIVATE_DETECTIVE: 'private_detective',
  POLICE: 'police', DOCTOR: 'doctor', SOLDIER: 'soldier',
  POLITICIAN: 'politician', MEDIUM: 'medium', REPORTER: 'reporter',
  GRAVEROBBER: 'graverobber', CULT_LEADER: 'cult_leader',
  CLERIC: 'cleric', TERRORIST: 'terrorist', BEAST_MAN: 'beast_man', CULTIST: 'cultist'
};

const ROLE_GUIDE = {
  [ROLE.MAFIA]: {
    name: '마피아', team: '마피아 팀',
    desc: '밤에 한 명을 지목해 살해합니다. 여럿이면 마피아 채팅에서 같은 대상에 투표해야 합니다.',
    tip: '밤 → 대상 선택 → 암살 투표'
  },
  [ROLE.SPY]: {
    name: '스파이', team: '마피아 팀',
    desc: '밤에 한 명을 조사해 직업을 알아냅니다. 마피아로 판명되면 접선하여 마피아 채팅에 합류합니다.',
    tip: '밤 → 대상 선택 → 직업 조사'
  },
  [ROLE.CITIZEN]: {
    name: '일반 시민', team: '시민 팀',
    desc: '특수 능력은 없습니다. 낮 토론과 투표로 마피아를 찾아내세요.',
    tip: '정보 공유와 투표가 무기입니다'
  },
  [ROLE.PRIVATE_DETECTIVE]: {
    name: '사립탐정', team: '시민 팀',
    desc: '밤에 생존자 한 명을 지정해 그 사람이 누구에게 능력(손)을 뻗는지 관찰합니다. 경찰·의사·마피아 등 액티브 직의 지목일 가능성을 멘트로 안내합니다.',
    tip: '밤 → 관찰할 사람 선택 → 관찰 확정'
  },
  [ROLE.POLICE]: {
    name: '경찰', team: '시민 팀',
    desc: '밤에 한 명을 수색해 마피아인지 조사합니다. 낮에 「조결」「경찰조사」 등으로 공개 요청 시 조사한 대상만 발표합니다.',
    tip: '밤 수색 · 낮 채팅으로 조결 공개'
  },
  [ROLE.DOCTOR]: {
    name: '의사', team: '시민 팀',
    desc: '밤에 한 명(본인 포함)을 치료해 마피아의 공격을 막을 수 있습니다.',
    tip: '밤 → 대상 선택 → 치료 (자힐 가능)'
  },
  [ROLE.SOLDIER]: {
    name: '군인', team: '시민 팀',
    desc: '마피아의 첫 공격을 1회 버텨냅니다. 스파이에게 조사되면 군인으로 들킵니다.',
    tip: '능력 사용 없음 — 방탄 패시브'
  },
  [ROLE.POLITICIAN]: {
    name: '정치인', team: '시민 팀',
    desc: '낮 투표에서 표 2개를 행사합니다. 찬반 처형 투표에서는 처형되지 않습니다(면역).',
    tip: '낮 투표 2표 · 찬반 면역'
  },
  [ROLE.MEDIUM]: {
    name: '영매', team: '시민 팀',
    desc: '사망자 채팅을 볼 수 있고, 밤에 사망자 한 명을 성불해 직업을 알아낼 수 있습니다.',
    tip: '밤 → 사망자 선택 → 성불 / 사망자 채팅 탭 확인'
  },
  [ROLE.REPORTER]: {
    name: '기자', team: '시민 팀',
    desc: '2번째 밤부터 한 명을 취재해 직업을 알아냅니다. 다음 날 아침 전원에게 공표됩니다. 1회용.',
    tip: '2번째 밤 → 대상 선택 → 취재 (1회)'
  },
  [ROLE.GRAVEROBBER]: {
    name: '도굴꾼', team: '시민 팀',
    desc: '첫 번째 밤에 첫 사망자의 직업을 계승합니다. 별도 선택 없이 자동 적용됩니다.',
    tip: '첫 밤 이후 새 직업 확인'
  },
  [ROLE.CULT_LEADER]: {
    name: '교주', team: '교주 팀',
    desc: '홀수 밤마다 마피아·성직자가 아닌 생존자 1명을 포교합니다. 성직자에게는 실패하며 정체가 들킬 수 있습니다. 포교 성공 시 종소리가 울립니다.',
    tip: '홀수 밤 1회 포교(성공 시 종소리 즉시) · 마피아 실패 시 다른 대상 재시도 · 교주·신도 낮 2표'
  },
  [ROLE.CLERIC]: {
    name: '성직자', team: '시민 팀',
    desc: '게임 중 1회 사망자 부활. 교주 포교 시도 시 포교가 실패하고 교주 정체를 압니다. 낮 토론에서 교주를 공표하세요.',
    tip: '밤 부활(1회) · 교주 포교 저지 → 낮에 교주 공표'
  },
  [ROLE.TERRORIST]: {
    name: '테러리스트', team: '시민 팀',
    desc: '찬반 처형 시 생존자 1명을 지정해 함께 사망(자폭)합니다. 마피아에게 살해당하면 공격한 마피아도 함께 사망(산화)합니다.',
    tip: '최후의 반론 중 동귀어진 지정 · 산화 패시브'
  },
  [ROLE.BEAST_MAN]: {
    name: '짐승인간', team: '마피아 팀',
    desc: '마피아와 처음엔 서로 모릅니다. 경찰 조사 시 시민으로 보입니다. 마피아 공격 시 접선하며, 마피아 전멸 후 밤에 직접 처형할 수 있습니다.',
    tip: '접선 패시브 · 마피아 전멸 후 밤 처형'
  },
  [ROLE.CULTIST]: {
    name: '광신도', team: '교주 팀',
    desc: '게임 시작 시 교주를 압니다. 교주가 자신을 포교하면 즉시 교주팀이 됩니다. 교주 사망 시 교주를 계승합니다.',
    tip: '교주 정보 확인 · 포교 시 즉시 합류'
  }
};

const M42_GLOSSARY = [
  { term: '직공', mean: '직업 공개' },
  { term: '조결', mean: '경찰 조사 결과' },
  { term: '자투', mean: '자신에게 투표해 무투표로 넘기기' },
  { term: '조밤', mean: '밤에 아무도 사망하지 않음' },
  { term: '투갈', mean: '최다 득표 동점으로 처형 없음' },
  { term: '접선', mean: '스파이가 마피아와 합류해 밤챗 사용' },
  { term: '포교', mean: '교주가 밤에 시민 등을 교주팀으로 전환' },
  { term: '교밤', mean: '포교 가능한 홀수 번째 밤' }
];

const FX_MAP = {
  'anim-mafia-kill': { cls: 'fx-kill', text: '살해!' },
  'anim-doctor-heal': { cls: 'fx-heal', text: '치료!' },
  'anim-vote': { cls: 'fx-vote', text: '투표!' },
  'anim-execution': { cls: 'fx-execution', text: '처형!' },
  'anim-investigate': { cls: 'fx-investigate', text: '조사!' },
  'anim-reporter-flash': { cls: 'fx-reporter', text: '취재!' },
  'anim-night-fall': { cls: 'fx-phase-night', text: '밤이 됩니다' },
  'anim-dawn-rise': { cls: 'fx-phase-day', text: '아침이 밝았습니다' },
  'anim-cult-proselytize': { cls: 'fx-cult', text: '종소리…' }
};

let userID = sessionStorage.getItem('mafia_userID');
if (!userID) {
  userID = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
  sessionStorage.setItem('mafia_userID', userID);
}

let state = null;
let selectedTargetId = null;
/** 방 단위 직업 유추·메모 (localStorage, 새 게임 버튼 전까지 유지) */
let playerNotesStore = { byId: {}, byNick: {} };
let memoEditingPlayerId = null;
let memoSelectedRole = null;

function getNotesStorageKey() {
  if (!state || !state.roomCode) return null;
  return `mafia_guess_notes_${state.roomCode}`;
}

function normalizePlayerNotesStore(raw) {
  if (!raw || typeof raw !== 'object') return { byId: {}, byNick: {} };
  if (raw.byId || raw.byNick) {
    return { byId: { ...(raw.byId || {}) }, byNick: { ...(raw.byNick || {}) } };
  }
  const byId = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v && typeof v === 'object' && (v.guessedRole || v.note)) {
      byId[String(k)] = {
        guessedRole: v.guessedRole || null,
        note: (v.note || '').trim()
      };
    }
  }
  return { byId, byNick: {} };
}

function migrateLegacyPlayerNotes(roomCode) {
  const keysToTry = [];
  const sessKey = localStorage.getItem(`mafia_notes_session_${roomCode}`);
  if (sessKey) keysToTry.push(`mafia_notes_${roomCode}_${sessKey}`);
  keysToTry.push(`mafia_notes_${roomCode}_default`);
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(`mafia_notes_${roomCode}_`) && !keysToTry.includes(k)) {
      keysToTry.push(k);
    }
  }
  let merged = false;
  for (const legacyKey of keysToTry) {
    try {
      const legacy = JSON.parse(localStorage.getItem(legacyKey) || '{}');
      const norm = normalizePlayerNotesStore(legacy);
      if (Object.keys(norm.byId).length) {
        Object.assign(playerNotesStore.byId, norm.byId);
        merged = true;
      }
      if (Object.keys(norm.byNick).length) {
        Object.assign(playerNotesStore.byNick, norm.byNick);
        merged = true;
      }
    } catch { /* ignore */ }
  }
  return merged;
}

function findPlayerInState(playerId) {
  if (!state || !Array.isArray(state.players)) return null;
  const id = String(playerId);
  return state.players.find((p) => String(p.id) === id) || null;
}

function loadPlayerNotes() {
  const key = getNotesStorageKey();
  if (!key) {
    playerNotesStore = { byId: {}, byNick: {} };
    return;
  }
  try {
    playerNotesStore = normalizePlayerNotesStore(JSON.parse(localStorage.getItem(key) || '{}'));
  } catch {
    playerNotesStore = { byId: {}, byNick: {} };
  }
  if (state && state.roomCode && migrateLegacyPlayerNotes(state.roomCode)) {
    savePlayerNotes();
  }
}

function savePlayerNotes() {
  const key = getNotesStorageKey();
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(playerNotesStore));
}

function resetPlayerNotesSession() {
  playerNotesStore = { byId: {}, byNick: {} };
  savePlayerNotes();
}

function getPlayerNote(playerId) {
  const id = String(playerId);
  if (playerNotesStore.byId[id]) return playerNotesStore.byId[id];
  const player = findPlayerInState(playerId);
  const nick = player && player.nickname;
  if (nick && playerNotesStore.byNick[nick]) return playerNotesStore.byNick[nick];
  return { guessedRole: null, note: '' };
}

function setPlayerNote(playerId, data) {
  const next = {
    guessedRole: data.guessedRole || null,
    note: (data.note || '').trim()
  };
  const id = String(playerId);
  const player = findPlayerInState(playerId);
  const nick = player && player.nickname;
  if (!next.guessedRole && !next.note) {
    delete playerNotesStore.byId[id];
    if (nick) delete playerNotesStore.byNick[nick];
  } else {
    playerNotesStore.byId[id] = next;
    if (nick) playerNotesStore.byNick[nick] = next;
  }
  savePlayerNotes();
}

function formatGuessedRoleLabel(roleKey) {
  if (!roleKey || !ROLE_GUIDE[roleKey]) return '';
  return ROLE_GUIDE[roleKey].name;
}

function openPlayerRolePicker(playerId) {
  const player = state && state.players.find(p => p.id === playerId);
  if (!player) return;
  memoEditingPlayerId = playerId;
  const note = getPlayerNote(playerId);
  memoSelectedRole = note.guessedRole || null;

  const overlay = $('#player-memo-overlay');
  const title = $('#player-memo-title');
  const rolesEl = $('#player-memo-roles');
  if (!overlay || !title || !rolesEl) return;

  title.textContent = `${player.nickname} — 직업 유추`;

  const roleButtons = [{ key: '', label: '미정' }].concat(
    Object.entries(ROLE_GUIDE).map(([key, g]) => ({ key, label: g.name }))
  );
  rolesEl.innerHTML = roleButtons.map(({ key, label }) =>
    `<button type="button" class="player-memo-role-btn role-pick-${key || 'unknown'}${memoSelectedRole === key || (!memoSelectedRole && !key) ? ' active' : ''}" data-role="${key}">${label}</button>`
  ).join('');

  rolesEl.querySelectorAll('.player-memo-role-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const roleKey = btn.dataset.role || null;
      const prev = getPlayerNote(playerId);
      setPlayerNote(playerId, { guessedRole: roleKey, note: prev.note });
      closePlayerMemo();
      renderPlayerGrid();
      if (roleKey && ROLE_GUIDE[roleKey]) {
        showToast(`${player.nickname} → ${ROLE_GUIDE[roleKey].name}`);
      } else {
        showToast('직업 유추를 취소했습니다.');
      }
    });
  });

  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
}

function openPlayerMemo(playerId) {
  openPlayerRolePicker(playerId);
}

function closePlayerMemo() {
  const overlay = $('#player-memo-overlay');
  if (overlay) {
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
  }
  memoEditingPlayerId = null;
}

function clearPlayerMemo() {
  if (!memoEditingPlayerId) return;
  const prev = getPlayerNote(memoEditingPlayerId);
  setPlayerNote(memoEditingPlayerId, { guessedRole: null, note: prev.note });
  closePlayerMemo();
  renderPlayerGrid();
  showToast('직업 유추를 취소했습니다.');
}

function canSelectActionTarget() {
  if (!state || !state.myPlayerId) return false;
  const me = state.players.find(p => p.id === state.myPlayerId);
  if (!me || !me.alive) return false;
  if (state.phase === 'day_vote') return true;
  if (state.phase === 'night') {
    if (state.myRole === ROLE.MEDIUM) return !state.mediumResolved;
    if (state.myRole === ROLE.CLERIC) return !state.clericUsed && !state.clericResolved;
    if (state.myRole === ROLE.BEAST_MAN) return !!state.beastManCanKill;
    return [ROLE.MAFIA, ROLE.SPY, ROLE.POLICE, ROLE.DOCTOR, ROLE.REPORTER, ROLE.CULT_LEADER, ROLE.PRIVATE_DETECTIVE].includes(state.myRole);
  }
  if (state.phase === 'last_words' && state.canPickTerroristMartyr) return true;
  return false;
}

/** lib/m42-cult.js canProselytizeTonight — phaseChanged 직후 stateSync 전 UI용 */
function canCultProselytizeTonightClient(state) {
  if (!state || state.phase !== 'night') return false;
  if (state.myRole !== ROLE.CULT_LEADER) return false;
  const n = state.nightIndex || 0;
  if (n <= 0 || n % 2 !== 1) return false;
  if (state.cultProselytizedSuccess || state.cultResolved) return false;
  return true;
}

function viewerOnCultSideClient() {
  return !!(state && (state.joinedCult || state.myRole === ROLE.CULT_LEADER));
}

/** 교주팀 시청자용: 초상화 덮개 대신 slot-avatar 배경·테두리 클래스 */
function getCultAvatarClassModifier(p, isSelf) {
  if (!viewerOnCultSideClient()) return '';
  const isLeaderCard = (isSelf && state.myRole === ROLE.CULT_LEADER) || !!(p && p.isCultLeaderAlly);
  const isProselyteCard = (isSelf && state.joinedCult && state.myRole !== ROLE.CULT_LEADER)
    || (!!p && p.isCultFollower && !p.isCultLeaderAlly);
  const isMarkedProselyte = !!(
    p
    && (
      (Array.isArray(state.cultMemberIds) && state.cultMemberIds.includes(p.id))
      || (Array.isArray(state.cultProselytizedIds) && state.cultProselytizedIds.includes(p.id))
    )
    && !p.isCultLeaderAlly
  );
  if (isLeaderCard) return ' cult-avatar-leader';
  if (isProselyteCard || isMarkedProselyte) return ' cult-avatar-proselyte';
  return '';
}

function buildCultAvatarOverlay(_p, _isSelf) {
  return '';
}

function flashCultProselytizeCard(playerId) {
  flashPlayerCard(playerId, 'fx-target-cult');
  const card = document.querySelector(`.player-card[data-id="${playerId}"]`);
  if (card) {
    card.classList.add('cult-proselytized-flash');
    setTimeout(() => card.classList.remove('cult-proselytized-flash'), 2400);
  }
}

function canSelectPlayerSlot(p) {
  if (!state || !state.myPlayerId) return false;
  const me = state.players.find(pl => pl.id === state.myPlayerId);
  if (!me) return false;
  if (state.phase === 'day_vote') return me.alive && p.alive;
  if (state.phase === 'night' && me.alive) {
    if (state.myRole === ROLE.MEDIUM) {
      if (state.mediumResolved) return false;
      if (!p.alive) {
        const dn = p.deadSinceNightIndex;
        if (dn != null && state.nightIndex != null && dn >= state.nightIndex) return false;
        return true;
      }
      return false;
    }
    if (state.myRole === ROLE.PRIVATE_DETECTIVE && state.myPrivateDetectiveWatchId) {
      return false;
    }
    if (state.myRole === ROLE.CLERIC && !state.clericUsed && !state.clericResolved) {
      return !p.alive;
    }
    if (state.myRole === ROLE.BEAST_MAN && state.beastManCanKill) {
      return p.alive;
    }
    return p.alive && [ROLE.MAFIA, ROLE.SPY, ROLE.POLICE, ROLE.DOCTOR, ROLE.REPORTER, ROLE.CULT_LEADER, ROLE.PRIVATE_DETECTIVE].includes(state.myRole);
  }
  if (state.phase === 'last_words' && state.canPickTerroristMartyr) {
    return p.alive && p.id !== state.myPlayerId;
  }
  return false;
}

let activeChatChannel = 'day';
const chatStore = { lobby: [], day: [], mafia: [], cult: [], dead: [], lastWords: [] };
let timerInterval = null;
let phaseTickNudgeAt = 0;
let phaseEndEstimate = 0;
let forceChatScrollBottom = false;
let forceLobbyScrollBottom = false;

const socket = typeof window.io === 'function'
  ? window.io({
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    reconnectionAttempts: Infinity,
    randomizationFactor: 0.35,
    transports: ['polling', 'websocket'],
    timeout: 30000
  })
  : (() => {
    console.error('[mafia] socket.io client not loaded — check /socket.io/socket.io.js');
    const noop = () => {};
    return { connected: false, on: noop, off: noop, emit: noop, connect: noop };
  })();
let socketConnected = false;
let serverHttpOk = false;
let reconnectPaused = false;
let pendingRoomRejoin = null;
let rejoinAttempts = 0;
const MAX_REJOIN_ATTEMPTS = 3;
let keepAliveTimer = null;
let disconnectBannerTimer = null;
let chatRenderTimer = null;

function queueChatRender(channel) {
  if (channel === 'lobby') {
    renderLobbyChat();
    return;
  }
  if (channel !== 'day' && activeChatChannel !== channel) return;
  if (chatRenderTimer) return;
  chatRenderTimer = setTimeout(() => {
    chatRenderTimer = null;
    renderChat();
  }, 150);
}

function startKeepAlive() {
  if (keepAliveTimer) return;
  keepAliveTimer = setInterval(() => {
    fetch('/health', { cache: 'no-store', credentials: 'same-origin' }).catch(() => {});
  }, 4 * 60 * 1000);
}

function stopKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

function handleRoomLost(wasInGame = false) {
  pendingRoomRejoin = null;
  rejoinAttempts = 0;
  localStorage.removeItem('mafia_roomCode');
  sessionStorage.removeItem('mafia_in_room_session');
  stopKeepAlive();
  $('#reconnect-banner').hidden = true;

  const msg = wasInGame
    ? '서버가 재시작되어 이전 방을 이어갈 수 없습니다. 새 방을 만들어 주세요.'
    : '저장된 방을 찾을 수 없습니다. 방 코드를 다시 입력하거나 새로 만들어 주세요.';
  if (!sessionStorage.getItem('mafia_room_lost_shown')) {
    sessionStorage.setItem('mafia_room_lost_shown', '1');
    showToast(msg);
    setTimeout(() => sessionStorage.removeItem('mafia_room_lost_shown'), 30000);
  }

  state = { phase: 'none', serverInfo: state && state.serverInfo ? state.serverInfo : null };
  resetLobbyClientState();
  renderFromState();
}

function requestSessionSync() {
  if (reconnectPaused || !socketConnected) return;
  rejoinAttempts = 0;
  const nick = getNickname() || localStorage.getItem('mafia_nickname') || '플레이어';
  const savedRoom = sessionStorage.getItem('mafia_in_room_session')
    ? localStorage.getItem('mafia_roomCode')
    : null;
  if (savedRoom) {
    pendingRoomRejoin = savedRoom;
    socket.emit('resumeSession', { userID, nickname: nick });
  } else {
    pendingRoomRejoin = null;
    socket.emit('join', { userID, nickname: nick, roomCode: null });
  }
}

/* ─── DOM ─────────────────────────────────────────────────────────────────── */

const $ = (sel) => document.querySelector(sel);
const screens = {
  lobby: $('#lobby-screen'),
  waiting: $('#waiting-screen'),
  game: $('#game-screen'),
  gameover: $('#gameover-screen')
};

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

function getNickname() {
  return ($('#nickname').value || '').trim();
}

async function probeServerHealth() {
  try {
    const res = await fetch('/health', { cache: 'no-store' });
    serverHttpOk = res.ok;
  } catch (_) {
    serverHttpOk = false;
  }
  updateLobbyConnectionUi();
}

function syncSocketConnectedFromClient() {
  if (reconnectPaused) return;
  const live = !!socket.connected;
  if (live !== socketConnected) {
    socketConnected = live;
    updateLobbyConnectionUi();
  }
}

function updateLobbyConnectionUi() {
  const statusEl = $('#connection-status');
  const createBtn = $('#btn-create');
  const joinBtn = $('#btn-join');
  if (statusEl) {
    let label = '서버 연결 중...';
    if (socketConnected) label = '서버 연결됨';
    else if (!serverHttpOk) label = '서버에 연결할 수 없습니다. node server.js 실행 후 F5';
    else label = '실시간 연결 중... 잠시 후 F5로 새로고침';
    statusEl.textContent = label;
    statusEl.classList.toggle('is-connected', socketConnected);
    statusEl.classList.toggle('is-connecting', !socketConnected);
  }
  if (createBtn) createBtn.disabled = !socketConnected;
  if (joinBtn) joinBtn.disabled = !socketConnected;
}

function startConnectionWatchers() {
  probeServerHealth();
  setInterval(probeServerHealth, 8000);
  setInterval(syncSocketConnectedFromClient, 1500);
}

function leaveRoom() {
  if (state && state.phase && !['none', 'lobby', 'game_over'].includes(state.phase)) {
    if (!window.confirm('게임 중입니다. 방을 나가면 로비로 돌아갑니다. 나가시겠습니까?')) return;
  }
  socket.emit('leaveRoom');
  localStorage.removeItem('mafia_roomCode');
  sessionStorage.removeItem('mafia_in_room_session');
  showToast('방에서 나갔습니다.');
}

function resetLobbyClientState() {
  selectedTargetId = null;
  chatStore.lobby = [];
  const roomInput = $('#room-code');
  if (roomInput) roomInput.value = '';
}

function requestJoin(roomCode) {
  if (!socketConnected) {
    return showToast('서버에 연결 중입니다. 잠시 후 다시 시도하세요.');
  }
  const nickname = getNickname();
  if (!nickname) return showToast('닉네임을 입력하세요.');
  localStorage.setItem('mafia_nickname', nickname);
  const code = roomCode ? String(roomCode).trim().toUpperCase() : null;
  if (code) localStorage.setItem('mafia_roomCode', code);
  else localStorage.removeItem('mafia_roomCode');
  socket.emit('join', { userID, nickname, roomCode: code });
}

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

function showToast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 3000);
}

function formatTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function runAnimation(className, options = {}) {
  document.body.classList.add(className);
  const fx = $('#fx-layer');
  const meta = FX_MAP[className];
  if (fx && meta && !options.silent) {
    fx.innerHTML = `<div class="fx-popup ${meta.cls}">${meta.text}</div>`;
    fx.classList.add('active');
    setTimeout(() => { fx.classList.remove('active'); fx.innerHTML = ''; }, 900);
  }
  if (options.targetId) flashPlayerCard(options.targetId, options.cardFx);
  const cleanup = () => document.body.classList.remove(className);
  document.body.addEventListener('animationend', cleanup, { once: true });
  setTimeout(cleanup, 2200);
}

function flashPlayerCard(playerId, fxClass) {
  if (!fxClass) return;
  const card = document.querySelector(`.player-card[data-id="${playerId}"]`);
  if (!card) return;
  card.classList.add(fxClass);
  setTimeout(() => card.classList.remove(fxClass), 900);
}

function hasNightSkill(role) {
  return [ROLE.MAFIA, ROLE.SPY, ROLE.POLICE, ROLE.DOCTOR, ROLE.REPORTER, ROLE.MEDIUM, ROLE.CULT_LEADER, ROLE.PRIVATE_DETECTIVE].includes(role);
}

function setPhaseTheme(phase) {
  document.body.classList.remove('phase-night', 'phase-day', 'has-night-skill');
  if (phase === 'night') {
    document.body.classList.add('phase-night');
    updateGameBgLayer(true);
    if (state && hasNightSkill(state.myRole)) {
      document.body.classList.add('has-night-skill');
    }
  } else {
    document.body.classList.add('phase-day');
    updateGameBgLayer(false);
  }
}

function startLocalTimer(remainingMs) {
  clearInterval(timerInterval);
  phaseEndEstimate = Date.now() + remainingMs;
  phaseTickNudgeAt = 0;
  const tick = () => {
    const left = phaseEndEstimate - Date.now();
    $('#timer-label').textContent = formatTime(left);
    if (
      left <= -2000
      && state
      && state.phase
      && state.phase !== 'lobby'
      && state.phase !== 'game_over'
      && socketConnected
    ) {
      const now = Date.now();
      if (!phaseTickNudgeAt || now - phaseTickNudgeAt > 3500) {
        phaseTickNudgeAt = now;
        socket.emit('requestPhaseTick');
      }
    }
  };
  tick();
  timerInterval = setInterval(tick, 500);
}

/* ─── Render ────────────────────────────────────────────────────────────────── */

function getPlayBaseUrl() {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin;
  }
  if (state && state.serverInfo && state.serverInfo.playUrl) {
    return state.serverInfo.playUrl.replace(/\/$/, '');
  }
  return '';
}

function getInviteUrl(roomCode) {
  const base = getPlayBaseUrl();
  if (!base) return '';
  if (!roomCode) return base;
  return `${base}/?room=${encodeURIComponent(roomCode)}`;
}

async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (_) {
    return false;
  }
}

function renderServerInfo(info) {
  const el = $('#server-info');
  if (!el) return;

  const base = getPlayBaseUrl() || (info && info.playUrl) || '';
  const isWeb =
    (info && info.accessMode === 'web')
    || (base && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(base));

  if (isWeb && base) {
    el.innerHTML =
      `<p class="server-info-label">게임 접속 주소</p>` +
      `<div class="server-info-url-row">` +
      `<strong id="play-url-display">${escapeHtml(base)}</strong>` +
      `<button type="button" id="btn-copy-play-url" class="btn btn-secondary btn-sm">복사</button>` +
      `</div>` +
      `<span class="hint">이 웹 주소를 친구에게 보낸 뒤, 방 코드로 참가하면 됩니다.</span>`;

    const copyBtn = $('#btn-copy-play-url');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const ok = await copyTextToClipboard(base);
        showToast(ok ? '접속 주소를 복사했습니다.' : '복사에 실패했습니다.');
      }, { once: false });
    }
    return;
  }

  const port = info ? info.port : 3000;
  el.innerHTML =
    `<p class="server-info-label">로컬 테스트</p>` +
    `<div class="server-info-url-row">` +
    `<strong>http://localhost:${port}</strong>` +
    `</div>` +
    `<span class="hint">웹 공개 접속은 Render 등에 배포하거나 PUBLIC_URL 환경 변수를 설정하세요.</span>`;
}

function updateInviteButton() {
  const btn = $('#btn-copy-invite');
  if (!btn) return;
  btn.hidden = !(state && state.phase === 'lobby' && state.roomCode);
}

async function copyInviteLink() {
  if (!state || !state.roomCode) return;
  const ok = await copyTextToClipboard(getInviteUrl(state.roomCode));
  showToast(ok ? '초대 링크를 복사했습니다.' : '복사에 실패했습니다.');
}

function renderFromState() {
  if (!state) return;

  if (state.phase === 'none' || !state.roomCode) {
    showScreen('lobby');
    if (state.serverInfo) renderServerInfo(state.serverInfo);
    const savedCode = localStorage.getItem('mafia_roomCode');
    const wasInGame = sessionStorage.getItem('mafia_in_room_session');
    if (savedCode && wasInGame && socketConnected) {
      showToast(`진행 중이던 방 ${savedCode}에 다시 붙습니다. 잠시만 기다려 주세요.`);
      pendingRoomRejoin = savedCode;
      rejoinAttempts = 0;
      const nick = getNickname() || localStorage.getItem('mafia_nickname') || '플레이어';
      socket.emit('join', { userID, nickname: nick, roomCode: savedCode, autoReconnect: true });
    }
    return;
  }

  if (state.phase === 'lobby') {
    showScreen('waiting');
    $('#display-room-code').textContent = state.roomCode;
    $('#player-count-label').textContent = `${state.playerCount} / ${state.maxPlayers}`;
    if (Array.isArray(state.lobbyChat)) chatStore.lobby = state.lobbyChat;
    renderLobbyMyCard();
    renderLobbySlots();
    renderLobbyChat();
    $('#btn-start').disabled = !state.isHost || state.playerCount < state.minPlayers;
    $('#host-hint').textContent = state.isHost
      ? (state.playerCount < state.minPlayers
        ? `게임 시작하려면 최소 ${state.minPlayers}명이 필요합니다.`
        : '준비가 되면 게임을 시작하세요.')
      : '호스트만 게임을 시작할 수 있습니다.';
    $('#bot-controls').hidden = !state.isHost;
    $('#bot-count-label').textContent = `봇 ${state.botCount || 0}명`;
    $('#btn-remove-bot').disabled = !state.botCount;
    updateInviteButton();
    return;
  }

  if (state.phase === 'game_over') {
    dismissGameOverlays();
    showScreen('gameover');
    const winMsg = state.winner === 'mafia'
      ? '마피아 팀 승리!'
      : (state.winner === 'cult' ? '교주 팀 승리!' : '시민 팀 승리!');
    $('#gameover-message').textContent = winMsg;
    $('#gameover-roles').innerHTML = state.players.map(p =>
      `<li class="gameover-role-row">` +
      (p.role ? buildRoleProfileCard(p.role, { compact: true }) : '') +
      `<span class="go-name">${p.nickname}</span></li>`
    ).join('');
    const btnNew = $('#btn-new-game');
    const hint = $('#gameover-hint');
    if (btnNew) {
      btnNew.hidden = !state.isHost;
      btnNew.disabled = false;
    }
    if (hint) {
      hint.textContent = state.isHost
        ? '플레이어를 확인한 뒤 새 게임을 시작하세요.'
        : '호스트가 새 게임을 시작할 때까지 대기합니다.';
    }
    return;
  }

  showScreen('game');
  setPhaseTheme(state.phase === 'night' ? 'night' : 'day');
  renderM42Chrome();
  if (state.phaseRemainingMs != null) startLocalTimer(state.phaseRemainingMs);

  if (Array.isArray(state.dayChat)) {
    const me = state.players.find(p => p.id === state.myPlayerId);
    const seeDeadInDay = me && ((me.alive && state.myRole === ROLE.MEDIUM) || !me.alive);
    chatStore.day = seeDeadInDay
      ? state.dayChat
      : state.dayChat.filter((m) => !m.isDead);
  }
  if (Array.isArray(state.deadChat)) chatStore.dead = state.deadChat;
  if (Array.isArray(state.mafiaChat)) chatStore.mafia = state.mafiaChat;
  if (Array.isArray(state.cultChat)) chatStore.cult = state.cultChat;
  if (Array.isArray(state.lastWordsChat)) chatStore.lastWords = state.lastWordsChat;

  if (state.myRoleLabel && !state.myRole) {
    const badge = $('#my-role-badge');
    if (badge) badge.textContent = `내 직업: ${state.myRoleLabel}`;
  }

  renderMyRoleSidebar();

  if (state.dawnAnnouncements && state.dawnAnnouncements.length) {
    $('#dawn-announcements').innerHTML = state.dawnAnnouncements.map(a => `<div>${a}</div>`).join('');
  } else {
    $('#dawn-announcements').innerHTML = '';
  }

  const alive = state.players.filter(p => p.alive).length;
  $('#alive-count-label').textContent = `(${alive}생존)`;

  renderRoleGuide();
  renderM42Glossary();
  renderTimeButtons();
  renderPlayerGrid();
  renderActionPanel();
  updateChatTabs();
  updateExecutionVoteOverlay();
}

function renderLobbyMyCard() {
  const el = $('#lobby-my-card');
  if (!el || !state) return;
  const me = state.players.find(p => p.id === state.myPlayerId);
  if (!me) {
    el.innerHTML = '';
    return;
  }
  const initial = me.nickname.slice(0, 1).toUpperCase();
  el.innerHTML =
    `<div class="lobby-my-avatar">${initial}</div>` +
    `<div class="lobby-my-meta">` +
    `<span class="lobby-my-name">${escapeHtml(me.nickname)}</span>` +
    `<span class="lobby-my-tags">` +
    `${me.isHost ? '<span class="host-tag">호스트</span>' : ''}` +
    `${me.isBot ? '<span class="bot-tag">봇</span>' : ''}` +
    `${!me.connected ? '<span class="offline-tag">재연결 중</span>' : ''}` +
    `</span></div>`;
}

function renderLobbySlots() {
  const grid = $('#lobby-player-slots');
  if (!grid || !state) return;
  const max = state.maxPlayers || 12;
  const slots = [];
  for (let i = 0; i < max; i++) {
    const p = state.players[i];
    if (p) {
      const initial = p.nickname.slice(0, 1).toUpperCase();
      slots.push(
        `<div class="lobby-slot filled${p.connected ? '' : ' offline'}">` +
        `<span class="lobby-slot-num">${i + 1}</span>` +
        `<div class="lobby-slot-avatar">${initial}</div>` +
        `<span class="lobby-slot-name">${escapeHtml(p.nickname)}</span>` +
        `${p.isHost ? '<span class="lobby-slot-badge host">H</span>' : ''}` +
        `${p.isBot ? '<span class="lobby-slot-badge bot">B</span>' : ''}` +
        `</div>`
      );
    } else {
      slots.push(
        `<div class="lobby-slot empty">` +
        `<span class="lobby-slot-num">${i + 1}</span>` +
        `<div class="lobby-slot-avatar empty-mark">+</div>` +
        `<span class="lobby-slot-name">빈 슬롯</span>` +
        `</div>`
      );
    }
  }
  grid.innerHTML = slots.join('');
}

function renderLobbyChat() {
  const list = $('#lobby-chat-messages');
  if (!list) return;
  const wasNearBottom =
    forceLobbyScrollBottom
    || (list.scrollHeight - (list.scrollTop + list.clientHeight) <= 40);
  const msgs = chatStore.lobby || [];
  const myId = state ? state.myPlayerId : null;
  list.innerHTML = msgs.map(m => {
    if (m.system) {
      return `<li class="chat-msg system"><span class="chat-bubble system">${escapeHtml(m.text)}</span></li>`;
    }
    const isMine = m.fromId === myId;
    const cls = isMine ? 'mine' : 'theirs';
    const nameHtml = isMine ? '' : `<span class="chat-name">${escapeHtml(m.from)}</span>`;
    return `<li class="chat-msg ${cls}">${nameHtml}<span class="chat-bubble">${escapeHtml(m.text)}</span></li>`;
  }).join('');
  if (wasNearBottom) list.scrollTop = list.scrollHeight;
  forceLobbyScrollBottom = false;
}

const ROLE_PORTRAIT_VERSION = '9';
const UI_ASSET_VERSION = '6';
const PHASE_ILLUSTRATION_COUNT = 5;

let voteTimeOverlayTimer = null;
let voteResultsOverlayTimer = null;

function uiAssetUrl(name) {
  return `/assets/ui/${name}?v=${UI_ASSET_VERSION}`;
}

function phaseIllustrationUrl(kind, index, ext = 'png') {
  const base = kind === 'night' ? 'night_fall' : 'day_dawn';
  const slot = ((Math.max(1, index) - 1) % PHASE_ILLUSTRATION_COUNT) + 1;
  const suffix = ext === 'svg' ? 'svg' : 'png';
  return uiAssetUrl(`${base}_${slot}.${suffix}`);
}

function getPhaseTransitionOverlay() {
  const direct = document.body.querySelector(':scope > #phase-transition-overlay');
  return direct || document.getElementById('phase-transition-overlay');
}

function updateGameBgLayer(isNight) {
  const layer = document.getElementById('game-bg-layer');
  if (!layer) return;
  const name = isNight ? 'bg_night' : 'bg_day';
  layer.style.backgroundImage =
    `url('${uiAssetUrl(`${name}.png`)}'), url('${uiAssetUrl(`${name}.svg`)}')`;
}

function getPlayerSlotIndex(playerId) {
  if (!state || !state.players) return '?';
  const idx = state.players.findIndex((p) => p.id === playerId);
  return idx >= 0 ? idx + 1 : '?';
}

/** 투표·최후변론 등 페이즈 전환 시 서버가 비운 확직·맞직·팀 힌트를 이전 값으로 보존 */
/** 서버 mafiaTeamRoster / privateInfo 팀 목록 → 플레이어 슬롯 빨간 테두리·팀 배지 */
function applyMafiaTeamRoster(roster) {
  if (!state?.players?.length || !roster?.length) return;
  for (const t of roster) {
    const p = state.players.find((pl) => pl.id === t.id);
    if (!p) continue;
    p.isMafiaTeammate = true;
    if (t.role) p.role = t.role;
    if (t.roleLabel) p.roleLabel = t.roleLabel;
  }
}

function mergePlayerVisualHints(prevPlayers, nextPlayers) {
  if (!prevPlayers?.length || !nextPlayers?.length) return nextPlayers;
  const prevById = Object.fromEntries(prevPlayers.map((p) => [p.id, p]));
  return nextPlayers.map((p) => {
    const old = prevById[p.id];
    if (!old) return p;
    return {
      ...p,
      publicConfirmedRole: p.publicConfirmedRole || old.publicConfirmedRole,
      matchedClaimRole: p.matchedClaimRole ?? null,
      isMatchedPoliceClaim: !!p.isMatchedPoliceClaim,
      isMafiaTeammate: p.isMafiaTeammate ?? old.isMafiaTeammate,
      isCultFollower: p.isCultFollower ?? old.isCultFollower,
      role: p.role || old.role,
      roleLabel: p.roleLabel || old.roleLabel
    };
  });
}

/** 채팅·투표 등: renderPlayerGrid와 동일 규칙으로 직업 초상(공개·맞경·유추·사망 숨김) */
function buildPlayerAvatarInner(playerId) {
  if (!state || !Array.isArray(state.players)) return '?';
  const myId = state.myPlayerId;
  const isSelf = playerId === myId;
  if (isSelf && state.myRole) return buildRolePortraitHtml(state.myRole);

  const note = getPlayerNote(playerId);
  const p = findPlayerInState(playerId);

  if (!p) {
    if (note.guessedRole) {
      const guessed = note.guessedRole;
      const label = formatGuessedRoleLabel(guessed);
      const initial = (ROLE_GUIDE[guessed] && ROLE_GUIDE[guessed].name.slice(0, 1)) || '?';
      return `<img src="${rolePortraitUrl(guessed)}" alt="${escapeHtml(label)}" loading="lazy" onerror="${rolePortraitImgOnerror(initial, guessed)}">`;
    }
    const safeId = String(playerId);
    return '<button type="button" class="chat-avatar-guess-btn" data-guess-id="' + escapeHtml(safeId) + '" aria-label="직업 유추">' +
      '<span class="role-portrait-fallback">?</span></button>';
  }

  const confirmedRole =
    p.publicConfirmedRole && ROLE_GUIDE[p.publicConfirmedRole] ? p.publicConfirmedRole : null;
  const matchedClaimRole =
    p.matchedClaimRole && ROLE_GUIDE[p.matchedClaimRole] ? p.matchedClaimRole : null;
  const showMatBadges = !!state.showMatchedClaimBadges;
  const isMatchedPoliceClaim = showMatBadges && !!p.isMatchedPoliceClaim && !confirmedRole;
  const isMatchedRoleClaim = showMatBadges && !!matchedClaimRole && !confirmedRole;
  const isTeammate = !isSelf && p.isMafiaTeammate;
  const isCultFollower = !isSelf && p.isCultFollower;
  const isDead = !p.alive;
  const deadHasPublicRoleHint = !!(
    confirmedRole
    || isMatchedPoliceClaim
    || isMatchedRoleClaim
    || isTeammate
    || isCultFollower
  );
  const hideDeadPrivateGuess = isDead && !deadHasPublicRoleHint;
  const showGuessedPortrait = !!(note.guessedRole && !hideDeadPrivateGuess);

  let roleForAvatar = null;
  if (isTeammate) roleForAvatar = p.role;
  else if (isCultFollower) roleForAvatar = p.role;
  else if (confirmedRole) roleForAvatar = confirmedRole;
  else if (isMatchedRoleClaim) roleForAvatar = matchedClaimRole;
  else if (isMatchedPoliceClaim) roleForAvatar = ROLE.POLICE;

  if (roleForAvatar) {
    return buildRolePortraitHtml(roleForAvatar);
  }
  if (showGuessedPortrait) {
    const guessed = note.guessedRole;
    const label = formatGuessedRoleLabel(guessed);
    const initial = (ROLE_GUIDE[guessed] && ROLE_GUIDE[guessed].name.slice(0, 1)) || '?';
    return `<img src="${rolePortraitUrl(guessed)}" alt="${escapeHtml(label)}" loading="lazy" onerror="${rolePortraitImgOnerror(initial, guessed)}">`;
  }

  const safeId = String(playerId);
  return '<button type="button" class="chat-avatar-guess-btn" data-guess-id="' + escapeHtml(safeId) + '" aria-label="직업 유추">' +
    '<span class="role-portrait-fallback">?</span></button>';
}

function buildChatProfileHtml(playerId) {
  return `<div class="chat-profile">` +
    `<span class="chat-profile-slot">${getPlayerSlotIndex(playerId)}</span>` +
    `<div class="chat-profile-avatar">${buildPlayerAvatarInner(playerId)}</div>` +
    `</div>`;
}

function showVoteTimeOverlay() {
  const overlay = $('#vote-time-overlay');
  const img = $('#vote-time-img');
  if (!overlay || !img) return;
  delete img.dataset.fallback;
  const voteUrl = uiAssetUrl('vote_time.svg');
  img.decoding = 'async';
  img.onerror = () => {
    if (!img.dataset.fallback) {
      img.dataset.fallback = '1';
      img.src = voteUrl;
    }
  };
  img.src = voteUrl;
  overlay.hidden = false;
  clearTimeout(voteTimeOverlayTimer);
  voteTimeOverlayTimer = setTimeout(() => {
    overlay.hidden = true;
  }, 3000);
}

function showVoteTimeOverlayAsync() {
  return new Promise((resolve) => {
    showVoteTimeOverlay();
    clearTimeout(voteTimeOverlayTimer);
    voteTimeOverlayTimer = setTimeout(() => {
      hideVoteTimeOverlay();
      resolve();
    }, 3000);
  });
}

function hideVoteTimeOverlay() {
  const overlay = $('#vote-time-overlay');
  if (overlay) overlay.hidden = true;
  clearTimeout(voteTimeOverlayTimer);
}

function showVoteResultsOverlay(data) {
  hideVoteTimeOverlay();
  const overlay = $('#vote-results-overlay');
  const list = $('#vote-results-list');
  const titleEl = overlay ? overlay.querySelector('.vote-results-title') : null;
  if (!overlay || !list || !data) return;

  if (titleEl) {
    if (data.tie) {
      titleEl.textContent = '투표 결과 — 동점 (처형 없음)';
    } else if (data.noVotes) {
      titleEl.textContent = '투표 결과 — 무투표 (처형 없음)';
    } else if (data.topCandidateId) {
      const top = (data.rows || []).find((r) => r.playerId === data.topCandidateId);
      titleEl.textContent = top
        ? `투표 결과 — ${top.nickname}님 최다 득표 (찬반 투표 진행)`
        : '투표 결과';
    } else {
      titleEl.textContent = '투표 결과';
    }
  }

  list.innerHTML = (data.rows || []).map((row) => {
    const marks = Array.from({ length: row.votes }, () => '<span class="vote-tally-mark"></span>').join('');
    const topCls = row.playerId === data.topCandidateId && row.votes > 0 ? ' is-top' : '';
    return `<li class="vote-results-row${topCls}">` +
      `<div class="vote-results-avatar">${buildPlayerAvatarInner(row.playerId)}</div>` +
      `<span class="vote-results-name">${escapeHtml(row.nickname)}</span>` +
      `<div class="vote-results-marks">${marks}</div>` +
      `<span class="vote-results-count">${row.votes}</span>` +
      `</li>`;
  }).join('');

  overlay.hidden = false;
  clearTimeout(voteResultsOverlayTimer);
  voteResultsOverlayTimer = setTimeout(() => {
    overlay.hidden = true;
  }, 5000);
}

function showVoteResultsOverlayAsync(data) {
  return new Promise((resolve) => {
    showVoteResultsOverlay(data);
    clearTimeout(voteResultsOverlayTimer);
    voteResultsOverlayTimer = setTimeout(() => {
      hideVoteResultsOverlay();
      resolve();
    }, 5000);
  });
}

function hideVoteResultsOverlay() {
  const overlay = $('#vote-results-overlay');
  if (overlay) overlay.hidden = true;
  clearTimeout(voteResultsOverlayTimer);
}

function rolePortraitUrl(role, ext) {
  if (!role) return '';
  const suffix = ext === 'png' ? 'png' : 'svg';
  return `/assets/roles/${role}.${suffix}?v=${ROLE_PORTRAIT_VERSION}`;
}

function rolePortraitImgOnerror(initial, role) {
  const fb = rolePortraitUrl(role, 'svg');
  return "if(this.dataset.fallback){this.outerHTML='<div class=\\'role-portrait-fallback\\'>" +
    initial + "</div>'}else{this.dataset.fallback='1';this.src='" + fb + "'}";
}

function buildRolePortraitHtml(role, opts = {}) {
  if (!role || !ROLE_GUIDE[role]) {
    return '<div class="role-portrait-fallback">?</div>';
  }
  const g = ROLE_GUIDE[role];
  const url = rolePortraitUrl(role, 'png');
  const initial = g.name.slice(0, 1);
  const largeCls = opts && opts.large ? ' role-portrait-large' : '';
  return `<img class="role-portrait-img${largeCls}" src="${url}" alt="${g.name}" loading="lazy" ` +
    `onerror="${rolePortraitImgOnerror(initial, role)}">`;
}

function renderM42Chrome() {
  if (!state) return;
  const alive = state.players.filter(p => p.alive).length;
  const total = state.players.length;
  const nightIdx = state.nightIndex || 0;
  const dayIdx = state.dayIndex || 0;
  const isNight = state.phase === 'night';

  const roomCodeEl = $('#game-room-code');
  if (roomCodeEl) roomCodeEl.textContent = state.roomCode || '----';

  const aliveTop = $('#alive-count-top');
  if (aliveTop) aliveTop.textContent = `${alive}/${total}`;

  const gridCount = $('#player-grid-count');
  if (gridCount) gridCount.textContent = `${alive} 생존`;

  const phaseIcon = $('#phase-icon');
  if (phaseIcon) phaseIcon.textContent = isNight ? '🌙' : '☀️';

  const phaseIndex = $('#phase-index-label');
  if (phaseIndex) {
    if (isNight && nightIdx > 0) phaseIndex.textContent = `${nightIdx}번째 밤`;
    else if (!isNight && dayIdx > 0) phaseIndex.textContent = `${dayIdx}번째 낮`;
    else phaseIndex.textContent = PHASE_LABELS[state.phase] || state.phase;
  }

  const phaseSub = $('#phase-label');
  if (phaseSub) phaseSub.textContent = PHASE_LABELS[state.phase] || state.phase;

  const tipEl = $('#role-tip-text');
  if (tipEl) {
    if (state.myRole && ROLE_GUIDE[state.myRole]) {
      const g = ROLE_GUIDE[state.myRole];
      tipEl.textContent = g.tip + ' — ' + g.desc;
    } else {
      tipEl.textContent = '게임이 시작되면 직업 팁이 표시됩니다.';
    }
  }

  const bannerMain = $('#phase-banner-main');
  const bannerSub = $('#phase-banner-sub');
  if (bannerMain && bannerSub) {
    if (state.phase === 'night') {
      bannerMain.textContent = state.myRoleLabel ? `당신의 직업은 ${state.myRoleLabel} 입니다` : '밤이 되었습니다';
      bannerSub.textContent = '능력을 사용할 대상을 선택하세요';
    } else if (state.phase === 'dawn') {
      bannerMain.textContent = '아침이 밝았습니다';
      bannerSub.textContent = '밤 결과 확인 중입니다. 잠시 대화할 수 없습니다.';
    } else if (state.phase === 'day_chat') {
      bannerMain.textContent = dayIdx > 0 ? `${dayIdx}번째 낮` : '낮 토론';
      bannerSub.textContent = '대화를 통해 추리하세요';
    } else if (state.phase === 'day_vote') {
      bannerMain.textContent = '투표 시간';
      bannerSub.textContent = '의심되는 플레이어에게 투표하세요';
    } else if (state.phase === 'execution_vote') {
      bannerMain.textContent = '찬반 투표';
      bannerSub.textContent = '처형 여부를 결정하세요';
    } else if (state.phase === 'last_words') {
      bannerMain.textContent = '최후의 반론';
      bannerSub.textContent = '최다 득표자의 변론을 들으세요';
    } else {
      bannerMain.textContent = PHASE_LABELS[state.phase] || '게임 진행 중';
      bannerSub.textContent = '채팅으로 전략을 나누세요';
    }
  }
}

function renderMyRoleSidebar() {
  const portrait = $('#my-role-portrait');
  const nameLine = $('#my-role-name-line');
  const teamLine = $('#my-role-team-line');
  if (!portrait || !nameLine || !teamLine) return;

  if (state && state.myRole && ROLE_GUIDE[state.myRole]) {
    const g = ROLE_GUIDE[state.myRole];
    portrait.innerHTML = buildRolePortraitHtml(state.myRole, { large: true });
    nameLine.textContent = g.name;
    nameLine.className = `m42-role-name role-${state.myRole}`;
    teamLine.textContent = g.team;
  } else if (state && state.myRoleLabel) {
    portrait.innerHTML = '<div class="role-portrait-fallback">?</div>';
    nameLine.textContent = state.myRoleLabel;
    nameLine.className = 'm42-role-name';
    teamLine.textContent = '직업 배정됨';
  } else {
    portrait.innerHTML = '<div class="role-portrait-fallback">?</div>';
    nameLine.textContent = '직업 미배정';
    nameLine.className = 'm42-role-name';
    teamLine.textContent = '-';
  }
}

let phaseTransitionTimer = null;
let skillNoticeTimer = null;

function showSkillNoticeInner(data) {
  const el = $('#skill-notice');
  const badge = $('#skill-notice-badge');
  const title = $('#skill-notice-title');
  const body = $('#skill-notice-body');
  if (!el || !badge || !title || !body || !data) return;

  const isPublic = data.scope === 'public';
  el.classList.toggle('is-public', isPublic);
  el.classList.toggle('is-private', !isPublic);
  badge.textContent = isPublic ? '전체 공지' : '나만 보는 정보';
  title.textContent = data.title || '능력 정보';
  body.textContent = data.message || '';
  el.hidden = false;
  return isPublic;
}

function showSkillNoticeAsync(data) {
  return new Promise((resolve) => {
    const isPublic = showSkillNoticeInner(data);
    if (isPublic === undefined) {
      resolve();
      return;
    }
    const ms = isPublic ? 4500 : 9000;
    clearTimeout(skillNoticeTimer);
    skillNoticeTimer = setTimeout(() => {
      const el = $('#skill-notice');
      if (el) el.hidden = true;
      resolve();
    }, ms);
  });
}

function showSkillNotice(data) {
  if (!data) return;
  const motionKinds = new Set([
    'mafia_kill', 'doctor_heal', 'soldier_block', 'quiet_night', 'vote_execution',
    'vote_rejected', 'vote_tie', 'politician_immunity', 'cult_proselytize'
  ]);
  if (data.scope === 'public' && motionKinds.has(data.kind)) {
    return;
  }
  if (data.scope === 'public' && typeof window.enqueuePresentation === 'function') {
    window.enqueuePresentation(() => showSkillNoticeAsync(data), `skill:${data.kind || 'public'}`);
    return;
  }
  showSkillNoticeInner(data);
  clearTimeout(skillNoticeTimer);
  skillNoticeTimer = setTimeout(() => {
    const el = $('#skill-notice');
    if (el) el.hidden = true;
  }, data.scope === 'public' ? 4500 : 9000);
}

function showPhaseTransition(kind, title, caption, index = 1) {
  const overlay = getPhaseTransitionOverlay();
  const img = document.getElementById('phase-transition-img');
  const titleEl = document.getElementById('phase-transition-title');
  const captionEl = document.getElementById('phase-transition-caption');
  if (!overlay || !img || !titleEl || !captionEl) return;

  const srcChain = [
    phaseIllustrationUrl(kind, index, 'png'),
    phaseIllustrationUrl(kind, index, 'svg'),
    uiAssetUrl(kind === 'night' ? 'night_fall.png' : 'day_dawn.png'),
    uiAssetUrl(kind === 'night' ? 'night_fall.svg' : 'day_dawn.svg')
  ];
  let chainStep = 0;
  delete img.dataset.fallback;
  img.decoding = 'async';
  img.onerror = () => {
    chainStep += 1;
    if (chainStep < srcChain.length) {
      img.src = srcChain[chainStep];
      return;
    }
    img.alt = title;
  };
  img.src = srcChain[0];
  titleEl.textContent = title;
  captionEl.textContent = caption;
  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');

  clearTimeout(phaseTransitionTimer);
  phaseTransitionTimer = setTimeout(() => {
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
  }, 3800);
}

function showPhaseTransitionAsync(kind, title, caption, index = 1) {
  return new Promise((resolve) => {
    showPhaseTransition(kind, title, caption, index);
    clearTimeout(phaseTransitionTimer);
    phaseTransitionTimer = setTimeout(() => {
      const ov = getPhaseTransitionOverlay();
      if (ov) {
        ov.hidden = true;
        ov.setAttribute('aria-hidden', 'true');
      }
      resolve();
    }, 3800);
  });
}

function showRoleReveal(role) {
  const overlay = $('#role-reveal-overlay');
  const card = $('#role-reveal-card');
  const desc = $('#role-reveal-desc');
  const kicker = $('#role-reveal-kicker');
  if (!overlay || !card || !desc || !role || !ROLE_GUIDE[role]) return;

  const g = ROLE_GUIDE[role];
  if (kicker) kicker.textContent = '당신의 직업은';
  card.innerHTML =
    buildRolePortraitHtml(role) +
    `<div class="role-reveal-title">${g.name} · ${g.team}</div>`;
  let descText = g.desc;
  if (role === ROLE.MAFIA && state && state.players) {
    const mates = state.players.filter(p => p.isMafiaTeammate);
    if (mates.length) {
      descText += `\n\n팀 동료: ${mates.map(m => m.nickname).join(', ')} (플레이어 목록에 빨간 테두리)`;
    }
  }
  desc.textContent = descText;
  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => {
    const btn = $('#btn-role-reveal-close');
    if (btn) btn.focus();
  });
}

function formatMafiaTeammateList(teammates) {
  if (!teammates || !teammates.length) return '';
  return teammates.map(t => `${t.nickname}(${t.roleLabel || '팀'})`).join(', ');
}

function showMafiaTeamNotice(teammates) {
  if (!state) return;
  const onMafiaSide = state.myRole === ROLE.MAFIA || state.joinedMafiaChat;
  if (!onMafiaSide) return;
  if (teammates?.length) applyMafiaTeamRoster(teammates);
  const list = teammates?.length
    ? formatMafiaTeammateList(teammates)
    : formatMafiaTeammateList(
      state.players.filter((p) => p.isMafiaTeammate).map((p) => ({
        nickname: p.nickname,
        roleLabel: p.roleLabel
      }))
    );
  const count = state.mafiaTeamCount != null
    ? state.mafiaTeamCount
    : state.players.filter((p) => p.isMafiaTeammate).length;
  setTimeout(() => {
    if (list) {
      showToast(`마피아 팀 동료 ${count}명: ${list} (목록 빨간 테두리)`);
    } else if (state.myRole === ROLE.MAFIA) {
      showToast('마피아 팀 동료가 표시되지 않았습니다. 새로고침(F5) 후 같은 방에 다시 참가해 보세요.');
    } else {
      showToast('마피아 팀에 합류했습니다. 동료는 밤에 공개될 수 있습니다.');
    }
  }, 900);
}

function closeRoleReveal() {
  const overlay = $('#role-reveal-overlay');
  if (!overlay) return;
  const active = document.activeElement;
  if (active && overlay.contains(active)) active.blur();
  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
}

function showReporterReveal(data) {
  const overlay = $('#reporter-reveal-overlay');
  const targetEl = $('#reporter-reveal-target');
  const roleCard = $('#reporter-reveal-role-card');
  if (!overlay || !targetEl || !roleCard || !data || !data.role) return;

  targetEl.textContent = `${data.targetName}님의 직업은`;
  roleCard.innerHTML =
    buildRolePortraitHtml(data.role) +
    `<div class="reporter-reveal-role-label role-${data.role}">${escapeHtml(data.roleLabel)}</div>`;
  overlay.hidden = false;
  document.body.classList.add('anim-reporter-reveal');
  runAnimation('anim-reporter-flash', { silent: true });
  AudioManager.playSFX('day');
}

function closeReporterReveal() {
  const overlay = $('#reporter-reveal-overlay');
  if (overlay) overlay.hidden = true;
  document.body.classList.remove('anim-reporter-reveal');
}

function buildRoleProfileCard(role, { mine = false, compact = false } = {}) {
  if (!role || !ROLE_GUIDE[role]) return '';
  const g = ROLE_GUIDE[role];
  const cls = `role-profile-card role-${role}${mine ? ' is-mine' : ''}${compact ? ' compact' : ''}`;
  const url = rolePortraitUrl(role);
  const initial = g.name.slice(0, 1);
  return `<div class="${cls}">` +
    `<img class="role-portrait-img" src="${url}" alt="${g.name}" loading="lazy" ` +
    `onerror="${rolePortraitImgOnerror(initial, role)}">` +
    `<div class="role-portrait-label">${g.name}</div>` +
    `<div class="role-portrait-team">${g.team}</div>` +
    `</div>`;
}

function buildRoleEncyclopediaItem(roleKey, g, { mine = false, open = false } = {}) {
  const cls = `role-encyclopedia-item role-${roleKey}${mine ? ' is-mine' : ''}`;
  return `<details class="${cls}"${open ? ' open' : ''}>` +
    `<summary><span class="re-name">${g.name}</span><span class="re-team">${g.team}</span></summary>` +
    `<div class="re-body"><p class="re-desc">${g.desc}</p><p class="re-tip">TIP: ${g.tip}</p></div>` +
    `</details>`;
}

function renderGameInfo() {
  if (!state) return;
  const alive = state.players.filter(p => p.alive).length;
  $('#alive-count-label').textContent = `(${alive}생존)`;
}

function renderM42Glossary() {
  let list = $('#m42-glossary-list');
  if (!list) {
    const anchor = document.querySelector('.role-guide-card');
    if (!anchor || document.querySelector('.m42-glossary-card')) return;
    const details = document.createElement('details');
    details.className = 'm42-fold info-card m42-glossary-card';
    details.innerHTML = '<summary>마피아42 용어</summary><ul id="m42-glossary-list" class="m42-glossary-list"></ul>';
    anchor.insertAdjacentElement('afterend', details);
    list = $('#m42-glossary-list');
  }
  if (!list) return;
  list.innerHTML = M42_GLOSSARY.map((g) =>
    `<li><strong>${escapeHtml(g.term)}</strong> — ${escapeHtml(g.mean)}</li>`
  ).join('');
}

function renderRoleGuide() {
  const myRole = state.myRole;
  const detail = $('#my-role-detail');
  const list = $('#role-guide-list');
  if (!detail || !list) return;

  if (myRole && ROLE_GUIDE[myRole]) {
    const g = ROLE_GUIDE[myRole];
    detail.innerHTML =
      '<div class="role-desc-wrap">' +
      '<div class="role-name-line">' + g.name + ' <span class="role-team-inline">' + g.team + '</span></div>' +
      '<div class="role-desc">' + g.desc + '</div>' +
      '<div class="role-tip">TIP: ' + g.tip + '</div></div>';
  } else {
    detail.innerHTML = '<div class="role-desc">직업이 배정되면 프로필이 표시됩니다.</div>';
  }

  list.innerHTML = Object.entries(ROLE_GUIDE).map(([key, g]) =>
    buildRoleEncyclopediaItem(key, g, { mine: key === myRole, open: key === myRole })
  ).join('');

  list.querySelectorAll('.role-encyclopedia-item').forEach((el) => {
    el.addEventListener('toggle', () => {
      if (!el.open) return;
      list.querySelectorAll('.role-encyclopedia-item').forEach((other) => {
        if (other !== el) other.open = false;
      });
    });
  });
}

function renderPlayerGrid() {
  const grid = $('#player-grid');
  if (!grid || !state || !Array.isArray(state.players)) return;
  const myId = state.myPlayerId;
  grid.innerHTML = state.players.map((p, i) => {
    const isSelf = p.id === myId;
    const isDead = !p.alive;
    const isCandidate = p.id === state.executionCandidateId;
    const note = getPlayerNote(p.id);
    const guessedLabel = formatGuessedRoleLabel(note.guessedRole);
    const confirmedRole =
      p.publicConfirmedRole && ROLE_GUIDE[p.publicConfirmedRole] ? p.publicConfirmedRole : null;
    const matchedClaimRole =
      p.matchedClaimRole && ROLE_GUIDE[p.matchedClaimRole] ? p.matchedClaimRole : null;
    const showMatBadges = !!state.showMatchedClaimBadges;
    const isMatchedPoliceClaim = showMatBadges && !!p.isMatchedPoliceClaim && !confirmedRole;
    const isMatchedRoleClaim = showMatBadges && !!matchedClaimRole && !confirmedRole;
    const confirmedLabel = confirmedRole ? formatGuessedRoleLabel(confirmedRole) : '';
    const isTeammate = !isSelf && p.isMafiaTeammate;
    const isCultFollower = !isSelf && p.isCultFollower;
    const isCultSelf = isSelf && !!state.joinedCult;
    const isCultMarked = viewerOnCultSideClient() && (
      (Array.isArray(state.cultMemberIds) && state.cultMemberIds.includes(p.id))
      || (Array.isArray(state.cultProselytizedIds) && state.cultProselytizedIds.includes(p.id))
    );
    /** 사망자: 성불·기자 등 공개 확정 또는 맞경/맞직·팀 공개가 없으면 직업 초상·유추 표시 숨김 */
    const deadHasPublicRoleHint = !!(
      confirmedRole
      || isMatchedPoliceClaim
      || isMatchedRoleClaim
      || isTeammate
      || isCultFollower
    );
    const hideDeadPrivateGuess = isDead && !deadHasPublicRoleHint;
    const hasPrivateGuess = !!note.guessedRole;
    const showGuessedPortrait = !!(hasPrivateGuess && !hideDeadPrivateGuess);
    const privateGuessLabel = hasPrivateGuess ? guessedLabel : '';
    let cls = 'player-card';
    if (isDead) cls += ' dead';
    if (state.phase === 'night' && state.myRole === ROLE.MEDIUM && isDead && canSelectPlayerSlot(p)) cls += ' medium-target';
    if (selectedTargetId === p.id) cls += ' selected';
    if (isCandidate) cls += ' candidate';
    if (isSelf) cls += ' is-self';
    if (showGuessedPortrait || hasPrivateGuess || confirmedRole || isMatchedPoliceClaim || isMatchedRoleClaim) cls += ' has-guess';
    const isPdWatch = state.myRole === ROLE.PRIVATE_DETECTIVE && state.myPrivateDetectiveWatchId === p.id;
    const isPdPointed = state.myRole === ROLE.PRIVATE_DETECTIVE && state.myPrivateDetectivePointedId === p.id;
    if (isTeammate) cls += ' mafia-teammate';
    if (isCultFollower || isCultSelf) cls += ' cult-follower';
    if (isCultMarked) cls += ' cult-marked';
    if (isCultSelf && state.myRole !== ROLE.CULT_LEADER) cls += ' cult-self';
    if (isPdWatch) cls += ' pd-watch';
    if (isPdPointed) cls += ' pd-pointed';
    if (isMatchedPoliceClaim) cls += ' matched-police';
    if (isMatchedRoleClaim) cls += ' matched-role';

    let status = isDead ? '사망' : (p.connected ? '' : '재연결');
    if (isCandidate) status = '처형 후보';
    if (isTeammate) status = status || '팀';
    if (isCultFollower) {
      status = status || (p.isCultLeaderAlly ? '교주' : '신도');
    }
    if (isCultSelf && state.myRole !== ROLE.CULT_LEADER) status = status || '신도';

    const teammateRole = isTeammate ? p.role : (isCultFollower ? p.role : null);
    let roleForAvatar = null;
    if (isSelf && state.myRole) roleForAvatar = state.myRole;
    else if (teammateRole) roleForAvatar = teammateRole;
    else if (confirmedRole) roleForAvatar = confirmedRole;
    else if (isMatchedRoleClaim) roleForAvatar = matchedClaimRole;
    else if (isMatchedPoliceClaim) roleForAvatar = ROLE.POLICE;

    const showRoleImg = !!roleForAvatar;
    const avatarInner = showRoleImg
      ? buildRolePortraitHtml(roleForAvatar)
      : (showGuessedPortrait
        ? (() => {
          const guessed = note.guessedRole;
          const gi = (ROLE_GUIDE[guessed] && ROLE_GUIDE[guessed].name.slice(0, 1)) || '?';
          return `<img src="${rolePortraitUrl(guessed)}" alt="${guessedLabel}" loading="lazy" onerror="${rolePortraitImgOnerror(gi, guessed)}">`;
        })()
        : '?');

    let guessHtml;
    if (isTeammate) {
      guessHtml = `<span class="slot-team-badge role-${p.role}" title="마피아 팀">${escapeHtml(p.roleLabel || '팀')}</span>`;
    } else if (isCultFollower) {
      const cultBadge = p.isCultLeaderAlly
        ? '교주'
        : `신도 · ${escapeHtml(p.roleLabel || '신도')}`;
      guessHtml = `<span class="slot-team-badge is-cult role-${p.role}" title="교주팀">${cultBadge}</span>`;
    } else if (isCultSelf && state.myRole !== ROLE.CULT_LEADER) {
      guessHtml = '<span class="slot-team-badge is-cult" title="교주에게 포교됨">신도</span>';
    } else if (confirmedLabel) {
      guessHtml = `<button type="button" class="slot-guess-btn is-confirmed role-${confirmedRole}" data-guess-id="${p.id}" title="확정 정보는 유지되며, 개인 직업 유추를 따로 기록할 수 있습니다">${escapeHtml(confirmedLabel)}</button>`;
    } else if (privateGuessLabel) {
      guessHtml = `<button type="button" class="slot-guess-btn role-${note.guessedRole}" data-guess-id="${p.id}" title="직업 유추">${escapeHtml(privateGuessLabel)}</button>`;
    } else {
      guessHtml = `<button type="button" class="slot-guess-btn slot-guess-empty" data-guess-id="${p.id}" title="직업 유추">직업 유추</button>`;
    }

    const canSelect = canSelectPlayerSlot(p);
    if (state.myDayVoteTarget === p.id) cls += ' voted';

    const targetBtn = canSelect
      ? `<button type="button" class="slot-target-btn${selectedTargetId === p.id || state.myDayVoteTarget === p.id ? ' active' : ''}" data-target-id="${p.id}" title="능력/투표 대상">◎</button>`
      : '';

    const unknownRole = !showRoleImg && !showGuessedPortrait;
    const cultAvatarMod = getCultAvatarClassModifier(p, isSelf);
    const avatarCls = `slot-avatar${showRoleImg || showGuessedPortrait ? ' has-img' : ''}${unknownRole ? ' is-unknown-role' : ''}${cultAvatarMod}`;
    const pdMark = isPdPointed
      ? '<span class="slot-pd-mark is-pointed" title="사립탐정 관찰 결과: 이 플레이어를 지목함">☞</span>'
      : (isPdWatch
        ? '<span class="slot-pd-mark is-watch" title="사립탐정 관찰 대상">👁</span>'
        : '');
    const claimMark = showMatBadges && isMatchedPoliceClaim
      ? '<span class="slot-claim-mark is-matched-police" title="맞경(경찰 주장 충돌): 아직 확정되지 않았습니다">맞경</span>'
      : (showMatBadges && isMatchedRoleClaim
        ? `<span class="slot-claim-mark is-matched-role" title="맞직업(직업 주장 충돌): 아직 확정되지 않았습니다">${matchedClaimRole === 'police' ? '맞경' : matchedClaimRole === 'medium' ? '맞영' : matchedClaimRole === 'reporter' ? '맞기' : matchedClaimRole === 'doctor' ? '맞의' : matchedClaimRole === 'soldier' ? '맞군' : '맞직'}</span>`
        : '');

    return `<div class="${cls}" data-id="${p.id}">` +
      `<span class="slot-num">${i + 1}</span>` +
      targetBtn +
      `<span class="slot-key">F${i + 1}</span>` +
      pdMark +
      claimMark +
      `<button type="button" class="slot-select${canSelect ? '' : ' is-disabled'}" data-target-id="${p.id}" title="${canSelect ? '능력/투표 대상 선택' : ''}"${canSelect ? '' : ' disabled'}>` +
      `<div class="${avatarCls}"${unknownRole ? ` data-guess-id="${p.id}" title="직업 유추"` : ''}>${avatarInner}</div>` +
      `<div class="name">${escapeHtml(p.nickname)}${isSelf ? ' (나)' : ''}</div>` +
      `</button>` +
      guessHtml +
      `${status ? `<div class="status">${status}</div>` : ''}` +
      `</div>`;
  }).join('');

  grid.querySelectorAll('.slot-select:not([disabled])').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onPlayerCardClick(btn.dataset.targetId);
    });
  });

  grid.querySelectorAll('.slot-guess-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openPlayerRolePicker(btn.dataset.guessId);
    });
  });

  grid.querySelectorAll('.slot-avatar.is-unknown-role').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      openPlayerRolePicker(el.dataset.guessId);
    });
  });

  grid.querySelectorAll('.slot-target-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onPlayerCardClick(btn.dataset.targetId);
    });
  });
}

function renderActionPanel() {
  const hint = $('#action-hint');
  const btns = $('#action-buttons');
  btns.innerHTML = '';

  if (!state.myPlayerId) return;
  const me = state.players.find(p => p.id === state.myPlayerId);
  if (!me || !me.alive) {
    if (state.myRole === ROLE.MEDIUM && state.canDeadChatView) {
      hint.textContent = '영매: 사망자 탭에서 봇·플레이어 사망 채팅을 확인하세요. 낮에는 낮 탭에도 표시됩니다.';
    } else if (state.canDeadChatSend) {
      hint.textContent = '사망자 채팅에서 힌트를 남길 수 있습니다. 영매가 볼 수 있습니다.';
    } else {
      hint.textContent = '사망하여 능력/투표를 사용할 수 없습니다.';
    }
    return;
  }

  if (state.phase === 'night') {
    hint.textContent = canSelectActionTarget()
      ? (state.myRole === ROLE.MEDIUM ? '사망자를 선택한 뒤 성불하세요.' : '플레이어를 선택한 뒤 능력을 사용하세요.')
      : '이 밤에는 사용할 능력이 없습니다.';
    if (state.myRole === ROLE.MAFIA) {
      addConfirmBtn(btns, '암살 투표 (밤 살해)', () => emitNightAction('mafiaVote'));
      const mates = state.players.filter(pl => pl.isMafiaTeammate);
      const mateCount = mates.length + 1;
      const voted = state.myMafiaKillTarget
        ? state.players.find((p) => p.id === state.myMafiaKillTarget)
        : null;
      const br = state.mafiaNightVoteBreakdown;
      const brTxt = br && br.rows && br.rows.length
        ? ` [동료: ${br.rows.map((r) => `${r.mafiaName}→${r.targetName || '…'}`).join(' · ')}]`
        : '';
      if (voted) {
        hint.textContent = `${voted.nickname}님에게 암살 투표함 · 밤이 끝나면 살해 처리됩니다.${brTxt}`;
      } else if (state.mafiaKillStatus === 'split_vote') {
        hint.textContent = `마피아 표가 갈렸습니다.${brTxt} 모두 같은 대상에 「암살 투표」로 맞춰 주세요.`;
      } else if (state.mafiaKillStatus === 'need_all_votes') {
        hint.textContent = `마피아 ${mateCount}명 — 모두 같은 사람에 「암살 투표」해야 합니다. (낮 처형 투표와 다름)${brTxt}`;
      } else if (mateCount >= 2) {
        hint.textContent = `대상 선택 → 「암살 투표」. 봇 동료는 당신 표를 따릅니다. 동료: ${mates.map(m => m.nickname).join(', ')}`;
      } else {
        hint.textContent = '대상 선택 → 「암살 투표」를 눌러야 밤에 살해합니다. (낮 투표만으로는 죽지 않음)';
      }
    }
    if (state.myRole === ROLE.SPY && state.joinedMafiaChat) {
      hint.textContent = '스파이는 밤에 살해할 수 없습니다. 「직업 조사」만 가능합니다. 살해는 마피아 동료가 합니다.';
    }
    if (state.joinedMafiaChat && state.myRole === ROLE.SPY) {
      const mates = state.players.filter(pl => pl.isMafiaTeammate);
      if (mates.length) {
        hint.textContent = `접선한 마피아 팀: ${mates.map(m => m.nickname).join(', ')}`;
      }
    }
    if (state.myRole === ROLE.SPY && !state.spyResolved) {
      addConfirmBtn(btns, '직업 조사', () => emitNightAction('spyInvestigate'));
    }
    if (state.myRole === ROLE.SPY && state.spyResolved) {
      hint.textContent = '이번 밤 조사를 완료했습니다.';
    }
    if (state.myRole === ROLE.POLICE && !state.policeResolved) {
      addConfirmBtn(btns, '마피아 조사', () => emitNightAction('policeInvestigate'));
      if (selectedTargetId) {
        const t = state.players.find((p) => p.id === selectedTargetId);
        if (t) hint.textContent = `${t.nickname} 선택됨 — 「마피아 조사」를 눌러 조사를 확정하세요.`;
      }
    }
    if (state.myRole === ROLE.POLICE && state.policeResolved) {
      hint.textContent = '이번 밤 조사를 완료했습니다. 낮에 경조결·조결로 결과를 공개할 수 있습니다.';
    }
    if (state.myRole === ROLE.PRIVATE_DETECTIVE) {
      addConfirmBtn(btns, '관찰 확정', () => emitNightAction('privateDetectiveObserve'));
      if (state.myPrivateDetectiveWatchId) {
        const w = state.players.find((p) => p.id === state.myPrivateDetectiveWatchId);
        hint.textContent = w
          ? `${w.nickname}님을 관찰 지정했습니다. 이번 밤에는 대상 변경이 잠겨 있습니다. 새벽에 손 방향 결과가 옵니다.`
          : '관찰 대상이 서버에 반영되었습니다.';
      } else {
        hint.textContent = '생존자 한 명을 선택한 뒤 「관찰 확정」— 그 사람이 밤에 누구에게 손을 뻗는지(경찰·의사·마피아 등) 추정 멘트로 받습니다.';
      }
    }
    if (state.myRole === ROLE.DOCTOR) addConfirmBtn(btns, '치료', () => emitNightAction('doctorHeal'));
    if (state.myRole === ROLE.MEDIUM) {
      if (state.mediumResolved) {
        hint.textContent = '이번 밤 성불을 완료했습니다.';
      } else {
        const deadN = countDeadPlayers();
        if (deadN > 0) {
          addConfirmBtn(btns, '성불', () => emitNightAction('mediumPurify'));
          hint.textContent = state.canDeadChatView
            ? `사망자 ${deadN}명 중 한 명을 선택한 뒤 성불하세요. (이번 밤에 죽은 사람은 아침 이후 가능)`
            : `사망자 ${deadN}명 중 한 명을 선택한 뒤 성불하세요.`;
        } else {
          hint.textContent = '이번 밤에 성불할 사망자가 없습니다. 이전에 죽은 사람만 성불할 수 있습니다.';
        }
      }
    }
    if (state.myRole === ROLE.REPORTER && !state.reporterUsed && (state.nightIndex || 0) >= 2) {
      addConfirmBtn(btns, '취재', () => emitNightAction('reporterScoop'));
    }
    if (state.myRole === ROLE.REPORTER && (state.nightIndex || 0) < 2) {
      hint.textContent = '기자 취재는 2번째 밤부터 사용할 수 있습니다.';
    }
    if (state.myRole === ROLE.CULT_LEADER) {
      const cultTonight = canCultProselytizeTonightClient(state) || !!state.cultProselytizeTonight;
      if (cultTonight && !state.cultProselytizedSuccess) {
        addConfirmBtn(btns, '포교', () => emitNightAction('cultProselytize'));
        if (selectedTargetId) {
          const t = state.players.find((p) => p.id === selectedTargetId);
          if (t) {
            hint.textContent = `${t.nickname} 선택됨 — 「포교」를 눌러 확정하세요.`;
          } else {
            hint.textContent = '홀수 밤: 대상 선택 후 「포교」. 성공하면 종소리는 밤 중 랜덤 시각에 울립니다. 마피아 실패 시 다른 대상을 고를 수 있습니다.';
          }
        } else {
          hint.textContent = '홀수 밤: 대상 선택 후 「포교」. 성공하면 종소리는 밤 중 랜덤 시각에 울립니다. 마피아 실패 시 다른 대상을 고를 수 있습니다.';
        }
      } else if ((state.nightIndex || 0) % 2 === 0) {
        hint.textContent = '짝수 밤에는 포교할 수 없습니다. 교주팀 탭으로 신도에게 지시하세요.';
      } else if (state.cultProselytizedSuccess) {
        hint.textContent = '이번 밤 포교에 성공했습니다. 교주팀 탭으로 밤챗을 보내세요.';
      }
    }
    if (state.joinedCult && state.myRole !== ROLE.CULT_LEADER) {
      hint.textContent = '교주팀입니다. 교주팀 탭에서 교주의 지시를 확인하세요.';
    }
    if (state.myRole === ROLE.CLERIC && !state.clericUsed && !state.clericResolved) {
      addConfirmBtn(btns, '부활', () => emitNightAction('clericRevive'));
      hint.textContent = '사망자 1명을 선택한 뒤 「부활」— 다음 날 낮에 부활합니다. (1회, 교주 진영 불가)';
    }
    if (state.myRole === ROLE.CLERIC && (state.clericUsed || state.clericResolved)) {
      hint.textContent = state.clericUsed ? '부활 능력을 사용했습니다.' : '이번 밤 부활 대상이 확정되었습니다.';
    }
    if (state.myRole === ROLE.CLERIC && state.clericMustExposeCultLeader) {
      const leaderName = state.clericCultExposeLeaderName || '교주';
      hint.textContent = `밤에 ${leaderName}님의 포교를 막았습니다. 낮 채팅에서 ${leaderName}님이 교주임을 공표하세요.`;
    }
    if (state.myRole === ROLE.BEAST_MAN && state.beastManCanKill && state.phase === 'night') {
      addConfirmBtn(btns, '처형', () => emitNightAction('beastManKill'));
      hint.textContent = '마피아 전멸 각성: 생존자 1명을 처형할 수 있습니다.';
    }
    if (state.myRole === ROLE.BEAST_MAN && !state.beastManCanKill) {
      hint.textContent = state.beastManContacted
        ? '마피아와 접선했습니다. 마피아 채팅을 확인하세요.'
        : '마피아 공격 시 접선합니다. 경찰에게는 시민으로 보입니다.';
    }
    if (state.myRole === ROLE.CULTIST) {
      hint.textContent = '교주를 알고 시작합니다. 포교 시 즉시 교주팀이 됩니다.';
    }
    if (state.myRole === ROLE.CITIZEN || state.myRole === ROLE.SOLDIER || state.myRole === ROLE.POLITICIAN || state.myRole === ROLE.GRAVEROBBER || state.myRole === ROLE.TERRORIST) {
      hint.textContent = state.myRole === ROLE.TERRORIST
        ? '밤 능력 없음. 처형 시 최후의 반론에서 동귀어진 대상을 지정하세요.'
        : '이 밤에는 사용할 능력이 없습니다.';
    }
  } else if (state.phase === 'day_vote') {
    const weightHint = (state.myDayVoteWeight || 1) > 1 ? ' (정치인 2표)' : '';
    if (state.dayVoteTallyHidden) {
      hint.textContent = `투표 종료 5초 전 — 득표가 비공개됩니다.${weightHint}`;
    } else if (state.myDayVoteTarget) {
      const voted = state.players.find(p => p.id === state.myDayVoteTarget);
      hint.textContent = voted
        ? `${voted.nickname}에게 투표했습니다${weightHint}. 같은 플레이어를 다시 누르면 취소됩니다.`
        : `플레이어를 눌러 투표하세요${weightHint}.`;
    } else {
      hint.textContent = `플레이어를 눌러 바로 투표하세요${weightHint}.`;
    }
  } else if (state.phase === 'execution_vote') {
    if (state.myPlayerId === state.executionCandidateId) {
      hint.textContent = '처형 후보자는 찬반 투표에 참여할 수 없습니다.';
    } else if (state.myExecutionVote) {
      hint.textContent = state.myExecutionVote === 'yes'
        ? '찬반 투표: 찬성 (처형 찬성)'
        : '찬반 투표: 반대 (처형 반대)';
    } else {
      hint.textContent = '찬반 투표 팝업에서 선택하세요.';
    }
  } else if (state.phase === 'last_words') {
    if (state.canPickTerroristMartyr) {
      addConfirmBtn(btns, '동귀어진', () => emitNightAction('terroristMartyr'));
      hint.textContent = state.myTerroristMartyrTarget
        ? '동귀어진 대상이 지정되었습니다. 최후의 반론을 이어가세요.'
        : '처형 시 함께 죽을 생존자를 선택한 뒤 「동귀어진」을 누르세요.';
    } else if (state.myPlayerId === state.executionCandidateId) {
      hint.textContent = '최후의 반론을 진행하세요. (채팅 탭)';
    } else {
      hint.textContent = '최후의 반론을 듣고 있습니다.';
    }
  } else if (state.phase === 'dawn') {
    hint.textContent = '밤 결과를 확인하는 중입니다. 대화는 낮 토론부터 가능합니다.';
  } else if (state.phase === 'day_chat') {
    hint.textContent = '토론 시간은 생존자 수×15초입니다. 직공·조결·자투 등은 채팅으로 요청할 수 있습니다.';
  } else {
    hint.textContent = '';
  }
}

function addBtn(parent, label, cls, onClick) {
  const b = document.createElement('button');
  b.className = `btn ${cls}`;
  b.textContent = label;
  b.addEventListener('click', onClick);
  parent.appendChild(b);
}

function addConfirmBtn(parent, label, onClick) {
  addBtn(parent, label, 'btn-primary', onClick);
}

function emitNightAction(event) {
  if (!selectedTargetId) return showToast('대상을 선택하세요.');
  if (event === 'mediumPurify') {
    if (state.mediumResolved) return showToast('이번 밤에는 이미 성불했습니다.');
    const target = state.players.find(p => p.id === selectedTargetId);
    if (!target || target.alive) return showToast('사망자만 성불할 수 있습니다.');
    socket.emit('mediumPurify', { targetId: selectedTargetId });
    runAnimation('anim-investigate', { targetId: selectedTargetId });
    return;
  }
  if (event === 'privateDetectiveObserve') {
    socket.emit('privateDetectiveObserve', { targetId: selectedTargetId });
    runAnimation('anim-investigate', { targetId: selectedTargetId, cardFx: null });
    showToast('관찰 대상을 서버에 전송했습니다.');
    return;
  }
  socket.emit(event, { targetId: selectedTargetId });
  const animMap = {
    mafiaVote: { anim: 'anim-mafia-kill', cardFx: 'fx-target-kill' },
    doctorHeal: { anim: 'anim-doctor-heal', cardFx: 'fx-target-heal' },
    spyInvestigate: { anim: 'anim-investigate', cardFx: null },
    policeInvestigate: { anim: 'anim-investigate', cardFx: null },
    reporterScoop: { anim: 'anim-reporter-flash', cardFx: null },
    mediumPurify: { anim: 'anim-investigate', cardFx: null },
    cultProselytize: { anim: 'anim-cult-proselytize', cardFx: 'fx-target-cult' },
    clericRevive: { anim: 'anim-doctor-heal', cardFx: null },
    beastManKill: { anim: 'anim-mafia-kill', cardFx: 'fx-target-kill' },
    terroristMartyr: { anim: 'anim-mafia-kill', cardFx: 'fx-target-kill' }
  };
  const fx = animMap[event];
  if (fx && fx.anim) runAnimation(fx.anim, { targetId: selectedTargetId, cardFx: fx.cardFx });
  if (event === 'cultProselytize') {
    flashCultProselytizeCard(selectedTargetId);
    showToast('포교 시도 중… 성공 시 종소리는 밤 중 랜덤 시각에 울립니다.');
  }
  if (event === 'mafiaVote') {
    showToast('암살 투표 완료. 밤이 끝나야 실제로 살해 처리됩니다.');
  }
}

function countDeadPlayers() {
  if (!state || !state.players) return 0;
  return state.players.filter((p) => !p.alive).length;
}

function onPlayerCardClick(id) {
  const player = state.players.find((p) => p.id === id);
  const me = state.players.find((p) => p.id === state.myPlayerId);

  if (state.phase === 'night' && me && me.alive && player) {
    if (!canSelectPlayerSlot(player)) {
      if (state.myRole === ROLE.MEDIUM) {
        if (state.mediumResolved) {
          return showToast('이번 밤에는 이미 성불했습니다.');
        }
        if (player.alive) {
          return showToast('사망자만 성불할 수 있습니다.');
        }
        const dn = player.deadSinceNightIndex;
        if (dn != null && state.nightIndex != null && dn >= state.nightIndex) {
          return showToast('이번 밤에 사망한 사람은 다음 밤부터 성불할 수 있습니다.');
        }
        return showToast('이 대상은 선택할 수 없습니다.');
      }
      return showToast('생존자만 선택할 수 있습니다.');
    }
  }

  if (state.phase === 'day_vote' && me && me.alive && player && player.alive) {
    const isCancel = state.myDayVoteTarget === id;
    socket.emit('dayVote', { targetId: isCancel ? null : id });
    runAnimation('anim-vote', { targetId: id, cardFx: 'fx-target-vote', silent: isCancel });
    showToast(isCancel ? '투표를 취소했습니다.' : `${player.nickname}에게 투표했습니다.`);
    return;
  }

  selectedTargetId = id;
  renderPlayerGrid();
  const card = document.querySelector(`.player-card[data-id="${id}"]`);
  if (card) {
    card.classList.add('just-selected');
    setTimeout(() => card.classList.remove('just-selected'), 500);
  }
  if (player && state.phase === 'night') {
    showToast(`${player.nickname} 선택됨`);
    renderActionPanel();
  }
}

function updateExecutionVoteOverlay() {
  const overlay = $('#execution-vote-overlay');
  if (!overlay || !state) return;
  const me = state.players.find(p => p.id === state.myPlayerId);
  const show = state.phase === 'execution_vote'
    && me && me.alive
    && state.myPlayerId !== state.executionCandidateId
    && !state.myExecutionVote;
  overlay.hidden = !show;
}

function hideExecutionVoteOverlay() {
  const overlay = $('#execution-vote-overlay');
  if (overlay) overlay.hidden = true;
}

function dismissGameOverlays() {
  if (typeof window.clearPresentationQueue === 'function') window.clearPresentationQueue();
  if (typeof clearMotionQueue === 'function') clearMotionQueue();
  hideExecutionVoteOverlay();
  const overlayIds = [
    'vote-time-overlay',
    'vote-results-overlay',
    'phase-transition-overlay',
    'role-reveal-overlay',
    'reporter-reveal-overlay',
    'player-memo-overlay',
    'motion-overlay',
    'execution-vote-overlay'
  ];
  overlayIds.forEach((id) => {
    const el = id === 'phase-transition-overlay'
      ? getPhaseTransitionOverlay()
      : document.getElementById(id);
    if (el) {
      el.hidden = true;
      el.setAttribute('aria-hidden', 'true');
    }
  });
  const skill = $('#skill-notice');
  if (skill) skill.hidden = true;
  clearTimeout(phaseTransitionTimer);
  clearTimeout(skillNoticeTimer);
  clearTimeout(voteResultsOverlayTimer);
  clearTimeout(voteTimeOverlayTimer);
}

let pendingExecutionVote = null;

function submitExecutionVote(vote) {
  if (!state || state.phase !== 'execution_vote') return;
  if (state.myPlayerId === state.executionCandidateId) return;
  if (state.myExecutionVote) {
    showToast(state.myExecutionVote === 'yes' ? '이미 찬성했습니다.' : '이미 반대했습니다.');
    return;
  }
  if (pendingExecutionVote) return;
  pendingExecutionVote = vote;
  socket.emit('executionVote', { vote });
  runAnimation('anim-execution');
  hideExecutionVoteOverlay();
  showToast(vote === 'yes' ? '찬성 제출 중…' : '반대 제출 중…');
}

function updateChatTabs() {
  const tabDay = $('#tab-day');
  const tabMafia = $('#tab-mafia');
  const tabCult = $('#tab-cult');
  const tabDead = $('#tab-dead');
  const tabLast = $('#tab-lastwords');

  tabMafia.hidden = !state.canMafiaChat;
  if (tabCult) tabCult.hidden = !state.canCultChat;
  const me = state.players.find(p => p.id === state.myPlayerId);
  const mediumAlive = me && me.alive && state.myRole === ROLE.MEDIUM;
  tabDead.hidden = !state.canDeadChatView || (state.phase === 'day_chat' && !mediumAlive && me && me.alive);
  tabLast.hidden = state.phase !== 'last_words';

  if (state.phase === 'night') {
    tabDay.textContent = '밤 (낮 채팅 비활성)';
    if (state.canMafiaChat && activeChatChannel === 'day') activeChatChannel = 'mafia';
    if (state.canCultChat && activeChatChannel === 'day' && !state.canMafiaChat) activeChatChannel = 'cult';
  } else if (state.phase === 'dawn' || state.phase === 'day_chat') {
    tabDay.textContent = state.phase === 'dawn' ? '아침 (대화 불가)' : '낮 채팅';
    if (activeChatChannel === 'mafia' || activeChatChannel === 'cult') activeChatChannel = 'day';
  } else if (state.phase === 'last_words') {
    if (activeChatChannel !== 'lastWords') activeChatChannel = 'lastWords';
  } else {
    tabDay.textContent = '낮 채팅';
  }

  if (tabLast.hidden && activeChatChannel === 'lastWords') activeChatChannel = 'day';
  if (tabMafia.hidden && activeChatChannel === 'mafia') activeChatChannel = 'day';
  if (tabCult && tabCult.hidden && activeChatChannel === 'cult') activeChatChannel = 'day';
  if (tabDead.hidden && activeChatChannel === 'dead') activeChatChannel = 'day';

  document.querySelectorAll('.chat-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.channel === activeChatChannel);
  });

  const readOnlyDead = activeChatChannel === 'dead' && state.canDeadChatView && !state.canDeadChatSend;
  const canType = (
    (activeChatChannel === 'day' && state.phase === 'day_chat' && me && (me.alive || state.canDeadChatSend)) ||
    (activeChatChannel === 'mafia' && state.phase === 'night' && state.canMafiaChat) ||
    (activeChatChannel === 'cult' && state.phase === 'night' && state.myRole === ROLE.CULT_LEADER) ||
    (activeChatChannel === 'dead' && state.canDeadChatView && state.canDeadChatSend) ||
    (activeChatChannel === 'lastWords' && state.phase === 'last_words' && state.myPlayerId === state.executionCandidateId)
  );
  const inputEnabled = canType && !readOnlyDead;
  $('#chat-input').disabled = !inputEnabled;
  $('#btn-send-chat').disabled = !inputEnabled;
  $('#chat-input').placeholder = (state.phase === 'dawn' && activeChatChannel === 'day')
      ? '아침에는 대화할 수 없습니다. 잠시만 기다리세요.'
      : readOnlyDead
      ? '사망자만 메시지를 보낼 수 있습니다.'
      : (inputEnabled ? '메시지 입력...' : '이 채널에서는 지금 채팅할 수 없습니다');

  renderChat();
}

function renderTimeButtons() {
  const shorten = $('#btn-time-shorten');
  const extend = $('#btn-time-extend');
  if (!shorten || !extend || !state) return;
  const noAdjust = ['night', 'dawn', 'day_vote', 'execution_vote', 'last_words'].includes(state.phase);
  shorten.hidden = noAdjust;
  extend.hidden = noAdjust;
  if (noAdjust) return;
  shorten.disabled = !state.canTimeShorten;
  extend.disabled = !state.canTimeExtend;
}

function isDeadChatMessage(m) {
  if (!m || m.system) return false;
  if (m.isDead) return true;
  if (!state || !m.fromId) return false;
  const p = state.players.find(pl => pl.id === m.fromId);
  return p && !p.alive;
}

function getChatMessagesForView() {
  if (activeChatChannel === 'day') {
    return (chatStore.day || []).slice().sort((a, b) => (a.time || 0) - (b.time || 0));
  }
  return chatStore[activeChatChannel] || [];
}

function renderChat() {
  const msgs = getChatMessagesForView();
  const myId = state ? state.myPlayerId : null;
  const list = $('#chat-messages');
  if (!list) return;
  const wasNearBottom =
    forceChatScrollBottom
    || (list.scrollHeight - (list.scrollTop + list.clientHeight) <= 48);
  list.innerHTML = msgs.map(m => {
    if (m.system) {
      return `<li class="chat-msg system"><span class="chat-bubble system">${escapeHtml(m.text)}</span></li>`;
    }
    const isMine = m.fromId === myId;
    const dead = isDeadChatMessage(m);
    const cls = `${isMine ? 'mine' : 'theirs'}${dead ? ' dead' : ''}`;
    const profileHtml = m.fromId ? buildChatProfileHtml(m.fromId) : '';
    let nameLabel = isMine ? '나' : escapeHtml(m.from || '');
    if (dead && !isMine) nameLabel += ' <span class="dead-tag">사망</span>';
    return `<li class="chat-msg ${cls}">` +
      `<div class="chat-row">` +
      profileHtml +
      `<div class="chat-col">` +
      `<span class="chat-name">${nameLabel}</span>` +
      `<span class="chat-bubble">${escapeHtml(m.text)}</span>` +
      `</div>` +
      `</div>` +
      `</li>`;
  }).join('');
  if (wasNearBottom) list.scrollTop = list.scrollHeight;
  forceChatScrollBottom = false;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function appendPrivateInfo(data) {
  const el = $('#private-info');
  if (!el || !data) return;
  let line = '';
  const actionLabels = {
    mafia: '암살 투표',
    spy: '스파이 조사',
    police: '경찰 조사',
    doctor: '치료',
    reporter: '기자 취재',
    medium: '성불',
    cult: '포교'
  };
  switch (data.type) {
    case 'role': line = `배정된 직업: ${data.roleLabel}`; break;
    case 'police': line = `경찰 조사: ${data.targetName} → ${data.isMafia ? '마피아' : '마피아 아님'}`; break;
    case 'spy': line = `스파이 조사: ${data.targetName} → ${data.roleLabel}${data.joinedMafiaChat ? ' (마피아 채팅 합류)' : ''}`; break;
    case 'reporter': line = `취재 결과: ${data.targetName} → ${data.roleLabel} (아침에 공표)`; break;
    case 'medium': line = `성불 결과: ${data.targetName} → ${data.roleLabel}`; break;
    case 'heal':
      line = data.saved
        ? `치료 성공: ${data.targetName} (공격을 막아냄)`
        : `치료 완료: ${data.targetName}`;
      break;
    case 'inherit': line = `도굴꾼 계승: ${data.fromName}의 ${data.roleLabel}`; break;
    case 'actionConfirm':
      line = data.message
        || (data.targetName
          ? `${actionLabels[data.action] || '능력'} 대상: ${data.targetName}`
          : '능력 대상 선택됨');
      break;
    case 'mafiaTeam': {
      const mates = (data.teammates || []).map((t) => `${t.nickname}(${t.roleLabel || '?'})`).join(', ');
      line = mates ? `마피아 팀: ${mates}` : '마피아 팀: (표시할 동료 없음)';
      break;
    }
    case 'cultTeam': {
      const leader = data.leaderNickname ? `교주 ${data.leaderNickname}` : '교주';
      const followers = (data.followers || []).map((f) => f.nickname).join(', ');
      line = followers ? `교주팀 — ${leader} · 신도: ${followers}` : `교주팀 — ${leader}`;
      break;
    }
    default: line = JSON.stringify(data);
  }
  el.innerHTML += `<div class="private-info-line">${escapeHtml(line)}</div>`;
}

/* ─── Socket events ─────────────────────────────────────────────────────────── */

socket.on('connect', () => {
  socketConnected = true;
  updateLobbyConnectionUi();
  if (disconnectBannerTimer) {
    clearTimeout(disconnectBannerTimer);
    disconnectBannerTimer = null;
  }
  $('#reconnect-banner').hidden = true;
  const nick = getNickname() || localStorage.getItem('mafia_nickname') || '';
  if (nick) $('#nickname').value = nick;
  requestSessionSync();
});

socket.on('disconnect', (reason) => {
  socketConnected = false;
  updateLobbyConnectionUi();
  if (reconnectPaused || reason === 'io client disconnect') return;
  if (disconnectBannerTimer) clearTimeout(disconnectBannerTimer);
  disconnectBannerTimer = setTimeout(() => {
    if (!socket.connected) $('#reconnect-banner').hidden = false;
  }, 2000);
});

socket.on('connect_error', () => {
  socketConnected = false;
  probeServerHealth();
  updateLobbyConnectionUi();
});

socket.on('sessionTaken', (data) => {
  reconnectPaused = true;
  stopKeepAlive();
  pendingRoomRejoin = null;
  sessionStorage.removeItem('mafia_in_room_session');
  localStorage.removeItem('mafia_roomCode');
  showToast((data.message || '다른 탭에서 접속되었습니다.') + ' 이 탭은 닫거나 새로고침(F5) 후 다시 이용하세요.');
  state = { phase: 'none', serverInfo: state && state.serverInfo ? state.serverInfo : null };
  resetLobbyClientState();
  renderFromState();
  updateLobbyConnectionUi();
});

socket.on('joinResult', (data) => {
  if (!data || data.ok !== false) return;
  if (data.reason === 'room_expired' || data.reason === 'room_not_found') {
    const wasInGame = !!(state && state.phase && !['none', 'lobby'].includes(state.phase));
    handleRoomLost(wasInGame);
    return;
  }
  if (data.reason === 'game_in_progress' && !data.silent) {
    showToast('게임 중입니다. 이 탭에서 F5로 새로고침하면 같은 계정으로 다시 붙을 수 있어요.');
  }
});

socket.on('stateSync', (data) => {
  if (data.roomExpired) {
    const wasInGame = !!(state && state.phase && !['none', 'lobby'].includes(state.phase));
    handleRoomLost(wasInGame);
    return;
  }

  if (data.phase === 'none' && pendingRoomRejoin && rejoinAttempts < MAX_REJOIN_ATTEMPTS) {
    rejoinAttempts += 1;
    const code = pendingRoomRejoin;
    const nick = getNickname() || localStorage.getItem('mafia_nickname') || '플레이어';
    socket.emit('join', { userID, nickname: nick, roomCode: code, autoReconnect: true });
    return;
  }
  pendingRoomRejoin = null;
  rejoinAttempts = 0;
  $('#reconnect-banner').hidden = true;

  const savedChat = {
    day: chatStore.day,
    mafia: chatStore.mafia,
    cult: chatStore.cult,
    dead: chatStore.dead,
    lastWords: chatStore.lastWords,
    lobby: chatStore.lobby
  };
  const prevPlayers = state?.players;
  state = data;
  // #region agent log
  fetch('http://127.0.0.1:7270/ingest/50c123a2-bf7d-4c65-ba87-3da2632b748d', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'a38a8e' },
    body: JSON.stringify({
      sessionId: 'a38a8e',
      hypothesisId: 'H_client_sync',
      location: 'app.js:stateSync',
      message: 'stateSync received',
      data: {
        phase: data.phase,
        roomCode: data.roomCode,
        stateError: !!data.stateError,
        playerCount: data.playerCount
      },
      timestamp: Date.now()
    })
  }).catch(() => {});
  // #endregion
  if (prevPlayers && state.players && data.phase && data.phase !== 'lobby' && data.phase !== 'game_over') {
    state.players = mergePlayerVisualHints(prevPlayers, state.players);
  }
  if (data.mafiaTeamRoster?.length) {
    applyMafiaTeamRoster(data.mafiaTeamRoster);
  }
  if (pendingExecutionVote && data.myExecutionVote) {
    const label = data.myExecutionVote === 'yes' ? '찬성' : '반대';
    if (data.myExecutionVote !== pendingExecutionVote) {
      showToast(`서버에 ${label}으로 기록되었습니다. (제출과 다를 수 있어 확인해 주세요)`);
    } else {
      showToast(`${label}으로 투표했습니다.`);
    }
    pendingExecutionVote = null;
  }
  if (!Array.isArray(data.dayChat) && savedChat.day.length) chatStore.day = savedChat.day;
  if (!Array.isArray(data.mafiaChat) && savedChat.mafia.length) chatStore.mafia = savedChat.mafia;
  if (!Array.isArray(data.cultChat) && savedChat.cult.length) chatStore.cult = savedChat.cult;
  if (!Array.isArray(data.deadChat) && savedChat.dead.length) chatStore.dead = savedChat.dead;
  if (!Array.isArray(data.lastWordsChat) && savedChat.lastWords.length) chatStore.lastWords = savedChat.lastWords;
  if (!Array.isArray(data.lobbyChat) && savedChat.lobby.length) chatStore.lobby = savedChat.lobby;

  if (data.roomCode) {
    localStorage.setItem('mafia_roomCode', data.roomCode);
    if (data.phase && data.phase !== 'none') {
      sessionStorage.setItem('mafia_in_room_session', '1');
    }
  } else {
    localStorage.removeItem('mafia_roomCode');
    sessionStorage.removeItem('mafia_in_room_session');
  }
  if (data.phase === 'none') {
    stopKeepAlive();
    resetLobbyClientState();
  } else if (data.phase && data.phase !== 'lobby') {
    startKeepAlive();
  } else {
    stopKeepAlive();
  }
  if (data.roomCode) {
    loadPlayerNotes();
  }
  renderFromState();
});

socket.on('phaseChanged', (data) => {
  if (data.remainingMs != null) startLocalTimer(data.remainingMs);
  if (state) {
    state.phase = data.phase;
    if (data.nightIndex != null) state.nightIndex = data.nightIndex;
    if (data.dayIndex != null) state.dayIndex = data.dayIndex;
    if (data.remainingMs != null) state.phaseRemainingMs = data.remainingMs;
    if (data.executionCandidateId != null) state.executionCandidateId = data.executionCandidateId;
    if (data.phase === 'night' && state.myRole === ROLE.CULT_LEADER) {
      state.cultProselytizeTonight = canCultProselytizeTonightClient(state);
    }
  }
  if (data.timerAdjust) {
    if (state) renderTimeButtons();
    return;
  }

  if (data.phase === 'night') {
    runAnimation('anim-night-fall');
    AudioManager.playSFX('night');
    if (state && state.canMafiaChat) activeChatChannel = 'mafia';
    const idx = data.nightIndex || (state ? state.nightIndex : 0) || 1;
    if (typeof window.enqueuePresentation === 'function') {
      window.enqueuePresentation(
        () => showPhaseTransitionAsync('night', `${idx}번째 밤`, '밤이 되었습니다', idx),
        'phase:night'
      );
    } else {
      showPhaseTransition('night', `${idx}번째 밤`, '밤이 되었습니다', idx);
    }
  } else if (data.phase === 'dawn') {
    AudioManager.playSFX('day');
    activeChatChannel = 'day';
    const idx = data.dayIndex || (state ? state.dayIndex : 0) || 1;
    if (typeof window.enqueuePresentation === 'function') {
      window.enqueuePresentation(
        () => showPhaseTransitionAsync('day', '아침이 밝았습니다', '밤의 결과를 확인하세요', idx),
        'phase:dawn'
      );
    } else {
      showPhaseTransition('day', '아침이 밝았습니다', '밤의 결과를 확인하세요', idx);
    }
    updateChatTabs();
  } else if (data.phase === 'day_chat') {
    AudioManager.playSFX('day');
    activeChatChannel = 'day';
    if (typeof window.enqueuePresentation === 'function') {
      window.enqueuePresentation(() => {
        showToast('낮 토론이 시작되었습니다. 이제 대화할 수 있습니다.');
        return Promise.resolve();
      }, 'toast:day-chat');
    } else {
      showToast('낮 토론이 시작되었습니다. 이제 대화할 수 있습니다.');
    }
    updateChatTabs();
  } else if (data.phase === 'day_vote') {
    if (typeof window.enqueuePresentation === 'function') {
      window.enqueuePresentation(async () => {
        runAnimation('anim-vote', { silent: true });
        await showVoteTimeOverlayAsync();
      }, 'vote-time');
    } else {
      runAnimation('anim-vote', { silent: true });
      showVoteTimeOverlay();
    }
  } else if (data.phase === 'execution_vote') {
    runAnimation('anim-execution', { silent: true });
    updateExecutionVoteOverlay();
  } else if (data.phase === 'last_words') {
    activeChatChannel = 'lastWords';
  }
  if (data.phase !== 'execution_vote') hideExecutionVoteOverlay();
  selectedTargetId = null;
  renderFromState();
});

socket.on('animation', (data) => {
  if (data.className) runAnimation(data.className, { silent: !!data.silent });
});

socket.on('gameMotion', (data) => {
  if (data && data.type === 'cult_proselytize') {
    runAnimation('anim-cult-proselytize', { silent: false, targetId: data.targetId, cardFx: 'fx-target-cult' });
    if (data.targetId) flashCultProselytizeCard(data.targetId);
    AudioManager.playSFX('night');
  }
  if (typeof window.enqueueMotion === 'function') window.enqueueMotion(data);
});

socket.on('gameMotionBatch', (data) => {
  if (!data || !data.motions) return;
  data.motions.forEach((m) => {
    if (typeof window.enqueueMotion === 'function') window.enqueueMotion(m);
  });
});

socket.on('skillNotice', (data) => {
  showSkillNotice(data);
  if (data && data.scope === 'public') showToast(data.message || data.title);
});

socket.on('privateInfo', (data) => {
  if (!data) return;
  appendPrivateInfo(data);
  if (data.type === 'heal') {
    showSkillNotice({
      scope: 'private',
      kind: 'doctor',
      title: data.saved ? '치료 성공' : '치료 완료',
      message: data.saved
        ? `${data.targetName}님을 치료해 살렸습니다!`
        : `${data.targetName}님에게 치료했습니다.`
    });
  } else if (data.type === 'medium') {
    showSkillNotice({
      scope: 'private',
      kind: 'medium',
      title: '영매 성불 결과',
      message: `${data.targetName} → ${data.roleLabel}`
    });
  } else if (data.type === 'police') {
    showSkillNotice({
      scope: 'private',
      kind: 'police',
      title: '경찰 조사 결과',
      message: data.isMafia
        ? `${data.targetName}님은 마피아입니다.`
        : `${data.targetName}님은 마피아가 아닙니다.`
    });
  } else if (data.type === 'spy') {
    if (data.joinedMafiaChat && state) {
      state.joinedMafiaChat = true;
      if (state.players) renderPlayerGrid();
      renderActionPanel();
      updateChatTabs();
    }
    showSkillNotice({
      scope: 'private',
      kind: 'spy',
      title: '스파이 조사 결과',
      message: data.joinedMafiaChat
        ? `${data.targetName} — 마피아 (마피아 채팅 합류)`
        : `${data.targetName}의 직업: ${data.roleLabel}`
    });
  } else if (data.type === 'reporter') {
    showSkillNotice({
      scope: 'private',
      kind: 'reporter',
      title: '기자 취재 결과',
      message: `${data.targetName} → ${data.roleLabel} (아침에 전원 공표)`
    });
  } else if (data.type === 'actionConfirm' && data.targetName) {
    const labels = { mafia: '암살', spy: '조사', police: '조사', doctor: '치료', reporter: '취재', medium: '성불', cult: '포교' };
    if (data.action === 'cult' && data.targetId && state?.players) {
      flashCultProselytizeCard(data.targetId);
      renderPlayerGrid();
    }
    showSkillNotice({
      scope: 'private',
      kind: data.action,
      title: data.action === 'cult' ? '포교 성공' : `${labels[data.action] || '능력'} 대상 지정`,
      message: data.action === 'cult' && data.roleLabel
        ? `${data.targetName} → ${data.roleLabel} (교주팀)`
        : data.targetName
    });
  }
  if (data.type === 'mafiaTeam') {
    if (!state?.players) return;
    applyMafiaTeamRoster(data.teammates);
    showMafiaTeamNotice(data.teammates);
    renderPlayerGrid();
    renderActionPanel();
  }
  if (data.type === 'cultTeam') {
    if (!state?.players) return;
    const leader = data.leaderNickname ? `교주 ${data.leaderNickname}` : '교주';
    const followers = (data.followers || []).map((f) => f.nickname).join(', ');
    showToast(followers ? `교주팀: ${leader} · 신도 ${followers}` : `교주팀: ${leader}`);
    renderPlayerGrid();
    renderActionPanel();
  }
  if (data.type === 'cultist_leader') {
    showToast(data.message || `교주: ${data.leaderNickname || '?'}`);
  }
  if (data.type === 'role' || data.type === 'inherit') {
    if (state) {
      state.myRole = data.role;
      state.myRoleLabel = data.roleLabel || state.myRoleLabel;
      if (data.type === 'inherit') {
        state.reporterUsed = false;
        state.policeResolved = false;
        state.spyResolved = false;
      }
      if (data.type === 'role') {
        loadPlayerNotes();
        showRoleReveal(data.role);
      }
      renderMyRoleSidebar();
      renderRoleGuide();
      renderActionPanel();
      renderM42Chrome();
      renderPlayerGrid();
    }
  }
});

socket.on('dayVoteResults', (data) => {
  if (typeof window.enqueuePresentation === 'function') {
    window.enqueuePresentation(() => showVoteResultsOverlayAsync(data), 'vote-results');
    return;
  }
  showVoteResultsOverlay(data);
});

function ingestDeadChatMessage(data) {
  if (!chatStore.dead) chatStore.dead = [];
  chatStore.dead.push(data);
  const me = state && state.players.find(p => p.id === state.myPlayerId);
  const mediumAlive = me && me.alive && state.myRole === ROLE.MEDIUM;
  const deadViewer = me && !me.alive;
  const mergeToDay = mediumAlive || (deadViewer && state && state.phase === 'day_chat');
  if (mergeToDay) {
    if (!chatStore.day) chatStore.day = [];
    chatStore.day.push({ ...data, isDead: true });
    if (activeChatChannel === 'day') queueChatRender('day');
  }
  if (activeChatChannel === 'dead') queueChatRender('dead');
}

socket.on('chatMessage', (data) => {
  const ch = data.channel === 'lastWords' ? 'lastWords' : data.channel;
  if (ch === 'day') {
    if (!chatStore.day) chatStore.day = [];
    const me = state && state.players.find(p => p.id === state.myPlayerId);
    const allowDeadInDay = data.isDead && me && (
      (me.alive && state.myRole === ROLE.MEDIUM) || !me.alive
    );
    if (!data.isDead || allowDeadInDay) {
      chatStore.day.push(data);
      if (activeChatChannel === 'day') queueChatRender('day');
    }
    return;
  }
  if (ch === 'dead') {
    ingestDeadChatMessage({ ...data, isDead: true });
    return;
  }
  if (!chatStore[ch]) chatStore[ch] = [];
  chatStore[ch].push(data);
  if (ch === 'lobby') renderLobbyChat();
  else if (activeChatChannel === ch) queueChatRender(ch);
});

socket.on('reporterReveal', (data) => {
  showReporterReveal(data);
});

socket.on('gameOver', (data) => {
  AudioManager.playSFX('gameover');
  showToast(data.message);
  if (state) {
    state.phase = 'game_over';
    if (data.winner) state.winner = data.winner;
    renderFromState();
  }
});

socket.on('error', (data) => {
  if (!data || data.silent) return;
  showToast(data.message);
});

/* ─── UI bindings ───────────────────────────────────────────────────────────── */

$('#btn-create').addEventListener('click', () => {
  if (!socketConnected) {
    showToast('서버에 연결 중입니다. 잠시 후 다시 시도하세요.');
    socket.connect();
    return;
  }
  const nickname = getNickname();
  if (!nickname) return showToast('닉네임을 입력하세요.');
  localStorage.setItem('mafia_nickname', nickname);
  sessionStorage.removeItem('mafia_in_room_session');
  localStorage.removeItem('mafia_roomCode');
  // #region agent log
  fetch('http://127.0.0.1:7270/ingest/50c123a2-bf7d-4c65-ba87-3da2632b748d', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'a38a8e' },
    body: JSON.stringify({
      sessionId: 'a38a8e',
      hypothesisId: 'H_client_emit',
      location: 'app.js:btn-create',
      message: 'emit createRoom',
      data: { userID, nickname },
      timestamp: Date.now()
    })
  }).catch(() => {});
  // #endregion
  socket.emit('createRoom', { userID, nickname });
  showToast('방을 만드는 중...');
});

$('#btn-join').addEventListener('click', () => {
  const roomCode = ($('#room-code').value || '').trim();
  if (!roomCode) return showToast('방 코드를 입력하세요.');
  requestJoin(roomCode);
});

$('#room-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#btn-join').click();
});

$('#btn-start').addEventListener('click', () => socket.emit('startGame'));

$('#btn-new-game').addEventListener('click', () => {
  Object.keys(chatStore).forEach(k => { chatStore[k] = []; });
  $('#private-info').innerHTML = '';
  resetPlayerNotesSession();
  socket.emit('newGame');
});

$('#btn-time-shorten').addEventListener('click', () => socket.emit('adjustTime', { type: 'shorten' }));
$('#btn-time-extend').addEventListener('click', () => socket.emit('adjustTime', { type: 'extend' }));

$('#btn-add-bot').addEventListener('click', () => socket.emit('addBot'));
$('#btn-remove-bot').addEventListener('click', () => socket.emit('removeBot'));
$('#btn-fill-bots').addEventListener('click', () => {
  if (!state) return;
  const needed = state.minPlayers - state.playerCount;
  if (needed <= 0) return showToast('이미 최소 인원 이상입니다.');
  for (let i = 0; i < needed; i++) socket.emit('addBot');
});

const roleRevealClose = $('#btn-role-reveal-close');
if (roleRevealClose) roleRevealClose.addEventListener('click', closeRoleReveal);

const reporterRevealClose = $('#btn-reporter-reveal-close');
if (reporterRevealClose) reporterRevealClose.addEventListener('click', closeReporterReveal);

const copyInviteBtn = $('#btn-copy-invite');
if (copyInviteBtn) copyInviteBtn.addEventListener('click', copyInviteLink);

$('#btn-leave-room')?.addEventListener('click', leaveRoom);
$('#btn-leave-game')?.addEventListener('click', leaveRoom);

(function applyRoomCodeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const room = (params.get('room') || '').trim().toUpperCase().slice(0, 4);
  if (room) {
    const input = $('#room-code');
    if (input) input.value = room;
    localStorage.setItem('mafia_roomCode', room);
    sessionStorage.setItem('mafia_in_room_session', '1');
  }
})();

$('#btn-player-memo-clear')?.addEventListener('click', clearPlayerMemo);
$('#btn-player-memo-close')?.addEventListener('click', closePlayerMemo);
$('#player-memo-overlay .player-memo-backdrop')?.addEventListener('click', closePlayerMemo);

$('#btn-execution-yes')?.addEventListener('click', () => submitExecutionVote('yes'));
$('#btn-execution-no')?.addEventListener('click', () => submitExecutionVote('no'));

$('#btn-send-chat')?.addEventListener('click', sendChat);
$('#chat-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

$('#btn-send-lobby-chat')?.addEventListener('click', sendLobbyChat);
$('#lobby-chat-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendLobbyChat(); });

function sendLobbyChat() {
  const text = ($('#lobby-chat-input').value || '').trim();
  if (!text) return;
  forceLobbyScrollBottom = true;
  socket.emit('lobbyChat', { text });
  $('#lobby-chat-input').value = '';
}

function sendChat() {
  const text = ($('#chat-input').value || '').trim();
  if (!text) return;
  forceChatScrollBottom = true;
  const me = state && state.players.find(p => p.id === state.myPlayerId);
  let eventName = 'chat';
  if (activeChatChannel === 'mafia') eventName = 'mafiaChat';
  else if (activeChatChannel === 'cult') eventName = 'cultChat';
  else if (activeChatChannel === 'lastWords') eventName = 'lastWordsChat';
  else if (activeChatChannel === 'dead' || (activeChatChannel === 'day' && me && !me.alive)) eventName = 'deadChat';
  socket.emit(eventName, { text });
  $('#chat-input').value = '';
}

document.querySelectorAll('.chat-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    activeChatChannel = tab.dataset.channel;
    updateChatTabs();
  });
});

/* ─── Mobile viewport & keyboard ─────────────────────────────────────────── */

function scrollChatToBottom() {
  const list = $('#chat-messages');
  if (list) list.scrollTop = list.scrollHeight;
}

function scrollLobbyChatToBottom() {
  const list = $('#lobby-chat-messages');
  if (list) list.scrollTop = list.scrollHeight;
}

function updateMobileViewport() {
  const root = document.documentElement;
  const vv = window.visualViewport;
  const h = vv ? vv.height : window.innerHeight;
  root.style.setProperty('--app-vh', `${Math.round(h)}px`);
  let kb = 0;
  if (vv) {
    kb = Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0));
    root.style.setProperty('--keyboard-offset', `${Math.round(kb)}px`);
  } else {
    root.style.setProperty('--keyboard-offset', '0px');
  }
}

function setupMobileOptimizations() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod|Android|Mobile/i.test(ua)) {
    document.documentElement.classList.add('is-mobile');
  }
  if (/iPhone|iPad|iPod/i.test(ua)) {
    document.documentElement.classList.add('is-ios');
  }

  updateMobileViewport();
  window.addEventListener('resize', updateMobileViewport, { passive: true });
  window.addEventListener('orientationchange', () => {
    setTimeout(updateMobileViewport, 80);
    setTimeout(updateMobileViewport, 320);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateMobileViewport, { passive: true });
    window.visualViewport.addEventListener('scroll', updateMobileViewport, { passive: true });
  }

  const chatInput = $('#chat-input');
  if (chatInput) {
    chatInput.addEventListener('focus', () => {
      setTimeout(() => {
        scrollChatToBottom();
        chatInput.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, 280);
    });
  }

  const lobbyInput = $('#lobby-chat-input');
  if (lobbyInput) {
    lobbyInput.addEventListener('focus', () => {
      setTimeout(scrollLobbyChatToBottom, 280);
    });
  }

  const onPageVisible = () => {
    if (document.visibilityState !== 'visible') return;
    updateMobileViewport();
    if (!reconnectPaused && !socket.connected) {
      socket.connect();
    } else if (!reconnectPaused && socket.connected) {
      requestSessionSync();
    }
  };
  document.addEventListener('visibilitychange', onPageVisible);
  window.addEventListener('pageshow', (ev) => {
    if (ev.persisted) onPageVisible();
  });
}

setupMobileOptimizations();
startConnectionWatchers();
updateLobbyConnectionUi();

function setupChatGuessDelegation() {
  const list = $('#chat-messages');
  if (!list || list.dataset.guessDelegated === '1') return;
  list.dataset.guessDelegated = '1';
  list.addEventListener('click', (ev) => {
    const btn = ev.target && ev.target.closest && ev.target.closest('[data-guess-id]');
    if (!btn) return;
    ev.preventDefault();
    const raw = btn.getAttribute('data-guess-id');
    const pid = raw ? Number(raw) : NaN;
    if (!Number.isFinite(pid)) return;
    openPlayerRolePicker(pid);
  });
}
setupChatGuessDelegation();
