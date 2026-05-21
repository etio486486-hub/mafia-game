/**
 * 신규 4직업 + 스킬 PNG만 public/assets 로 복사
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const ROLES = ['cleric', 'terrorist', 'beast_man', 'cultist'];
const MOTIONS = [
  'cleric_revive', 'terrorist_martyr', 'terrorist_oxidation',
  'beastman_kill', 'beastman_contact', 'cultist_succession'
];

function findPng(name) {
  const tries = [
    path.join(root, 'assets', `${name}.png`),
    path.join(root, 'assets', 'roles', `${name}.png`),
    path.join(root, 'assets', 'motions', `${name}.png`),
    path.join(root, `${name}.png`)
  ];
  return tries.find((p) => fs.existsSync(p)) || null;
}

function copy(name, subdir) {
  const src = findPng(name);
  if (!src) return { name, ok: false };
  const dstDir = path.join(root, 'public', 'assets', subdir);
  fs.mkdirSync(dstDir, { recursive: true });
  const dst = path.join(dstDir, `${name}.png`);
  fs.copyFileSync(src, dst);
  const also = path.join(root, 'assets', subdir, `${name}.png`);
  fs.mkdirSync(path.dirname(also), { recursive: true });
  fs.copyFileSync(src, also);
  return { name, ok: true, src, dst };
}

const lines = [];
for (const r of ROLES) {
  const r0 = copy(r, 'roles');
  lines.push(r0.ok ? `OK role ${r}` : `MISSING role ${r}`);
}
for (const m of MOTIONS) {
  const r0 = copy(m, 'motions');
  lines.push(r0.ok ? `OK motion ${m}` : `MISSING motion ${m}`);
}
const out = lines.join('\n');
fs.writeFileSync(path.join(root, 'new-role-asset-install.txt'), out, 'utf8');
console.log(out);
