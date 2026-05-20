/**
 * PNG 원본이 없을 때 역할·모션·UI용 SVG 플레이스홀더 생성 (404 방지).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

const ROLES = [
  { id: 'mafia', label: '마피아', color: '#8b1a1a' },
  { id: 'spy', label: '스파이', color: '#5c2d6e' },
  { id: 'citizen', label: '시민', color: '#3a5a7a' },
  { id: 'private_detective', label: '사립탐정', color: '#4a3820' },
  { id: 'police', label: '경찰', color: '#1e4a8c' },
  { id: 'doctor', label: '의사', color: '#1a6b4a' },
  { id: 'soldier', label: '군인', color: '#4a5568' },
  { id: 'politician', label: '정치인', color: '#7a5c1e' },
  { id: 'medium', label: '영매', color: '#4a3a6e' },
  { id: 'reporter', label: '기자', color: '#2d6b7a' },
  { id: 'graverobber', label: '도굴꾼', color: '#3d3d2a' },
  { id: 'cult_leader', label: '교주', color: '#4a2c6e' }
];

const MOTIONS = [
  { file: 'vote_execution', label: '처형' },
  { file: 'vote_rejected', label: '부결' },
  { file: 'quiet_night', label: '조용한 밤' },
  { file: 'mafia_kill', label: '살해' },
  { file: 'doctor_heal', label: '치료' },
  { file: 'soldier_block', label: '방탄' },
  { file: 'police_mafia', label: '마피아 조사' },
  { file: 'police_innocent', label: '무죄 조사' },
  { file: 'spy_contact', label: '스파이 접선' },
  { file: 'spy_investigate', label: '스파이 조사' },
  { file: 'politician_immunity', label: '면역' },
  { file: 'reporter_scoop', label: '취재' },
  { file: 'graverobber_inherit', label: '계승' },
  { file: 'private_detective_search', label: '사탐 관찰' }
];

function roleSvg(role) {
  const c = role.color;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 520" width="400" height="520">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${c}" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#0a0c10"/>
    </linearGradient>
  </defs>
  <rect width="400" height="520" fill="url(#g)"/>
  <ellipse cx="200" cy="200" rx="70" ry="85" fill="rgba(255,255,255,0.12)"/>
  <text x="200" y="400" text-anchor="middle" fill="#f0e6d0" font-size="42" font-family="serif" font-weight="bold">${role.label}</text>
</svg>`;
}

function motionSvg(m) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400" width="640" height="400">
  <rect width="640" height="400" fill="#120a18"/>
  <circle cx="320" cy="160" r="80" fill="rgba(201,162,74,0.2)"/>
  <text x="320" y="280" text-anchor="middle" fill="#e8d48a" font-size="36" font-family="serif">${m.label}</text>
</svg>`;
}

function uiSvg(title, kind) {
  const top = kind === 'night' ? '#0f1428' : '#2a2418';
  const accent = kind === 'night' ? '#6b8cce' : '#c9a227';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
  <rect width="800" height="450" fill="${top}"/>
  <text x="400" y="230" text-anchor="middle" fill="${accent}" font-size="48" font-family="serif">${title}</text>
</svg>`;
}

function writeIfMissing(filePath, content) {
  if (fs.existsSync(filePath)) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return true;
}

let written = 0;

for (const role of ROLES) {
  const svg = roleSvg(role);
  for (const rel of [
    `public/assets/roles/${role.id}.svg`,
    `assets/roles/${role.id}.svg`
  ]) {
    if (writeIfMissing(path.join(root, rel), svg)) written++;
  }
}

for (const m of MOTIONS) {
  const svg = motionSvg(m);
  const rel = `public/assets/motions/${m.file}.svg`;
  if (writeIfMissing(path.join(root, rel), svg)) written++;
}

const uiDir = path.join(root, 'public', 'assets', 'ui');
fs.mkdirSync(uiDir, { recursive: true });

for (let i = 1; i <= 5; i++) {
  if (writeIfMissing(path.join(uiDir, `night_fall_${i}.svg`), uiSvg(`${i}번째 밤`, 'night'))) written++;
  if (writeIfMissing(path.join(uiDir, `day_dawn_${i}.svg`), uiSvg('아침', 'day'))) written++;
}
if (writeIfMissing(path.join(uiDir, 'night_fall.svg'), uiSvg('밤', 'night'))) written++;
if (writeIfMissing(path.join(uiDir, 'day_dawn.svg'), uiSvg('낮', 'day'))) written++;
if (writeIfMissing(path.join(uiDir, 'vote_time.svg'), uiSvg('투표', 'day'))) written++;
if (writeIfMissing(path.join(uiDir, 'bg_night.svg'), uiSvg('밤', 'night'))) written++;
if (writeIfMissing(path.join(uiDir, 'bg_day.svg'), uiSvg('낮', 'day'))) written++;

console.log(`ensure-placeholder-assets: wrote ${written} missing SVG placeholders`);
