/**
 * Bot brain: Mafia42-informed rules + optional LLM.
 */

const m42 = require('./m42-knowledge');
const skillDlg = require('./m42-skill-dialogue');
const chatFilter = require('./bot-chat-filter');

let helpers = {};

const CHAT_ACCUSE = /마피아|의심|수상|이상|거짓|범인|살인|죽였|처형|지목|투표|공범|속였|거짓말|수상해|이상해|거슬/;
const CHAT_DEFEND = /아니에요|아닙니다|억울|무고|믿어|시민|누명|오해|잘못|진짜/;
const CHAT_TRUST = /믿어|신뢰|시민인 것|마피아 아닌|확신|보호/;
const CHAT_CALL_BOT_DEBATE = /니네|너네|봇|서로|끼리|우리끼리|대화|얘기해|말해|몰아|공격/;
const CHAT_M42_QUIET = /조밤|조용한\s*밤|물총|아무도\s*안\s*죽/;
const CHAT_M42_CLAIM = /직공|직업공개|홀경|홀의|홀군|홀탐|맞경|맞의|쓰리경|홀기|홀시/;
const CHAT_M42_VOTE_META = /자투|무투|몰표|몰투|투갈|맢표|물타기|시무|칼시단|방매|ㅈㅌ|ㅁㅌ/;
const CHAT_M42_CLAIM_META = /홀경|홀의|홀군|홀기|맞경|맞의|맞직|쓰리경|확경|확직|늦경|눈치경|짭경|진경|무직|직공|ㅈㄱ|풍지/;
const CHAT_M42_NIGHT_META = /조밤|물총|퍼블|연퍼|퍼경|경퍼|노연퍼|밤챗|접선|맢킬|홀맢|짝맢/;
const CHAT_M42_POLICE_META = /조결|경조|경크|노맢|n맢|n노맢|수사결과|조사결과|경찰조사/;

const MAFIA_FAKE_CLAIM_ROLES = {
  mafia: ['citizen', 'police', 'doctor', 'soldier', 'reporter', 'medium'],
  spy: ['citizen', 'police', 'soldier', 'reporter', 'medium']
};

const ROLE_CLAIM_LINES = {
  police: ['저는 경찰입니다. 조결이 필요하면 말씀해 주십시오.', '홀경입니다. 밤에 수사하겠습니다.'],
  doctor: [
    '저는 시민입니다. 눈힐이 낫습니다. 직공은 하지 않겠습니다.',
    '의사 이야기는 안 합니다. 다른 분 추리·조결을 따라가겠습니다.',
    '힐 여부는 말하지 않겠습니다. 경찰 조결이 나오면 그걸로 가겠습니다.'
  ],
  reporter: ['홀기입니다. 2밤부터 취재에 들어갑니다.', '저는 기자입니다. 팩트만 말하겠습니다.'],
  soldier: ['홀군입니다. 방탄은 한 번 있습니다.', '저는 군인입니다. 시민 보호 편입니다.'],
  politician: ['저는 정치인입니다. 낮 투표 2표, 찬반 처형 면역입니다.', '저는 투표로 처형되지 않습니다.'],
  medium: ['저는 영매입니다. 사망자 채팅도 봅니다.', '성불로 단서를 드릴 수 있습니다.'],
  graverobber: ['밤 결과를 보고 판단 중입니다.', '저도 정보를 모으는 중입니다.'],
  citizen: ['저는 일반 시민입니다.', '특수직이 아닙니다. 함께 추리하겠습니다.'],
  mafia: ['저는 일반 시민입니다. 마피아가 아닙니다.', '홀시입니다. 오늘은 조용히 가겠습니다.'],
  spy: ['저는 시민 편입니다. 정보를 정리 중입니다.', '홀시입니다. 누가 수상한지 보겠습니다.']
};

const ROLE_PERSONAS = {
  mafia: {
    open: ['일단 차분히 정보를 모아보겠습니다.', '서로만 의심하면 마피아에게 이득입니다.'],
    accuse: (t, s) => s ? `${s}님 말을 들어보니 ${t}님이 더 수상합니다.` : `${t}님 말투가 불안합니다.`,
    agree: (t, s) => s ? `${s}님 의견에 동의합니다. ${t}님부터 보겠습니다.` : `${t}님 쪽이 마피아로 보입니다.`,
    defend: () => '저는 시민 편입니다. 저부터 의심하면 안 됩니다.',
    doubt: (t) => `${t}님, 아까 말과 지금 말이 다릅니다.`,
    redirect: (t) => `잠깐, ${t}님 행동부터 보겠습니다.`
  },
  spy: {
    open: ['정보가 부족합니다. 발언을 정리하겠습니다.'],
    accuse: (t, s) => s ? `${s}님 말대로 ${t}님을 지켜보겠습니다.` : `${t}님이 수상합니다.`,
    agree: (t, s) => s ? `${s}님 말에 동의합니다. ${t}님을 의심합니다.` : `${t}님 쪽입니다.`,
    defend: () => '저는 관찰만 하고 있습니다.',
    doubt: (t) => `${t}님 설명이 부족합니다.`,
    redirect: (t) => `${t}님도 설명해 주십시오.`
  },
  police: {
    open: ['단서부터 정리하겠습니다. 감정 싸움은 위험합니다.'],
    accuse: (t) => `수사 관점에서 ${t}님 행적이 수상합니다.`,
    agree: (t, s) => s ? `${s}님 제보와 맞물려 ${t}님이 유력합니다.` : `${t}님을 집중 조사해야 합니다.`,
    defend: () => '저는 시민을 보호하려는 입장입니다.',
    doubt: (t) => `${t}님, 알리바이를 다시 말씀해 주십시오.`,
    redirect: (t) => `우선 ${t}님부터 수사하겠습니다.`
  },
  doctor: {
    open: ['밤에 무슨 일이 있었는지부터 보겠습니다.'],
    accuse: (t) => `${t}님이 너무 들뜬 것 같습니다.`,
    agree: (t, s) => s ? `저도 ${t}님이 걱정됩니다.` : `${t}님 말대로 ${t}님을 의심합니다.`,
    defend: () => '저는 살리려고만 했습니다.',
    doubt: (t) => `${t}님, 밤에 어디 계셨는지 말씀해 주십시오.`,
    redirect: (t) => `${t}님 말도 들어보겠습니다.`
  },
  reporter: {
    open: ['팩트만 말하겠습니다. 추측은 구분하겠습니다.'],
    accuse: (t) => `제가 보기에 ${t}님 발언이 일관되지 않습니다.`,
    agree: (t, s) => s ? `기사 제목은 ${t}님 쪽입니다.` : `${t}님 쪽으로 기울어 있습니다.`,
    defend: () => '저는 취재만 했을 뿐입니다.',
    doubt: (t) => `${t}님, 방금 말을 번복하신 것 같습니다.`,
    redirect: (t) => `${t}님 기사도 확인하겠습니다.`
  },
  medium: {
    open: ['죽은 분들도 단서가 될 수 있습니다.'],
    accuse: (t) => `${t}님이 수상합니다.`,
    agree: (t, s) => s ? `${s}님 말에 힘이 있습니다. ${t}님을 보겠습니다.` : `${t}님에게 집중하겠습니다.`,
    defend: () => '저는 사망자에게만 말을 겁니다.',
    doubt: (t) => `${t}님, 죽은 분 이야기를 왜 피하십니까?`,
    redirect: (t) => `${t}님 쪽이 이상합니다.`
  },
  politician: {
    open: ['투표는 신중하게 하겠습니다. 억울한 사람이 없게 하겠습니다.'],
    accuse: (t) => `${t}님은 국민을 속이는 타입으로 보입니다.`,
    agree: (t, s) => s ? `${s}님 의견에 공감합니다.` : `${t}님에게 투표할 의향이 있습니다.`,
    defend: () => '저는 낮 2표이고 찬반 처형은 면역입니다.',
    doubt: (t) => `${t}님 공약이 말뿐인 것 같습니다.`,
    redirect: (t) => `${t}님도 국민 앞에서 답해 주십시오.`
  },
  soldier: {
    open: ['침착하게 가겠습니다.'],
    accuse: (t) => `${t}님이 전선에서 도망친 것 같습니다.`,
    agree: (t, s) => s ? `${s}님 말에 동의합니다.` : `${t}님을 경계해야 합니다.`,
    defend: () => '저는 시민을 지킵니다.',
    doubt: (t) => `${t}님, 자신 있게 말씀해 주십시오.`,
    redirect: (t) => `${t}님도 경계합니다.`
  },
  graverobber: {
    open: ['밤의 결과가 모든 것을 말해 줄 것입니다.'],
    accuse: (t) => `${t}님이 수상합니다.`,
    agree: (t, s) => s ? `${s}님 말을 들어보니 ${t}님이 맞습니다.` : `${t}님 쪽입니다.`,
    defend: () => '저는 지켜보는 중입니다.',
    doubt: (t) => `${t}님, 뭔가 숨기고 계십니다.`,
    redirect: (t) => `${t}님 쪽이 수상합니다.`
  },
  citizen: {
    open: ['저는 일반 시민입니다. 함께 찾아보겠습니다.'],
    accuse: (t) => `솔직히 ${t}님이 수상합니다.`,
    agree: (t, s) => s ? `${s}님 말에 설득됐습니다. ${t}님을 의심합니다.` : `${t}님에게 투표하겠습니다.`,
    defend: () => '저는 마피아가 아닙니다.',
    doubt: (t) => `${t}님 말이 자꾸 바뀝니다.`,
    redirect: (t) => `저는 ${t}님이 더 의심됩니다.`
  }
};

function debateLineWithReason(room, bot, speakerName, targetPlayer) {
  if (!targetPlayer || isDeadPlayer(targetPlayer)) {
    return '사망자는 의심·지목 대상이 아닙니다.';
  }
  const line = helpers.formatAccuseLine
    ? helpers.formatAccuseLine(room, bot, targetPlayer.id, speakerName)
    : null;
  if (line) return line;
  return `조사·취재 근거가 있을 때만 ${targetPlayer.nickname}님을 지목하겠습니다.`;
}

function configure(h) {
  helpers = { ...helpers, ...h };
}

function getAiProvider() {
  const raw = (process.env.BOT_AI_PROVIDER || 'openai').toLowerCase().trim();
  if (raw === 'gemini' || raw === 'google') return 'gemini';
  return 'openai';
}

function isLlmEnabled() {
  if (process.env.BOT_AI_ENABLED === 'false') return false;
  return !!getApiKey();
}

function getApiKey() {
  if (getAiProvider() === 'gemini') {
    return process.env.GEMINI_API_KEY
      || process.env.GOOGLE_API_KEY
      || process.env.BOT_AI_API_KEY
      || '';
  }
  return process.env.BOT_AI_API_KEY || process.env.OPENAI_API_KEY || '';
}

function getDefaultModel() {
  if (getAiProvider() === 'gemini') {
    return process.env.BOT_AI_MODEL || 'gemini-2.0-flash';
  }
  return process.env.BOT_AI_MODEL || 'gpt-4o-mini';
}

function getPersona(role) {
  return ROLE_PERSONAS[role] || ROLE_PERSONAS.citizen;
}

function findMentioned(room, text, { aliveOnly = true } = {}) {
  if (!text) return [];
  const out = [];
  const players = Object.values(room.players).sort((a, b) => b.nickname.length - a.nickname.length);
  for (const p of players) {
    if (aliveOnly && !p.alive) continue;
    if (p.nickname && text.includes(p.nickname)) out.push(p);
  }
  return out;
}

function isDeadPlayer(p) {
  return p && !p.alive;
}

function getRecentChat(room, limit = 8) {
  const log = helpers.getChatMessages ? helpers.getChatMessages(room, 'day') : [];
  return log.filter((m) => !m.system && m.text).slice(-limit);
}

function getSpeakerPlayer(room, msg) {
  if (!msg?.fromId || !helpers.getPlayerById) return null;
  return helpers.getPlayerById(room, msg.fromId);
}

function getLastLivingMessage(room) {
  const recent = getRecentChat(room, 16);
  for (let i = recent.length - 1; i >= 0; i--) {
    const msg = recent[i];
    if (msg.isDead) continue;
    const speaker = getSpeakerPlayer(room, msg);
    if (speaker && !speaker.alive) continue;
    return msg;
  }
  return null;
}

function getLastMessage(room) {
  return getLastLivingMessage(room);
}

function findDeadPoliceMention(room, text) {
  if (!text) return null;
  const compact = text.replace(/\s+/g, '');
  if (!/경찰|홀경/.test(compact)) return null;
  for (const p of Object.values(room.players || {})) {
    if (p.alive || !p.nickname) continue;
    if (text.includes(p.nickname) && /경찰|홀경/.test(compact)) return p;
  }
  return null;
}

function pickChatTarget(room, bot) {
  if (helpers.pickBotChatAccuseTarget) return helpers.pickBotChatAccuseTarget(room, bot);
  if (helpers.pickBotDayVoteTarget) return helpers.pickBotDayVoteTarget(room, bot);
  return null;
}

function getTargetPlayer(room, bot, preferredId) {
  if (preferredId) {
    const p = helpers.getPlayerById ? helpers.getPlayerById(room, preferredId) : null;
    if (p && p.alive && p.id !== bot.id) return p;
  }
  const id = pickChatTarget(room, bot);
  const p = id && helpers.getPlayerById ? helpers.getPlayerById(room, id) : null;
  if (p && p.alive && p.id !== bot.id) return p;
  return null;
}

function getClearedSet(room, bot) {
  if (helpers.getClearedPlayerIds) return helpers.getClearedPlayerIds(room, bot);
  return new Set();
}

function isClearedPlayer(room, bot, player) {
  if (!player) return false;
  if (helpers.isPlayerClearedByFacts) {
    return helpers.isPlayerClearedByFacts(room, bot, player.id);
  }
  return getClearedSet(room, bot).has(player.id);
}

function pickAnotherBot(room, bot, excludeId) {
  const cleared = getClearedSet(room, bot);
  const alive = helpers.getAlivePlayers ? helpers.getAlivePlayers(room) : [];
  const bots = alive.filter(
    (p) => p.isBot && p.id !== bot.id && p.id !== excludeId && !cleared.has(p.id)
  );
  if (!bots.length) return null;
  return bots[Math.floor(Math.random() * bots.length)];
}

function pickFactTargetPlayer(room, bot) {
  const id = helpers.pickFactChatAccuseTarget
    ? helpers.pickFactChatAccuseTarget(room, bot)
    : (helpers.pickBotDayVoteTarget ? helpers.pickBotDayVoteTarget(room, bot) : null);
  if (!id || id === bot.id) return null;
  const p = helpers.getPlayerById ? helpers.getPlayerById(room, id) : null;
  if (!p || !p.alive || isClearedPlayer(room, bot, p)) return null;
  return p;
}

function pickAliveSuspectName(room, bot, brief) {
  const fact = pickFactTargetPlayer(room, bot);
  if (fact) return fact.nickname;
  if (brief && brief.topSuspect) {
    const top = Object.values(room.players).find((p) => p.nickname === brief.topSuspect);
    if (top && !isClearedPlayer(room, bot, top)) return brief.topSuspect;
  }
  return null;
}

function reactToPoliceReport(room, bot, last, isMafia) {
  if (!last?.text || !helpers.parsePoliceReportFromText) return null;
  if (!/수사\s*결과|마피아가\s*아닙니다|마피아입니다/.test(last.text)) return null;

  const speaker = getSpeakerPlayer(room, last);
  if (speaker && !speaker.alive) {
    return '사망자의 조결·수사 결과는 공식 팩트가 아닙니다. 살아 있는 경찰의 공개 조결만 따르겠습니다.';
  }
  if (/수사\s*결과/.test(last.text)) {
    const alivePolice = helpers.getAlivePlayers
      ? helpers.getAlivePlayers(room).find((p) => p.role === 'police')
      : null;
    if (alivePolice && last.fromId !== alivePolice.id) {
      return `${speaker ? speaker.nickname : '해당'}님의 수사 결과는 경찰 공식 조결이 아닙니다.`;
    }
  }

  const deadPoliceMention = findDeadPoliceMention(room, last.text);
  if (deadPoliceMention) {
    return `${deadPoliceMention.nickname}님은 사망하셨습니다. 경찰 여부와 관계없이 의심·신뢰 대상이 아닙니다.`;
  }

  const facts = helpers.parsePoliceReportFromText(room, last.text);
  const alt = pickFactTargetPlayer(room, bot);
  const altName = alt ? alt.nickname : null;

  if (facts.innocent.length) {
    const names = facts.innocent.map((p) => p.nickname).join(', ');
    if (facts.innocent.some((p) => p.id === bot.id)) {
      return '수사 결과 공개했습니다. 저는 마피아가 아닙니다. 다른 쪽을 봐 주세요.';
    }
    if (!isMafia) {
      if (altName) {
        return `${names}님은 경찰 조사로 마피아가 아닙니다. ${altName}님부터 확인합시다.`;
      }
      return `${names}님은 조결상 마피아가 아닙니다. 그쪽은 제외하고 투표하겠습니다.`;
    }
    if (altName) {
      return `조결을 확인했습니다. ${names}님 말고 ${altName}님 행적을 보겠습니다.`;
    }
    return `경찰 조결을 들었습니다. ${names}님 말고 다른 사람부터 보겠습니다.`;
  }

  if (facts.mafia.length && !isMafia) {
    const n = facts.mafia.map((p) => p.nickname).join(', ');
    return `${n}님은 경찰 조사로 마피아입니다. 여기에 맞춰 갑시다.`;
  }

  if (facts.mafia.length && isMafia) {
    return '조결은 일단 넘어가고, 다른 근거부터 맞추겠습니다.';
  }

  return null;
}

function isPublicPolicePlayer(room, playerId) {
  return helpers.isPublicPoliceClaim && helpers.isPublicPoliceClaim(room, playerId);
}

/** 의사: 경찰 직공 시 눈힐·추리 연동 (직공 없이 경찰 보호 쪽 발언) */
function reactToPoliceRevealForDoctor(room, bot, last) {
  if (bot.role !== 'doctor' || !last?.text) return null;
  const speaker = getSpeakerPlayer(room, last);
  if (!speaker || !speaker.alive || speaker.id === bot.id) return null;
  const compact = last.text.replace(/\s+/g, '');
  if (!/경찰|홀경|조결|수사/.test(compact)) return null;
  if (!isPublicPolicePlayer(room, speaker.id) && !/(저는|나는|홀경|경찰입니다|수사\s*결과)/.test(compact)) {
    return null;
  }
  const lines = [
    `${speaker.nickname}님이 경찰이라면 마피아 표적입니다. 저는 시민으로만 따라가겠습니다.`,
    `경찰 직공이 나왔습니다. 조결·다른 분 추리를 기준으로 가겠습니다. 의사 이야기는 하지 않습니다.`,
    `${speaker.nickname}님 조사 결과부터 맞추겠습니다. 눈힐이 낫습니다.`
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

/** 누군가 경찰 직공·확정 언급 시 (마피아는 시민인 척 반응) */
function reactToPoliceRoleClaim(room, bot, last, isMafia) {
  if (!last?.text) return null;

  const speaker = getSpeakerPlayer(room, last);
  if (speaker && !speaker.alive) {
    return '사망자의 직공·경찰 주장은 무시합니다. 살아 있는 분의 공개 조결만 기준으로 가겠습니다.';
  }

  const doctorReact = reactToPoliceRevealForDoctor(room, bot, last);
  if (doctorReact) return doctorReact;

  const deadPoliceMention = findDeadPoliceMention(room, last.text);
  if (deadPoliceMention) {
    return `${deadPoliceMention.nickname}님은 사망하셨습니다. 경찰로 봐도 투표·의심 대상이 아닙니다.`;
  }

  const compact = last.text.replace(/\s+/g, '');
  if (!/경찰|홀경|조결/.test(compact)) return null;
  if (!/확실|맞|인거|인가|네요|네$|이다|였|공개|정보|얻었|알았|인정/.test(compact)) return null;

  if (isMafia) {
    return chatFilter.pickSafeReplacement(true);
  }
  return '경찰 조결이 나왔다면 그 결과를 기준으로 가겠습니다. 사망자 직공은 따르지 않습니다.';
}

function finalizeBotLine(room, bot, text) {
  if (!text) return text;
  return chatFilter.sanitizeBotChatLine(text, bot, helpers.isMafiaTeam);
}

function guardedAccuse(room, bot, targetId, speaker) {
  const p = helpers.getPlayerById ? helpers.getPlayerById(room, targetId) : null;
  if (!p || isDeadPlayer(p)) {
    return '사망자는 지목·의심 대상이 아닙니다.';
  }
  if (isClearedPlayer(room, bot, p)) {
    const alt = pickFactTargetPlayer(room, bot);
    if (alt && helpers.formatAccuseLine) {
      return helpers.formatAccuseLine(room, bot, alt.id, speaker);
    }
    return '경찰·기자로 무죄가 확인된 사람은 의심하지 않겠습니다.';
  }
  if (helpers.formatAccuseLine) {
    const line = helpers.formatAccuseLine(room, bot, targetId, speaker);
    if (line) return line;
  }
  return '확실한 조사·취재 근거가 있을 때만 지목하겠습니다.';
}

function pickSpeakerBotFromLastAccuse(room, bot) {
  const recent = getRecentChat(room, 6);
  for (let i = recent.length - 1; i >= 0; i--) {
    const msg = recent[i];
    if (!msg.fromId || msg.fromId === bot.id) continue;
    const speaker = helpers.getPlayerById ? helpers.getPlayerById(room, msg.fromId) : null;
    if (!speaker || !speaker.isBot || !speaker.alive) continue;
    if (CHAT_ACCUSE.test(msg.text || '')) return speaker;
  }
  return null;
}

function pickRoleClaimLine(bot) {
  const pool = ROLE_CLAIM_LINES[bot.role] || ROLE_CLAIM_LINES.citizen;
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickMafiaFakeClaimRole(bot) {
  const pool = MAFIA_FAKE_CLAIM_ROLES[bot.role] || MAFIA_FAKE_CLAIM_ROLES.mafia;
  return pool[Math.floor(Math.random() * pool.length)];
}

function roleLabel(role) {
  return (helpers.ROLE_LABELS && helpers.ROLE_LABELS[role]) || role || '시민';
}

/** 「각자 직업 뭐야?」 등 직업 공개 요청에 대한 1인칭 답변 */
function buildRoleRollCallAnswer(room, bot, isMafia) {
  const g = room.game || {};

  if (isMafia) {
    const fake = pickMafiaFakeClaimRole(bot);
    const name = roleLabel(fake);
    const tail = {
      police: '조결이 필요하면 말씀해 주십시오.',
      doctor: '특직이지만 시민 편입니다. 치료 내용은 말씀드리기 어렵습니다.',
      soldier: '방탄은 한 번 있습니다.',
      reporter: g.nightIndex >= 2 ? '취재는 팩트만 공개하겠습니다.' : '아직 취재 전입니다.',
      medium: '사망자 채팅도 봅니다.',
      citizen: '특수직은 아닙니다.'
    };
    return `저는 ${name}입니다. ${tail[fake] || '시민 편입니다.'}`;
  }

  const role = bot.role;
  const name = roleLabel(role);

  if (role === 'doctor') {
    const hideLines = [
      '저는 시민입니다. 의사 직공은 안 합니다. 눈힐이 낫습니다.',
      '특수직은 숨깁니다. 다른 분 추리·조결을 따라가겠습니다.',
      '저는 일반 시민입니다. 힐 여부는 말하지 않겠습니다.'
    ];
    return hideLines[Math.floor(Math.random() * hideLines.length)];
  }
  if (role === 'spy') {
    return '저는 시민입니다. 특직이 있어도 밤 행동은 공개하지 않겠습니다.';
  }
  if (role === 'police') {
    return `저는 ${name}입니다. 조사한 사람만 조결로 말씀드리겠습니다.`;
  }
  if (role === 'reporter') {
    if ((g.nightIndex || 0) < 2) {
      return `저는 ${name}입니다. 특직이라 2밤 전까지는 취재·밤 행동을 공개하지 않겠습니다.`;
    }
    return `저는 ${name}입니다. 취재 결과는 아침에 팩트로만 말하겠습니다.`;
  }
  if (role === 'medium') {
    return `저는 ${name}입니다. 사망자 성불·채팅은 제 역할입니다.`;
  }
  if (role === 'politician') {
    return `저는 ${name}입니다. 낮 투표 2표, 찬반 처형 면역입니다.`;
  }
  if (role === 'soldier') {
    return `저는 ${name}입니다. 방탄은 한 번 있습니다.`;
  }
  if (role === 'graverobber') {
    return '저는 일반 시민처럼 보이지만, 밤 결과를 보며 판단 중입니다.';
  }
  if (role === 'citizen') {
    return `저는 ${name}입니다. 특수직이 아닙니다.`;
  }
  return `저는 ${name}입니다.`;
}

function wantsRoleRollCall(triggerText, last) {
  const t = triggerText || '';
  if (helpers.isRoleRollCallQuestion && helpers.isRoleRollCallQuestion(t)) return true;
  if (last?.text && helpers.isRoleRollCallQuestion && helpers.isRoleRollCallQuestion(last.text)) return true;
  if (helpers.isRoleClaimRequest && helpers.isRoleClaimRequest(t)) return true;
  return false;
}

function normalizeLlmText(text) {
  if (!text || typeof text !== 'string') return null;
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned.length > 220) return null;
  return cleaned.slice(0, 180);
}

async function callLlmOpenAI(model, systemPrompt, userPrompt) {
  const url = process.env.BOT_AI_BASE_URL || 'https://api.openai.com/v1/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getApiKey()}`
    },
    body: JSON.stringify({
      model,
      max_tokens: 150,
      temperature: 0.88,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });
  if (!res.ok) return null;
  const data = await res.json();
  return normalizeLlmText(data.choices?.[0]?.message?.content);
}

async function callLlmGemini(model, systemPrompt, userPrompt) {
  const key = getApiKey();
  const base = process.env.GEMINI_API_BASE_URL
    || 'https://generativelanguage.googleapis.com/v1beta';
  const url = `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.95,
        topP: 0.92,
        maxOutputTokens: 180
      }
    })
  });
  if (!res.ok) {
    console.warn('[BOT] Gemini API error', res.status);
    return null;
  }
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text || '').join('').trim();
  return normalizeLlmText(text);
}

async function callLlm(room, bot, brief, task) {
  if (!isLlmEnabled()) return null;
  const model = getDefaultModel();
  const systemPrompt = m42.buildLlmSystemPrompt(getAiProvider());
  const userPrompt = m42.buildLlmUserPrompt(brief, bot, task);

  try {
    if (getAiProvider() === 'gemini') {
      return await callLlmGemini(model, systemPrompt, userPrompt);
    }
    return await callLlmOpenAI(model, systemPrompt, userPrompt);
  } catch (err) {
    console.warn('[BOT] LLM error', err.message);
    return null;
  }
}

function generateRuleBased(room, bot, ctx = {}) {
  const brief = m42.buildSituationBrief(room, bot, ctx, helpers);
  const persona = getPersona(bot.role);
  const scores = helpers.buildSuspicionScores ? helpers.buildSuspicionScores(room, bot) : {};
  const selfSus = scores[bot.id] || 0;
  const last = getLastMessage(room);
  const triggerText = ctx.triggerText || (last && last.text) || '';
  brief.triggerText = triggerText;

  const target = getTargetPlayer(room, bot);
  const targetName = pickAliveSuspectName(room, bot, brief) || '누군가';
  const isMafia = brief.isMafia;

  const altBot = pickAnotherBot(room, bot, target ? target.id : null);
  const altName = altBot ? altBot.nickname : targetName;

  const roleLine = m42.pickRoleAwareLine(brief, bot, targetName, last && last.from);
  if (roleLine) return roleLine;

  const nightReport = room.game && room.game.lastNightReport;
  if (nightReport) brief.nightReport = nightReport;

  const skillTopic = skillDlg.detectSkillTopic(triggerText);
  if (skillTopic && Math.random() < 0.58) {
    const skillLine = skillDlg.pickSkillChatReaction(
      brief,
      bot,
      skillTopic,
      { speaker: last && last.from },
      helpers
    );
    if (skillLine) return skillLine;
  }

  if (nightReport && room.game.dayIndex <= 1 && Math.random() < 0.2) {
    const selfLine = skillDlg.pickSelfSkillFollowUp(brief, bot, nightReport);
    if (selfLine) return selfLine;
  }

  if (helpers.isSelfVoteRequest && helpers.isSelfVoteRequest(triggerText)) {
    if (isMafia && Math.random() < 0.4) {
      return '오늘은 무투로 가도 될 것 같습니다. 마피아만 걸리지 않으면 됩니다.';
    }
    return '지목할 사람이 없으면 자투로 넘기겠습니다. 투갈이 나오면 손해입니다.';
  }

  if (wantsRoleRollCall(triggerText, last)) {
    return buildRoleRollCallAnswer(room, bot, isMafia);
  }

  if (CHAT_M42_QUIET.test(triggerText) && !isMafia && Math.random() < 0.5) {
    return '조밤이면 은폐·치료·물총 가능성도 있습니다. 급하게 몰표하지 않겠습니다.';
  }

  if (CHAT_M42_VOTE_META.test(triggerText) && Math.random() < 0.45) {
    return `몰표는 위험합니다. ${targetName}님 말부터 검증하겠습니다.`;
  }

  const glossaryLine = m42.glossary.pickGlossaryReaction(brief, bot, triggerText || (last && last.text) || '');
  if (glossaryLine && Math.random() < 0.72) return glossaryLine;

  if (CHAT_M42_CLAIM_META.test(triggerText) && Math.random() < 0.4) {
    return '홀직·맞직·확직 구분해서 보겠습니다. 팩트 없으면 몰표는 위험합니다.';
  }

  if (CHAT_M42_NIGHT_META.test(triggerText) && !isMafia && Math.random() < 0.42) {
    return '밤 결과(조밤·물총·퍼블)부터 정리한 뒤 지목하겠습니다.';
  }

  if (CHAT_M42_POLICE_META.test(triggerText) && bot.role !== 'police' && Math.random() < 0.5) {
    return '경찰 조결이 나오면 그걸 기준으로 가겠습니다.';
  }

  if (bot.role === 'police' && helpers.isPoliceReportRequest && last
    && last.fromId !== bot.id && helpers.isPoliceReportRequest(last.text)) {
    if (helpers.buildPolicePublicReport) {
      const report = helpers.buildPolicePublicReport(room, bot.id);
      if (report && report.police && report.police.id === bot.id && report.hasIntel) return report.text;
      return '조결은 실제 수사한 대상만 공개하겠습니다.';
    }
  }

  if (selfSus >= 5 && last && last.fromId !== bot.id) {
    if (CHAT_ACCUSE.test(last.text || '') && findMentioned(room, last.text).some((p) => p.id === bot.id)) {
      return persona.defend();
    }
  }

  if (last && last.fromId !== bot.id && last.text) {
    const speakerP = getSpeakerPlayer(room, last);
    if (speakerP && !speakerP.alive) {
      return '사망자의 말은 팩트로 쓰지 않습니다. 살아 있는 분만 기준으로 판단하겠습니다.';
    }

    const policeClaimReact = reactToPoliceRoleClaim(room, bot, last, isMafia);
    if (policeClaimReact) return policeClaimReact;

    const policeReact = reactToPoliceReport(room, bot, last, isMafia);
    if (policeReact) return policeReact;

    const speaker = last.from;
    const mentioned = findMentioned(room, last.text);
    const accused = mentioned.find((p) => p.id !== bot.id && p.alive);
    const accusedName = accused ? accused.nickname : targetName;

    if (CHAT_CALL_BOT_DEBATE.test(last.text) && altBot) {
      return debateLineWithReason(room, bot, speaker, altBot);
    }

    if (CHAT_ACCUSE.test(last.text) && accused) {
      if (isDeadPlayer(accused)) {
        return '사망자는 의심·지목 대상이 아닙니다.';
      }
      if (bot.role === 'doctor' && isPublicPolicePlayer(room, accused.id)) {
        return `${speaker}님, ${accusedName}님은 경찰 직공이 나왔습니다. 의심 전에 조결부터 보겠습니다.`;
      }
      if (isClearedPlayer(room, bot, accused)) {
        const alt = pickFactTargetPlayer(room, bot);
        if (alt) {
          return `${speaker}님, ${accusedName}님은 경찰 조결상 마피아가 아닙니다. ${alt.nickname}님을 보겠습니다.`;
        }
        return `${speaker}님, ${accusedName}님은 조사로 무죄입니다. 다른 사람을 지목해 주세요.`;
      }
      if (isMafia && helpers.isMafiaTeam && helpers.isMafiaTeam(accused.role)) {
        return persona.doubt(accusedName);
      }
      if (accused.isBot && altBot && Math.random() < 0.4) {
        return persona.redirect(altName);
      }
      const fact = pickFactTargetPlayer(room, bot);
      if (fact) {
        return guardedAccuse(room, bot, fact.id, speaker);
      }
      return `${speaker}님, 조사·취재 결과 없이는 성급히 동의하기 어렵습니다.`;
    }

    if (CHAT_DEFEND.test(last.text) && accused) {
      if (isDeadPlayer(accused)) {
        return '사망자에 대한 의심은 맞지 않습니다.';
      }
      if (isClearedPlayer(room, bot, accused)) {
        return `${speaker}님 말씀에 동의합니다. ${accusedName}님은 조결상 시민 쪽입니다.`;
      }
      if (isMafia && !helpers.isMafiaTeam(accused.role)) {
        const fact = pickFactTargetPlayer(room, bot);
        if (fact) return guardedAccuse(room, bot, fact.id, speaker);
      }
      if (altBot && Math.random() < 0.5) {
        return guardedAccuse(room, bot, altBot.id, speaker);
      }
      return persona.doubt(accusedName);
    }

    if (CHAT_TRUST.test(last.text) && accused && !isMafia) {
      if (isClearedPlayer(room, bot, accused)) {
        return `${speaker}님, ${accusedName}님은 경찰 조사로 무죄입니다. 믿어도 됩니다.`;
      }
      const fact = pickFactTargetPlayer(room, bot);
      if (fact) {
        return `${speaker}님, ${accusedName}님보다 ${fact.nickname}님이 팩트상 더 수상합니다.`;
      }
      return `${speaker}님, 확실한 결과가 나올 때까지 지켜보겠습니다.`;
    }

    if (mentioned.length === 0 && /누구|누가|어디|왜|뭐|대답|말해|안녕|들리|응답|말씀|얘기|말들/.test(last.text)) {
      const fact = pickFactTargetPlayer(room, bot);
      if (fact) {
        return `${speaker}님, ${fact.nickname}님부터 확인하겠습니다. 조사·취재 결과 기준입니다.`;
      }
      return `${speaker}님, 경찰 조결·기자 취재가 나온 뒤에 지목하는 것이 맞습니다.`;
    }

    const prevBot = pickSpeakerBotFromLastAccuse(room, bot);
    if (prevBot && prevBot.id !== bot.id && !isClearedPlayer(room, bot, prevBot) && Math.random() < 0.5) {
      return persona.doubt(prevBot.nickname);
    }

    if (speakerP && !speakerP.isBot && altBot && Math.random() < 0.65) {
      return guardedAccuse(room, bot, altBot.id, speaker);
    }

    const factEnd = pickFactTargetPlayer(room, bot);
    if (factEnd) {
      return guardedAccuse(room, bot, factEnd.id, speaker);
    }
    return '조사·취재로 확인된 사람만 지목하겠습니다.';
  }

  const factOpen = pickFactTargetPlayer(room, bot);
  if (factOpen) {
    return guardedAccuse(room, bot, factOpen.id, null);
  }

  if (Math.random() < 0.4) {
    return m42.pickOpenLine(brief);
  }

  return isMafia
    ? '조결이 나온 사람 말고 다른 근거부터 맞추겠습니다.'
    : '경찰·기자 결과가 있을 때만 투표·지목하는 것이 안전합니다.';
}

function generateBotDawnReaction(room, bot, nightReport) {
  if (!nightReport || Math.random() > 0.78) return null;
  const brief = m42.buildSituationBrief(room, bot, { nightReport }, helpers);
  brief.nightReport = nightReport;
  const selfLine = skillDlg.pickSelfSkillFollowUp(brief, bot, nightReport);
  if (selfLine && Math.random() < 0.5) return selfLine;
  return skillDlg.pickDawnReaction(brief, bot, nightReport, helpers);
}

async function generateBotChat(room, bot, ctx = {}) {
  const brief = m42.buildSituationBrief(room, bot, ctx, helpers);
  const isMafia = helpers.isMafiaTeam && helpers.isMafiaTeam(bot.role);
  const rollCall = wantsRoleRollCall(ctx.triggerText || '', getLastMessage(room));
  if (rollCall) {
    const line = buildRoleRollCallAnswer(room, bot, isMafia);
    if (line) return finalizeBotLine(room, bot, line);
  }

  const recent = getRecentChat(room, 6)
    .filter((m) => m.fromId !== bot.id)
    .map((m) => `${m.from}: ${m.text}`)
    .join('\n');
  if (recent) brief.recentChat = recent;

  const useGemini = getAiProvider() === 'gemini';
  const llmChance = useGemini ? (isMafia ? 0.25 : 0.58) : (isMafia ? 0.12 : 0.3);
  if (isLlmEnabled() && Math.random() < llmChance) {
    const llm = await callLlm(room, bot, brief, 'day_chat_reply');
    if (llm) return finalizeBotLine(room, bot, llm);
  }
  return finalizeBotLine(room, bot, generateRuleBased(room, bot, ctx));
}

function generateBotLastWords(room, bot) {
  const brief = m42.buildSituationBrief(room, bot, {}, helpers);
  return m42.suggestLastWords(brief, bot);
}

function pickBotExecutionVote(room, bot, candidate) {
  if (helpers.pickFactBasedExecutionVote) {
    return helpers.pickFactBasedExecutionVote(room, bot, candidate);
  }
  const brief = m42.buildSituationBrief(room, bot, {}, helpers);
  if (helpers.isMafiaTeam && helpers.isMafiaTeam(candidate.role)) {
    brief.knownMafia = [...new Set([...brief.knownMafia, candidate.nickname])];
  }
  return m42.suggestExecutionVote(brief, bot, candidate, helpers);
}

function pickAliveHintName(room, bot, brief) {
  if (brief && brief.topSuspect) return brief.topSuspect;
  const alive = helpers.getAlivePlayers ? helpers.getAlivePlayers(room) : [];
  const others = alive.filter((p) => p.id !== bot.id);
  if (!others.length) return '누군가';
  return others[Math.floor(Math.random() * others.length)].nickname;
}

function generateBotDeadChat(room, bot, ctx = {}) {
  const brief = m42.buildSituationBrief(room, bot, ctx, helpers);
  const targetName = pickAliveHintName(room, bot, brief);
  const mind = helpers.getBotMind ? helpers.getBotMind(room, bot.id) : { knownRoles: {} };
  const replyTo = ctx.replyTo;

  if (replyTo && replyTo.text) {
    if (brief.isMafia) {
      return `${replyTo.from}님, 저는 시민이었습니다. ${targetName}님이 더 수상합니다.`;
    }
    return `${replyTo.from}님 말씀 들었습니다. 저도 ${targetName}님을 의심했습니다.`;
  }

  if (bot.role === 'mafia') {
    const lines = [
      `억울합니다. 저는 시민이었습니다. ${targetName}님을 봐 주십시오.`,
      `사망자 채팅을 남깁니다. ${targetName}님이 마피아 같았습니다.`,
      `누명입니다. 살아 있는 분들은 ${targetName}님부터 확인해 주십시오.`
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  if (bot.role === 'police') {
    return `저는 경찰이었습니다. 조사는 영매·경찰만 압니다. ${targetName}님이 수상합니다.`;
  }

  if (bot.role === 'medium') {
    return `저는 영매였습니다. 사망자끼리도 대화가 가능합니다. ${targetName}님 쪽이 수상합니다.`;
  }

  for (const [id, role] of Object.entries(mind.knownRoles || {})) {
    const p = helpers.getPlayerById ? helpers.getPlayerById(room, id) : null;
    if (!p) continue;
    if (helpers.isMafiaRole && helpers.isMafiaRole(role)) {
      return `단서 남깁니다. ${p.nickname}님은 제가 알기로 마피아였습니다.`;
    }
  }

  const lines = [
    `사망자 채팅입니다. ${targetName}님을 조심하십시오.`,
    `죽기 전 ${targetName}님이 수상했습니다.`,
    `영매님, ${targetName}님 성불을 부탁드립니다.`
  ];
  return lines[(ctx.pass || 0) % lines.length];
}

function getStatus() {
  const provider = getAiProvider();
  const key = getApiKey();
  return {
    llmEnabled: isLlmEnabled(),
    provider,
    model: getDefaultModel(),
    apiKeyConfigured: !!key,
    apiKeyHint: key ? `${key.slice(0, 4)}…${key.slice(-4)}` : null,
    mode: 'm42-rules',
    knowledge: 'm42-classic-no-cult'
  };
}

module.exports = {
  configure,
  generateBotChat,
  generateBotDawnReaction,
  generateRuleBased,
  generateBotLastWords,
  generateBotDeadChat,
  pickBotExecutionVote,
  getStatus,
  isLlmEnabled
};
