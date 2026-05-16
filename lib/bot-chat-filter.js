/**

 * 봇 채팅 출력 필터: 마피아 팀 노출·메타 발언·비공개 직업 단정 차단.

 */



const voteFacts = require('./bot-vote-facts');



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

  '경찰 이야기는 들었습니다. 팩트 없이 지목하지 않겠습니다.',

  '맞경이면 조결·행적부터 봐야 합니다. 저는 시민입니다.',

  '홀경·맞경 구분해서 진경·짭경 가려야 합니다.'

];



const CITIZEN_SAFE_LINES = [

  '일단 조사·취재 결과부터 정리하겠습니다.',

  '경찰 확인이면 조결을 기준으로 가겠습니다.',

  '근거 없이 경찰을 제거하자는 말은 위험합니다.',

  '경찰 조결·기자 공표가 나온 뒤에 판단하겠습니다.',

  '조사 결과가 채팅에 없어 단정하기 어렵습니다.'

];



const ROLE_CLAIM_SAFE = [

  '조결·기자 공표부터 듣고 추리하겠습니다.',

  '경찰 조사 결과가 나오기 전에는 직업 단정은 어렵습니다.',

  '팩트 없이 ○○님 직업을 말하는 건 위험합니다. 조사·취재부터 확인하겠습니다.'

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



function pickRoleClaimSafe() {

  return ROLE_CLAIM_SAFE[Math.floor(Math.random() * ROLE_CLAIM_SAFE.length)];

}



function findPlayerByNickname(room, name, helpers) {

  if (!name || !room) return null;

  const players = room.players ? Object.values(room.players) : [];

  return players.find((p) => p.nickname === name)

    || (helpers.getAlivePlayers

      ? helpers.getAlivePlayers(room).find((p) => p.nickname === name)

      : null);

}



function roleLabelToKey(label, helpers) {

  const labels = helpers.ROLE_LABELS || {};

  for (const [key, val] of Object.entries(labels)) {

    if (val === label) return key;

  }

  if (label === '마피아') return 'mafia';

  return null;

}



/** "김무현님은 경찰이었습니다" 등 — 공개 팩트 없으면 차단 */

/** 시민 직업이 마피아식 맞경 선동 멘트를 쓰는 경우 차단 */
function stripCitizenMatgyeongStir(text, bot, isMafiaTeam) {
  if (!text || !bot) return null;
  if (isMafiaTeam && isMafiaTeam(bot.role)) return null;
  const c = text.replace(/\s+/g, '');
  if (!/맞경입니다|짭경가려|짭경을가려|맞경인데|맞경이면.*짭경/.test(c)) return null;
  if (bot.role === 'politician') {
    return '저는 정치인입니다. 맞경 싸움보다 조결·취재 후 투표하겠습니다.';
  }
  return '맞직이면 조결·취재부터 확인하겠습니다. 저는 시민입니다.';
}

function stripUnauthorizedRoleClaims(text, room, bot, helpers) {

  if (!text || !room || !helpers) return null;

  const labels = helpers.ROLE_LABELS || {};

  const roleNames = [...new Set([...Object.values(labels), '마피아'])];

  const roleAlt = roleNames.map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

  const re = new RegExp(

    `([\\uAC00-\\uD7A3\\w]+)님(?:은|의\\s*직업은?)\\s*(?:\\[)?(${roleAlt})(?:\\])?(?:이었|입니다|였습니다|이었습니다|입니다)`,

    'g'

  );

  let m;

  while ((m = re.exec(text)) !== null) {

    const [, nick, roleLabel] = m;

    if (nick === bot.nickname) continue;

    const player = findPlayerByNickname(room, nick, helpers);

    if (!player) continue;

    const roleKey = roleLabelToKey(roleLabel, helpers);

    if (!roleKey) continue;

    const isPublic = voteFacts.isRolePublicForBot

      ? voteFacts.isRolePublicForBot(room, bot, player.id, roleKey, helpers)

      : false;

    if (!isPublic) return pickRoleClaimSafe();

  }

  return null;

}



function sanitizeBotChatLine(text, bot, isMafiaTeam, room = null, helpers = null) {

  if (!text || typeof text !== 'string') return text;

  const trimmed = text.replace(/\s+/g, ' ').trim();



  const matBlock = stripCitizenMatgyeongStir(trimmed, bot, isMafiaTeam);
  if (matBlock) return matBlock.slice(0, 180);

  if (room && helpers) {
    const roleBlock = stripUnauthorizedRoleClaims(trimmed, room, bot, helpers);
    if (roleBlock) return roleBlock.slice(0, 180);
  }



  if (!leaksMafia(trimmed)) return trimmed.slice(0, 180);

  const isMafia = isMafiaTeam && isMafiaTeam(bot.role);

  return pickSafeReplacement(isMafia);

}



module.exports = {

  leaksMafia,

  sanitizeBotChatLine,

  pickSafeReplacement,

  stripUnauthorizedRoleClaims

};


