/**
 * 게임 공개 스킬 정보 — 모든 봇 투표·판단의 공통 팩트 저장소.
 */

function ensurePublicVoteIntel(room) {
  if (!room.game) return [];
  if (!room.game.publicVoteIntel) room.game.publicVoteIntel = [];
  return room.game.publicVoteIntel;
}

function pushPublicVoteIntel(room, entry) {
  const list = ensurePublicVoteIntel(room);
  const row = {
    targetId: entry.targetId,
    source: entry.source,
    role: entry.role || null,
    isMafia: entry.isMafia == null ? null : !!entry.isMafia,
    nightIndex: room.game.nightIndex || 0,
    at: Date.now()
  };
  const idx = list.findIndex(
    (e) => e.targetId === row.targetId && e.source === row.source
  );
  if (idx >= 0) list[idx] = { ...list[idx], ...row };
  else list.push(row);
}

function syncBotKnownRoleAll(room, targetId, role, botLearnRole) {
  if (!targetId || !role || !botLearnRole) return;
  for (const p of Object.values(room.players)) {
    if (p.isBot && p.alive) botLearnRole(room, p.id, targetId, role);
  }
}

function publishPoliceIntelToPublic(room) {
  const police = Object.values(room.players).find(
    (p) => p.role === 'police' && p.alive
  );
  if (!police || !room.game?.policeIntel) return;
  const idx = room.game.nightIndex || 0;
  const intel = (room.game.policeIntel[police.id] || [])
    .filter((r) => r.nightIndex === idx)
    .sort((a, b) => (b.at || 0) - (a.at || 0));
  const row = intel[0];
  if (!row) return;
  pushPublicVoteIntel(room, {
    targetId: row.targetId,
    isMafia: row.isMafia,
    source: 'police'
  });
}

function ingestReporterReveal(room, reveal, botLearnRole) {
  if (!reveal || !reveal.targetId || !reveal.role) return;
  pushPublicVoteIntel(room, {
    targetId: reveal.targetId,
    role: reveal.role,
    source: 'reporter'
  });
  syncBotKnownRoleAll(room, reveal.targetId, reveal.role, botLearnRole);
}

function ingestSoldierBlock(room, soldierId, botLearnRole) {
  if (!soldierId) return;
  pushPublicVoteIntel(room, {
    targetId: soldierId,
    role: 'soldier',
    source: 'soldier_block'
  });
  syncBotKnownRoleAll(room, soldierId, 'soldier', botLearnRole);
}

function ingestFromNightReport(room, report, botLearnRole) {
  if (!report) return;
  if (report.reporterReveal) {
    ingestReporterReveal(room, report.reporterReveal, botLearnRole);
  }
  if (report.soldierBlock && report.soldierBotId) {
    ingestSoldierBlock(room, report.soldierBotId, botLearnRole);
  }
}

/** 채팅에 올라온 수사 결과 → 봇 투표 팩트 (조결 후 자투 방지) */
function ingestPoliceReportsFromDayChat(room, helpers) {
  if (!room.game) return;
  const voteFacts = require('./bot-vote-facts');
  const dayChat = helpers.getChatMessages
    ? helpers.getChatMessages(room, 'day')
    : (room.chatLog && room.chatLog.day) || [];
  if (!room.game.ingestedPoliceChatKeys) room.game.ingestedPoliceChatKeys = {};

  for (const msg of dayChat) {
    if (!msg?.text || !msg.fromId || msg.system) continue;
    if (!/수사\s*결과/.test(msg.text)) continue;
    const key = `${msg.fromId}:${msg.time || 0}:${msg.text.slice(0, 96)}`;
    if (room.game.ingestedPoliceChatKeys[key]) continue;
    room.game.ingestedPoliceChatKeys[key] = true;

    const { innocent, mafia } = voteFacts.parsePoliceReportFromText(room, msg.text);
    for (const p of innocent) {
      pushPublicVoteIntel(room, {
        targetId: p.id,
        isMafia: false,
        source: 'police'
      });
    }
    for (const p of mafia) {
      pushPublicVoteIntel(room, {
        targetId: p.id,
        isMafia: true,
        source: 'police'
      });
    }
  }
}

module.exports = {
  pushPublicVoteIntel,
  publishPoliceIntelToPublic,
  ingestReporterReveal,
  ingestSoldierBlock,
  ingestFromNightReport,
  ingestPoliceReportsFromDayChat
};
