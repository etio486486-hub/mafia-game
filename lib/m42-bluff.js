/**
 * 마피아 팀 시민 위장·블러핑 (홀경/맞경/쓰리경 등).
 * 나무위키 마피아42 용어 기반.
 */

const ROLE_CLAIM_DETECT = {
  police: /(?:저는|나는|제가|전)\s*경찰|(?:저|제가)\s*홀경|경찰입니다|홀경입니다|자경입니다|진경입니다|수사하겠|조사하겠|경찰이라/,
  doctor: /저는\s*의사|나는\s*의사|의사입니다|홀의|눈힐입니다/,
  soldier: /저는\s*군인|나는\s*군인|군인입니다|홀군|방탄\s*있/,
  reporter: /저는\s*기자|나는\s*기자|기자입니다|홀기|취재하겠/,
  medium: /저는\s*영매|영매입니다|홀영/,
  citizen: /저는\s*시민|무직|특수직\s*아님|일반\s*시민/
};

const ROLE_SHORT = {
  police: '경',
  doctor: '의',
  soldier: '군',
  reporter: '기',
  medium: '영',
  citizen: '시'
};

const BLUFF_OPEN_LINES = {
  police: [
    '저는 경찰입니다. 조결이 필요하면 말씀해 주십시오.',
    '홀경입니다. 밤에 수사하고 낮에 조결로 말씀드리겠습니다.',
    '경찰입니다. 수사한 대상만 조결하겠습니다.'
  ],
  citizen: [
    '저는 시민입니다. 특수직은 아닙니다.',
    '무직 시민입니다. 경찰·기자 팩트 따라가겠습니다.',
    '일반 시민입니다. 맞직 나오면 조결부터 보겠습니다.'
  ],
  soldier: [
    '저는 군인입니다. 방탄은 한 번 있습니다.',
    '군인입니다. 첫 살해 막을 수 있습니다.'
  ],
  doctor: [
    '저는 시민입니다. 의사 직공은 안 하고 눈힐이 낫습니다.',
    '특직 숨기고 시민으로 가겠습니다. 조결 나오면 따르겠습니다.'
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

function getDayMessages(room) {
  return (room.chatLog && room.chatLog.day) ? room.chatLog.day.slice(-40) : [];
}

function getAlivePoliceId(room, helpers) {
  const alive = helpers.getAlivePlayers ? helpers.getAlivePlayers(room) : [];
  const p = alive.find((pl) => pl.role === 'police');
  return p ? p.id : null;
}

/** 채팅에서 직업 주장 스캔 (생존자, 시스템 제외) */
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

/**
 * 맞경·홀경 상황에 맞는 가짜 직업 선택
 */
function pickMafiaBluffRole(room, bot, helpers) {
  const existing = getBotFakeClaim(room, bot.id, helpers);
  if (existing) return existing;

  const claims = scanRoleClaims(room, helpers);
  const realPoliceId = getAlivePoliceId(room, helpers);
  const othersPolice = countClaims(claims, 'police', bot.id);

  const pool = [];

  if (othersPolice === 0) {
    pool.push('citizen', 'citizen', 'soldier', 'soldier', 'police', 'police', 'reporter');
  } else if (othersPolice === 1) {
    pool.push('citizen', 'citizen', 'soldier', 'police', 'police', 'doctor');
  } else {
    pool.push('citizen', 'citizen', 'citizen', 'soldier', 'soldier', 'reporter');
  }

  if (bot.role === 'spy' && othersPolice >= 1) {
    pool.push('citizen', 'citizen', 'soldier');
  }

  let pick = pool[Math.floor(Math.random() * pool.length)];

  if (pick === 'police' && bot.id === realPoliceId) {
    pick = 'citizen';
  }

  if (pick === 'police' && othersPolice >= 2) {
    pick = 'citizen';
  }

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

/** 맞경 선동·짭경 몰기는 실제 직공 2명+ 또는 1~2낮·경찰 직공 1명 이상일 때만 */
function canMafiaMatgyeongStir(room, claims) {
  const dayIndex = room.game?.dayIndex || 0;
  const policeN = (claims.police || []).length;
  if (policeN >= 2) return true;
  if (dayIndex <= 2 && policeN >= 1) return true;
  return false;
}

/** 1~2낮: 적극 직공 위장, 이후: 시민 유지·짧은 반응만 */
function canMafiaProactiveBluff(room) {
  return (room.game?.dayIndex || 0) <= 2;
}

/**
 * 맞경·직공·경찰 주장 상황 반응 (마피아 팀 블러핑)
 */
function reactToClaimBluff(room, bot, isMafia, triggerText, last, helpers) {
  const text = `${triggerText || ''} ${last && last.text ? last.text : ''}`;
  const compact = text.replace(/\s+/g, '');
  const claims = scanRoleClaims(room, helpers);
  const myFake = getBotFakeClaim(room, bot.id, helpers);
  const roleLabel = (r) => (helpers.ROLE_LABELS && helpers.ROLE_LABELS[r]) || r;

  if (!isMafia) {
    if (MAT_CHAT.test(compact) && /맞경|맞직/.test(compact)) {
      return '맞직이면 조결·취재부터 확인하겠습니다. 저는 시민입니다.';
    }
    return null;
  }

  const matStir = canMafiaMatgyeongStir(room, claims);
  const proactive = canMafiaProactiveBluff(room);

  for (const role of ['police', 'doctor', 'soldier', 'reporter']) {
    if (!matStir) break;
    const n = countClaims(claims, role, null);
    const short = ROLE_SHORT[role];
    const matMention = new RegExp(`맞${short}|쓰리${short}|${short}맞|맞${roleLabel(role)}`);
    if (n < 2 && !(matMention.test(compact) && n >= 2)) continue;
    if (n >= 2 || (matMention.test(compact) && n >= 2)) {
      const names = claims[role].map((c) => c.nickname).join(', ');
      if (myFake === role) {
        const rival = pickRivalClaimant(claims, role, bot);
        const rivalName = rival ? rival.nickname : names.split(',')[0];
        const lines = [
          `맞${short}이지만 저는 진${short} 쪽입니다. ${rivalName}님 조결·행적부터 검증합시다.`,
          `${rivalName}님 말이 수상합니다. 저 ${roleLabel(role)} 조결은 팩트입니다.`,
          `저는 ${roleLabel(role)}입니다. ${rivalName}님이 늦경·눈치경처럼 보입니다.`
        ];
        return lines[Math.floor(Math.random() * lines.length)];
      }
      return `맞${short}입니다. ${names}님 중 조결·취재로 짭${short} 가려야 합니다. 저는 시민입니다.`;
    }
  }

  if (last && last.fromId !== bot.id && ROLE_CLAIM_DETECT.police.test(compact)) {
    const pc = claims.police.length;
    if (pc === 2 && myFake === 'police') {
      const rival = pickRivalClaimant(claims, 'police', bot);
      if (rival) {
        return `${rival.nickname}님 맞경인데 조결이 없으면 짭경입니다. 저는 경찰입니다.`;
      }
    }
    if (proactive && pc === 1 && !myFake && Math.random() < 0.42) {
      const fake = pickMafiaBluffRole(room, bot, helpers);
      if (fake === 'police') {
        return buildBluffOpenLine('police', bot, room);
      }
    }
    if (matStir && pc >= 1 && myFake !== 'police') {
      return `${last.from}님 경찰 말씀 들었습니다. 맞경이면 조결 맞춰 봐야 합니다. 저는 시민입니다.`;
    }
  }

  if (proactive && (JIKGONG_CHAT.test(compact) || wantsOpenClaim(text))) {
    if (!myFake || Math.random() < 0.7) {
      const fake = pickMafiaBluffRole(room, bot, helpers);
      return buildBluffOpenLine(fake, bot, room);
    }
    return buildBluffOpenLine(myFake, bot, room);
  }

  if (MAT_CHAT.test(compact) && matStir) {
    if (myFake && myFake !== 'citizen') {
      return `저는 ${roleLabel(myFake)}입니다. 맞직은 조결·행적으로 가리겠습니다.`;
    }
    return '맞직 나오면 확직·조결부터 봐야 합니다. 저는 시민입니다.';
  }

  return null;
}

function wantsOpenClaim(text) {
  return JIKGONG_CHAT.test(String(text).replace(/\s+/g, ''));
}

function buildMafiaRollCallAnswer(room, bot, helpers) {
  const fake = pickMafiaBluffRole(room, bot, helpers);
  return buildBluffOpenLine(fake, bot, room);
}

function buildLlmBluffHint(brief, bot) {
  if (!brief.isMafia) return '';
  const fc = brief.fakeClaim || 'citizen';
  return `위장 직업(거짓 직공): ${fc}. 맞경·홀경 상황이면 시민처럼 말하며 짭경 쪽으로 몰거나, 위장이 경찰이면 진경인 척 조결·행적을 주장. 마피아·밤챗·우리팀 노출 금지.`;
}

module.exports = {
  scanRoleClaims,
  pickMafiaBluffRole,
  buildBluffOpenLine,
  reactToClaimBluff,
  buildMafiaRollCallAnswer,
  buildLlmBluffHint,
  MAT_CHAT,
  JIKGONG_CHAT
};
