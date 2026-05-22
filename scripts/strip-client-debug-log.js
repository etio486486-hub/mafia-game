const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'public', 'app.js');
let s = fs.readFileSync(appPath, 'utf8').replace(/\r\n/g, '\n');

while (s.includes('// #region agent log')) {
  const start = s.indexOf('// #region agent log');
  const end = s.indexOf('// #endregion', start);
  if (end < 0) break;
  const after = s.indexOf('\n', end);
  s = s.slice(0, start) + s.slice(after + 1);
}

const fetchRe = /\n[ \t]*fetch\('http:\/\/127\.0\.0\.1:7270\/ingest\/[^']+',[\s\S]*?\)\.catch\(\(\) => \{\}\);/g;
s = s.replace(fetchRe, '');

fs.writeFileSync(appPath, s);
const left = (s.match(/127\.0\.0\.1:7270/g) || []).length;
console.log('removed debug fetches, remaining:', left);
