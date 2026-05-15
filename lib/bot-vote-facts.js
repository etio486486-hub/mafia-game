/**
 * 봇 낮/찬반 투표: 공개·본인 스킬 결과만 반영 (추측·채팅 몰표 제외).
 */

const CITIZEN_POWER_PRIORITY = {
  police: 100,
  doctor: 92,
  reporter: 88,
  soldier: 70,
  politician: 55,
  medium: 50,
  citizen: 20,
  graverobber: 25
};

function powerPri(role) {
  return CITIZEN_POWER_PRIORITY[role] || 15;
}

function collectVoteIntel(room, bot, helpers) {
  const isMafia = helpers.isMafiaTeam(bot.role);
  const voteMafia = [];
  const voteCitizen = [];
  const cleared = new Set();
  const g = room.game || {};

  const addMafia = (id, pri) => {
    if (!isMafia) voteMafia.push({ id, pri });
  };
  const addCitizen = (id, pri) => {
    if (isMafia) voteCitizen.push({ id, pri });
  };
  const markCleared = (id) => cleared.add(id);

  const aliveTarget = (targetId) => {
    const p = helpers.getPlayerById(room, targetId);
    if (!p || !p.alive || p.id === bot.id) return null;
    return p;
  };

  for (const row of g.publicVoteIntel || []) {
    const p = aliveTarget(row.targetId);
    if (!p) continue;

    if (row.source === 'police') {
      if (row.isMafia === true) {
        addMafia(p.id, 100);
        if (isMafia) markCleared(p.id);
      } else if (row.isMafia === false) {
        markCleared(p.id);
        addCitizen(p.id, 35 + powerPri(p.role));
      }
    }

    if (row.source === 'reporter' && row.role) {
      if (helpers.isMafiaRole(row.role)) {
        addMafia(p.id, 90);
        if (isMafia) markCleared(p.id);
      } else {
        markCleared(p.id);
        addCitizen(p.id, powerPri(row.role));
      }
    }

    if (row.source === 'soldier_block' && row.role === 'soldier') {
      markCleared(p.id);
    }
  }

  if (bot.role === 'police' && g.policeIntel && g.policeIntel[bot.id]) {
    for (const row of g.policeIntel[bot.id]) {
      const p = aliveTarget(row.targetId);
      if (!p) continue;
      if (row.isMafia) addMafia(p.id, 98);
      else {
        markCleared(p.id);
        addCitizen(p.id, 40 + powerPri(p.role));
      }
    }
  }

  const mind = helpers.getBotMind ? helpers.getBotMind(room, bot.id) : { knownRoles: {} };
  const privatePri = bot.role === 'spy' ? 88 : bot.role === 'medium' ? 72 : 76;

  for (const [id, role] of Object.entries(mind.knownRoles || {})) {
    const p = aliveTarget(id);
    if (!p) continue;
    if (helpers.isMafiaRole(role)) {
      addMafia(p.id, privatePri);
      if (isMafia) markCleared(p.id);
    } else {
      markCleared(p.id);
      addCitizen(p.id, powerPri(role));
    }
  }

  return { voteMafia, voteCitizen, cleared, isMafia };
}

function pickBest(pool, cleared, isMafia) {
  const valid = pool.filter((t) => {
    if (isMafia && cleared.has(t.id)) return false;
    if (!isMafia && cleared.has(t.id)) return false;
    return true;
  });
  if (!valid.length) return null;
  valid.sort((a, b) => b.pri - a.pri);
  return valid[0].id;
}

function pickFactBasedDayVote(room, bot, helpers) {
  const { voteMafia, voteCitizen, cleared, isMafia } = collectVoteIntel(room, bot, helpers);
  if (isMafia) {
    return pickBest(voteCitizen, cleared, true);
  }
  return pickBest(voteMafia, cleared, false);
}

function pickFactBasedExecutionVote(room, bot, candidate, helpers) {
  if (!candidate || !candidate.alive) return 'no';
  if (candidate.role === 'politician' && !helpers.isMafiaTeam(bot.role)) {
    return 'no';
  }

  const { voteMafia, voteCitizen, cleared, isMafia } = collectVoteIntel(room, bot, helpers);

  if (isMafia) {
    if (helpers.isMafiaTeam(candidate.role)) return 'no';
    if (cleared.has(candidate.id) && helpers.isMafiaRole
      && voteMafia.some((t) => t.id === candidate.id)) {
      return 'no';
    }
    return voteCitizen.some((t) => t.id === candidate.id) ? 'yes' : 'no';
  }

  if (voteMafia.some((t) => t.id === candidate.id)) return 'yes';
  if (cleared.has(candidate.id)) return 'no';
  return 'no';
}

function hasAnyVoteFact(room, bot, helpers) {
  const { voteMafia, voteCitizen, isMafia } = collectVoteIntel(room, bot, helpers);
  return isMafia ? voteCitizen.length > 0 : voteMafia.length > 0;
}

module.exports = {
  pickFactBasedDayVote,
  pickFactBasedExecutionVote,
  hasAnyVoteFact,
  powerPri
};
