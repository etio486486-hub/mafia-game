/**
 * 마피아42 용어 사전 (나무위키 「마피아42/용어」 기반, 클래식·본 프로젝트 직업 위주).
 * 교주·듀얼 전용·미구현 직업 용어는 제외 또는 참고만 표기.
 * @see https://namu.wiki/w/%EB%A7%88%ED%94%BC%EC%95%8442/%EC%9A%A9%EC%96%B4
 */

/** @type {{ id: string, aliases: string[], meaning: string, cat: string, roles?: string[] }[]} */
const ENTRIES = [
  // ── 투표·낮 진행 ──
  { id: 'jikgong', aliases: ['직공', 'ㅈㄱ', '풍지'], meaning: '직업 공개', cat: 'vote' },
  { id: 'jogyul', aliases: ['조결', '경조', '수사결과', '조사결과', '경찰조사'], meaning: '경찰(또는 수사직)의 조사 결과 발표', cat: 'police', roles: ['police'] },
  { id: 'jatu', aliases: ['자투', 'ㅈㅌ'], meaning: '자신에게 투표해 하루 넘기기', cat: 'vote' },
  { id: 'mutu', aliases: ['무투', 'ㅁㅌ'], meaning: '아무도 처형하지 않는 투표', cat: 'vote' },
  { id: 'simu', aliases: ['시무', 'ㅅㅁ'], meaning: '시단(칼시단) 후 무투', cat: 'vote' },
  { id: 'molpyo', aliases: ['몰표', '몰투'], meaning: '한 사람에게 표가 몰림', cat: 'vote' },
  { id: 'maepyo', aliases: ['맢표'], meaning: '마피아팀이 던진 소수 표(분열 표)', cat: 'vote', roles: ['mafia', 'spy'] },
  { id: 'tugal', aliases: ['투갈', '표갈'], meaning: '최다 득표가 동점이라 처형 없음', cat: 'vote' },
  { id: 'multagi', aliases: ['물타기'], meaning: '이유 없이 앞사람 표를 따라 투표', cat: 'vote' },
  { id: 'bangmae', aliases: ['방매', 'ㅂㅁ'], meaning: '방장 보호(첫날 방장 안 죽이기·조사 자제)', cat: 'vote' },

  // ── 밤·사망 ──
  { id: 'puble', aliases: ['퍼블', '첫킬'], meaning: '첫 밤 마피아 살해(퍼스트 블러드)', cat: 'night' },
  { id: 'yeonpeo', aliases: ['연퍼', 'ㅇㅍ'], meaning: '연속 퍼블당한 플레이어(보호·조사 대상)', cat: 'night' },
  { id: 'peogyeong', aliases: ['퍼경', '경퍼'], meaning: '첫 밤 경찰이 죽음', cat: 'night', roles: ['police'] },
  { id: 'no_yeonpeo', aliases: ['노연퍼', 'ㄴㅇㅍ'], meaning: '연퍼 없음', cat: 'night' },
  { id: 'jobam', aliases: ['조밤', '조용한밤'], meaning: '밤에 아무도 죽지 않음(치료·방탄·물총·은폐 등)', cat: 'night' },
  { id: 'mulchong', aliases: ['물총'], meaning: '마피아 살해가 막힌 밤(치료·방탄 등)', cat: 'night' },
  { id: 'bamchat', aliases: ['밤챗', '밤채팅'], meaning: '밤에 마피아팀·접선 스파이만 쓰는 채팅', cat: 'night', roles: ['mafia', 'spy'] },
  { id: 'jaseong', aliases: ['자총'], meaning: '마피아가 스스로 죽음(자수)', cat: 'night', roles: ['mafia'] },

  // ── 직업 주장·확정 ──
  { id: 'hol', aliases: ['홀경', '홀의', '홀군', '홀기', '홀시', '홀탐', '홀영'], meaning: '홀+직업: 그 직업 주장자가 한 명', cat: 'claim' },
  { id: 'mat', aliases: ['맞경', '맞의', '맞군', '맞직', '맞기', '대립'], meaning: '맞+직업: 같은 직업 주장이 둘 이상', cat: 'claim' },
  { id: 'three', aliases: ['쓰리경', '쓰리의', '쓰리군'], meaning: '같은 직업 주장이 세 명', cat: 'claim' },
  { id: 'neut', aliases: ['늦경', '늦의', '늦직', '눈치경'], meaning: '늦게 나온 직공(눈치 보고 나온 의심)', cat: 'claim' },
  { id: 'jin', aliases: ['진경', '진의', '진직'], meaning: '맞직 중 진짜 그 직업', cat: 'claim' },
  { id: 'jjap', aliases: ['짭경', '짭의', '구라경', '가짜경'], meaning: '맞직 중 가짜 직업', cat: 'claim' },
  { id: 'hwak', aliases: ['확경', '확의', '확직', '확군'], meaning: '직업이 확실함(시스템·팩트)', cat: 'claim' },
  { id: 'banhwak', aliases: ['반확'], meaning: '반만 확인·시민 가능성 높음', cat: 'claim' },
  { id: 'mujik', aliases: ['무직', '백수'], meaning: '능력 없음·직공 안 함·도굴 전', cat: 'claim', roles: ['graverobber', 'citizen'] },

  // ── 팀·직업군 ──
  { id: 'sitime', aliases: ['시팀', '시민팀'], meaning: '시민 팀', cat: 'team' },
  { id: 'maeptime', aliases: ['맢팀', '마피아팀'], meaning: '마피아 팀', cat: 'team', roles: ['mafia', 'spy'] },
  { id: 'jungjik', aliases: ['중직'], meaning: '경찰·의사 등 필수 직업', cat: 'team' },
  { id: 'teukjik', aliases: ['특직', '특'], meaning: '중직 제외 시민 특수직', cat: 'team' },
  { id: 'bojo', aliases: ['보조', '보직'], meaning: '마피아팀 보조(스파이 등)', cat: 'team', roles: ['spy'] },

  // ── 마피아 ──
  { id: 'mae', aliases: ['맢', 'ㅁ', '마피'], meaning: '마피아 줄임', cat: 'mafia', roles: ['mafia'] },
  { id: 'maekill', aliases: ['맢킬', '암살'], meaning: '마피아 밤 처형', cat: 'mafia', roles: ['mafia'] },
  { id: 'jjakmae', aliases: ['짝맢', '팀맢'], meaning: '동료 마피아', cat: 'mafia', roles: ['mafia'] },
  { id: 'holmae', aliases: ['홀맢'], meaning: '동료가 다 죽고 혼자 남은 마피아', cat: 'mafia', roles: ['mafia'] },
  { id: 'jeopsun', aliases: ['접선', '첫접', 'n접'], meaning: '스파이가 마피아와 접선', cat: 'spy', roles: ['spy', 'mafia'] },

  // ── 스파이 ──
  { id: 'seupai', aliases: ['스파이', '슾', '스피'], meaning: '스파이 직업·조사직', cat: 'spy', roles: ['spy'] },
  { id: 'geupseup', aliases: ['긁슾', 'n긁슾'], meaning: '특정인을 조사한 스파이 의심', cat: 'spy' },

  // ── 경찰 ──
  { id: 'gyeong', aliases: ['경찰', '경', '홀경'], meaning: '경찰·수사', cat: 'police', roles: ['police'] },
  { id: 'gyeongkeu', aliases: ['경크', 'n맢', 'nㅁ'], meaning: '조사 결과 n픽이 마피아', cat: 'police', roles: ['police'] },
  { id: 'nomae', aliases: ['노맢', 'n노맢', 'nㄴㅁ'], meaning: '조사 결과 n픽이 마피아 아님', cat: 'police', roles: ['police'] },

  // ── 의사 ──
  { id: 'heal', aliases: ['힐', '치료', '눈힐'], meaning: '의사 치료(눈힐=직공 없이 치료)', cat: 'doctor', roles: ['doctor'] },
  { id: 'jaheal', aliases: ['자힐', 'ㅈㅎ'], meaning: '자신을 치료', cat: 'doctor', roles: ['doctor'] },
  { id: 'taheal', aliases: ['타힐', 'ㅌㅎ'], meaning: '타인을 치료', cat: 'doctor', roles: ['doctor'] },

  // ── 군인·정치인 ──
  { id: 'bangtan', aliases: ['방탄', '홀군'], meaning: '군인 1회 방어', cat: 'soldier', roles: ['soldier'] },
  { id: 'hwakgun', aliases: ['확군'], meaning: '군인 직업 확정', cat: 'soldier', roles: ['soldier'] },
  { id: 'two_vote', aliases: ['2표', '두표'], meaning: '정치인 낮 투표 2표', cat: 'politician', roles: ['politician'] },
  { id: 'myeon', aliases: ['면역', '찬반면역'], meaning: '정치인 찬반 처형 면역', cat: 'politician', roles: ['politician'] },

  // ── 기자·영매·도굴 ──
  { id: 'chwajae', aliases: ['취재', '기사', '홀기', '공표'], meaning: '기자 밤 취재·아침 공표', cat: 'reporter', roles: ['reporter'] },
  { id: 'seongbul', aliases: ['성불'], meaning: '영매가 사망자 직업 확인', cat: 'medium', roles: ['medium'] },
  { id: 'samangchat', aliases: ['사망챗', '사망자채팅', '사망채팅'], meaning: '사망자 전용 채팅', cat: 'medium', roles: ['medium'] },
  { id: 'dogul', aliases: ['도굴', '계승', '도도'], meaning: '도굴꾼 직업 계승', cat: 'graverobber', roles: ['graverobber'] },

  // ── 채팅·시간 ──
  { id: 'jamsoo', aliases: ['잠수'], meaning: '채팅·행동 안 함(투표 미참여=반대)', cat: 'chat' },
  { id: 'abong', aliases: ['아봉', '아가리봉인'], meaning: '말만 안 함(투표·능력은 함)', cat: 'chat' },
  { id: 'sidan', aliases: ['시단', '시증', '칼시단', '늦시단'], meaning: '낮 시간 단축/증가', cat: 'chat' },
  { id: 'sidanplay', aliases: ['시단플'], meaning: '근거 없이 시단(마피아 의심)', cat: 'chat' },

  // ── 픽 ──
  { id: 'pick', aliases: ['픽', '1픽', 'n픽'], meaning: '자리 번호(1~12)', cat: 'meta' }
];

const COMPACT_LLM_BLOCK = [
  '【마피아42 용어 — 채팅·투표에 자연스럽게 사용】',
  '직공·홀경/맞경/쓰리경·확직·조결·자투·무투·몰표·맢표·투갈·물타기·조밤·물총',
  '퍼블·연퍼·퍼경·밤챗·접선·맢·맢킬·짝맢·경크·노맢·힐·눈힐·자힐·타힐',
  '방탄·확군·취재·성불·사망챗·도굴·2표·면역·시단·잠수',
  '홀○=그 직업 1명 주장, 맞○=2명 이상, 진○=진짜, 짭○=가짜, 늦경=늦게 나온 경찰 주장',
  '시팀/맢팀, 중직(경찰·의사), 특직, 보조(스파이). 교주·듀얼·미구현 직업 언급 금지.'
].join('\n');

/** compact → regex (긴 별칭 우선) */
let _aliasIndex = null;

function buildAliasIndex() {
  if (_aliasIndex) return _aliasIndex;
  const rows = [];
  for (const e of ENTRIES) {
    for (const a of e.aliases) {
      rows.push({ alias: a, entry: e, len: a.length });
    }
  }
  rows.sort((a, b) => b.len - a.len);
  _aliasIndex = rows;
  return _aliasIndex;
}

function normalizeCompact(text) {
  return String(text || '').replace(/\s+/g, '').toLowerCase();
}

/**
 * 채팅에서 등장한 용어 엔트리 id 목록 (중복 제거, 등장 순)
 */
function detectGlossaryTopics(text) {
  if (!text) return [];
  const compact = normalizeCompact(text);
  const raw = String(text);
  const found = [];
  const seen = new Set();
  for (const { alias, entry } of buildAliasIndex()) {
    const hit = alias.length <= 2
      ? compact.includes(alias) || raw.includes(alias)
      : compact.includes(normalizeCompact(alias)) || raw.includes(alias);
    if (hit && !seen.has(entry.id)) {
      seen.add(entry.id);
      found.push(entry);
    }
  }
  return found;
}

function getEntriesForRole(role) {
  return ENTRIES.filter((e) => !e.roles || e.roles.includes(role));
}

function getRoleSlangHint(role) {
  const list = getEntriesForRole(role);
  if (!list.length) return '';
  const terms = list.slice(0, 12).map((e) => e.aliases[0]).join(', ');
  if (role === 'spy') {
    return `낮 공개 채팅: 무직 시민 연기. 접선·밤챗·스파이·슾·조사 중 등 비밀 용어 금지. (밤 행동은 비공개)`;
  }
  if (role === 'mafia') {
    return `낮 공개 채팅: 시민 연기. 밤챗·맢팀·접선·마피아 노출 금지. ${terms}`;
  }
  return `이 직업에서 자주 쓰는 말: ${terms}`;
}

/**
 * LLM 시스템 프롬프트용 용어 블록
 */
function buildLlmGlossaryBlock() {
  return COMPACT_LLM_BLOCK;
}

/**
 * 트리거 문장에 맞는 용어 설명 (JSON용, 5개 이하)
 */
function buildMatchedGlossaryForPrompt(text, role) {
  const topics = detectGlossaryTopics(text);
  const roleEntries = role ? getEntriesForRole(role) : [];
  const merged = [];
  const seen = new Set();
  for (const e of [...topics, ...roleEntries]) {
    if (seen.has(e.id) || merged.length >= 8) continue;
    seen.add(e.id);
    merged.push({ term: e.aliases[0], meaning: e.meaning });
  }
  return merged;
}

/**
 * 용어 키워드에 맞는 짧은 반응 (규칙 기반 봇)
 */
function pickGlossaryReaction(brief, bot, text) {
  const topics = detectGlossaryTopics(text);
  if (!topics.length) return null;
  const ids = new Set(topics.map((t) => t.id));
  const isMafia = brief.isMafia;
  const top = brief.topSuspect;

  if (ids.has('jogyul') || ids.has('gyeongkeu') || ids.has('nomae')) {
    if (bot.role === 'police') {
      return '조결은 제가 실제 수사한 사람만 말씀드리겠습니다.';
    }
    if (isMafia) {
      return '조결이 나오면 그 기준부터 따르겠습니다. 저는 시민입니다.';
    }
    return '경찰 조결이 있으면 그걸 기준으로 가겠습니다.';
  }

  if (ids.has('jatu') || ids.has('mutu') || ids.has('simu')) {
    if (isMafia && ids.has('mutu')) {
      return '무투는 마피아가 맞춰야 해서 어렵습니다. 자투 쪽을 보겠습니다.';
    }
    return '인원이 짝수면 자투, 아니면 근거 있는 지목이 낫습니다.';
  }

  if (ids.has('molpyo') || ids.has('maepyo') || ids.has('tugal')) {
    if (isMafia) {
      return '투갈·맢표 나오면 시민 손해입니다. 표만 맞추겠습니다.';
    }
    return '몰표보다 조결·취재 같은 팩트를 먼저 보겠습니다.';
  }

  if (ids.has('jobam') || ids.has('mulchong')) {
    if (isMafia) {
      return '조밤이면 치료·방탄·물총 중 하나입니다. 급하게 몰지 않겠습니다.';
    }
    if (bot.role === 'doctor') {
      return '조밤이면 여러 가능성이 있습니다. 저는 특정인을 찍지 않겠습니다.';
    }
    return '조밤입니다. 은폐·치료·물총·방탄을 염두에 두겠습니다.';
  }

  if (ids.has('heal') || ids.has('jaheal') || ids.has('taheal')) {
    if (bot.role === 'doctor') {
      return '힐 여부는 말하지 않겠습니다. 조결·취재를 따르겠습니다.';
    }
    return '힐이 떴다고 의사라고 단정하진 않겠습니다.';
  }

  if (ids.has('hol') || ids.has('mat') || ids.has('hwak')) {
    return '홀직·맞직·확직 구분해서 보겠습니다. 확직이 없으면 성급히 몰표하지 않겠습니다.';
  }

  if (ids.has('bamchat') || ids.has('jeopsun')) {
    if (bot.role === 'spy' || isMafia) {
      return '저는 시민입니다. 공개 채팅에서는 조결·취재·투표 팩트만 말하겠습니다.';
    }
    return '밤 전용 채팅·접선 이야기는 여기서 단정하지 않겠습니다. 조결부터 보겠습니다.';
  }
  if (ids.has('seupai') || ids.has('geupseup')) {
    if (bot.role === 'spy') {
      return '저는 시민입니다. 특수직·스파이 언급은 하지 않겠습니다.';
    }
    return '스파이 여부는 추리로만 말하겠습니다. 저는 무직 시민입니다.';
  }

  if (ids.has('chwajae')) {
    if (bot.role === 'reporter') {
      return '취재는 밤에 하고 아침에 공표됩니다.';
    }
    return '기자 취재가 나오면 그 정보를 기준으로 하겠습니다.';
  }

  if (ids.has('puble') || ids.has('yeonpeo') || ids.has('peogyeong')) {
    if (bot.role === 'police') {
      return '연퍼·퍼경이면 수사 우선순위를 조정하겠습니다.';
    }
    return `${top}님 쪽부터 말씀해 주십시오. 퍼블·연퍼 여부도 중요합니다.`;
  }

  return null;
}

module.exports = {
  ENTRIES,
  COMPACT_LLM_BLOCK,
  detectGlossaryTopics,
  getEntriesForRole,
  getRoleSlangHint,
  buildLlmGlossaryBlock,
  buildMatchedGlossaryForPrompt,
  pickGlossaryReaction
};
