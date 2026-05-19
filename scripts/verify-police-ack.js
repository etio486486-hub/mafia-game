/**
 * Runtime verification for police report ack flow — writes debug-a38a8e.log
 */
const fs = require('fs');
const path = require('path');
const voteFacts = require('../lib/bot-vote-facts');
const policeFmt = require('../lib/police-report-format');
const botBrain = require('../lib/bot-brain');

const LOG_OUT = path.join(__dirname, '..', 'debug-a38a8e.log');

function log(entry) {
  const line = `${JSON.stringify({ sessionId: 'a38a8e', timestamp: Date.now(), runId: 'verify', ...entry })}\n`;
  fs.appendFileSync(LOG_OUT, line);
}

const ROLE = { POLICE: 'police', MAFIA: 'mafia', CITIZEN: 'citizen' };
const ROLE_LABELS = { police: '경찰', mafia: '마피아', citizen: '시민' };

function isMafiaTeam(role) {
  return role === 'mafia';
}

const room = {
  phase: 'day_chat',
  chatLog: {
    day: [
      { from: '나', fromId: 'human', text: '봇2 마피아', time: 1 },
      { from: '나', fromId: 'human', text: '경찰조사결과 봇2 마피아', time: 2 }
    ]
  },
  players: {
    human: { id: 'human', nickname: '나', role: 'police', alive: true, isBot: false },
    b2: { id: 'b2', nickname: '봇2', role: 'mafia', alive: true, isBot: true },
    b7: { id: 'b7', nickname: '봇7', role: 'citizen', alive: true, isBot: true }
  },
  game: { dayIndex: 2, nightIndex: 2, publicVoteIntel: [], botMinds: {} }
};

const helpers = {
  isMafiaTeam,
  isMafiaRole: (r) => r === 'mafia',
  ROLE_LABELS,
  getPlayerById: (r, id) => r.players[id],
  getAlivePlayers: (r) => Object.values(r.players).filter((p) => p.alive),
  getChatMessages: (r, ch) => (ch === 'day' ? r.chatLog.day : []),
  getBotMind: (r, id) => {
    if (!r.game.botMinds[id]) r.game.botMinds[id] = { knownRoles: {}, fakeClaim: null };
    return r.game.botMinds[id];
  },
  isPoliceReportRequest: (text, rm) => {
    if (rm && voteFacts.isPoliceReportProviding(text, rm)) return false;
    return /경찰조사결과|경찰조사|조결/.test(String(text).replace(/\s+/g, ''));
  },
  isPoliceReportProviding: (text, rm) => voteFacts.isPoliceReportProviding(text, rm),
  formatAccuseLine: (r, bot, targetId) => {
    const p = r.players[targetId];
    return p ? `경찰 조결 근거로 ${p.nickname}님이 수상합니다.` : null;
  }
};

botBrain.configure(helpers);

(async () => {
  try {
    if (fs.existsSync(LOG_OUT)) fs.unlinkSync(LOG_OUT);
  } catch (_) { /* noop */ }

  const texts = ['봇2 마피아', '경찰조사결과 봇2 마피아'];
  for (const t of texts) {
    const parsed = voteFacts.parsePoliceReportFromText(room, t);
    log({
      hypothesisId: 'B',
      location: 'verify:parse',
      message: 'parse test',
      data: {
        t,
        providing: voteFacts.isPoliceReportProviding(t, room),
        looks: policeFmt.looksLikePoliceReport(t),
        mafia: parsed.mafia.map((p) => p.nickname)
      }
    });
  }

  const bot7 = room.players.b7;
  const ctx = {
    triggerText: '경찰조사결과 봇2 마피아',
    policeReportAck: true,
    reportFromId: 'human'
  };
  const line = botBrain.generateRuleBased(room, bot7, ctx);
  log({
    hypothesisId: 'C',
    location: 'verify:generateRuleBased',
    message: 'bot7 ack line',
    data: { line, hasLine: !!line }
  });

  const asyncLine = await botBrain.generateBotChat(room, bot7, ctx);
  log({
    hypothesisId: 'C',
    location: 'verify:generateBotChat',
    message: 'bot7 generateBotChat',
    data: { line: asyncLine, hasLine: !!asyncLine }
  });

  log({ hypothesisId: 'done', location: 'verify', message: 'complete', data: { logPath: LOG_OUT } });
  process.stdout.write(`OK ${LOG_OUT}\n`);
})().catch((err) => {
  process.stderr.write(String(err.stack || err) + '\n');
  process.exit(1);
});
