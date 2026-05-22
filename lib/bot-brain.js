/**
 * Bot brain: Mafia42-informed rules + optional LLM.
 */

const m42 = require('./m42-knowledge');
const skillDlg = require('./m42-skill-dialogue');
const m42Bluff = require('./m42-bluff');
const voteFacts = require('./bot-vote-facts');
const chatFilter = require('./bot-chat-filter');
const m42CultBots = require('./m42-cult-bots');
const m42Cult = require('./m42-cult');
const mediumPurify = require('./bot-medium-purify');
const m42PoliceCitizen = require('./m42-police-citizen');
const m42Matclaim = require('./m42-matclaim-playbook');
const m42MatProb = require('./m42-matgyeong-probability');
const policeFmt = require('./police-report-format');
const m42Pd = require('./m42-private-detective');
const m42PdInterview = require('./m42-pd-role-interview');
const m42RoleConfirm = require('./m42-role-confirm');
const { agentLog } = require('./debug-agent-log');

let helpers = {};

const CHAT_ACCUSE = /마피아|의심|수상|이상|거짓|범인|살인|죽였|처형|지목|투표|공범|속였|거짓말|수상해|이상해|거슬/;
const CHAT_DEFEND = /아니에요|아닙니다|억울|무고|믿어|시민|누명|오해|잘못|진짜/;
const CHAT_TRUST = /믿어|신뢰|시민인 것|마피아 아닌|확신|보호/;
const CHAT_CALL_BOT_DEBATE = /니네|너네|봇|서로|끼리|우리끼리|대화|얘기해|말해|몰아|공격/;
const CHAT_MEDIUM_PURIFY = /영매\s*성불|성불\s*(?:해|해주|부탁|좀)|성불해|영매님.*성불|성불\s*부탁/;
const CHAT_M42_QUIET = /조밤|조용한\s*밤|물총|아무도\s*안\s*죽/;
const CHAT_M42_CLAIM = /직공|직업공개|홀경|홀의|홀군|홀탐|맞경|맞의|쓰리경|홀기|홀시/;
const CHAT_M42_VOTE_META = /자투|무투|몰표|몰투|투갈|맢표|물타기|시무|칼시단|방매|ㅈㅌ|ㅁㅌ/;
const CHAT_M42_CLAIM_META = /홀경|홀의|홀군|홀기|맞경|맞의|맞직|맞경찰|쓰리경|확경|확직|늦경|눈치경|짭경|진경|무직|직공|ㅈㄱ|풍지|대립/;
const CHAT_M42_NIGHT_META = /조밤|물총|퍼블|연퍼|퍼경|경퍼|노연퍼|밤챗|접선|맢킬|홀맢|짝맢/;
const CHAT_M42_POLICE_META = /조결|경조|경조결|경크|노맢|n맢|n노맢|수사결과|조사결과|경찰조사|경찰조사결과/;
const CHAT_WHY_EVIDENCE = /왜|근거|이유|무슨\s*근거|뭐가\s*수상|왜\s*수상|근거가|근거는/;
const CHAT_CONFUSION = /뭐고|갑자기|뭐야|왜케|황당|ㅋㅋ|ㅎㅎ|맞경|맢/;

const CULT_LEADER_ROLE = 'cult_leader';

const MAFIA_FAKE_CLAIM_ROLES = {
  mafia: ['citizen', 'private_detective', 'police', 'doctor', 'soldier', 'reporter', 'medium', 'politician'],
  spy: ['citizen', 'private_detective', 'police', 'soldier', 'reporter', 'medium', 'politician'],
  cult_leader: ['citizen', 'citizen', 'private_detective', 'police', 'doctor', 'soldier', 'reporter', 'medium', 'politician']
};

/** 마피아팀·교주·신도 — 낮 공개 채팅 블러핑 대상 */
function isEvilBluffBot(bot) {
  return m42Bluff.isEvilBluffBot(bot, helpers);
}

const ROLE_CLAIM_LINES = {
  police: ['저는 경찰입니다. 조결이 필요하면 말씀해 주십시오.', '홀경입니다. 밤에 수사하겠습니다.'],
  doctor: [
    '저는 시민입니다. 의사는 특수직이라 눈힐이 낫고 직공은 하지 않겠습니다.',
    '의사는 특수직입니다. 저는 직공하지 않고 조결·추리를 따르겠습니다.',
    '특수직인 의사는 직공하면 표적이 됩니다. 힐 여부는 말하지 않겠습니다.'
  ],
  reporter: ['홀기입니다. 2밤부터 취재에 들어갑니다.', '저는 기자입니다. 팩트만 말하겠습니다.'],
  soldier: ['홀군입니다. 방탄은 한 번 있습니다.', '저는 군인입니다. 시민 보호 편입니다.'],
  politician: [
    '저는 정치인입니다. 투표로 확인해 주십시오.',
    '정치인 본인입니다. 낮 2표·찬반 면역은 투표로 검증해 주십시오.'
  ],
  medium: ['저는 영매입니다. 사망자 채팅도 봅니다.', '성불로 단서를 드릴 수 있습니다.'],
  graverobber: ['밤 결과를 보고 판단 중입니다.', '저도 정보를 모으는 중입니다.'],
  private_detective: [
    '사립탐정입니다. 밤에 한 분의 손 방향만 봅니다. 낮에 발언으로 맞춰 보겠습니다.',
    '저는 관찰형입니다. 경찰·기자 조결과 같이 보겠습니다.'
  ],
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
    open: [
      '경찰 조결부터 맞춰 가겠습니다.',
      '저는 정치인입니다. 투표로 확인해 주십시오.'
    ],
    accuse: (t) => `${t}님 수상합니다. 경찰 조결·취재와 같이 보겠습니다.`,
    agree: (t, s) => s ? `${s}님 말에 동의합니다.` : `${t}님 쪽으로 표 모읍니다.`,
    defend: () => '저는 정치인입니다. 투표로 확인해 주십시오.',
    doubt: (t) => `${t}님, 조결과 맞는지부터 말씀해 주십시오.`,
    redirect: (t) => `${t}님도 경찰 조결 기준으로 설명해 주십시오.`
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
  private_detective: {
    open: ['밤에 누가 누구에게 손을 뻗는지 보는 편입니다. 낮에는 발언으로 교차검증하겠습니다.'],
    accuse: (t) => `관찰상 ${t}님 쪽 행적이 애매합니다. 조결·취재와 맞춰 보겠습니다.`,
    agree: (t, s) => s ? `${s}님 말과 제 관찰이 겹칩니다. ${t}님을 더 보겠습니다.` : `${t}님 지목 방향이 수상했습니다.`,
    defend: () => '저는 밤에 한 사람의 동작만 봅니다. 직공은 신중히 하겠습니다.',
    doubt: (t) => `${t}님, 밤에 누구를 지목하셨는지 설명해 주실 수 있습니까?`,
    redirect: (t) => `${t}님 발언과 손 방향이 맞는지부터 보겠습니다.`
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

function accuseWithReason(room, bot, targetId, speaker = null) {
  if (!targetId) return null;
  if (helpers.formatAccuseLine) {
    const line = helpers.formatAccuseLine(room, bot, targetId, speaker);
    if (line) return line;
  }
  return null;
}

function personaAccuseSafe(room, bot, targetName, speaker = null) {
  const p = Object.values(room.players || {}).find((pl) => pl.nickname === targetName && pl.alive);
  if (p) {
    const line = accuseWithReason(room, bot, p.id, speaker);
    if (line) return line;
  }
  return '아직 조결·취재 팩트가 없어 무근거 지목은 하지 않겠습니다.';
}

/** "왜 수상?", "근거" 질문에 답변 */
function reactToEvidenceRequest(room, bot, triggerText, last) {
  const raw = `${triggerText || ''} ${last && last.text ? last.text : ''}`;
  const compact = raw.replace(/\s+/g, '');
  if (!CHAT_WHY_EVIDENCE.test(compact) && !/왜.*수상|근거/.test(compact)) return null;

  const recent = getRecentChat(room, 12);
  for (let i = recent.length - 1; i >= 0; i--) {
    const msg = recent[i];
    if (!msg.text || !/수상|의심/.test(msg.text)) continue;
    const mentioned = findMentioned(room, msg.text).filter((p) => p.alive && p.id !== bot.id);
    for (const p of mentioned) {
      const reason = helpers.getAccuseReasonForTarget
        ? helpers.getAccuseReasonForTarget(room, bot, p.id)
        : null;
      if (!reason) continue;
      if (msg.fromId === bot.id) {
        return `${p.nickname}님은 ${reason} 때문에 수상하다고 말씀드렸습니다.`;
      }
      return `${msg.from}님이 ${p.nickname}님을 의심했고, 저도 ${reason} 쪽으로 봅니다.`;
    }
  }

  const myAccuse = [...recent].reverse().find(
    (m) => m.fromId === bot.id && /수상|의심/.test(m.text || '')
  );
  if (myAccuse) {
    return '제가 아까 말한 의심은 팩트가 부족했습니다. 조결·취재가 나오면 근거를 붙이겠습니다.';
  }

  return '지목할 때는 경찰 조결·기자 취재·조사 결과 같은 근거를 먼저 말하는 것이 맞습니다.';
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
  return null;
}

function isBotAccusedInChat(room, bot, text) {
  if (!text) return false;
  const accusePat = CHAT_ACCUSE.test(text)
    || /마피아|범인|처형|죽여|몰표|지목|투표해|의심해|수상해/.test(text);
  if (!accusePat) return false;
  if (findMentioned(room, text).some((p) => p.id === bot.id)) return true;
  const nick = String(bot.nickname || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return nick.length > 0 && new RegExp(nick, 'i').test(text);
}

function buildInnocentWhyClause(bot, brief) {
  const isMafia = brief.isMafia;
  switch (bot.role) {
    case 'police':
      return '저는 경찰인데 아직 저를 수사한 적도 없으시죠. 무근거로 밀면 시민이 손해입니다';
    case 'doctor':
      return '저는 시민 편입니다. 밤에 치료만 했을 뿐 마피아가 아닙니다';
    case 'politician':
      return '저는 정치인입니다. 찬반 면역이니 투표로 확인해 주십시오';
    case 'soldier':
      return '저는 군인입니다. 시민 보호 편인데 저만 찍으면 마피아 이득입니다';
    case 'reporter':
      return '저는 기자입니다. 팩트 없이 저만 의심하면 취재 방향이 틀어집니다';
    case 'medium':
      return '저는 영매입니다. 사망자 말만으로 저를 몰면 안 됩니다';
    case 'graverobber':
      return '저는 시민 쪽입니다. 아직 조결·취재도 없는데 저만 밀면 안 됩니다';
    case 'cult_leader':
      return '저는 시민입니다. 조결·취재도 없는데 저만 밀면 투갈 나옵니다';
    case 'mafia':
    case 'spy':
      return isMafia
        ? '저는 시민입니다. 조결·취재도 없는데 저만 밀면 투갈 나옵니다'
        : '저는 시민입니다';
    default:
      return '저한테 붙은 근거가 없습니다. 조결·취재 없이 몰표하면 억울합니다';
  }
}

/** 자신이 의심·지목당했을 때: 억울함 설명 + 다른 수상자(근거) */
function buildSelfDefenseLine(room, bot, brief, last) {
  const speaker = last && last.from ? `${last.from}님` : '지금 의심하시는 분';
  const innocentWhy = buildInnocentWhyClause(bot, brief);
  const fact = pickFactTargetPlayer(room, bot);
  const suspectName = fact
    ? fact.nickname
    : (brief.topSuspect && brief.topSuspect !== '누군가' ? brief.topSuspect : null);
  const reason = fact && helpers.getAccuseReasonForTarget
    ? helpers.getAccuseReasonForTarget(room, bot, fact.id)
    : null;

  if (suspectName && reason) {
    return `${speaker}, ${innocentWhy}. ${reason} 때문에 ${suspectName}님 쪽이 더 수상합니다.`;
  }
  if (suspectName) {
    return `${speaker}, ${innocentWhy}. 발언·투표 흐름상 ${suspectName}님을 먼저 보는 게 맞습니다.`;
  }
  if (!brief.isMafia && brief.knownMafia.length) {
    return `${speaker}, ${innocentWhy}. ${brief.knownMafia[0]}님 쪽이 마피아로 보이는데 왜 저입니까?`;
  }
  const altBot = pickAnotherBot(room, bot, bot.id);
  if (altBot) {
    const altReason = helpers.getAccuseReasonForTarget
      ? helpers.getAccuseReasonForTarget(room, bot, altBot.id)
      : null;
    if (altReason) {
      return `${speaker}, ${innocentWhy}. ${altReason} 때문에 ${altBot.nickname}님을 먼저 보겠습니다.`;
    }
    return `${speaker}, ${innocentWhy}. ${altBot.nickname}님 발언이 더 수상합니다.`;
  }
  return `${speaker}, ${innocentWhy}. 팩트가 나올 때까지 다른 사람 발언부터 들어보겠습니다.`;
}

function reactToPoliceReport(room, bot, last, isMafia) {
  if (!last?.text || !helpers.parsePoliceReportFromText) return null;

  const speaker = getSpeakerPlayer(room, last);
  const facts = helpers.parsePoliceReportFromText(room, last.text);
  const hasVerdict = !!(facts.innocent.length || facts.mafia.length);
  const looksReport = messageLooksLikePoliceReport(room, last);
  if (!hasVerdict && !looksReport) return null;
  if (!m42Bluff.isTrustedHolgyeongPoliceSpeaker(room, speaker, helpers)) return null;

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

  const alt = pickFactTargetPlayer(room, bot);
  const altName = alt ? alt.nickname : null;

  if (facts.innocent.length) {
    const names = facts.innocent.map((p) => p.nickname).join(', ');
    if (facts.innocent.some((p) => p.id === bot.id)) {
      return '조결 말씀 들었습니다. 저는 마피아 아닙니다. 다른 쪽부터 보겠습니다.';
    }
    if (!isMafia) {
      if (altName) {
        return `${names}님은 홀경 조결로 마피아가 아닙니다. ${altName}님부터 확인합시다.`;
      }
      return `${names}님은 홀경 조결상 무죄입니다. 그쪽은 제외하고 투표하겠습니다.`;
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

function isPublicPrivateDetectivePlayer(room, playerId) {
  if (helpers.isPublicPrivateDetectiveClaim && helpers.isPublicPrivateDetectiveClaim(room, playerId)) {
    return true;
  }
  const slots = m42RoleConfirm.resolvePerformerRoleSlots(
    room,
    helpers,
    helpers.roleLabels || {}
  );
  return slots.confirmedById[playerId] === 'private_detective';
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
    `경찰 직공이 나왔습니다. 조결·다른 분 추리를 기준으로 가겠습니다. 의사는 특수직이라 직공하지 않습니다.`,
    `${speaker.nickname}님 조사 결과부터 맞추겠습니다. 특수직인 의사는 눈힐이 낫습니다.`
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
  if (!/확실|맞경|맞직|홀경|진경|짭경|경찰입니다|인거|인가|네요|네$|이다|였|공개|정보|얻었|알았|인정/.test(compact)) {
    return null;
  }

  if (isMafia) {
    const bluff = m42Bluff.reactToClaimBluff(room, bot, true, last.text, last, helpers);
    if (bluff) return bluff;
    return chatFilter.pickSafeReplacement(true);
  }
  return '경찰 조결이 나왔다면 그 결과를 기준으로 가겠습니다. 사망자 직공은 따르지 않습니다.';
}

function finalizeBotLine(room, bot, text) {
  if (!text) return text;
  const raw = String(text);
  if (m42Bluff.isEvilBluffBot && m42Bluff.isEvilBluffBot(bot, helpers) && m42Bluff.enforceBluffRoleConsistency) {
    text = m42Bluff.enforceBluffRoleConsistency(text, room, bot, helpers);
  }
  const sanitized = chatFilter.sanitizeBotChatLine(text, bot, helpers.isMafiaTeam, room, helpers);
  if (helpers.isMafiaTeam && helpers.isMafiaTeam(bot.role) && room?.players) {
    const accusedLike = /맞경|짭경|진경|거짓|수상|마피아|의심|처형|투표/.test(raw);
    if (accusedLike) {
      const allyMentioned = Object.values(room.players)
        .filter((p) => p && p.id !== bot.id && p.alive && helpers.isMafiaTeam(p.role))
        .filter((p) => p.nickname && raw.includes(p.nickname))
        .map((p) => p.nickname);
      if (allyMentioned.length) {
        // #region agent log
        agentLog({
          hypothesisId: 'ALLY_CHAT_2',
          location: 'lib/bot-brain.js:finalizeBotLine',
          message: 'evil bot raw line contains ally mention with accuse-like tone',
          runId: 'ally-protect-check',
          data: {
            bot: bot.nickname,
            role: bot.role,
            alliesMentioned: allyMentioned,
            raw: raw.slice(0, 180),
            sanitized: String(sanitized || '').slice(0, 180)
          }
        });
        // #endregion
      }
    }
  }
  return sanitized;
}

function guardedAccuse(room, bot, targetId, speaker) {
  const p = helpers.getPlayerById ? helpers.getPlayerById(room, targetId) : null;
  if (!p || isDeadPlayer(p)) {
    return '사망자는 지목·의심 대상이 아닙니다.';
  }
  if (m42CultBots.isCultAlly(room, bot, p)) {
    return m42CultBots.pickCultDeflectLine(speaker || '다른 분', p.nickname);
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

  if (isEvilBluffBot(bot)) {
    return m42Bluff.buildCitizenBluffRollCallAnswer(room, bot, helpers);
  }

  const role = bot.role;
  const name = roleLabel(role);

  if (role === 'doctor') {
    const claimLines = [
      '저는 일반 시민입니다. 의사는 특수직이라 직공하지 않겠습니다.',
      '무직 시민입니다. 경찰·의사 같은 특수직은 제가 아닙니다.',
      '저는 시민입니다. 특수직(의사)은 직공하지 않고 눈힐이 낫습니다.'
    ];
    return claimLines[Math.floor(Math.random() * claimLines.length)];
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
    if (bot.isBot) {
      const short = [
        `저는 ${name}입니다. 투표로 확인해 주십시오.`,
        '정치인 본인입니다. 낮 2표·찬반 면역은 투표로 검증해 주십시오.'
      ];
      return short[Math.floor(Math.random() * short.length)];
    }
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

const LLM_FETCH_MS = 9000;

async function callLlmOpenAI(model, systemPrompt, userPrompt) {
  const url = process.env.BOT_AI_BASE_URL || 'https://api.openai.com/v1/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getApiKey()}`
    },
    signal: AbortSignal.timeout(LLM_FETCH_MS),
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
    signal: AbortSignal.timeout(LLM_FETCH_MS),
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

function wantsPoliceReport(room, triggerText, last, bot) {
  if (!helpers.isPoliceReportRequest) return false;
  const isReq = (t) => {
    if (!t) return false;
    if (helpers.isPoliceReportProviding && helpers.isPoliceReportProviding(t, room)) return false;
    return helpers.isPoliceReportRequest(t, room);
  };
  const fromOther = last && last.fromId !== bot.id && isReq(last.text);
  const fromTrigger = triggerText && isReq(triggerText);
  return !!(fromOther || fromTrigger);
}

function messageLooksLikePoliceReport(room, msg) {
  if (!msg?.text) return false;
  if (voteFacts.isPoliceReportProviding(msg.text, room)) return true;
  if (policeFmt.hasSubstantivePoliceVerdict(msg.text, room)) return true;
  if (policeFmt.looksLikePoliceReport(msg.text, room)) return true;
  return false;
}

function findRecentPoliceReport(room, opts = {}) {
  const dayChat = helpers.getChatMessages
    ? helpers.getChatMessages(room, 'day')
    : (room.chatLog && room.chatLog.day) ? room.chatLog.day : [];
  const lookback = opts.lookback || 18;
  const skipId = opts.skipSpeakerId;
  for (let i = dayChat.length - 1; i >= 0; i--) {
    const msg = dayChat[i];
    if (!msg?.text || !msg.fromId) continue;
    if (skipId && msg.fromId === skipId) continue;
    if (dayChat.length - i > lookback) break;
    const sp = helpers.getPlayerById ? helpers.getPlayerById(room, msg.fromId) : null;
    const parsed = voteFacts.parsePoliceReportFromText(room, msg.text);
    const hasNames = parsed.mafia.length || parsed.innocent.length;
    const looksReport = messageLooksLikePoliceReport(room, msg);
    const policeSpeaker = sp && (
      sp.role === 'police'
      || (helpers.isPublicPoliceClaim && helpers.isPublicPoliceClaim(room, sp.id))
    );
    if (!hasNames && !looksReport) continue;
    if (!policeSpeaker && !looksReport) continue;
    return {
      msg,
      speaker: sp,
      parsed,
      metaOnly: !hasNames && looksReport
    };
  }
  return null;
}

function findRecentHumanPoliceReport(room) {
  const recent = findRecentPoliceReport(room, { lookback: 20 });
  if (!recent?.speaker || recent.speaker.isBot) return null;
  return recent;
}

function buildAckFromPrivateDetectiveParsed(room, bot, who, parsed) {
  if (!parsed?.watch) return null;
  const w = parsed.watch.nickname;
  if (parsed.passive) {
    return `${who}님 사탐 관찰 확인했습니다. ${w}님은 밤 지목이 없어 경찰 조결과 같이 무죄로 보겠습니다.`;
  }
  if (parsed.kind === 'mafia_kill') {
    if (parsed.watch.id === bot.id) {
      return `${who}님 관찰과 다릅니다. 저는 밤에 킬 지목을 쓰지 않았습니다.`;
    }
    return `${who}님 사탐 관찰 확인했습니다. ${w}님이 밤 킬 지목을 썼습니다. 표를 맞추겠습니다.`;
  }
  if (parsed.kind === 'police') {
    return `${who}님 관찰대로 ${w}님은 경찰 수사 손으로 보입니다. 조결과 같이 따르겠습니다.`;
  }
  if (parsed.kind === 'doctor') {
    return `${who}님 관찰대로 ${w}님은 의사 치료 손으로 보입니다. ${w}님은 일단 무죄 쪽으로 보겠습니다.`;
  }
  if (parsed.pointed) {
    return `${who}님 관찰 확인했습니다. ${w}님→${parsed.pointed.nickname}님 방향 지목, 추가 조사와 맞춰 보겠습니다.`;
  }
  return `${who}님 사탐 브리핑 확인했습니다. ${w}님 관찰을 경찰 조결과 동급으로 보겠습니다.`;
}

function reactToHumanPrivateDetectiveReport(room, bot, ctx, last) {
  const text = ctx.triggerText || (last && last.text) || '';
  let speaker = null;
  if (ctx.reportFromId && helpers.getPlayerById) {
    speaker = helpers.getPlayerById(room, ctx.reportFromId);
  }
  if ((!speaker || speaker.role !== 'private_detective') && last && last.fromId !== bot.id) {
    const sp = helpers.getPlayerById(room, last.fromId);
    if (sp && sp.role === 'private_detective') {
      speaker = sp;
    }
  }
  if (!speaker || speaker.id === bot.id) return null;
  if (!m42Pd.isTrustedPrivateDetectiveSpeaker(room, speaker, helpers)) return null;

  const parsed = m42Pd.parseDetectiveReportFromText(room, text || (last && last.text) || '');
  if (!parsed.watch) return null;

  const who = speaker.nickname || '사립탐정';
  return buildAckFromPrivateDetectiveParsed(room, bot, who, parsed);
}

function reactToPrivateDetectiveReport(room, bot, last, isMafia) {
  if (!last?.text) return null;
  const speaker = getSpeakerPlayer(room, last);
  if (!m42Pd.isTrustedPrivateDetectiveSpeaker(room, speaker, helpers)) return null;
  const parsed = m42Pd.parseDetectiveReportFromText(room, last.text);
  if (!parsed.watch) return null;
  const who = last.from || speaker?.nickname || '사립탐정';
  if (parsed.passive) {
    if (parsed.watch.id === bot.id) {
      return `${who}님 관찰 확인했습니다. 저는 패시브라 밤 지목이 없었습니다.`;
    }
    if (!isMafia) {
      const alt = pickFactTargetPlayer(room, bot);
      const altName = alt ? alt.nickname : null;
      if (altName) {
        return `${who}님 관찰대로 ${parsed.watch.nickname}님은 무죄입니다. ${altName}님부터 보겠습니다.`;
      }
      return `${who}님 관찰대로 ${parsed.watch.nickname}님은 밤 행동이 없어 무죄로 보겠습니다.`;
    }
  }
  if (parsed.kind === 'mafia_kill' && !isMafia) {
    if (parsed.watch.id === bot.id) {
      return `${who}님 관찰과 다릅니다. 저는 마피아가 아닙니다.`;
    }
    return `${who}님 사탐 관찰대로 ${parsed.watch.nickname}님이 킬 지목을 썼습니다. 여기에 맞춰 갑시다.`;
  }
  return buildAckFromPrivateDetectiveParsed(room, bot, who, parsed);
}

function buildAckFromPoliceParsed(room, bot, who, parsed) {
  const { mafia, innocent } = parsed;
  if (mafia.length) {
    const target = mafia[0];
    if (target.id === bot.id) {
      return `${who}님 조결과 다릅니다. 저는 마피아가 아닙니다.`;
    }
    if (helpers.isMafiaTeam && helpers.isMafiaTeam(bot.role)) {
      if (helpers.isMafiaTeam(target.role)) {
        return `${who}님 조결은 참고하겠습니다. ${target.nickname}님 건은 추가 확인 후 정리하겠습니다.`;
      }
      const line = helpers.formatAccuseLine
        ? helpers.formatAccuseLine(room, bot, target.id, who)
        : null;
      if (line) return line;
      return `${who}님 조결대로 ${target.nickname}님 쪽을 의심하겠습니다.`;
    }
    const line = helpers.formatAccuseLine
      ? helpers.formatAccuseLine(room, bot, target.id, who)
      : null;
    if (line) return line;
    return `${who}님 조결 확인했습니다. ${target.nickname}님 대상으로 표를 맞춰 보겠습니다.`;
  }
  if (innocent.length) {
    return `${who}님 홀경 조결 확인했습니다. ${innocent[0].nickname}님은 마피아가 아니니 무죄로 보고 따라가겠습니다.`;
  }
  return null;
}

/** 조결 요청인데 채팅에 이미 조결이 있을 때 */
function reactWhenPoliceReportAlreadyGiven(room, bot, last, triggerText) {
  if (!last || last.fromId === bot.id) return null;
  if (!wantsPoliceReport(room, triggerText, last, bot)) return null;
  const recent = findRecentPoliceReport(room, { skipSpeakerId: bot.id, lookback: 16 });
  if (!recent || recent.msg.fromId === bot.id) return null;
  const reporter = recent.speaker?.nickname || recent.msg.from;
  const asker = last.from;
  if (recent.metaOnly) {
    return `${asker}님, ${reporter}님이 수사·조결을 이미 채팅에 올렸습니다. 위 내용부터 읽고 같이 지목합시다.`;
  }
  const ack = buildAckFromPoliceParsed(room, bot, reporter, recent.parsed);
  if (ack) {
    return `${asker}님, ${reporter}님이 이미 조결을 올렸습니다. ${ack}`;
  }
  return `${asker}님, ${reporter}님 조결이 방금 있습니다. 그걸 기준으로 맞춰 봅시다.`;
}

/** 직전 채팅 발화에 맞춘 1차 반응 */
function reactToLastMessage(room, bot, last, triggerText) {
  if (!last || last.fromId === bot.id || !last.text) return null;

  const already = reactWhenPoliceReportAlreadyGiven(room, bot, last, triggerText);
  if (already) return already;

  const who = last.from;
  const parsed = voteFacts.parsePoliceReportFromText(room, last.text);

  if (messageLooksLikePoliceReport(room, last)) {
    const ack = buildAckFromPoliceParsed(room, bot, who, parsed);
    if (ack) return ack;
    return `${who}님 조결·수사 말씀 들었습니다. 공개된 팩트 기준으로 같이 보겠습니다.`;
  }

  if (m42Pd.looksLikeDetectiveBrief(last.text, room)) {
    const pdAck = reactToPrivateDetectiveReport(room, bot, last, helpers.isMafiaTeam && helpers.isMafiaTeam(bot.role));
    if (pdAck) return pdAck;
  }

  if (helpers.isPoliceReportRequest && helpers.isPoliceReportRequest(last.text, room)) {
    if (bot.role === 'police' && helpers.hasPoliceReportInDayChat?.(room, bot.id)) {
      return `${who}님, 제 조결은 바로 위 채팅에 있습니다. 닉네임 주시면 다시 정리해 드리겠습니다.`;
    }
    const recent = findRecentPoliceReport(room, { skipSpeakerId: bot.id, lookback: 14 });
    if (recent) {
      return reactWhenPoliceReportAlreadyGiven(room, bot, last, triggerText);
    }
  }

  if (last.text.includes(bot.nickname) && /왜|근거|사실|다르|틀렸|거짓|안\s*맞/.test(last.text)) {
    if (bot.role === 'police' && helpers.hasPoliceReportInDayChat?.(room, bot.id)) {
      return `${who}님 지적 확인했습니다. 제가 올린 조결과 다른 점이 있으면 닉네임을 짚어 주시면 대조하겠습니다.`;
    }
    return `${who}님 말씀 들었습니다. 조결·취재·성불과 맞는지부터 대조하겠습니다.`;
  }

  if (CHAT_M42_QUIET.test(last.text)) {
    return `${who}님 말대로 조밤이면 은폐·치료·물총부터 보겠습니다. 성급히 몰표하지 않겠습니다.`;
  }

  if (CHAT_M42_CLAIM.test(last.text) || CHAT_M42_CLAIM_META.test(last.text)) {
    const matReact = m42Matclaim.pickMatClaimReactiveLine(room, bot, helpers, triggerText, last);
    if (matReact) {
      return matReact.includes(who) ? matReact : `${who}님 말씀 기준 — ${matReact}`;
    }
    return `${who}님 직공·맞직 말씀 들었습니다. 조결·성불·취재와 맞는지부터 대조하겠습니다.`;
  }

  if (CHAT_WHY_EVIDENCE.test(last.text)) {
    const recent = findRecentPoliceReport(room, { skipSpeakerId: bot.id, lookback: 14 });
    if (recent?.parsed?.mafia?.length) {
      const n = recent.parsed.mafia[0].nickname;
      const rep = recent.speaker?.nickname || recent.msg.from;
      return `${who}님, 근거는 ${rep}님 조결의 ${n}님 지목입니다. 다른 정보와 대조하겠습니다.`;
    }
    return `${who}님, 조사·취재·성불이 나온 뒤 그때 근거를 말씀드리겠습니다.`;
  }

  if (CHAT_ACCUSE.test(last.text)) {
    const mentioned = findMentioned(room, last.text).filter((p) => p.id !== bot.id && p.alive);
    if (mentioned.length) {
      const target = mentioned[0];
      if (isClearedPlayer(room, bot, target)) {
        return `${who}님, ${target.nickname}님은 조결상 무죄입니다. 다른 분부터 보겠습니다.`;
      }
      const fact = pickFactTargetPlayer(room, bot);
      if (fact && fact.id !== target.id) {
        return `${who}님 의견 들었습니다. 다만 ${fact.nickname}님이 조사·취재 기준으로 더 수상합니다.`;
      }
      return `${who}님 말씀은 기록했습니다. 조결·취재가 맞을 때 같이 보겠습니다.`;
    }
  }

  if (CHAT_DEFEND.test(last.text) || CHAT_TRUST.test(last.text)) {
    return `${who}님 말씀 들었습니다. 조결·취재와 맞는지 확인한 뒤 투표하겠습니다.`;
  }

  if (last.text.length >= 10) {
    return `${who}님 말씀 들었습니다. 공개된 조결·취재부터 같이 맞춰 보겠습니다.`;
  }

  return null;
}

/** 경찰(인간·봇) 조결에 봇이 따라 말함 */
function reactToHumanPoliceReport(room, bot, ctx, last) {
  const text = ctx.triggerText || (last && last.text) || '';

  let speaker = null;
  let reportText = text;
  if (ctx.reportFromId && helpers.getPlayerById) {
    speaker = helpers.getPlayerById(room, ctx.reportFromId);
  }
  if ((!speaker || speaker.role !== 'police') && last && last.fromId !== bot.id && helpers.getPlayerById) {
    const sp = helpers.getPlayerById(room, last.fromId);
    if (sp && sp.role === 'police') {
      speaker = sp;
      reportText = last.text || reportText;
    }
  }

  let parsed = reportText
    ? voteFacts.parsePoliceReportFromText(room, reportText)
    : { innocent: [], mafia: [] };

  let metaOnly = false;
  if (!parsed.mafia.length && !parsed.innocent.length) {
    const recent = findRecentPoliceReport(room, { skipSpeakerId: bot.id, lookback: 16 });
    if (recent) {
      speaker = recent.speaker;
      reportText = recent.msg.text;
      parsed = recent.parsed;
      metaOnly = recent.metaOnly;
    }
  }

  if (!speaker) return null;
  if (speaker.id === bot.id) return null;
  if (!parsed.mafia.length && !parsed.innocent.length && !metaOnly) return null;

  if (!m42Bluff.isTrustedHolgyeongPoliceSpeaker(room, speaker, helpers)) return null;

  const policeSource = speaker.role === 'police'
    || (helpers.isPublicPoliceClaim && helpers.isPublicPoliceClaim(room, speaker.id))
    || messageLooksLikePoliceReport(room, { text: reportText, fromId: speaker.id });
  if (!ctx.policeReportAck && !policeSource) return null;

  const who = speaker.role === 'police'
    ? (speaker.nickname || '경찰')
    : (speaker.nickname || '플레이어');
  if (metaOnly) {
    return `${who}님 조결·수사 말씀 들었습니다. 공개된 내용 기준으로 같이 지목하겠습니다.`;
  }
  return buildAckFromPoliceParsed(room, bot, who, parsed);
}

function reactToChatConfusion(room, bot, triggerText, last) {
  const t = `${triggerText || ''} ${last && last.text ? last.text : ''}`;
  if (!CHAT_CONFUSION.test(t)) return null;

  if (last && last.fromId !== bot.id) {
    const sp = helpers.getPlayerById ? helpers.getPlayerById(room, last.fromId) : null;
    const fromPolice = m42Bluff.isTrustedHolgyeongPoliceSpeaker(room, sp, helpers);
    const parsed = voteFacts.parsePoliceReportFromText(room, last.text || '');
    if (fromPolice && parsed.innocent.length) {
      const n = parsed.innocent[0].nickname;
      return `${last.from}님 홀경 조결 확인했습니다. ${n}님은 마피아가 아니니 무죄로 보고 다른 분부터 보겠습니다.`;
    }
    if (fromPolice && parsed.mafia.length) {
      const n = parsed.mafia[0].nickname;
      if (bot.id === parsed.mafia[0].id) {
        return `${last.from}님 조결과 다릅니다. 저는 마피아가 아닙니다.`;
      }
      return `${last.from}님 조결대로 ${n}님이 수상합니다.`;
    }
    if (/수사\s*결과/.test(last.text)) {
      if (parsed.innocent.length) {
        const n = parsed.innocent[0].nickname;
        return `${last.from}님 조결 확인했습니다. ${n}님은 일단 무죄로 보고 다른 분부터 보겠습니다.`;
      }
      if (parsed.mafia.length) {
        const n = parsed.mafia[0].nickname;
        return `${last.from}님 조결대로 ${n}님이 수상합니다.`;
      }
    }
  }

  if (last && /맞경|맞경찰|짭경|진경|맞의|맞군|맞영|맞기|맞직|쓰리경|쓰리의|쓰리군|쓰리영/.test(last.text) && last.fromId !== bot.id) {
    const matReact = m42Matclaim.pickMatClaimReactiveLine(room, bot, helpers, triggerText, last);
    if (matReact) return matReact;

    const reporters = m42Bluff.scanPoliceReporters(room, helpers);
    if (reporters.length >= 2) {
      m42MatProb.applyMatgyeongProbabilityVoteIntel(room, helpers);
      const rival = m42Bluff.pickPoliceBluffRival(room, bot, helpers)
        || helpers.getPlayerById?.(room, last.fromId);
      if (rival) {
        if (isEvilBluffBot(bot) && m42Bluff.mayMafiaTeamBotBluffPolice(room, bot, helpers)) {
          if (Math.random() < 0.74) {
            const probLine = m42MatProb.pickMatgyeongClaimantDefenseLine(room, bot, rival, helpers, {
              isEvil: true,
              round: 0
            });
            if (probLine) return probLine;
            return m42Bluff.pickMatgyeongTikiTakaLine
              ? m42Bluff.pickMatgyeongTikiTakaLine(room, bot, rival, { isEvil: true, round: 0, helpers })
              : m42Bluff.pickPoliceVersusBicker(bot.nickname, rival.nickname, true, room, bot, helpers);
          }
        }
        if (bot.role === 'police' && Math.random() < 0.7) {
          const probLine = m42MatProb.pickMatgyeongClaimantDefenseLine(room, bot, rival, helpers, {
            isEvil: false,
            round: 0
          });
          if (probLine) return probLine;
          return m42Bluff.pickMatgyeongTikiTakaLine
            ? m42Bluff.pickMatgyeongTikiTakaLine(room, bot, rival, { isEvil: false, round: 0 })
            : m42Bluff.pickPoliceVersusBicker(bot.nickname, rival.nickname, false);
        }
        if (!helpers.isMafiaTeam(bot.role) && bot.role !== 'police' && Math.random() < 0.52) {
          const citizenProb = m42MatProb.pickCitizenProbabilityLine(room, bot, helpers);
          if (citizenProb) return citizenProb;
        }
      }
    }
    if (m42Matclaim.hasActiveMatConflicts(room, helpers) && Math.random() < 0.62) {
      const suspect = m42Matclaim.pickMatClaimSuspectLine(room, bot, helpers);
      if (suspect) return suspect;
    }
    return `${last.from}님, 맞직이면 조결·성불·취재부터 맞춰 봅시다. 저는 공개된 팩트부터 따르겠습니다.`;
  }

  if (/맢|마피아/.test(t) && last && last.fromId !== bot.id) {
    const sp = helpers.getPlayerById ? helpers.getPlayerById(room, last.fromId) : null;
    if (sp && sp.role === 'police') {
      const parsed = voteFacts.parsePoliceReportFromText(room, last.text || '');
      if (parsed.mafia.length) {
        const n = parsed.mafia[0].nickname;
        if (bot.id !== parsed.mafia[0].id) {
          return `${last.from}님 조결대로 ${n}님이 수상합니다.`;
        }
      }
    }
    const who = last.from;
    return `${who}님 말씀 들었습니다. 근거 더 말해 주시면 그걸로 판단하겠습니다.`;
  }

  return null;
}

function isRealPoliceAlive(room) {
  const alive = helpers.getAlivePlayers ? helpers.getAlivePlayers(room) : [];
  return alive.some((p) => p && p.role === 'police' && p.alive);
}

function pickPoliceReportLine(room, bot, triggerText, last) {
  if (last && last.fromId !== bot.id && helpers.isPoliceReportProviding
    && helpers.isPoliceReportProviding(last.text, room)) {
    const sp = helpers.getPlayerById ? helpers.getPlayerById(room, last.fromId) : null;
    if (sp && sp.role === 'police' && !sp.isBot) {
      return null;
    }
  }
  if (triggerText && helpers.isPoliceReportProviding
    && helpers.isPoliceReportProviding(triggerText, room)) {
    return null;
  }

  if (helpers.isMafiaTeam && helpers.isMafiaTeam(bot.role)) {
    const isBluffPolice = m42Bluff.mayMafiaTeamBotBluffPolice(room, bot, helpers);
    if (isBluffPolice && !isRealPoliceAlive(room) && room.game?.botMatgyeongVotePushDay) {
      if (Math.random() < 0.68) {
        const defense =
          m42Bluff.pickMatgyeongSurvivorDefenseLine(room, bot, helpers)
          || m42Bluff.buildMatgyeongCounterClaim(room, bot, helpers);
        if (defense) return defense;
      }
    }
    if (isBluffPolice && !isRealPoliceAlive(room)) {
      if (wantsPoliceReport(room, triggerText, last, bot) || Math.random() < 0.42) {
        const rep = m42Bluff.buildFakePoliceReportLine(room, bot, helpers, {
          forceInnocent: true,
          preferClearMafiaAlly: Math.random() < 0.65
        });
        if (rep) return rep;
      }
    }
    if (m42Bluff.wantsMatgyeongAsk(triggerText)) {
      if ((room.game?.dayIndex || 0) <= 1) {
        const early = m42Bluff.buildFakePoliceReportLine(room, bot, helpers);
        if (early) return early;
        const fc = m42Bluff.getBotFakeClaim(room, bot.id, helpers);
        if (fc && fc !== 'police') {
          return m42Bluff.pickMatgyeongCitizenConfusion(room, bot, helpers);
        }
        return m42Bluff.pickEvilBluffLine(room, bot, helpers);
      }
      if (!m42Bluff.mayMafiaTeamBotBluffPolice(room, bot, helpers)) {
        return m42Bluff.pickMatgyeongCitizenConfusion(room, bot, helpers);
      }
      return m42Bluff.buildMatgyeongCounterClaim(room, bot, helpers);
    }
    if (wantsPoliceReport(room, triggerText, last, bot)) {
      const rival = last && last.text && /수사\s*결과/.test(last.text) ? last.from : null;
      return m42Bluff.buildFakePoliceReportLine(room, bot, helpers, {
        avoidName: rival || undefined,
        forceInnocent: true,
        preferClearMafiaAlly: Math.random() < 0.62
      });
    }
  }
  if (!wantsPoliceReport(room, triggerText, last, bot)) return null;
  if (bot.role === 'police') {
    const alreadyOut = helpers.hasPolicePublishedReportToday?.(room, bot.id)
      || helpers.hasPoliceReportInDayChat?.(room, bot.id);
    if (alreadyOut) {
      const lead = m42PoliceCitizen.pickCitizenLeadAfterReport(room, bot, helpers, triggerText, last);
      if (lead) return lead;
    }
    const reporters = m42Bluff.scanPoliceReporters(room, helpers);
    const selfListed = reporters.some((r) => r.id === bot.id);
    if (reporters.length >= 2 && selfListed) {
      const rivalEntry = reporters.find((r) => r.id !== bot.id);
      if (rivalEntry && Math.random() < 0.68) {
        const bicker = m42Bluff.pickPoliceVersusBicker(bot.nickname, rivalEntry.nickname, false);
        if (!alreadyOut && helpers.buildPolicePublicReport && Math.random() < 0.45) {
          const report = helpers.buildPolicePublicReport(room, bot.id);
          if (report && report.hasIntel && report.text) {
            return `${bicker} ${report.text}`;
          }
        }
        return bicker;
      }
    }
    if (!alreadyOut && helpers.buildPolicePublicReport) {
      const report = helpers.buildPolicePublicReport(room, bot.id);
      if (report && report.hasIntel && report.text) return report.text;
    }
    if (alreadyOut) {
      return m42PoliceCitizen.pickCitizenLeadAfterReport(room, bot, helpers, triggerText, last)
        || '조결은 올렸습니다. 시민은 제 수사 결과 기준으로 투표·지목합시다.';
    }
    return '조결 요청 확인했습니다. 이번 밤 수사 기록이 없어 아직 말씀드릴 결과가 없습니다.';
  }
  const policeAlive = helpers.getAlivePlayers
    ? helpers.getAlivePlayers(room).some((p) => p.role === 'police')
    : false;
  if (policeAlive) {
    const recent = findRecentPoliceReport(room, { skipSpeakerId: bot.id, lookback: 14 });
    if (recent) {
      const rep = recent.speaker?.nickname || recent.msg.from;
      const prefix = last && last.from ? `${last.from}님, ` : '';
      if (recent.metaOnly) {
        return `${prefix}${rep}님이 수사·조결을 이미 채팅에 올렸습니다. 위 내용부터 보겠습니다.`;
      }
      const ack = buildAckFromPoliceParsed(room, bot, rep, recent.parsed);
      if (ack) return `${prefix}${rep}님 조결이 있습니다. ${ack}`;
      return `${prefix}${rep}님 조결이 채팅에 있습니다. 그걸 기준으로 맞춰 봅시다.`;
    }
    const askPolice = [
      '경찰님, 조결·경찰조사 결과 부탁드립니다.',
      '오늘도 경찰 조결 중심으로 맞춰 가겠습니다. 진경 조결 부탁드립니다.',
      '시민은 경찰 조결이 나와야 표를 같이 맞출 수 있습니다. 조결 부탁드립니다.'
    ];
    return askPolice[Math.floor(Math.random() * askPolice.length)];
  }
  return '경찰 조결은 채팅으로 남겨 주시면 같이 맞춰 보겠습니다.';
}

/** 채팅에 정치인 맞직이 2건 이상일 때 맞경 일반멘트보다 우선 */
function reactToRecentPoliticianClaims(room, bot, last, onEvilSide) {
  const day = helpers.getChatMessages
    ? helpers.getChatMessages(room, 'day')
    : (room.chatLog && room.chatLog.day) || [];
  const recent = day.slice(-22);
  const polMsgs = recent.filter((m) => m && m.text && /정치인/.test(m.text));
  if (polMsgs.length < 2) return null;
  if (last && last.fromId === bot.id) return null;
  const names = [...new Set(polMsgs.map((m) => m.from).filter(Boolean))];
  if (names.length < 2) return null;
  const joined = names.slice(0, 4).join('·');
  if (bot.role === 'politician' && !onEvilSide && Math.random() < 0.88) {
    return bot.isBot
      ? `저 ${bot.nickname} 정치인입니다. 맞직이면 투표로 확인해 주십시오.`
      : `${joined}님 중 정치인 맞직이면 저 ${bot.nickname}입니다. 낮 2표·찬반 면역이 근거입니다. 발언을 더 맞춰 주세요.`;
  }
  if (!onEvilSide && bot.role !== 'politician' && Math.random() < 0.78) {
    return `정치인 주장이 ${polMsgs.length}건 있습니다(${joined}). 맞직이면 면역·표 패턴으로 가르고, 다른 맞직은 조결·취재로 이어가겠습니다.`;
  }
  if (onEvilSide && Math.random() < 0.42) {
    return `정치인 ${joined} 맞직입니다. 투표·발언 패턴으로 가리겠습니다.`;
  }
  return null;
}

function hasActiveMatchedPoliceLock(room) {
  if (!room || room.phase !== 'day_chat') return false;
  const openedAt = room.game?.dayChatOpenedAt;
  const day = helpers.getChatMessages
    ? helpers.getChatMessages(room, 'day')
    : (room.chatLog && room.chatLog.day) || [];
  const recent = day.slice(-28);
  const speakers = new Set();
  const rawSpeakers = new Set();
  for (const msg of recent) {
    if (!msg || !msg.fromId || !msg.text || msg.system) continue;
    if (!policeFmt.looksLikePoliceReport(msg.text, room)) continue;
    rawSpeakers.add(msg.fromId);
    if (openedAt != null && typeof msg.time === 'number' && msg.time < openedAt) continue;
    const p = helpers.getPlayerById ? helpers.getPlayerById(room, msg.fromId) : null;
    if (!p || !p.alive) continue;
    speakers.add(msg.fromId);
  }
  // #region agent log
  if (rawSpeakers.size >= 2 && speakers.size < 2) {
    agentLog({
      hypothesisId: 'H2',
      location: 'bot-brain.js:hasActiveMatchedPoliceLock',
      message: 'matched police lock cleared (stale day or dead speaker)',
      runId: 'matgyeong-holgyeong',
      data: {
        rawCount: rawSpeakers.size,
        aliveThisDay: speakers.size,
        dayIndex: room.game?.dayIndex || 0
      }
    });
  }
  // #endregion
  return speakers.size >= 2;
}

function getCivicLeadershipAnchor(room) {
  const alive = helpers.getAlivePlayers ? helpers.getAlivePlayers(room) : [];
  const intel = Array.isArray(room?.game?.publicVoteIntel) ? room.game.publicVoteIntel : [];
  const confirmedPoliceIds = new Set(
    intel
      .filter((r) => r && r.source === 'reporter' && r.role === 'police' && r.targetId != null)
      .map((r) => r.targetId)
  );
  const aliveConfirmedPolice = alive.filter((p) => confirmedPoliceIds.has(p.id));
  if (aliveConfirmedPolice.length) {
    return { mode: 'police', leaderId: aliveConfirmedPolice[0].id, confirmed: true };
  }

  const slots = m42RoleConfirm.resolvePerformerRoleSlots(
    room,
    helpers,
    helpers.roleLabels || {}
  );
  const confirmedPd = alive.filter(
    (p) => slots.confirmedById[p.id] === 'private_detective'
  );
  if (confirmedPd.length) {
    return {
      mode: 'private_detective',
      leaderId: confirmedPd[0].id,
      confirmed: true
    };
  }
  const alivePolice = alive.filter((p) => p.role === 'police');
  if (alivePolice.length) {
    return { mode: 'police', leaderId: alivePolice[0].id, confirmed: false };
  }
  const deadConfirmedPolice = [...confirmedPoliceIds].some((id) => {
    const p = helpers.getPlayerById ? helpers.getPlayerById(room, id) : null;
    return p && !p.alive;
  });
  if (deadConfirmedPolice) {
    const alivePd = alive.find((p) => p.role === 'private_detective');
    if (alivePd) return { mode: 'private_detective', leaderId: alivePd.id, confirmed: false };
  }
  const anyAlivePd = alive.find((p) => p.role === 'private_detective');
  if (anyAlivePd && !alivePolice.length) {
    return {
      mode: 'private_detective',
      leaderId: anyAlivePd.id,
      confirmed: false,
      policeEliminated: true
    };
  }
  return { mode: 'collective', leaderId: null, confirmed: false };
}

function generateRuleBased(room, bot, ctx = {}) {
  if (m42Bluff.isEvilBluffBot && m42Bluff.isEvilBluffBot(bot, helpers)) {
    m42Bluff.ensureAllEvilFakeClaims(room, helpers);
  }
  const brief = m42.buildSituationBrief(room, bot, ctx, helpers);
  const persona = getPersona(bot.role);
  const last = getLastMessage(room);
  const triggerText = ctx.triggerText || (last && last.text) || '';
  brief.triggerText = triggerText;
  const nightReport = room.game && room.game.lastNightReport;
  if (nightReport) brief.nightReport = nightReport;

  const onEvilSide = isEvilBluffBot(bot);
  if (onEvilSide && m42Bluff.shouldMuteCaughtMafiaBotDayChat(room, bot.id)) {
    return null;
  }
  const leadership = getCivicLeadershipAnchor(room);
  const matchedPoliceLock = hasActiveMatchedPoliceLock(room);
  const fakeClaim = m42Bluff.getBotFakeClaim ? m42Bluff.getBotFakeClaim(room, bot.id, helpers) : null;
  const aliveRealPolice = helpers.getAlivePlayers
    && helpers.getAlivePlayers(room).some((p) => p && p.role === 'police');
  const canLeadMatchedPoliceTalk = bot.role === 'police'
    || fakeClaim === 'police'
    || (bot.role === 'private_detective' && !aliveRealPolice);
  if (!onEvilSide && room.phase === 'day_chat') {
    if (leadership.mode === 'police' && bot.id !== leadership.leaderId && Math.random() < 0.72) {
      return leadership.confirmed
        ? '확정 경찰 기준으로 따라가겠습니다. 조결·지목 라인 맞춰서 투표하겠습니다.'
        : '경찰 주도 라인으로 맞추겠습니다. 조결 기준으로 따라가겠습니다.';
    }
    if (leadership.mode === 'private_detective' && bot.id !== leadership.leaderId) {
      if (leadership.policeEliminated || Math.random() < 0.82) {
        return '확정 경찰이 없는 상태라 사립탐정 관찰 라인으로 따라가겠습니다. 사탐·영매 사망자 단서 기준으로 표를 맞추겠습니다.';
      }
    }
    if (leadership.mode === 'private_detective' && bot.id === leadership.leaderId) {
      const pd = nightReport?.privateDetective;
      if (pd?.watchName && pd.targetName) {
        return `경찰이 없으니 제 관찰 ${pd.watchName}→${pd.targetName}을 기준으로 오늘 투표를 모읍시다. 영매 사망자 채팅도 같이 보겠습니다.`;
      }
      return '확정 경찰이 사망한 상태라 사탐 기준으로 주도하겠습니다. 밤 관찰·사망자 채팅을 묶어 마피아 의심 대상을 정리하고 투표를 모읍시다.';
    }
  }
  if (
    matchedPoliceLock
    && !canLeadMatchedPoliceTalk
    && !(bot.role === 'private_detective' && !aliveRealPolice)
  ) {
    // 맞경 정리 단계에서는 비경찰 발화를 최대한 억제해 경찰↔맞경 대립에 집중
    agentLog({
      hypothesisId: 'matched-police-talk-lock',
      location: 'bot-brain.js:generateRuleBased',
      message: 'mute non-police bot during matched police lock',
      data: {
        bot: bot.nickname,
        role: bot.role,
        fakeClaim,
        phase: room.phase,
        dayIndex: room.game?.dayIndex || 0
      }
    });
    return null;
  }
  if (
    onEvilSide
    && m42Bluff.isBotDefinitivelyExposed
    && m42Bluff.isBotDefinitivelyExposed(room, bot.id, helpers)
    && !m42Bluff.hasCaughtDeflectionPostedToday(room, bot.id)
  ) {
    const caughtLine = m42Bluff.pickCaughtMafiaDeflectionLine(room, bot, helpers, { source: 'chat' });
    if (caughtLine) return caughtLine;
  }
  if (onEvilSide && m42Bluff.pickLineConsistentWithFakeClaim) {
    const locked = m42Bluff.pickLineConsistentWithFakeClaim(room, bot, helpers, {
      triggerText,
      last
    });
    if (locked && Math.random() < 0.78) return locked;
  }
  if (onEvilSide && m42Bluff.wantsMatgyeongAsk(triggerText)) {
    const matLine = m42Bluff.reactToMatgyeongAsk(room, bot, true, triggerText, helpers);
    if (matLine) return matLine;
  }

  if (last && last.fromId !== bot.id) {
    const speakerP = getSpeakerPlayer(room, last);
    if (
      speakerP
      && speakerP.alive
      && speakerP.role === 'police'
      && /자투|무투|투표스킵|자투표/.test(String(last.text || '').replace(/\s+/g, ''))
      && !onEvilSide
      && Math.random() < 0.85
    ) {
      return '경찰 안내에 동의합니다. 오늘은 자투로 표를 맞추고 다음 조결·취재를 기다리겠습니다.';
    }
    const lastReply = reactToLastMessage(room, bot, last, triggerText);
    if (lastReply) {
      // #region agent log
      agentLog({
        hypothesisId: 'CtxReply',
        location: 'bot-brain.js:generateRuleBased',
        message: 'contextual last-message reply',
        data: {
          bot: bot.nickname,
          lastFrom: last.from,
          preview: String(lastReply).slice(0, 72)
        }
      });
      // #endregion
      return lastReply;
    }
  }

  const humanPoliceAck = reactToHumanPoliceReport(room, bot, ctx, last);
  if (humanPoliceAck) return humanPoliceAck;

  const humanPdAck = reactToHumanPrivateDetectiveReport(room, bot, ctx, last);
  if (humanPdAck) return humanPdAck;

  const pdInterviewReply = m42PdInterview.pickPdInterviewReactiveAnswer(room, bot, helpers, last);
  if (pdInterviewReply) return pdInterviewReply;

  const politicianDup = reactToRecentPoliticianClaims(room, bot, last, onEvilSide);
  if (politicianDup) return politicianDup;

  if (
    !onEvilSide
    && bot.isBot
    && bot.role !== 'police'
    && bot.role !== 'cult_leader'
    && helpers.isMafiaTeam
    && !helpers.isMafiaTeam(bot.role)
    && room.phase === 'day_chat'
    && Math.random() < 0.28
  ) {
    const steer = m42PoliceCitizen.pickPoliceDialogueSteer(room, bot, helpers);
    if (steer) return steer;
  }

  if (room.phase === 'day_chat' && !ctx.policeReportAck && m42Matclaim.hasActiveMatConflicts(room, helpers)) {
    const lastHasTopic = last && last.fromId !== bot.id && (last.text || '').length >= 8;
    const matReactive = m42Matclaim.pickMatClaimReactiveLine(room, bot, helpers, triggerText, last);
    if (matReactive && Math.random() < (lastHasTopic ? 0.42 : 0.7)) return matReactive;
    if (!lastHasTopic && Math.random() < 0.58) {
      const suspect = m42Matclaim.pickMatClaimSuspectLine(room, bot, helpers);
      if (suspect) return suspect;
    }
    if (!lastHasTopic && Math.random() < 0.42) {
      const tiki = m42Matclaim.pickMatClaimTikiTakaLine(room, bot, helpers, { round: 0 });
      if (tiki) return tiki;
    }
  }

  if (bot.role === 'police' && room.phase === 'day_chat' && !ctx.policeReportAck) {
    if (bot.id === leadership.leaderId && leadership.mode === 'police' && matchedPoliceLock) {
      const reporters = m42Bluff.scanPoliceReporters(room, helpers).filter((r) => r.id !== bot.id);
      if (reporters.length) {
        const rival = reporters[0];
        return `${rival.nickname}님은 제 조결과 충돌하는 맞경 라인입니다. 마피아·교주 의심이 크니 오늘 투표를 ${rival.nickname}님 쪽으로 모읍시다.`;
      }
    }
    const citizenLead = m42PoliceCitizen.pickReactiveCitizenLine(
      room,
      bot,
      helpers,
      triggerText,
      last
    );
    if (citizenLead && Math.random() < 0.74) return citizenLead;
  }

  if (ctx.policeReportAck) {
    return null;
  }

  const confusionLine = reactToChatConfusion(room, bot, triggerText, last);
  if (confusionLine) return confusionLine;

  const policeLine = pickPoliceReportLine(room, bot, triggerText, last);
  if (policeLine) return policeLine;

  const evidenceReply = reactToEvidenceRequest(room, bot, triggerText, last);
  if (evidenceReply) return evidenceReply;

  if (
    bot.role === 'medium'
    && room.phase === 'day_chat'
    && (CHAT_MEDIUM_PURIFY.test(triggerText) || mediumPurify.isMediumDeathPromptText(triggerText))
  ) {
    const deathIds = (room.game?.lastNightReport?.deaths || [])
      .map((d) => (d && typeof d === 'object' ? d.id : d))
      .filter((id) => id != null);
    const targets = mediumPurify.pickDeathShareTargets(room, helpers, deathIds);
    const primary = targets[0]
      || mediumPurify.pickKnownDeadForAnnounce(room, bot, helpers)
      || mediumPurify.pickSuspiciousDeadTarget(room, bot, helpers);
    if (primary) {
      const pack = mediumPurify.buildMediumDayShareLines(
        room,
        bot,
        primary,
        helpers,
        helpers.roleLabels || helpers.ROLE_LABELS || {}
      );
      if (pack.lines.length) return pack.lines[0];
    }
  }

  if (!onEvilSide && bot.role === 'medium' && room.phase === 'day_chat') {
    const deadLog = helpers.getChatMessages ? helpers.getChatMessages(room, 'dead') : [];
    const recentDead = deadLog && deadLog.length ? deadLog[deadLog.length - 1] : null;
    if (recentDead && recentDead.fromId && recentDead.text) {
      const mentioned = findMentioned(room, String(recentDead.text)).filter((p) => p.alive);
      if (mentioned.length && Math.random() < 0.42) {
        const t = mentioned[0];
        const reason = helpers.getAccuseReasonForTarget
          ? helpers.getAccuseReasonForTarget(room, bot, t.id)
          : null;
        if (reason) return `사망자 채팅에서 ${t.nickname}님 지목이 있었습니다. ${reason} 근거와 겹쳐 낮 지목에 힘을 싣겠습니다.`;
        return `사망자 채팅에서 ${t.nickname}님 지목이 있었습니다. 영매로서 낮 검증에 힘을 싣겠습니다.`;
      }
    }
  }

  if (!onEvilSide && bot.role === 'medium' && last && last.fromId !== bot.id && last.isDead) {
    const mentioned = findMentioned(room, `${last.text || ''}`).filter((p) => p.alive);
    if (mentioned.length) {
      const target = mentioned[0];
      const reason = helpers.getAccuseReasonForTarget
        ? helpers.getAccuseReasonForTarget(room, bot, target.id)
        : null;
      if (reason) {
        return `${last.from}님 사망자 채팅 확인했습니다. ${reason} 근거도 있어 ${target.nickname}님 지목에 힘을 싣겠습니다.`;
      }
      return `${last.from}님 사망자 채팅 확인했습니다. 낮에는 ${target.nickname}님 라인 검증에 힘을 싣겠습니다.`;
    }
    return `${last.from}님 사망자 채팅 확인했습니다. 영매로서 조결·사망자 채팅이 겹치는 쪽에 힘을 싣겠습니다.`;
  }

  if (last && last.fromId !== bot.id && isBotAccusedInChat(room, bot, last.text || triggerText)) {
    return buildSelfDefenseLine(room, bot, brief, last);
  }

  if (CHAT_MEDIUM_PURIFY.test(triggerText) && bot.role !== 'medium') {
    const aliveMedium = Object.values(room.players || {}).find(
      (p) => p && p.alive && p.role === 'medium'
    );
    const suspect = mediumPurify.pickSuspiciousDeadTarget(room, bot, helpers);
    if (aliveMedium && suspect) {
      return `${aliveMedium.nickname}님(영매), ${suspect.nickname}님 성불 부탁드립니다.`;
    }
    if (suspect) {
      return `영매님, ${suspect.nickname}님 성불 부탁드립니다. 의심되는 사망자입니다.`;
    }
    if (Object.values(room.players || {}).some((p) => p && !p.alive)) {
      return '영매님, 사망자 채팅과 함께 의심 가는 분부터 성불 부탁드립니다.';
    }
  }

  if (nightReport?.mediumPurify && Math.random() < 0.45) {
    const mp = nightReport.mediumPurify;
    const mpTarget = mp.targetId && helpers.getPlayerById
      ? helpers.getPlayerById(room, mp.targetId)
      : null;
    if (!mpTarget || mpTarget.alive || !mediumPurify.isMediumPurifyEligible(room, mpTarget)) {
      /* 생존자·당일 사망자에 대한 잘못된 성불 멘트 방지 */
    } else if (bot.role === 'medium') {
      return `${mp.targetName}님 성불 [${mp.roleLabel}]입니다. 추가 질문 받습니다.`;
    } else if (helpers.isMafiaRole && helpers.isMafiaRole(mp.role)) {
      return `영매 성불 ${mp.targetName}=[${mp.roleLabel}] 확인했습니다.`;
    } else {
      return `영매 ${mp.targetName}=[${mp.roleLabel}] 공표를 조결·취재와 대조하겠습니다.`;
    }
  }

  const compactTrig = String(triggerText || '').replace(/\s+/g, '');
  if (!onEvilSide && m42Bluff.MAT_CHAT.test(compactTrig)) {
    if (bot.role === 'politician') {
      return bot.isBot
        ? '저는 정치인입니다. 투표로 확인해 주십시오. 경찰 조결도 같이 봅시다.'
        : '저는 정치인입니다. 맞경·홀경 싸움보다 조결·취재가 나온 뒤 투표하겠습니다.';
    }
    if (bot.role === 'soldier') {
      return '저는 군인입니다. 맞직은 조결·취재로 가리고 저는 시민 편입니다.';
    }
    if (bot.role === 'doctor') {
      return '저는 시민입니다. 의사는 특수직이라 직공하지 않습니다. 맞직이면 조결부터 보겠습니다.';
    }
    if (/맞경|맞직/.test(compactTrig)) {
      return '맞직이면 조결·취재부터 확인하겠습니다. 저는 시민입니다.';
    }
  }
  if (onEvilSide) {
    if (
      helpers.isMafiaTeam(bot.role)
      && m42Bluff.mayMafiaTeamBotBluffPolice(room, bot, helpers)
      && Math.random() < 0.48
    ) {
      const maintain = m42Bluff.buildFakePoliceReportLine(room, bot, helpers, {
        forceInnocent: true,
        preferClearMafiaAlly: true
      });
      if (maintain) return maintain;
    }
    if (Math.random() < 0.34) {
      const polSteer = m42Bluff.pickPoliticianMafiaBluffVoteLine(room, bot, helpers);
      if (polSteer) return polSteer;
    }
    if (Math.random() < 0.32) {
      const stir = m42Bluff.pickContinuousEvilBluff(room, bot, helpers);
      if (stir) return stir;
    }
    if ((room.game?.dayIndex || 0) <= 1) {
      const day1 = m42Bluff.buildFakePoliceReportLine(room, bot, helpers);
      if (day1 && (helpers.isMafiaTeam(bot.role) || Math.random() < 0.48)) return day1;
      if (!day1 && helpers.isMafiaTeam(bot.role)) {
        const fc = m42Bluff.getBotFakeClaim(room, bot.id, helpers);
        if (fc && fc !== 'police') {
          const conf = m42Bluff.pickMatgyeongCitizenConfusion(room, bot, helpers);
          if (conf && Math.random() < 0.55) return conf;
        }
      }
    }
    const bluffLine = m42Bluff.reactToClaimBluff(room, bot, true, triggerText, last, helpers);
    if (bluffLine) return bluffLine;
    if (Math.random() < 0.82) {
      return m42Bluff.pickEvilBluffLine(room, bot, helpers);
    }
    return m42Bluff.pickContinuousEvilBluff(room, bot, helpers);
  }

  const target = getTargetPlayer(room, bot);
  const targetName = pickAliveSuspectName(room, bot, brief) || '누군가';
  const isMafia = brief.isMafia;

  const altBot = pickAnotherBot(room, bot, target ? target.id : null);
  const altName = altBot ? altBot.nickname : targetName;

  const factTarget = pickFactTargetPlayer(room, bot);
  if (factTarget) {
    const factLine = accuseWithReason(room, bot, factTarget.id, last && last.from);
    if (factLine) return factLine;
  }

  const quietDiscuss = voteFacts.formatQuietNightDiscuss
    ? voteFacts.formatQuietNightDiscuss(room, bot)
    : null;
  if (quietDiscuss && (brief.quietNight || /조밤/.test(triggerText)) && Math.random() < 0.55) {
    return quietDiscuss;
  }

  const roleLine = m42.pickRoleAwareLine(brief, bot, targetName, last && last.from, room, helpers);
  if (roleLine) return roleLine;

  const aliveReporter = Object.values(room.players || {}).find(
    (p) => p && p.alive && p.role === 'reporter' && !p.reporterUsed
  );
  const matConflicts = m42Matclaim.scanMatClaimConflicts(room, helpers);
  const matgyeong = m42Bluff.scanPoliceReporters(room, helpers);
  if (
    aliveReporter
    && (matgyeong.length >= 2 || matConflicts.some((c) => c.role === 'police'))
    && (CHAT_M42_CLAIM_META.test(triggerText) || CHAT_M42_POLICE_META.test(triggerText))
    && Math.random() < 0.48
  ) {
    const ni = room.game?.nightIndex || 0;
    const a = matgyeong[0]?.nickname || matConflicts.find((c) => c.role === 'police')?.claimants[0]?.nickname;
    const b = matgyeong[1]?.nickname || matConflicts.find((c) => c.role === 'police')?.claimants[1]?.nickname;
    if (a && b) {
      const pushMatVote = !!room.game?.botMatgyeongVotePushDay;
      const pushTarget =
        room.game?.botMatgyeongVoteRivalIfPoliceDies
          ? (helpers.getPlayerById
            ? helpers.getPlayerById(room, room.game.botMatgyeongVoteRivalIfPoliceDies)
            : null)
          : null;
      if (pushMatVote && pushTarget?.alive && pushTarget.nickname) {
        if (Math.random() < 0.55) {
          const probPush = m42MatProb.pickCitizenProbabilityLine(room, bot, helpers);
          if (probPush) return probPush;
        }
        const votePush = [
          `어젯밤 진경이 제거됐습니다. 남은 ${pushTarget.nickname}님 맞경 라인은 짭경·마피아·스파이일 가능성이 큽니다. 오늘 ${pushTarget.nickname}님에게 표를 모읍시다.`,
          `진경이 밤에 죽었으니 생존 경찰 주장 ${pushTarget.nickname}님은 짭경으로 보입니다. 시민은 ${pushTarget.nickname}님 쪽으로 투표해 주십시오.`,
          `맞경 중 진경이 사망했습니다. ${pushTarget.nickname}님 조결·말투가 수상하니 오늘은 ${pushTarget.nickname}님부터 처형합시다.`
        ];
        return votePush[Math.floor(Math.random() * votePush.length)];
      }
      if (matgyeong.length >= 2 && Math.random() < 0.46) {
        const probSteer = m42MatProb.pickCitizenProbabilityLine(room, bot, helpers);
        if (probSteer) return probSteer;
      }
      const reporterKnown =
        skillDlg.hasReporterScoopInDayChat(room, helpers)
        || skillDlg.hasReporterSelfSpokenInDayChat(room, aliveReporter.id, helpers);
      if (matgyeong.length >= 2) {
        const matSteer = [
          `${a}·${b} 맞경입니다. 둘 다 "○○님 조사했는데 마피아가 아닙니다" 또는 "…마피아입니다" 한 줄로 맞춘 뒤 말로 대립합시다. 시민은 맞경 중 한쪽에 표를 모읍시다.`,
          `맞경 ${a}·${b} — 조결 문장부터 맞추고, 투표는 짭경 가리기부터 하겠습니다. 기자·영매는 그 다음입니다.`,
          `경찰 두 분은 같은 형식으로 조결을 다시 올려 주십시오. 저는 시민으로 맞경 한쪽부터 몰겠습니다.`
        ];
        return matSteer[Math.floor(Math.random() * matSteer.length)];
      }
      if (!reporterKnown) {
        if (ni < 2) {
          return `맞경 ${a}·${b}입니다. 2밤부터 기자 취재가 나오면 그때 직업 확인하겠습니다.`;
        }
        return `맞경 ${a}·${b} 중 한 분 조결부터 맞춰 주십시오. 기자 취재 공표가 나오면 그때 직업 확인하겠습니다.`;
      }
      if (ni < 2) {
        return `${aliveReporter.nickname}님(기자), 2밤에 ${a}·${b} 맞경 중 취재 부탁드립니다.`;
      }
      return `${aliveReporter.nickname}님, 맞경 ${a}·${b} 중 한 분 취재로 직업 확인 부탁드립니다.`;
    }
  }

  if (matConflicts.length && Math.random() < 0.4) {
    const nonPolice = matConflicts.find((c) => c.role !== 'police');
    if (nonPolice && aliveReporter && (room.game?.nightIndex || 0) >= 2) {
      const reporterKnown =
        skillDlg.hasReporterScoopInDayChat(room, helpers)
        || skillDlg.hasReporterSelfSpokenInDayChat(room, aliveReporter.id, helpers);
      const names = nonPolice.claimants.map((c) => c.nickname).join('·');
      if (!reporterKnown) {
        return `맞${nonPolice.short} ${names}님 중 조결·취재 공표가 나오면 그때 직업을 가리겠습니다.`;
      }
      return `${aliveReporter.nickname}님, 맞${nonPolice.short} ${names}님 중 취재로 진${nonPolice.short} 가려 주십시오.`;
    }
    const suspect = m42Matclaim.pickMatClaimSuspectLine(room, bot, helpers);
    if (suspect) return suspect;
  }

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
    const fact = pickFactTargetPlayer(room, bot);
    if (fact) {
      const reason = voteFacts.getAccuseReasonForTarget
        ? voteFacts.getAccuseReasonForTarget(room, bot, fact.id, helpers)
        : null;
      if (reason) {
        return `${reason} 근거로 ${fact.nickname}님 쪽이 더 수상합니다. 자투보다 지목하겠습니다.`;
      }
      return `${fact.nickname}님이 더 수상해서 자투보다 그쪽에 투표하겠습니다.`;
    }
    if (isMafia && Math.random() < 0.35) {
      return '오늘은 무투로 가도 될 것 같습니다.';
    }
    return '팩트가 부족하면 무투·자투도 있지만, 조결이 나왔으면 그걸 기준으로 지목하는 편이 낫습니다.';
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

  if (CHAT_M42_CLAIM_META.test(triggerText) && !onEvilSide && Math.random() < 0.4) {
    return '홀직·맞직·확직 구분해서 보겠습니다. 팩트 없으면 몰표는 위험합니다.';
  }

  if (CHAT_M42_NIGHT_META.test(triggerText) && !isMafia && Math.random() < 0.42) {
    return '밤 결과(조밤·물총·퍼블)부터 정리한 뒤 지목하겠습니다.';
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

    const pdReact = reactToPrivateDetectiveReport(room, bot, last, isMafia);
    if (pdReact) return pdReact;

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
      if (m42CultBots.isCultAlly(room, bot, accused)) {
        return m42CultBots.pickCultDeflectLine(speaker, accused.nickname);
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
        const redir = accuseWithReason(room, bot, altBot.id, speaker);
        if (redir) return redir;
        return `${speaker}님, 조사·취재 근거가 있을 때 지목하겠습니다.`;
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
        const line = accuseWithReason(room, bot, fact.id, speaker);
        if (line) return line;
        return `${speaker}님, ${accusedName}님보다 ${fact.nickname}님을 조사·취재 기준으로 먼저 보겠습니다.`;
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

  if (brief.isEvilBluff || isEvilBluffBot(bot)) {
    if (Math.random() < 0.88) {
      return m42Bluff.pickEvilBluffLine(room, bot, helpers);
    }
    return m42Bluff.pickContinuousEvilBluff(room, bot, helpers);
  }

  if (Math.random() < 0.4) {
    return m42.pickOpenLine(brief);
  }

  return '경찰·기자 결과가 있을 때만 투표·지목하는 것이 안전합니다.';
}

function generateBotDawnReaction(room, bot, nightReport) {
  if (!nightReport) return null;
  const revealBoost = (nightReport.reporterReveal || nightReport.mediumPurify) ? 0.25 : 0.78;
  if (Math.random() > revealBoost) return null;
  const brief = m42.buildSituationBrief(room, bot, { nightReport }, helpers);
  brief.nightReport = nightReport;
  const selfLine = skillDlg.pickSelfSkillFollowUp(brief, bot, nightReport);
  if (selfLine && Math.random() < 0.5) return selfLine;
  return skillDlg.pickDawnReaction(brief, bot, nightReport, helpers, room);
}

function pickReporterRevealDayLine(room, bot, reveal) {
  const brief = m42.buildSituationBrief(room, bot, { nightReport: { reporterReveal: reveal } }, helpers);
  return skillDlg.pickReporterRevealDayLine(brief, bot, reveal, helpers, room);
}

async function generateBotChat(room, bot, ctx = {}) {
  if (isEvilBluffBot(bot) && m42Bluff.shouldMuteCaughtMafiaBotDayChat(room, bot.id)) {
    return null;
  }
  const brief = m42.buildSituationBrief(room, bot, ctx, helpers);
  const isMafia = helpers.isMafiaTeam && helpers.isMafiaTeam(bot.role);
  const last = getLastMessage(room);
  const triggerText = ctx.triggerText || (last && last.text) || '';

  if (ctx.policeReportAck || ctx.privateDetectiveReportAck) {
    const ack = ctx.privateDetectiveReportAck
      ? reactToHumanPrivateDetectiveReport(room, bot, ctx, last)
      : reactToHumanPoliceReport(room, bot, ctx, last);
    // #region agent log
    agentLog({
      hypothesisId: 'B',
      location: 'bot-brain.js:generateBotChat',
      message: 'policeReportAck',
      data: {
        bot: bot.nickname,
        hasAck: !!ack,
        ackPreview: ack ? String(ack).slice(0, 50) : null,
        trigger: String(triggerText).slice(0, 60)
      }
    });
    // #endregion
    if (ack) return finalizeBotLine(room, bot, ack);
    const forced = generateRuleBased(room, bot, {
      ...ctx,
      policeReportAck: !!ctx.policeReportAck,
      privateDetectiveReportAck: !!ctx.privateDetectiveReportAck
    });
    if (forced) return finalizeBotLine(room, bot, forced);
    return null;
  }

  if (ctx.policeReport || wantsPoliceReport(room, triggerText, last, bot)) {
    const policeLine = pickPoliceReportLine(room, bot, triggerText, last);
    if (policeLine) return finalizeBotLine(room, bot, policeLine);
  }

  const rollCall = wantsRoleRollCall(triggerText, last);
  if (rollCall) {
    const line = buildRoleRollCallAnswer(room, bot, isMafia);
    if (line) return finalizeBotLine(room, bot, line);
  }

  const recentMsgs = getRecentChat(room, 14).filter((m) => m.fromId !== bot.id);
  if (recentMsgs.length) {
    brief.recentChat = recentMsgs.map((m) => `${m.from}: ${m.text}`).join('\n');
    brief.lastSpeaker = last && last.from ? last.from : recentMsgs[recentMsgs.length - 1].from;
    brief.lastMessage = last && last.text ? last.text : recentMsgs[recentMsgs.length - 1].text;
  }

  const useGemini = getAiProvider() === 'gemini';
  const skipLlmForPolice = bot.role === 'police' && wantsPoliceReport(room, triggerText, last, bot);
  const onEvilSide = isEvilBluffBot(bot);
  const bluffTrigger = m42Bluff.MAT_CHAT.test(triggerText.replace(/\s+/g, ''))
    || m42Bluff.JIKGONG_CHAT.test(triggerText.replace(/\s+/g, ''));
  const llmChance = useGemini
    ? (onEvilSide ? (bluffTrigger ? 0.82 : 0.68) : (bluffTrigger ? 0.22 : 0.45))
    : (onEvilSide ? (bluffTrigger ? 0.58 : 0.48) : 0.25);
  if (isLlmEnabled() && !skipLlmForPolice && Math.random() < llmChance) {
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
  return m42.suggestExecutionVote(brief, bot, candidate, helpers);
}

function pickAliveHintName(room, bot, brief) {
  if (brief && brief.topSuspect) return brief.topSuspect;
  const alive = helpers.getAlivePlayers ? helpers.getAlivePlayers(room) : [];
  const others = alive.filter((p) => p.id !== bot.id);
  if (!others.length) return '누군가';
  return others[Math.floor(Math.random() * others.length)].nickname;
}

function pickDeadChatFactLead(room, bot, brief, mind) {
  const roleName = (r) => (helpers.ROLE_LABELS && helpers.ROLE_LABELS[r]) || r;
  for (const [id, role] of Object.entries((mind && mind.knownRoles) || {})) {
    const p = helpers.getPlayerById ? helpers.getPlayerById(room, id) : null;
    if (!p || !p.alive || p.id === bot.id) continue;
    if (helpers.isMafiaRole && helpers.isMafiaRole(role)) {
      return {
        targetName: p.nickname,
        reason: `제가 밤에 확인한 직업이 [${roleName(role)}]`
      };
    }
  }

  const intel = room.game?.publicVoteIntel || [];
  for (const row of intel) {
    const p = helpers.getPlayerById ? helpers.getPlayerById(room, row.targetId) : null;
    if (!p || !p.alive || p.id === bot.id) continue;
    if (row.isMafia === true) {
      return {
        targetName: p.nickname,
        reason: '공개 조결/채팅 팩트에서 마피아 판정이 나온 대상'
      };
    }
    if (row.source === 'reporter' && row.role && helpers.isMafiaRole && helpers.isMafiaRole(row.role)) {
      return {
        targetName: p.nickname,
        reason: `기자 공표 직업이 [${roleName(row.role)}]`
      };
    }
  }

  const fact = pickFactTargetPlayer(room, bot);
  if (fact) {
    const reason = helpers.getAccuseReasonForTarget
      ? helpers.getAccuseReasonForTarget(room, bot, fact.id)
      : null;
    return { targetName: fact.nickname, reason: reason || '조결·투표 흐름상 의심도 최고' };
  }
  const fallback = pickAliveHintName(room, bot, brief);
  return { targetName: fallback, reason: '발언·투표 흐름상 가장 수상' };
}

function generateBotDeadChat(room, bot, ctx = {}) {
  const brief = m42.buildSituationBrief(room, bot, ctx, helpers);
  const mind = helpers.getBotMind ? helpers.getBotMind(room, bot.id) : { knownRoles: {} };
  const lead = pickDeadChatFactLead(room, bot, brief, mind);
  const targetName = lead.targetName || pickAliveHintName(room, bot, brief);
  const reason = lead.reason || '공개 팩트 기준';
  const replyTo = ctx.replyTo;

  if (replyTo && replyTo.text) {
    if (brief.isMafia) {
      return `${replyTo.from}님, 저는 시민이었습니다. ${reason} 근거로 ${targetName}님이 더 수상합니다.`;
    }
    return `${replyTo.from}님 말씀 들었습니다. ${reason} 근거로 저도 ${targetName}님을 지목합니다.`;
  }

  if (bot.role === 'mafia') {
    const lines = [
      `사망자 채팅입니다. ${reason} 근거로 ${targetName}님을 먼저 검증해 주십시오.`,
      `누명입니다. 다만 팩트 기준으로는 ${targetName}님 라인이 가장 의심됩니다.`,
      `저를 떠나서 ${targetName}님 발언·투표를 다시 보십시오. ${reason}가 남아 있습니다.`
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  if (bot.role === 'police') {
    const labels = helpers.roleLabels || helpers.ROLE_LABELS || {};
    const label = labels.police || '경찰';
    return `저는 ${label}이었습니다. ${reason} 근거로 ${targetName}님이 수상합니다. 영매님은 이 사망자 채팅을 낮에 전달해 주십시오.`;
  }

  if (bot.role === 'medium') {
    const lines = [
      `저는 영매였습니다. ${reason} 근거로 ${targetName}님을 의심했습니다. 살아 있는 영매는 낮에 이 채팅을 밀어 주십시오.`,
      `사망자 채팅입니다. ${targetName}님 쪽 단서가 남았습니다. ${reason}입니다.`,
      `영매 단서 남깁니다. ${reason} 기준으로 ${targetName}님 라인을 먼저 보십시오.`
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  for (const [id, role] of Object.entries(mind.knownRoles || {})) {
    const p = helpers.getPlayerById ? helpers.getPlayerById(room, id) : null;
    if (!p) continue;
    if (helpers.isMafiaRole && helpers.isMafiaRole(role)) {
      return `단서 남깁니다. ${p.nickname}님은 제가 알기로 마피아였습니다.`;
    }
  }

  const labels = helpers.roleLabels || helpers.ROLE_LABELS || {};
  const label = (bot.role && labels[bot.role]) || '시민';
  const lines = [
    `저는 ${label}이었습니다. ${reason} 근거로 ${targetName}님이 수상합니다.`,
    `사망자 채팅입니다. 제 직업은 ${label}입니다. ${targetName}님을 먼저 의심해 주십시오.`,
    `죽기 전 팩트로는 ${targetName}님 라인이 가장 수상했습니다. 영매님은 낮에 이 채팅을 전달해 주십시오.`
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
    knowledge: 'm42-with-cult'
  };
}

module.exports = {
  configure,
  generateBotChat,
  generateRuleBased,
  generateBotDawnReaction,
  pickReporterRevealDayLine,
  generateBotLastWords,
  generateBotDeadChat,
  pickBotExecutionVote,
  buildRoleRollCallAnswer,
  wantsRoleRollCall,
  getStatus,
  isLlmEnabled
};
