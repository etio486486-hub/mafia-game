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
  private_detective: /사립탐정|사탐|관찰|손방향|손짓|추적/,
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
  const medReveal = nightReport.mediumPurify;
  const pd = nightReport.privateDetective;

  if (pd) {
    const isPdTargetDead = !!(
      pd.targetName
      && deaths.some((d) => d && d.name === pd.targetName)
    );
    if (isPdTargetDead && pd.watchName && pd.targetName && !isMafia) {
      return `사탐 관찰상 ${pd.watchName}→${pd.targetName}였고 ${pd.targetName}님이 밤에 사망했습니다. ${pd.watchName}님이 마피아일 가능성이 높아 보여 오늘 투표를 ${pd.watchName}님 쪽으로 모읍시다.`;
    }
    if (role === 'private_detective') {
      if (pd.targetName && pd.watchName) {
        if (isPdTargetDead) {
          return `밤 관찰 결과 ${pd.watchName}→${pd.targetName}였고 ${pd.targetName}님이 사망했습니다. 저는 ${pd.watchName}님을 우선 마피아 의심으로 두고 투표를 제안합니다.`;
        }
        return `밤 관찰: ${pd.watchName}님이 ${pd.targetName}님께 손을 뻗는 듯 보였습니다. 낮에 두 분 반응을 듣고 조결·취재와 맞춰 보겠습니다.`;
      }
      return `${pd.watchName || '지정한 분'}님은 뚜렷한 밤 지목이 없었습니다. 패시브 직업일 수 있습니다.`;
    }
    if (role === 'police' && pd.targetName && pd.watchName && Math.random() < 0.48) {
      return `사립탐정 관찰이 ${pd.watchName}→${pd.targetName} 방향이라면, 제 조결과 대조해 보겠습니다.`;
    }
    if (isMafia && pd.targetName && pd.watchName && Math.random() < 0.38) {
      return `${pd.watchName}님이 ${pd.targetName}님께 손을 댔다는 소리가 있습니다. 물타기 전에 확인하겠습니다.`;
    }
  }

  if (medReveal) {
    if (role === 'medium' && medReveal.mediumId === bot.id) {
      return `${medReveal.targetName}님 성불 결과 [${medReveal.roleLabel}]입니다. 낮에 공유하겠습니다.`;
    }
    if (isMafia) {
      return `${medReveal.targetName}님 [${medReveal.roleLabel}] 성불 공표는 확인했습니다. 조결·취재와 대조하겠습니다.`;
    }
    if (role === 'police') {
      return `영매 성불 [${medReveal.roleLabel}] 확인했습니다. ${medReveal.targetName}님 조결과 맞는지 보겠습니다.`;
    }
    return `영매 성불 ${medReveal.targetName}=[${medReveal.roleLabel}]입니다. 투표 근거로 정리하겠습니다.`;
  }

  if (reveal) {
    if (role === 'reporter' && nightReport.reporterBotId === bot.id) {
      return `제가 취재한 ${reveal.targetName}님 직업은 [${reveal.roleLabel}]입니다. 아침 공표 그대로입니다.`;
    }
    if (isMafia) {
      const mafiaLines = [
        `${reveal.targetName}님 기자 [${reveal.roleLabel}] 공표는 확인했습니다. 조결·맞경과 엇갈리면 다시 보겠습니다.`,
        `기자 취재 ${reveal.targetName}=[${reveal.roleLabel}]입니다. 저는 시민이고 조결부터 맞추겠습니다.`,
        `아침 기자 공표는 봤습니다. ${top}님 쪽도 조결·취재와 대조하겠습니다.`
      ];
      return mafiaLines[Math.floor(Math.random() * mafiaLines.length)];
    }
    if (isRevealMafia(reveal, helpers)) {
      return `기자 공표 확인했습니다. ${reveal.targetName}님 [${reveal.roleLabel}] — 마피아 쪽으로 보입니다.`;
    }
    if (role === 'police') {
      return `기자 [${reveal.roleLabel}] 공표를 확인했습니다. ${reveal.targetName}님 제 조결과 대조하겠습니다.`;
    }
    return `기자 취재 ${reveal.targetName}=[${reveal.roleLabel}]부터 정리하겠습니다. 맞경이면 취재·조결을 맞춰 봅시다.`;
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
          return '아직 2밤 전이라 취재는 불가합니다. 2밤부터 아침에 직업이 공표됩니다.';
        }
        if (reveal) {
          return `제가 취재한 ${reveal.targetName}님은 [${reveal.roleLabel}]입니다. 맞경·조결과 대조해 주십시오.`;
        }
        return '취재는 밤에 하고 아침에 전원 공표됩니다. 맞경이면 취재 대상을 말씀해 주십시오.';
      }
      if (reveal && !isMafia) {
        if (isRevealMafia(reveal, helpers)) {
          return `기자 공표 ${reveal.targetName}=[${reveal.roleLabel}] 확인했습니다. 투표·지목 근거로 쓰겠습니다.`;
        }
        return `기자 취재 ${reveal.targetName}=[${reveal.roleLabel}]입니다. 경찰 조결과 맞는지 대조하겠습니다.`;
      }
      if (isMafia) {
        return `${speaker}님, 기자 취재는 2밤부터입니다. 그 전에는 조결·맞경부터 보겠습니다.`;
      }
      return `${speaker}님, 2밤부터 기자 취재가 나옵니다. 맞경이면 취재로 직업 확인하는 편이 낫습니다.`;

    case 'doctor':
      if (bot.role === 'doctor') {
        return '의사는 특수직이라 직공하지 않습니다. 눈힐로 가고 경찰 조결이 나오면 그쪽 추리를 따르겠습니다.';
      }
      if (isMafia) {
        const mafiaDoctorLines = [
          '의사는 특수직이라 밤에 막힐 수 있습니다. 경찰이 드러났으면 경찰부터 노리는 편이 낫습니다.',
          '저는 일반 시민입니다. 특수직 직공은 못 하고 조결부터 보겠습니다.',
          '의사가 있으면 밤에 살릴 수 있습니다. 저는 무직 시민입니다.'
        ];
        return mafiaDoctorLines[Math.floor(Math.random() * mafiaDoctorLines.length)];
      }
      return '의사는 특수직입니다. 힐이 떴어도 의사라고 단정하지 않겠습니다. 경찰 조결이 있으면 그걸로 가겠습니다.';

    case 'soldier':
      if (bot.role === 'soldier') {
        return '저는 군인입니다. 방탄은 한 번 있습니다.';
      }
      return '군인 방탄이면 첫 살해를 막을 수 있습니다.';

    case 'medium': {
      const medReveal = brief.nightReport && brief.nightReport.mediumPurify;
      if (bot.role === 'medium') {
        if (medReveal) {
          return `제가 ${medReveal.targetName}님을 성불했습니다. 직업은 [${medReveal.roleLabel}]입니다.`;
        }
        return '저는 영매입니다. 사망자 탭·밤 성불로 단서를 드리겠습니다. 성불 요청 주시면 밤에 처리합니다.';
      }
      if (medReveal && !isMafia) {
        return `영매 성불 ${medReveal.targetName}=[${medReveal.roleLabel}] 확인했습니다.`;
      }
      return `${speaker}님, 사망자 채팅·영매 성불 결과를 함께 보겠습니다.`;
    }

    case 'spy':
      if (bot.role === 'spy') {
        return '저는 시민입니다. 스파이·접선 이야기는 팩트 확인 후에나 말하겠습니다.';
      }
      if (isMafia) {
        return '스파이 이야기는 일단 넘어가겠습니다. 조결·취재부터 보겠습니다.';
      }
      return '조사·취재 결과가 나오면 그걸 기준으로 가겠습니다.';

    case 'police':
      if (bot.role === 'police') {
        const policeLines = [
          '저는 경찰입니다. 조결은 "○○님 조사했는데 마피아가 아닙니다" 또는 "…마피아입니다" 한 줄로만 말합니다.',
          '맞경이면 같은 조결 형식으로 맞춘 뒤 말로 대립합시다. 기자·영매 이야기는 그 다음입니다.',
          '경찰은 시민 편입니다. 맞경일 때 시민은 경찰 중 한쪽에 표를 모읍시다.',
          '저는 진경입니다. 상대 경찰과 조결이 다르면 문장부터 맞춰 봅시다.',
          '맞경·맞의·맞군·맞영이면 한쪽은 짭일 확률이 큽니다. 경찰 맞경은 조결부터 맞춥시다.'
        ];
        return policeLines[Math.floor(Math.random() * policeLines.length)];
      }
      return `${speaker}님, 맞직이면 조사·성불·취재로 확인합시다. 경찰 조결이 나오면 그 기준으로 가겠습니다.`;

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

  if (act.type === 'private_detective') {
    if (act.pointedName) {
      return `${act.targetName}님이 ${act.pointedName}님 쪽으로 손을 뻗는 듯 보였습니다. 낮에 교차 확인하겠습니다.`;
    }
    return `${act.targetName}님은 밤에 뚜렷한 타겟 지목이 없었습니다.`;
  }

  // 스파이·영매·경찰·의사: 밤 비밀 조사/성불 결과를 낮에 직업 단정으로 말하면 메타·직공 노출
  if (act.type === 'spy' || act.type === 'medium') return null;
  if (act.type === 'reporter') {
    return `기자 공표가 나왔다면 그걸 기준으로 조결·추리하겠습니다.`;
  }
  return null;
}

function pickReporterRevealDayLine(brief, bot, reveal, helpers) {
  if (!reveal) return null;
  const role = bot.role;
  const isMafia = brief.isMafia;
  const top = brief.topSuspect;

  if (role === 'reporter') {
    return `오늘 아침 공표: ${reveal.targetName}님 [${reveal.roleLabel}]. 추가 취재는 없습니다.`;
  }
  if (role === 'police') {
    return `기자 [${reveal.roleLabel}]와 제 수사 결과를 ${reveal.targetName}님 기준으로 대조하겠습니다.`;
  }
  if (isMafia) {
    const lines = [
      `기자 ${reveal.targetName}=[${reveal.roleLabel}] 공표는 확인했습니다. 맞경·조결도 같이 봅시다.`,
      `${reveal.targetName}님 취재 [${reveal.roleLabel}]입니다. 저는 시민이고 ${top}님도 조결 기준으로 보겠습니다.`
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }
  if (isRevealMafia(reveal, helpers)) {
    return `기자 공표대로 ${reveal.targetName}님이 [${reveal.roleLabel}]입니다. 투표 근거로 삼겠습니다.`;
  }
  return `기자 취재 ${reveal.targetName}=[${reveal.roleLabel}]입니다. 경찰 조결과 일치하는지 확인하겠습니다.`;
}

module.exports = {
  SKILL_CHAT,
  isRevealMafia,
  detectSkillTopic,
  pickDawnReaction,
  pickSkillChatReaction,
  pickSelfSkillFollowUp,
  pickReporterRevealDayLine
};
