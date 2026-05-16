/**
 * 직업 스킬 결과·연계 대화 (마피아42 스타일, 교주 제외).
 * 문체: 합니다·입니다·아닙니다 체.
 */

const SKILL_CHAT = {
  reporter: /기자|취재|기사|홀기|공표|쓰리기/,
  doctor: /의사|힐|치료|홀의|살렸|살려|눈힐|자힐|타힐| heal/i,
  soldier: /군인|방탄|홀군|막았|확군|위군/,
  medium: /영매|성불|사망챗|사망자\s*채팅|사망채팅/,
  spy: /스파이|슾|접선|밤챗|긁슾|첫접/,
  police: /경찰|조결|수사|홀경|경크|노맢|경조|퍼경|경퍼|늦경|눈치경/,
  kill: /살해|퍼블|연퍼|사망|죽었|조용한\s*밤|조밤|물총|맢킬/,
  graverobber: /도굴|계승|도도|무직/,
  vote: /자투|무투|몰표|맢표|투갈|물타기|시무|ㅈㅌ|ㅁㅌ/,
  claim: /직공|ㅈㄱ|풍지|맞직|확직|반확|쓰리경|짭경|진경/
};

function isRevealMafia(reveal, helpers) {
  if (!reveal) return false;
  if (reveal.role && helpers.isMafiaRole) return helpers.isMafiaRole(reveal.role);
  return /마피아|스파이/.test(reveal.roleLabel || '');
}

function detectSkillTopic(text) {
  if (!text) return null;
  const compact = String(text).replace(/\s+/g, '');
  for (const [topic, re] of Object.entries(SKILL_CHAT)) {
    if (re.test(compact) || re.test(text)) return topic;
  }
  return null;
}

function pickDawnReaction(brief, bot, nightReport, helpers) {
  if (!nightReport) return null;
  const role = bot.role;
  const isMafia = brief.isMafia;
  const top = brief.topSuspect;
  const deaths = nightReport.deaths || [];
  const deathNames = deaths.map((d) => d.name).join(', ');
  const reveal = nightReport.reporterReveal;

  if (reveal && !isMafia) {
    if (role === 'reporter' && nightReport.reporterBotId === bot.id) {
      return `제가 취재한 ${reveal.targetName}님 직업은 [${reveal.roleLabel}]입니다. 팩트입니다.`;
    }
    if (isRevealMafia(reveal, helpers)) {
      if (isMafia) {
        return `${reveal.targetName}님 취재 결과는 일단 넘어가고 ${top}님부터 보겠습니다.`;
      }
      return `기자 공표를 확인했습니다. ${reveal.targetName}님 쪽이 마피아로 보입니다.`;
    }
    if (role === 'police') {
      return `기자 [${reveal.roleLabel}] 공표를 확인했습니다. ${reveal.targetName}님 조결과 대조하겠습니다.`;
    }
    return `기자 취재 ${reveal.targetName}=[${reveal.roleLabel}]부터 정리하겠습니다.`;
  }

  if (nightReport.healSave && !isMafia) {
    if (role === 'doctor' && nightReport.doctorBotId === bot.id) {
      return null;
    }
    if (role === 'mafia' || role === 'spy') {
      return '살인이 막힌 것 같습니다. 의사 또는 군인 방탄일 수 있습니다.';
    }
    return '누군가 치료한 것으로 보입니다. 조밤이 아니어서 다행입니다.';
  }

  if (nightReport.soldierBlock && !isMafia) {
    if (role === 'soldier' && nightReport.soldierBotId === bot.id) {
      return '제가 방탄으로 한 번 막았습니다. 이제 방탄은 없습니다.';
    }
    if (isMafia) {
      return '공격이 통하지 않았습니다. 군인 또는 의사를 의심하겠습니다.';
    }
    return '군인 방탄일 수 있습니다. 다음 타겟에 주의하겠습니다.';
  }

  if (deaths.length) {
    if (isMafia) {
      return deathNames
        ? `밤에 ${deathNames}님이 사망했습니다. 조결·취재부터 듣겠습니다.`
        : '밤에 사망이 있었습니다. 저는 시민입니다. 팩트부터 맞추겠습니다.';
    }
    if (role === 'medium') {
      return `${deathNames}님 사망자 채팅도 확인해 주십시오. 성불 단서가 있을 수 있습니다.`;
    }
    return deathNames
      ? `${deathNames}님 사망을 확인했습니다. 퍼블·연퍼 여부와 조결부터 보겠습니다.`
      : '밤에 사망이 있었습니다. 아침 공지·조결부터 정리하겠습니다.';
  }

  if (nightReport.quietNight) {
    if (isMafia) {
      return '조밤입니다. 경찰 조결·기자 취재부터 듣고, 팩트 있는 지목을 하겠습니다.';
    }
    if (role === 'doctor') {
      return null;
    }
    return '조밤입니다. 은폐·물총·치료 성공 중 하나일 수 있습니다.';
  }

  return null;
}

function pickSkillChatReaction(brief, bot, topic, ctx, helpers) {
  const top = brief.topSuspect;
  const speaker = ctx.speaker || '누군가';
  const isMafia = brief.isMafia;
  const reveal = brief.nightReport && brief.nightReport.reporterReveal;

  switch (topic) {
    case 'reporter':
      if (bot.role === 'reporter') {
        if ((brief.nightIndex || 0) < 2) {
          return '아직 2밤 전이라 취재는 불가합니다. 2밤부터 기사가 나옵니다.';
        }
        return '취재는 밤에 하고 아침에 공표됩니다. 저에게 문의해 주십시오.';
      }
      if (reveal && !isMafia) {
        return `기자 공표대로 ${reveal.targetName}님 [${reveal.roleLabel}]인지 확인하겠습니다.`;
      }
      return `${speaker}님, 기자 정보가 나오면 그 기준으로 가겠습니다.`;

    case 'doctor':
      if (bot.role === 'doctor') {
        return '저는 눈힐입니다. 직공은 안 하고, 경찰 조결이 나오면 그쪽 추리를 따르겠습니다.';
      }
      if (isMafia) {
        return '의사가 있으면 밤에 막힐 수 있습니다. 경찰이 드러났으면 경찰부터 노리는 편이 낫습니다.';
      }
      return '힐이 떴어도 의사라고 단정하지 않겠습니다. 경찰 조결이 있으면 그걸로 가겠습니다.';

    case 'soldier':
      if (bot.role === 'soldier') {
        return '저는 군인입니다. 방탄은 한 번 있습니다.';
      }
      return '군인 방탄이면 첫 살해를 막을 수 있습니다.';

    case 'medium':
      if (bot.role === 'medium') {
        return '저는 영매입니다. 사망자 탭·성불로 단서를 드리겠습니다.';
      }
      return `${speaker}님, 사망자 채팅도 확인해 주십시오.`;

    case 'spy':
      if (bot.role === 'spy') {
        return brief.joinedMafiaChat
          ? '접선은 끝났습니다. 밤챗은 조심하겠습니다.'
          : '아직 접선 전입니다. 조사 중입니다.';
      }
      if (isMafia) {
        return '스파이 이야기는 일단 넘어가겠습니다.';
      }
      return '스파이 조사 결과가 중요할 수 있습니다.';

    case 'police':
      if (bot.role === 'police') {
        return '조결은 제가 실제 수사한 사람만 말합니다.';
      }
      return `${speaker}님, 경찰 조결이 나오면 그 기준으로 가겠습니다.`;

    case 'kill':
      if (isMafia) {
        return `퍼블이면 분위기가 헷갈립니다. ${top}님 쪽으로 가겠습니다.`;
      }
      if (brief.quietNight) {
        return '조밤이면 치료·방탄·물총을 의심해야 합니다.';
      }
      return `밤 사망이 있었으면 ${top}님부터 수사·투표하겠습니다.`;

    case 'graverobber':
      if (bot.role === 'graverobber') {
        return '도굴꾼은 첫 밤 사망자 직업을 이어받습니다. 저도 지켜보는 중입니다.';
      }
      return '도굴 이야기는 첫 밤 이후에 의미가 있습니다.';

    case 'vote':
      if (isMafia) {
        return '자투·무투는 표를 맞춰야 합니다. 맢표 나오지 않게 하겠습니다.';
      }
      return '자투는 짝수일 때, 무투는 마피아 협조가 필요합니다. 몰표보다 조결·취재를 보겠습니다.';

    case 'claim':
      return `${speaker}님, 홀직·맞직·확직 구분해서 판단하겠습니다.`;

    default:
      return null;
  }
}

function pickSelfSkillFollowUp(brief, bot, nightReport) {
  if (!nightReport || !nightReport.botActs) return null;
  const act = nightReport.botActs[bot.id];
  if (!act) return null;

  // 경찰·의사: 대상/행동을 낮 채팅에 말하면 직업이 들킴 → 자동 멘트 없음
  if (act.type === 'police' || act.type === 'doctor') return null;

  if (act.type === 'spy') {
    return act.joinedMafia
      ? '조사로 접선했습니다. 시민인 척하며 정보를 정리 중입니다.'
      : `${act.targetName}님은 ${act.roleLabel}이었습니다.`;
  }
  if (act.type === 'reporter') {
    return `취재는 ${act.targetName}님 → [${act.roleLabel}]입니다. 아침에 공표되었을 것입니다.`;
  }
  if (act.type === 'medium') {
    return `${act.targetName}님을 성불했습니다. 직업은 ${act.roleLabel}입니다.`;
  }
  return null;
}

module.exports = {
  SKILL_CHAT,
  isRevealMafia,
  detectSkillTopic,
  pickDawnReaction,
  pickSkillChatReaction,
  pickSelfSkillFollowUp
};
