/**
 * 봇 낮/찬반 투표: 공개·본인 스킬 결과만 반영 (추측·채팅 몰표 제외).
 */

const CITIZEN_POWER_PRIORITY = {
  police: 100,
  doctor: 92,
  reporter: 88,
  soldier: 70,
  politician: 55,
  medium: 50,
  citizen: 20,
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

  for (const row of g.publicVoteIntel || []) {
    const p = aliveTarget(row.targetId);
    if (!p) continue;

    if (row.source === 'police') {
      if (row.isMafia === true) {
        addMafia(p.id, 100);
        if (isMafia) markCleared(p.id);
      } else if (row.isMafia === false) {
        markCleared(p.id);
        addCitizen(p.id, 35 + powerPri(p.role));
      }
    }

    if (row.source === 'reporter' && row.role) {
      if (helpers.isMafiaRole(row.role)) {
        addMafia(p.id, 90);
        if (isMafia) markCleared(p.id);
      } else {
        markCleared(p.id);
        addCitizen(p.id, powerPri(row.role));
      }
    }

    if (row.source === 'soldier_block' && row.role === 'soldier') {
      markCleared(p.id);
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

function pickBest(pool, cleared, isMafia) {
  const valid = pool.filter((t) => {
    if (isMafia && cleared.has(t.id)) return false;
    if (!isMafia && cleared.has(t.id)) return false;
    return true;
  });
  if (!valid.length) return null;
  valid.sort((a, b) => b.pri - a.pri);
  return valid[0].id;
}

function pickFactBasedDayVote(room, bot, helpers) {
  try {
    const voteIntel = require('./bot-vote-intel');
    if (voteIntel.ingestPoliceReportsFromDayChat) {
      voteIntel.ingestPoliceReportsFromDayChat(room, helpers);
    }
  } catch (_) { /* noop */ }

  const { voteMafia, voteCitizen, cleared, isMafia } = collectVoteIntel(room, bot, helpers);
  if (isMafia) {
    return pickBest(voteCitizen, cleared, true);
  }
  return pickBest(voteMafia, cleared, false);
}

/** 조결·채팅 의심 기반 폴백 (무조건 자투 금지) */
function pickFallbackDayVoteTarget(room, bot, helpers) {
  const cleared = getClearedIds(room, bot, helpers);
  const alive = helpers.getAlivePlayers
    ? helpers.getAlivePlayers(room).filter((p) => p.id !== bot.id)
    : [];
  if (!alive.length) return null;

  const scores = helpers.buildSuspicionScores
    ? helpers.buildSuspicionScores(room, bot)
    : {};
  const dayChat = helpers.getChatMessages ? helpers.getChatMessages(room, 'day') : [];

  const accusedPri = {};
  for (const msg of dayChat) {
    if (!msg?.text || !msg.fromId || msg.fromId === bot.id) continue;
    if (!/수상|의심|마피아|맢|처형|지목/.test(msg.text)) continue;
    for (const p of alive) {
      if (msg.text.includes(p.nickname)) {
        accusedPri[p.id] = (accusedPri[p.id] || 0) + 4;
      }
    }
  }

  const candidates = alive
    .filter((p) => !cleared.has(p.id))
    .map((p) => ({
      id: p.id,
      pri: (accusedPri[p.id] || 0) + (scores[p.id] || 0)
    }))
    .sort((a, b) => b.pri - a.pri);

  if (candidates.length && candidates[0].pri > 0) {
    return candidates[0].id;
  }

  const anyAlive = alive
    .map((p) => ({ id: p.id, pri: (scores[p.id] || 0) + (accusedPri[p.id] || 0) }))
    .sort((a, b) => b.pri - a.pri);
  if (anyAlive.length && anyAlive[0].pri >= 2) {
    return anyAlive[0].id;
  }

  return null;
}

function pickFactBasedExecutionVote(room, bot, candidate, helpers) {
  if (!candidate || !candidate.alive) return 'no';
  const g = room.game || {};
  const dayVotes = g.dayVotes || {};
  const myDayVote = dayVotes[bot.id];

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

  if (myDayVote === candidate.id) return 'yes';

  if (myDayVote && myDayVote !== candidate.id) {
    return Math.random() < 0.28 ? 'yes' : 'no';
  }

  if (g.executionCandidateId === candidate.id || g.dayTopVotedId === candidate.id) {
    return Math.random() < 0.82 ? 'yes' : 'no';
  }

  return Math.random() < 0.55 ? 'yes' : 'no';
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

function parsePoliceReportFromText(room, text) {
  const innocent = [];
  const mafia = [];
  if (!text || !room.players) return { innocent, mafia };

  const compact = String(text).replace(/\s+/g, '');

  for (const p of Object.values(room.players)) {
    if (!p.alive || !p.nickname) continue;
    const n = p.nickname;
    const innocentHit =
      text.includes(`${n}님은 마피아가 아닙니다`)
      || text.includes(`${n} 마피아 아닙`)
      || text.includes(`${n}님 무죄`)
      || text.includes(`${n}님 깨끗`)
      || text.includes(`${n}님은 시민`)
      || new RegExp(`${n}님.{0,16}마피아\\s*아님`).test(text)
      || new RegExp(`${n}님조사.{0,12}마피아아님`).test(compact);
    if (innocentHit) {
      innocent.push(p);
    }
    const mafiaHit =
      text.includes(`${n}님은 마피아입니다`)
      || text.includes(`${n}님 마피아입니다`)
      || new RegExp(`${n}님.{0,12}마피아(?:입니다|팀)`).test(text)
      || new RegExp(`${n}님마피아(?:입니다|팀)`).test(compact);
    if (mafiaHit && !innocentHit) {
      mafia.push(p);
    }
  }
  return { innocent, mafia };
}

function pickFactChatAccuseTarget(room, bot, helpers) {
  const id = pickFactBasedDayVote(room, bot, helpers);
  if (!id || id === bot.id) return null;
  if (isPlayerCleared(room, bot, id, helpers)) return null;
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
    if (row.source === 'police' && row.isMafia === true && !isMafia) {
      return '경찰 조사 결과(마피아)';
    }
    if (row.source === 'police' && row.isMafia === false && isMafia) {
      return '경찰 조사 결과(시민 아님)';
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
  }
  if (helpers.isMafiaTeam && helpers.isMafiaTeam(bot.role) && helpers.isMafiaRole(role)) {
    const p = helpers.getPlayerById ? helpers.getPlayerById(room, targetId) : null;
    if (p && helpers.isMafiaRole(p.role)) return true;
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
    if (!/수상|의심|마피아|지목/.test(msg.text)) continue;
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

module.exports = {
  pickFactBasedDayVote,
  pickFallbackDayVoteTarget,
  pickFactBasedExecutionVote,
  pickFactChatAccuseTarget,
  hasAnyVoteFact,
  getClearedIds,
  isPlayerCleared,
  parsePoliceReportFromText,
  getAccuseReasonForTarget,
  formatAccuseLine,
  formatAccuseOrNull,
  formatQuietNightDiscuss,
  getContextReason,
  isRolePublicForBot,
  powerPri
};
