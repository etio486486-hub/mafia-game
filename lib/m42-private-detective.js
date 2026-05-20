/**
 * 사립탐정(추적 관찰) — 밤에 지정한 플레이어의 능력 지목 방향을 해석합니다.
 */

const KIND_HINTS = {
  mafia_kill: '마피아 암살 손(킬 지목)일 가능성이 가장 높습니다.',
  police: '경찰 수사 손일 가능성이 높습니다.',
  doctor: '의사 치료 손일 가능성이 높습니다.',
  reporter: '기자 취재 손일 가능성이 높습니다.',
  medium: '영매 성불 손일 가능성이 높습니다.',
  spy: '스파이 조사 손일 가능성이 높습니다.',
  cult: '교주 포교 손일 가능성이 높습니다.'
};

function formatDetectiveResultLine(summary) {
  if (!summary || !summary.watchName) return '관찰 결과를 정리하지 못했습니다.';
  const { watchName, targetName, kind } = summary;
  if (!targetName) {
    return `${watchName}님에게는 뚜렷한 밤 지목 동작이 보이지 않았습니다. 패시브 직업이거나 아직 능력을 쓰지 않았을 수 있습니다.`;
  }
  const hint = (kind && KIND_HINTS[kind]) || '경찰·의사·마피아 등 액티브 직의 지목일 수 있습니다. 추가 조사가 필요합니다.';
  return `${watchName}님이 ${targetName}님에게 손을 뻗는 듯한 움직임이 포착되었습니다. ${hint}`;
}

module.exports = {
  KIND_HINTS,
  formatDetectiveResultLine
};
