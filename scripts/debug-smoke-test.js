const fs = require('fs');
const path = require('path');
const voteFacts = require('../lib/bot-vote-facts');
const policeFmt = require('../lib/police-report-format');
const { agentLog, LOG_PATH } = require('../lib/debug-agent-log');

const room = {
  players: {
    p1: { id: 'p1', nickname: '나', role: 'police', alive: true },
    p2: { id: 'p2', nickname: '봇2', role: 'mafia', alive: true },
    p7: { id: 'p7', nickname: '봇7', role: 'citizen', alive: true, isBot: true }
  }
};

const out = [];
for (const t of ['봇2 마피아', '경찰조사결과 봇2 마피아', '봇2 마피아입니다']) {
  const parsed = voteFacts.parsePoliceReportFromText(room, t);
  out.push({
    t,
    providing: voteFacts.isPoliceReportProviding(t, room),
    looks: policeFmt.looksLikePoliceReport(t),
    mafia: parsed.mafia.map((p) => p.nickname)
  });
}

agentLog({ hypothesisId: 'smoke', location: 'debug-smoke-test', message: 'smoke run', data: { out } });

const result = { out, logPath: LOG_PATH, logExists: fs.existsSync(LOG_PATH) };
fs.writeFileSync(path.join(__dirname, 'debug-smoke-result.json'), JSON.stringify(result, null, 2));
