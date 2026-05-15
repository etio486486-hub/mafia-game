/**
 * Bot brain: Mafia42-informed rules + optional LLM.
 */

const m42 = require('./m42-knowledge');
const skillDlg = require('./m42-skill-dialogue');

let helpers = {};

const CHAT_ACCUSE = /마피아|의심|수상|이상|거짓|범인|살인|죽였|처형|지목|투표|공범|속였|거짓말|수상해|이상해|거슬/;
const CHAT_DEFEND = /아니에요|아닙니다|억울|무고|믿어|시민|누명|오해|잘못|진짜/;
const CHAT_TRUST = /믿어|신뢰|시민인 것|마피아 아닌|확신|보호/;
const CHAT_CALL_BOT_DEBATE = /니네|너네|봇|서로|끼리|우리끼리|대화|얘기해|말해|몰아|공격/;
const CHAT_M42_QUIET = /조밤|조용한\s*밤|물총|아무도\s*안\s*죽/;
const CHAT_M42_CLAIM = /직공|직업공개|홀경|홀의|홀군|홀탐|맞경|맞의|쓰리경|홀기|홀시/;
const CHAT_M42_VOTE_META = /자투|무투|몰표|몰투|투갈|맢표|물타기/;

const ROLE_CLAIM_LINES = {
  police: ['저 경찰입니다. 조결 필요하면 말해 주세요.', '홀경입니다. 밤에 수사하겠습니다.'],
  doctor: ['홀의입니다. 치료는 매일 밤 진행 중이에요.', '저 의사예요. 힐 떴으면 믿어 주세요.'],
  reporter: ['홀기입니다. 2밤부터 취재 들어갑니다.', '기자입니다. 팩트만 말할게요.'],
  soldier: ['홀군입니다. 방탄 한 번 있습니다.', '군인이에요. 시민 보호 쪽입니다.'],
  politician: ['정치인입니다. 낮 투표 2표, 찬반 면역이에요.', '저는 투표로 안 죽습니다.'],
  medium: ['영매입니다. 사망자 채팅도 봅니다.', '성불로 단서 낼 수 있어요.'],
  graverobber: ['밤 결과 보고 판단 중이에요.', '저도 정보 모으는 중입니다.'],
  citizen: ['저 일반 시민이에요.', '특수직 아닙니다. 같이 추리해요.'],
  mafia: ['저 일반 시민입니다. 마피아 아닙니다.', '홀시입니다. 오늘은 조용히 가봅시다.'],
  spy: ['저는 시민 쪽이에요. 정보 정리 중입니다.', '홀시입니다. 누가 수상한지 볼게요.']
};

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
    defend: () => '저는 낮 2표이고 찬반 처형은 면역입니다.',
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
    if (!p.alive) continue;
    if (p.nickname && text.includes(p.nickname)) out.push(p);
  }
  return out;
}

function getRecentChat(room, limit = 8) {
  const log = helpers.getChatMessages ? helpers.getChatMessages(room, 'day') : [];
  return log.filter((m) => !m.system && m.text).slice(-limit);
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
      return `${names}님은 조결상 마피아가 아닙니다. 그쪽은 제외하고 투표해요.`;
    }
    if (altName) {
      return `조결 확인했습니다. ${names}님 말고 ${altName}님 행적을 보죠.`;
    }
    return `경찰 조결은 들었어요. ${names}님 말고 다른 사람부터 봅시다.`;
  }

  if (facts.mafia.length && !isMafia) {
    const n = facts.mafia.map((p) => p.nickname).join(', ');
    return `${n}님은 경찰 조사로 마피아입니다. 여기에 맞춰 갑시다.`;
  }

  if (facts.mafia.length && isMafia) {
    return '조결은 일단 넘어가고, 다른 근거부터 맞춰 봅시다.';
  }

  return null;
}

function guardedAccuse(persona, room, bot, targetName, speaker, isMafia) {
  const p = Object.values(room.players).find((x) => x.nickname === targetName && x.alive);
  if (p && isClearedPlayer(room, bot, p)) {
    const alt = pickFactTargetPlayer(room, bot);
    if (alt) return persona.accuse(alt.nickname, speaker);
    return isMafia
      ? '경찰 조결 나온 사람 말고 다른 쪽을 봅시다.'
      : '경찰·기자로 확인된 사람은 의심하지 않는 게 맞아요.';
  }
  return persona.accuse(targetName, speaker);
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

async function callLlm(room, bot, brief, task) {
  if (!isLlmEnabled()) return null;
  const model = process.env.BOT_AI_MODEL || 'gpt-4o-mini';
  const url = process.env.BOT_AI_BASE_URL || 'https://api.openai.com/v1/chat/completions';

  const body = {
    model,
    max_tokens: 120,
    temperature: 0.85,
    messages: [
      { role: 'system', content: m42.buildLlmSystemPrompt() },
      { role: 'user', content: m42.buildLlmUserPrompt(brief, bot, task) }
    ]
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getApiKey()}`
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text || text.length > 200) return null;
    return text.replace(/\s+/g, ' ').slice(0, 180);
  } catch {
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

  if (nightReport && room.game.dayIndex <= 1 && Math.random() < 0.35) {
    const selfLine = skillDlg.pickSelfSkillFollowUp(brief, bot, nightReport);
    if (selfLine) return selfLine;
  }

  if (helpers.isSelfVoteRequest && helpers.isSelfVoteRequest(triggerText)) {
    if (isMafia && Math.random() < 0.4) {
      return '오늘은 무투 가도 될 것 같아요. 마피아만 안 걸리면요.';
    }
    return '딱히 지목할 사람 없으면 자투로 넘기죠. 투갈 나오면 손해예요.';
  }

  if (helpers.isRoleClaimRequest && helpers.isRoleClaimRequest(triggerText)) {
    if (bot.role === 'police' && Math.random() < 0.55) return pickRoleClaimLine(bot);
    if (isMafia) {
      const fact = pickFactTargetPlayer(room, bot);
      if (fact) return `저는 ${fact.nickname}님부터 보고 싶어요.`;
      return Math.random() < 0.7 ? pickRoleClaimLine(bot) : '직공은 들었어요. 조결 맞춰 봅시다.';
    }
    if (Math.random() < 0.45) return pickRoleClaimLine(bot);
    const factClaim = pickFactTargetPlayer(room, bot);
    if (factClaim) return `${factClaim.nickname}님부터 직공·조사 결과 맞춰 봅시다.`;
    return '직공 받되, 경찰·기자 결과랑 맞는지 봐야 해요.';
  }

  if (CHAT_M42_QUIET.test(triggerText) && !isMafia && Math.random() < 0.5) {
    return '조밤이면 은폐·치료·물총 가능성도 있어요. 급하게 몰표하지 맙시다.';
  }

  if (CHAT_M42_VOTE_META.test(triggerText) && Math.random() < 0.45) {
    return `몰표는 위험해요. ${targetName}님 말부터 검증해 봅시다.`;
  }

  if (bot.role === 'police' && helpers.isPoliceReportRequest && last
    && last.fromId !== bot.id && helpers.isPoliceReportRequest(last.text)) {
    if (helpers.buildPolicePublicReport) {
      const report = helpers.buildPolicePublicReport(room);
      if (report && report.police && report.police.id === bot.id) return report.text;
    }
  }

  if (selfSus >= 5 && last && last.fromId !== bot.id) {
    if (CHAT_ACCUSE.test(last.text || '') && findMentioned(room, last.text).some((p) => p.id === bot.id)) {
      return persona.defend();
    }
  }

  if (last && last.fromId !== bot.id && last.text) {
    const policeReact = reactToPoliceReport(room, bot, last, isMafia);
    if (policeReact) return policeReact;

    const speaker = last.from;
    const speakerP = helpers.getPlayerById ? helpers.getPlayerById(room, last.fromId) : null;
    const mentioned = findMentioned(room, last.text);
    const accused = mentioned.find((p) => p.id !== bot.id && p.alive);
    const accusedName = accused ? accused.nickname : targetName;

    if (CHAT_CALL_BOT_DEBATE.test(last.text) && altBot) {
      const lineFn = BOT_DEBATE_LINES[Math.floor(Math.random() * BOT_DEBATE_LINES.length)];
      return lineFn(speaker, altName);
    }

    if (CHAT_ACCUSE.test(last.text) && accused) {
      if (isClearedPlayer(room, bot, accused)) {
        const alt = pickFactTargetPlayer(room, bot);
        if (alt) {
          return `${speaker}님, ${accusedName}님은 경찰 조결상 마피아가 아니에요. ${alt.nickname}님을 봅시다.`;
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
        return guardedAccuse(persona, room, bot, fact.nickname, speaker, isMafia);
      }
      return `${speaker}님, 조사·취재 결과 없이는 성급히 동의하기 어려워요.`;
    }

    if (CHAT_DEFEND.test(last.text) && accused) {
      if (isClearedPlayer(room, bot, accused)) {
        return `${speaker}님 말씀에 동의해요. ${accusedName}님은 조결상 시민 쪽입니다.`;
      }
      if (isMafia && !helpers.isMafiaTeam(accused.role)) {
        const fact = pickFactTargetPlayer(room, bot);
        if (fact) return guardedAccuse(persona, room, bot, fact.nickname, speaker, isMafia);
      }
      if (altBot && Math.random() < 0.5) {
        return guardedAccuse(persona, room, bot, altName, speaker, isMafia);
      }
      return persona.doubt(accusedName);
    }

    if (CHAT_TRUST.test(last.text) && accused && !isMafia) {
      if (isClearedPlayer(room, bot, accused)) {
        return `${speaker}님, ${accusedName}님은 경찰 조사로 무죄예요. 믿어도 됩니다.`;
      }
      const fact = pickFactTargetPlayer(room, bot);
      if (fact) {
        return `${speaker}님, ${accusedName}님보다 ${fact.nickname}님이 팩트상 더 수상해요.`;
      }
      return `${speaker}님, 확실한 결과 나올 때까지 지켜봅시다.`;
    }

    if (mentioned.length === 0 && /누구|누가|어디|왜|뭐|대답|말해|안녕|들리|응답|말씀|얘기|말들/.test(last.text)) {
      const fact = pickFactTargetPlayer(room, bot);
      if (fact) {
        return `${speaker}님, ${fact.nickname}님부터 확인해 봅시다. 조사·취재 결과 기준이에요.`;
      }
      return `${speaker}님, 경찰 조결·기자 취재 나온 뒤에 지목하는 게 맞아요.`;
    }

    const prevBot = pickSpeakerBotFromLastAccuse(room, bot);
    if (prevBot && prevBot.id !== bot.id && !isClearedPlayer(room, bot, prevBot) && Math.random() < 0.5) {
      return persona.doubt(prevBot.nickname);
    }

    if (speakerP && !speakerP.isBot && altBot && Math.random() < 0.65) {
      return guardedAccuse(persona, room, bot, altName, speaker, isMafia);
    }

    const factEnd = pickFactTargetPlayer(room, bot);
    if (factEnd) {
      return guardedAccuse(persona, room, bot, factEnd.nickname, speaker, isMafia);
    }
    return '조사·취재로 확인된 사람만 지목하는 게 좋겠어요.';
  }

  const factOpen = pickFactTargetPlayer(room, bot);
  if (factOpen) {
    return guardedAccuse(persona, room, bot, factOpen.nickname, null, isMafia);
  }

  if (Math.random() < 0.4) {
    return m42.pickOpenLine(brief);
  }

  return isMafia
    ? '조결 나온 사람 말고 다른 근거부터 맞춰 봅시다.'
    : '경찰·기자 결과가 있을 때만 투표·지목하는 게 안전해요.';
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
  if (isLlmEnabled() && Math.random() < 0.35) {
    const llm = await callLlm(room, bot, brief, 'day_chat_reply');
    if (llm) return llm;
  }
  return generateRuleBased(room, bot, ctx);
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
      return `${replyTo.from}님, 저는 시민이었어요. ${targetName}님이 더 수상합니다.`;
    }
    return `${replyTo.from}님 말 들었습니다. 저도 ${targetName}님을 의심했어요.`;
  }

  if (bot.role === 'mafia') {
    const lines = [
      `억울합니다… 저는 시민이었어요. ${targetName}님을 봐주세요.`,
      `사망자 채팅 남깁니다. ${targetName}님이 마피아 같았어요.`,
      `누명이에요. 살아있는 분들은 ${targetName}님부터 확인하세요.`
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  if (bot.role === 'police') {
    return `저는 경찰이었습니다. 조사는 영매·경찰만 알아요. ${targetName}님 수상해요.`;
  }

  if (bot.role === 'medium') {
    return `영매였어요. 사망자끼리도 대화 가능해요. ${targetName}님 쪽이 수상합니다.`;
  }

  for (const [id, role] of Object.entries(mind.knownRoles || {})) {
    const p = helpers.getPlayerById ? helpers.getPlayerById(room, id) : null;
    if (!p) continue;
    if (helpers.isMafiaRole && helpers.isMafiaRole(role)) {
      return `단서 남깁니다. ${p.nickname}님은 제가 알기로 마피아였습니다.`;
    }
  }

  const lines = [
    `사망자 채팅입니다. ${targetName}님을 조심하세요.`,
    `죽기 전 ${targetName}님이 수상했습니다.`,
    `영매님, ${targetName}님 성불 부탁드려요.`
  ];
  return lines[(ctx.pass || 0) % lines.length];
}

function getStatus() {
  return {
    llmEnabled: isLlmEnabled(),
    model: process.env.BOT_AI_MODEL || 'gpt-4o-mini',
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
