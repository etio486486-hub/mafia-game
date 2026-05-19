/**
 * 마피아42 교주팀 — 홀수 밤 포교, 제3세력 승리 조건.
 * @see https://namu.wiki/w/%EA%B5%90%EC%A3%BC(%EB%A7%88%ED%94%BC%EC%95%8442)
 */

const ROLE_CULT_LEADER = 'cult_leader';

function isCultMember(player) {
  if (!player) return false;
  return !!(player.joinedCult || player.role === ROLE_CULT_LEADER);
}

/** 홀수 번째 밤(1, 3, 5…) — nightIndex는 startNight에서 1부터 증가 */
function isOddProselytizeNight(room) {
  const n = room.game?.nightIndex || 0;
  return n > 0 && n % 2 === 1;
}

function canProselytizeTonight(room, leader) {
  if (!room?.game || room.phase !== 'night') return false;
  if (!leader?.alive || leader.role !== ROLE_CULT_LEADER) return false;
  if (!isOddProselytizeNight(room)) return false;
  if (room.game.nightActions?.cultProselytizedSuccess) return false;
  return true;
}

function isValidProselytizeTarget(room, leader, target, helpers) {
  if (!target || !target.alive) return { ok: false, message: '생존자만 포교할 수 있습니다.' };
  if (target.id === leader.id) return { ok: false, message: '자신은 포교할 수 없습니다.' };
  if (isCultMember(target)) return { ok: false, message: '이미 교주팀입니다.' };
  if (helpers.isMafiaRole(target.role)) {
    return { ok: false, message: '마피아에게 포교할 수 없습니다.', failType: 'mafia' };
  }
  if (helpers.isMafiaTeam(target.role)) {
    return { ok: false, message: '마피아 팀에게 포교할 수 없습니다.', failType: 'mafia' };
  }
  return { ok: true, target };
}

function sumVotePower(players, getDayVoteWeight) {
  let sum = 0;
  for (const p of players) {
    if (!p.alive) continue;
    sum += getDayVoteWeight(p) || 1;
  }
  return sum;
}

/**
 * 마피아 전멸 후: 교주팀 투표권 > 비교주 시민이면 교주 승리.
 */
function checkCultWinAfterMafiaGone(room, alive, helpers) {
  const cultAlive = alive.filter((p) => isCultMember(p));
  if (!cultAlive.length) return null;

  const citizenAlive = alive.filter(
    (p) => !helpers.isMafiaTeam(p.role) && !isCultMember(p)
  );
  const cultPower = sumVotePower(cultAlive, helpers.getDayVoteWeight);
  const citizenPower = sumVotePower(citizenAlive, helpers.getDayVoteWeight);

  if (cultPower >= citizenPower && cultAlive.length > 0) {
    return {
      winner: 'cult',
      message: '교주 팀 승리! 마피아를 제거한 뒤 교주팀이 우위를 점했습니다.'
    };
  }
  if (citizenAlive.length === 0 && cultAlive.length > 0) {
    return {
      winner: 'cult',
      message: '교주 팀 승리! 남은 생존자가 모두 교주팀입니다.'
    };
  }
  return null;
}

module.exports = {
  ROLE_CULT_LEADER,
  isCultMember,
  isOddProselytizeNight,
  canProselytizeTonight,
  isValidProselytizeTarget,
  checkCultWinAfterMafiaGone
};
