/**
 * 맞경·맞의·맞군·맞영·맞기 등 맞직 갈등 — 시민 봇 의심·검증·티키타카.
 * 맞직 2명이면 한쪽이 맢일 확률 ~50% 가정으로 의심·변명 루프.
 */

const m42RoleConfirm = require('./m42-role-confirm');

/** 순환 require 시 빈 exports가 캐시되지 않도록 지연 로드 */
function bluff() {
  return require('./m42-bluff');
}
const policeFmt = require('./police-report-format');
const { agentLog } = require('./debug-agent-log');

const MAT_ROLES = ['police', 'doctor', 'soldier', 'medium', 'reporter'];
const ROLE_KO = {
  police: '경찰',
  doctor: '의사',
  soldier: '군인',
  medium: '영매',
  reporter: '기자'
};
const ROLE_SHORT = {
  police: '경',
  doctor: '의',
  soldier: '군',
  medium: '영',
  reporter: '기'
};

const POLICE_REPORT_CHAT = /수사\s*결과|조사\s*결과|경찰\s*조결|마피아\s*아닙|무죄입니다|조사했는데|제\s*조사/;

const ROLE_CLAIM_DETECT = {
  police: /(?:저(?:는)?|나(?:는)?|제가|전)\s*(?:경찰|홀경|자경|진경)|(?:저|제가)\s*(?:홀경|자경|진경)|경찰입니다|(?:저|제가)\s*(?:수사|조사)(?:하겠|할)|경찰이(?:다|에요|라)/,
  doctor: /저는\s*의사|나는\s*의사|의사입니다|홀의|눈힐입니다/,
  soldier: /저는\s*군인|나는\s*군인|군인입니다|홀군|방탄\s*있/,
  reporter: /저는\s*기자|나는\s*기자|기자입니다|홀기|취재하겠/,
  medium: /저는\s*영매|영매입니다|홀영/
};

/** 맞직 2명 중 한 명이 맢일 확률 (게임 메타) */
const MAFIA_ONE_OF_TWO_P = 0.5;

/** 채팅 순서상 해당 직업으로 처음 등장한 사람만 (맞경·맞직은 최대 2명 고정) */
function getFirstRoleClaimantsInOrder(room, helpers, role, limit = 2) {
  const order = [];
  const seen = new Set();
  for (const msg of getDayChat(room)) {
    if (!msg?.fromId || !msg.text || msg.system) continue;
    const p = helpers.getPlayerById ? helpers.getPlayerById(room, msg.fromId) : null;
    if (p && !p.alive) continue;
    if (seen.has(msg.fromId)) continue;

    let hit = false;
    if (role === 'police') {
      hit = bluff().isPoliceClaimForMatgyeongOrder(msg.text);
    } else {
      const compact = String(msg.text).replace(/\s+/g, '');
      const re = ROLE_CLAIM_DETECT[role];
      hit = !!(re && (re.test(compact) || re.test(msg.text)));
    }
    if (!hit) continue;

    seen.add(msg.fromId);
    order.push({
      id: msg.fromId,
      nickname: msg.from || (p && p.nickname) || '?'
    });
    if (order.length >= limit) break;
  }
  return order;
}

/** 맨 처음 경찰(직공·조결)로 나온 2명만 맞경 — 그 이후 경찰 주장자는 배지 없음 */
function getFirstPoliceMatgyeongClaimants(room, helpers, limit = 2) {
  return getFirstRoleClaimantsInOrder(room, helpers, 'police', limit);
}

/** 확직(publicConfirmed) 제외 — 맞직/맞경 슬롯 배지 표시 가능 여부 */
function canShowMatchedClaimBadges(room, helpers) {
  if (!room?.game) return false;
  const phase = room.phase;
  if (phase === 'lobby' || phase === 'game_over' || phase === 'none') return false;
  if (getFirstPoliceMatgyeongClaimants(room, helpers, 2).length >= 2) return true;
  for (const role of MAT_ROLES) {
    if (role === 'police') continue;
    if (role === 'medium' || role === 'reporter') {
      if (!m42RoleConfirm.canConfirmSkillPerformers(room)) continue;
    }
    const firstTwo = getFirstRoleClaimantsInOrder(room, helpers, role, 2);
    const alive = firstTwo.filter((c) => {
      const p = helpers.getPlayerById ? helpers.getPlayerById(room, c.id) : null;
      return !p || p.alive;
    });
    if (alive.length >= 2) return true;
  }
  return false;
}

function getDayChat(room) {
  return (room.chatLog && room.chatLog.day) || [];
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 최근 낮 채팅과 동일한 문장은 피해 연속 중복 멘트 완화 */
function filterLinesNotInRecentDay(room, lines) {
  if (!lines || !lines.length) return lines;
  const recent = getDayChat(room).slice(-14).map((m) => m && m.text).filter(Boolean);
  const set = new Set(recent);
  const fresh = lines.filter((l) => l && !set.has(l));
  return fresh.length ? fresh : lines;
}

function isEvilBot(bot, helpers) {
  return bluff().isEvilBluffBot(bot, helpers);
}

/** 플레이어가 채팅에서 주장한 직업 (사망자 포함, 메시지 기준) */
function getPlayerClaimedRoles(room, playerId) {
  const roles = new Set();
  if (!playerId) return [];
  for (const msg of getDayChat(room)) {
    if (!msg?.text || msg.fromId !== playerId) continue;
    const compact = String(msg.text).replace(/\s+/g, '');
    for (const [role, re] of Object.entries(ROLE_CLAIM_DETECT)) {
      if (role === 'police') {
        if (bluff().isExplicitPoliceRoleClaim(msg.text)) roles.add('police');
      } else if (re.test(compact) || re.test(msg.text)) {
        roles.add(role);
      }
    }
    if (POLICE_REPORT_CHAT.test(msg.text) || policeFmt.looksLikePoliceReport(msg.text)) {
      roles.add('police');
    }
  }
  return [...roles];
}

function mergeClaimants(lists) {
  const byId = new Map();
  for (const list of lists) {
    for (const c of list || []) {
      if (!c?.id) continue;
      if (!byId.has(c.id)) byId.set(c.id, { id: c.id, nickname: c.nickname || '?' });
    }
  }
  return [...byId.values()];
}

/** UI·슬롯용: 채팅 등장 순 최초 2명만 맞경/맞직 (이후 동일 직업 주장자는 제외) */
function scanMatClaimConflictsForUi(room, helpers) {
  const conflicts = [];

  for (const role of MAT_ROLES) {
    if (role === 'medium' || role === 'reporter') {
      if (!m42RoleConfirm.canConfirmSkillPerformers(room)) continue;
    }
    const list = getFirstRoleClaimantsInOrder(room, helpers, role, 2);
    const alive = list.filter((c) => {
      const p = helpers.getPlayerById ? helpers.getPlayerById(room, c.id) : null;
      return !p || p.alive;
    });
    if (alive.length >= 2) {
      conflicts.push({ role, claimants: alive, label: ROLE_KO[role], short: ROLE_SHORT[role] });
    }
  }
  return conflicts;
}

/** 생존자 기준 맞직 갈등 (봇 대화·의심 — 조결 발화도 경찰 맞경 후보에 포함) */
function scanMatClaimConflicts(room, helpers) {
  const claims = bluff().scanRoleClaims(room, helpers);
  const conflicts = [];

  for (const role of MAT_ROLES) {
    let list = [...(claims[role] || [])];
    if (role === 'police') {
      list = mergeClaimants([list, bluff().scanPoliceReporters(room, helpers)]);
    }
    if (role === 'medium' || role === 'reporter') {
      if (!m42RoleConfirm.canConfirmSkillPerformers(room)) {
        list = [];
      } else if (role === 'medium') {
        const perfIds = m42RoleConfirm.collectMediumPerformerIds(
          room,
          helpers,
          helpers.roleLabels || {}
        );
        list = perfIds.map((id) => {
          const p = helpers.getPlayerById ? helpers.getPlayerById(room, id) : null;
          return { id, nickname: p?.nickname || '?' };
        });
      } else {
        const perfIds = m42RoleConfirm.collectReporterPerformerIds(room, helpers);
        list = perfIds.map((id) => {
          const p = helpers.getPlayerById ? helpers.getPlayerById(room, id) : null;
          return { id, nickname: p?.nickname || '?' };
        });
      }
    }
    const alive = list.filter((c) => {
      const p = helpers.getPlayerById ? helpers.getPlayerById(room, c.id) : null;
      return !p || p.alive;
    });
    if (alive.length >= 2) {
      conflicts.push({ role, claimants: alive, label: ROLE_KO[role], short: ROLE_SHORT[role] });
    }
  }
  return conflicts;
}

function hasActiveMatConflicts(room, helpers) {
  return scanMatClaimConflicts(room, helpers).length > 0;
}

function pickSuspectFromClaimants(claimants, excludeId) {
  const pool = claimants.filter((c) => c.id !== excludeId);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 시민·악역 공통: 맞직 중 한 명을 의심 (50% 프레이밍) */
function pickMatClaimSuspectLine(room, bot, helpers, ctx = {}) {
  const conflicts = scanMatClaimConflicts(room, helpers);
  if (!conflicts.length) return null;

  const conflict = ctx.role
    ? conflicts.find((c) => c.role === ctx.role) || conflicts[0]
    : conflicts[Math.floor(Math.random() * conflicts.length)];

  const { role, claimants, label, short } = conflict;
  const selfIn = claimants.some((c) => c.id === bot.id);

  if (selfIn) {
    const rival = claimants.find((c) => c.id !== bot.id);
    if (!rival) return null;
    if (role === 'police') {
      const evil = isEvilBot(bot, helpers);
      if (Math.random() < 0.55) {
        return bluff().pickMatgyeongTikiTakaLine(room, bot, { id: rival.id, nickname: rival.nickname }, { isEvil: evil, round: ctx.round || 0 });
      }
      return bluff().pickPoliceVersusBicker(bot.nickname, rival.nickname, evil);
    }
    const mat = bluff().buildRoleMatgyeongClaim(room, bot, helpers, role);
    if (mat) return mat;
    return `${rival.nickname}님 맞${short}입니다. 저 ${bot.nickname}가 진${short}이고 ${rival.nickname}님이 짭${short}로 보입니다.`;
  }

  const assumeMafia = Math.random() < MAFIA_ONE_OF_TWO_P;
  const suspect = pickSuspectFromClaimants(claimants, bot.id);
  if (!suspect) return null;
  const others = claimants.filter((c) => c.id !== suspect.id).map((c) => c.nickname).join('·');

  const suspectLines = assumeMafia
    ? [
      `맞${short}(${label})면 한쪽은 맢일 확률이 큽니다. ${suspect.nickname}님부터 의심합니다.`,
      `${suspect.nickname}·${others}님 맞${short}인데, ${suspect.nickname}님 라인이 더 수상합니다. 조결·취재로 확인합시다.`,
      `맞직은 둘 중 하나가 거짓일 때가 많습니다. 저는 ${suspect.nickname}님부터 지목하겠습니다.`,
      `${label} 두 명이면 ${suspect.nickname}님 조결이·직공이 앞뒤가 안 맞습니다. ${others}님은 일단 보류합니다.`
    ]
    : [
      `맞${short} 나왔으니 ${suspect.nickname}·${others}님 둘 다 검증이 필요합니다. 성불·조사·취재로 가죠.`,
      `${suspect.nickname}님만 보기보다 맞${short} 둘 다 팩트로 가립시다. 영매 성불·경찰 조사 부탁드립니다.`,
      `맞${short}면 감정 싸움 말고 ${suspect.nickname}님·${others}님 조결·취재부터 맞춰 봅시다.`
    ];

  // #region agent log
  agentLog({
    hypothesisId: 'Mc1',
    location: 'm42-matclaim-playbook.js:pickMatClaimSuspectLine',
    message: 'mat claim suspect line',
    runId: 'matclaim',
    data: {
      bot: bot.nickname,
      role,
      suspect: suspect.nickname,
      assumeMafia,
      claimants: claimants.map((c) => c.nickname)
    }
  });
  // #endregion

  return pick(filterLinesNotInRecentDay(room, suspectLines));
}

/** 맞직 당사자 티키타카 한 줄 */
function pickMatClaimTikiTakaLine(room, bot, helpers, opts = {}) {
  const conflicts = scanMatClaimConflicts(room, helpers);
  if (!conflicts.length) return null;

  const conflict = conflicts[opts.conflictIndex != null
    ? opts.conflictIndex % conflicts.length
    : Math.floor(Math.random() * conflicts.length)];

  const { role, claimants } = conflict;
  const rivalEntry = claimants.find((c) => c.id !== bot.id);
  if (!rivalEntry) return pickMatClaimSuspectLine(room, bot, helpers, { role, round: opts.round });

  const rival = helpers.getPlayerById
    ? helpers.getPlayerById(room, rivalEntry.id)
    : { id: rivalEntry.id, nickname: rivalEntry.nickname };

  if (role === 'police') {
    return bluff().pickMatgyeongTikiTakaLine(room, bot, rival, {
      isEvil: isEvilBot(bot, helpers),
      round: opts.round || 0
    });
  }

  if (claimants.some((c) => c.id === bot.id)) {
    let line = bluff().buildRoleMatgyeongClaim(room, bot, helpers, role)
      || pickMatClaimSuspectLine(room, bot, helpers, { role, round: opts.round });
    const recent = getDayChat(room).slice(-12).map((m) => m && m.text).filter(Boolean);
    if (line && recent.includes(line)) {
      line = pickMatClaimSuspectLine(room, bot, helpers, { role, round: opts.round });
    }
    return line;
  }

  return pickMatClaimSuspectLine(room, bot, helpers, { role, round: opts.round });
}

/** 채팅 트리거 반응 */
function pickMatClaimReactiveLine(room, bot, helpers, triggerText, last) {
  const compact = `${triggerText || ''} ${last?.text || ''}`.replace(/\s+/g, '');
  if (!bluff().MAT_CHAT.test(compact) && !/맞직|쓰리경|쓰리의|쓰리군|쓰리영|쓰리기|짭경|짭의|짭군|짭영/.test(compact)) {
    return null;
  }

  if (last && last.fromId !== bot.id) {
    const who = last.from;
    const accused = helpers.getPlayerById ? helpers.getPlayerById(room, last.fromId) : null;
    const conflicts = scanMatClaimConflicts(room, helpers);
    for (const c of conflicts) {
      if (c.claimants.some((x) => x.id === bot.id) && accused && c.claimants.some((x) => x.id === accused.id)) {
        const line = pickMatClaimTikiTakaLine(room, bot, helpers, { role: c.role, round: 1 });
        if (line) return line.includes(who) ? line : `${who}님 말씀 기준 — ${line}`;
      }
    }
    if (/맞경|맞직|홀경|조결|수사/.test(last.text || '')) {
      const line = pickMatClaimSuspectLine(room, bot, helpers)
        || pickMatClaimTikiTakaLine(room, bot, helpers, { round: 0 });
      if (line) return line.includes(who) ? line : `${who}님 말씀 기준 — ${line}`;
    }
  }

  if (Math.random() < 0.68) {
    return pickMatClaimSuspectLine(room, bot, helpers) || pickMatClaimTikiTakaLine(room, bot, helpers, { round: 0 });
  }
  return null;
}

/**
 * 맞직 주장자가 밤에 죽었을 때 — 성불·조사·취재로 진짜 확인 유도.
 * deadInfo: { id, name, roles[], matRoles[] }
 */
function pickDeadClaimantAnalysisLine(room, bot, helpers, deadInfo) {
  if (!deadInfo?.id) return null;

  const name = deadInfo.name || deadInfo.nickname || '사망자';
  const roles = deadInfo.matRoles || deadInfo.roles || [];
  const nightIdx = room.game?.nightIndex || 0;

  const alivePolice = Object.values(room.players || {}).find(
    (p) => p && p.alive && p.role === 'police'
  );
  const aliveMedium = Object.values(room.players || {}).find(
    (p) => p && p.alive && p.role === 'medium'
  );
  const aliveReporter = Object.values(room.players || {}).find(
    (p) => p && p.alive && p.role === 'reporter' && !p.reporterUsed
  );

  const conflicts = scanMatClaimConflicts(room, helpers);
  const lines = [];

  if (roles.includes('police')) {
    const otherPolice = conflicts.find((c) => c.role === 'police');
    const survivor = otherPolice?.claimants.find((c) => c.id !== deadInfo.id);
    if (aliveMedium) {
      lines.push(
        `${name}님(맞경·경찰 주장)이 죽었습니다. ${aliveMedium.nickname}님, ${name}님 성불로 진짜 경찰인지 확인 부탁드립니다.`,
        `${name}님 밤에 죽었습니다. 영매 성불로 경찰이었는지 보면 ${survivor ? `${survivor.nickname}님` : '남은 경찰'}이 홀경인지 짭경인지 갈립니다.`
      );
    }
    if (survivor) {
      lines.push(
        `${name}님 맞경 중 사망입니다. 살아 있는 ${survivor.nickname}님 조결·밤 수사 기록이 맞는지부터 검증합시다.`,
        `${name}님이 죽었으니 ${survivor.nickname}님 조결이 진경인지 시민이 판단해야 합니다.`
      );
    }
    if (alivePolice && alivePolice.id !== deadInfo.id) {
      lines.push(
        `${name}님 사망으로 맞경 한 명이 빠졌습니다. ${alivePolice.nickname}님, 남은 조결로 다시 맞춰 주십시오.`
      );
    }
  }

  if (roles.includes('doctor')) {
    const other = conflicts.find((c) => c.role === 'doctor');
    const survivor = other?.claimants.find((c) => c.id !== deadInfo.id);
    lines.push(
      `${name}님(맞의) 사망입니다. 조밤·힐 타이밍과 ${survivor ? `${survivor.nickname}님` : '남은 의사'} 주장을 대조합시다.`,
      `맞의 중 ${name}님이 죽었습니다. ${aliveMedium ? `${aliveMedium.nickname}님 성불로 ` : ''}의사였는지·맢였는지 확인이 필요합니다.`
    );
  }

  if (roles.includes('soldier')) {
    const other = conflicts.find((c) => c.role === 'soldier');
    const survivor = other?.claimants.find((c) => c.id !== deadInfo.id);
    lines.push(
      `${name}님(맞군) 사망입니다. 방탄·조밤 기록과 ${survivor ? `${survivor.nickname}님` : '남은 군인'} 주장을 맞춰 봅시다.`,
      `맞군 중 ${name}님이 죽었습니다. 군인이었다면 조밤에 막힌 적이 있어야 합니다.`
    );
  }

  if (roles.includes('medium')) {
    const other = conflicts.find((c) => c.role === 'medium');
    const survivor = other?.claimants.find((c) => c.id !== deadInfo.id);
    lines.push(
      `${name}님(맞영) 사망입니다. ${survivor ? `${survivor.nickname}님` : '남은 영매'} 성불 결과와 대조합시다.`,
      `맞영 중 ${name}님이 죽었습니다. ${alivePolice ? `${alivePolice.nickname}님 조사로` : '조사·취재로'} ${survivor ? survivor.nickname : '남은 영매'} 검증합시다.`
    );
  }

  if (roles.includes('reporter')) {
    const other = conflicts.find((c) => c.role === 'reporter');
    const survivor = other?.claimants.find((c) => c.id !== deadInfo.id);
    if (nightIdx >= 2 && aliveReporter) {
      lines.push(
        `${name}님(맞기) 사망입니다. ${aliveReporter.nickname}님, ${survivor ? `${survivor.nickname}님` : '남은 기자'} 취재로 진기·짭기 가립시다.`
      );
    } else {
      lines.push(
        `${name}님 맞기 중 사망입니다. 2밤부터 취재로 ${survivor ? survivor.nickname : '남은 기자'} 검증합시다.`
      );
    }
  }

  if (!lines.length && roles.length) {
    lines.push(
      `${name}님이 맞직(${roles.map((r) => ROLE_KO[r] || r).join('·')}) 중 사망했습니다. 영매 성불·경찰 조사로 진짜였는지 확인합시다.`,
      `${name}님 죽었습니다. 맞직이었으면 ${aliveMedium ? '성불' : '조사'}로 직업부터 확정하는 게 낫습니다.`
    );
  }

  if (!lines.length) return null;

  // #region agent log
  agentLog({
    hypothesisId: 'Mc2',
    location: 'm42-matclaim-playbook.js:pickDeadClaimantAnalysisLine',
    message: 'dead mat claimant analysis',
    runId: 'matclaim',
    data: { bot: bot.nickname, dead: name, roles, lineCount: lines.length }
  });
  // #endregion

  return pick(lines);
}

/** 채팅 기준 직업 주장자 (사망자 포함) */
function scanAllClaimantsForRole(room, role) {
  const seen = new Set();
  const out = [];
  for (const msg of getDayChat(room)) {
    if (!msg?.text || !msg.fromId || msg.system) continue;
    const compact = String(msg.text).replace(/\s+/g, '');
    const re = ROLE_CLAIM_DETECT[role];
    const policeMsg = role === 'police'
      && (POLICE_REPORT_CHAT.test(msg.text) || policeFmt.looksLikePoliceReport(msg.text));
    if (!policeMsg && re && !re.test(compact) && !re.test(msg.text)) continue;
    if (seen.has(msg.fromId)) continue;
    seen.add(msg.fromId);
    out.push({ id: msg.fromId, nickname: msg.from || '?' });
  }
  return out;
}

/** 밤 사망자 중 맞직 주장자였던 사람 */
function findDeadMatClaimants(room, helpers, deathIds) {
  const out = [];

  for (const id of deathIds || []) {
    const roles = getPlayerClaimedRoles(room, id);
    if (!roles.length) continue;

    const matRoles = [];
    for (const role of roles) {
      if (!MAT_ROLES.includes(role)) continue;
      let claimants = scanAllClaimantsForRole(room, role);
      if (role === 'police') {
        claimants = mergeClaimants([claimants, scanAllClaimantsForRole(room, 'police')]);
        const reporters = [];
        for (const msg of getDayChat(room)) {
          if (!msg?.fromId || !msg.text) continue;
          if (POLICE_REPORT_CHAT.test(msg.text) || policeFmt.looksLikePoliceReport(msg.text)) {
            reporters.push({ id: msg.fromId, nickname: msg.from || '?' });
          }
        }
        claimants = mergeClaimants([claimants, reporters]);
      }
      if (claimants.length >= 2 && claimants.some((c) => c.id === id)) {
        matRoles.push(role);
      }
    }

    if (!matRoles.length) continue;
    const p = helpers.getPlayerById ? helpers.getPlayerById(room, id) : null;
    out.push({
      id,
      name: p?.nickname || id,
      roles,
      matRoles
    });
  }
  return out;
}

module.exports = {
  MAFIA_ONE_OF_TWO_P,
  getFirstPoliceMatgyeongClaimants,
  getFirstRoleClaimantsInOrder,
  canShowMatchedClaimBadges,
  scanMatClaimConflictsForUi,
  scanMatClaimConflicts,
  hasActiveMatConflicts,
  getPlayerClaimedRoles,
  findDeadMatClaimants,
  pickMatClaimSuspectLine,
  pickMatClaimTikiTakaLine,
  pickMatClaimReactiveLine,
  pickDeadClaimantAnalysisLine
};
