/**
 * 마피아42 클래식 룰 지식 (나무위키 기반, 교주·듀얼카드 제외).
 * 봇 대화·투표·밤 판단의 공통 컨텍스트.
 */

const glossary = require('./m42-glossary');
const m42Bluff = require('./m42-bluff');
const voteFacts = require('./bot-vote-facts');

const PHASE_FLOW = [
  '밤(능력) → 아침 공지 → 낮 토론(생존자×15초) → 투표(15초) → 최후의 반론 → 찬반(미투표=반대) → 밤'
];

const WIN_RULES = {
  citizens: '마피아팀 전멸 시 시민 승리',
  mafia: '마피아 생존 ≥ 시민 생존 시 마피아 승리',
  timer: '10번째 밤까지 미종료 시 마피아 승리'
};

/** 이 프로젝트에 존재하는 직업만 */
const ROLE_INTEL = {
  mafia: {
    team: 'mafia',
    night: '밤에 생존자 1명 처형. 마피아끼리 밤챗으로 표 맞출 것.',
    day: '낮 내내 시민 연기+적극 블러핑. 홀경·맞경·짭경 선동, "저는 ○○입니다" 거짓 직공, 가짜 조결. 경찰 2명 주장 유도 후 짭경 몰기. 밤챗·마피아 노출 금지.',
    claim: ['시민', '군인', '의사'],
    counters: ['police', 'doctor', 'reporter'],
    slang: ['밤챗', '맢표', '맢킬', '물총', '자투', '짝맢', '홀맢', '퍼블']
  },
  spy: {
    team: 'mafia',
    night: '밤에 직업 조사. 마피아면 접선 후 밤챗 합류.',
    day: '낮 공개 채팅은 무직 시민 연기. 접선·밤챗·스파이 노출 금지. 맞경 선동은 시민처럼만(직접 스파이 언급 금지).',
    claim: ['시민', '경찰'],
    counters: ['police'],
    slang: ['접선', '조사', '슾', '밤챗', '첫접', '긁슾']
  },
  police: {
    team: 'citizen',
    night: '밤에 1명 수사(마피아 여부). 결과는 본인만 앎.',
    day: '「조결」「경찰조사」 요청 시 실제 수사한 대상만 공개. 퍼경·연퍼 주의.',
    claim: ['경찰'],
    counters: ['mafia', 'spy'],
    slang: ['조결', '홀경', '퍼경', '경조', '경크', '노맢', '늦경', '눈치경']
  },
  doctor: {
    team: 'citizen',
    night: '밤에 1명 치료(자힐 가능). 조밤이면 치료 성공·은폐·물총 가능.',
    day: '눈힐(직공 없이 치료). 의사라고 말하지 않음. 경찰 직공·조결이 나오면 그 추리를 따라가고 경찰 보호 우선.',
    claim: [],
    counters: [],
    slang: ['힐', '눈힐', '자힐', '타힐', '조밤', '물총']
  },
  soldier: {
    team: 'citizen',
    night: '패시브 방탄 1회. 능력 선택 없음.',
    day: '스파이 조사 시 군인으로 들킬 수 있음. 확군으로 신뢰 받기 쉬움.',
    claim: ['군인', '홀군'],
    counters: [],
    slang: ['방탄', '확군']
  },
  politician: {
    team: 'citizen',
    night: '밤 행동 없음.',
    day: '낮 투표 2표. 찬반 처형 면역. 억울하면 면역 강조.',
    claim: ['정치인'],
    counters: [],
    slang: ['2표', '면역']
  },
  medium: {
    team: 'citizen',
    night: '밤에 사망자 성불(직업 확인).',
    day: '사망자 채팅 단서 활용. 성불 정보는 신중히 공개.',
    claim: ['영매'],
    counters: [],
    slang: ['성불', '사망챗']
  },
  reporter: {
    team: 'citizen',
    night: '2번째 밤부터 취재(직업). 다음 날 아침 전원 공표.',
    day: '1밤엔 취재 불가. 취재 결과는 팩트로만.',
    claim: ['기자', '홀기'],
    counters: [],
    slang: ['취재', '기사']
  },
  graverobber: {
    team: 'citizen',
    night: '첫 밤 첫 사망자 직업 계승(자동).',
    day: '계승 직업에 맞는 톤. 초반엔 무직처럼 보일 수 있음.',
    claim: [],
    counters: [],
    slang: ['도굴', '계승']
  },
  citizen: {
    team: 'citizen',
    night: '없음',
    day: '정보 공유·투표. 맞직·확직 구분.',
    claim: ['시민'],
    counters: [],
    slang: ['홀시', '맞직', '확직']
  }
};

const DAWN_HINTS = [
  { pattern: /조용|사망자는 없/, line: '조밤입니다. 은폐·물총·치료 성공일 수 있습니다.' },
  { pattern: /사망/, line: '밤에 사망이 있었습니다. 퍼블·연퍼 여부부터 보겠습니다.' },
  { pattern: /기자/, line: '기자 취재가 나왔으면 그 정보부터 정리하겠습니다.' }
];

const OPEN_BY_PHASE = {
  day_chat_early: [
    (b) => `${b.dayIndex}일차입니다. ${b.dawnLine || '어젯밤 정리부터 하겠습니다.'}`,
    (b) => `남은 토론 ${b.debateHint}. 직공·조결이 필요하면 말씀해 주십시오.`
  ],
  day_chat_mid: [
    (b) => '조결·취재 팩트가 있으면 그때 지목하겠습니다. 무근거 몰표는 위험합니다.',
    (b) => `투표 전에 ${b.topSuspect}님 발언을 더 들어봐야 할 것 같습니다. (근거 확인 후)`
  ],
  day_vote: [
    () => '이제 투표입니다. 몰표보다 근거 있는 지목이 낫습니다.',
    () => '딱히 없으면 자투로 넘기는 것도 방법입니다.'
  ]
};

function getRoleIntel(role) {
  return ROLE_INTEL[role] || ROLE_INTEL.citizen;
}

function isQuietDawn(announcements) {
  if (!announcements || !announcements.length) return false;
  return announcements.some((a) => /조용|사망자는 없/.test(a));
}

function pickDawnLine(announcements) {
  if (!announcements || !announcements.length) return '';
  const text = announcements.join(' ');
  for (const h of DAWN_HINTS) {
    if (h.pattern.test(text)) return h.line;
  }
  return announcements[announcements.length - 1];
}

function buildSituationBrief(room, bot, ctx, helpers) {
  const g = room.game || {};
  const alive = helpers.getAlivePlayers ? helpers.getAlivePlayers(room) : [];
  const aliveMafia = alive.filter((p) => helpers.isMafiaTeam && helpers.isMafiaTeam(p.role));
  const aliveCitizen = alive.filter((p) => !helpers.isMafiaTeam || !helpers.isMafiaTeam(p.role));

  const scores = helpers.buildSuspicionScores ? helpers.buildSuspicionScores(room, bot) : {};
  let topSuspect = '누군가';
  let topScore = -1;
  for (const p of alive) {
    if (p.id === bot.id) continue;
    const s = scores[p.id] || 0;
    if (s > topScore) {
      topScore = s;
      topSuspect = p.nickname;
    }
  }

  const mind = helpers.getBotMind ? helpers.getBotMind(room, bot.id) : { knownRoles: {} };
  const knownMafia = [];
  const knownCitizen = [];
  for (const [id, role] of Object.entries(mind.knownRoles || {})) {
    const p = helpers.getPlayerById ? helpers.getPlayerById(room, id) : null;
    if (!p || !p.alive) continue;
    const isPublic = voteFacts.isRolePublicForBot
      ? voteFacts.isRolePublicForBot(room, bot, id, role, helpers)
      : false;
    if (!isPublic) continue;
    if (helpers.isMafiaRole && helpers.isMafiaRole(role)) knownMafia.push(p.nickname);
    else knownCitizen.push(`${p.nickname}(${helpers.ROLE_LABELS?.[role] || role})`);
  }

  const intel = getRoleIntel(bot.role);
  const phase = room.phase || 'day_chat';
  const debateHint = `생존 ${alive.length}명×15초 규칙`;
  const deadPlayers = Object.values(room.players || {})
    .filter((p) => !p.alive && p.nickname)
    .map((p) => p.nickname);

  return {
    phase,
    dayIndex: g.dayIndex || 0,
    nightIndex: g.nightIndex || 0,
    aliveCount: alive.length,
    mafiaCount: aliveMafia.length,
    citizenCount: aliveCitizen.length,
    topSuspect,
    topScore,
    dawnLine: pickDawnLine(g.dawnAnnouncements),
    quietNight: isQuietDawn(g.dawnAnnouncements),
    intel,
    team: intel.team,
    knownMafia,
    knownCitizen,
    joinedMafiaChat: !!bot.joinedMafiaChat,
    triggerText: ctx.triggerText || '',
    debateHint,
    isMafia: intel.team === 'mafia',
    nightReport: ctx.nightReport || null,
    deadPlayers,
    roleSlangHint: glossary.getRoleSlangHint(bot.role),
    matchedGlossary: glossary.buildMatchedGlossaryForPrompt(ctx.triggerText || '', bot.role),
    fakeClaim: helpers.getBotFakeClaim ? helpers.getBotFakeClaim(room, bot.id) : null
  };
}

function pickOpenLine(brief) {
  if (brief.phase === 'day_vote') {
    const pool = OPEN_BY_PHASE.day_vote;
    return pool[Math.floor(Math.random() * pool.length)]();
  }
  if (brief.dayIndex <= 1) {
    const pool = OPEN_BY_PHASE.day_chat_early;
    return pool[Math.floor(Math.random() * pool.length)](brief);
  }
  const pool = OPEN_BY_PHASE.day_chat_mid;
  return pool[Math.floor(Math.random() * pool.length)](brief);
}

function pickRoleAwareLine(brief, bot, targetName, speaker, room, helpers) {
  const { intel, isMafia, knownMafia } = brief;
  const role = bot.role;

  if (role === 'police' && brief.triggerText && /조결|경찰/.test(brief.triggerText)) {
    return '수사한 사람만 말씀드리겠습니다. 조결은 허위 없이 공개합니다.';
  }

  if (role === 'politician') {
    if (/투표|처형/.test(brief.triggerText || '')) {
      return '저는 낮 투표 2표이고 찬반 처형은 면역입니다. 근거 보고 결정해 주세요.';
    }
  }

  if (role === 'reporter' && brief.nightIndex < 2) {
    return '아직 2밤 전이라 취재는 불가합니다. 그 전까지는 추리로 가겠습니다.';
  }

  if (role === 'doctor' && /힐|치료|의사/.test(brief.triggerText || '')) {
    return '힐 여부는 말하지 않겠습니다. 눈힐이 낫고, 다른 분 추리·조결을 따르겠습니다.';
  }
  if (role === 'doctor' && /경찰|홀경|조결/.test(brief.triggerText || '')) {
    return '경찰이 드러났으면 조결을 기준으로 가겠습니다. 저는 시민으로만 말하겠습니다.';
  }

  if (role === 'medium' && /성불|영매|사망/.test(brief.triggerText || '')) {
    return '영매입니다. 밤에 성불하고 사망자 채팅도 봅니다.';
  }

  if (role === 'soldier' && /군인|방탄/.test(brief.triggerText || '')) {
    return '저는 군인입니다. 방탄은 한 번뿐입니다.';
  }

  if (role === 'spy') {
    const lines = [
      `저는 시민입니다. ${targetName}님 발언부터 듣고 조결·취재를 기다리겠습니다.`,
      '아직 공개된 조사·취재가 없어 팩트부터 모으겠습니다. 저는 무직 시민입니다.',
      '저는 특수직이 아닙니다. 경찰·기자 결과가 나오면 그걸로 가겠습니다.'
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  if (isMafia && knownMafia.includes(targetName)) {
    return `${speaker ? `${speaker}님, ` : ''}${targetName}님 말은 일단 넘어가고 다른 쪽을 보겠습니다.`;
  }

  if (isMafia && room && helpers) {
    if (Math.random() < 0.55) {
      return m42Bluff.pickProactiveMafiaBluff(room, bot, helpers);
    }
    if (brief.quietNight) {
      return '조밤입니다. 홀경·맞경부터 정리하겠습니다. 저는 시민입니다.';
    }
    return '맞직 나오면 조결부터 보겠습니다. 저는 무직 시민입니다.';
  }

  if (intel.team === 'citizen' && brief.knownMafia.length) {
    return `확인된 정보상 ${brief.knownMafia[0]}님 쪽이 마피아로 보입니다.`;
  }

  if (brief.quietNight && !isMafia) {
    return '조밤이었습니다. 은폐·물총·치료 가능성부터 정리한 뒤, 근거 있는 지목을 하겠습니다.';
  }

  return null;
}

function suggestLastWords(brief, bot) {
  const name = bot.nickname;
  if (bot.role === 'politician') {
    return '저 정치인입니다. 찬반에서 처형 안 됩니다. 다른 사람 보세요.';
  }
  if (bot.role === 'police') {
    return '저는 경찰입니다. 조결은 수사한 사람만 말할 수 있습니다. 저를 죽이면 시민에게 손해입니다.';
  }
  if (brief.isMafia) {
    const lines = [
      '저는 진짜 시민입니다. 투갈이 나오면 마피아에게 이득입니다.',
      `${name}이 아니라 다른 사람을 보십시오. 몰표에 주의하십시오.`,
      '억울합니다. 자투로 넘기겠습니다.'
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }
  return `억울합니다. ${brief.topSuspect}님 쪽이 더 수상한데 왜 저입니까?`;
}

/** @returns {'yes'|'no'} */
function suggestExecutionVote(brief, bot, candidate, helpers = {}) {
  if (!candidate || !candidate.alive) return 'no';
  if (candidate.role === 'politician') {
    return brief.isMafia ? 'yes' : 'no';
  }
  const candMafia = helpers.isMafiaTeam && helpers.isMafiaTeam(candidate.role);
  if (brief.isMafia) {
    if (candMafia || brief.knownMafia.includes(candidate.nickname)) return 'no';
    return 'yes';
  }
  if (brief.knownMafia.includes(candidate.nickname) || candMafia) return 'yes';
  return 'no';
}

function buildLlmSystemPrompt(provider = 'openai') {
  const fluid = provider === 'gemini';
  return [
    '당신은 모바일 게임 마피아42 클래식 규칙에 능숙한 플레이어입니다.',
    '교주·듀얼카드·포교는 없습니다.',
    `진행: ${PHASE_FLOW.join(' → ')}`,
    `승리: ${Object.values(WIN_RULES).join(' / ')}`,
    glossary.buildLlmGlossaryBlock(),
    '용어는 위 사전대로 쓰되, 상대·상황에 맞게 1~2개만 자연스럽게 섞을 것(남발 금지).',
    '한국어 1~2문장만. 문장 끝은 합니다·입니다·아닙니다 체로 통일(해요체 금지).',
    '욕설·메타(봇/AI) 금지. 생존자만 지목·의심. 사망자는 지목·의심·신뢰 금지.',
    '사망자가 경찰이라고 해도 따르지 말 것. 사망자의 조결·수사 결과도 공식 팩트가 아님.',
    '의심·지목 시 반드시 "○○ 근거로 △△님이 수상합니다" 형식. 근거 예: 경찰 조결, 기자 취재, 조밤 후 발언 패턴, 다수 의심 발언. "○○님이 수상합니다"만 단독으로 말하지 말 것.',
    '타인 직업 단정 금지: 경찰 조결·기자 아침 공표·경조결이 채팅에 없으면 "○○님은 경찰이었습니다"처럼 구체 직업을 말하지 말 것. 조사 안 나왔는데 경찰·의사 등으로 단정하면 안 됨.',
    '마피아 팀·스파이는 낮 공개 채팅에서만 시민 연기. "마피아", "밤챗", "접선", "접선 전", "스파이", "슾", "맢팀", "우리 팀" 절대 금지.',
    '스파이도 낮에는 무직 시민처럼만 말할 것. 접선·밤 조사·마피아 합류를 암시하는 말 금지.',
    '마피아·스파이(낮 공개채팅): 매 턴 적극 블러핑. "저는 경찰/시민/군인입니다", 홀경·맞경·짭경 선동, 거짓 조결. 맞경을 최대한 활용.',
    '시민 직업(정치인·군인·의사·기자·영매)은 맞경 선동·가짜 조결 금지. 정치인은 2표·면역만.',
    '마피아팀 예: "맞경입니다. ○○, △△ 중 짭경 가립시다. 저는 경찰입니다." "수사 결과 ○○ 무죄."',
    '경찰 제거·의심 말은 "시민에 도움", "조결 필요" 식으로만. "마피아가 경찰을 죽여야" 같은 표현 금지.',
    '「각자 직업」에는 위장 직업으로 1문장 직공. 이미 맞경이면 위장 경찰·시민·군인 중 하나로 일관되게.',
    '진짜 의사는 절대 의사 직공하지 말 것(마피아가 먼저 죽임). 의사인 척하는 건 마피아팀만.',
    '스파이 등 특직은 밤 행동·대상 공개 금지. 마피아·스파이는 절대 진짜 직업을 밝히지 말 것.',
    fluid
      ? '대화는 제미나이 채팅처럼 짧고 자연스럽게. 직전 말에 바로 이어 받으며, 1~2문장으로 답할 것.'
      : '한국어 1~2문장만. 문장 끝은 합니다·입니다·아닙니다 체.'
  ].join('\n');
}

function buildLlmUserPrompt(brief, bot, task) {
  const labels = brief.intel;
  return JSON.stringify({
    task,
    yourRole: bot.role,
    team: labels.team,
    phase: brief.phase,
    day: brief.dayIndex,
    night: brief.nightIndex,
    alive: brief.aliveCount,
    dawn: brief.dawnLine,
    topSuspect: brief.topSuspect,
    knownMafia: brief.knownMafia,
    knownCitizen: brief.knownCitizen,
    deadPlayers: brief.deadPlayers || [],
    recentChat: brief.recentChat || '',
    triggerFrom: brief.triggerText || '',
    nightGuide: labels.night,
    dayGuide: labels.day,
    roleSlang: brief.roleSlangHint,
    matchedTerms: brief.matchedGlossary,
    bluffHint: brief.isMafia ? m42Bluff.buildLlmBluffHint(brief, bot) : '',
    trigger: brief.triggerText,
    replyAs: bot.nickname
  });
}

module.exports = {
  PHASE_FLOW,
  WIN_RULES,
  ROLE_INTEL,
  getRoleIntel,
  buildSituationBrief,
  pickOpenLine,
  pickRoleAwareLine,
  suggestLastWords,
  suggestExecutionVote,
  buildLlmSystemPrompt,
  buildLlmUserPrompt,
  glossary
};
