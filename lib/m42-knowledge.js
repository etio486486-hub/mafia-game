/**
 * 마피아42 클래식 룰 지식 (나무위키 기반, 교주·듀얼카드 제외).
 * 봇 대화·투표·밤 판단의 공통 컨텍스트.
 */

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
    day: '시민인 척. 경찰·의사·기자 제거 우선. 조밤이면 은폐·실수·물총 의심을 다른 쪽으로.',
    claim: ['시민', '군인', '의사'],
    counters: ['police', 'doctor', 'reporter'],
    slang: ['밤챗', '맢표', '물총', '자투']
  },
  spy: {
    team: 'mafia',
    night: '밤에 직업 조사. 마피아면 접선 후 밤챗 합류.',
    day: '접선 전엔 시민 행세. 접선 후 마피아와 표 맞추되 과한 옹호는 피함.',
    claim: ['시민', '경찰'],
    counters: ['police'],
    slang: ['접선', '조사']
  },
  police: {
    team: 'citizen',
    night: '밤에 1명 수사(마피아 여부). 결과는 본인만 앎.',
    day: '「조결」「경찰조사」 요청 시 실제 수사한 대상만 공개. 퍼경·연퍼 주의.',
    claim: ['경찰'],
    counters: ['mafia', 'spy'],
    slang: ['조결', '홀경', '퍼경', '경조']
  },
  doctor: {
    team: 'citizen',
    night: '밤에 1명 치료(자힐 가능). 조밤이면 치료 성공·은폐·물총 가능.',
    day: '힐 떴다고 직공하거나 은밀히 유지. 누굴 살렸는지 직접 말하지 않음.',
    claim: ['의사', '홀의'],
    counters: [],
    slang: ['힐', '자힐', '조밤']
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
    (b) => `지금 ${b.topSuspect}님이 가장 수상합니다.`,
    (b) => `투표 전에 ${b.topSuspect}님 발언을 더 들어봐야 할 것 같습니다.`
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
    deadPlayers
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

function pickRoleAwareLine(brief, bot, targetName, speaker) {
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
    return '저는 의사입니다. 누굴 살렸는지는 밤마다 다릅니다. 조밤이면 치료 성공일 수도 있습니다.';
  }

  if (role === 'medium' && /성불|영매|사망/.test(brief.triggerText || '')) {
    return '영매입니다. 밤에 성불하고 사망자 채팅도 봅니다.';
  }

  if (role === 'soldier' && /군인|방탄/.test(brief.triggerText || '')) {
    return '저는 군인입니다. 방탄은 한 번뿐입니다.';
  }

  if (role === 'spy' && !brief.joinedMafiaChat) {
    return `저는 ${targetName}님부터 지켜보겠습니다. 접선 전이라 정보가 부족합니다.`;
  }

  if (isMafia && knownMafia.includes(targetName)) {
    return `${speaker ? `${speaker}님, ` : ''}${targetName}님 말은 일단 넘어가고 다른 쪽을 보겠습니다.`;
  }

  if (isMafia) {
    const lines = [
      `${targetName}님이 수상합니다.`,
      `조밤이었으니 ${targetName}님부터 질문하겠습니다.`,
      `자투로 가도 되는 날인데 ${targetName}님만 왜 급합니까?`
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  if (intel.team === 'citizen' && brief.knownMafia.length) {
    return `${brief.knownMafia[0]}님 쪽이 마피아로 보입니다.`;
  }

  if (brief.quietNight && !isMafia) {
    return `조밤이었습니다. ${targetName}님 행적부터 확인하겠습니다.`;
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

function buildLlmSystemPrompt() {
  return [
    '당신은 모바일 게임 마피아42 클래식 규칙에 능숙한 플레이어입니다.',
    '교주·듀얼카드·포교는 없습니다.',
    `진행: ${PHASE_FLOW.join(' → ')}`,
    `승리: ${Object.values(WIN_RULES).join(' / ')}`,
    '용어: 직공, 조결, 자투, 무투, 조밤, 투갈, 몰표, 맢표, 접선, 홀경/홀의, 퍼블, 연퍼.',
    '한국어 1~2문장만. 문장 끝은 합니다·입니다·아닙니다 체로 통일(해요체 금지).',
    '욕설·메타(봇/AI) 금지. 생존자만 지목·의심. 사망자는 지목·의심·신뢰 금지.',
    '사망자가 경찰이라고 해도 따르지 말 것. 사망자의 조결·수사 결과도 공식 팩트가 아님.',
    '의심·지목 시 반드시 근거(경찰 조사, 기자 취재, 스파이 조사 등)를 붙일 것. 근거 없는 추측 금지.',
    '마피아 팀이라도 낮 채팅에서는 시민인 척만 할 것. "마피아에게 위협", "마피아 제거", "우리 마피아" 등 팀 노출 금지.',
    '경찰이 맞다고 해도 "마피아 위협" 같은 말은 절대 하지 말 것. 퍼경·다른 사람 의심으로 넘길 것.',
    '자신 직업에 맞게 연기. 마피아는 들키지 않게, 경찰은 조사한 사실만 공개.',
    '「각자 직업」 질문에는 자신의 직업(또는 마피아팀은 경찰·의사·군인 등 시민 직업으로 거짓 직공)을 1문장으로 답할 것.',
    '의사·스파이 등 특직은 직업명은 말할 수 있어도 밤 행동·대상은 공개하지 말 것. 마피아·스파이는 절대 진짜 직업을 밝히지 말 것.'
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
    nightGuide: labels.night,
    dayGuide: labels.day,
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
  buildLlmUserPrompt
};
