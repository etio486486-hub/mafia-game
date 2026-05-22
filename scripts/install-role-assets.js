/**
 * 역할·모션 PNG를 public/assets 로 설치 (여러 소스 경로 탐색)
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

const ROLES = [
  'mafia', 'spy', 'citizen', 'private_detective', 'police', 'doctor',
  'soldier', 'politician', 'medium', 'reporter', 'graverobber', 'cult_leader',
  'cleric', 'terrorist', 'beast_man', 'cultist'
];

const MOTIONS = [
  'vote_execution', 'vote_rejected', 'quiet_night', 'mafia_kill',
  'doctor_heal', 'soldier_block', 'spy_caught_by_soldier', 'police_mafia', 'police_innocent',
  'spy_contact', 'spy_investigate', 'politician_immunity',
  'reporter_scoop', 'graverobber_inherit', 'cult_proselytize', 'private_detective_search',
  'cleric_revive', 'terrorist_martyr', 'terrorist_oxidation',
  'beastman_kill', 'beastman_contact', 'cultist_succession'
];

function findRolePng(role) {
  const names = [role, role.replace(/_/g, '-')];
  for (const n of names) {
    const c = [
      path.join(root, 'assets', 'roles', `${n}.png`),
      path.join(root, 'assets', `${n}.png`),
      path.join(root, `${n}.png`)
    ];
    for (const p of c) if (fs.existsSync(p)) return p;
  }
  return null;
}

function findMotionPng(name) {
  const c = [
    path.join(root, 'assets', 'motions', `${name}.png`),
    path.join(root, 'assets', `${name}.png`),
    path.join(root, `${name}.png`)
  ];
  for (const p of c) if (fs.existsSync(p)) return p;
  return null;
}

function copyTo(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

const roleDst = path.join(root, 'public', 'assets', 'roles');
const motionDst = path.join(root, 'public', 'assets', 'motions');
fs.mkdirSync(roleDst, { recursive: true });
fs.mkdirSync(motionDst, { recursive: true });

let roleOk = 0;
const roleMiss = [];
for (const role of ROLES) {
  const src = findRolePng(role);
  if (!src) {
    roleMiss.push(role);
    continue;
  }
  copyTo(src, path.join(roleDst, `${role}.png`));
  copyTo(src, path.join(root, 'assets', 'roles', `${role}.png`));
  roleOk++;
  console.log(`[role] ${role} <- ${path.relative(root, src)}`);
}

let motionOk = 0;
const motionMiss = [];
for (const name of MOTIONS) {
  const src = findMotionPng(name);
  if (!src) {
    motionMiss.push(name);
    continue;
  }
  copyTo(src, path.join(motionDst, `${name}.png`));
  motionOk++;
  console.log(`[motion] ${name}`);
}

const report = [
  `roles: ${roleOk}/${ROLES.length} installed`,
  roleMiss.length ? `missing roles: ${roleMiss.join(', ')}` : 'all roles have PNG',
  `motions: ${motionOk}/${MOTIONS.length} installed`,
  motionMiss.length ? `missing motions: ${motionMiss.join(', ')}` : 'all motions have PNG'
];
fs.writeFileSync(path.join(root, 'asset-install-report.txt'), report.join('\n'), 'utf8');
console.log('\n' + report.join('\n'));
