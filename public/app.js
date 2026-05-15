/* ─── AudioManager (사운드 뼈대) ─────────────────────────────────────────── */

const AudioManager = {
  muted: localStorage.getItem('mafia_muted') === 'true',
  bgm: null,
  cache: {},

  playBGM(name) {
    if (this.muted) return;
    try {
      if (this.bgm) { this.bgm.pause(); this.bgm = null; }
      this.bgm = new Audio(`/sounds/${name}.mp3`);
      this.bgm.loop = true;
      this.bgm.volume = 0.4;
      this.bgm.play().catch(() => {});
    } catch (_) {}
  },

  playSFX(name) {
    if (this.muted) return;
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
  POLICE: 'police', DOCTOR: 'doctor', SOLDIER: 'soldier',
  POLITICIAN: 'politician', MEDIUM: 'medium', REPORTER: 'reporter',
  GRAVEROBBER: 'graverobber'
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
  [ROLE.POLICE]: {
    name: '경찰', team: '시민 팀',
    desc: '밤에 한 명을 수색해 마피아인지 조사합니다. 결과는 본인에게만 공개됩니다.',
    tip: '밤 → 대상 선택 → 마피아 수색'
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
    desc: '투표로 죽지 않습니다. 처형 투표에서 과반이 찬성해도 처형이 부결됩니다.',
    tip: '능력 사용 없음 — 투표 면역'
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
  }
};

const FX_MAP = {
  'anim-mafia-kill': { cls: 'fx-kill', text: '살해!' },
  'anim-doctor-heal': { cls: 'fx-heal', text: '치료!' },
  'anim-vote': { cls: 'fx-vote', text: '투표!' },
  'anim-execution': { cls: 'fx-execution', text: '처형!' },
  'anim-investigate': { cls: 'fx-investigate', text: '조사!' },
  'anim-reporter-flash': { cls: 'fx-reporter', text: '취재!' },
  'anim-night-fall': { cls: 'fx-phase-night', text: '밤이 됩니다' },
  'anim-dawn-rise': { cls: 'fx-phase-day', text: '아침이 밝았습니다' }
};

let userID = localStorage.getItem('userID');
if (!userID) {
  userID = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
  localStorage.setItem('userID', userID);
}

let state = null;
let selectedTargetId = null;
let playerNotes = {};
let notesSessionKey = null;
let memoEditingPlayerId = null;
let memoSelectedRole = null;
function getNotesStorageKey() {
  if (!state || !state.roomCode) return null;
  return `mafia_notes_${state.roomCode}_${notesSessionKey || 'default'}`;
}

function loadPlayerNotes() {
  const key = getNotesStorageKey();
  if (!key) { playerNotes = {}; return; }
  try {
    playerNotes = JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    playerNotes = {};
  }
}

function savePlayerNotes() {
  const key = getNotesStorageKey();
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(playerNotes));
}

function resetPlayerNotesSession() {
  notesSessionKey = String(Date.now());
  playerNotes = {};
  savePlayerNotes();
}

function getPlayerNote(playerId) {
  return playerNotes[playerId] || { guessedRole: null, note: '' };
}

function setPlayerNote(playerId, data) {
  const next = {
    guessedRole: data.guessedRole || null,
    note: (data.note || '').trim()
  };
  if (!next.guessedRole && !next.note) {
    delete playerNotes[playerId];
  } else {
    playerNotes[playerId] = next;
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
}

function openPlayerMemo(playerId) {
  openPlayerRolePicker(playerId);
}

function closePlayerMemo() {
  const overlay = $('#player-memo-overlay');
  if (overlay) overlay.hidden = true;
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
    if (state.myRole === ROLE.MEDIUM) return true;
    return [ROLE.MAFIA, ROLE.SPY, ROLE.POLICE, ROLE.DOCTOR, ROLE.REPORTER].includes(state.myRole);
  }
  return false;
}

function canSelectPlayerSlot(p) {
  if (!state || !state.myPlayerId) return false;
  const me = state.players.find(pl => pl.id === state.myPlayerId);
  if (!me) return false;
  if (state.phase === 'day_vote') return me.alive && p.alive;
  if (state.phase === 'night' && me.alive) {
    if (state.myRole === ROLE.MEDIUM) return !p.alive;
    return p.alive && [ROLE.MAFIA, ROLE.SPY, ROLE.POLICE, ROLE.DOCTOR, ROLE.REPORTER].includes(state.myRole);
  }
  return false;
}

let activeChatChannel = 'day';
const chatStore = { lobby: [], day: [], mafia: [], dead: [], lastWords: [] };
let timerInterval = null;
let phaseEndEstimate = 0;

const socket = io({
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: Infinity,
  transports: ['polling', 'websocket'],
  timeout: 25000
});
let socketConnected = false;

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

function updateLobbyConnectionUi() {
  const statusEl = $('#connection-status');
  const createBtn = $('#btn-create');
  const joinBtn = $('#btn-join');
  if (statusEl) {
    statusEl.textContent = socketConnected ? '서버 연결됨' : '서버 연결 중...';
    statusEl.classList.toggle('is-connected', socketConnected);
    statusEl.classList.toggle('is-connecting', !socketConnected);
  }
  if (createBtn) createBtn.disabled = false;
  if (joinBtn) joinBtn.disabled = false;
}

function leaveRoom() {
  if (state && state.phase && !['none', 'lobby', 'game_over'].includes(state.phase)) {
    if (!window.confirm('게임 중입니다. 방을 나가면 로비로 돌아갑니다. 나가시겠습니까?')) return;
  }
  socket.emit('leaveRoom');
  localStorage.removeItem('mafia_roomCode');
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
  return [ROLE.MAFIA, ROLE.SPY, ROLE.POLICE, ROLE.DOCTOR, ROLE.REPORTER].includes(role);
}

function setPhaseTheme(phase) {
  document.body.classList.remove('phase-night', 'phase-day', 'has-night-skill');
  if (phase === 'night') {
    document.body.classList.add('phase-night');
    if (state && hasNightSkill(state.myRole)) {
      document.body.classList.add('has-night-skill');
    }
  } else {
    document.body.classList.add('phase-day');
  }
}

function startLocalTimer(remainingMs) {
  clearInterval(timerInterval);
  phaseEndEstimate = Date.now() + remainingMs;
  const tick = () => {
    const left = phaseEndEstimate - Date.now();
    $('#timer-label').textContent = formatTime(left);
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
    $('#gameover-message').textContent = state.winner === 'mafia' ? '마피아 팀 승리!' : '시민 팀 승리!';
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

  if (Array.isArray(state.dayChat)) chatStore.day = state.dayChat;
  if (Array.isArray(state.deadChat)) chatStore.dead = state.deadChat;
  if (Array.isArray(state.mafiaChat)) chatStore.mafia = state.mafiaChat;
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
  list.scrollTop = list.scrollHeight;
}

const ROLE_PORTRAIT_VERSION = '2';
const UI_ASSET_VERSION = '3';
const PHASE_ILLUSTRATION_COUNT = 5;

let voteTimeOverlayTimer = null;
let voteResultsOverlayTimer = null;

function uiAssetUrl(name) {
  return `/assets/ui/${name}?v=${UI_ASSET_VERSION}`;
}

function phaseIllustrationUrl(kind, index) {
  const base = kind === 'night' ? 'night_fall' : 'day_dawn';
  const slot = ((Math.max(1, index) - 1) % PHASE_ILLUSTRATION_COUNT) + 1;
  return uiAssetUrl(`${base}_${slot}.png`);
}

function getPlayerSlotIndex(playerId) {
  if (!state || !state.players) return '?';
  const idx = state.players.findIndex((p) => p.id === playerId);
  return idx >= 0 ? idx + 1 : '?';
}

function buildPlayerAvatarInner(playerId) {
  const isSelf = state && playerId === state.myPlayerId;
  if (isSelf && state.myRole) return buildRolePortraitHtml(state.myRole);
  const note = getPlayerNote(playerId);
  if (note.guessedRole) {
    const label = formatGuessedRoleLabel(note.guessedRole);
    return `<img src="${rolePortraitUrl(note.guessedRole)}" alt="${escapeHtml(label)}" loading="lazy" onerror="this.replaceWith(document.createElement('span')).textContent='?'">`;
  }
  return '?';
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
  img.src = uiAssetUrl('vote_time.png');
  overlay.hidden = false;
  clearTimeout(voteTimeOverlayTimer);
  voteTimeOverlayTimer = setTimeout(() => {
    overlay.hidden = true;
  }, 2800);
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
  if (!overlay || !list || !data) return;

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
  }, 4200);
}

function hideVoteResultsOverlay() {
  const overlay = $('#vote-results-overlay');
  if (overlay) overlay.hidden = true;
  clearTimeout(voteResultsOverlayTimer);
}

function rolePortraitUrl(role) {
  if (!role) return '';
  return `/assets/roles/${role}.png?v=${ROLE_PORTRAIT_VERSION}`;
}

function buildRolePortraitHtml(role) {
  if (!role || !ROLE_GUIDE[role]) {
    return '<div class="role-portrait-fallback">?</div>';
  }
  const g = ROLE_GUIDE[role];
  const url = rolePortraitUrl(role);
  const initial = g.name.slice(0, 1);
  return `<img src="${url}" alt="${g.name}" loading="lazy" ` +
    `onerror="this.outerHTML='<div class=\\'role-portrait-fallback\\'>${initial}</div>'">`;
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

function showSkillNotice(data) {
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

  clearTimeout(skillNoticeTimer);
  skillNoticeTimer = setTimeout(() => {
    el.hidden = true;
  }, isPublic ? 6000 : 9000);
}

function showPhaseTransition(kind, title, caption, index = 1) {
  const overlay = $('#phase-transition-overlay');
  const img = $('#phase-transition-img');
  const titleEl = $('#phase-transition-title');
  const captionEl = $('#phase-transition-caption');
  if (!overlay || !img || !titleEl || !captionEl) return;

  const legacyName = kind === 'night' ? 'night_fall.png' : 'day_dawn.png';
  img.onerror = () => {
    const fallback = uiAssetUrl(legacyName);
    if (!img.src.endsWith(legacyName)) img.src = fallback;
  };
  img.src = phaseIllustrationUrl(kind, index);
  titleEl.textContent = title;
  captionEl.textContent = caption;
  overlay.hidden = false;

  clearTimeout(phaseTransitionTimer);
  phaseTransitionTimer = setTimeout(() => {
    overlay.hidden = true;
  }, 2800);
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
  desc.textContent = g.desc;
  overlay.hidden = false;
}

function closeRoleReveal() {
  const overlay = $('#role-reveal-overlay');
  if (overlay) overlay.hidden = true;
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
  return `<div class="${cls}">` +
    `<img class="role-portrait-img" src="${url}" alt="${g.name}" loading="lazy" ` +
    `onerror="this.onerror=null;this.src='${url}&retry='+Date.now();">` +
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
  const myId = state.myPlayerId;
  grid.innerHTML = state.players.map((p, i) => {
    const isSelf = p.id === myId;
    const isDead = !p.alive;
    const isCandidate = p.id === state.executionCandidateId;
    const note = getPlayerNote(p.id);
    const guessedLabel = formatGuessedRoleLabel(note.guessedRole);
    let cls = 'player-card';
    if (isDead) cls += ' dead';
    if (state.phase === 'night' && state.myRole === ROLE.MEDIUM && isDead && canSelectPlayerSlot(p)) cls += ' medium-target';
    if (selectedTargetId === p.id) cls += ' selected';
    if (isCandidate) cls += ' candidate';
    if (isSelf) cls += ' is-self';
    if (note.guessedRole) cls += ' has-guess';

    let status = isDead ? '사망' : (p.connected ? '' : '재연결');
    if (isCandidate) status = '처형 후보';

    const showRoleImg = isSelf && state.myRole;
    const avatarInner = showRoleImg
      ? buildRolePortraitHtml(state.myRole)
      : (note.guessedRole
        ? `<img src="${rolePortraitUrl(note.guessedRole)}" alt="${guessedLabel}" loading="lazy" onerror="this.replaceWith(document.createElement('span')).textContent='?'">`
        : '?');

    const guessHtml = guessedLabel
      ? `<button type="button" class="slot-guess-btn role-${note.guessedRole}" data-guess-id="${p.id}" title="직업 유추">${escapeHtml(guessedLabel)}</button>`
      : `<button type="button" class="slot-guess-btn slot-guess-empty" data-guess-id="${p.id}" title="직업 유추">직업 유추</button>`;

    const canSelect = canSelectPlayerSlot(p);
    if (state.myDayVoteTarget === p.id) cls += ' voted';

    const targetBtn = canSelect
      ? `<button type="button" class="slot-target-btn${selectedTargetId === p.id || state.myDayVoteTarget === p.id ? ' active' : ''}" data-target-id="${p.id}" title="능력/투표 대상">◎</button>`
      : '';

    return `<div class="${cls}" data-id="${p.id}">` +
      `<span class="slot-num">${i + 1}</span>` +
      targetBtn +
      `<span class="slot-key">F${i + 1}</span>` +
      `<button type="button" class="slot-select${canSelect ? '' : ' is-disabled'}" data-target-id="${p.id}" title="${canSelect ? '능력/투표 대상 선택' : ''}"${canSelect ? '' : ' disabled'}>` +
      `<div class="slot-avatar${showRoleImg || note.guessedRole ? ' has-img' : ''}">${avatarInner}</div>` +
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
    hint.textContent = state.canDeadChatSend
      ? '낮 채팅은 볼 수 있습니다. 사망자 채팅에서 다른 사망자와 대화하세요.'
      : '사망하여 능력/투표를 사용할 수 없습니다.';
    return;
  }

  if (state.phase === 'night') {
    hint.textContent = canSelectActionTarget()
      ? (state.myRole === ROLE.MEDIUM ? '사망자를 선택한 뒤 성불하세요.' : '플레이어를 선택한 뒤 능력을 사용하세요.')
      : '이 밤에는 사용할 능력이 없습니다.';
    if (state.myRole === ROLE.MAFIA) addConfirmBtn(btns, '암살 투표', () => emitNightAction('mafiaVote'));
    if (state.myRole === ROLE.SPY) addConfirmBtn(btns, '직업 조사', () => emitNightAction('spyInvestigate'));
    if (state.myRole === ROLE.POLICE) addConfirmBtn(btns, '마피아 조사', () => emitNightAction('policeInvestigate'));
    if (state.myRole === ROLE.DOCTOR) addConfirmBtn(btns, '치료', () => emitNightAction('doctorHeal'));
    if (state.myRole === ROLE.MEDIUM) addConfirmBtn(btns, '성불', () => emitNightAction('mediumPurify'));
    if (state.myRole === ROLE.REPORTER && !state.reporterUsed && (state.nightIndex || 0) >= 2) {
      addConfirmBtn(btns, '취재', () => emitNightAction('reporterScoop'));
    }
    if (state.myRole === ROLE.REPORTER && (state.nightIndex || 0) < 2) {
      hint.textContent = '기자 취재는 2번째 밤부터 사용할 수 있습니다.';
    }
    if (state.myRole === ROLE.CITIZEN || state.myRole === ROLE.SOLDIER || state.myRole === ROLE.POLITICIAN || state.myRole === ROLE.GRAVEROBBER) {
      hint.textContent = '이 밤에는 사용할 능력이 없습니다.';
    }
  } else if (state.phase === 'day_vote') {
    if (state.myDayVoteTarget) {
      const voted = state.players.find(p => p.id === state.myDayVoteTarget);
      hint.textContent = voted
        ? `${voted.nickname}에게 투표했습니다. 같은 플레이어를 다시 누르면 취소됩니다.`
        : '플레이어를 눌러 투표하세요. 같은 대상을 다시 누르면 취소됩니다.';
    } else {
      hint.textContent = '플레이어를 눌러 바로 투표하세요.';
    }
  } else if (state.phase === 'execution_vote') {
    if (state.myPlayerId === state.executionCandidateId) {
      hint.textContent = '처형 후보자는 찬반 투표에 참여할 수 없습니다.';
    } else if (state.myExecutionVote) {
      hint.textContent = '찬반 투표를 완료했습니다.';
    } else {
      hint.textContent = '찬반 투표 팝업에서 선택하세요.';
    }
  } else if (state.phase === 'last_words') {
    if (state.myPlayerId === state.executionCandidateId) {
      hint.textContent = '최후의 반론을 진행하세요. (채팅 탭)';
    } else {
      hint.textContent = '최후의 반론을 듣고 있습니다.';
    }
  } else if (state.phase === 'dawn') {
    hint.textContent = '밤 결과를 확인하는 중입니다. 대화는 낮 토론부터 가능합니다.';
  } else if (state.phase === 'day_chat') {
    hint.textContent = '자유롭게 토론하세요.';
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
    const target = state.players.find(p => p.id === selectedTargetId);
    if (!target || target.alive) return showToast('사망자만 성불할 수 있습니다.');
    socket.emit('mediumPurify', { targetId: selectedTargetId });
    runAnimation('anim-investigate', { targetId: selectedTargetId });
    return;
  }
  socket.emit(event, { targetId: selectedTargetId });
  const animMap = {
    mafiaVote: { anim: 'anim-mafia-kill', cardFx: 'fx-target-kill' },
    doctorHeal: { anim: 'anim-doctor-heal', cardFx: 'fx-target-heal' },
    spyInvestigate: { anim: 'anim-investigate', cardFx: null },
    policeInvestigate: { anim: 'anim-investigate', cardFx: null },
    reporterScoop: { anim: 'anim-reporter-flash', cardFx: null },
    mediumPurify: { anim: 'anim-investigate', cardFx: null }
  };
  const fx = animMap[event];
  if (fx) runAnimation(fx.anim, { targetId: selectedTargetId, cardFx: fx.cardFx });
}

function onPlayerCardClick(id) {
  const player = state.players.find((p) => p.id === id);
  const me = state.players.find((p) => p.id === state.myPlayerId);

  if (state.phase === 'day_vote' && me && me.alive && player && player.alive) {
    const isCancel = state.myDayVoteTarget === id;
    state.myDayVoteTarget = isCancel ? null : id;
    socket.emit('dayVote', { targetId: isCancel ? null : id });
    renderPlayerGrid();
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
  hideExecutionVoteOverlay();
  const voteOverlay = $('#vote-time-overlay');
  if (voteOverlay) voteOverlay.hidden = true;
  const voteResults = $('#vote-results-overlay');
  if (voteResults) voteResults.hidden = true;
  if (typeof clearMotionQueue === 'function') clearMotionQueue();
}

function submitExecutionVote(vote) {
  socket.emit('executionVote', { vote });
  runAnimation('anim-execution');
  hideExecutionVoteOverlay();
  showToast(vote === 'yes' ? '찬성했습니다.' : '반대했습니다.');
}

function updateChatTabs() {
  const tabDay = $('#tab-day');
  const tabMafia = $('#tab-mafia');
  const tabDead = $('#tab-dead');
  const tabLast = $('#tab-lastwords');

  tabMafia.hidden = !state.canMafiaChat;
  tabDead.hidden = !state.canDeadChatView;
  tabLast.hidden = state.phase !== 'last_words';

  if (state.phase === 'night') {
    tabDay.textContent = '밤 (낮 채팅 비활성)';
    if (state.canMafiaChat && activeChatChannel === 'day') activeChatChannel = 'mafia';
  } else if (state.phase === 'dawn' || state.phase === 'day_chat') {
    tabDay.textContent = state.phase === 'dawn' ? '아침 (대화 불가)' : '낮 채팅';
    if (activeChatChannel === 'mafia') activeChatChannel = 'day';
  } else if (state.phase === 'last_words') {
    if (activeChatChannel !== 'lastWords') activeChatChannel = 'lastWords';
  } else {
    tabDay.textContent = '낮 채팅';
  }

  if (tabLast.hidden && activeChatChannel === 'lastWords') activeChatChannel = 'day';
  if (tabMafia.hidden && activeChatChannel === 'mafia') activeChatChannel = 'day';
  if (tabDead.hidden && activeChatChannel === 'dead') activeChatChannel = 'day';

  document.querySelectorAll('.chat-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.channel === activeChatChannel);
  });

  const readOnlyDead = activeChatChannel === 'dead' && state.canDeadChatView && !state.canDeadChatSend;
  const me = state.players.find(p => p.id === state.myPlayerId);
  const deadViewDay = activeChatChannel === 'day' && me && !me.alive;
  const canType = (
    (activeChatChannel === 'day' && state.phase === 'day_chat' && me && me.alive) ||
    (activeChatChannel === 'mafia' && state.phase === 'night' && state.canMafiaChat) ||
    (activeChatChannel === 'dead' && state.canDeadChatView && state.canDeadChatSend) ||
    (activeChatChannel === 'lastWords' && state.phase === 'last_words' && state.myPlayerId === state.executionCandidateId)
  );
  const inputEnabled = canType && !readOnlyDead;
  $('#chat-input').disabled = !inputEnabled;
  $('#btn-send-chat').disabled = !inputEnabled;
  $('#chat-input').placeholder = deadViewDay
    ? '사망자는 낮 채팅을 볼 수만 있습니다.'
    : (state.phase === 'dawn' && activeChatChannel === 'day')
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

function renderChat() {
  const msgs = chatStore[activeChatChannel] || [];
  const myId = state ? state.myPlayerId : null;
  $('#chat-messages').innerHTML = msgs.map(m => {
    if (m.system) {
      return `<li class="chat-msg system"><span class="chat-bubble system">${escapeHtml(m.text)}</span></li>`;
    }
    const isMine = m.fromId === myId;
    const cls = isMine ? 'mine' : 'theirs';
    const profileHtml = m.fromId ? buildChatProfileHtml(m.fromId) : '';
    const nameLabel = isMine ? '나' : escapeHtml(m.from || '');
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
  const list = $('#chat-messages');
  list.scrollTop = list.scrollHeight;
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
    medium: '성불'
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
      line = data.targetName
        ? `${actionLabels[data.action] || '능력'} 대상: ${data.targetName}`
        : '능력 대상 선택됨';
      break;
    default: line = JSON.stringify(data);
  }
  el.innerHTML += `<div class="private-info-line">${escapeHtml(line)}</div>`;
}

/* ─── Socket events ─────────────────────────────────────────────────────────── */

socket.on('connect', () => {
  socketConnected = true;
  updateLobbyConnectionUi();
  $('#reconnect-banner').hidden = true;
  const nick = getNickname() || localStorage.getItem('mafia_nickname') || '';
  if (nick) $('#nickname').value = nick;
  const savedRoom = localStorage.getItem('mafia_roomCode');
  if (savedRoom) {
    socket.emit('join', { userID, nickname: nick || '플레이어', roomCode: savedRoom });
  } else if (nick) {
    socket.emit('join', { userID, nickname: nick, roomCode: null });
  }
});

socket.io.on('reconnect', () => {
  const savedRoom = localStorage.getItem('mafia_roomCode');
  const nick = getNickname() || localStorage.getItem('mafia_nickname') || '플레이어';
  if (savedRoom) {
    socket.emit('join', { userID, nickname: nick, roomCode: savedRoom });
  }
});

socket.on('disconnect', () => {
  socketConnected = false;
  updateLobbyConnectionUi();
  $('#reconnect-banner').hidden = false;
});

socket.on('connect_error', () => {
  socketConnected = false;
  updateLobbyConnectionUi();
  showToast('서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요.');
});

socket.on('sessionTaken', (data) => {
  showToast(data.message);
  localStorage.removeItem('mafia_roomCode');
  state = { phase: 'none', serverInfo: state && state.serverInfo ? state.serverInfo : null };
  resetLobbyClientState();
  renderFromState();
});

socket.on('joinResult', (data) => {
  if (data && data.ok === false && data.reason === 'game_in_progress') {
    showToast('방에 다시 연결할 수 없습니다. 새로고침 후 다시 시도하세요.');
  }
});

socket.on('stateSync', (data) => {
  state = data;
  if (data.roomCode) localStorage.setItem('mafia_roomCode', data.roomCode);
  else localStorage.removeItem('mafia_roomCode');
  if (data.phase === 'none') resetLobbyClientState();
  if (data.phase && data.phase !== 'lobby' && data.phase !== 'none') {
    if (!notesSessionKey) notesSessionKey = localStorage.getItem(`mafia_notes_session_${data.roomCode}`) || String(Date.now());
    localStorage.setItem(`mafia_notes_session_${data.roomCode}`, notesSessionKey);
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
    showPhaseTransition('night', `${idx}번째 밤`, '밤이 되었습니다', idx);
  } else if (data.phase === 'dawn') {
    AudioManager.playSFX('day');
    activeChatChannel = 'day';
    const idx = data.dayIndex || (state ? state.dayIndex : 0) || 1;
    showPhaseTransition('day', '아침이 밝았습니다', '밤의 결과를 확인하세요', idx);
    updateChatTabs();
  } else if (data.phase === 'day_chat') {
    if (typeof clearMotionQueue === 'function') clearMotionQueue();
    AudioManager.playSFX('day');
    activeChatChannel = 'day';
    showToast('낮 토론이 시작되었습니다. 이제 대화할 수 있습니다.');
    updateChatTabs();
  } else if (data.phase === 'day_vote') {
    runAnimation('anim-vote', { silent: true });
    showVoteTimeOverlay();
  } else if (data.phase === 'execution_vote') {
    runAnimation('anim-execution', { silent: true });
    updateExecutionVoteOverlay();
  } else if (data.phase === 'last_words') {
    activeChatChannel = 'lastWords';
  }
  if (data.phase !== 'execution_vote') hideExecutionVoteOverlay();
  selectedTargetId = null;
  if (state) {
    renderTimeButtons();
    updateChatTabs();
  }
});

socket.on('animation', (data) => {
  if (data.className) runAnimation(data.className, { silent: !!data.silent });
});

socket.on('gameMotion', (data) => {
  if (typeof enqueueMotion === 'function') enqueueMotion(data);
});

socket.on('gameMotionBatch', (data) => {
  if (!data || !data.motions) return;
  data.motions.forEach((m) => {
    if (typeof enqueueMotion === 'function') enqueueMotion(m);
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
    const labels = { mafia: '암살', spy: '조사', police: '조사', doctor: '치료', reporter: '취재', medium: '성불' };
    showSkillNotice({
      scope: 'private',
      kind: data.action,
      title: `${labels[data.action] || '능력'} 대상 지정`,
      message: data.targetName
    });
  }
  if (data.type === 'role' || data.type === 'inherit') {
    if (state) {
      state.myRole = data.role;
      state.myRoleLabel = data.roleLabel || state.myRoleLabel;
      if (data.type === 'role') {
        resetPlayerNotesSession();
        localStorage.setItem(`mafia_notes_session_${state.roomCode}`, notesSessionKey);
        showRoleReveal(data.role);
      }
      renderMyRoleSidebar();
      renderRoleGuide();
      renderActionPanel();
      renderM42Chrome();
    }
  }
});

socket.on('dayVoteResults', (data) => {
  showVoteResultsOverlay(data);
});

socket.on('chatMessage', (data) => {
  const ch = data.channel === 'lastWords' ? 'lastWords' : data.channel;
  if (!chatStore[ch]) chatStore[ch] = [];
  chatStore[ch].push(data);
  if (ch === 'lobby') renderLobbyChat();
  else if (activeChatChannel === ch) renderChat();
});

socket.on('reporterReveal', (data) => {
  showReporterReveal(data);
});

socket.on('gameOver', (data) => {
  AudioManager.playSFX('gameover');
  showToast(data.message);
});

socket.on('error', (data) => showToast(data.message));

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
  const room = (params.get('room') || '').trim().toUpperCase();
  if (room) {
    const input = $('#room-code');
    if (input) input.value = room.slice(0, 4);
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
  socket.emit('lobbyChat', { text });
  $('#lobby-chat-input').value = '';
}

function sendChat() {
  const text = ($('#chat-input').value || '').trim();
  if (!text) return;
  const map = { day: 'chat', mafia: 'mafiaChat', dead: 'deadChat', lastWords: 'lastWordsChat' };
  socket.emit(map[activeChatChannel], { text });
  $('#chat-input').value = '';
}

document.querySelectorAll('.chat-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    activeChatChannel = tab.dataset.channel;
    updateChatTabs();
  });
});

updateLobbyConnectionUi();
