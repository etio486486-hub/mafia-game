/**
 * 성직자·테러리스트·짐승인간·광신도 (Mafia42 스타일)
 */
const m42Cult = require('./m42-cult');

const ROLE = {
  CLERIC: 'cleric',
  TERRORIST: 'terrorist',
  BEAST_MAN: 'beast_man',
  CULTIST: 'cultist'
};

function isBeastMan(player) {
  return player && player.role === ROLE.BEAST_MAN;
}

/** 경찰 조사 시 마피아로 잡히지 않음 */
function appearsInnocentToPolice(player) {
  return isBeastMan(player);
}

function isMafiaAligned(player) {
  if (!player) return false;
  if (player.role === 'mafia' || player.role === 'spy') return true;
  return isBeastMan(player) && !!player.beastManContacted;
}

function countAliveMafia(room, helpers) {
  return Object.values(room.players || {}).filter(
    (p) => p && p.alive && (p.role === 'mafia' || (helpers.isMafiaRole && helpers.isMafiaRole(p.role)))
  ).length;
}

function updateBeastManCraving(room, helpers) {
  const mafiaAlive = countAliveMafia(room, helpers);
  for (const p of Object.values(room.players || {})) {
    if (!isBeastMan(p) || !p.alive) continue;
    p.beastManCanKill = mafiaAlive === 0 && !!p.beastManContacted;
  }
}

/** 마피아 킬 투표에서 killTarget을 지목한 마피아 1명 */
function pickMafiaKillAttacker(room, killTarget) {
  const votes = room.game?.nightActions?.mafiaVotes || {};
  const mafiaIds = Object.values(room.players || {})
    .filter((p) => p && p.alive && p.role === 'mafia')
    .map((p) => p.id);
  for (const mid of mafiaIds) {
    if (votes[mid] === killTarget) return getPlayer(room, mid);
  }
  return mafiaIds.length ? getPlayer(room, mafiaIds[0]) : null;
}

function getPlayer(room, id) {
  return room.players && room.players[id] ? room.players[id] : null;
}

function canClericReviveTarget(room, target) {
  if (!target || target.alive) return { ok: false, message: '사망자만 부활시킬 수 있습니다.' };
  if (m42Cult.isCultMember(target)) {
    return { ok: false, message: '교주 진영은 부활할 수 없습니다.' };
  }
  return { ok: true, target };
}

function validateClericNightTarget(room, cleric, targetId) {
  if (!cleric || cleric.role !== ROLE.CLERIC || !cleric.alive) {
    return { ok: false, message: '성직자만 부활 대상을 지정할 수 있습니다.' };
  }
  if (cleric.clericUsed) return { ok: false, message: '부활 능력은 이미 사용했습니다.' };
  const target = getPlayer(room, targetId);
  return canClericReviveTarget(room, target);
}

/**
 * 마피아 킬 처리 분기 — { killed, contacted, oxidationDeaths[] }
 */
function resolveMafiaKillOnTarget(room, ctx) {
  const { target, killTarget, markPlayerDead, playerName, helpers } = ctx;
  const result = { killed: false, contacted: false, oxidationDeaths: [] };

  if (isBeastMan(target) && !target.beastManContacted) {
    target.beastManContacted = true;
    target.joinedMafiaChat = true;
    result.contacted = true;
    return result;
  }

  markPlayerDead(room, target);
  result.killed = true;

  if (target.role === ROLE.TERRORIST) {
    const attacker = pickMafiaKillAttacker(room, killTarget);
    if (attacker && attacker.alive) {
      markPlayerDead(room, attacker);
      result.oxidationDeaths.push(attacker.id);
    }
  }

  return result;
}

function applyBeastManNightKill(room, ctx) {
  const { markPlayerDead, playerName } = ctx;
  const targetId = room.game?.nightActions?.beastManKillTarget;
  if (!targetId) return null;
  const beast = Object.values(room.players || {}).find(
    (p) => isBeastMan(p) && p.alive && p.beastManCanKill
  );
  const target = getPlayer(room, targetId);
  if (!beast || !target || !target.alive) return null;
  markPlayerDead(room, target);
  return { beastId: beast.id, targetId, targetName: playerName(room, targetId) };
}

function applyClericReviveAtDayStart(room, ctx) {
  const g = room.game;
  const pending = g?.pendingClericRevive;
  if (!pending || !pending.targetId) return null;

  const target = getPlayer(room, pending.targetId);
  const cleric = getPlayer(room, pending.clericId);
  if (!target || !cleric) {
    g.pendingClericRevive = null;
    return null;
  }

  if (target.alive) {
    g.pendingClericRevive = null;
    return null;
  }
  if (m42Cult.isCultMember(target)) {
    g.pendingClericRevive = null;
    return null;
  }

  target.alive = true;
  target.deadSinceNightIndex = null;
  cleric.clericUsed = true;
  g.pendingClericRevive = null;

  return {
    targetId: target.id,
    targetName: target.nickname,
    clericName: cleric.nickname
  };
}

function applyTerroristMartyr(room, terrorist, martyrTargetId, ctx) {
  const { markPlayerDead, playerName } = ctx;
  if (!terrorist || terrorist.role !== ROLE.TERRORIST || !martyrTargetId) return null;
  const martyr = getPlayer(room, martyrTargetId);
  if (!martyr || !martyr.alive || martyr.id === terrorist.id) return null;
  markPlayerDead(room, martyr);
  return {
    martyrId: martyr.id,
    martyrName: playerName(room, martyr.id)
  };
}

function findAliveCultist(room) {
  return Object.values(room.players || {}).find(
    (p) => p && p.alive && p.role === ROLE.CULTIST
  );
}

function findCultLeader(room) {
  return Object.values(room.players || {}).find(
    (p) => p && p.alive && p.role === m42Cult.ROLE_CULT_LEADER
  );
}

/** 교주 사망 시 광신도 → 교주 승계 */
function promoteCultistToLeader(room, cultist) {
  if (!cultist || cultist.role !== ROLE.CULTIST) return null;
  cultist.role = m42Cult.ROLE_CULT_LEADER;
  cultist.joinedCult = true;
  return cultist;
}

function onCultLeaderDeath(room) {
  const cultist = findAliveCultist(room);
  if (!cultist) return null;
  return promoteCultistToLeader(room, cultist);
}

function notifyCultistOfLeader(room, cultist, leader) {
  if (!cultist || !leader || cultist.role !== ROLE.CULTIST) return;
  cultist._cultLeaderId = leader.id;
}

function emitCultistLeaderKnowledge(room, cultist, leader, emitPrivate) {
  if (!cultist || !leader || !emitPrivate) return;
  emitPrivate(cultist.userID, {
    type: 'cultist_leader',
    leaderId: leader.id,
    leaderName: leader.nickname,
    message: `교주는 ${leader.nickname}님입니다. 포교 시 즉시 교주팀이 됩니다.`
  });
}

module.exports = {
  ROLE,
  isBeastMan,
  appearsInnocentToPolice,
  isMafiaAligned,
  countAliveMafia,
  updateBeastManCraving,
  pickMafiaKillAttacker,
  canClericReviveTarget,
  validateClericNightTarget,
  resolveMafiaKillOnTarget,
  applyBeastManNightKill,
  applyClericReviveAtDayStart,
  applyTerroristMartyr,
  findAliveCultist,
  findCultLeader,
  promoteCultistToLeader,
  onCultLeaderDeath,
  notifyCultistOfLeader,
  emitCultistLeaderKnowledge
};
