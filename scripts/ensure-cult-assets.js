/**
 * 교주 직업·포교 모션 일러스트 (SVG) 생성 및 public/assets 복사
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

const CULT_LEADER_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 520" width="400" height="520">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1a1028"/>
      <stop offset="100%" stop-color="#0d0814"/>
    </linearGradient>
    <linearGradient id="robe" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#4a2c6e"/>
      <stop offset="100%" stop-color="#2d1848"/>
    </linearGradient>
    <radialGradient id="halo" cx="50%" cy="28%" r="45%">
      <stop offset="0%" stop-color="#c9a227" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#c9a227" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="400" height="520" fill="url(#bg)"/>
  <ellipse cx="200" cy="140" rx="120" ry="90" fill="url(#halo)"/>
  <ellipse cx="200" cy="95" rx="52" ry="58" fill="#3d2858"/>
  <path d="M148 95 Q200 40 252 95 L240 130 Q200 110 160 130 Z" fill="#2a1a3d"/>
  <rect x="118" y="155" width="164" height="220" rx="28" fill="url(#robe)"/>
  <path d="M90 175 L118 165 L118 340 L75 355 Z" fill="#3a2458"/>
  <path d="M310 175 L282 165 L282 340 L325 355 Z" fill="#3a2458"/>
  <circle cx="175" cy="210" r="8" fill="#e8d48a"/>
  <circle cx="225" cy="210" r="8" fill="#e8d48a"/>
  <path d="M185 248 Q200 262 215 248" stroke="#c9a227" stroke-width="3" fill="none"/>
  <text x="200" y="420" text-anchor="middle" fill="#c9a227" font-size="36" font-family="serif" font-weight="bold">교주</text>
  <text x="200" y="458" text-anchor="middle" fill="#9a8ab0" font-size="18" font-family="sans-serif">Cult Leader</text>
</svg>`;

const CULT_PROSELYTIZE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400" width="640" height="400">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#120a1e"/>
      <stop offset="60%" stop-color="#1f1230"/>
      <stop offset="100%" stop-color="#0a0610"/>
    </linearGradient>
    <radialGradient id="moon" cx="50%" cy="35%" r="30%">
      <stop offset="0%" stop-color="#f0e6c8"/>
      <stop offset="70%" stop-color="#c9a227" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#c9a227" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="640" height="400" fill="url(#sky)"/>
  <circle cx="320" cy="120" r="70" fill="url(#moon)"/>
  <circle cx="320" cy="120" r="42" fill="#e8dcc0" opacity="0.9"/>
  <path d="M200 320 Q320 180 440 320" stroke="#c9a227" stroke-width="4" fill="none" opacity="0.35"/>
  <ellipse cx="320" cy="280" rx="90" ry="18" fill="#c9a227" opacity="0.25"/>
  <path d="M270 200 L320 120 L370 200 L350 210 L320 145 L290 210 Z" fill="#8b6914" stroke="#e8d48a" stroke-width="2"/>
  <circle cx="320" cy="268" r="28" fill="none" stroke="#c9a227" stroke-width="3"/>
  <circle cx="320" cy="268" r="18" fill="none" stroke="#e8d48a" stroke-width="2"/>
  <text x="320" y="350" text-anchor="middle" fill="#e8d48a" font-size="32" font-family="serif" font-weight="bold">종소리</text>
  <text x="320" y="382" text-anchor="middle" fill="#b8a0d0" font-size="16" font-family="sans-serif">교주의 포교</text>
</svg>`;

const targets = [
  { rel: 'assets/roles/cult_leader.svg', content: CULT_LEADER_SVG },
  { rel: 'assets/motions/cult_proselytize.svg', content: CULT_PROSELYTIZE_SVG },
  { rel: 'public/assets/roles/cult_leader.svg', content: CULT_LEADER_SVG },
  { rel: 'public/assets/motions/cult_proselytize.svg', content: CULT_PROSELYTIZE_SVG }
];

let written = 0;
for (const t of targets) {
  const full = path.join(root, t.rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, t.content, 'utf8');
  written++;
}

console.log(`ensure-cult-assets: wrote ${written} SVG files (cult_leader, cult_proselytize)`);
