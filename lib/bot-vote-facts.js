/**
 * 봇 낮/찬반 투표: 공개·본인 스킬 결과만 반영 (추측·채팅 몰표 제외).
 */
const m42CultBots = require('./m42-cult-bots');
const chatSuspicion = require('./bot-chat-suspicion');

const CITIZEN_POWER_PRIORITY = {
  police: 100,
  doctor: 92,
  reporter: 88,
  soldier: 70,
  politician: 55,
  medium: 50,
  citizen: 20,
  private_detective: 42,
  graverobber: 25
};

function powerPri(role) {
  return CITIZEN_POWER_PRIORITY[role] || 15;
}

function collectVoteIntel(room, bot, helpers) {
  const isMafia = helpers.isMafiaTeam(bot.role);
  const voteMafia = [];
  const voteCitizen = [];
  const cleared = new Set();
  const g = room.game || {};

  const addMafia = (id, pri) => {
    if (!isMafia) voteMafia.push({ id, pri });
  };
  const addCitizen = (id, pri) => {
    if (isMafia) voteCitizen.push({ id, pri });
  };
  const markCleared = (id) => cleared.add(id);

  const aliveTarget = (targetId) => {
    const p = helpers.getPlayerById(room, targetId);
    if (!p || !p.alive || p.id === bot.id) return null;
    return p;
  };

  /** 경찰 직공 자체는 확시가 아님 — 무죄 조결·확직만 cleared */

  for (const row of g.publicVoteIntel || []) {
    const p = aliveTarget(row.targetId);
    if (!p) continue;

    if (row.source === 'police' || row.source === 'police_claim') {
      if (row.isMafia === true) {
        addMafia(p.id, 100);
        if (isMafia) markCleared(p.id);
      } else if (row.isMafia === false) {
        markCleared(p.id);
        addCitizen(p.id, 35 + powerPri(p.role));
      }
    }

    if (row.source === 'chat_accuse' && row.isMafia === true) {
      addMafia(p.id, 92);
      if (isMafia) markCleared(p.id);
    }

    if (row.source === 'reporter' && row.role) {
      if (helpers.isMafiaRole(row.role)) {
        addMafia(p.id, 101);
        if (isMafia) markCleared(p.id);
      } else {
        markCleared(p.id);
        addCitizen(p.id, powerPri(row.role));
      }
    }

    if (row.source === 'soldier_block' && row.role === 'soldier') {
      markCleared(p.id);
    }

    if (row.source === 'medium' && row.role) {
      if (helpers.isMafiaRole(row.role)) {
        addMafia(p.id, 95);
        if (isMafia) markCleared(p.id);
      } else {
        markCleared(p.id);
      }
    }

    if (row.source === 'politician_claim') {
      markCleared(p.id);
      if (!isMafia) addCitizen(p.id, powerPri('politician'));
    }
  }

  if (bot.role === 'police' && g.policeIntel && g.policeIntel[bot.id]) {
    for (const row of g.policeIntel[bot.id]) {
      const p = aliveTarget(row.targetId);
      if (!p) continue;
      if (row.isMafia) addMafia(p.id, 98);
      else {
        markCleared(p.id);
        addCitizen(p.id, 40 + powerPri(p.role));
      }
    }
  }

  const mind = helpers.getBotMind ? helpers.getBotMind(room, bot.id) : { knownRoles: {} };
  const privatePri = bot.role === 'spy' ? 88 : bot.role === 'medium' ? 72 : 76;

  for (const [id, role] of Object.entries(mind.knownRoles || {})) {
    const p = aliveTarget(id);
    if (!p) continue;
    if (helpers.isMafiaRole(role)) {
      addMafia(p.id, privatePri);
      if (isMafia) markCleared(p.id);
    } else {
      markCleared(p.id);
      addCitizen(p.id, powerPri(role));
    }
  }

  return { voteMafia, voteCitizen, cleared, isMafia };
}

function pickBest(pool, cleared, isMafia, room, bot, helpers) {
  let valid = pool.filter((t) => {
    if (isMafia && cleared.has(t.id)) return false;
    if (!isMafia && cleared.has(t.id)) return false;
    return true;
  });
  if (room && bot && helpers && helpers.getPlayerById) {
    valid = valid.filter((t) => !m42CultBots.isCultAlly(room, bot, helpers.getPlayerById(room, t.id)));
  }
  if (!valid.length) return null;
  valid.sort((a, b) => b.pri - a.pri);
  return valid[0].id;
}

function pickFactBasedDayVote(room, bot, helpers) {
  ingestVoteIntelFromChat(room, helpers);
  if (isJatuCoordinationDay(room) && !hasConfirmedMafiaTarget(room, bot, helpers)) return null;

  const { voteMafia, voteCitizen, cleared, isMafia } = collectVoteIntel(room, bot, helpers);
  let id;
  if (isMafia) {
    id = pickBest(voteCitizen, cleared, true, room, bot, helpers);
  } else {
    id = pickBest(voteMafia, cleared, false, room, bot, helpers);
  }
  if (id && isDayVoteTargetForbidden(room, bot, id, helpers)) return null;
  return id;
}

/**
 * 낮 채팅 의심 키워드·봇N 언급 누적이 크면 팩트 없어도 지목 (마피아는 동료 제외).
 */
function pickChatKeywordDayVote(room, bot, helpers) {
  try {
    const voteIntel = require('./bot-vote-intel');
    if (voteIntel.ingestPoliceReportsFromDayChat) {
      voteIntel.ingestPoliceReportsFromDayChat(room, helpers);
    }
  } catch (_) { /* noop */ }

  if (isJatuCoordinationDay(room) && !hasConfirmedMafiaTarget(room, bot, helpers)) return null;

  const cleared = getClearedIds(room, bot, helpers);
  const isMafia = helpers.isMafiaTeam && helpers.isMafiaTeam(bot.role);
  const chatScores = chatSuspicion.getSuspicionScores(room, bot, helpers);
  const store = (room.game && room.game.chatSuspicion && room.game.chatSuspicion.byPlayer) || {};

  const alive = helpers.getAlivePlayers
    ? helpers.getAlivePlayers(room).filter((p) => p.id !== bot.id && p.alive)
    : [];

  let bestId = null;
  let bestScore = 0;

  for (const p of alive) {
    if (isDayVoteTargetForbidden(room, bot, p.id, helpers)) continue;
    if (m42CultBots.isCultAlly(room, bot, p)) continue;
    if (isMafia && helpers.isMafiaTeam(p.role)) continue;

    const row = store[p.id] || {};
    const accused = row.accused || 0;
    const trust = row.trust || 0;
    const hitN = (row.hits && row.hits.length) || 0;
    const ch = chatScores[p.id] || 0;
    const score = ch * 2 + accused * 2.2 + hitN * 3 - trust * 1.2;

    if (score > bestScore) {
      bestScore = score;
      bestId = p.id;
    }
  }

  const threshold = isMafia ? 26 : 12;
  if (!bestId || bestScore < threshold) return null;
  return bestId;
}

/** 최근 채팅에서 같은 대상을 지목한 서로 다른 발화자 수 */
function countRecentChatAccusers(room, targetId, helpers) {
  const dayChat = helpers.getChatMessages
    ? helpers.getChatMessages(room, 'day')
    : (room.chatLog && room.chatLog.day) || [];
  const speakers = new Set();
  for (const msg of dayChat.slice(-32)) {
    if (!msg?.text || !msg.fromId) continue;
    const { innocent, mafia } = parsePoliceReportFromText(room, msg.text);
    if (mafia.some((p) => p.id === targetId) && !innocent.some((p) => p.id === targetId)) {
      speakers.add(msg.fromId);
      continue;
    }
    if (!/(?:마피아|수상|의심|투표|지목)/.test(msg.text)) continue;
    const primary = msg.text.match(/([^\s.,]{2,24}?)님이\s*수상/);
    const target = helpers.getPlayerById ? helpers.getPlayerById(room, targetId) : null;
    if (primary && target) {
      const nick = primary[1].replace(/님$/, '').trim();
      if (target.nickname === nick || target.nickname.includes(nick)) {
        speakers.add(msg.fromId);
        continue;
      }
    }
    if (target && target.nickname && msg.text.includes(target.nickname)
      && /(?:마피아|수상|의심|투표|지목)/.test(msg.text)) {
      speakers.add(msg.fromId);
    }
  }
  return speakers.size;
}

/**
 * 채팅 몰의심·다수 지목 → 낮 투표 (시민). 마피아팀은 동료 제외.
 */
function pickChatPileOnDayVote(room, bot, helpers) {
  ingestVoteIntelFromChat(room, helpers);
  if (helpers.isMafiaTeam && helpers.isMafiaTeam(bot.role)) return null;
  if (isJatuCoordinationDay(room) && !hasConfirmedMafiaTarget(room, bot, helpers)) return null;

  const cleared = getClearedIds(room, bot, helpers);
  const chatScores = chatSuspicion.getSuspicionScores(room, bot, helpers);
  const store = (room.game && room.game.chatSuspicion && room.game.chatSuspicion.byPlayer) || {};
  const alive = helpers.getAlivePlayers
    ? helpers.getAlivePlayers(room).filter((p) => p.id !== bot.id && p.alive)
    : [];

  let bestId = null;
  let bestScore = 0;
  let bestAccusers = 0;

  for (const p of alive) {
    if (isDayVoteTargetForbidden(room, bot, p.id, helpers)) continue;
    if (m42CultBots.isCultAlly(room, bot, p)) continue;
    const row = store[p.id] || {};
    const accusers = countRecentChatAccusers(room, p.id, helpers);
    const score =
      (chatScores[p.id] || 0) * 2
      + (row.accused || 0) * 2.2
      + accusers * 9;
    if (score > bestScore || (score === bestScore && accusers > bestAccusers)) {
      bestScore = score;
      bestId = p.id;
      bestAccusers = accusers;
    }
  }

  if (!bestId) return null;
  if (bestAccusers >= 2) return bestId;
  if (bestScore >= 14) return bestId;
  return null;
}

/** 조결·채팅 의심 기반 폴백 (무조건 자투 금지) */
function pickFallbackDayVoteTarget(room, bot, helpers) {
  if (isJatuCoordinationDay(room) && !hasConfirmedMafiaTarget(room, bot, helpers)) return null;
  const cleared = getClearedIds(room, bot, helpers);
  const alive = helpers.getAlivePlayers
    ? helpers.getAlivePlayers(room).filter((p) => p.id !== bot.id)
    : [];
  if (!alive.length) return null;

  const chatScores = chatSuspicion.getSuspicionScores(room, bot, helpers);
  const scores = helpers.buildSuspicionScores
    ? helpers.buildSuspicionScores(room, bot)
    : {};

  const candidates = alive
    .filter((p) => !isDayVoteTargetForbidden(room, bot, p.id, helpers))
    .map((p) => ({
      id: p.id,
      pri: (chatScores[p.id] || 0) * 2 + (scores[p.id] || 0)
    }))
    .sort((a, b) => b.pri - a.pri);

  if (candidates.length && candidates[0].pri >= 6) {
    return candidates[0].id;
  }

  return null;
}

/**
 * 마피아팀 봇: 생존 시민팀(비동료)에게 낮 투표. 팩트·임계값 없이도 표를 넣음.
 */
function pickMafiaTeamDayVote(room, bot, helpers) {
  if (!helpers.isMafiaTeam || !helpers.isMafiaTeam(bot.role)) return null;
  if (isJatuCoordinationDay(room) && !hasConfirmedMafiaTarget(room, bot, helpers)) return null;

  const alive = helpers.getAlivePlayers
    ? helpers.getAlivePlayers(room).filter((p) => p.alive && p.id !== bot.id)
    : [];
  let targets = alive.filter((p) => !helpers.isMafiaTeam(p.role));
  targets = targets.filter((p) => !m42CultBots.isCultAlly(room, bot, p));
  if (!targets.length) return null;

  const humans = targets.filter((p) => !p.isBot);
  if (humans.length === 1) return humans[0].id;
  if (humans.length > 1) {
    return humans[Math.floor(Math.random() * humans.length)].id;
  }

  const politician = targets.find((p) => p.role === 'politician');
  if (politician) return politician.id;

  const power = targets.filter((p) =>
    ['police', 'doctor', 'reporter', 'soldier'].includes(p.role)
  );
  if (power.length) {
    return power[Math.floor(Math.random() * power.length)].id;
  }

  return targets[Math.floor(Math.random() * targets.length)].id;
}

/** 이미 나온 표를 따라가 몰표 (동점·무투 완화) */
function pickConsensusDayVote(room, bot, helpers) {
  if (!helpers.buildDayVoteTally) return null;
  const tally = helpers.buildDayVoteTally(room);
  const cleared = getClearedIds(room, bot, helpers);
  const isMafia = helpers.isMafiaTeam && helpers.isMafiaTeam(bot.role);

  let bestId = null;
  let bestScore = 0;
  for (const [id, score] of Object.entries(tally)) {
    if (id === bot.id) continue;
    const p = helpers.getPlayerById(room, id);
    if (!p || !p.alive) continue;
    if (isDayVoteTargetForbidden(room, bot, id, helpers)) continue;
    if (isMafia && helpers.isMafiaTeam(p.role)) continue;
    if (m42CultBots.isCultAlly(room, bot, p)) continue;
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }
  if (!bestId || bestScore < 1) return null;
  const sorted = Object.entries(tally)
    .filter(([id]) => {
      const p = helpers.getPlayerById(room, id);
      return p && p.alive && id !== bot.id;
    })
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
  if (bestScore >= 2) return bestId;
  const second = sorted[1]?.score || 0;
  if (bestScore >= 1 && bestScore > second) return bestId;
  return null;
}

/** 마지막 수단: 자기표(자투) 대신 수상도·랜덤으로 표 분산 완화 */
function pickConsolidatedDayVote(room, bot, helpers) {
  const isMafia = helpers.isMafiaTeam && helpers.isMafiaTeam(bot.role);
  if (isMafia) {
    if (isJatuCoordinationDay(room) && !hasConfirmedMafiaTarget(room, bot, helpers)) return null;
    return pickMafiaTeamDayVote(room, bot, helpers);
  }
  if (isJatuCoordinationDay(room) && !hasConfirmedMafiaTarget(room, bot, helpers)) return null;

  const cleared = getClearedIds(room, bot, helpers);
  const alive = helpers.getAlivePlayers
    ? helpers.getAlivePlayers(room).filter((p) => p.id !== bot.id && p.alive)
    : [];
  if (!alive.length) return null;

  const chatScores = chatSuspicion.getSuspicionScores(room, bot, helpers);
  const scores = helpers.buildSuspicionScores
    ? helpers.buildSuspicionScores(room, bot)
    : {};

  const candidates = alive
    .filter((p) => !isDayVoteTargetForbidden(room, bot, p.id, helpers))
    .map((p) => ({
      id: p.id,
      pri: (chatScores[p.id] || 0) + (scores[p.id] || 0)
    }))
    .sort((a, b) => b.pri - a.pri);

  if (candidates.length) return candidates[0].id;
  return null;
}

/** @deprecated — pickConsolidatedDayVote 사용 */
function pickAmbiguousDayVote(room, bot, helpers) {
  return pickConsolidatedDayVote(room, bot, helpers);
}

/** 조결·취재 등 강한 공개 팩트로만 타인 지목 */
function isStrongFactTarget(room, bot, targetId, helpers) {
  if (!targetId || targetId === bot.id) return false;
  const g = room.game || {};
  const isMafia = helpers.isMafiaTeam(bot.role);

  for (const row of g.publicVoteIntel || []) {
    if (row.targetId !== targetId) continue;
    if (row.source === 'police' && row.isMafia === true && !isMafia) return true;
    if (row.source === 'police' && row.isMafia === false && isMafia) return true;
    if (row.source === 'reporter' && row.role) {
      if (!isMafia && helpers.isMafiaRole(row.role)) return true;
      if (isMafia && !helpers.isMafiaRole(row.role)) return true;
    }
  }

  if (bot.role === 'police' && g.policeIntel && g.policeIntel[bot.id]) {
    const row = g.policeIntel[bot.id].find((r) => r.targetId === targetId);
    if (row && row.isMafia && !isMafia) return true;
  }

  if (hasPoliceMafiaAccusation(room, bot, targetId, helpers)) return true;

  return false;
}

function pickFactBasedExecutionVote(room, bot, candidate, helpers) {
  if (!candidate || !candidate.alive) return 'no';
  const g = room.game || {};
  const dayVotes = g.dayVotes || {};
  const myDayVote = dayVotes[bot.id];

  if (m42CultBots.isCultAlly(room, bot, candidate)) return 'no';

  if (candidate.role === 'politician' && !helpers.isMafiaTeam(bot.role)) {
    return 'no';
  }

  const { voteMafia, cleared, isMafia } = collectVoteIntel(room, bot, helpers);

  if (!isMafia && cleared.has(candidate.id)) return 'no';

  if (isMafia) {
    if (helpers.isMafiaTeam(candidate.role)) return 'no';
    return 'yes';
  }

  if (voteMafia.some((t) => t.id === candidate.id)) return 'yes';
  if (hasPoliceMafiaAccusation(room, bot, candidate.id, helpers)) return 'yes';
  if (myDayVote === candidate.id) return 'yes';

  if (helpers.buildDayVoteTally) {
    const tally = helpers.buildDayVoteTally(room);
    const candWeight = tally[candidate.id] || 0;
    let totalWeight = 0;
    for (const w of Object.values(tally)) totalWeight += w;
    if (candWeight >= 2 && totalWeight > 0 && candWeight >= totalWeight * 0.42) {
      return 'yes';
    }
  }

  const chatScores = chatSuspicion.getSuspicionScores(room, bot, helpers);
  if ((chatScores[candidate.id] || 0) >= 28) return 'yes';

  return 'no';
}

function hasAnyVoteFact(room, bot, helpers) {
  const { voteMafia, voteCitizen, isMafia } = collectVoteIntel(room, bot, helpers);
  return isMafia ? voteCitizen.length > 0 : voteMafia.length > 0;
}

function getClearedIds(room, bot, helpers) {
  return collectVoteIntel(room, bot, helpers).cleared;
}

function isPlayerCleared(room, bot, playerId, helpers) {
  if (!playerId) return false;
  return getClearedIds(room, bot, helpers).has(playerId);
}

const INVESTIGATION_ROLES = ['police', 'reporter', 'private_detective'];

function hasAliveInvestigationRoles(room, helpers) {
  const alive = helpers.getAlivePlayers ? helpers.getAlivePlayers(room) : [];
  return alive.some((p) => p && p.alive && INVESTIGATION_ROLES.includes(p.role));
}

/** 공개 조결·취재·영매 등으로 마피아가 확정된 경우 */
function hasAnyPublicConfirmedMafia(room, helpers) {
  ingestVoteIntelFromChat(room, helpers);
  const g = room.game || {};
  for (const row of g.publicVoteIntel || []) {
    const p = helpers.getPlayerById ? helpers.getPlayerById(room, row.targetId) : null;
    if (!p || !p.alive) continue;
    if (row.source === 'police' && row.isMafia === true) return true;
    if (row.source === 'chat_accuse' && row.isMafia === true) return true;
    if (row.source === 'reporter' && row.role && helpers.isMafiaRole(row.role)) return true;
    if (row.source === 'medium' && row.role && helpers.isMafiaRole(row.role)) return true;
  }
  return false;
}

/**
 * 맞경 정리·경찰/기자/사탐 사망·확정 마피아 없음 → 봇 낮 투표 자투(자기표) 유도.
 */
function syncStalemateJatuFromGameState(room, helpers) {
  if (!room?.game) return;
  const g = room.game;
  if (isFirstDayForcedJatu(room)) {
    g.botStalemateJatuDay = false;
    return;
  }

  const m42Bluff = require('./m42-bluff');
  const reporters = m42Bluff.scanPoliceReporters(room, helpers);
  if (reporters.length >= 2) {
    g.hadMatgyeongConflict = true;
    g.hadPoliceReporterCount = Math.max(g.hadPoliceReporterCount || 0, reporters.length);
    g.botStalemateJatuDay = false;
    return;
  }

  if (hasAnyPublicConfirmedMafia(room, helpers)) {
    g.botStalemateJatuDay = false;
    return;
  }

  if (hasAliveInvestigationRoles(room, helpers)) {
    g.botStalemateJatuDay = false;
    return;
  }

  const hadMatgyeong = !!g.hadMatgyeongConflict || (g.hadPoliceReporterCount || 0) >= 2;
  if (hadMatgyeong && reporters.length < 2) {
    g.botStalemateJatuDay = true;
  } else {
    g.botStalemateJatuDay = false;
  }
}

/** 낮 채팅에 경찰·사탐 등이 자투를 요청했는지 (당일 투표 직전 동기화) */
function syncJatuCoordinationFromDayChat(room, helpers) {
  if (!room?.game) return;
  const dayChat = helpers.getChatMessages
    ? helpers.getChatMessages(room, 'day')
    : (room.chatLog && room.chatLog.day) || [];
  for (let i = dayChat.length - 1; i >= Math.max(0, dayChat.length - 28); i--) {
    const msg = dayChat[i];
    if (!msg?.text) continue;
    const compact = String(msg.text).replace(/\s+/g, '');
    if (!/자투|자투표|무투표|투표스킵|넘기자/.test(compact)) continue;
    const speaker = helpers.getPlayerById ? helpers.getPlayerById(room, msg.fromId) : null;
    if (!speaker?.alive) continue;
    if (speaker.role === 'police' || speaker.role === 'private_detective') {
      room.game.botMatgyeongJatuDay = true;
      try {
        const { agentLog } = require('./debug-agent-log');
        agentLog({
          hypothesisId: 'H_jatu_sync',
          location: 'bot-vote-facts.js:syncJatuCoordinationFromDayChat',
          message: 'jatu coordination day enabled from chat',
          runId: 'jatu-fix',
          data: { from: speaker.nickname, role: speaker.role, preview: String(msg.text).slice(0, 72) }
        });
      } catch (_) { /* noop */ }
      return;
    }
    if (/경찰|진경|조결/.test(compact) && speaker.role !== 'mafia') {
      room.game.botMatgyeongJatuDay = true;
      return;
    }
  }
}

/** 1일차(첫 낮 투표)는 무조건 자투 — 밤에 경찰·기자·영매 스킬 쌓기 */
function isFirstDayForcedJatu(room) {
  return (room?.game?.dayIndex || 0) <= 1;
}

function isJatuCoordinationDay(room) {
  return (
    isFirstDayForcedJatu(room)
    || !!(room?.game?.botMatgyeongJatuDay)
    || !!(room?.game?.botStalemateJatuDay)
  );
}

/** 공개 팩트로 확정된 마피아(조결·취재·영매 등 pri≥90) */
function hasConfirmedMafiaTarget(room, bot, helpers) {
  ingestVoteIntelFromChat(room, helpers);
  const { voteMafia, cleared } = collectVoteIntel(room, bot, helpers);
  return voteMafia.some((t) => t.id !== bot.id && !cleared.has(t.id) && t.pri >= 90);
}

function ingestVoteIntelFromChat(room, helpers) {
  try {
    const voteIntel = require('./bot-vote-intel');
    if (voteIntel.ingestPoliceReportsFromDayChat) {
      voteIntel.ingestPoliceReportsFromDayChat(room, helpers);
    }
    if (voteIntel.ingestChatMafiaAccusationsFromDayChat) {
      voteIntel.ingestChatMafiaAccusationsFromDayChat(room, helpers);
    }
    if (voteIntel.ingestPoliticianClaimsFromDayChat) {
      voteIntel.ingestPoliticianClaimsFromDayChat(room, helpers);
    }
  } catch (_) { /* noop */ }
}

/**
 * 시민·교주팀: 조결 무죄·정치인 직공·기자 확인 시민 등 → 낮 투표 대상에서 제외
 * 마피아팀: 동료·교주 동맹만 제외 (정치인에게 표 넣는 건 가능)
 */
function isDayVoteTargetForbidden(room, voter, targetId, helpers) {
  if (!voter || !targetId) return true;
  const target = helpers.getPlayerById ? helpers.getPlayerById(room, targetId) : null;
  if (!target || !target.alive) return true;
  if (target.id === voter.id) {
    return !isJatuCoordinationDay(room);
  }

  const isMafia = helpers.isMafiaTeam && helpers.isMafiaTeam(voter.role);
  if (isMafia) {
    if (helpers.isMafiaTeam(target.role)) return true;
    if (m42CultBots.isCultAlly(room, voter, target)) return true;
    return false;
  }

  ingestVoteIntelFromChat(room, helpers);
  if (isPlayerCleared(room, voter, targetId, helpers)) return true;

  const g = room.game || {};
  for (const row of g.publicVoteIntel || []) {
    if (row.targetId !== targetId) continue;
    if (row.source === 'politician_claim') return true;
    if (row.source === 'reporter' && row.role === 'politician') return true;
  }

  if (target.role === 'politician') {
    const dayChat = helpers.getChatMessages
      ? helpers.getChatMessages(room, 'day')
      : (room.chatLog && room.chatLog.day) || [];
    for (const msg of dayChat) {
      if (!msg?.text || msg.fromId !== targetId) continue;
      if (/정치인|낮\s*투표\s*2표|찬반\s*처형\s*면역|투표로\s*처형/.test(msg.text)) return true;
    }
  }

  return false;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** "봇 2 마피아"처럼 닉 일부만 써도 봇2 플레이어에 매칭 */
function appendBotNumberMafiaHits(room, raw, compact, innocent, mafia) {
  if (!/마피아/.test(compact) || /마피아아답|마피아아님|마피아가아님/.test(compact)) return;
  const seen = new Set([...innocent, ...mafia].map((p) => p.id));
  for (const m of raw.matchAll(/봇\s*(\d{1,2})/g)) {
    const nick = `봇${m[1]}`;
    const p = Object.values(room.players).find(
      (x) => x.alive && x.nickname
        && (x.nickname === nick || x.nickname.replace(/\s+/g, '') === nick)
    );
    if (!p || seen.has(p.id) || innocent.some((x) => x.id === p.id)) continue;
    mafia.push(p);
    seen.add(p.id);
  }
}

/** 경찰 조결 멘트에서 무죄/마피아 판정 파싱 (자연스러운 말투 포함) */
function parsePoliceReportFromText(room, text) {
  const innocent = [];
  const mafia = [];
  if (!text || !room.players) return { innocent, mafia };

  const raw = String(text);
  const compact = raw.replace(/\s+/g, '');

  for (const p of Object.values(room.players)) {
    if (!p.alive || !p.nickname) continue;
    const n = p.nickname;
    if (!raw.includes(n)) continue;

    const nEsc = escapeRegex(n);
    const innocentHit =
      raw.includes(`${n}님은 마피아가 아닙니다`)
      || raw.includes(`${n} 마피아 아닙`)
      || raw.includes(`${n}님 조사했는데 마피아 아닙`)
      || raw.includes(`${n}님 조사했는데 마피아가 아닙니다`)
      || raw.includes(`${n}님 무죄`)
      || raw.includes(`${n}님 깨끗`)
      || raw.includes(`${n}님은 시민`)
      || new RegExp(`${nEsc}님.{0,20}마피아\\s*아님`).test(raw)
      || new RegExp(`${nEsc}님조사.{0,16}마피아아님`).test(compact)
      || new RegExp(`${nEsc}님.{0,12}시민`).test(raw)
      || new RegExp(`${nEsc}님.{0,16}(?:무죄|깨끗)`).test(raw)
      || new RegExp(`${nEsc}(?:님)?\\s*노맢`).test(compact)
      || new RegExp(`${nEsc}님.{0,24}마피아가\\s*아니`).test(raw)
      || new RegExp(`${nEsc}님제조사로는마피아가아니`).test(compact);

    const observationOnly = /관찰|포착|손을\s*뻗|손올리|암살\s*손|킬\s*지목|움직임이/.test(raw)
      && !/마피아입니다|마피아가\s*아닙니다|조사했는데\s*마피아/.test(raw);

    const mafiaHit = !innocentHit && !observationOnly && (
      raw.includes(`${n}님은 마피아입니다`)
      || raw.includes(`${n}님 마피아입니다`)
      || raw.includes(`${n}님 조사했는데 마피아입니다`)
      || (raw.includes(`${n} 마피아`) && /마피아입니다|조사했는데\s*마피아/.test(raw))
      || new RegExp(`${nEsc}\\s+마피아(?!\\s*아닙)`).test(raw)
      || new RegExp(`${nEsc}마피아(?!아닙)`).test(compact)
      || new RegExp(`${nEsc}님.{0,24}마피아(?:입니다|팀|나왔|임|이었|으로|로확인|로나왔)`).test(raw)
      || new RegExp(`${nEsc}님마피아(?:입니다|팀|나왔|임)`).test(compact)
      || new RegExp(`(?:제\\s*조사|조사|경찰조사결과).{0,32}${nEsc}.{0,12}마피아(?!아님)`).test(raw)
      || new RegExp(`(?:제\\s*조사|조사).{0,28}${nEsc}님.{0,16}마피아(?!아님)`).test(raw)
      || new RegExp(`${nEsc}님.{0,16}마피아팀`).test(raw)
      || new RegExp(`${nEsc}(?:님)?\\s*경크`).test(compact)
      || new RegExp(`${nEsc}(?:님)?\\s*마맢`).test(compact)
    );

    if (innocentHit) innocent.push(p);
    else if (mafiaHit) mafia.push(p);
  }
  appendBotNumberMafiaHits(room, raw, compact, innocent, mafia);
  return { innocent, mafia };
}

/** 맞경(경찰 2인 이상 직공)일 때 시민팀 봇은 맞경 후보에게 표를 모아 짭경을 먼저 제거 */
function pickMatgyeongPoliceDayVote(room, bot, helpers) {
  if (helpers.isMafiaTeam && helpers.isMafiaTeam(bot.role)) return null;
  if (isJatuCoordinationDay(room) && !hasConfirmedMafiaTarget(room, bot, helpers)) return null;
  const m42Bluff = require('./m42-bluff');
  const reporters = m42Bluff.scanPoliceReporters(room, helpers);
  if (reporters.length < 2) return null;

  if (bot.role === 'police') {
    const rival = reporters.find((r) => r.id !== bot.id);
    const rp = rival && helpers.getPlayerById ? helpers.getPlayerById(room, rival.id) : null;
    if (rp && rp.alive && !isDayVoteTargetForbidden(room, bot, rival.id, helpers)) {
      return rival.id;
    }
    return null;
  }

  const candidates = reporters
    .map((r) => r.id)
    .filter((id) => id && id !== bot.id)
    .filter((id) => {
      const p = helpers.getPlayerById(room, id);
      return (
        p
        && p.alive
        && !isPlayerCleared(room, bot, id, helpers)
        && !isDayVoteTargetForbidden(room, bot, id, helpers)
      );
    });
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/** 진경이 맞경 중 자투·밤 조사 유도한 날 — 시민·악역 봇 모두 자기표 */
function pickJatuCoordinationDayVote(room, bot, helpers) {
  syncStalemateJatuFromGameState(room, helpers);
  syncJatuCoordinationFromDayChat(room, helpers);
  if (!isJatuCoordinationDay(room)) return null;
  if (!isFirstDayForcedJatu(room) && hasConfirmedMafiaTarget(room, bot, helpers)) return null;
  if (!helpers.getAlivePlayers) return null;
  const self = helpers.getPlayerById(room, bot.id);
  if (!self || !self.alive) return null;
  return bot.id;
}

/**
 * 맞경 중 실제 경찰이 밤에 사망한 뒤: 생존 경찰 주장자는 짭경일 가능성이 높음 → 시민 봇 몰표.
 * (scanPoliceReporters는 생존자만 포함)
 */
function pickMatgyeongAfterRealPoliceDeathVote(room, bot, helpers) {
  if (helpers.isMafiaTeam && helpers.isMafiaTeam(bot.role)) return null;
  const deaths = room.game?.lastNightReport?.deaths;
  if (!Array.isArray(deaths) || !deaths.length) return null;
  let sawPoliceDeath = false;
  for (const d of deaths) {
    const id = d && typeof d === 'object' ? d.id : d;
    if (id == null) continue;
    const p = helpers.getPlayerById(room, id);
    if (p && p.role === 'police') sawPoliceDeath = true;
  }
  if (!sawPoliceDeath) return null;
  const alivePolice = helpers.getAlivePlayers(room).some((p) => p && p.role === 'police');
  if (alivePolice) return null;

  const pinned = room.game?.botMatgyeongVoteRivalIfPoliceDies;
  if (pinned && pinned !== bot.id) {
    const pinP = helpers.getPlayerById(room, pinned);
    if (
      pinP
      && pinP.alive
      && pinP.role !== 'police'
      && !isDayVoteTargetForbidden(room, bot, pinned, helpers)
    ) {
      return pinned;
    }
  }

  const m42Bluff = require('./m42-bluff');
  const reporters = m42Bluff.scanPoliceReporters(room, helpers);
  const suspectIds = reporters
    .map((r) => r.id)
    .filter((pid) => pid && pid !== bot.id)
    .filter((pid) => {
      const p = helpers.getPlayerById(room, pid);
      return (
        p
        && p.alive
        && p.role !== 'police'
        && !isDayVoteTargetForbidden(room, bot, pid, helpers)
      );
    });
  if (!suspectIds.length) return null;
  if (suspectIds.length === 1) return suspectIds[0];
  return suspectIds[Math.floor(Math.random() * suspectIds.length)];
}

/** 채팅에 공개된 경찰 조결(마피아) 대상 — 시민 봇 투표 최우선 */
function pickPoliceAccusedMafia(room, bot, helpers) {
  if (isFirstDayForcedJatu(room)) return null;

  try {
    const voteIntel = require('./bot-vote-intel');
    if (voteIntel.ingestPoliceReportsFromDayChat) {
      voteIntel.ingestPoliceReportsFromDayChat(room, helpers);
    }
  } catch (_) { /* noop */ }

  if (helpers.isMafiaTeam && helpers.isMafiaTeam(bot.role)) return null;

  const { voteMafia, cleared } = collectVoteIntel(room, bot, helpers);
  const pool = voteMafia
    .filter((t) => t.id !== bot.id && !cleared.has(t.id) && t.pri >= 90)
    .sort((a, b) => b.pri - a.pri);
  return pool.length ? pool[0].id : null;
}

function hasPoliceMafiaAccusation(room, bot, targetId, helpers) {
  if (!targetId) return false;
  try {
    const voteIntel = require('./bot-vote-intel');
    if (voteIntel.ingestPoliceReportsFromDayChat) {
      voteIntel.ingestPoliceReportsFromDayChat(room, helpers);
    }
  } catch (_) { /* noop */ }
  const { voteMafia } = collectVoteIntel(room, bot, helpers);
  return voteMafia.some((t) => t.id === targetId && t.pri >= 90);
}

function pickFactChatAccuseTarget(room, bot, helpers) {
  const id = pickFactBasedDayVote(room, bot, helpers);
  if (!id || id === bot.id) return null;
  if (isDayVoteTargetForbidden(room, bot, id, helpers)) return null;
  return id;
}

/** @returns {string|null} 근거 문구 (없으면 지목 불가) */
function getAccuseReasonForTarget(room, bot, targetId, helpers) {
  const p = helpers.getPlayerById(room, targetId);
  if (!p || !p.alive) return null;

  const g = room.game || {};
  const labels = helpers.ROLE_LABELS || {};
  const isMafia = helpers.isMafiaTeam(bot.role);

  for (const row of g.publicVoteIntel || []) {
    if (row.targetId !== targetId) continue;
    if (row.source === 'politician_claim' && !isMafia) {
      return null;
    }
    if (row.source === 'police' && row.isMafia === false && !isMafia) {
      return null;
    }
    if (row.source === 'police' && row.isMafia === true && !isMafia) {
      return '공개된 조결(마피아)';
    }
    if (row.source === 'chat_accuse' && row.isMafia === true && !isMafia) {
      return '채팅 지목(마피아)';
    }
    if (row.source === 'police' && row.isMafia === false && isMafia) {
      return '공개된 조결(시민 쪽)';
    }
    if (row.source === 'reporter' && row.role) {
      if (!isMafia && helpers.isMafiaRole(row.role)) {
        return `기자 취재 [${labels[row.role] || row.roleLabel || row.role}]`;
      }
      if (isMafia && !helpers.isMafiaRole(row.role)) {
        return `기자 취재 [${labels[row.role] || row.roleLabel || row.role}]`;
      }
    }
  }

  if (bot.role === 'police' && g.policeIntel && g.policeIntel[bot.id]) {
    const row = g.policeIntel[bot.id].find((r) => r.targetId === targetId);
    if (row) {
      return row.isMafia ? '제 수사 결과(마피아)' : null;
    }
  }

  return getContextReason(room, bot, targetId, helpers);
}

/** 봇 mind·비밀 스킬 없이 채팅에 써도 되는 공개 팩트인지 */
function isRolePublicForBot(room, bot, targetId, role, helpers) {
  const g = room.game || {};
  for (const row of g.publicVoteIntel || []) {
    if (row.targetId !== targetId) continue;
    if (row.source === 'reporter' && row.role === role) return true;
    if (row.source === 'soldier_block' && role === 'soldier') return true;
    if (row.source === 'police' && helpers.isMafiaRole(role) && row.isMafia === true) {
      return true;
    }
    if (row.source === 'medium' && row.role === role) return true;
  }
  return false;
}

/** 팩트는 없지만 채팅·조밤·다수 의심 등 약한 근거 (임계값 이상일 때만) */
function getContextReason(room, bot, targetId, helpers) {
  const p = helpers.getPlayerById(room, targetId);
  if (!p || !p.alive) return null;

  const g = room.game || {};
  const scores = helpers.buildSuspicionScores
    ? helpers.buildSuspicionScores(room, bot)
    : {};
  const score = scores[targetId] || 0;

  const dayChat = helpers.getChatMessages ? helpers.getChatMessages(room, 'day') : [];
  let othersAccused = 0;
  let accuserName = null;
  for (const msg of dayChat) {
    if (!msg.text || msg.fromId === bot.id) continue;
    if (!/수상|의심|마피아|지목|거짓말|구라|뻥/.test(msg.text)) continue;
    if (msg.text.includes(p.nickname)) {
      othersAccused += 1;
      accuserName = msg.from;
    }
  }
  if (othersAccused >= 1) {
    return accuserName
      ? `${accuserName}님 포함 ${othersAccused}건의 의심 발언`
      : `다른 분 ${othersAccused}건의 의심 발언`;
  }

  const dawnText = (g.dawnAnnouncements || []).join(' ');
  if (/사망/.test(dawnText) && dawnText.includes(p.nickname)) {
    return '어젯밤 사망·아침 공지와 연관';
  }

  const quiet = /조용|사망자는\s*없/.test(dawnText);
  if (quiet && score >= 5) {
    return '조밤 이후 발언·채팅 패턴(추리)';
  }

  if (score >= 6) {
    return '낮 채팅·지목·투표 패턴(추리)';
  }

  const chatCounts = {};
  for (const msg of dayChat) {
    if (!msg.fromId || msg.system) continue;
    chatCounts[msg.fromId] = (chatCounts[msg.fromId] || 0) + 1;
  }
  const alive = helpers.getAlivePlayers ? helpers.getAlivePlayers(room) : [];
  const avg = alive.length
    ? alive.reduce((s, pl) => s + (chatCounts[pl.id] || 0), 0) / alive.length
    : 0;
  if (avg >= 2 && (chatCounts[targetId] || 0) === 0) {
    return '낮 토론 중 발언·응답이 거의 없음';
  }

  return null;
}

function formatAccuseLine(room, bot, targetId, helpers, speaker = null) {
  const p = helpers.getPlayerById(room, targetId);
  if (!p || !p.alive) return null;
  const reason = getAccuseReasonForTarget(room, bot, targetId, helpers);
  if (!reason) return null;
  const name = p.nickname;
  if (speaker) {
    return `${speaker}님 말씀에 동의합니다. ${reason} 근거로 ${name}님이 수상합니다.`;
  }
  return `${reason} 근거로 ${name}님이 수상합니다.`;
}

/** 근거 없으면 null — 무작위 "수상합니다" 방지 */
function formatAccuseOrNull(room, bot, targetId, helpers, speaker = null) {
  return formatAccuseLine(room, bot, targetId, helpers, speaker);
}

function formatQuietNightDiscuss(room, bot) {
  const g = room.game || {};
  const dawn = (g.dawnAnnouncements || []).join(' ');
  if (!/조용|사망자는\s*없/.test(dawn)) return null;
  const lines = [
    '조밤입니다. 경찰 조결·기자 취재부터 듣고 발언 순서대로 질문하겠습니다.',
    '조밤이었으니 은폐·물총·치료 가능성부터 정리한 뒤, 팩트 있는 지목을 하겠습니다.',
    '아무도 죽지 않은 밤입니다. 직공·조결 없이 지목하기보다 정보를 모으겠습니다.'
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

/** 채팅이 조결 '요청'이 아니라 판정 '제공'인지 (봇2 마피아, 경찰조사결과 봇2 마피아 등) */
function isPoliceReportProviding(text, room) {
  if (!text || !room?.players) return false;
  const { innocent, mafia } = parsePoliceReportFromText(room, text);
  if (innocent.length || mafia.length) return true;
  const c = String(text).replace(/\s+/g, '');
  if (/경찰조사결과/.test(c) && /마피아(?!아닙)/.test(c)) return true;
  if (/마피아(?!아닙)/.test(c) && /(봇\d+)/.test(c)) return true;
  if (/(?:조사|수사|경찰)(?:결과|조결)/.test(c) && /(?:공개|나왔|올렸|말씀|확인|채팅)/.test(c)) return true;
  return false;
}

module.exports = {
  pickFactBasedDayVote,
  pickMafiaTeamDayVote,
  isPoliceReportProviding,
  pickMatgyeongPoliceDayVote,
  pickMatgyeongAfterRealPoliceDeathVote,
  pickJatuCoordinationDayVote,
  syncJatuCoordinationFromDayChat,
  syncStalemateJatuFromGameState,
  isJatuCoordinationDay,
  isFirstDayForcedJatu,
  hasConfirmedMafiaTarget,
  pickPoliceAccusedMafia,
  pickChatKeywordDayVote,
  pickChatPileOnDayVote,
  countRecentChatAccusers,
  pickFallbackDayVoteTarget,
  pickConsensusDayVote,
  pickConsolidatedDayVote,
  pickAmbiguousDayVote,
  isStrongFactTarget,
  hasPoliceMafiaAccusation,
  pickFactBasedExecutionVote,
  pickFactChatAccuseTarget,
  hasAnyVoteFact,
  getClearedIds,
  isPlayerCleared,
  isDayVoteTargetForbidden,
  ingestVoteIntelFromChat,
  parsePoliceReportFromText,
  getAccuseReasonForTarget,
  formatAccuseLine,
  formatAccuseOrNull,
  formatQuietNightDiscuss,
  getContextReason,
  isRolePublicForBot,
  powerPri
};
