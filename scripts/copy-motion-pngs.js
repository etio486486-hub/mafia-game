const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'assets');
const motionDst = path.join(root, 'public', 'assets', 'motions');
const roleDst = path.join(root, 'public', 'assets', 'roles');

const roles = [
  'mafia', 'spy', 'madam', 'citizen', 'police', 'doctor',
  'soldier', 'politician', 'medium', 'reporter', 'graverobber', 'cult_leader',
  'cleric', 'terrorist', 'beast_man', 'cultist'
];

fs.mkdirSync(motionDst, { recursive: true });
fs.mkdirSync(roleDst, { recursive: true });

if (!fs.existsSync(srcDir)) {
  console.warn('copy-motion-pngs: no assets/ folder — skip PNG copy (use ensure-placeholder-assets for SVG)');
  process.exit(0);
}

const motionNames = fs.readdirSync(srcDir).filter((f) => f.endsWith('.png') && !roles.includes(f.replace('.png', '')));
let motionCopied = 0;
for (const name of motionNames) {
  fs.copyFileSync(path.join(srcDir, name), path.join(motionDst, name));
  motionCopied++;
}

let roleCopied = 0;
for (const role of roles) {
  const candidates = [
    path.join(srcDir, `${role}.png`),
    path.join(srcDir, 'roles', `${role}.png`),
    path.join(root, `${role}.png`)
  ];
  const src = candidates.find((p) => fs.existsSync(p));
  if (!src) continue;
  fs.copyFileSync(src, path.join(roleDst, `${role}.png`));
  roleCopied++;
}

const extraMotions = [
  'cleric_revive', 'terrorist_martyr', 'terrorist_oxidation',
  'beastman_kill', 'beastman_contact', 'cultist_succession'
];
for (const name of extraMotions) {
  const candidates = [
    path.join(srcDir, `${name}.png`),
    path.join(srcDir, 'motions', `${name}.png`),
    path.join(root, `${name}.png`)
  ];
  const src = candidates.find((p) => fs.existsSync(p));
  if (!src) continue;
  fs.copyFileSync(src, path.join(motionDst, `${name}.png`));
  motionCopied++;
}

console.log(`Copied ${motionCopied} motion PNGs, ${roleCopied} role PNGs`);
