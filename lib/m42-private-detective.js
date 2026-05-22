/**
 * 사립탐정(추적 관찰) — 밤에 지정한 플레이어의 능력 지목 방향을 해석합니다.
 */

const PASSIVE_MARK = /뚜렷한\s*밤\s*지목\s*동작이\s*보이지\s*않았습니다/;
const ACTIVE_MARK = /손을\s*뻗는\s*듯한\s*움직임이\s*포착되었습니다/;

const KIND_HINTS = {
  mafia_kill: '마피아 암살 손(킬 지목)일 가능성이 가장 높습니다.',
  police: '경찰 수사 손일 가능성이 높습니다.',
  doctor: '의사 치료 손일 가능성이 높습니다.',
  reporter: '기자 취재 손일 가능성이 높습니다.',
  medium: '영매 성불 손일 가능성이 높습니다.',
  spy: '스파이 조사 손일 가능성이 높습니다.',
  cult: '교주 포교 손일 가능성이 높습니다.'
};

const KIND_FROM_HINT = [
  ['mafia_kill', /마피아\s*암살|킬\s*지목/],
  ['police', /경찰\s*수사/],
  ['doctor', /의사\s*치료/],
  ['reporter', /기자\s*취재/],
  ['medium', /영매\s*성불/],
  ['spy', /스파이\s*조사/],
  ['cult', /교주\s*포교/]
];

const PD_CLAIM_RE = /(?:저는|나는|제가|전)\s*(?:사립)?탐정|사립탐정입니다|사탐입니다/;

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findPlayerByNicknameInText(room, text) {
  if (!text || !room?.players) return null;
  const raw = String(text);
  let best = null;
  let bestLen = 0;
  for (const p of Object.values(room.players)) {
    if (!p?.nickname || !p.alive) continue;
    if (!raw.includes(p.nickname)) continue;
    if (p.nickname.length > bestLen) {
      best = p;
      bestLen = p.nickname.length;
    }
  }
  return best;
}

function isSelfWatchTarget(summary) {
  if (!summary) return false;
  if (summary.watchId != null && summary.targetId != null) {
    return summary.watchId === summary.targetId;
  }
  return !!(summary.watchName && summary.targetName && summary.watchName === summary.targetName);
}

function formatDetectiveResultLine(summary) {
  if (!summary || !summary.watchName) return '관찰 결과를 정리하지 못했습니다.';
  const { watchName, targetName, kind } = summary;
  if (!targetName) {
    return `${watchName}님에게는 뚜렷한 밤 지목 동작이 보이지 않았습니다. 패시브 직업이거나 아직 능력을 쓰지 않았을 수 있습니다.`;
  }
  const hint = (kind && KIND_HINTS[kind]) || '경찰·의사·마피아 등 액티브 직의 지목일 수 있습니다. 추가 조사가 필요합니다.';
  if (isSelfWatchTarget(summary)) {
    if (kind === 'doctor') {
      return `${watchName}님은 밤에 자신에게 치료 손을 댔습니다. 의사일 가능성이 높습니다.`;
    }
    if (kind === 'mafia_kill') {
      return `${watchName}님은 밤에 자기 자신을 지목한 듯한 움직임이 포착되었습니다. 추가 확인이 필요합니다.`;
    }
    return `${watchName}님은 밤에 자신을 향한 지목 움직임이 포착되었습니다. ${hint}`;
  }
  return `${watchName}님이 ${targetName}님에게 손을 뻗는 듯한 움직임이 포착되었습니다. ${hint}`;
}

/** 채팅에 올린 사탐 관찰 브리핑인지 */
function looksLikeDetectiveBrief(text, room = null) {
  if (!text) return false;
  const raw = String(text);
  if (
    PASSIVE_MARK.test(raw)
    || ACTIVE_MARK.test(raw)
    || /자신에게\s*치료\s*손|자신을\s*향한\s*지목|자기\s*자신을\s*지목/.test(raw)
  ) {
    return true;
  }
  if (!room?.players) return false;
  return !!findPlayerByNicknameInText(room, raw) && (PASSIVE_MARK.test(raw) || ACTIVE_MARK.test(raw));
}

function inferKindFromHintText(text) {
  const raw = String(text || '');
  for (const [kind, re] of KIND_FROM_HINT) {
    if (re.test(raw)) return kind;
  }
  return null;
}

/**
 * 사탐 브리핑 파싱
 * @returns {{ watch: object|null, pointed: object|null, passive: boolean, kind: string|null }}
 */
function parseDetectiveReportFromText(room, text) {
  const empty = { watch: null, pointed: null, passive: false, kind: null };
  if (!text || !room?.players) return empty;
  const raw = String(text);

  if (!looksLikeDetectiveBrief(raw, room)) return empty;

  const watch = findPlayerByNicknameInText(room, raw);
  if (!watch) return empty;

  if (PASSIVE_MARK.test(raw)) {
    return { watch, pointed: null, passive: true, kind: null };
  }

  const selfActive = /자신에게\s*치료\s*손|자신을\s*향한\s*지목|자기\s*자신을\s*지목|밤에\s*자신에게/.test(
    raw
  );
  if (selfActive) {
    const kind = inferKindFromHintText(raw);
    return { watch, pointed: watch, passive: false, kind };
  }

  if (!ACTIVE_MARK.test(raw)) return empty;

  let pointed = null;
  const activeRe = /님이\s*([^\s.,]+)님에게\s*손을\s*뻗는/;
  const m = raw.match(activeRe);
  if (m && m[1]) {
    pointed = Object.values(room.players).find(
      (p) => p?.alive && p.nickname === m[1]
    ) || null;
  }
  if (!pointed) {
    for (const p of Object.values(room.players)) {
      if (!p?.alive || !p.nickname || p.id === watch.id) continue;
      if (raw.includes(`${p.nickname}님에게`)) {
        pointed = p;
        break;
      }
    }
  }

  const kind = inferKindFromHintText(raw);
  return { watch, pointed, passive: false, kind };
}

/** 관찰 브리핑·직공 주장자 목록 */
function scanPrivateDetectiveReporters(room, helpers) {
  const reporters = [];
  const seen = new Set();
  const dayChat = helpers.getChatMessages
    ? helpers.getChatMessages(room, 'day')
    : (room.chatLog && room.chatLog.day) || [];

  for (const msg of dayChat) {
    if (!msg?.fromId || !msg.text || msg.system) continue;
    const compact = String(msg.text).replace(/\s+/g, '');
    const brief = looksLikeDetectiveBrief(msg.text, room);
    const claim = PD_CLAIM_RE.test(compact);
    if (!brief && !claim) continue;
    if (seen.has(msg.fromId)) continue;
    const p = helpers.getPlayerById ? helpers.getPlayerById(room, msg.fromId) : null;
    if (!p || !p.alive) continue;
    seen.add(msg.fromId);
    reporters.push({ id: msg.fromId, nickname: msg.from || p.nickname });
  }

  const alivePd = helpers.getAlivePlayers
    ? helpers.getAlivePlayers(room).filter((p) => p.role === 'private_detective')
    : Object.values(room.players || {}).filter((p) => p?.alive && p.role === 'private_detective');
  for (const p of alivePd) {
    if (!seen.has(p.id)) {
      reporters.push({ id: p.id, nickname: p.nickname });
    }
  }
  return reporters;
}

/** 홀사탐 — 사탐 주장·브리핑이 1명 이하 */
function isHolPrivateDetectiveSituation(room, helpers) {
  return scanPrivateDetectiveReporters(room, helpers).length < 2;
}

function getDayChatMessages(room, helpers) {
  return helpers?.getChatMessages
    ? helpers.getChatMessages(room, 'day')
    : (room.chatLog && room.chatLog.day) || [];
}

/** 낮 채팅에 사립탐정이 관찰 브리핑·직공을 이미 올렸는지 */
function hasPrivateDetectiveBriefInDayChat(room, helpers) {
  for (const msg of getDayChatMessages(room, helpers)) {
    if (!msg?.fromId || !msg.text || msg.system) continue;
    const speaker = helpers?.getPlayerById
      ? helpers.getPlayerById(room, msg.fromId)
      : room.players?.[msg.fromId] || null;
    if (speaker?.role !== 'private_detective') continue;
    if (looksLikeDetectiveBrief(msg.text, room) || PD_CLAIM_RE.test(String(msg.text).replace(/\s+/g, ''))) {
      return true;
    }
  }
  return false;
}

/** 홀사탐에서 신뢰할 관찰 발화자(실제 사립탐정 role) */
function isTrustedPrivateDetectiveSpeaker(room, speaker, helpers) {
  if (!speaker?.alive || speaker.role !== 'private_detective') return false;
  return isHolPrivateDetectiveSituation(room, helpers);
}

/** 밤 리포트와 채팅 브리핑이 같은 관찰인지 (느슨한 검증) */
function reportMatchesNightIntel(room, speakerId, parsed) {
  const pd = room.game?.lastNightReport?.privateDetective;
  if (!pd || !parsed?.watch) return true;
  if (parsed.watch.id !== pd.watchId) return false;
  if (parsed.passive) return !pd.targetId;
  if (!pd.targetId) return false;
  return !parsed.pointed || parsed.pointed.id === pd.targetId;
}

/** 투표 팩트용: 관찰 결과를 경찰 조결과 동급으로 변환 */
function toVoteIntelRows(parsed) {
  const rows = [];
  if (!parsed?.watch) return rows;
  const watchId = parsed.watch.id;
  if (parsed.passive) {
    rows.push({ targetId: watchId, isMafia: false, role: null });
    return rows;
  }
  const kind = parsed.kind;
  if (kind === 'mafia_kill' || kind === 'spy' || kind === 'cult') {
    rows.push({ targetId: watchId, isMafia: true, role: kind === 'spy' ? 'spy' : kind === 'cult' ? 'cult_leader' : 'mafia' });
    return rows;
  }
  if (kind === 'police' || kind === 'doctor' || kind === 'reporter' || kind === 'medium') {
    rows.push({ targetId: watchId, isMafia: false, role: kind });
    return rows;
  }
  rows.push({ targetId: watchId, isMafia: false, role: null });
  if (parsed.pointed?.id) {
    rows.push({ targetId: parsed.pointed.id, isMafia: false, role: null });
  }
  return rows;
}

module.exports = {
  KIND_HINTS,
  PASSIVE_MARK,
  ACTIVE_MARK,
  isSelfWatchTarget,
  formatDetectiveResultLine,
  looksLikeDetectiveBrief,
  parseDetectiveReportFromText,
  scanPrivateDetectiveReporters,
  getDayChatMessages,
  isHolPrivateDetectiveSituation,
  hasPrivateDetectiveBriefInDayChat,
  isTrustedPrivateDetectiveSpeaker,
  reportMatchesNightIntel,
  toVoteIntelRows
};
