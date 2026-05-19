/**
 * 낮 채팅 키워드·닉네임 언급 누적 → 의심 점수 (투표·지목용).
 */

const ACCUSE_PATTERNS = [
  { re: /마피아|맢(?!팀)|마피아팀|마피아입니다/, w: 10 },
  { re: /의심|수상|이상해|거슬|거짓|구라|뻥|헛소리|거짓말|빼박|들켰|들킨/, w: 6 },
  { re: /지목|투표|처형|몰표|죽이|제거/, w: 7 },
  { re: /맞직|짭경|가짜|위장|속였/, w: 5 },
  { re: /홀경|맞경|쓰리경|늦경/, w: 4 }
];

const TRUST_PATTERNS = [
  { re: /믿어|신뢰|확신/, w: 5 },
  { re: /무죄|깨끗|마피아\s*아님|시민\s*쪽|시민인/, w: 6 },
  { re: /조결.*아님|수사.*아님/, w: 7 },
  { re: /보호|눈힐|빼고/, w: 3 }
];

function ensureStore(room) {
  if (!room.game) return null;
  if (!room.game.chatSuspicion) {
    room.game.chatSuspicion = { byPlayer: {}, keywords: [] };
  }
  return room.game.chatSuspicion;
}

function bump(store, playerId, field, amount, keyword) {
  if (!playerId) return;
  if (!store.byPlayer[playerId]) {
    store.byPlayer[playerId] = { accused: 0, trust: 0, hits: [] };
  }
  store.byPlayer[playerId][field] += amount;
  if (keyword && store.byPlayer[playerId].hits.length < 12) {
    store.byPlayer[playerId].hits.push(keyword);
  }
}

function findMentionedPlayers(room, text, helpers) {
  const out = [];
  if (!text) return out;
  const compact = String(text).replace(/\s+/g, '');

  const push = (p) => {
    if (!out.some((x) => x.id === p.id)) out.push(p);
  };

  for (const p of Object.values(room.players || {})) {
    if (!p.alive || !p.nickname) continue;
    if (text.includes(p.nickname)) {
      push(p);
      continue;
    }
    const nick = String(p.nickname).replace(/\s+/g, '');
    const m = nick.match(/^봇(\d{1,2})$/i);
    if (m) {
      const num = m[1];
      const reBot = new RegExp(`봇\\s*${num}(?!\\d)`, 'i');
      const reNum = new RegExp(`(?:^|[^\\d])${num}(?:\\s*번|\\s*픽)(?!\\d)`, '');
      if (reBot.test(text) || reBot.test(compact) || reNum.test(compact) || reNum.test(text)) {
        push(p);
      }
    }
  }
  return out;
}

/** 낮 채팅 1건 반영 */
function ingestDayMessage(room, msg, helpers) {
  if (!msg?.text || msg.system || !room.game) return;
  const store = ensureStore(room);
  if (!store) return;

  const text = msg.text;
  const fromId = msg.fromId;
  let accuseWeight = 0;
  let trustWeight = 0;
  const kwHits = [];

  for (const { re, w } of ACCUSE_PATTERNS) {
    if (re.test(text)) {
      accuseWeight += w;
      kwHits.push(re.source.slice(0, 12));
    }
  }
  for (const { re, w } of TRUST_PATTERNS) {
    if (re.test(text)) {
      trustWeight += w;
      kwHits.push(`+${re.source.slice(0, 8)}`);
    }
  }

  const mentioned = findMentionedPlayers(room, text, helpers);
  if (accuseWeight > 0) {
    let accuseTargets = [];
    const primarySus = text.match(/([^\s.,]{2,24}?)님이\s*수상/);
    if (primarySus) {
      const nick = primarySus[1].replace(/님$/, '').trim();
      const hit = mentioned.find(
        (p) => p.nickname === nick || p.nickname.includes(nick) || nick.includes(p.nickname)
      );
      if (hit) accuseTargets = [hit];
    }
    if (!accuseTargets.length) {
      try {
        const voteFacts = require('./bot-vote-facts');
        const { innocent, mafia } = voteFacts.parsePoliceReportFromText(room, text);
        const mafiaOnly = mafia.filter((p) => !innocent.some((i) => i.id === p.id));
        if (mafiaOnly.length) accuseTargets = mafiaOnly;
      } catch (_) { /* noop */ }
    }
    if (!accuseTargets.length) accuseTargets = mentioned;
    for (const p of accuseTargets) {
      if (p.id === fromId) continue;
      bump(store, p.id, 'accused', accuseWeight + 3, kwHits.join(','));
    }
    if (!accuseTargets.length && fromId) {
      bump(store, fromId, 'trust', 1, 'accuse-no-target');
    }
  }
  if (trustWeight > 0) {
    for (const p of mentioned) {
      if (p.id === fromId) continue;
      bump(store, p.id, 'trust', trustWeight + 2, kwHits.join(','));
    }
  }

  if (/투표|지목/.test(text)) {
    for (const p of mentioned) {
      if (p.id !== fromId) bump(store, p.id, 'accused', 4, 'vote-mention');
    }
  }

  if (kwHits.length) {
    store.keywords.push({
      fromId,
      at: msg.time || Date.now(),
      snippet: text.slice(0, 48),
      tags: kwHits.slice(0, 4)
    });
    if (store.keywords.length > 80) store.keywords.shift();
  }
}

/** 봇 관점 의심 점수 (높을수록 투표 후보) */
function getSuspicionScores(room, voter, helpers) {
  const scores = {};
  const store = room.game?.chatSuspicion;
  const alive = helpers.getAlivePlayers
    ? helpers.getAlivePlayers(room).filter((p) => p.id !== voter.id)
    : [];

  for (const p of alive) {
    scores[p.id] = 0;
  }

  if (store?.byPlayer) {
    for (const p of alive) {
      const row = store.byPlayer[p.id];
      if (!row) continue;
      scores[p.id] = Math.max(0, (row.accused || 0) * 2 - (row.trust || 0) * 2);
    }
  }

  const dayChat = helpers.getChatMessages ? helpers.getChatMessages(room, 'day') : [];
  const recent = dayChat.slice(-35);
  for (const msg of recent) {
    if (!msg?.text || msg.fromId === voter.id) continue;
    const mentioned = findMentionedPlayers(room, msg.text, helpers);
    const isAccuse = ACCUSE_PATTERNS.some(({ re }) => re.test(msg.text));
    if (!isAccuse) continue;
    for (const p of mentioned) {
      if (p.id === voter.id || p.id === msg.fromId) continue;
      scores[p.id] = (scores[p.id] || 0) + 5;
    }
  }

  return scores;
}

function pickTopSuspectId(room, voter, helpers, { clearedIds = new Set(), excludeIds = [] } = {}) {
  const scores = getSuspicionScores(room, voter, helpers);
  const sorted = Object.entries(scores)
    .filter(([id, w]) => w > 0 && !clearedIds.has(id) && !excludeIds.includes(id))
    .sort((a, b) => b[1] - a[1]);
  return sorted.length ? sorted[0][0] : null;
}

module.exports = {
  ingestDayMessage,
  getSuspicionScores,
  pickTopSuspectId
};
