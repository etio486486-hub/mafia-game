/**
 * 경찰 조결 멘트: 시스템형 "수사 결과입니다." 템플릿 금지, 자연스러운 말투만.
 */

const FORMAL_REPORT = /수사\s*결과입니다|조사\s*결과입니다/;

/** 맞경·진경 모두 동일 한 줄 형식으로 조결 → 말싸움은 그 다음 */
const INNOCENT_LINES = [
  (n) => `${n}님 조사했는데 마피아가 아닙니다.`,
  (n) => `${n}님 조사했는데 마피아 아닙니다.`,
  (n) => `${n}님 밤 수사 결과 무죄입니다.`,
  (n) => `${n}님은 마피아가 아닙니다. 조결 공유합니다.`,
  (n) => `제 수사 기록상 ${n}님 무혐의입니다.`,
  (n) => `${n}님 쪽은 시민으로 보입니다. 마피아 아닙니다.`,
  (n) => `밤에 ${n}님 확인했는데 마피아 팀이 아닙니다.`
];

const MAFIA_LINES = [
  (n) => `${n}님 조사했는데 마피아입니다.`,
  (n) => `${n}님 조사했는데 마피아입니다.`,
  (n) => `${n}님 밤 수사 결과 마피아입니다.`,
  (n) => `${n}님은 마피아로 확인됐습니다.`,
  (n) => `제 수사 기록상 ${n}님 마피아입니다.`,
  (n) => `${n}님 쪽이 마피아입니다. 조결 올립니다.`,
  (n) => `밤에 ${n}님 확인했는데 마피아 팀입니다.`
];

function pickFrom(pool, name) {
  const fn = pool[Math.floor(Math.random() * pool.length)];
  return fn(name);
}

function formatInnocentLine(name) {
  return pickFrom(INNOCENT_LINES, name);
}

function formatMafiaLine(name) {
  return pickFrom(MAFIA_LINES, name);
}

/** 여러 명이면 한 줄씩 이어 붙임 */
function formatPoliceReportLines(entries) {
  const lines = [];
  for (const { name, isMafia } of entries) {
    if (!name) continue;
    lines.push(isMafia ? formatMafiaLine(name) : formatInnocentLine(name));
  }
  return lines.length ? lines.join(' ') : null;
}

function parseFormalSegments(text) {
  const body = String(text)
    .replace(/^수사\s*결과입니다\.?\s*/i, '')
    .replace(/^조사\s*결과입니다\.?\s*/i, '')
    .trim();
  const entries = [];
  let re = /([^\s.,]+)님\s*조사했는데\s*마피아(?:가\s*아닙니다|입니다)\.?/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    entries.push({
      name: m[1],
      isMafia: m[0].includes('입니다') && !m[0].includes('아닙')
    });
  }
  if (entries.length) return entries;

  re = /([^\s.,]+)님은\s*마피아(?:가\s*아닙니다|입니다)\.?/g;
  while ((m = re.exec(body)) !== null) {
    entries.push({
      name: m[1],
      isMafia: !m[0].includes('아닙')
    });
  }
  return entries;
}

/** 시스템형 조결 문장 → 자연스러운 말투로 치환 */
function rewriteFormalPoliceReport(text) {
  if (!text || !FORMAL_REPORT.test(text)) return text;
  const entries = parseFormalSegments(text);
  if (!entries.length) return text;
  return formatPoliceReportLines(entries);
}

function isFormalPoliceReport(text) {
  return !!(text && FORMAL_REPORT.test(text));
}

const META_ONLY_POLICE = /조결은공개|조결이미|경찰조결나온|조결나온상태|수사결과는채팅|팩트있는쪽으로가겠|이미올렸습니다|솔경|홀경[^\n]{0,48}무시[^\n]{0,48}(?:기자|영매)|기자[^\n]{0,24}영매[^\n]{0,24}대조|영매[^\n]{0,24}기자[^\n]{0,24}대조/;

/** 닉네임 + 무죄/마피아 판정이 있는 실질 조결인지 */
function hasSubstantivePoliceVerdict(text, room) {
  if (!text || !room?.players) return false;
  const raw = String(text);
  const names = extractReportedNames(raw, 8);
  if (!names.length) return false;
  const c = raw.replace(/\s+/g, '');
  if (/(?:마피아|무죄|깨끗|시민\s*쪽)/.test(c)) return true;
  for (const p of Object.values(room.players)) {
    if (!p?.nickname || !raw.includes(p.nickname)) continue;
    const n = p.nickname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`${n}님.{0,24}(?:마피아|무죄|깨끗|시민)`).test(raw)) return true;
  }
  return false;
}

/** 채팅에서 조결로 보이는지 (팩트 파싱·트리거용). room 있으면 메타 멘트 제외 */
function looksLikePoliceReport(text, room = null) {
  if (!text) return false;
  const raw = String(text);
  const c = raw.replace(/\s+/g, '');
  if (FORMAL_REPORT.test(c)) return true;
  if (room && META_ONLY_POLICE.test(c) && !hasSubstantivePoliceVerdict(raw, room)) {
    return false;
  }
  if (room && hasSubstantivePoliceVerdict(raw, room)) return true;
  if (!room) {
    if (/경찰조사결과/.test(c) && /마피아(?!아닙)/.test(c)) return true;
    if (/마피아\s*아닙|마피아입니다|무죄입니다|깨끗합니다/.test(c) && /님/.test(c)) return true;
    if (/마피아(?!아닙)/.test(c) && /(봇\d+|님)/.test(c)) return true;
    return false;
  }
  return false;
}

function extractReportedNames(text, limit = 4) {
  const names = [];
  if (!text) return names;
  const formal = parseFormalSegments(text);
  for (const e of formal) {
    if (e.name && !names.includes(e.name)) names.push(e.name);
    if (names.length >= limit) return names;
  }
  const re2 = /([^\s.,]+)님\s*조사했는데\s*마피아/g;
  let m;
  while ((m = re2.exec(text)) !== null) {
    if (m[1] && !names.includes(m[1])) names.push(m[1]);
    if (names.length >= limit) break;
  }
  const re = /([^\s.,]+)님(?:은|을|을)?\s*(?:조사|봤|확인|무죄|깨끗|시민)/g;
  while ((m = re.exec(text)) !== null) {
    if (m[1] && !names.includes(m[1])) names.push(m[1]);
    if (names.length >= limit) break;
  }
  return names;
}

module.exports = {
  FORMAL_REPORT,
  formatInnocentLine,
  formatMafiaLine,
  formatPoliceReportLines,
  rewriteFormalPoliceReport,
  isFormalPoliceReport,
  looksLikePoliceReport,
  hasSubstantivePoliceVerdict,
  extractReportedNames
};
