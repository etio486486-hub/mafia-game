const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'public', 'index.html');
let c = fs.readFileSync(p, 'utf8');
const needle = '      <div id="phase-transition-overlay"';
const first = c.indexOf(needle);
const second = c.indexOf(needle, first + 1);
if (second < 0) {
  console.log('no duplicate');
  process.exit(0);
}
const cutAt = c.indexOf('      <div id="reporter-reveal-overlay"', second);
if (cutAt < 0) {
  console.error('reporter marker not found');
  process.exit(1);
}
c = c.slice(0, second) + c.slice(cutAt);
fs.writeFileSync(p, c);
console.log('removed duplicate at', second);
