/**
 * 진경(경찰) 봇 — 시민 편, 조결·맞경·투표로 낮 채팅을 이어가는 멘트.
 * 문체: 합니다·입니다·아닙니다.
 */

const policeFmt = require('./police-report-format');

function getDayChat(room, helpers) {
  if (helpers.getChatMessages) return helpers.getChatMessages(room, 'day') || [];
  return (room.chatLog && room.chatLog.day) || [];
}

function scanReporters(room, helpers) {
  const m42Bluff = require('./m42-bluff');
  return m42Bluff.scanPoliceReporters(room, helpers);
}

function pick(lines) {
  return lines[Math.floor(Math.random() * lines.length)];
}

/** 이미 조결을 올린 뒤 반복 유도·투표·맞경 정리 */
function pickCitizenLeadAfterReport(room, bot, helpers, triggerText, last) {
  const reporters = scanReporters(room, helpers);
  const rivals = reporters.filter((r) => r.id !== bot.id);
  const report = helpers.buildPolicePublicReport
    ? helpers.buildPolicePublicReport(room, bot.id)
    : null;
  const intelLine = report && report.hasIntel && report.text ? report.text : null;

  if (rivals.length >= 2) {
    const rival = rivals[0];
    const pool = [
      `${rival.nickname}님 조결은 제 수사와 다릅니다. 저 조결을 기준으로 맞경을 가리겠습니다.`,
      `맞경이면 조결 숫자부터 맞춰 봅시다. 저는 ${bot.nickname}이고 방금 조결은 제 수사 결과입니다.`,
      `${rival.nickname}님 말고 제가 밤에 수사한 조결만 믿어 주십시오. 시민은 한 줄로 맞추는 게 낫습니다.`,
      `홀경·맞경 싸움보다 제 조결과 기자·영매 공표를 대조한 뒤 투표합시다.`
    ];
    if (intelLine && Math.random() < 0.35) {
      return `${pick(pool)} (${intelLine})`;
    }
    return pick(pool);
  }

  const askVote = [
    '조결은 올렸습니다. 이제 조결·취재·성불이 겹치는 분부터 차례로 투표하겠습니다.',
    '제 조결 기준으로 시민은 같이 지목하고, 무죄 조결은 빼고 가겠습니다.',
    '경찰 조결 나왔으니 맞경·홀경은 잠시 접고 팩트 있는 분부터 말씀해 주십시오.',
    '수사 결과는 채팅에 남겼습니다. 의심 가는 분 닉네임을 주시면 근거와 함께 정리하겠습니다.'
  ];
  if (/투표|지목|자투|몰표|처형/.test(String(triggerText || ''))) {
    return pick([
      '저는 시민 편입니다. 조결·취재 맞는 쪽으로 몰표하겠습니다.',
      '조결 나온 사람부터 투표합시다. 저는 방금 공표한 수사 결과를 유지합니다.',
      '무투보다 조결 있는 쪽이 낫습니다. 저 조결 기준으로 가겠습니다.'
    ]);
  }
  return pick(askVote);
}

/** 낮 채팅 반응 — 조결 요청·맞경·혼란 */
function pickReactiveCitizenLine(room, bot, helpers, triggerText, last) {
  const t = `${triggerText || ''} ${last && last.text ? last.text : ''}`;
  const compact = t.replace(/\s+/g, '');

  if (/경조|조결|수사|경찰조사|경찰결과/.test(compact)) {
    if (helpers.buildPolicePublicReport) {
      const report = helpers.buildPolicePublicReport(room, bot.id);
      if (report && report.hasIntel && report.text
        && !helpers.hasPoliceReportInDayChat?.(room, bot.id)) {
        return report.text;
      }
    }
    if (helpers.hasPolicePublishedReportToday?.(room, bot.id)
      || helpers.hasPoliceReportInDayChat?.(room, bot.id)) {
      return pickCitizenLeadAfterReport(room, bot, helpers, triggerText, last);
    }
    return pick([
      '조결 요청 확인했습니다. 밤에 수사한 뒤 낮에 결과를 말씀드리겠습니다.',
      '경찰입니다. 밤에 대상을 고르면 낮에 조결로 공개하겠습니다.',
      '이번 밤 수사가 끝나면 조결로 올리겠습니다. 시민은 그때까지 맞경은 잠시 보류해 주십시오.'
    ]);
  }

  if (/맞경|맞직|홀경|짭경|진경|늦경/.test(compact)) {
    const reporters = scanReporters(room, helpers);
    if (reporters.length >= 2) {
      const rival = reporters.find((r) => r.id !== bot.id);
      if (rival) {
        return pick([
          `${rival.nickname}님, 맞경이면 조결부터 맞춰 봅시다. 저는 진경이고 시민 편입니다.`,
          `맞경찰이면 수사 결과가 다른 쪽이 홀경입니다. 저 조결을 먼저 봐 주십시오.`,
          `저는 경찰입니다. ${rival.nickname}님과 조결이 다르면 제 밤 수사를 기준으로 가겠습니다.`
        ]);
      }
    }
    return pick([
      '맞경이면 조결·취재부터 맞춥시다. 저는 경찰이고 시민 편입니다.',
      '경찰은 한 명이 진짜입니다. 조결이 안 맞는 쪽부터 의심하겠습니다.'
    ]);
  }

  if (/기자|취재|영매|성불/.test(compact)) {
    return pick([
      '기자·영매 공표 나오면 제 조결과 대조하겠습니다. 시민은 팩트부터 맞춥시다.',
      '취재·성불과 조결이 맞으면 무죄, 어긋나면 다시 수사·지목하겠습니다.',
      '경찰 조결과 기자·영매 결과가 겹치는 분부터 투표하겠습니다.'
    ]);
  }

  if (/마피아|의심|수상|범인/.test(compact) && last && last.fromId !== bot.id) {
    const report = helpers.buildPolicePublicReport
      ? helpers.buildPolicePublicReport(room, bot.id)
      : null;
    if (report && report.hasIntel && report.text && Math.random() < 0.55) {
      return `${last.from}님 말씀 들었습니다. ${report.text} 이 조결 기준으로 같이 보겠습니다.`;
    }
  }

  return null;
}

/** 낮 시작 후 주기적 시민 주도 멘트 */
function pickScheduledCitizenLine(room, bot, helpers, waveIndex) {
  const report = helpers.buildPolicePublicReport
    ? helpers.buildPolicePublicReport(room, bot.id)
    : null;
  const hasIntel = !!(report && report.hasIntel && report.text);
  const substantiveInChat = helpers.hasPoliceReportInDayChat?.(room, bot.id);
  const publishedSubstantive = helpers.hasPolicePublishedReportToday?.(room, bot.id);
  const reporters = scanReporters(room, helpers);
  const matgyeong = reporters.length >= 2;

  if (!substantiveInChat && !publishedSubstantive && hasIntel) {
    return report.text;
  }

  if (!substantiveInChat && !publishedSubstantive && !hasIntel) {
    const pre = [
      '경찰입니다. 밤에 수사하면 낮에 조결로 말씀드리겠습니다. 시민은 조결 나올 때까지 맞경은 잠시만요.',
      '저는 진경입니다. 조결 요청 주시면 수사 결과를 공개하겠습니다.',
      '오늘 밤 수사 대상 정한 뒤, 낮에 조결로 시민과 같이 가겠습니다.'
    ];
    return pick(pre);
  }

  if (matgyeong) {
    const matLines = [
      '맞경이면 조결부터 맞춥시다. 저는 밤 수사 결과만 말합니다.',
      '홀경 조결은 무시하고, 제가 올린 조결과 기자·영매를 대조합시다.',
      '시민은 한 줄 조결로 몰아주는 편이 낫습니다. 저 조결 기준으로 투표하겠습니다.',
      '맞경찰 둘 중 조결이 수사와 맞는 쪽이 진경입니다. 저는 시민 편입니다.'
    ];
    if (waveIndex % 2 === 0) return pick(matLines);
  }

  const post = [
    '조결은 공개했습니다. 무죄 조결은 빼고, 마피아 조결·취재·성불 겹치는 분부터 지목합시다.',
    '제 수사 결과는 채팅에 있습니다. 근거 더 필요하면 닉네임 주시면 정리하겠습니다.',
    '경찰 조결 나온 상태입니다. 이제 투표·처형은 팩트 있는 쪽으로 가겠습니다.',
    '시민 여러분, 조결·취재 맞는 쪽으로 말씀해 주시면 같이 투표하겠습니다.',
    '맞경은 조결 숫자로 가릴 수 있습니다. 저는 진경이고 조결은 이미 올렸습니다.'
  ];
  if (substantiveInChat || publishedSubstantive) {
    return pick(post);
  }
  if (hasIntel) {
    return report.text;
  }
  return pick(post);
}

module.exports = {
  pickCitizenLeadAfterReport,
  pickReactiveCitizenLine,
  pickScheduledCitizenLine
};
