/**
 * AI 생성 PNG을 public/assets 에 복사 (assets/*.png 또는 assets/roles/*.png)
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const roles = ['cleric', 'terrorist', 'beast_man', 'cultist'];
const motions = [
  'cleric_revive',
  'terrorist_martyr',
  'terrorist_oxidation',
  'beastman_kill',
  'beastman_contact',
  'cultist_succession'
];

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function findSrc(name) {
  const candidates = [
    path.join(root, `${name}.png`),
    path.join(root, 'assets', `${name}.png`),
    path.join(root, 'assets', 'roles', `${name}.png`),
    path.join(root, 'assets', 'motions', `${name}.png`)
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function copyOne(name, dstDir) {
  const src = findSrc(name);
  if (!src) {
    console.warn(`[skip] ${name}.png not found`);
    return false;
  }
  ensureDir(dstDir);
  const dst = path.join(dstDir, `${name}.png`);
  fs.copyFileSync(src, dst);
  console.log(`[ok] ${src} -> ${dst}`);
  return true;
}

ensureDir(path.join(root, 'public', 'assets', 'roles'));
ensureDir(path.join(root, 'public', 'assets', 'motions'));
ensureDir(path.join(root, 'assets', 'roles'));
ensureDir(path.join(root, 'assets', 'motions'));

let n = 0;
for (const r of roles) {
  if (copyOne(r, path.join(root, 'public', 'assets', 'roles'))) n++;
  copyOne(r, path.join(root, 'assets', 'roles'));
}
for (const m of motions) {
  if (copyOne(m, path.join(root, 'public', 'assets', 'motions'))) n++;
  copyOne(m, path.join(root, 'assets', 'motions'));
}
console.log(`synced ${n} files to public/assets`);
