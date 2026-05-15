/**
 * Bot conversation brain: rule-based dialogue + optional LLM (OpenAI-compatible API).
 *
 * Env:
 *   BOT_AI_ENABLED=true
 *   OPENAI_API_KEY=sk-...  (or BOT_AI_API_KEY)
 *   BOT_AI_BASE_URL=https://api.openai.com/v1  (optional)
 *   BOT_AI_MODEL=gpt-4o-mini  (optional)
 */

let helpers = {};

const CHAT_ACCUSE = /마피아|의심|수상|이상|거짓|범인|살인|죽였|처형|지목|투표|공범|속였|거짓말|수상해|이상해|거슬/;
const CHAT_DEFEND = /아니에요|아닙니다|억울|무고|믿어|시민|누명|오해|잘못|진짜/;
const CHAT_TRUST = /믿어|신뢰|시민인 것|마피아 아닌|확신|보호/;

const ROLE_PERSONAS = {
  mafia: {
    open: ['일단 차분히 정보를 모아봅시다.', '서로 의심만 하면 마피아가 이득이에요.'],
    accuse: (t, s) => s ? `${s}님 말 들어보니 ${t}님이 더 수상한데요.` : `${t}님 말투가 좀 불안해요.`,
    agree: (t, s) => s ? `${s}님 의견에 동의해요. ${t}님부터 보죠.` : `${t}님 쪽이 마피아 느낌이에요.`,
    defend: () => '저는 시민 편입니다. 저부터 의심하면 안 됩니다.',
    doubt: (t) => `${t}님, 아까 말이랑 지금 말이 달라요.`
  },
  spy: {
    open: ['정보가 부족해요. 누가 뭐라고 했는지 정리해봅시다.'],
    accuse: (t, s) => `${t}님 좀 수상합니다.`,
    agree: (t, s) => s ? `${s}님 말대로 ${t}님을 지켜볼게요.` : `${t}님 의심해볼 만해요.`,
    defend: () => '저는 그냥 관찰만 하고 있어요.',
    doubt: (t) => `${t}님 설명이 부족한 것 같아요.`
  },
  police: {
    open: ['단서부터 정리합시다. 감정 싸움은 위험해요.'],
    accuse: (t) => `수사 관점에서 ${t}님 행적이 수상합니다.`,
    agree: (t, s) => s ? `${s}님 제보와 맞물려 ${t}님이 유력해요.` : `${t}님을 집중 조사해야 합니다.`,
    defend: () => '저는 시민을 보호하려는 입장입니다.',
    doubt: (t) => `${t}님, 알리바이를 다시 말해주세요.`
  },
  doctor: {
    open: ['밤에 무슨 일이 있었는지부터 봅시다.'],
    accuse: (t) => `${t}님이 너무 들뜬 것 같아요. 뭔가 숨기는 느낌?`,
    agree: (t, s) => s ? `저도 ${t}님이 걱정돼요.` : `${t}님 말대로 가면 ${t}님이 의심돼요.`,
    defend: () => '저는 살리려고만 했어요. 왜 저를 보죠?',
    doubt: (t) => `${t}님, 밤에 어디 있었는지 말해줄 수 있어요?`
  },
  reporter: {
    open: ['팩트만 말합시다. 추측은 구분해서요.'],
    accuse: (t) => `제가 보기엔 ${t}님 발언이 일관성이 없어요.`,
    agree: (t, s) => s ? `기사 제목으로 쓰자면 ${t}님입니다.` : `${t}님 쪽으로 기울어요.`,
    defend: () => '저는 취재만 했을 뿐이에요.',
    doubt: (t) => `${t}님, 방금 말 번복하지 않으셨나요?`
  },
  medium: {
    open: ['죽은 분들도 단서일 수 있어요.'],
    accuse: (t) => `${t}님 영혼에 닿은 느낌이… ${t}님이 수상해요.`,
    agree: (t, s) => s ? `${s}님 말에 힘이 있어요. ${t}님을 봅시다.` : `${t}님에게 집중해볼게요.`,
    defend: () => '저는 사망자에게만 말을 걸 뿐이에요.',
    doubt: (t) => `${t}님, 죽은 분 얘기는 왜 피하세요?`
  },
  politician: {
    open: ['투표는 신중하게. 억울한 사람 없게요.'],
    accuse: (t) => `${t}님, 국민을 속이는 타입 같아요.`,
    agree: (t, s) => s ? `${s}님 의견에 공감합니다.` : `${t}님에게 투표할 의향이 있어요.`,
    defend: () => '저는 투표로 죽지 않는 사람입니다. 저는 믿으셔도 됩니다.',
    doubt: (t) => `${t}님 공약이 말뿐인 것 같네요.`
  },
  soldier: {
    open: ['침착하게 가봅시다.'],
    accuse: (t) => `${t}님 전선에서 도망친 것 같아요.`,
    agree: (t, s) => s ? `${s}님 말에 동의합니다.` : `${t}님을 경계해야 합니다.`,
    defend: () => '저는 시민을 지킵니다.',
    doubt: (t) => `${t}님, 자신 있게 말하세요.`
  },
  graverobber: {
    open: ['밤의 결과가 모든 걸 말해줄 거예요.'],
    accuse: (t) => `${t}님 냄새가 마피아 냄새… 농담이고, ${t}님 수상해요.`,
    agree: (t, s) => s ? `${s}님 말 들어보니 ${t}님이 맞는 것 같아요.` : `${t}님 쪽이요.`,
    defend: () => '저는 그냥 지켜보는 중이에요.',
    doubt: (t) => `${t}님, 뭔가 숨기고 있죠?`
  },
  citizen: {
    open: ['저는 일반 시민이에요. 같이 찾아봅시다.'],
    accuse: (t) => `솔직히 ${t}님이 제일 수상해요.`,
    agree: (t, s) => s ? `${s}님 말에 설득됐어요. ${t}님 의심.` : `${t}님한테 투표할래요.`,
    defend: () => '저는 마피아 아닙니다!',
    doubt: (t) => `${t}님 말이 왜 자꾸 바뀌어요?`
  }
};

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

function pickSuspectTarget(room, bot) {
  if (helpers.pickBotDayVoteTarget) return helpers.pickBotDayVoteTarget(room, bot);
  return null;
}

function getSuspectName(room, bot) {
  const id = pickSuspectTarget(room, bot);
  const p = id && helpers.getPlayerById ? helpers.getPlayerById(room, id) : null;
  return p ? p.nickname : '그 사람';
}

function buildInternalBrief(room, bot) {
  const g = room.game;
  const alive = helpers.getAlivePlayers ? helpers.getAlivePlayers(room) : [];
  const mind = helpers.getBotMind ? helpers.getBotMind(room, bot.id) : { knownRoles: {} };
  const known = Object.entries(mind.knownRoles || {})
    .map(([id, role]) => {
      const p = helpers.getPlayerById(room, id);
      return p ? `${p.nickname}=${helpers.ROLE_LABELS[role] || role}` : null;
    })
    .filter(Boolean)
    .join(', ');

  let brief = `밤 ${g.nightIndex || 0}, 낮 ${g.dayIndex || 0}. 생존: ${alive.map(p => p.nickname).join(', ')}.`;
  if (g.dawnAnnouncements && g.dawnAnnouncements.length) {
    brief += ` 아침: ${g.dawnAnnouncements.join(' ')}`;
  }
  if (known) brief += ` 알고있는정보(비밀): ${known}`;
  return brief;
}

function generateRuleBased(room, bot) {
  const persona = getPersona(bot.role);
  const scores = helpers.buildSuspicionScores ? helpers.buildSuspicionScores(room, bot) : {};
  const selfSus = scores[bot.id] || 0;
  const last = getLastMessage(room);
  const targetName = getSuspectName(room, bot);
  const isMafia = helpers.isMafiaTeam && helpers.isMafiaTeam(bot.role);

  if (selfSus >= 5 && last && last.fromId !== bot.id) {
    const def = persona.defend();
    if (CHAT_ACCUSE.test(last.text || '') && findMentioned(room, last.text).some(p => p.id === bot.id)) {
      return def;
    }
  }

  if (last && last.fromId !== bot.id && last.text) {
    const speaker = last.from;
    const mentioned = findMentioned(room, last.text);
    const accused = mentioned.find(p => p.id !== bot.id && p.alive);
    const accusedName = accused ? accused.nickname : targetName;

    if (CHAT_ACCUSE.test(last.text) && accused) {
      if (isMafia && helpers.isMafiaTeam(accused.role)) {
        return persona.doubt(accusedName);
      }
      if (Math.random() < 0.62) {
        return persona.agree(accusedName, speaker);
      }
      return persona.accuse(accusedName, speaker);
    }

    if (CHAT_DEFEND.test(last.text) && accused) {
      if (isMafia && !helpers.isMafiaTeam(accused.role)) {
        return persona.accuse(accusedName, speaker);
      }
      return persona.doubt(accusedName);
    }

    if (CHAT_TRUST.test(last.text) && accused && !isMafia) {
      return `${speaker}님, ${accusedName}님은 좀 더 지켜봐야 할 것 같아요.`;
    }

    if (mentioned.length === 0 && /누구|누가|어디|왜|뭐|대답|말해|안녕|들리|응답|말씀/.test(last.text)) {
      const opens = persona.open || ROLE_PERSONAS.citizen.open;
      const greet = opens[Math.floor(Math.random() * opens.length)];
      return `${speaker}님, ${greet} 저는 ${targetName}님이 가장 수상해요.`;
    }

    return persona.accuse(targetName, speaker);
  }

  if (Math.random() < 0.25) {
    const opens = persona.open || ROLE_PERSONAS.citizen.open;
    return opens[Math.floor(Math.random() * opens.length)];
  }

  return persona.accuse(targetName, null);
}

async function tryLlm(room, bot) {
  const apiKey = getApiKey();
  if (!apiKey || !isLlmEnabled()) return null;

  const now = Date.now();
  if (room.botAiCooldownUntil && now < room.botAiCooldownUntil) return null;
  room.botAiCooldownUntil = now + 6000;

  const recent = getRecentChat(room, 10);
  const chatBlock = recent.length
    ? recent.map(m => `${m.from}: ${m.text}`).join('\n')
    : '(아직 대화 없음)';

  const roleLabel = helpers.ROLE_LABELS[bot.role] || '시민';
  const isMafia = helpers.isMafiaTeam && helpers.isMafiaTeam(bot.role);
  const brief = buildInternalBrief(room, bot);

  const systemPrompt = `당신은 한국어 마피아 게임 플레이어 "${bot.nickname}"입니다.
실제 직업: ${roleLabel} (${isMafia ? '마피아팀, 시민인 척해야 함' : '시민팀'}).
규칙: 1문장만, 55자 이내, 자연스러운 구어체. 직업을 직접 밝히지 마세요(마피아/스파이는 절대 노출).
다른 플레이어 발언에 반응·반박·동조·추리. 최근 채팅에 맞게 답하세요.`;

  const userPrompt = `${brief}

최근 채팅:
${chatBlock}

위 대화에 이어서 ${bot.nickname}의 한 마디만 출력하세요.`;

  const baseUrl = (process.env.BOT_AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.BOT_AI_MODEL || 'gpt-4o-mini',
        temperature: 0.85,
        max_tokens: 80,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      }),
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) {
      console.warn('[BOT-AI] API error', res.status);
      return null;
    }

    const data = await res.json();
    const text = (data.choices && data.choices[0] && data.choices[0].message
      && data.choices[0].message.content) || '';
    const line = String(text).trim().replace(/^["']|["']$/g, '').split('\n')[0].trim();
    if (!line || line.length > 80) return line.slice(0, 80) || null;
    return line;
  } catch (err) {
    console.warn('[BOT-AI] fetch failed', err.message);
    return null;
  }
}

async function generateBotChat(room, bot) {
  // LLM disabled for day chat — too slow and can flood connections on free hosting
  return generateRuleBased(room, bot);
}

function getStatus() {
  return {
    llmEnabled: isLlmEnabled(),
    model: process.env.BOT_AI_MODEL || 'gpt-4o-mini',
    mode: isLlmEnabled() ? 'llm+rules' : 'rules'
  };
}

module.exports = {
  configure,
  generateBotChat,
  generateRuleBased,
  getStatus,
  isLlmEnabled
};
