/**
 * 영매 성불·기자 취재 등 스킬 수행자 기준 홀직 확직 / 맞직 갈등 (UI 초상화).
 * 채팅 직공만으로는 확직하지 않음 — 2번째 밤 이후 스킬 결과 공유가 있어야 함.
 */
const mediumPurify = require('./bot-medium-purify');
const m42Pd = require('./m42-private-detective');
const m42PdInterview = require('./m42-pd-role-interview');
const { agentLog } = require('./debug-agent-log');

/** 기자 취재·영매 성불과 동일: 2번째 밤(nightIndex 2)부터 */
const MIN_SKILL_NIGHT_INDEX = 2;

/** 기자·영매 스킬 결과를 슬롯/UI에 공개하는 낮 페이즈 */
const DAY_SKILL_PUBLIC_PHASES = new Set([
  'day_chat',
  'day_vote',
  'last_words',
  'execution_vote'
]);

function isDaySkillPublicPhase(room) {
  return DAY_SKILL_PUBLIC_PHASES.has(room?.phase);
}

function getNightIndex(room) {
  return room.game?.nightIndex ?? 0;
}

function canConfirmSkillPerformers(room) {
  return !!room.game && getNightIndex(room) >= MIN_SKILL_NIGHT_INDEX;
}

function getDayChat(room, helpers) {
  return helpers.getChatMessages
    ? helpers.getChatMessages(room, 'day')
    : (room.chatLog && room.chatLog.day) || [];
}

function intelRowUsable(row) {
  if (!row || row.targetId == null) return false;
  const ni = row.nightIndex;
  if (ni == null || ni === undefined) return true;
  if (row.source === 'private_detective_performer') return ni >= 1;
  return ni >= MIN_SKILL_NIGHT_INDEX;
}

/** 성불 결과 공개 멘트를 낸 플레이어 (채팅 직공 제외) */
function collectMediumPerformerIds(room, helpers, roleLabels) {
  const ids = new Set();
  for (const msg of getDayChat(room, helpers)) {
    if (!msg?.fromId || !msg.text || msg.system) continue;
    if (
      mediumPurify.isMediumAnnounceText(msg.text)
      || mediumPurify.parseMediumAnnounceFromText(msg.text, room, roleLabels)
    ) {
      ids.add(msg.fromId);
    }
  }
  for (const row of room.game?.publicVoteIntel || []) {
    if (row.source === 'medium_performer' && intelRowUsable(row)) {
      ids.add(row.targetId);
    }
  }
  return [...ids];
}

/** 취재 공표가 낮에 나온 기자만 (밤·새벽에는 확직 UI 금지) */
function collectReporterPerformerIds(room, helpers) {
  const ids = new Set();
  if (!isDaySkillPublicPhase(room)) return [...ids];

  const g = room.game || {};
  for (const msg of getDayChat(room, helpers)) {
    if (!msg?.fromId || !msg.text || msg.system) continue;
    const compact = String(msg.text).replace(/\s+/g, '');
    if (/기자\s*취재|취재\s*결과|취재\s*공표/.test(compact)) {
      ids.add(msg.fromId);
    }
  }
  for (const row of g.publicVoteIntel || []) {
    if (row.source === 'reporter_performer' && intelRowUsable(row)) {
      ids.add(row.targetId);
    }
  }
  return [...ids];
}

/** 사탐 관찰 브리핑·직공을 낸 플레이어 (낮 채팅·공개 인텔만 — 역할 슬롯만으로 확직 금지) */
function collectPrivateDetectivePerformerIds(room, helpers) {
  const ids = new Set();
  for (const msg of getDayChat(room, helpers)) {
    if (!msg?.fromId || !msg.text || msg.system) continue;
    if (m42Pd.looksLikeDetectiveBrief(msg.text, room)) {
      const speaker = helpers.getPlayerById ? helpers.getPlayerById(room, msg.fromId) : null;
      if (speaker?.role === 'private_detective') {
        ids.add(msg.fromId);
      }
    }
  }
  for (const row of room.game?.publicVoteIntel || []) {
    if (row.source === 'private_detective_performer' && intelRowUsable(row)) {
      ids.add(row.targetId);
    }
  }
  return [...ids];
}

function pickAliveOrAll(ids, room, helpers) {
  const alive = ids.filter((id) => {
    const p = helpers.getPlayerById ? helpers.getPlayerById(room, id) : null;
    return !p || p.alive;
  });
  return alive.length ? alive : ids;
}

/** @returns {{ confirmedById: Record<string,string>, matchedById: Record<string,string> }} */
function resolvePerformerRoleSlots(room, helpers, roleLabels) {
  const confirmedById = {};
  const matchedById = {};
  const nightIndex = getNightIndex(room);
  let mediumIds = [];
  let reporterIds = [];
  let mediumPick = [];
  let reporterPick = [];
  let pdIds = [];
  let pdPick = [];

  if (nightIndex >= 1 && isDaySkillPublicPhase(room)) {
    pdIds = collectPrivateDetectivePerformerIds(room, helpers);
    pdPick = pickAliveOrAll(pdIds, room, helpers);
    if (pdPick.length === 1) confirmedById[pdPick[0]] = 'private_detective';
    else if (pdPick.length >= 2) {
      for (const id of pdPick) matchedById[id] = 'private_detective';
    }
  }

  if (!canConfirmSkillPerformers(room)) {
    // #region agent log
    agentLog({
      hypothesisId: 'H_skill_confirm_gate',
      location: 'm42-role-confirm.js:resolvePerformerRoleSlots',
      message: 'skill performer confirm skipped (before night 2)',
      runId: 'skill-confirm-gate',
      data: {
        roomCode: room.code,
        phase: room.phase,
        nightIndex,
        minNight: MIN_SKILL_NIGHT_INDEX,
        pdIds,
        pdPick,
        confirmedById,
        matchedById
      }
    });
    // #endregion
    return { confirmedById, matchedById };
  }

  if (isDaySkillPublicPhase(room)) {
    mediumIds = collectMediumPerformerIds(room, helpers, roleLabels);
    mediumPick = pickAliveOrAll(mediumIds, room, helpers);
    if (mediumPick.length === 1) confirmedById[mediumPick[0]] = 'medium';
    else if (mediumPick.length >= 2) {
      for (const id of mediumPick) matchedById[id] = 'medium';
    }

    reporterIds = collectReporterPerformerIds(room, helpers);
    reporterPick = pickAliveOrAll(reporterIds, room, helpers);
    if (reporterPick.length === 1) confirmedById[reporterPick[0]] = 'reporter';
    else if (reporterPick.length >= 2) {
      for (const id of reporterPick) matchedById[id] = 'reporter';
    }
  }

  // #region agent log
  agentLog({
    hypothesisId: 'H_performer_confirm',
    location: 'm42-role-confirm.js:resolvePerformerRoleSlots',
    message: 'performer role confirmation slots',
    runId: 'skill-confirm-gate',
    data: {
      roomCode: room.code,
      phase: room.phase,
      nightIndex,
      pdIds,
      pdPick,
      mediumIds,
      reporterIds,
      mediumPick,
      reporterPick,
      confirmedById,
      matchedById
    }
  });
  // #endregion

  m42PdInterview.mergePdInterviewIntoSlots(confirmedById, matchedById, room, helpers);

  return { confirmedById, matchedById };
}

module.exports = {
  MIN_SKILL_NIGHT_INDEX,
  isDaySkillPublicPhase,
  canConfirmSkillPerformers,
  collectMediumPerformerIds,
  collectReporterPerformerIds,
  collectPrivateDetectivePerformerIds,
  resolvePerformerRoleSlots
};
