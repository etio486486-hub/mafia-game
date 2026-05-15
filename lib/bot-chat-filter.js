/**
 * 봇 채팅 출력 필터: 마피아 팀 노출·메타 발언 차단.
 */

const MAFIA_LEAK_PATTERNS = [
  /마피아에게\s*위협/,
  /마피아에게\s*이득/,
  /마피아팀/,
  /우리\s*마피아/,
  /저희\s*마피아/,
  /마피아로서/,
  /마피아가\s*이기/,
  /마피아가\s*승리/,
  /마피아\s*입장/,
  /제거해야.*마피아/,
  /마피아.*제거/,
  /우선적으로\s*제거/,
  /시민에게\s*위협/,
  /경찰.*제거해야/,
  /경찰이\s*맞다면.*제거/,
  /위협이\s*될\s*수\s*있습니다/,
  /마피아에게\s*도움/,
  /경찰.*위협/,
  /경찰이면.*제거/,
  /경찰.*제거/,
  /제거.*경찰/,
  /마피아.*위협/
];

const MAFIA_SAFE_POLICE_LINES = [
  '퍼경일 수도 있습니다. 조결·취재 결과부터 확인하겠습니다.',
  '경찰이 맞다면 시민 편에 도움이 됩니다. 다른 분부터 살펴보겠습니다.',
  '일단 밤 사망·기자 공표부터 맞춰 보겠습니다.',
  '경찰 이야기는 들었습니다. 팩트 없이 지목하지 않겠습니다.'
];

const CITIZEN_SAFE_LINES = [
  '일단 조사·취재 결과부터 정리하겠습니다.',
  '경찰 확인이면 조결을 기준으로 가겠습니다.',
  '근거 없이 경찰을 제거하자는 말은 위험합니다.'
];

function leaksMafia(text) {
  if (!text) return false;
  const compact = text.replace(/\s+/g, '');
  return MAFIA_LEAK_PATTERNS.some((re) => re.test(text) || re.test(compact));
}

function pickSafeReplacement(isMafia) {
  const pool = isMafia ? MAFIA_SAFE_POLICE_LINES : CITIZEN_SAFE_LINES;
  return pool[Math.floor(Math.random() * pool.length)];
}

function sanitizeBotChatLine(text, bot, isMafiaTeam) {
  if (!text || typeof text !== 'string') return text;
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!leaksMafia(trimmed)) return trimmed.slice(0, 180);
  const isMafia = isMafiaTeam && isMafiaTeam(bot.role);
  return pickSafeReplacement(isMafia);
}

module.exports = {
  leaksMafia,
  sanitizeBotChatLine,
  pickSafeReplacement
};
