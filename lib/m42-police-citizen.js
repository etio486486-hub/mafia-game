/**
 * 진경(경찰) 봇 — 시민 편, 조결·맞경·투표로 낮 채팅을 이어가는 멘트.
 * 문체: 합니다·입니다·아닙니다.
 */

const policeFmt = require('./police-report-format');

function getDayChat(room, helpers) {
  if (helpers.getChatMessages) return helpers.getChatMessages(room, 'day') || [];
  return (room.chatLog && room.chatLog.day) || [];
}

function scanReporters(room, helpers) {
  const m42Bluff = require('./m42-bluff');
  return m42Bluff.scanPoliceReporters(room, helpers);
}

function pick(lines) {
  return lines[Math.floor(Math.random() * lines.length)];
}

function shouldLeadJatu(room) {
  if ((room?.game?.dayIndex || 0) <= 1) return true;
  const report = room && room.game ? room.game.lastNightReport : null;
  if (!report) return false;
  const hadDeath = Array.isArray(report.deaths) && report.deaths.length > 0;
  if (!hadDeath) return false;
  const intel = Array.isArray(room.game?.publicVoteIntel) ? room.game.publicVoteIntel : [];
  const hasRevealedMafia = intel.some((r) => r && r.isMafia === true);
  return !hasRevealedMafia;
}

function getMatgyeongRival(room, bot, helpers) {
  const reporters = scanReporters(room, helpers).filter((r) => r.id !== bot.id);
  if (!reporters.length) return null;
  const pick = reporters[Math.floor(Math.random() * reporters.length)];
  const p = helpers.getPlayerById ? helpers.getPlayerById(room, pick.id) : null;
  return p && p.alive ? p : null;
}

/** 맞경 시 진경 봇 전략 멘트(랜덤) + server에서 applyMatgyeongStrategyEffects 연동 */
function pickMatgyeongStrategyLine(room, bot, helpers) {
  const rival = getMatgyeongRival(room, bot, helpers);
  const rivalName = rival ? rival.nickname : '맞경 상대';
  const pd = helpers.getAlivePlayers
    ? helpers.getAlivePlayers(room).find((p) => p && p.alive && p.role === 'private_detective')
    : null;
  const pdName = pd ? pd.nickname : '사립탐정';

  let probPct = 58;
  try {
    const m42MatProb = require('./m42-matgyeong-probability');
    const analysis = m42MatProb.analyzeMatgyeongSituation(room, helpers);
    if (rival) {
      const their = analysis.claimants.find((c) => c.id === rival.id);
      if (their) probPct = Math.min(92, their.fakeScore);
    }
  } catch (_) { /* noop */ }

  return pick([
    `맞경이 나왔으니 오늘은 자투로 먼저 낮을 보내 주십시오. 밤에 제가 ${rivalName}님 맞경 조사해보겠습니다.`,
    `맞경이 나왔으니 자투로 먼저 낮보내고, 밤에 ${rivalName}님을 조사해 내일 조결로 확인하겠습니다.`,
    `만약 마피아가 저를 죽이면 남은 맞경은 마피아일 확률이 높습니다. 다음 날 낮에 ${rivalName}님을 투표로 처형합시다.`,
    `제가 밤에 제거되면 ${rivalName}님 맞경 라인이 마피아일 가능성이 큽니다. 시민은 다음 날 ${rivalName}님에게 표를 모읍시다.`,
    '의사님은 눈힐 꼭 해주십시오. 제가 살아야 조사를 계속할 수 있습니다.',
    '의사님, 진경이 없어지기 전에 저에게 눈치 힐 부탁드립니다. 밤 수사를 이어가야 합니다.',
    `제가 죽으면 조사직 ${pdName}님께서 꼭 마피아를 찾아 주십시오. 시민은 사탐 관찰과 투표로 맞춰 주세요.`,
    `경찰이 밤에 죽으면 ${pdName}님(사립탐정)이 이어서 마피아를 좁혀 주셔야 합니다. 저는 오늘 맞경부터 정리하겠습니다.`,
    `맞경 ${rivalName}님 — 조결·타임라인 기준 짭경 추정 ${probPct}%입니다. 시민은 ${rivalName}님 쪽 표부터 모읍시다.`,
    `경우의수로 보면 맞경 ${rivalName}님이 짭경일 확률이 큽니다. 오늘은 ${rivalName}님 투표로 가리겠습니다.`,
    `${rivalName}님과 맞경이면 조결 충돌·늦경 패턴을 보면 ${rivalName}님 라인이 거짓일 가능성이 ${probPct}% 가깝습니다.`
  ]);
}

function applyMatgyeongStrategyEffects(room, bot, line, helpers) {
  if (!room?.game || bot.role !== 'police' || !line) return;
  const compact = String(line).replace(/\s+/g, '');
  const rival = getMatgyeongRival(room, bot, helpers);

  if (/자투/.test(compact)) {
    room.game.botMatgyeongJatuDay = true;
  }
  if (/밤에.*조사|맞경조사|조사해/.test(compact) && rival) {
    room.game.botMatgyeongInvestigateRivalId = rival.id;
  }
  if (/죽이면|제거되면|죽으면.*맞경|밤에.*죽/.test(compact) && rival) {
    room.game.botMatgyeongVoteRivalIfPoliceDies = rival.id;
  }
  if (/눈힐|눈치\s*힐/.test(compact)) {
    room.game.botDoctorHealHintPlayerId = bot.id;
  }
  if (/사립탐정|조사직|사탐/.test(compact)) {
    room.game.botPdLeadOnPoliceDeath = true;
  }

  try {
    const { agentLog } = require('./debug-agent-log');
    agentLog({
      hypothesisId: 'H_mat_strategy',
      location: 'm42-police-citizen.js:applyMatgyeongStrategyEffects',
      message: 'matgyeong strategy flags applied',
      runId: 'mat-strategy',
      data: {
        police: bot.nickname,
        jatuDay: !!room.game.botMatgyeongJatuDay,
        investigateRival: room.game.botMatgyeongInvestigateRivalId || null,
        voteRivalIfDead: room.game.botMatgyeongVoteRivalIfPoliceDies || null,
        doctorHealHint: room.game.botDoctorHealHintPlayerId || null,
        pdLeadOnDeath: !!room.game.botPdLeadOnPoliceDeath
      }
    });
  } catch (_) { /* noop */ }
}

function getPoliceVerdictAgainstRival(room, policeBotId, rivalId) {
  if (!room?.game?.policeIntel || !policeBotId || !rivalId) return null;
  const intel = room.game.policeIntel[policeBotId] || [];
  const rows = intel
    .filter((r) => r && r.targetId === rivalId)
    .sort((a, b) => (b.nightIndex || 0) - (a.nightIndex || 0));
  if (!rows.length) return null;
  return !!rows[0].isMafia;
}

/** 이미 조결을 올린 뒤 반복 유도·투표·맞경 정리 */
function pickCitizenLeadAfterReport(room, bot, helpers, triggerText, last) {
  const reporters = scanReporters(room, helpers);
  const rivals = reporters.filter((r) => r.id !== bot.id);
  const report = helpers.buildPolicePublicReport
    ? helpers.buildPolicePublicReport(room, bot.id)
    : null;
  const intelLine = report && report.hasIntel && report.text ? report.text : null;

  if (rivals.length >= 2) {
    const rival = rivals[0];
    const dayIdx = room.game?.dayIndex || 0;
    if (dayIdx <= 2 && Math.random() < 0.42) {
      const strat = pickMatgyeongStrategyLine(room, bot, helpers);
      if (strat) return strat;
    }
    const verdict = getPoliceVerdictAgainstRival(room, bot.id, rival.id);
    if (dayIdx <= 1) {
      return pick([
        `${rival.nickname}님, 1일차 맞경이면 서로 오늘 밤에 조사해서 내일 조결로 확인합시다.`,
        `맞경 유지하되 1일차는 각자 밤 조사로 검증합시다. 저는 ${rival.nickname}님을 조사하겠습니다.`,
        `서로 진경 주장만 반복하지 말고 밤 조사로 확인합시다. 내일 조결로 판가름내겠습니다.`
      ]);
    }
    if (dayIdx >= 2 && verdict === true) {
      let pct = 78;
      try {
        const m42MatProb = require('./m42-matgyeong-probability');
        const analysis = m42MatProb.analyzeMatgyeongSituation(room, helpers);
        const their = analysis.claimants.find((c) => c.id === rival.id);
        if (their) pct = Math.min(95, their.fakeScore + 12);
      } catch (_) { /* noop */ }
      return pick([
        `${rival.nickname}님 조사 결과 마피아입니다. 맞경 정리 끝났습니다. 시민은 ${rival.nickname}님에게 투표를 모읍시다.`,
        `제 조사에서 ${rival.nickname}님이 마피아로 확인됐습니다. 오늘은 ${rival.nickname}님 처단으로 갑시다.`,
        `${rival.nickname}님은 조결상 마피아입니다. 교주 선동보다 먼저 ${rival.nickname}님 투표가 우선입니다.`,
        `맞경 ${rival.nickname}님 — 수사·조결 대조 시 마피아일 확률 ${pct}%입니다. 오늘 ${rival.nickname}님부터 몰겠습니다.`
      ]);
    }
    if (dayIdx >= 2 && verdict === false) {
      return pick([
        `${rival.nickname}님이 시민팀으로 나와도 스파이·교주 위장 가능성이 큽니다. 맞경이 계속되니 둘 중 한 명부터 투표로 정리합시다.`,
        `${rival.nickname}님 조사 결과 시민쪽이지만 스파이·교주면 속일 수 있습니다. 맞경 유지 시 둘 중 한 명을 먼저 처단합시다.`,
        `시민 결과만으로 확정할 수 없습니다. 스파이·교주 가능성이 있어 맞경 둘 중 한 명을 투표로 먼저 가르겠습니다.`
      ]);
    }
    const pool = [
      `${rival.nickname}님 조결은 제 수사와 다릅니다. 같은 형식으로 조결을 다시 맞춘 뒤 말로 대립을 가져가겠습니다.`,
      `맞경이면 조결 숫자부터 맞춰 봅시다. 저는 ${bot.nickname}이고 방금 조결은 제 수사 결과입니다.`,
      `${rival.nickname}님 말고 제가 밤에 수사한 조결만 믿어 주십시오. 시민은 맞경 중 한쪽에 표를 모읍시다.`,
      `맞경일 때는 다른 직공보다 경찰 한 명부터 몰아야 합니다. 저 조결을 기준으로 투표합시다.`
    ];
    if (intelLine && Math.random() < 0.35) {
      return `${pick(pool)} (${intelLine})`;
    }
    return pick(pool);
  }
  if (shouldLeadJatu(room)) {
    return pick([
      '밤 사망은 났지만 마피아가 아직 안 밝혀졌습니다. 경찰 기준으로 오늘은 자투로 정리합시다.',
      '지금은 확정 맢이 없습니다. 시민은 자투로 표를 맞추고 다음 조결·취재를 보겠습니다.',
      '맢 확정 전까지는 무리한 몰표보다 자투가 안전합니다. 자투로 맞춰 주세요.'
    ]);
  }

  /** 살아 있는 맞경 상대(다른 조결 주장자)가 없으면 홀경으로 전환 */
  if (rivals.length === 0) {
    const holgyeong = [
      '맞경이 정리됐습니다. 저 혼자 진경이니 홀경 기준으로 의심 라인을 조사해 조결로 마피아를 좁히겠습니다.',
      '짭경이 빠졌으니 이제 제 조결만 따라가 주시면 됩니다. 남은 인원을 밤 수사·낮 조결로 차근차근 검증하겠습니다.',
      '맞경 종료입니다. 시민은 제 수사 결과를 기준으로 지목과 투표를 모아 주십시오.'
    ];
    if (intelLine && Math.random() < 0.4) {
      return `${pick(holgyeong)} (${intelLine})`;
    }
    return pick(holgyeong);
  }

  const askVote = [
    '조결은 올렸습니다. 맞경이면 시민은 경찰 중 한쪽에 표를 모아 짭경부터 가리겠습니다.',
    '제 조결 기준으로 시민은 같이 지목하고, 무죄 조결은 빼고 가겠습니다.',
    '경찰 조결 나왔으니 맞경은 조결 문장부터 맞춘 뒤 투표로 한 명을 가립시다.',
    '수사 결과는 채팅에 남겼습니다. 의심 가는 분 닉네임을 주시면 근거와 함께 정리하겠습니다.'
  ];
  if (/투표|지목|자투|몰표|처형/.test(String(triggerText || ''))) {
    return pick([
      '저는 시민 편입니다. 맞경이면 경찰 한쪽에 몰표하겠습니다.',
      '조결 나온 사람부터 투표합시다. 저는 방금 공표한 수사 결과를 유지합니다.',
      '무투보다 맞경 한쪽 몰이가 낫습니다. 저 조결 기준으로 가겠습니다.'
    ]);
  }
  return pick(askVote);
}

/** 낮 채팅 반응 — 조결 요청·맞경·혼란 */
function pickReactiveCitizenLine(room, bot, helpers, triggerText, last) {
  const t = `${triggerText || ''} ${last && last.text ? last.text : ''}`;
  const compact = t.replace(/\s+/g, '');
  if (/자투|무투|투표스킵|자투표/.test(compact) && shouldLeadJatu(room)) {
    return pick([
      '저도 동의합니다. 마피아 미확정이면 오늘은 자투로 갑시다.',
      '경찰 입장에서 지금은 자투가 맞습니다. 다음 조결·취재로 확정하고 몰겠습니다.',
      '사망만 있고 맢 확정이 없으니 자투로 표를 모읍시다.'
    ]);
  }

  if (/경조|조결|수사|경찰조사|경찰결과/.test(compact)) {
    if (helpers.buildPolicePublicReport) {
      const report = helpers.buildPolicePublicReport(room, bot.id);
      if (report && report.hasIntel && report.text
        && !helpers.hasPoliceReportInDayChat?.(room, bot.id)) {
        return report.text;
      }
    }
    if (helpers.hasPolicePublishedReportToday?.(room, bot.id)
      || helpers.hasPoliceReportInDayChat?.(room, bot.id)) {
      return pickCitizenLeadAfterReport(room, bot, helpers, triggerText, last);
    }
    return pick([
      '조결 요청 확인했습니다. 밤에 수사한 뒤 낮에 결과를 말씀드리겠습니다.',
      '경찰입니다. 밤에 대상을 고르면 낮에 조결로 공개하겠습니다.',
      '이번 밤 수사가 끝나면 조결로 올리겠습니다. 시민은 그때까지 맞경은 잠시 보류해 주십시오.'
    ]);
  }

  if (/맞경|맞직|홀경|짭경|진경|늦경/.test(compact)) {
    const reporters = scanReporters(room, helpers);
    if (reporters.length >= 2) {
      const rival = reporters.find((r) => r.id !== bot.id);
      if (rival) {
        return pick([
          `${rival.nickname}님, 맞경이면 조결부터 맞춰 봅시다. 저는 진경이고 시민 편입니다.`,
          `맞경찰이면 수사 결과가 다른 쪽이 홀경입니다. 저 조결을 먼저 봐 주십시오.`,
          `저는 경찰입니다. ${rival.nickname}님과 조결이 다르면 제 밤 수사를 기준으로 가겠습니다.`
        ]);
      }
    }
    return pick([
      '맞경이면 조결만으로 먼저 맞춥시다. 저는 경찰이고 시민 편입니다.',
      '경찰은 한 명이 진짜입니다. 조결이 안 맞는 쪽부터 의심하겠습니다.'
    ]);
  }

  if (/기자|취재|영매|성불/.test(compact)) {
    const reporters = scanReporters(room, helpers);
    if (reporters.length >= 2) {
      return pick([
        '맞경 중에는 기자·영매보다 먼저 경찰 한쪽을 몰아야 합니다. "○○님 조사했는데 마피아가 아닙니다/입니다" 형식으로 조결부터 맞춥시다.',
        '지금은 맞경 정리가 우선입니다. 경찰 조결 문장을 맞춘 뒤 말로 대립을 가져가고, 투표는 맞경 중 한쪽에 모읍시다.'
      ]);
    }
    return pick([
      '기자·영매 공표는 경찰 조결과 맞는지 보면 됩니다. 맞경이 아니면 그때 취재·성불을 보겠습니다.',
      '취재·성불과 조결이 맞으면 무죄, 어긋나면 다시 수사·지목하겠습니다.',
      '경찰 조결이 먼저입니다. 그다음에 기자·영매 결과를 대조하겠습니다.'
    ]);
  }

  if (/마피아|의심|수상|범인/.test(compact) && last && last.fromId !== bot.id) {
    const report = helpers.buildPolicePublicReport
      ? helpers.buildPolicePublicReport(room, bot.id)
      : null;
    if (report && report.hasIntel && report.text && Math.random() < 0.55) {
      return `${last.from}님 말씀 들었습니다. ${report.text} 이 조결 기준으로 같이 보겠습니다.`;
    }
  }

  return null;
}

/** 낮 시작 후 주기적 시민 주도 멘트 */
function pickScheduledCitizenLine(room, bot, helpers, waveIndex) {
  if (shouldLeadJatu(room)) {
    return pick([
      '밤 사망은 있었지만 맢 확정이 없습니다. 시민은 자투로 표를 맞춰 주세요.',
      '지금은 자투로 넘기고 다음 조결·취재에서 확정 맢에 몰표합시다.',
      '경찰 기준 안내: 마피아가 밝혀지기 전에는 자투 유지가 안전합니다.'
    ]);
  }
  const report = helpers.buildPolicePublicReport
    ? helpers.buildPolicePublicReport(room, bot.id)
    : null;
  const hasIntel = !!(report && report.hasIntel && report.text);
  const substantiveInChat = helpers.hasPoliceReportInDayChat?.(room, bot.id);
  const publishedSubstantive = helpers.hasPolicePublishedReportToday?.(room, bot.id);
  const reporters = scanReporters(room, helpers);
  const matgyeong = reporters.length >= 2;

  if (!substantiveInChat && !publishedSubstantive && hasIntel) {
    return report.text;
  }

  if (!substantiveInChat && !publishedSubstantive && !hasIntel) {
    const pre = [
      '경찰입니다. 밤에 수사하면 낮에 조결로 말씀드리겠습니다. 시민은 조결 나올 때까지 맞경은 잠시만요.',
      '저는 진경입니다. 조결 요청 주시면 수사 결과를 공개하겠습니다.',
      '오늘 밤 수사 대상 정한 뒤, 낮에 조결로 시민과 같이 가겠습니다.'
    ];
    return pick(pre);
  }

  if (matgyeong) {
    if (bot.role === 'police' && (room.game?.dayIndex || 0) <= 3 && Math.random() < 0.48) {
      return pickMatgyeongStrategyLine(room, bot, helpers);
    }
    const matLines = [
      '맞경이면 조결부터 맞춥시다. 저는 밤 수사 결과만 말합니다.',
      '맞경일 때 시민은 경찰 중 한쪽에 표를 모읍시다. 조결 문장이 다른 쪽부터 의심합니다.',
      '시민은 한 줄 조결로 몰아주는 편이 낫습니다. 저 조결 기준으로 투표하겠습니다.',
      '맞경찰 둘 중 조결이 수사와 맞는 쪽이 진경입니다. 저는 시민 편입니다.'
    ];
    if (waveIndex % 2 === 0) return pick(matLines);
  }

  const post = [
    '조결은 공개했습니다. 맞경이면 경찰 중 한쪽에 몰표합시다.',
    '제 수사 결과는 채팅에 있습니다. 근거 더 필요하면 닉네임 주시면 정리하겠습니다.',
    '경찰 조결 나온 상태입니다. 맞경은 조결 형식을 맞춘 뒤 말로 대립을 가져가겠습니다.',
    '시민 여러분, 맞경일 때는 다른 선동보다 경찰 한 명부터 몰아주십시오.',
    '맞경은 조결 숫자로 가릴 수 있습니다. 저는 진경이고 조결은 이미 올렸습니다.'
  ];
  if (substantiveInChat || publishedSubstantive) {
    return pick(post);
  }
  if (hasIntel) {
    return report.text;
  }
  return pick(post);
}

function pickPoliceDialogueSteer(room, bot, helpers) {
  if (!helpers.getAlivePlayers) return null;
  const alive = helpers.getAlivePlayers(room);
  if (!alive.some((p) => p && p.role === 'police' && p.alive)) return null;
  const lines = [
    '경찰 조결이 나와야 낮 토론이 맞춰집니다. 진경 조결 부탁드립니다.',
    '오늘도 경찰 조결 중심으로 맞춰 가겠습니다.',
    '시민은 조결·맞경부터 정리한 뒤 투표하는 편이 낫습니다. 조결 부탁드립니다.',
    '맞경이면 조결부터 맞춰 봅시다. 경찰 조결이 우선입니다.',
    '저는 경찰 조결 기준으로 말하겠습니다. 조결 나오면 같이 보겠습니다.'
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

module.exports = {
  pickCitizenLeadAfterReport,
  pickReactiveCitizenLine,
  pickScheduledCitizenLine,
  pickPoliceDialogueSteer,
  pickMatgyeongStrategyLine,
  applyMatgyeongStrategyEffects
};
