/**
 * Bot conversation brain: rule-based dialogue (LLM optional, off for day chat).
 */

let helpers = {};

const CHAT_ACCUSE = /마피아|의심|수상|이상|거짓|범인|살인|죽였|처형|지목|투표|공범|속였|거짓말|수상해|이상해|거슬/;
const CHAT_DEFEND = /아니에요|아닙니다|억울|무고|믿어|시민|누명|오해|잘못|진짜/;
const CHAT_TRUST = /믿어|신뢰|시민인 것|마피아 아닌|확신|보호/;
const CHAT_CALL_BOT_DEBATE = /니네|너네|봇|서로|끼리|우리끼리|대화|얘기해|말해|몰아|공격/;

const ROLE_PERSONAS = {
  mafia: {
    open: ['일단 차분히 정보를 모아봅시다.', '서로 의심만 하면 마피아가 이득이에요.'],
    accuse: (t, s) => s ? `${s}님 말 들어보니 ${t}님이 더 수상한데요.` : `${t}님 말투가 좀 불안해요.`,
    agree: (t, s) => s ? `${s}님 의견에 동의해요. ${t}님부터 보죠.` : `${t}님 쪽이 마피아 느낌이에요.`,
    defend: () => '저는 시민 편입니다. 저부터 의심하면 안 됩니다.',
    doubt: (t) => `${t}님, 아까 말이랑 지금 말이 달라요.`,
    redirect: (t) => `잠깐, ${t}님 행동부터 봅시다.`
  },
  spy: {
    open: ['정보가 부족해요. 누가 뭐라고 했는지 정리해봅시다.'],
    accuse: (t, s) => s ? `${s}님 말대로 ${t}님을 지켜볼게요.` : `${t}님 좀 수상합니다.`,
    agree: (t, s) => s ? `${s}님 말에 동의해요. ${t}님 의심.` : `${t}님 쪽이요.`,
    defend: () => '저는 그냥 관찰만 하고 있어요.',
    doubt: (t) => `${t}님 설명이 부족한 것 같아요.`,
    redirect: (t) => `${t}님도 설명해 주세요.`
  },
  police: {
    open: ['단서부터 정리합시다. 감정 싸움은 위험해요.'],
    accuse: (t) => `수사 관점에서 ${t}님 행적이 수상합니다.`,
    agree: (t, s) => s ? `${s}님 제보와 맞물려 ${t}님이 유력해요.` : `${t}님을 집중 조사해야 합니다.`,
    defend: () => '저는 시민을 보호하려는 입장입니다.',
    doubt: (t) => `${t}님, 알리바이를 다시 말해주세요.`,
    redirect: (t) => `우선 ${t}님부터 수사하겠습니다.`
  },
  doctor: {
    open: ['밤에 무슨 일이 있었는지부터 봅시다.'],
    accuse: (t) => `${t}님이 너무 들뜬 것 같아요.`,
    agree: (t, s) => s ? `저도 ${t}님이 걱정돼요.` : `${t}님 말대로 ${t}님 의심.`,
    defend: () => '저는 살리려고만 했어요.',
    doubt: (t) => `${t}님, 밤에 어디 있었는지 말해줄 수 있어요?`,
    redirect: (t) => `${t}님 말도 들어봐야겠어요.`
  },
  reporter: {
    open: ['팩트만 말합시다. 추측은 구분해서요.'],
    accuse: (t) => `제가 보기엔 ${t}님 발언이 일관성이 없어요.`,
    agree: (t, s) => s ? `기사 제목은 ${t}님 쪽이네요.` : `${t}님 쪽으로 기울어요.`,
    defend: () => '저는 취재만 했을 뿐이에요.',
    doubt: (t) => `${t}님, 방금 말 번복하지 않으셨나요?`,
    redirect: (t) => `${t}님 기사도 확인해봐야겠어요.`
  },
  medium: {
    open: ['죽은 분들도 단서일 수 있어요.'],
    accuse: (t) => `${t}님이 수상해요.`,
    agree: (t, s) => s ? `${s}님 말에 힘이 있어요. ${t}님을 봅시다.` : `${t}님에게 집중해볼게요.`,
    defend: () => '저는 사망자에게만 말을 걸 뿐이에요.',
    doubt: (t) => `${t}님, 죽은 분 얘기는 왜 피하세요?`,
    redirect: (t) => `${t}님 쪽 기운이 이상해요.`
  },
  politician: {
    open: ['투표는 신중하게. 억울한 사람 없게요.'],
    accuse: (t) => `${t}님, 국민을 속이는 타입 같아요.`,
    agree: (t, s) => s ? `${s}님 의견에 공감합니다.` : `${t}님에게 투표할 의향이 있어요.`,
    defend: () => '저는 투표로 죽지 않습니다. 저는 믿으셔도 됩니다.',
    doubt: (t) => `${t}님 공약이 말뿐인 것 같네요.`,
    redirect: (t) => `${t}님도 국민 앞에서 답해 주세요.`
  },
  soldier: {
    open: ['침착하게 가봅시다.'],
    accuse: (t) => `${t}님 전선에서 도망친 것 같아요.`,
    agree: (t, s) => s ? `${s}님 말에 동의합니다.` : `${t}님을 경계해야 합니다.`,
    defend: () => '저는 시민을 지킵니다.',
    doubt: (t) => `${t}님, 자신 있게 말하세요.`,
    redirect: (t) => `${t}님도 경계합니다.`
  },
  graverobber: {
    open: ['밤의 결과가 모든 걸 말해줄 거예요.'],
    accuse: (t) => `${t}님 수상해요.`,
    agree: (t, s) => s ? `${s}님 말 들어보니 ${t}님이 맞아요.` : `${t}님 쪽이요.`,
    defend: () => '저는 그냥 지켜보는 중이에요.',
    doubt: (t) => `${t}님, 뭔가 숨기고 있죠?`,
    redirect: (t) => `${t}님 냄새가 나요.`
  },
  citizen: {
    open: ['저는 일반 시민이에요. 같이 찾아봅시다.'],
    accuse: (t) => `솔직히 ${t}님이 수상해요.`,
    agree: (t, s) => s ? `${s}님 말에 설득됐어요. ${t}님 의심.` : `${t}님한테 투표할래요.`,
    defend: () => '저는 마피아 아닙니다!',
    doubt: (t) => `${t}님 말이 왜 자꾸 바뀌어요?`,
    redirect: (t) => `저는 ${t}님이 더 의심돼요.`
  }
};

const BOT_DEBATE_LINES = [
  (a, b) => `${a}님 말, ${b}님이랑 안 맞는 것 같아요.`,
  (a, b) => `저는 ${a}님보다 ${b}님이 수상해요.`,
  (a, b) => `${a}님이 ${b}님 너무 믿는 것 같아요.`,
  (a, b) => `잠깐, ${b}님부터 물어봅시다.`
];

function configure(h) {
  helpers = { ...helpers, ...h };
}

function isLlmEnabled() {
  if (process.env.BOT_AI_ENABLED === 'false') return false;
  if (process.env.BOT_AI_ENABLED === 'true') return !!getApiKey();
  return !!getApiKey();
}

function getApiKey() {
  return process.env.BOT_AI_API_KEY || process.env.OPENAI_API_KEY || '';
}

function getPersona(role) {
  return ROLE_PERSONAS[role] || ROLE_PERSONAS.citizen;
}

function findMentioned(room, text) {
  if (!text) return [];
  const out = [];
  const players = Object.values(room.players).sort((a, b) => b.nickname.length - a.nickname.length);
  for (const p of players) {
    if (p.nickname && text.includes(p.nickname)) out.push(p);
  }
  return out;
}

function getRecentChat(room, limit = 8) {
  const log = helpers.getChatMessages ? helpers.getChatMessages(room, 'day') : [];
  return log.filter(m => !m.system && m.text).slice(-limit);
}

function getLastMessage(room) {
  const recent = getRecentChat(room, 1);
  return recent.length ? recent[recent.length - 1] : null;
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
  return id && helpers.getPlayerById ? helpers.getPlayerById(room, id) : null;
}

function pickAnotherBot(room, bot, excludeId) {
  const alive = helpers.getAlivePlayers ? helpers.getAlivePlayers(room) : [];
  const bots = alive.filter(p => p.isBot && p.id !== bot.id && p.id !== excludeId);
  if (!bots.length) return null;
  return bots[Math.floor(Math.random() * bots.length)];
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

function generateRuleBased(room, bot) {
  const persona = getPersona(bot.role);
  const scores = helpers.buildSuspicionScores ? helpers.buildSuspicionScores(room, bot) : {};
  const selfSus = scores[bot.id] || 0;
  const last = getLastMessage(room);
  const target = getTargetPlayer(room, bot);
  const targetName = target ? target.nickname : '그 사람';
  const isMafia = helpers.isMafiaTeam && helpers.isMafiaTeam(bot.role);

  const altBot = pickAnotherBot(room, bot, target ? target.id : null);
  const altName = altBot ? altBot.nickname : targetName;

  if (selfSus >= 5 && last && last.fromId !== bot.id) {
    if (CHAT_ACCUSE.test(last.text || '') && findMentioned(room, last.text).some(p => p.id === bot.id)) {
      return persona.defend();
    }
  }

  if (last && last.fromId !== bot.id && last.text) {
    const speaker = last.from;
    const speakerP = helpers.getPlayerById ? helpers.getPlayerById(room, last.fromId) : null;
    const mentioned = findMentioned(room, last.text);
    const accused = mentioned.find(p => p.id !== bot.id && p.alive);
    const accusedName = accused ? accused.nickname : targetName;

    if (CHAT_CALL_BOT_DEBATE.test(last.text) && altBot) {
      const lineFn = BOT_DEBATE_LINES[Math.floor(Math.random() * BOT_DEBATE_LINES.length)];
      return lineFn(speaker, altName);
    }

    if (CHAT_ACCUSE.test(last.text) && accused) {
      if (isMafia && helpers.isMafiaTeam(accused.role)) {
        return persona.doubt(accusedName);
      }
      if (speakerP && speakerP.isBot && accused.isBot && Math.random() < 0.45) {
        return `${speaker}님, ${accusedName}님 말만 믿기엔 이릅니다.`;
      }
      if (speakerP && !speakerP.isBot && accused.isBot && Math.random() < 0.35) {
        return persona.doubt(accusedName);
      }
      if (accused.isBot && altBot && Math.random() < 0.4) {
        return persona.redirect(altName);
      }
      if (Math.random() < 0.55) {
        return persona.agree(accusedName, speaker);
      }
      return persona.accuse(accusedName, speaker);
    }

    if (CHAT_DEFEND.test(last.text) && accused) {
      if (isMafia && !helpers.isMafiaTeam(accused.role)) {
        return persona.accuse(accusedName, speaker);
      }
      if (altBot && Math.random() < 0.5) {
        return persona.accuse(altName, speaker);
      }
      return persona.doubt(accusedName);
    }

    if (CHAT_TRUST.test(last.text) && accused && !isMafia) {
      if (altBot) return `${speaker}님, ${accusedName}님보다 ${altName}님이 더 수상해요.`;
      return `${speaker}님, ${accusedName}님은 좀 더 지켜봐야 할 것 같아요.`;
    }

    if (mentioned.length === 0 && /누구|누가|어디|왜|뭐|대답|말해|안녕|들리|응답|말씀/.test(last.text)) {
      const greet = (persona.open || ROLE_PERSONAS.citizen.open)[0];
      const focus = (speakerP && !speakerP.isBot && altBot) ? altName : targetName;
      return `${speaker}님, ${greet} 저는 ${focus}님이 수상해요.`;
    }

    const prevBot = pickSpeakerBotFromLastAccuse(room, bot);
    if (prevBot && prevBot.id !== bot.id && Math.random() < 0.5) {
      return persona.doubt(prevBot.nickname);
    }

    if (speakerP && !speakerP.isBot && altBot && Math.random() < 0.65) {
      return persona.accuse(altName, speaker);
    }

    return persona.accuse(targetName, speaker);
  }

  if (Math.random() < 0.35) {
    const opens = persona.open || ROLE_PERSONAS.citizen.open;
    return opens[Math.floor(Math.random() * opens.length)];
  }

  if (altBot && Math.random() < 0.55) {
    return persona.accuse(altName, null);
  }

  return persona.accuse(targetName, null);
}

async function generateBotChat(room, bot) {
  return generateRuleBased(room, bot);
}

function getStatus() {
  return {
    llmEnabled: isLlmEnabled(),
    model: process.env.BOT_AI_MODEL || 'gpt-4o-mini',
    mode: 'rules'
  };
}

module.exports = {
  configure,
  generateBotChat,
  generateRuleBased,
  getStatus,
  isLlmEnabled
};
