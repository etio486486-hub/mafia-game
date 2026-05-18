const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'assets');
const motionDst = path.join(root, 'public', 'assets', 'motions');
const roleDst = path.join(root, 'public', 'assets', 'roles');

const roles = [
  'mafia', 'spy', 'madam', 'citizen', 'police', 'doctor',
  'soldier', 'politician', 'medium', 'reporter', 'graverobber', 'cult_leader'
];

fs.mkdirSync(motionDst, { recursive: true });
fs.mkdirSync(roleDst, { recursive: true });

if (!fs.existsSync(srcDir)) {
  console.error('Missing assets folder:', srcDir);
  process.exit(1);
}

const motionNames = fs.readdirSync(srcDir).filter((f) => f.endsWith('.png') && !roles.includes(f.replace('.png', '')));
let motionCopied = 0;
for (const name of motionNames) {
  fs.copyFileSync(path.join(srcDir, name), path.join(motionDst, name));
  motionCopied++;
}

let roleCopied = 0;
for (const role of roles) {
  const src = path.join(srcDir, `${role}.png`);
  if (!fs.existsSync(src)) continue;
  fs.copyFileSync(src, path.join(roleDst, `${role}.png`));
  roleCopied++;
}

console.log(`Copied ${motionCopied} motion PNGs, ${roleCopied} role PNGs`);
