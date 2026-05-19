/**
 * 게임 공개 스킬 정보 — 모든 봇 투표·판단의 공통 팩트 저장소.
 */
const policeFmt = require('./police-report-format');

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
  if (idx >= 0) {
    const prev = list[idx];
    const merged = { ...prev, ...row };
    if (row.source === 'police' && (prev.isMafia === true || row.isMafia === true)) {
      merged.isMafia = true;
    }
    list[idx] = merged;
  } else list.push(row);
}

/** 해당 스킬을 쓴 봇만 비공개로 직업을 앎 (전체 봇 mind 동기화 금지) */
function syncBotKnownRolePrivate(room, actorBotId, targetId, role, botLearnRole) {
  if (!targetId || !role || !botLearnRole || !actorBotId) return;
  const actor = room.players && room.players[actorBotId];
  if (actor && actor.isBot && actor.alive) botLearnRole(room, actorBotId, targetId, role);
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

function ingestReporterReveal(room, reveal, botLearnRole, reporterBotId = null) {
  if (!reveal || !reveal.targetId || !reveal.role) return;
  pushPublicVoteIntel(room, {
    targetId: reveal.targetId,
    role: reveal.role,
    source: 'reporter'
  });
  if (reporterBotId) syncBotKnownRolePrivate(room, reporterBotId, reveal.targetId, reveal.role, botLearnRole);
}

function ingestSoldierBlock(room, soldierId, botLearnRole) {
  if (!soldierId) return;
  pushPublicVoteIntel(room, {
    targetId: soldierId,
    role: 'soldier',
    source: 'soldier_block'
  });
  syncBotKnownRolePrivate(room, soldierId, soldierId, 'soldier', botLearnRole);
}

function ingestFromNightReport(room, report, botLearnRole) {
  if (!report) return;
  if (report.reporterReveal) {
    ingestReporterReveal(room, report.reporterReveal, botLearnRole, report.reporterBotId || null);
  }
  if (report.soldierBlock && report.soldierBotId) {
    ingestSoldierBlock(room, report.soldierBotId, botLearnRole);
  }
}

/** 채팅에 올라온 수사 결과 → 봇 투표 팩트 (조결 후 자투 방지) */
function ingestMediumPurifyReveal(room, targetId, role, botLearnRole, mediumBotId = null) {
  if (!targetId || !role) return;
  pushPublicVoteIntel(room, {
    targetId,
    role,
    source: 'medium'
  });
  if (mediumBotId) syncBotKnownRolePrivate(room, mediumBotId, targetId, role, botLearnRole);
}

/** 영매 봇 성불 공개 멘트 → 투표 팩트 */
function ingestMediumPurifyFromDayChat(room, helpers, roleLabels) {
  if (!room.game) return;
  const mediumPurify = require('./bot-medium-purify');
  const dayChat = helpers.getChatMessages
    ? helpers.getChatMessages(room, 'day')
    : (room.chatLog && room.chatLog.day) || [];
  if (!room.game.ingestedMediumChatKeys) room.game.ingestedMediumChatKeys = {};

  for (const msg of dayChat) {
    if (!msg?.text || !msg.fromId || msg.system) continue;
    const parsed = mediumPurify.parseMediumAnnounceFromText(msg.text, room, roleLabels);
    if (!parsed) continue;
    const key = `${msg.fromId}:${msg.time || 0}:${parsed.targetId}`;
    if (room.game.ingestedMediumChatKeys[key]) continue;
    room.game.ingestedMediumChatKeys[key] = true;
    const speaker = helpers.getPlayerById ? helpers.getPlayerById(room, msg.fromId) : null;
    const mediumBotId = speaker && speaker.isBot && speaker.role === 'medium' ? speaker.id : null;
    ingestMediumPurifyReveal(room, parsed.targetId, parsed.role, helpers.botLearnRole, mediumBotId);
  }
}

const POLITICIAN_CLAIM_RE = /(?:저는|나는|제가|전)\s*정치인|정치인입니다|낮\s*투표\s*2표|찬반\s*처형\s*면역|투표로\s*처형되지/;

/** 채팅 정치인 직공 → 투표 면제 팩트 (시민은 더 이상 지목·투표 불필요) */
function ingestPoliticianClaimsFromDayChat(room, helpers) {
  if (!room.game) return;
  const dayChat = helpers.getChatMessages
    ? helpers.getChatMessages(room, 'day')
    : (room.chatLog && room.chatLog.day) || [];
  if (!room.game.ingestedPoliticianChatKeys) room.game.ingestedPoliticianChatKeys = {};

  for (const msg of dayChat) {
    if (!msg?.text || !msg.fromId || msg.system) continue;
    if (!POLITICIAN_CLAIM_RE.test(msg.text)) continue;
    const key = `${msg.fromId}:${msg.time || 0}:pol`;
    if (room.game.ingestedPoliticianChatKeys[key]) continue;
    room.game.ingestedPoliticianChatKeys[key] = true;
    const speaker = helpers.getPlayerById ? helpers.getPlayerById(room, msg.fromId) : null;
    if (!speaker || !speaker.alive) continue;
    pushPublicVoteIntel(room, {
      targetId: speaker.id,
      role: 'politician',
      source: 'politician_claim',
      isMafia: false
    });
  }
}

/** "봇8 마피아" 등 일반 채팅 지목 → 투표 팩트 (경찰 조결 형식 아니어도 반영) */
function ingestChatMafiaAccusationsFromDayChat(room, helpers) {
  if (!room.game) return;
  const voteFacts = require('./bot-vote-facts');
  const dayChat = helpers.getChatMessages
    ? helpers.getChatMessages(room, 'day')
    : (room.chatLog && room.chatLog.day) || [];
  if (!room.game.ingestedChatAccuseKeys) room.game.ingestedChatAccuseKeys = {};

  for (const msg of dayChat) {
    if (!msg?.text || msg.system) continue;
    const { innocent, mafia } = voteFacts.parsePoliceReportFromText(room, msg.text);
    if (!mafia.length) continue;
    const key = `${msg.fromId || 'sys'}:${msg.time || 0}:${mafia.map((p) => p.id).join(',')}`;
    if (room.game.ingestedChatAccuseKeys[key]) continue;
    room.game.ingestedChatAccuseKeys[key] = true;
    for (const p of mafia) {
      if (innocent.some((i) => i.id === p.id)) continue;
      pushPublicVoteIntel(room, {
        targetId: p.id,
        isMafia: true,
        source: 'chat_accuse'
      });
    }
  }
}

function ingestPoliceReportsFromDayChat(room, helpers) {
  if (!room.game) return;
  const voteFacts = require('./bot-vote-facts');
  const dayChat = helpers.getChatMessages
    ? helpers.getChatMessages(room, 'day')
    : (room.chatLog && room.chatLog.day) || [];
  if (!room.game.ingestedPoliceChatKeys) room.game.ingestedPoliceChatKeys = {};

  for (const msg of dayChat) {
    if (!msg?.text || !msg.fromId || msg.system) continue;
    if (!policeFmt.looksLikePoliceReport(msg.text)) continue;
    const key = `${msg.fromId}:${msg.time || 0}:${msg.text.slice(0, 96)}`;
    if (room.game.ingestedPoliceChatKeys[key]) continue;
    room.game.ingestedPoliceChatKeys[key] = true;

    const speaker = helpers.getPlayerById ? helpers.getPlayerById(room, msg.fromId) : null;
    if (speaker?.alive && speaker.role === 'police') {
      pushPublicVoteIntel(room, {
        targetId: speaker.id,
        isMafia: false,
        source: 'police_claim'
      });
    }

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
  ingestMediumPurifyReveal,
  ingestMediumPurifyFromDayChat,
  ingestChatMafiaAccusationsFromDayChat,
  ingestPoliceReportsFromDayChat,
  ingestPoliticianClaimsFromDayChat
};
