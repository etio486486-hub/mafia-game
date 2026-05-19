/**
 * Debug mode NDJSON logging (session a38a8e).
 */
const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '..', 'debug-a38a8e.log');
const ENDPOINT = 'http://127.0.0.1:7270/ingest/50c123a2-bf7d-4c65-ba87-3da2632b748d';
const SESSION_ID = 'a38a8e';

function agentLog(payload) {
  const entry = {
    sessionId: SESSION_ID,
    timestamp: Date.now(),
    ...payload
  };
  const line = `${JSON.stringify(entry)}\n`;
  // #region agent log
  const paths = [LOG_PATH, path.join(process.cwd(), 'debug-a38a8e.log')];
  for (const p of paths) {
    try {
      fs.appendFileSync(p, line);
    } catch (_) { /* noop */ }
  }
  console.log(`[DEBUG-a38a8e] ${payload.message || ''}`, JSON.stringify(payload.data || {}));
  if (typeof fetch === 'function') {
    fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': SESSION_ID
      },
      body: JSON.stringify(entry)
    }).catch(() => {});
  }
  // #endregion
}

module.exports = { agentLog, LOG_PATH };
