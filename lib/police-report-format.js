/**
 * 경찰 조결 멘트: 시스템형 "수사 결과입니다." 템플릿 금지, 자연스러운 말투만.
 */

const FORMAL_REPORT = /수사\s*결과입니다|조사\s*결과입니다/;

const INNOCENT_LINES = [
  (n) => `${n}님 조사했는데 마피아 아닙니다.`,
  (n) => `${n}님은 시민 쪽으로 나왔습니다.`,
  (n) => `제가 본 ${n}님은 마피아 아닙니다.`,
  (n) => `${n}님 무죄입니다.`,
  (n) => `${n}님 제 조사로는 마피아가 아니라서, 우선 다른 분부터 보겠습니다.`,
  (n) => `${n}님 깨끗합니다. 다른 분부터 보죠.`
];

const MAFIA_LINES = [
  (n) => `${n}님 마피아입니다.`,
  (n) => `제 조사로 ${n}님 마피아 나왔습니다.`,
  (n) => `${n}님은 마피아팀으로 확인됐습니다.`
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
  const re = /([^\s.,]+)님은\s*마피아(?:가\s*아닙니다|입니다)\.?/g;
  let m;
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

/** 채팅에서 조결로 보이는지 (팩트 파싱·트리거용) */
function looksLikePoliceReport(text) {
  if (!text) return false;
  const c = String(text).replace(/\s+/g, '');
  if (FORMAL_REPORT.test(c)) return true;
  if (/경찰\s*조사|경찰\s*조결|경찰조사결과|조사했는데|조사로|제조사|제\s*조사/.test(c)) return true;
  if (/마피아\s*아닙|마피아입니다|무죄입니다|깨끗합니다/.test(c) && /님/.test(c)) return true;
  if (/경찰조사결과/.test(c) && /마피아(?!아닙)/.test(c)) return true;
  if (/마피아(?!아닙)/.test(c) && /(봇\d+|님)/.test(c)) return true;
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
  const re = /([^\s.,]+)님(?:은|을|을)?\s*(?:조사|봤|확인|무죄|깨끗|시민)/g;
  let m;
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
  extractReportedNames
};
