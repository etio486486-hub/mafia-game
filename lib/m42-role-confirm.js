/**
 * 영매 성불·기자 취재 등 스킬 수행자 기준 홀직 확직 / 맞직 갈등 (UI 초상화).
 * 채팅 직공만으로는 확직하지 않음 — 2번째 밤 이후 스킬 결과 공유가 있어야 함.
 */
const mediumPurify = require('./bot-medium-purify');
const { agentLog } = require('./debug-agent-log');

/** 기자 취재·영매 성불과 동일: 2번째 밤(nightIndex 2)부터 */
const MIN_SKILL_NIGHT_INDEX = 2;

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

/** 취재 공표가 나온 기자 (채팅 직공 제외) */
function collectReporterPerformerIds(room, helpers) {
  const ids = new Set();
  const g = room.game || {};
  const ni = getNightIndex(room);

  if (ni >= MIN_SKILL_NIGHT_INDEX) {
    if (g.lastNightReport?.reporterBotId != null) ids.add(g.lastNightReport.reporterBotId);
    const rev = g.lastNightReport?.reporterReveal;
    if (rev?.reporterId != null) ids.add(rev.reporterId);
    if (room.pendingReporterRevealData?.reporterId != null) {
      ids.add(room.pendingReporterRevealData.reporterId);
    }
  }

  for (const row of g.publicVoteIntel || []) {
    if (row.source === 'reporter_performer' && intelRowUsable(row)) {
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

  if (!canConfirmSkillPerformers(room)) {
    // #region agent log
    agentLog({
      hypothesisId: 'H_skill_confirm_gate',
      location: 'm42-role-confirm.js:resolvePerformerRoleSlots',
      message: 'skill performer confirm skipped (before night 2)',
      runId: 'skill-confirm-gate',
      data: { roomCode: room.code, phase: room.phase, nightIndex, minNight: MIN_SKILL_NIGHT_INDEX }
    });
    // #endregion
    return { confirmedById, matchedById };
  }

  const mediumIds = collectMediumPerformerIds(room, helpers, roleLabels);
  const mediumPick = pickAliveOrAll(mediumIds, room, helpers);
  if (mediumPick.length === 1) confirmedById[mediumPick[0]] = 'medium';
  else if (mediumPick.length >= 2) {
    for (const id of mediumPick) matchedById[id] = 'medium';
  }

  const reporterIds = collectReporterPerformerIds(room, helpers);
  const reporterPick = pickAliveOrAll(reporterIds, room, helpers);
  if (reporterPick.length === 1) confirmedById[reporterPick[0]] = 'reporter';
  else if (reporterPick.length >= 2) {
    for (const id of reporterPick) matchedById[id] = 'reporter';
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
      mediumIds,
      reporterIds,
      mediumPick,
      reporterPick,
      confirmedById,
      matchedById
    }
  });
  // #endregion

  return { confirmedById, matchedById };
}

module.exports = {
  MIN_SKILL_NIGHT_INDEX,
  canConfirmSkillPerformers,
  collectMediumPerformerIds,
  collectReporterPerformerIds,
  resolvePerformerRoleSlots
};
