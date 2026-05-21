const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const roles = [
  'mafia', 'spy', 'citizen', 'private_detective', 'police', 'doctor',
  'soldier', 'politician', 'medium', 'reporter', 'graverobber', 'cult_leader',
  'cleric', 'terrorist', 'beast_man', 'cultist'
];
const lines = [];
function exists(p) {
  return fs.existsSync(p);
}
for (const role of roles) {
  const pngPub = path.join(root, 'public', 'assets', 'roles', `${role}.png`);
  const svgPub = path.join(root, 'public', 'assets', 'roles', `${role}.svg`);
  const pngAssets = path.join(root, 'assets', 'roles', `${role}.png`);
  const pngRoot = path.join(root, `${role}.png`);
  lines.push(`${role}: pub.png=${exists(pngPub)} pub.svg=${exists(svgPub)} assets.png=${exists(pngAssets)} root.png=${exists(pngRoot)}`);
}
fs.writeFileSync(path.join(root, 'asset-audit.txt'), lines.join('\n'), 'utf8');
console.log('wrote asset-audit.txt');
