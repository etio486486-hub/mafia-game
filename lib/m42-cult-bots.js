/**
 * 교주팀 봇: 교주·신도를 대놓고 드러내지 않고 은밀히 보호.
 */
const m42Cult = require('./m42-cult');

function getCultLeader(room) {
  if (!room?.players) return null;
  return Object.values(room.players).find(
    (p) => p.alive && p.role === m42Cult.ROLE_CULT_LEADER
  ) || null;
}

function isCultAlly(room, bot, target) {
  if (!bot || !target || !target.alive) return false;
  if (!m42Cult.isCultMember(bot)) return false;
  if (m42Cult.isCultMember(target)) return true;
  const leader = getCultLeader(room);
  return !!(leader && target.id === leader.id);
}

function filterOutCultAllies(room, bot, ids) {
  if (!m42Cult.isCultMember(bot)) return ids;
  return ids.filter((id) => {
    const p = room.players[id] || Object.values(room.players).find((x) => x.id === id);
    return p && !isCultAlly(room, bot, p);
  });
}

/** 교주·신도 지목 시 은근히 막는 멘트 (직업 노출 금지) */
function pickCultDeflectLine(speakerName, targetName) {
  const lines = [
    `${speakerName}님, ${targetName}님은 말투·행동이 시민 쪽에 가깝습니다. 다른 분부터 보죠.`,
    `${targetName}님은 아직 근거가 약한 것 같습니다. 조결·취재가 나온 사람부터 가는 게 맞습니다.`,
    `${speakerName}님 말씀은 이해하지만, ${targetName}님보다 의심 포인트가 큰 분이 있을 것 같습니다.`,
    `성급히 ${targetName}님에게 몰기보다 경찰·기자 결과부터 맞추는 게 좋겠습니다.`
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

module.exports = {
  getCultLeader,
  isCultAlly,
  filterOutCultAllies,
  pickCultDeflectLine
};
