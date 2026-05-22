/**
 * 영매 성불 채팅 요청 — 의심 사망자 성불·결과 공개
 */

const MEDIUM_PURIFY_CHAT = /영매\s*성불|성불\s*(?:해|해주|부탁|좀|해줘)|성불해|영매님.*성불|성불\s*가능|성불\s*부탁드/;
const MEDIUM_ANNOUNCE_RE = /([^\s.,]+)님\s*성불(?:했|하였|함)?(?:습니다)?\.?\s*직업(?:은|이)?\s*([^\s.,]+)/;
/** Mafia42 스타일: "봇9님 성불 결과 [마피아]입니다" */
const MEDIUM_RESULT_RE = /([^\s.,]+)님\s*성불\s*결과\s*\[(.+?)\]/;
const DEAD_ROLE_CLAIM_RE = /(?:저는|나는|제가|전)\s*([^\s.,]{2,12})(?:이었|였|입니다|임)/;
const DEAD_SUSPECT_RE = /의심|수상|지목|마피아|투표|몰표|처형|짭경|맞경/;

function isMediumAnnounceText(text) {
  if (!text) return false;
  const s = String(text);
  return MEDIUM_ANNOUNCE_RE.test(s) || MEDIUM_RESULT_RE.test(s);
}

function isMediumPurifyRequest(text) {
  if (!text) return false;
  const compact = String(text).replace(/\s+/g, '');
  return MEDIUM_PURIFY_CHAT.test(compact) || MEDIUM_PURIFY_CHAT.test(String(text));
}

function isMediumDeathPromptText(text) {
  if (!text) return false;
  const compact = String(text).replace(/\s+/g, '');
  return /사망자\s*채팅|밤\s*성불|성불\s*부탁|사망\s*확인/.test(compact);
}

function formatPurifyAnnounce(nickname, roleLabel) {
  return `${nickname}님 성불했습니다. 직업은 ${roleLabel}입니다.`;
}

function formatPurifyResultLine(nickname, roleLabel) {
  return `${nickname}님 성불 결과 [${roleLabel}]입니다.`;
}

function isMediumPurifyEligible(room, target, nightIndex) {
  if (!target || target.alive) return false;
  const diedAt = target.deadSinceNightIndex;
  if (diedAt == null || diedAt === undefined) return true;
  const ni = nightIndex != null ? nightIndex : (room.game?.nightIndex || 0);
  return diedAt < ni;
}

function listEligibleDead(room, nightIndex) {
  return Object.values(room.players || {}).filter(
    (p) => p && !p.alive && isMediumPurifyEligible(room, p, nightIndex)
  );
}

function getDeadChatForPlayer(room, playerId) {
  return (room.chatLog?.dead || []).filter((m) => m?.fromId === playerId && m.text);
}

function findPlayerByNickname(room, nick) {
  if (!nick || !room?.players) return null;
  return Object.values(room.players).find((p) => p?.nickname === nick) || null;
}

function findPlayersMentionedInText(room, text) {
  if (!text || !room?.players) return [];
  const raw = String(text);
  const out = [];
  for (const p of Object.values(room.players)) {
    if (!p?.nickname || !p.alive) continue;
    if (raw.includes(p.nickname)) out.push(p);
  }
  out.sort((a, b) => b.nickname.length - a.nickname.length);
  return out;
}

function pickRoleClaimFromDeadChat(deadMsgs, roleLabels) {
  for (const m of deadMsgs) {
    const raw = String(m.text || '');
    const hit = raw.match(DEAD_ROLE_CLAIM_RE);
    if (!hit || !hit[1]) continue;
    const token = hit[1].replace(/[\[\]]/g, '').trim();
    for (const [key, label] of Object.entries(roleLabels || {})) {
      if (label === token || token.includes(label)) return `저는 ${label}이었습니다`;
    }
    if (token === '마피아') return '저는 마피아였습니다';
    return `저는 ${token}이었습니다`;
  }
  return null;
}

function synthesizeDeadChatSnippet(target, roleLabels) {
  const label = roleLabels?.[target.role] || target.role || '시민';
  const pools = {
    police: [
      `저는 ${label}이었습니다. 맞경은 살아 있는 경찰 조결만 따르십시오.`,
      `저는 경찰이었습니다. 남은 경찰 주장 라인을 먼저 검증해 주십시오.`
    ],
    mafia: [
      `저는 ${label}이었습니다. 살아 있는 분 중 수상한 라인을 다시 보십시오.`,
      `단서 남깁니다. 맞경·조결 흐름이 어긋난 분부터 의심해 주십시오.`
    ],
    spy: [
      `저는 ${label}이었습니다. 접선·밤챗 이야기는 팩트 확인 후에나 말하십시오.`,
      `저는 스파이였습니다. 살아 있는 경찰 조결과 대조해 주십시오.`
    ],
    doctor: [
      `저는 ${label}이었습니다. 힐이 떴어도 제 직업만 확정입니다.`,
      `저는 의사였습니다. 눈힐 방향은 살아 있는 경찰·사탐을 따르십시오.`
    ],
    reporter: [
      `저는 ${label}이었습니다. 취재 공표와 조결을 맞춰 보십시오.`,
      `저는 기자였습니다. 맞직은 취재로 가리십시오.`
    ],
    medium: [
      `저는 ${label}이었습니다. 살아 있는 영매가 이 채팅을 낮에 전달해 주십시오.`,
      `영매 단서입니다. 조결·사망자 채팅이 겹치는 쪽을 먼저 보십시오.`
    ],
    private_detective: [
      `저는 ${label}이었습니다. 살아 있는 사탐 관찰을 우선 따르십시오.`,
      `사립탐정이었습니다. 밤 손 방향 브리핑을 낮에 올려 주십시오.`
    ]
  };
  const pool = pools[target.role] || [
    `저는 ${label}이었습니다. 제가 보기에 가장 수상한 라인을 남깁니다.`,
    `사망자 채팅입니다. 공개된 조결·취재와 함께 검토해 주십시오.`
  ];
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickSuspectFromDeadChat(room, deadPlayerId, helpers) {
  const msgs = getDeadChatForPlayer(room, deadPlayerId);
  let best = null;
  let bestLen = 0;
  for (const m of msgs) {
    const text = String(m.text || '');
    if (!DEAD_SUSPECT_RE.test(text)) continue;
    const mentioned = findPlayersMentionedInText(room, text).filter((p) => p.id !== deadPlayerId);
    for (const p of mentioned) {
      if (p.nickname.length > bestLen) {
        best = p;
        bestLen = p.nickname.length;
      }
    }
  }
  if (best) return best;
  if (helpers?.buildSuspicionScores && helpers?.getAlivePlayers) {
    const medium = helpers.getPlayerById ? helpers.getPlayerById(room, deadPlayerId) : null;
    const voter = medium || { id: deadPlayerId, role: 'medium', alive: false };
    const scores = helpers.buildSuspicionScores(room, voter) || {};
    const alive = helpers.getAlivePlayers(room).filter((p) => p.id !== deadPlayerId);
    alive.sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
    if (alive.length && (scores[alive[0].id] || 0) > 0) return alive[0];
  }
  return null;
}

/**
 * 영매 낮 공유: 성불 + 사망자 채팅 요약 + 의심 지목(투표 유도)
 * @returns {{ lines: string[], suspectId: string|null, targetId: string, role: string|null }}
 */
function buildMediumDayShareLines(room, medium, target, helpers, roleLabels) {
  const empty = { lines: [], suspectId: null, targetId: null, role: null };
  if (!target || !room) return empty;
  if (target.alive || !isMediumPurifyEligible(room, target)) return empty;

  const mind = helpers?.getBotMind ? helpers.getBotMind(room, medium.id) : { knownRoles: {} };
  const pending = room.game?.pendingMediumReveal;
  let role = mind.knownRoles?.[target.id] || target.role || null;
  if (pending && pending.targetId === target.id && pending.role) {
    role = pending.role;
  }
  const label = (role && roleLabels?.[role]) || roleLabels?.[target.role] || '시민';

  const lines = [formatPurifyResultLine(target.nickname, label)];
  const deadMsgs = getDeadChatForPlayer(room, target.id);
  let roleClaim = pickRoleClaimFromDeadChat(deadMsgs, roleLabels);

  if (deadMsgs.length) {
    if (!roleClaim) {
      const snippet = deadMsgs
        .slice(-2)
        .map((m) => String(m.text).trim())
        .filter(Boolean)
        .join(' ')
        .slice(0, 110);
      if (snippet) lines.push(`사망자 채팅: ${snippet}`);
    } else {
      lines.push(`사망자 채팅: "${roleClaim}" (성불 [${label}]과 대조해 주십시오)`);
    }
  } else {
    const synthetic = synthesizeDeadChatSnippet(target, roleLabels);
    lines.push(`사망자 채팅(요약): ${synthetic}`);
    roleClaim = synthetic;
  }

  const suspect = pickSuspectFromDeadChat(room, target.id, helpers);
  if (suspect?.alive) {
    lines.push(
      `${target.nickname}님이 ${suspect.nickname}님을 의심했습니다. 시민은 ${suspect.nickname}님 쪽 표를 검토해 주십시오.`
    );
    return { lines, suspectId: suspect.id, targetId: target.id, role };
  }

  if (role && (role === 'mafia' || role === 'spy')) {
    lines.push(
      `${target.nickname}님은 [${label}]였습니다. 팀 색 라인을 의심해 주십시오.`
    );
  } else if (role === 'police') {
    lines.push(
      `${target.nickname}님은 [${label}]였습니다. 남은 경찰 주장·맞경 라인부터 정리해 주십시오.`
    );
  }

  return { lines, suspectId: null, targetId: target.id, role };
}

/** 밤 사망·채팅 요청 시 우선 공유할 사망자 (최근 밤 사망 → 성불 대상) */
function pickDeathShareTargets(room, helpers, preferIds = []) {
  const ni = room.game?.nightIndex || 0;
  const eligible = listEligibleDead(room, ni);
  const out = [];
  const seen = new Set();
  for (const id of preferIds || []) {
    const p = helpers?.getPlayerById ? helpers.getPlayerById(room, id) : null;
    if (p && !p.alive && !seen.has(p.id)) {
      seen.add(p.id);
      out.push(p);
    }
  }
  for (const p of eligible) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      out.push(p);
    }
  }
  return out.slice(0, 2);
}

function pickSuspiciousDeadTarget(room, medium, helpers) {
  const ni = room.game?.nightIndex || 0;
  const dead = listEligibleDead(room, ni);
  if (!dead.length) return null;

  const mind = helpers.getBotMind ? helpers.getBotMind(room, medium.id) : { knownRoles: {} };
  const scores = helpers.buildSuspicionScores
    ? helpers.buildSuspicionScores(room, medium)
    : {};

  const unknown = dead.filter((p) => !mind.knownRoles?.[p.id]);
  const pool = unknown.length ? unknown : dead;
  pool.sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
  return pool[0] || null;
}

function pickKnownDeadForAnnounce(room, medium, helpers) {
  const mind = helpers.getBotMind ? helpers.getBotMind(room, medium.id) : { knownRoles: {} };
  const ni = room.game?.nightIndex || 0;
  const dead = listEligibleDead(room, ni).filter((p) => mind.knownRoles?.[p.id]);
  if (!dead.length) return null;

  const scores = helpers.buildSuspicionScores
    ? helpers.buildSuspicionScores(room, medium)
    : {};
  dead.sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
  return dead[0];
}

function parseMediumAnnounceFromText(text, room, roleLabels) {
  if (!text || !room) return null;
  const s = String(text);
  let m = s.match(MEDIUM_ANNOUNCE_RE);
  let format = 'announce';
  if (!m) {
    m = s.match(MEDIUM_RESULT_RE);
    format = 'result';
  }
  if (!m) return null;

  const nick = m[1];
  const label = m[2].replace(/[\[\]]/g, '').trim();
  const target = findPlayerByNickname(room, nick);
  if (!target || target.alive) return null;
  if (!isMediumPurifyEligible(room, target)) return null;

  let role = null;
  for (const [key, val] of Object.entries(roleLabels || {})) {
    if (val === label) {
      role = key;
      break;
    }
  }
  if (!role && label === '마피아') role = 'mafia';
  if (!role) role = target.role;

  const { agentLog } = require('./debug-agent-log');
  agentLog({
    hypothesisId: 'H_medium_parse',
    location: 'bot-medium-purify.js:parseMediumAnnounceFromText',
    message: 'medium announce parsed',
    runId: 'medium-ui-fix',
    data: { format, nick, label, targetId: target.id, role }
  });

  return { targetId: target.id, role, nickname: nick, roleLabel: label };
}

module.exports = {
  isMediumPurifyRequest,
  isMediumDeathPromptText,
  formatPurifyAnnounce,
  formatPurifyResultLine,
  isMediumPurifyEligible,
  listEligibleDead,
  getDeadChatForPlayer,
  buildMediumDayShareLines,
  pickDeathShareTargets,
  pickSuspiciousDeadTarget,
  pickKnownDeadForAnnounce,
  parseMediumAnnounceFromText,
  isMediumAnnounceText,
  MEDIUM_ANNOUNCE_RE,
  MEDIUM_RESULT_RE
};
