/**
 * 영매 성불 채팅 요청 — 의심 사망자 성불·결과 공개
 */

const MEDIUM_PURIFY_CHAT = /영매\s*성불|성불\s*(?:해|해주|부탁|좀|해줘)|성불해|영매님.*성불|성불\s*가능|성불\s*부탁드/;

const MEDIUM_ANNOUNCE_RE = /([^\s.,]+)님\s*성불(?:했|하였|함)?(?:습니다)?\.?\s*직업(?:은|이)?\s*([^\s.,]+)/;

function isMediumPurifyRequest(text) {
  if (!text) return false;
  const compact = String(text).replace(/\s+/g, '');
  return MEDIUM_PURIFY_CHAT.test(compact) || MEDIUM_PURIFY_CHAT.test(String(text));
}

function formatPurifyAnnounce(nickname, roleLabel) {
  return `${nickname}님 성불했습니다. 직업은 ${roleLabel}입니다.`;
}

/** 이번 밤에 막 사망한 사람은 다음 밤부터 성불 가능 (Mafia42) */
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

/** 사망자 중 영매가 아직 모르는 직업 → 의심 점수 높은 순 (성불 가능 대상만) */
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

/** 이미 성불로 알고 있는 사망자 중 가장 수상한 사람 */
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
  const m = String(text).match(MEDIUM_ANNOUNCE_RE);
  if (!m) return null;
  const nick = m[1];
  const label = m[2];
  const players = Object.values(room.players || {});
  const target = players.find((p) => p.nickname === nick);
  if (!target) return null;

  let role = null;
  for (const [key, val] of Object.entries(roleLabels || {})) {
    if (val === label) {
      role = key;
      break;
    }
  }
  if (!role && label === '마피아') role = 'mafia';
  if (!role) role = target.role;
  return { targetId: target.id, role, nickname: nick, roleLabel: label };
}

module.exports = {
  isMediumPurifyRequest,
  formatPurifyAnnounce,
  isMediumPurifyEligible,
  listEligibleDead,
  pickSuspiciousDeadTarget,
  pickKnownDeadForAnnounce,
  parseMediumAnnounceFromText,
  MEDIUM_ANNOUNCE_RE
};
