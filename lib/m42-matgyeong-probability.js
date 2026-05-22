/**
 * 맞경(경찰 2인+) — 확률·경우의수·팩트 대조로 짭경/진경 추론 (마피아 핵심 메타).
 */
const policeFmt = require('./police-report-format');

function bluff() {
  return require('./m42-bluff');
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getAlivePolicePlayer(room, helpers) {
  const id = bluff().getAlivePoliceId(room, helpers);
  return id && helpers.getPlayerById ? helpers.getPlayerById(room, id) : null;
}

function sawRealPoliceDeathLastNight(room, helpers) {
  const deaths = room.game?.lastNightReport?.deaths;
  if (!Array.isArray(deaths)) return false;
  for (const d of deaths) {
    const id = d && typeof d === 'object' ? d.id : d;
    const p = helpers.getPlayerById ? helpers.getPlayerById(room, id) : null;
    if (p && p.role === 'police') return true;
  }
  return false;
}

/** 기자 취재·공개 인텔로 경찰이 사망 확정된 경우(생존 진경 없음) */
function hasConfirmedDeadPolice(room, helpers) {
  if (getAlivePolicePlayer(room, helpers)) return false;
  for (const row of room.game?.publicVoteIntel || []) {
    if (row?.role !== 'police' || row.targetId == null) continue;
    const p = helpers.getPlayerById ? helpers.getPlayerById(room, row.targetId) : null;
    if (p && !p.alive) return true;
  }
  return sawRealPoliceDeathLastNight(room, helpers);
}

function getClaimantPoliceReports(room, claimantId, helpers) {
  const dayChat = helpers.getChatMessages
    ? helpers.getChatMessages(room, 'day')
    : (room.chatLog && room.chatLog.day) || [];
  const out = [];
  for (const msg of dayChat) {
    if (!msg?.text || msg.fromId !== claimantId) continue;
    if (!policeFmt.looksLikePoliceReport(msg.text, room)) continue;
    let parsed = null;
    try {
      const voteFacts = require('./bot-vote-facts');
      parsed = voteFacts.parsePoliceReportFromText(room, msg.text);
    } catch (_) { /* noop */ }
    out.push({ text: msg.text, time: msg.time || 0, parsed });
  }
  out.sort((a, b) => (a.time || 0) - (b.time || 0));
  return out;
}

function reportsConflict(a, b) {
  if (!a?.parsed || !b?.parsed) return false;
  const aM = (a.parsed.mafia || []).map((p) => p.id);
  const bM = (b.parsed.mafia || []).map((p) => p.id);
  const aI = (a.parsed.innocent || []).map((p) => p.id);
  const bI = (b.parsed.innocent || []).map((p) => p.id);
  for (const id of aM) {
    if (bI.includes(id)) return true;
  }
  for (const id of bM) {
    if (aI.includes(id)) return true;
  }
  return false;
}

function getPoliceVerdictAgainst(room, policeId, rivalId) {
  if (!room?.game?.policeIntel || !policeId || !rivalId) return null;
  const rows = (room.game.policeIntel[policeId] || [])
    .filter((r) => r && r.targetId === rivalId)
    .sort((a, b) => (b.nightIndex || 0) - (a.nightIndex || 0));
  if (!rows.length) return null;
  return !!rows[0].isMafia;
}

/**
 * @returns {{
 *   situation: string,
 *   claimants: Array<{ id, nickname, fakeScore, realScore, reasons, isRolePolice }>,
 *   recommendedVoteTargetId: string|null,
 *   realPoliceId: string|null,
 *   blufferId: string|null,
 *   a: { id, nickname }|null,
 *   b: { id, nickname }|null
 * }}
 */
function analyzeMatgyeongSituation(room, helpers) {
  const reporters = bluff().scanPoliceReporters(room, helpers);
  const realPolice = getAlivePolicePlayer(room, helpers);
  const realPoliceId = realPolice?.id || null;
  const bluffer = bluff().getMafiaPoliceBlufferBot(room, helpers);
  const policeDied = hasConfirmedDeadPolice(room, helpers);

  let situation = 'none';
  if (reporters.length < 2) situation = 'holgyeong';
  else if (realPoliceId && reporters.length >= 2) situation = 'both_alive';
  else if (policeDied) situation = 'real_dead';
  else situation = 'matched_claims';

  const claimants = reporters.map((r) => {
    const p = helpers.getPlayerById ? helpers.getPlayerById(room, r.id) : null;
    if (!p) return null;
    let fakeScore = 48;
    const reasons = [];

    if (realPoliceId) {
      if (p.id === realPoliceId) {
        fakeScore -= 38;
        reasons.push('생존 진경 role');
      } else {
        fakeScore += 42;
        reasons.push('다른 진경 생존');
      }
    } else if (p.role === 'police') {
      fakeScore -= 28;
      reasons.push('유일 경찰 role');
    } else {
      fakeScore += 32;
      reasons.push('경찰 role 없음');
    }

    if (bluffer && bluffer.id === p.id) {
      fakeScore += 40;
      reasons.push('마피아 맞경 담당 추정');
    }

    if (policeDied && !realPoliceId) {
      fakeScore += 22;
      reasons.push('진경 밤사망·맞경만');
    }

    const reports = getClaimantPoliceReports(room, p.id, helpers);
    if (!reports.length) {
      fakeScore += 12;
      reasons.push('조결 미공개');
    }

    const verdict = realPoliceId && realPoliceId !== p.id
      ? getPoliceVerdictAgainst(room, realPoliceId, p.id)
      : null;
    if (verdict === true) {
      fakeScore += 55;
      reasons.push('진경 수사=마피아');
    } else if (verdict === false) {
      fakeScore -= 15;
      reasons.push('진경 수사=무혐의');
    }

    return {
      id: p.id,
      nickname: p.nickname,
      fakeScore: Math.max(5, Math.min(98, fakeScore)),
      realScore: Math.max(2, 100 - fakeScore),
      reasons,
      isRolePolice: p.role === 'police',
      reportCount: reports.length
    };
  }).filter(Boolean);

  for (let i = 0; i < claimants.length; i++) {
    for (let j = i + 1; j < claimants.length; j++) {
      const ra = getClaimantPoliceReports(room, claimants[i].id, helpers);
      const rb = getClaimantPoliceReports(room, claimants[j].id, helpers);
      const lastA = ra[ra.length - 1];
      const lastB = rb[rb.length - 1];
      if (lastA && lastB && reportsConflict(lastA, lastB)) {
        claimants[i].fakeScore += 8;
        claimants[j].fakeScore += 8;
        claimants[i].reasons.push('조결 충돌');
        claimants[j].reasons.push('조결 충돌');
      }
    }
  }

  claimants.sort((a, b) => b.fakeScore - a.fakeScore);

  let recommendedVoteTargetId = null;
  if (claimants.length >= 2 && claimants[0].fakeScore >= 52) {
    const gap = claimants[0].fakeScore - claimants[1].fakeScore;
    if (gap >= 8 || claimants[0].fakeScore >= 62) {
      recommendedVoteTargetId = claimants[0].id;
    }
  }

  return {
    situation,
    claimants,
    recommendedVoteTargetId,
    realPoliceId,
    blufferId: bluffer?.id || null,
    policeDied,
    a: claimants[0] ? { id: claimants[0].id, nickname: claimants[0].nickname } : null,
    b: claimants[1] ? { id: claimants[1].id, nickname: claimants[1].nickname } : null
  };
}

function getRecommendedMatgyeongVoteTarget(room, bot, helpers) {
  const analysis = analyzeMatgyeongSituation(room, helpers);
  if (!analysis.recommendedVoteTargetId || analysis.recommendedVoteTargetId === bot?.id) {
    return null;
  }
  const p = helpers.getPlayerById ? helpers.getPlayerById(room, analysis.recommendedVoteTargetId) : null;
  if (!p || !p.alive) return null;
  return analysis.recommendedVoteTargetId;
}

/** 시민팀 — 확률·경우의수 멘트 */
function pickCitizenProbabilityLine(room, bot, helpers) {
  const a = analyzeMatgyeongSituation(room, helpers);
  if (!a.a || !a.b) return null;
  const top = a.claimants[0];
  const second = a.claimants[1];
  const reasonTop = top.reasons[0] || '조결·타임라인';
  const pct = Math.min(92, Math.max(55, top.fakeScore));

  if (a.situation === 'real_dead') {
    return pick([
      `기자·밤 사망으로 진경이 나갔습니다. 생존 ${top.nickname}·${second.nickname} 맞경 중 ${top.nickname}님이 짭경(마피아)일 확률이 큽니다. 오늘 ${top.nickname}님부터 몰표합시다.`,
      `경찰 role이 없는데 ${top.nickname}님이 경찰인 척합니다. 진경 사망 뒤 맞경은 거의 짭경입니다. ${top.nickname}님 조결부터 까고 투표 가죠.`,
      `맞경 ${top.nickname}·${second.nickname} — 취재·사망 팩트상 ${top.nickname}님 라인이 짭경에 가깝습니다(${reasonTop}, ${pct}% 추정). 선동 말고 표로 가립시다.`,
      `시민 여러분, 진경 없는데 ${top.nickname}님만 경찰 우기면 마피아 이득입니다. ${top.nickname}님 쪽 찬성 투표 부탁드립니다.`
    ]);
  }

  if (a.situation === 'both_alive') {
    return pick([
      `맞경 ${a.a.nickname}·${a.b.nickname} — 생존 진경은 ${a.realPoliceId === a.a.id ? a.a.nickname : a.b.nickname}님 쪽입니다. ${top.nickname}님은 ${reasonTop}로 짭경 가능성이 큽니다.`,
      `경우의수로 보면 조결이 충돌하는 ${top.nickname}님이 짭경일 확률이 높습니다. 시민은 ${top.nickname}님에게 표를 모읍시다.`,
      `맞경은 한 명만 진경입니다. ${top.nickname}님(${reasonTop})부터 투표로 가리는 게 안전합니다.`
    ]);
  }

  return pick([
    `맞경 ${a.a.nickname}·${a.b.nickname} — ${top.nickname}님이 ${reasonTop}로 짭경 쪽에 가깝습니다. 오늘 ${top.nickname}님부터 처형합시다.`,
    `조결 대조 결과 ${top.nickname}님 라인이 더 거짓일 확률이 큽니다. 맞경 정리는 ${top.nickname}님 투표부터.`,
    `마피아 관점에서 맞경 한 명은 반드시 맢입니다. ${top.nickname}님(${pct}% 짭경 추정) 쪽으로 몰겠습니다.`
  ]);
}

/** 맞경 당사자 — 확률·우김 멘트 */
function pickMatgyeongClaimantDefenseLine(room, bot, rival, helpers, opts = {}) {
  if (!bot || !rival) return null;
  const isEvil = opts.isEvil !== false && bluff().mayMafiaTeamBotBluffPolice(room, bot, helpers);
  const a = analyzeMatgyeongSituation(room, helpers);
  const my = a.claimants.find((c) => c.id === bot.id);
  const their = a.claimants.find((c) => c.id === rival.id);
  const myPct = my ? Math.min(90, 100 - my.fakeScore) : 55;
  const theirPct = their ? Math.min(92, their.fakeScore) : 60;

  if (isEvil) {
    if (bluff().isExposedEvilPoliceBluffer(room, bot, helpers)) {
      return bluff().pickMatgyeongExposedEvilLine(room, bot, rival, helpers)
        || bluff().pickMatgyeongCitizenConfusion(room, bot, helpers)
        || bluff().pickMatgyeongTikiTakaLine(room, bot, rival, {
          isEvil: true,
          round: opts.round || 0,
          helpers
        });
    }
    return pick([
      `${rival.nickname}님 맞경 우기는 짭경 전형입니다. 저 ${bot.nickname} 조결을 보면 ${rival.nickname}님 쪽이 마피아일 확률이 ${theirPct}% 가깝습니다.`,
      `경우의수로 ${rival.nickname}님이 늦게 나와 진경 우기는 패턴입니다. ${rival.nickname}님 조결·타임라인부터 의심하세요.`,
      `맞경은 조결로만 갑니다. ${rival.nickname}님 조결이 제 수사와 충돌하면 ${rival.nickname}님이 짭경일 확률이 큽니다.`,
      bluff().pickMatgyeongTikiTakaLine(room, bot, rival, { isEvil: true, round: opts.round || 0, helpers })
    ].filter(Boolean));
  }

  return pick([
    `${rival.nickname}님, 조결 숫자가 제 기록과 다릅니다. 맞경이면 ${rival.nickname}님 쪽이 짭경일 확률 ${theirPct}%입니다.`,
    `저 ${bot.nickname}가 진경입니다. ${rival.nickname}님 늦경·조결 충돌로 보면 짭경 가능성이 큽니다.`,
    `시민 여러분, ${rival.nickname}님 말만 들으면 짭경에게 당합니다. 저 조결 신뢰도 ${myPct}%입니다.`,
    bluff().pickMatgyeongTikiTakaLine(room, bot, rival, { isEvil: false, round: opts.round || 0, helpers })
  ].filter(Boolean));
}

/** 맞경 토론 1턴 (티키타카·주기 대화) */
function pickMatgyeongDebateTurnLine(room, speaker, rival, helpers, opts = {}) {
  const isEvil = opts.isEvil != null
    ? opts.isEvil
    : bluff().mayMafiaTeamBotBluffPolice(room, speaker, helpers);
  const line = pickMatgyeongClaimantDefenseLine(room, speaker, rival, helpers, {
    isEvil,
    round: opts.round || 0
  });
  if (line) return line;
  return bluff().pickMatgyeongTikiTakaLine(room, speaker, rival, {
    isEvil,
    round: opts.round || 0,
    helpers
  });
}

function applyMatgyeongProbabilityVoteIntel(room, helpers) {
  const a = analyzeMatgyeongSituation(room, helpers);
  if (!a.recommendedVoteTargetId) return;
  try {
    const voteIntel = require('./bot-vote-intel');
    voteIntel.pushPublicVoteIntel(room, {
      targetId: a.recommendedVoteTargetId,
      isMafia: true,
      source: 'matgyeong_probability'
    });
  } catch (_) { /* noop */ }
}

module.exports = {
  analyzeMatgyeongSituation,
  getRecommendedMatgyeongVoteTarget,
  pickCitizenProbabilityLine,
  pickMatgyeongClaimantDefenseLine,
  pickMatgyeongDebateTurnLine,
  applyMatgyeongProbabilityVoteIntel,
  sawRealPoliceDeathLastNight,
  hasConfirmedDeadPolice
};
