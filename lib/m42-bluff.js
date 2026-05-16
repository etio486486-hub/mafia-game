/**
 * 마피아 팀 시민 위장·블러핑 (홀경/맞경/쓰리경 등).
 */

const ROLE_CLAIM_DETECT = {
  police: /(?:저는|나는|제가|전)\s*경찰|(?:저|제가)\s*홀경|경찰입니다|홀경입니다|자경입니다|진경입니다|수사하겠|조사하겠|경찰이라/,
  doctor: /저는\s*의사|나는\s*의사|의사입니다|홀의|눈힐입니다/,
  soldier: /저는\s*군인|나는\s*군인|군인입니다|홀군|방탄\s*있/,
  reporter: /저는\s*기자|나는\s*기자|기자입니다|홀기|취재하겠/,
  medium: /저는\s*영매|영매입니다|홀영/,
  citizen: /저는\s*시민|무직|특수직\s*아님|일반\s*시민/
};

const POLICE_REPORT_CHAT = /수사\s*결과|조사\s*결과|경찰\s*조사|경찰\s*조결/;

const ROLE_SHORT = {
  police: '경',
  doctor: '의',
  soldier: '군',
  reporter: '기',
  medium: '영',
  citizen: '시'
};

/** 진짜 경찰 봇·사람이 쓰는 멘트와 동일 (낮 1 홀경·가짜 조결) */
const POLICE_STYLE_CLAIM = [
  '저는 경찰입니다. 조결이 필요하면 말씀해 주십시오.',
  '홀경입니다. 밤에 수사하고 낮에 조결로 말씀드리겠습니다.',
  '경찰입니다. 수사한 대상만 조결하겠습니다.',
  '저는 경찰입니다. 경찰조사·조결 요청 주시면 답하겠습니다.'
];

const BLUFF_OPEN_LINES = {
  police: [...POLICE_STYLE_CLAIM],
  citizen: [
    '저는 시민입니다. 특수직은 아닙니다.',
    '무직 시민입니다. 경찰·기자 팩트 따라가겠습니다.'
  ],
  soldier: [
    '저는 군인입니다. 방탄은 한 번 있습니다.',
    '군인입니다. 맞군 나오면 조결로 짭군 가리겠습니다.'
  ],
  doctor: [
    '저는 시민입니다. 의사 직공은 안 하고 눈힐이 낫습니다.',
    '특직 숨기고 시민으로 가겠습니다.'
  ],
  reporter: [
    '저는 기자입니다. 2밤부터 취재 결과 공표하겠습니다.',
    '기자입니다. 팩트만 말하겠습니다.'
  ],
  medium: [
    '저는 영매입니다. 성불·사망자 채팅 확인합니다.',
    '영매입니다. 밤에 성불하겠습니다.'
  ]
};

const MAT_CHAT = /맞경|맞의|맞군|맞직|맞기|쓰리경|쓰리의|대립|짭경|진경|늦경|눈치경|홀경|맞경찰/;
const JIKGONG_CHAT = /직공|직업\s*뭐|직업이\s*뭐|각자\s*직업|직업\s*말|ㅈㄱ|풍지/;
const MATGYEONG_ASK = /맞경|맞경찰|맞의|쓰리경|홀경/;

function getDayMessages(room) {
  return (room.chatLog && room.chatLog.day) ? room.chatLog.day.slice(-40) : [];
}

function getAlivePoliceId(room, helpers) {
  const alive = helpers.getAlivePlayers ? helpers.getAlivePlayers(room) : [];
  const p = alive.find((pl) => pl.role === 'police');
  return p ? p.id : null;
}

function pickAliveNames(room, bot, helpers, count = 2) {
  const alive = helpers.getAlivePlayers
    ? helpers.getAlivePlayers(room).filter((p) => p.id !== bot.id && p.alive)
    : [];
  return [...alive].sort(() => Math.random() - 0.5).slice(0, count).map((p) => p.nickname);
}

/** 직공 + 조결 공개한 사람 = 경찰 후보(홀경) */
function scanPoliceReporters(room, helpers) {
  const claims = scanRoleClaims(room, helpers);
  const reporters = [...(claims.police || [])];
  const seen = new Set(reporters.map((r) => r.id));

  for (const msg of getDayMessages(room)) {
    if (!msg || !msg.fromId || !msg.text || msg.system) continue;
    if (!POLICE_REPORT_CHAT.test(msg.text) && !ROLE_CLAIM_DETECT.police.test(msg.text.replace(/\s+/g, ''))) {
      continue;
    }
    if (seen.has(msg.fromId)) continue;
    const p = helpers.getPlayerById ? helpers.getPlayerById(room, msg.fromId) : null;
    if (!p || !p.alive) continue;
    seen.add(msg.fromId);
    reporters.push({
      id: msg.fromId,
      nickname: msg.from || p.nickname
    });
  }

  const realId = getAlivePoliceId(room, helpers);
  if (realId && !seen.has(realId)) {
    const p = helpers.getPlayerById(room, realId);
    if (p && p.alive) {
      reporters.push({ id: realId, nickname: p.nickname });
    }
  }

  return reporters;
}

function scanRoleClaims(room, helpers) {
  const out = {
    police: [], doctor: [], soldier: [], reporter: [], medium: [], citizen: []
  };
  const seen = {};
  for (const role of Object.keys(out)) {
    seen[role] = new Set();
  }

  for (const msg of getDayMessages(room)) {
    if (!msg || msg.system || !msg.text || !msg.fromId) continue;
    const p = helpers.getPlayerById ? helpers.getPlayerById(room, msg.fromId) : null;
    if (p && !p.alive) continue;
    const compact = String(msg.text).replace(/\s+/g, '');

    for (const [role, re] of Object.entries(ROLE_CLAIM_DETECT)) {
      if (!re.test(compact) && !re.test(msg.text)) continue;
      if (seen[role].has(msg.fromId)) continue;
      seen[role].add(msg.fromId);
      out[role].push({
        id: msg.fromId,
        nickname: msg.from || (p && p.nickname) || '?'
      });
    }
  }
  return out;
}

function countClaims(claims, role, excludeId) {
  const list = claims[role] || [];
  if (!excludeId) return list.length;
  return list.filter((c) => c.id !== excludeId).length;
}

function getBotFakeClaim(room, botId, helpers) {
  const mind = helpers.getBotMind ? helpers.getBotMind(room, botId) : null;
  return mind && mind.fakeClaim ? mind.fakeClaim : null;
}

function setBotFakeClaim(room, botId, role, helpers) {
  const mind = helpers.getBotMind ? helpers.getBotMind(room, botId) : null;
  if (mind) mind.fakeClaim = role;
}

function pickMafiaBluffRole(room, bot, helpers) {
  const existing = getBotFakeClaim(room, bot.id, helpers);
  if (existing) return existing;

  const reporters = scanPoliceReporters(room, helpers);
  const realPoliceId = getAlivePoliceId(room, helpers);

  if (reporters.length === 0) {
    setBotFakeClaim(room, bot.id, 'police', helpers);
    return 'police';
  }

  const pool = reporters.length >= 1
    ? ['police', 'police', 'police', 'citizen']
    : ['police', 'police', 'citizen', 'soldier'];
  let pick = pool[Math.floor(Math.random() * pool.length)];
  if (pick === 'police' && bot.id === realPoliceId) pick = 'citizen';
  setBotFakeClaim(room, bot.id, pick, helpers);
  return pick;
}

function buildBluffOpenLine(fakeRole, bot, room) {
  const g = room.game || {};
  const pool = BLUFF_OPEN_LINES[fakeRole] || BLUFF_OPEN_LINES.citizen;
  let line = pool[Math.floor(Math.random() * pool.length)];
  if (fakeRole === 'reporter' && (g.nightIndex || 0) < 2) {
    line = '저는 기자입니다. 아직 2밤 전이라 취재 전입니다.';
  }
  return line;
}

function pickRivalClaimant(claims, role, bot) {
  const list = (claims[role] || []).filter((c) => c.id !== bot.id);
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function roleLabel(role, helpers) {
  return (helpers.ROLE_LABELS && helpers.ROLE_LABELS[role]) || role;
}

function isDay1Bluff(room) {
  return (room.game?.dayIndex || 0) <= 1;
}

/** 경찰과 똑같은 직공·조결 멘트 (메타 말 없음) */
function buildPoliceStyleBluffLine(room, bot, helpers) {
  setBotFakeClaim(room, bot.id, 'police', helpers);
  const targets = pickAliveNames(room, bot, helpers, 3);
  const name = targets[0];
  if (name && Math.random() < 0.55) {
    return `수사 결과입니다. ${name}님은 마피아가 아닙니다.`;
  }
  return POLICE_STYLE_CLAIM[Math.floor(Math.random() * POLICE_STYLE_CLAIM.length)];
}

/** 낮 1: 경찰 연기만 / 이후: 맞경·선동 */
function pickMafiaBluffLine(room, bot, helpers) {
  if (isDay1Bluff(room)) {
    return buildPoliceStyleBluffLine(room, bot, helpers);
  }
  const reporters = scanPoliceReporters(room, helpers);
  if (reporters.some((r) => r.id !== bot.id)) {
    return buildMatgyeongCounterClaim(room, bot, helpers);
  }
  return buildPoliceStyleBluffLine(room, bot, helpers);
}

function wantsMatgyeongAsk(text) {
  if (!text) return false;
  const c = String(text).replace(/\s+/g, '');
  if (!MATGYEONG_ASK.test(c)) return false;
  return /있|없|누|누구|하나|나오|나왔|봐|보|ㅇㅇ|맞아|인가|인지|제발|좀/.test(c)
    || /맞경있/.test(c)
    || c.length <= 12;
}

/** 홀경(조결 낸 사람)에 맞서 둘째 경찰 주장 → 맞경 */
function buildMatgyeongCounterClaim(room, bot, helpers) {
  setBotFakeClaim(room, bot.id, 'police', helpers);
  const reporters = scanPoliceReporters(room, helpers);
  const rival = reporters.find((r) => r.id !== bot.id);

  if (rival) {
    const lines = [
      `맞경입니다. ${rival.nickname}님과 저 중 진경입니다. 저도 경찰입니다. 조결 맞춰 봅시다.`,
      `저는 경찰입니다. ${rival.nickname}님 말고 저 조결이 맞습니다. 맞경이니 짭경 가려야 합니다.`,
      `${rival.nickname}님 홀경 아닙니다. 저도 경찰입니다. 맞경입니다. ${rival.nickname}님 조결부터 검증합시다.`,
      `맞경입니다. ${rival.nickname}님 수사 결과와 제 결과가 다릅니다. 저는 진경입니다.`
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  return buildPoliceStyleBluffLine(room, bot, helpers);
}

function pickProactiveMafiaBluff(room, bot, helpers) {
  return pickMafiaBluffLine(room, bot, helpers);
}

function reactToMatgyeongAsk(room, bot, isMafia, triggerText, helpers) {
  if (!isMafia || !wantsMatgyeongAsk(triggerText)) return null;
  if (isDay1Bluff(room)) return buildPoliceStyleBluffLine(room, bot, helpers);
  return buildMatgyeongCounterClaim(room, bot, helpers);
}

function reactToClaimBluff(room, bot, isMafia, triggerText, last, helpers) {
  const text = `${triggerText || ''} ${last && last.text ? last.text : ''}`;
  const compact = text.replace(/\s+/g, '');
  const reporters = scanPoliceReporters(room, helpers);
  const myFake = getBotFakeClaim(room, bot.id, helpers) || pickMafiaBluffRole(room, bot, helpers);
  const rl = (r) => roleLabel(r, helpers);

  if (!isMafia) {
    if (MAT_CHAT.test(compact) && /맞경|맞직/.test(compact)) {
      return '맞직이면 조결·취재부터 확인하겠습니다. 저는 시민입니다.';
    }
    return null;
  }

  if (isDay1Bluff(room)) {
    return buildPoliceStyleBluffLine(room, bot, helpers);
  }

  const matAsk = reactToMatgyeongAsk(room, bot, true, triggerText, helpers);
  if (matAsk) return matAsk;

  if (last && POLICE_REPORT_CHAT.test(last.text) && last.fromId !== bot.id) {
    return buildMatgyeongCounterClaim(room, bot, helpers);
  }

  if (reporters.length >= 1) {
    const rival = reporters.find((r) => r.id !== bot.id);
    if (rival) {
      return buildMatgyeongCounterClaim(room, bot, helpers);
    }
  }

  for (const role of ['police', 'doctor', 'soldier', 'reporter']) {
    const n = countClaims(scanRoleClaims(room, helpers), role, null);
    const short = ROLE_SHORT[role];
    const matMention = new RegExp(`맞${short}|쓰리${short}|${short}맞|맞${rl(role)}`);
    if (n >= 1 || matMention.test(compact) || (role === 'police' && reporters.length >= 1)) {
      const names = role === 'police'
        ? reporters.map((r) => r.nickname).join(', ')
        : (scanRoleClaims(room, helpers)[role] || []).map((c) => c.nickname).join(', ');
      if (myFake === role && names) {
        const rival = pickRivalClaimant(scanRoleClaims(room, helpers), role, bot);
        const rivalName = rival ? rival.nickname : names.split(',')[0];
        return `맞${short}입니다. 저는 진${short}입니다. ${rivalName}님 조결이 수상합니다.`;
      }
      if (names) {
        return `맞${short}입니다. ${names}님 중 조결로 짭${short} 가려야 합니다. 저는 ${rl(myFake)}입니다.`;
      }
    }
  }

  if (last && last.fromId !== bot.id && ROLE_CLAIM_DETECT.police.test(compact)) {
    return buildMatgyeongCounterClaim(room, bot, helpers);
  }

  if (JIKGONG_CHAT.test(compact) || wantsOpenClaim(text) || MAT_CHAT.test(compact)) {
    return pickMafiaBluffLine(room, bot, helpers);
  }

  if (Math.random() < 0.55) {
    return pickMafiaBluffLine(room, bot, helpers);
  }

  return null;
}

function wantsOpenClaim(text) {
  return JIKGONG_CHAT.test(String(text).replace(/\s+/g, ''));
}

function buildMafiaRollCallAnswer(room, bot, helpers) {
  return buildPoliceStyleBluffLine(room, bot, helpers);
}

function buildLlmBluffHint(brief, bot) {
  if (!brief.isMafia) return '';
  if ((brief.dayIndex || 0) <= 1) {
    return '낮 1: 진짜 경찰과 똑같이만. 예) "저는 경찰입니다. 조결이 필요하면 말씀해 주십시오." / "수사 결과입니다. ○○님은 마피아가 아닙니다." 맞경·메타 말 금지.';
  }
  return '홀경이면 가짜 조결, 둘째 경찰이면 맞경·진경 주장. 마피아·밤챗·접선·스파이 노출 금지.';
}

module.exports = {
  scanRoleClaims,
  scanPoliceReporters,
  pickMafiaBluffRole,
  buildBluffOpenLine,
  buildPoliceStyleBluffLine,
  pickMafiaBluffLine,
  buildMatgyeongCounterClaim,
  pickProactiveMafiaBluff,
  reactToClaimBluff,
  reactToMatgyeongAsk,
  wantsMatgyeongAsk,
  buildMafiaRollCallAnswer,
  buildLlmBluffHint,
  MAT_CHAT,
  JIKGONG_CHAT
};
