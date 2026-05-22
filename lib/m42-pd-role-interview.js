/**
 * 진경 사망 후 생존 사립탐정 — 생존 봇에게 직업 질문·티키타카·홀직/맞직 확직(UI).
 */
const m42Pd = require('./m42-private-detective');

function bluff() {
  return require('./m42-bluff');
}
function matclaim() {
  return require('./m42-matclaim-playbook');
}
const { agentLog } = require('./debug-agent-log');

const MAX_DAY_INDEX = 4;
const MIN_DAY_INDEX = 2;
const MAX_TARGETS_PER_DAY = 4;

const INTERVIEW_ROLES = ['soldier', 'doctor', 'reporter', 'medium', 'politician'];

const ROLE_KO = {
  soldier: '군인',
  doctor: '의사',
  reporter: '기자',
  medium: '영매',
  politician: '정치인',
  citizen: '시민',
  private_detective: '사립탐정'
};

const HOL_TAG = {
  soldier: '홀군',
  doctor: '홀의',
  reporter: '홀기',
  medium: '홀영',
  politician: '홀정'
};

const MAT_TAG = {
  soldier: '맞군',
  doctor: '맞의',
  reporter: '맞기',
  medium: '맞영'
};

const PD_ROLE_QUESTION_RE =
  /직업이\s*어떻게|직업이\s*무엇|무슨\s*직업|직업\s*말씀|직업\s*공개|직업\s*알려|직업\s*뭐/;

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isRealPoliceAlive(room, helpers) {
  const alive = helpers.getAlivePlayers
    ? helpers.getAlivePlayers(room)
    : Object.values(room.players || {}).filter((p) => p && p.alive);
  return alive.some((p) => p.role === 'police');
}

function getAlivePd(room) {
  return Object.values(room.players || {}).find(
    (p) => p && p.alive && p.role === 'private_detective'
  ) || null;
}

function canRunPdRoleInterview(room, helpers) {
  if (!room?.game || !helpers) return false;
  const dayIdx = room.game.dayIndex || 0;
  if (dayIdx < MIN_DAY_INDEX || dayIdx > MAX_DAY_INDEX) return false;
  if (isRealPoliceAlive(room, helpers)) return false;
  const pd = getAlivePd(room);
  if (!pd) return false;
  const bots = Object.values(room.players || {}).filter((p) => p && p.alive && p.isBot);
  return bots.length >= 2;
}

function ensureInterviewState(room) {
  if (!room.game) return null;
  if (!room.game.pdInterviewSlots) {
    room.game.pdInterviewSlots = { confirmed: {}, matched: {} };
  }
  if (!room.game.pdRoleInterview) {
    room.game.pdRoleInterview = {
      dayIndex: room.game.dayIndex || 0,
      claims: {},
      concluded: {}
    };
  }
  return room.game.pdRoleInterview;
}

function recordClaim(room, playerId, role) {
  if (!playerId || !role) return;
  const st = ensureInterviewState(room);
  if (!st) return;
  st.claims[playerId] = role;
}

function textMentionsPlayer(text, nickname) {
  if (!text || !nickname) return false;
  return String(text).includes(nickname);
}

function isPdRoleQuestionText(text) {
  return PD_ROLE_QUESTION_RE.test(String(text || '').replace(/\s+/g, ''))
    || PD_ROLE_QUESTION_RE.test(String(text || ''));
}

function pickPdRoleQuestion(pd, target) {
  const name = target?.nickname || '그분';
  return pick([
    `${name}님, 직업이 어떻게 되시죠?`,
    `${name}님 직업 말씀해 주십시오. 맞직 여부도 같이 보겠습니다.`,
    `${name}님, 오늘은 ${name}님 직업부터 확인하겠습니다. 어떤 직업이십니까?`,
    `${name}님, 경찰이 없으니 ${name}님 직업 공개 부탁드립니다.`
  ]);
}

function resolveBotClaimRole(room, bot, helpers) {
  if (!bot) return 'citizen';
  if (bluff().retainsRealRolePublicIdentity(bot)) {
    if (INTERVIEW_ROLES.includes(bot.role)) return bot.role;
    if (bot.role === 'private_detective') return 'private_detective';
    return 'citizen';
  }
  if (bluff().isEvilBluffBot(bot, helpers)) {
    const fc = bluff().getBotFakeClaim(room, bot.id, helpers);
    if (fc && INTERVIEW_ROLES.includes(fc)) return fc;
    if (fc === 'police') return 'citizen';
    return fc || 'citizen';
  }
  if (bot.role === 'citizen' || bot.role === 'politician') return bot.role;
  return bot.role || 'citizen';
}

function buildClaimAnswerText(room, bot, claimedRole, helpers) {
  const self = bot.nickname || '저';
  const matTag = MAT_TAG[claimedRole];
  const ko = ROLE_KO[claimedRole] || '시민';

  if (claimedRole === 'citizen') {
    return pick([
      '일반 시민입니다. 특수직은 아닙니다.',
      '저는 무직 시민입니다. 맞직은 없습니다.',
      '시민입니다. 경찰·의사 같은 특수직은 아닙니다.'
    ]);
  }

  if (claimedRole === 'politician') {
    return pick([
      '저는 정치인입니다. 낮 투표 2표입니다. 다른 정치인 있으신가요?',
      '정치인입니다. 맞정 있으면 말씀해 주세요.',
      `${self} 정치인입니다. 투표로 확인해 주십시오.`
    ]);
  }

  if (claimedRole === 'private_detective') {
    return pick([
      '사립탐정입니다. 밤 관찰만 합니다.',
      '저는 사립탐정입니다. 다른 사탐은 없을 겁니다.'
    ]);
  }

  if (matTag) {
    const conflicts = matclaim().scanMatClaimConflicts(room, helpers);
    const conflict = conflicts.find((c) => c.role === claimedRole);
    const rivals = (conflict?.claimants || []).filter((c) => c.id !== bot.id);
    if (rivals.length) {
      const rivalName = rivals[0].nickname;
      const line = bluff().buildRoleMatgyeongClaim(room, bot, helpers, claimedRole);
      if (line) return line;
      return `${ko}입니다. ${rivalName}님이 ${matTag}로 나와서 조결·팩트부터 맞춰 봅시다.`;
    }
    return pick([
      `${ko}입니다. 혹시 ${matTag} 있으신가요?`,
      `저는 ${ko}입니다. ${matTag} 나오면 말씀해 주십시오.`,
      `${self} ${ko}입니다. 다른 ${ko} 주장 있으면 ${matTag}입니다.`
    ]);
  }

  return `${ko}입니다.`;
}

function pickBotRoleClaimAnswer(room, bot, pd, helpers) {
  const claimedRole = resolveBotClaimRole(room, bot, helpers);
  const text = buildClaimAnswerText(room, bot, claimedRole, helpers);
  recordClaim(room, bot.id, claimedRole);
  return { text, claimedRole };
}

function listRoleClaimants(room, role, helpers) {
  const ids = new Set();
  const st = room.game?.pdRoleInterview;
  if (st?.claims) {
    for (const [id, r] of Object.entries(st.claims)) {
      if (r === role) ids.add(id);
    }
  }
  for (const p of Object.values(room.players || {})) {
    if (!p?.id) continue;
    const roles = matclaim().getPlayerClaimedRoles(room, p.id);
    if (roles.includes(role)) ids.add(p.id);
  }
  const claims = bluff().scanRoleClaims(room, helpers);
  for (const c of claims[role] || []) {
    if (c?.id) ids.add(c.id);
  }
  return [...ids]
    .map((id) => (helpers.getPlayerById ? helpers.getPlayerById(room, id) : null))
    .filter((p) => p && p.alive);
}

function applyHolConfirm(room, targetId, role) {
  const slots = room.game.pdInterviewSlots;
  if (!slots) return;
  delete slots.matched[targetId];
  slots.confirmed[targetId] = role;
  const st = ensureInterviewState(room);
  if (st) st.concluded[targetId] = { kind: 'hol', role };
}

function applyMatConfirm(room, role, claimantIds) {
  const slots = room.game.pdInterviewSlots;
  if (!slots) return;
  for (const id of claimantIds) {
    delete slots.confirmed[id];
    slots.matched[id] = role;
  }
  const st = ensureInterviewState(room);
  if (st) {
    for (const id of claimantIds) {
      st.concluded[id] = { kind: 'mat', role };
    }
  }
}

function pickPdHolConclusion(pd, target, role) {
  const name = target.nickname;
  const tag = HOL_TAG[role] || ROLE_KO[role] || '홀직';
  return pick([
    `${name}님 말씀대로 ${tag}이 없습니다. ${name}님은 ${tag}으로 간주하겠습니다.`,
    `다른 ${ROLE_KO[role] || '특수직'} 주장이 없어 ${name}님을 ${tag}으로 확정하겠습니다.`,
    `${name}님, ${MAT_TAG[role] || '맞직'}이 안 나와서 ${name}님은 ${tag}입니다. 시민은 이 라인을 기준으로 보시죠.`
  ]);
}

function pickPdMatConclusion(pd, role, claimants) {
  const tag = MAT_TAG[role] || '맞직';
  const names = claimants.map((p) => p.nickname).join('·');
  return pick([
    `${names} ${tag}입니다. 한쪽은 반드시 거짓입니다. ${tag}끼리 조결·팩트로 가리겠습니다.`,
    `${tag} ${names} — 시민은 두 분 조결·행동을 비교해 짭${ROLE_KO[role] || '직'}부터 처형합시다.`,
    `${names}님이 ${tag}로 겹칩니다. 제가 ${tag} 정리부터 하겠습니다. 거짓 쪽에 표를 모읍시다.`
  ]);
}

function pickEvilMatCounterClaimLine(room, bot, role, helpers, rivalName) {
  const line = bluff().buildRoleMatgyeongClaim(room, bot, helpers, role);
  if (line) return line;
  const ko = ROLE_KO[role] || '특수직';
  const mat = MAT_TAG[role] || '맞직';
  return pick([
    `저도 ${ko}입니다. ${rivalName}님 ${mat} 맞으면 조결부터 맞춰 봅시다.`,
    `${ko}입니다. ${rivalName}님 말고 저 ${bot.nickname}도 ${ko} 주장합니다.`,
    `잠깐, ${mat}입니다. ${rivalName}님 말씀 들었는데 저도 ${ko}입니다.`
  ]);
}

function pickMatBickerLine(room, speaker, rival, role, helpers) {
  if (bluff().isEvilBluffBot(speaker, helpers)) {
    const line = bluff().buildRoleMatgyeongClaim(room, speaker, helpers, role);
    if (line) return line;
    return matclaim().pickMatClaimTikiTakaLine(room, speaker, helpers, { role, round: 1 });
  }
  if (speaker.role === role) {
    return matclaim().pickMatClaimTikiTakaLine(room, speaker, helpers, { role, round: 1 })
      || `${rival.nickname}님, ${MAT_TAG[role] || '맞직'}이면 조결·방탄·성불 팩트부터 맞춰 봅시다.`;
  }
  return matclaim().pickMatClaimSuspectLine(room, speaker, helpers, { role });
}

function maybePickEvilCounterClaimant(room, role, excludeId, helpers) {
  const candidates = Object.values(room.players || {}).filter((p) => {
    if (!p?.alive || !p.isBot || p.id === excludeId) return false;
    if (!bluff().isEvilBluffBot(p, helpers)) return false;
    const fc = bluff().getBotFakeClaim(room, p.id, helpers);
    if (fc === role) return true;
    if (!INTERVIEW_ROLES.includes(role)) return false;
    if (p.role === 'mafia' || p.role === 'spy') return Math.random() < 0.55;
    if (p.joinedCult) return Math.random() < 0.45;
    return false;
  });
  if (!candidates.length) return null;
  return pick(candidates);
}

function mergePdInterviewIntoSlots(confirmedById, matchedById, room, helpers) {
  if (!room?.game?.pdInterviewSlots || isRealPoliceAlive(room, helpers)) return;
  if (!getAlivePd(room)) return;
  const slots = room.game.pdInterviewSlots;
  Object.assign(confirmedById, slots.confirmed || {});
  Object.assign(matchedById, slots.matched || {});
}

function getInterviewTargets(room, pd, helpers) {
  const alive = helpers.getAlivePlayers
    ? helpers.getAlivePlayers(room)
    : Object.values(room.players || {}).filter((p) => p && p.alive);
  const pool = alive.filter((p) => p.id !== pd.id && p.isBot);
  return shuffle(pool).slice(0, MAX_TARGETS_PER_DAY);
}

function scheduleMatBickerBetween(room, pdBot, role, claimants, helpers, scheduleRoomTask, postBotDayMessage) {
  if (claimants.length < 2) return;
  const a = claimants[0];
  const b = claimants[1];
  const rounds = [
    { who: a, rival: b, ms: 0 },
    { who: b, rival: a, ms: 1600 },
    { who: a, rival: b, ms: 3200 }
  ];
  rounds.forEach((r) => {
    scheduleRoomTask(room, () => {
      if (room.phase !== 'day_chat' || !r.who.alive || !r.rival.alive) return;
      const line = pickMatBickerLine(room, r.who, r.rival, role, helpers);
      if (line) {
        postBotDayMessage(room, r.who, line, {
          pdRoleInterviewBicker: true,
          matClaimTikiTaka: true
        });
      }
    }, r.ms);
  });
}

function runInterviewTurn(room, pdBot, target, baseMs, helpers, scheduleRoomTask, postBotDayMessage, broadcastStateNow) {
  scheduleRoomTask(room, () => {
    if (room.phase !== 'day_chat' || !pdBot.alive || !target.alive || isRealPoliceAlive(room, helpers)) {
      return;
    }
    postBotDayMessage(room, pdBot, pickPdRoleQuestion(pdBot, target), { pdRoleInterview: true });
  }, baseMs);

  scheduleRoomTask(room, () => {
    if (room.phase !== 'day_chat' || !target.alive || !pdBot.alive) return;
    const pack = pickBotRoleClaimAnswer(room, target, pdBot, helpers);
    if (pack.text) {
      postBotDayMessage(room, target, pack.text, { pdRoleInterviewAnswer: true });
    }
  }, baseMs + 1300);

  scheduleRoomTask(room, () => {
    if (room.phase !== 'day_chat' || !pdBot.alive) return;
    const role =
      room.game?.pdRoleInterview?.claims?.[target.id]
      || resolveBotClaimRole(room, target, helpers);
    let claimants = listRoleClaimants(room, role, helpers);
    if (claimants.length < 2 && INTERVIEW_ROLES.includes(role)) {
      const evil = maybePickEvilCounterClaimant(room, role, target.id, helpers);
      if (evil) {
        const line = pickEvilMatCounterClaimLine(room, evil, role, helpers, target.nickname);
        recordClaim(room, evil.id, role);
        postBotDayMessage(room, evil, line, {
          pdRoleInterviewCounter: true,
          matClaimTikiTaka: true,
          mafiaFakePolice: bluff().mayMafiaTeamBotBluffPolice(room, evil, helpers)
        });
        claimants = listRoleClaimants(room, role, helpers);
      }
    }

    if (claimants.length >= 2) {
      applyMatConfirm(room, role, claimants.map((p) => p.id));
      postBotDayMessage(room, pdBot, pickPdMatConclusion(pdBot, role, claimants), {
        pdRoleInterviewConclude: true
      });
      scheduleMatBickerBetween(room, pdBot, role, claimants.slice(0, 2), helpers, scheduleRoomTask, postBotDayMessage);
    } else if (claimants.length === 1 && HOL_TAG[role]) {
      applyHolConfirm(room, target.id, role);
      postBotDayMessage(room, pdBot, pickPdHolConclusion(pdBot, target, role), {
        pdRoleInterviewConclude: true
      });
    } else {
      postBotDayMessage(
        room,
        pdBot,
        `${target.nickname}님 ${ROLE_KO[role] || '시민'} 주장은 일단 메모했습니다. 추가 주장 있으면 말씀해 주십시오.`,
        { pdRoleInterviewConclude: true }
      );
    }

    if (broadcastStateNow) broadcastStateNow(room);

    agentLog({
      hypothesisId: 'H_pd_interview_turn',
      location: 'm42-pd-role-interview.js:runInterviewTurn',
      message: 'pd interview turn done',
      runId: 'pd-role-interview',
      data: {
        target: target.nickname,
        role,
        claimantCount: claimants.length,
        hol: !!(room.game?.pdInterviewSlots?.confirmed[target.id]),
        mat: !!(room.game?.pdInterviewSlots?.matched[target.id])
      }
    });
  }, baseMs + 4000);
}

function schedulePrivateDetectiveRoleInterviewWaves(room, helpers, deps) {
  const { scheduleRoomTask, postBotDayMessage, broadcastStateNow, hasBots, isRealPoliceAliveFn } = deps;
  if (!hasBots(room) || isRealPoliceAliveFn(room)) return;
  if (!canRunPdRoleInterview(room, helpers)) return;

  const pdBot = Object.values(room.players || {}).find(
    (p) => p && p.alive && p.isBot && p.role === 'private_detective'
  );
  if (!pdBot) return;

  const waveKey = `pd_iv_d${room.game.dayIndex || 0}`;
  if (!room._pdRoleInterviewWave) room._pdRoleInterviewWave = {};
  if (room._pdRoleInterviewWave[waveKey]) return;
  room._pdRoleInterviewWave[waveKey] = true;

  ensureInterviewState(room);
  const targets = getInterviewTargets(room, pdBot, helpers);
  if (!targets.length) return;

  const intro = pick([
    '확정 경찰이 없습니다. 오늘은 생존자 직업부터 질문하고, 홀직·맞직을 나누겠습니다.',
    '경찰이 없으니 제가 직업 질문으로 홀군·맞군·홀의부터 정리하겠습니다. 솔직히 답해 주십시오.',
    '사립탐정으로서 직업 확인부터 하겠습니다. 맞직 나오면 조결·팩트로 가리겠습니다.'
  ]);

  scheduleRoomTask(room, () => {
    if (room.phase !== 'day_chat' || !pdBot.alive || isRealPoliceAliveFn(room)) return;
    postBotDayMessage(room, pdBot, intro, { pdRoleInterview: true });
  }, 15200);

  const gap = 13500;
  targets.forEach((target, i) => {
    runInterviewTurn(
      room,
      pdBot,
      target,
      16800 + i * gap,
      helpers,
      scheduleRoomTask,
      postBotDayMessage,
      broadcastStateNow
    );
  });

  agentLog({
    hypothesisId: 'H_pd_interview_sched',
    location: 'm42-pd-role-interview.js:schedulePrivateDetectiveRoleInterviewWaves',
    message: 'pd role interview waves scheduled',
    runId: 'pd-role-interview',
    data: {
      pd: pdBot.nickname,
      dayIndex: room.game.dayIndex,
      targetCount: targets.length,
      targets: targets.map((t) => t.nickname)
    }
  });
}

module.exports = {
  canRunPdRoleInterview,
  isPdRoleQuestionText,
  textMentionsPlayer,
  pickBotRoleClaimAnswer,
  pickPdInterviewReactiveAnswer: (room, bot, helpers, last) => {
    if (!last?.text || last.fromId === bot.id) return null;
    if (!isPdRoleQuestionText(last.text)) return null;
    const pd = helpers.getPlayerById ? helpers.getPlayerById(room, last.fromId) : null;
    if (!pd || pd.role !== 'private_detective' || !pd.alive) return null;
    if (!textMentionsPlayer(last.text, bot.nickname)) return null;
    if (!canRunPdRoleInterview(room, helpers)) return null;
    const pack = pickBotRoleClaimAnswer(room, bot, pd, helpers);
    return pack?.text || null;
  },
  recordClaim,
  listRoleClaimants,
  mergePdInterviewIntoSlots,
  schedulePrivateDetectiveRoleInterviewWaves,
  ROLE_KO,
  HOL_TAG,
  MAT_TAG
};
