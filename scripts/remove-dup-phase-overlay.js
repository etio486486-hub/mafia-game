const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, '..', 'public', 'index.html');
let c = fs.readFileSync(p, 'utf8');
const needle = '<motion-overlay';
const phaseNeedle = 'id="phase-transition-overlay"';
const matches = [];
let pos = 0;
while ((pos = c.indexOf(phaseNeedle, pos)) >= 0) {
  matches.push(pos);
  pos += phaseNeedle.length;
}
console.log('phase-transition-overlay count:', matches.length);
if (matches.length < 2) {
  console.log('nothing to remove');
  process.exit(0);
}
const second = matches[1];
const reporterMarker = 'id="reporter-reveal-overlay"';
const cutAt = c.indexOf(reporterMarker, second);
if (cutAt < 0) {
  console.error('reporter marker not found');
  process.exit(1);
}
const lineStart = c.lastIndexOf('\n', second) + 1;
const prevLineEnd = lineStart > 0 ? lineStart - 1 : 0;
const maybeBlank = c.slice(prevLineEnd, lineStart).trim() === '' && c[prevLineEnd - 1] === '\n';
const removeFrom = maybeBlank && prevLineEnd > 0 ? c.lastIndexOf('\n', prevLineEnd - 1) + 1 : lineStart;
c = c.slice(0, removeFrom) + c.slice(cutAt);
fs.writeFileSync(p, c);
console.log('removed duplicate block before reporter at', second);
