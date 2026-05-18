/**
 * 마피아팀·교주팀(신도 포함) 시민 위장·지속 블러핑 (홀경/맞경/쓰리경 등).
 */

const m42Cult = require('./m42-cult');

const ROLE_CLAIM_DETECT = {
  police: /(?:저는|나는|제가|전)\s*경찰|(?:저|제가)\s*홀경|경찰입니다|홀경입니다|자경입니다|진경입니다|수사하겠|조사하겠|경찰이라/,
  doctor: /저는\s*의사|나는\s*의사|의사입니다|홀의|눈힐입니다/,
  soldier: /저는\s*군인|나는\s*군인|군인입니다|홀군|방탄\s*있/,
  reporter: /저는\s*기자|나는\s*기자|기자입니다|홀기|취재하겠/,
  medium: /저는\s*영매|영매입니다|홀영/,
  citizen: /저는\s*시민|무직|특수직\s*아님|일반\s*시민/
};

const policeFmt = require('./police-report-format');

const POLICE_REPORT_CHAT = /수사\s*결과|조사\s*결과|경찰\s*조사|경찰\s*조결|마피아\s*아닙|무죄입니다|조사했는데|제\s*조사/;

const ROLE_SHORT = {
  police: '경',
  doctor: '의',
  soldier: '군',
  reporter: '기',
  medium: '영',
  citizen: '시'
};

const BLUFF_OPEN_LINES = {
  police: [],
  citizen: [
    '저는 시민입니다. 특수직은 아닙니다.',
    '무직 시민입니다. 경찰·기자 팩트 따라가겠습니다.',
    '일반 시민입니다. 경찰·의사·기자 같은 특수직은 직공할 수 없습니다.',
    '저는 무직 시민입니다. 특수직 직공은 못 하고 조결·취재만 따르겠습니다.'
  ],
  soldier: [
    '저는 군인입니다. 방탄은 한 번 있습니다.',
    '군인입니다. 맞군 나오면 조결로 짭군 가리겠습니다.'
  ],
  doctor: [
    '저는 의사입니다. 의사는 특수직이라 밤에 치료합니다.',
    '홀의입니다. 특수직인 의사 쪽이고 밤에 살리는 역할입니다.',
    '저는 의사입니다. 일반 시민이 아닌 특수직입니다.'
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

/** 맞경 상대(시민 경찰 주장자) 이름 넣어 진경·짭경 우김 */
const POLICE_VS_EVIL_TEMPLATES = [
  '저는 진경입니다. {rival}님이 먼저 나와 저를 짭경으로 몰고 있습니다.',
  '{rival}님 말이 앞뒤가 안 맞습니다. 맞경이면 조결로 까보죠. 진짜 경찰은 저 {self}입니다.',
  '{rival}님 늦게 나와 우기는 건 전형적인 짭경 빌드입니다. 저 {self}가 실제로 밤에 수사했습니다.',
  '맞경이면 한쪽은 맢입니다. {rival}님 조결이 제 수사랑 충돌합니다. 저는 진경입니다.',
  '{rival}님, 저랑 다른 조결 내는 이유부터 설명하세요. 진경은 저 {self}입니다.',
  '저 {self}가 경찰입니다. {rival}님은 왜 제가 본 팩트랑 다른 말을 하죠?',
  '{rival}님처럼 말만 하지 말고 전날 밤 누구 조사했는지부터 맞춰 봅시다. 진경은 저입니다.',
  '짭경은 조결부터 티 납니다. {rival}님 수상하고 저 {self}가 진짜입니다.',
  '{rival}님이 진경인 척하는데, 제 조사 기록이랑 안 맞습니다. 저는 진경입니다.',
  '맞경 싸움은 조결로 갑니다. {rival}님 말고 저 {self} 조결을 보세요. 저가 진경입니다.'
];

const POLICE_VS_REAL_TEMPLATES = [
  '진경은 저 {self}입니다. {rival}님 말만 믿을 순 없어요. 제가 밤에 찍은 조사가 있습니다.',
  '{rival}님 늦게 나와 우기는 건 짭경이랑 같습니다. 저 {self}가 진짜 경찰입니다.',
  '맞경이면 조결부터인데, {rival}님 조결이 제 수사랑 안 맞습니다. 저는 진경입니다.',
  '{rival}님, 저랑 다른 조결 내는 이유 설명이 필요합니다. 진경은 저 {self}입니다.',
  '저 {self}가 경찰입니다. {rival}님은 왜 제가 본 결과랑 다른 말을 하죠?',
  '{rival}님 말이 앞뒤가 안 맞습니다. 밤에 수사한 쪽은 저 {self}입니다.',
  '짭경은 말로만 우깁니다. {rival}님 조결 검증합시다. 진경은 저입니다.',
  '{rival}님이 진경인 척하는데 제 기록이랑 충돌합니다. 저 {self}가 진경입니다.',
  '맞경이면 한쪽은 맢입니다. {rival}님 수상하고 저 {self} 조결을 보세요.',
  '{rival}님 전날 밤 누구 조사했는지부터 물어보죠. 진짜 경찰은 저 {self}입니다.'
];

const MATGYEONG_BICKER_NO_RIVAL = [
  '맞경이면 한쪽은 맢일 확률이 큽니다. 저는 진짜 수사 쪽입니다.',
  '맞경은 조결로만 갑니다. 저는 진경이고 짭경부터 잡읍시다.',
  '저 진경입니다. 늦게 나온 쪽이 짭경인 경우가 많습니다.',
  '맞경 우기기하지 말고 조결부터 맞춰 봅시다. 진경은 저입니다.',
  '짭경은 말이 빠르고 진경은 팩트가 남습니다. 저는 후자입니다.'
];

function pickPoliceVersusBicker(selfName, rivalName, isEvil) {
  const self = selfName || '저';
  const rival = rivalName || '상대';
  const pool = isEvil ? POLICE_VS_EVIL_TEMPLATES : POLICE_VS_REAL_TEMPLATES;
  const line = pool[Math.floor(Math.random() * pool.length)];
  return line.replace(/\{self\}/g, self).replace(/\{rival\}/g, rival);
}

function pickMatgyeongNoRivalBicker() {
  return MATGYEONG_BICKER_NO_RIVAL[Math.floor(Math.random() * MATGYEONG_BICKER_NO_RIVAL.length)];
}

/** 낮 토론 중 수시로 쓰는 혼란·선동 멘트 */
const EVIL_CONFUSION_STIR_LINES = [
  '맞경 나왔으면 조결부터 맞춰 봅시다. 저는 시민입니다.',
  '홀경·맞경·짭경 구분이 먼저입니다. 급하게 몰표하지 마십시오.',
  '경찰 두 명이면 짭경 가리는 게 급합니다. 저도 조결 기다리겠습니다.',
  '맞직이면 취재·조결 팩트로 가야 합니다. 감정 싸움은 마피아 이득입니다.',
  '저는 시민 편입니다. 오늘은 맞경 정리부터 하겠습니다.',
  '조결 나온 사람끼리 맞춰 보고, 안 나온 직공은 수상합니다.',
  '쓰리경이면 한 명은 짭경일 확률이 큽니다. 조결 비교합시다.',
  '무근거 지목보다 경찰·기자 결과가 낫습니다. 저는 무직 시민입니다.',
  '맞의·맞군·맞기 나오면 조결로 짭직 가립시다.',
  '투표 전에 맞경·확직부터 정리하는 게 안전합니다.',
  '저는 일반 시민입니다. 특수직은 직공할 수 없습니다.',
  '무직 시민입니다. 경찰·의사·기자 같은 특수직 직공은 못 합니다.',
  '일반 시민 외에는 특수직이라 공개 못 합니다. 저는 무직 시민입니다.',
  '진짜 특수직만 직공하는 편이 낫습니다. 저는 일반 시민입니다.',
  '맞경 나왔는데 둘 다 진경이라 우기면 시민은 조결만 봐야 합니다.',
  '경찰 두 분 다 "내가 진경"이면 조사 대상·밤 순서부터 맞춰 보세요.',
  '맞경은 한쪽이 짭경인 경우가 많습니다. 조결 문장이 다른 쪽부터 의심합니다.',
  '둘 다 경찰이라면 조결이 왜 엇갈렸는지 설명이 필요합니다. 저는 시민입니다.',
  '맞경 싸움은 감정 빼고 조결 타임라인으로만 가죠.'
];

/** 마피아팀·교주·신도 — 낮 공개 채팅에서 시민 연기·블러핑 대상 */
function isEvilBluffBot(bot, helpers) {
  if (!bot || !bot.alive) return false;
  if (helpers.isMafiaTeam && helpers.isMafiaTeam(bot.role)) return true;
  if (bot.role === m42Cult.ROLE_CULT_LEADER) return true;
  if (bot.joinedCult) return true;
  return false;
}

function isCultSideBluff(bot) {
  return bot.role === m42Cult.ROLE_CULT_LEADER || !!bot.joinedCult;
}

/** 직공 롤콜: 마피아·스파이·교주·신도 — 시민팀 위장 풀 (중복 직공 허용) */
const CITIZEN_BLUFF_ROLL_POOL = [
  'citizen', 'citizen', 'citizen', 'soldier', 'reporter', 'medium',
  'politician', 'politician', 'doctor', 'police'
];

const CITIZEN_BLUFF_ROLL_LINES = {
  citizen: [
    '저는 일반 시민입니다. 특수직 아닙니다.',
    '무직 시민입니다. 오늘 조결 맞춰 가겠습니다.',
    '홀시입니다. 정보 나오면 따라가겠습니다.',
    '일반 시민입니다. 특수직은 직공할 수 없어 무직으로만 말하겠습니다.',
    '저는 무직 시민입니다. 경찰·의사·기자 같은 특수직 직공은 못 합니다.',
    '저는 무직 시민입니다. 같은 편이 조결·홀경 라인 잡는 게 낫습니다. 저는 직공하지 않겠습니다.',
    '특수직은 낮에 밝히면 표적입니다. 저는 무직으로만 가겠습니다. 경찰 조결은 다른 분이 맡는 편이 자연스럽습니다.',
    '저는 일반 시민입니다. 옆에서 경찰 블러핑 하시는 분 계시면 저는 특직 공개는 안 하고 조결만 따르겠습니다.'
  ],
  soldier: [
    '저는 군인입니다. 방탄 한 번 있습니다.',
    '홀군입니다. 시민 보호 쪽입니다.'
  ],
  reporter: [
    '저는 기자입니다. 2밤부터 취재합니다.',
    '홀기입니다. 팩트만 말하겠습니다.',
    '저는 기자입니다. 아직 2밤 전이라 취재 전입니다.'
  ],
  medium: [
    '저는 영매입니다. 성불·사망자 채팅 확인합니다.',
    '홀영입니다. 사망자 성불·채팅은 제 역할입니다.'
  ],
  politician: [
    '저는 정치인입니다. 낮 투표 2표, 찬반 처형 면역입니다.',
    '정치인입니다. 면역 있으니 근거 보고 투표해 주십시오.',
    '정치인입니다. 제 표 두 장이 묵히면 맢 입장에서 좋습니다. 수상한 분부터 몰아보죠.',
    '저는 정치인입니다. 맢 흉내로 말하는 분이 진짜 맢일 때가 많습니다. 오늘은 표로 밀어붙이겠습니다.',
    '정치인입니다. 면역이라 말은 세게 나갑니다. 맢 같아 보이는 라인으로 2표 모아보겠습니다.',
    '저는 정치인입니다. 맞경·홀경 싸움보다 표가 먼저입니다. 투표는 제가 앞장서겠습니다.'
  ],
  doctor: [
    '저는 의사입니다. 의사는 특수직이라 밤에 치료합니다.',
    '홀의입니다. 특수직인 의사 쪽이고 밤에 살리는 역할입니다.',
    '저는 의사입니다. 일반 시민이 아닌 특수직입니다.'
  ],
  police: [
    '저는 경찰입니다. 조사한 사람만 조결로 말씀드리겠습니다.',
    '홀경입니다. 밤에 수사합니다.'
  ]
};

function getDayMessages(room) {
  return (room.chatLog && room.chatLog.day) ? room.chatLog.day.slice(-40) : [];
}

function getAlivePoliceId(room, helpers) {
  const alive = helpers.getAlivePlayers ? helpers.getAlivePlayers(room) : [];
  const p = alive.find((pl) => pl.role === 'police');
  return p ? p.id : null;
}

/** 생존 마피아팀(마피아·스파이) AI 봇만 — 경찰 조결 블러핑 분담용 */
function getAliveMafiaTeamBotPlayers(room, helpers) {
  if (!helpers.getAlivePlayers || !helpers.isMafiaTeam) return [];
  return helpers.getAlivePlayers(room).filter(
    (p) => p && p.isBot && p.alive && helpers.isMafiaTeam(p.role)
  );
}

/**
 * 마피아팀 봇이 둘 이상이면 id 정렬상 첫 봇만 경찰(가짜 조결) 블러핑을 맡음.
 * 나머지는 시민·특직 비공개 쪽으로 가서 둘 다 홀경인 척하지 않게 함.
 */
function mayMafiaTeamBotBluffPolice(room, bot, helpers) {
  if (!bot || !helpers.isMafiaTeam || !helpers.isMafiaTeam(bot.role)) return true;
  const mafiaBots = getAliveMafiaTeamBotPlayers(room, helpers);
  if (mafiaBots.length <= 1) return true;
  const sorted = mafiaBots.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return sorted.length > 0 && sorted[0].id === bot.id;
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
  if (!mind) return;
  if (mind.fakeClaim != null && mind.fakeClaim !== role) return;
  mind.fakeClaim = role;
}

function pickMafiaBluffRole(room, bot, helpers) {
  const existing = getBotFakeClaim(room, bot.id, helpers);
  if (existing && !['mafia', 'spy', 'cult_leader'].includes(existing)) return existing;

  if (bot.role === 'cult_leader') {
    const pick = CITIZEN_BLUFF_ROLL_POOL[Math.floor(Math.random() * CITIZEN_BLUFF_ROLL_POOL.length)];
    setBotFakeClaim(room, bot.id, pick, helpers);
    return pick;
  }

  const reporters = scanPoliceReporters(room, helpers);
  const realPoliceId = getAlivePoliceId(room, helpers);
  const allowPoliceBluff = mayMafiaTeamBotBluffPolice(room, bot, helpers);
  const noPolicePool = CITIZEN_BLUFF_ROLL_POOL.filter((r) => r !== 'police');

  if (reporters.length === 0) {
    if (allowPoliceBluff) {
      setBotFakeClaim(room, bot.id, 'police', helpers);
      return 'police';
    }
    let pick = noPolicePool[Math.floor(Math.random() * noPolicePool.length)];
    if (pick === 'police' && bot.id === realPoliceId) pick = 'citizen';
    setBotFakeClaim(room, bot.id, pick, helpers);
    return pick;
  }

  let pool = reporters.length >= 1
    ? ['police', 'police', 'police', 'citizen']
    : ['police', 'police', 'citizen', 'soldier'];
  if (!allowPoliceBluff) {
    pool = pool.filter((r) => r !== 'police');
    if (!pool.length) pool = ['citizen', 'citizen', 'soldier', 'reporter'];
  }
  let pick = pool[Math.floor(Math.random() * pool.length)];
  if (pick === 'police' && bot.id === realPoliceId) pick = 'citizen';
  setBotFakeClaim(room, bot.id, pick, helpers);
  return pick;
}

function buildBluffOpenLine(fakeRole, bot, room) {
  const g = room.game || {};
  if (fakeRole === 'police') {
    return null;
  }
  const pool = BLUFF_OPEN_LINES[fakeRole] || BLUFF_OPEN_LINES.citizen;
  if (!pool.length) return null;
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

function getRecentPoliceReportNames(room, limit = 3) {
  const names = [];
  for (let i = getDayMessages(room).length - 1; i >= 0 && names.length < limit; i--) {
    const msg = getDayMessages(room)[i];
    if (!msg?.text || !POLICE_REPORT_CHAT.test(msg.text)) continue;
    for (const n of policeFmt.extractReportedNames(msg.text, limit)) {
      if (!names.includes(n)) names.push(n);
      if (names.length >= limit) return names;
    }
  }
  return names;
}

/** 가짜 경찰 조결은 fakeClaim이 비었거나 이미 경찰 위장일 때만 (다른 직공 고정 시 발화 금지) */
function buildFakePoliceReportLine(room, bot, helpers, opts = {}) {
  const cur = getBotFakeClaim(room, bot.id, helpers);
  if (cur && cur !== 'police') return null;
  if (!cur && !mayMafiaTeamBotBluffPolice(room, bot, helpers)) return null;

  setBotFakeClaim(room, bot.id, 'police', helpers);

  if (opts.preferClearMafiaAlly && helpers.isMafiaTeam) {
    const alive = helpers.getAlivePlayers ? helpers.getAlivePlayers(room) : [];
    const avoidN = new Set(
      [...(opts.avoidNames || []), opts.avoidName].filter(Boolean)
    );
    const allies = alive.filter(
      (p) => p && p.id !== bot.id && p.alive && p.nickname && helpers.isMafiaTeam(p.role)
    );
    const candidates = allies.filter((p) => !avoidN.has(p.nickname));
    const pool = candidates.length ? candidates : allies;
    if (pool.length) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      return policeFmt.formatInnocentLine(pick.nickname);
    }
  }

  const avoid = new Set([
    ...(opts.avoidNames || []),
    ...getRecentPoliceReportNames(room, 4)
  ]);
  if (opts.avoidName) avoid.add(opts.avoidName);

  let names = pickAliveNames(room, bot, helpers, 10);
  names = names.filter((n) => n && !avoid.has(n));
  if (!names.length) {
    names = pickAliveNames(room, bot, helpers, 3);
  }
  const name = names[0];
  if (!name) return null;

  if (opts.forceMafia === true || (!opts.forceInnocent && Math.random() < 0.08)) {
    return policeFmt.formatMafiaLine(name);
  }
  return policeFmt.formatInnocentLine(name);
}

/** @deprecated alias — 항상 가짜 조결 */
function buildPoliceStyleBluffLine(room, bot, helpers, opts = {}) {
  return buildFakePoliceReportLine(room, bot, helpers, opts);
}

/** 낮 1: 경찰 연기만 / 이후: 맞경·선동 */
function pickMafiaBluffLine(room, bot, helpers) {
  const tryPoliceBluff = () => {
    const line = buildPoliceStyleBluffLine(room, bot, helpers);
    if (line) return line;
    const fake = getBotFakeClaim(room, bot.id, helpers) || pickMafiaBluffRole(room, bot, helpers);
    const pool = CITIZEN_BLUFF_ROLL_LINES[fake] || CITIZEN_BLUFF_ROLL_LINES.citizen;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  if (isDay1Bluff(room)) {
    return tryPoliceBluff();
  }
  const reporters = scanPoliceReporters(room, helpers);
  if (reporters.some((r) => r.id !== bot.id)) {
    return buildMatgyeongCounterClaim(room, bot, helpers);
  }
  return tryPoliceBluff();
}

/** 마피아·스파이·교주·신도 공통 블러핑 (가짜 조결·맞경·시민 직공 혼합) */
function pickEvilBluffLine(room, bot, helpers) {
  const roll = Math.random();
  if (isCultSideBluff(bot)) {
    if (roll < 0.38) return pickMafiaBluffLine(room, bot, helpers);
    if (roll < 0.62) {
      const fake = pickMafiaBluffRole(room, bot, helpers);
      const pool = CITIZEN_BLUFF_ROLL_LINES[fake] || EVIL_CONFUSION_STIR_LINES;
      return pool[Math.floor(Math.random() * pool.length)];
    }
    return EVIL_CONFUSION_STIR_LINES[Math.floor(Math.random() * EVIL_CONFUSION_STIR_LINES.length)];
  }
  return pickMafiaBluffLine(room, bot, helpers);
}

/** 토론 중 주기적 선동·혼란 (스케줄·무응답 턴) */
function pickContinuousEvilBluff(room, bot, helpers) {
  const roll = Math.random();
  if (roll < 0.42) return pickEvilBluffLine(room, bot, helpers);
  if (roll < 0.78 && wantsMatgyeongAsk('맞경')) {
    return buildMatgyeongCounterClaim(room, bot, helpers);
  }
  if (roll < 0.78) {
    const fake = getBotFakeClaim(room, bot.id, helpers) || pickMafiaBluffRole(room, bot, helpers);
    const open = buildBluffOpenLine(fake, bot, room);
    if (open) return open;
  }
  return EVIL_CONFUSION_STIR_LINES[Math.floor(Math.random() * EVIL_CONFUSION_STIR_LINES.length)];
}

function wantsMatgyeongAsk(text) {
  if (!text) return false;
  const c = String(text).replace(/\s+/g, '');
  if (!MATGYEONG_ASK.test(c)) return false;
  return /있|없|누|누구|하나|나오|나왔|봐|보|ㅇㅇ|맞아|인가|인지|제발|좀/.test(c)
    || /맞경있/.test(c)
    || c.length <= 12;
}

/** 맞경 상대는 시민 쪽 경찰 주장자만 (스파이·마피아 동료 제외) */
function pickPoliceBluffRival(room, bot, helpers) {
  const reporters = scanPoliceReporters(room, helpers);
  for (const r of reporters) {
    if (r.id === bot.id) continue;
    const p = helpers.getPlayerById ? helpers.getPlayerById(room, r.id) : null;
    if (!p || !p.alive) continue;
    if (helpers.isMafiaTeam && helpers.isMafiaTeam(p.role)) continue;
    if (m42Cult.isCultMember(p)) continue;
    return r;
  }
  return reporters.find((r) => r.id !== bot.id) || null;
}

/** 이미 시민·군인 등 비경찰 직공으로 고정된 악역: 맞경·가짜 조결 대신 무직 입장 */
function pickPoliticianMafiaBluffVoteLine(room, bot, helpers) {
  if (getBotFakeClaim(room, bot.id, helpers) !== 'politician') return null;
  const alive = helpers.getAlivePlayers ? helpers.getAlivePlayers(room) : [];
  const foes = alive.filter(
    (p) => p && p.alive && p.id !== bot.id && p.nickname
      && !(helpers.isMafiaTeam && helpers.isMafiaTeam(p.role))
  );
  if (!foes.length) return null;
  const t = foes[Math.floor(Math.random() * foes.length)];
  const n = t.nickname;
  const lines = [
    `저는 정치인입니다. ${n}님 톤이 맢 같습니다. 2표로 같이 가죠.`,
    `정치인입니다. 면역이라 말은 직설적으로 하겠습니다. ${n}님 라인으로 표 모읍니다.`,
    `저는 정치인입니다. ${n}님부터 몰아야 판이 흔들립니다. 제 두 표는 ${n}님 쪽입니다.`,
    `정치인입니다. ${n}님 발언이 맢 흉내라 오늘은 ${n}님으로 투표 유도하겠습니다.`,
    `저는 정치인입니다. ${n}님 쪽으로 찍고 설득하겠습니다. 2표의 무게를 보여 드리죠.`
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

function pickMatgyeongCitizenConfusion(room, bot, helpers) {
  const lines = [
    '맞경이면 한쪽은 맢인데 저는 무직이라 조결은 못 냅니다. 채팅에 올라온 조결부터 보겠습니다.',
    '저는 시민 직공으로 밀고 있어서 경찰 조사는 못 합니다. 공개된 조결만 따르겠습니다.',
    '맞경 싸움은 경찰끼리 하시고 저는 직공한 역할만 유지하겠습니다. 조결 공유 부탁드립니다.',
    '저는 특수직 아니라고 말한 상태입니다. 가짜 조결로 끼어들 순 없습니다.',
    '맞경이면 조결부터인데 저는 경찰이 아니라 조결을 못 올립니다. 나온 팩트로 따라가겠습니다.'
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

function isLockedNonPoliceFakeClaim(room, botId, helpers) {
  const cur = getBotFakeClaim(room, botId, helpers);
  return !!(cur && cur !== 'police' && !['mafia', 'spy', 'cult_leader'].includes(cur));
}

/** 홀경 조결 이후 → 가짜 조결 + 맞경 진경·짭경 우김 */
function buildMatgyeongCounterClaim(room, bot, helpers) {
  if (isLockedNonPoliceFakeClaim(room, bot.id, helpers)) {
    return pickMatgyeongCitizenConfusion(room, bot, helpers);
  }
  if (!mayMafiaTeamBotBluffPolice(room, bot, helpers)) {
    return pickMatgyeongCitizenConfusion(room, bot, helpers);
  }

  const rival = pickPoliceBluffRival(room, bot, helpers);
  const selfName = bot.nickname || '저';
  const wantBicker = Math.random() < (rival ? 0.78 : 0.58);
  const wantReport = Math.random() < 0.86;

  const pieces = [];
  if (wantBicker) {
    pieces.push(rival ? pickPoliceVersusBicker(selfName, rival.nickname, true) : pickMatgyeongNoRivalBicker());
  }

  let report = null;
  if (wantReport) {
    if (rival) {
      report = buildFakePoliceReportLine(room, bot, helpers, { avoidName: rival.nickname });
      if (!report) {
        const alt = pickAliveNames(room, bot, helpers, 1)[0];
        if (alt) report = policeFmt.formatInnocentLine(alt);
      }
    } else {
      report = buildFakePoliceReportLine(room, bot, helpers);
    }
  }

  if (report && (pieces.length === 0 || Math.random() < 0.9)) {
    pieces.push(report);
  }

  if (pieces.length) return pieces.join(' ');

  if (rival) {
    const fake = buildFakePoliceReportLine(room, bot, helpers, { avoidName: rival.nickname });
    if (fake) return fake;
    const alt = pickAliveNames(room, bot, helpers, 1)[0];
    if (alt) return policeFmt.formatInnocentLine(alt);
  }

  return buildFakePoliceReportLine(room, bot, helpers);
}

function pickProactiveMafiaBluff(room, bot, helpers) {
  return pickEvilBluffLine(room, bot, helpers);
}

function reactToMatgyeongAsk(room, bot, isEvil, triggerText, helpers) {
  if (!isEvil || !wantsMatgyeongAsk(triggerText)) return null;
  if (isDay1Bluff(room)) {
    const rep = buildFakePoliceReportLine(room, bot, helpers);
    if (rep) return rep;
    if (isLockedNonPoliceFakeClaim(room, bot.id, helpers)) {
      return pickMatgyeongCitizenConfusion(room, bot, helpers);
    }
    return pickEvilBluffLine(room, bot, helpers);
  }
  if (Math.random() < 0.42) {
    const rival = pickPoliceBluffRival(room, bot, helpers);
    if (rival) return pickPoliceVersusBicker(bot.nickname, rival.nickname, true);
  }
  return buildMatgyeongCounterClaim(room, bot, helpers);
}

function reactToClaimBluff(room, bot, isEvil, triggerText, last, helpers) {
  const text = `${triggerText || ''} ${last && last.text ? last.text : ''}`;
  const compact = text.replace(/\s+/g, '');
  const reporters = scanPoliceReporters(room, helpers);
  const myFake = getBotFakeClaim(room, bot.id, helpers) || pickMafiaBluffRole(room, bot, helpers);
  const rl = (r) => roleLabel(r, helpers);

  if (!isEvil) {
    if (MAT_CHAT.test(compact) && /맞경|맞직/.test(compact)) {
      return '맞직이면 조결·취재부터 확인하겠습니다. 저는 시민입니다.';
    }
    return null;
  }

  const compactTrig = String(triggerText || '').replace(/\s+/g, '');
  if (/경조결|경찰조사|경찰조사결과|조결|경조|수사결과|조사결과/.test(compactTrig)) {
    const rep = buildFakePoliceReportLine(room, bot, helpers, {
      forceInnocent: true,
      preferClearMafiaAlly: true
    });
    if (rep) return rep;
    if (isLockedNonPoliceFakeClaim(room, bot.id, helpers)) {
      return pickMatgyeongCitizenConfusion(room, bot, helpers);
    }
    return pickEvilBluffLine(room, bot, helpers);
  }

  if (isDay1Bluff(room)) {
    const rep = buildFakePoliceReportLine(room, bot, helpers);
    if (rep) return rep;
    if (isLockedNonPoliceFakeClaim(room, bot.id, helpers)) {
      return pickMatgyeongCitizenConfusion(room, bot, helpers);
    }
    return pickEvilBluffLine(room, bot, helpers);
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
        if (role === 'police' && rivalName && Math.random() < 0.74) {
          return pickPoliceVersusBicker(bot.nickname, rivalName, true);
        }
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
    return pickEvilBluffLine(room, bot, helpers);
  }

  if (Math.random() < 0.72) {
    return pickEvilBluffLine(room, bot, helpers);
  }

  return null;
}

function wantsOpenClaim(text) {
  return JIKGONG_CHAT.test(String(text).replace(/\s+/g, ''));
}

function buildCitizenBluffRollCallAnswer(room, bot, helpers) {
  const pool = CITIZEN_BLUFF_ROLL_POOL;
  let fake = pickMafiaBluffRole(room, bot, helpers);
  if (bot.role === 'cult_leader' && (!fake || fake === 'mafia' || fake === 'spy' || fake === 'cult_leader')) {
    fake = pool[Math.floor(Math.random() * pool.length)];
    setBotFakeClaim(room, bot.id, fake, helpers);
  }
  if (!pool.includes(fake)) {
    fake = pool[Math.floor(Math.random() * pool.length)];
    setBotFakeClaim(room, bot.id, fake, helpers);
  }

  const open = buildBluffOpenLine(fake, bot, room);
  if (open) return open;
  const pick = CITIZEN_BLUFF_ROLL_LINES[fake] || CITIZEN_BLUFF_ROLL_LINES.citizen;
  return pick[Math.floor(Math.random() * pick.length)];
}

function buildMafiaRollCallAnswer(room, bot, helpers) {
  return buildCitizenBluffRollCallAnswer(room, bot, helpers);
}

function buildLlmBluffHint(brief, bot) {
  if (!brief.isEvilBluff) return '';
  const teukjikHint = '시민 위장 시 "일반 시민 외 특수직은 직공 못 한다", "무직 시민" 사용. 의사 위장 시 "의사는 특수직"이라고 말할 것.';
  if (isCultSideBluff(bot)) {
    return [
      '교주·신도·포교·종소리·교주팀 절대 노출 금지.',
      '낮 공개 채팅은 마피아팀과 같이 적극 블러핑: 거짓 직공, 가짜 조결, 맞경·쓰리경 선동, 짭경 몰기.',
      '시민팀 직업(경찰·군인·기자·영매·정치인·시민)으로 헷갈리게. 중복 직공 허용.',
      teukjikHint,
      '매 턴 시민처럼 말하되 팩트를 흐리게 하고 의심을 다른 사람에게 돌릴 것.'
    ].join(' ');
  }
  if ((brief.dayIndex || 0) <= 1) {
    return `낮 1 경찰 연기: "○○님 조사했는데 마피아 아닙니다"처럼 짧고 자연스럽게. "수사 결과입니다" 같은 시스템 멘트 금지. 홀경·늦경·맞경 선동. ${teukjikHint} 마피아·밤챗·접선 노출 금지. 계속 블러핑.`;
  }
  return `경조결·맞경·직공마다 적극 블러핑. 가짜 조결·맞경 선동·짭경 몰기. ${teukjikHint} 위장 정치인이면 "정치인입니다"를 밝힌 뒤 맢 흉내로 특정 생존자에게 표를 모으되 진짜 직업 단정은 피할 것. "수사 결과입니다" 형식 금지. 마피아·밤챗·접선 노출 금지. 시민을 계속 헷갈리게. 맞경이면 상대 경찰 주장자 이름을 부르며 "진경은 나", "너 짭경", "조결 왜 다르냐"처럼 서로 우기는 대사를 자주 섞을 것. 한번 정한 위장 직공(경찰·시민 등)은 죽을 때까지 바꾸지 말 것. 마피아팀 봇이 둘 이상이면 한 명만 경찰·가짜 조결을 맡고 동료 봇은 무직·특직 비공개(직공 메타)로 가르칠 것.`;
}

module.exports = {
  isEvilBluffBot,
  isCultSideBluff,
  scanRoleClaims,
  scanPoliceReporters,
  pickMafiaBluffRole,
  buildBluffOpenLine,
  buildFakePoliceReportLine,
  buildPoliceStyleBluffLine,
  pickMafiaBluffLine,
  pickEvilBluffLine,
  pickContinuousEvilBluff,
  pickPoliceBluffRival,
  buildMatgyeongCounterClaim,
  pickPoliceVersusBicker,
  pickMatgyeongNoRivalBicker,
  pickMatgyeongCitizenConfusion,
  pickPoliticianMafiaBluffVoteLine,
  getBotFakeClaim,
  mayMafiaTeamBotBluffPolice,
  getAliveMafiaTeamBotPlayers,
  pickProactiveMafiaBluff,
  reactToClaimBluff,
  reactToMatgyeongAsk,
  wantsMatgyeongAsk,
  buildMafiaRollCallAnswer,
  buildCitizenBluffRollCallAnswer,
  buildLlmBluffHint,
  EVIL_CONFUSION_STIR_LINES,
  MAT_CHAT,
  JIKGONG_CHAT
};
