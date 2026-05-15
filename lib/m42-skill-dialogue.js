/**
 * 직업 스킬 결과·연계 대화 (마피아42 스타일, 교주 제외).
 */

const SKILL_CHAT = {
  reporter: /기자|취재|기사|홀기|공표/,
  doctor: /의사|힐|치료|홀의|살렸|살려| heal/i,
  soldier: /군인|방탄|홀군|막았/,
  medium: /영매|성불|사망챗|사망자\s*채팅/,
  spy: /스파이|접선|밤챗/,
  police: /경찰|조결|수사|홀경/,
  kill: /살해|퍼블|사망|죽었|조용한\s*밤|조밤/,
  graverobber: /도굴|계승/
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
      return `제가 취재한 ${reveal.targetName}님 직업은 [${reveal.roleLabel}]입니다. 팩트예요.`;
    }
    if (isRevealMafia(reveal, helpers)) {
      if (isMafia) {
        return `${reveal.targetName}님 취재 결과는 일단 넘어가고 ${top}님부터 봅시다.`;
      }
      return `기자 공표 보셨죠? ${reveal.targetName}님 쪽이 마피아 느낌이에요.`;
    }
    if (role === 'police') {
      return `기자 [${reveal.roleLabel}] 공표 확인. ${reveal.targetName}님 조결과 맞는지 봐야 해요.`;
    }
    return `기자 취재 ${reveal.targetName}=[${reveal.roleLabel}]부터 정리합시다.`;
  }

  if (nightReport.healSave && !isMafia) {
    if (role === 'doctor' && nightReport.doctorBotId === bot.id) {
      return '밤에 치료는 했습니다. 누굴 살렸는지는 말 안 할게요.';
    }
    if (role === 'mafia' || role === 'spy') {
      return '살인이 막힌 것 같아요. 의사가 있었거나 방탄일 수 있어요.';
    }
    return '누군가 치료했을 수 있어요. 조밤이 아니라 다행이네요.';
  }

  if (nightReport.soldierBlock && !isMafia) {
    if (role === 'soldier' && nightReport.soldierBotId === bot.id) {
      return '제가 방탄으로 한 번 막았습니다. 이제 없어요.';
    }
    if (isMafia) {
      return '공격이 안 통했네요. 군인이나 의사 쪽 의심해볼게요.';
    }
    return '군인 방탄일 수도 있어요. 마피아 다음 타겟 조심해야 해요.';
  }

  if (deaths.length) {
    if (isMafia) {
      return deathNames
        ? `밤에 ${deathNames}님 사망… 일단 분위기 잡고 ${top}님 쪽으로 가볼까요.`
        : `밤 사망 있었네요. 저는 시민이니까 같이 찾아봅시다.`;
    }
    if (role === 'medium') {
      return `${deathNames}님 사망자 채팅도 확인해 보세요. 성불 단서 있을 수 있어요.`;
    }
    return `${deathNames}님 사망 확인. ${top}님부터 질문합시다.`;
  }

  if (nightReport.quietNight) {
    if (isMafia) {
      return `조밤이네요. ${top}님 행적이 더 수상합니다.`;
    }
    if (role === 'doctor') {
      return '조용한 밤이에요. 치료할 일이 없었거나, 이미 막힌 밤일 수 있어요.';
    }
    return '조밤입니다. 은폐·물총·치료 성공 중 하나일 수 있어요.';
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
          return '아직 2밤 전이라 취재 못 해요. 2밤부터 기사 나옵니다.';
        }
        return '취재는 밤에 하고 아침에 공표돼요. 저한테 물어보세요.';
      }
      if (reveal && !isMafia) {
        return `기자 공표대로 ${reveal.targetName}님 [${reveal.roleLabel}] 맞는지 봐야죠.`;
      }
      return `${speaker}님, 기자 나오면 그 정보 기준으로 가죠.`;

    case 'doctor':
      if (bot.role === 'doctor') {
        return '저 의사인데 누굴 살렸는지는 밤마다 다릅니다. 직공만 믿어주세요.';
      }
      if (isMafia) {
        return '의사 있으면 밤에 막힐 수 있어요. 다른 각 잡읍시다.';
      }
      return '힐 떴으면 의사일 수 있어요. 조밤이면 치료 성공일 수도요.';

    case 'soldier':
      if (bot.role === 'soldier') {
        return '저 군인이에요. 방탄 한 번 있습니다.';
      }
      return '군인 방탄이면 첫 살해를 막을 수 있어요.`;

    case 'medium':
      if (bot.role === 'medium') {
        return '영매입니다. 사망자 탭·성불로 단서 드릴게요.';
      }
      return `${speaker}님, 사망자 채팅도 챙겨 보세요.`;

    case 'spy':
      if (bot.role === 'spy') {
        return brief.joinedMafiaChat
          ? '접선 끝났어요. 밤챗은 조심히 씁시다.'
          : '아직 접선 전이에요. 조사 중입니다.';
      }
      if (isMafia) {
        return '스파이 이야기는 일단 넘어가요.';
      }
      return '스파이 조사 결과가 중요할 수 있어요.';

    case 'police':
      if (bot.role === 'police') {
        return '조결은 제가 실제 수사한 사람만 말합니다.';
      }
      return `${speaker}님, 경찰 조결 나오면 그걸로 가죠.`;

    case 'kill':
      if (isMafia) {
        return `퍼블이면 분위기가 헷갈리죠. ${top}님 쪽으로 가봅시다.`;
      }
      if (brief.quietNight) {
        return '조밤이면 치료·방탄·물총 의심해봐야 해요.';
      }
      return `밤 사망 있었으면 ${top}님부터 수사·투표합시다.`;

    case 'graverobber':
      if (bot.role === 'graverobber') {
        return '도굴꾼은 첫 밤 사망자 직업을 이어받아요. 저도 지켜보는 중이에요.';
      }
      return '도굴 이야기는 첫 밤 이후에 의미 있어요.';

    default:
      return null;
  }
}

function pickSelfSkillFollowUp(brief, bot, nightReport) {
  if (!nightReport || !nightReport.botActs) return null;
  const act = nightReport.botActs[bot.id];
  if (!act) return null;

  if (act.type === 'police' && act.isMafia === false) {
    return `밤에 ${act.targetName}님 수사했어요. 조결 요청하시면 말씀드릴게요.`;
  }
  if (act.type === 'police' && act.isMafia === true) {
    return `수사 기록은 제게만 있어요. 공개는 신중히 할게요.`;
  }
  if (act.type === 'spy') {
    return act.joinedMafia
      ? `조사로 접선했습니다. 시민인 척하며 정보 정리 중이에요.`
      : `${act.targetName}님은 ${act.roleLabel}이었어요.`;
  }
  if (act.type === 'reporter') {
    return `취재는 ${act.targetName}님 → [${act.roleLabel}]입니다. 아침에 공표됐을 거예요.`;
  }
  if (act.type === 'doctor') {
    return `밤에 ${act.targetName}님 치료했습니다. 누군지는 비밀이에요.`;
  }
  if (act.type === 'medium') {
    return `${act.targetName}님 성불했어요. 직업은 ${act.roleLabel}입니다.`;
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
