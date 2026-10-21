// Shared by context-warn.mjs and context-stop.mjs: how much conversation is in the session, read from the token usage
// of each reply in the session log. The start-up cost (system prompt, tools, skills, CLAUDE.md) is measured from the
// log itself: it is the smallest total seen, which is the first reply, or the lowest point after a /compact.
// Set CTX_BASELINE to override it with the total /context shows in a fresh chat.
import { readFileSync } from 'node:fs';

export const BREAK_AT = 60000;  // Messages: finish the task, then /handoff and /clear
export const STOP_AT = 120000;   // Messages: stop at the next safe point
export const k = n => Math.round(n / 1000) + 'K';

export function readInput() {
  try { return JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}

// { total, messages, log } or null when the log can't be read or has no usage yet.
export function readUsage(transcriptPath) {
  if (!transcriptPath) return null;
  let log;
  try { log = readFileSync(transcriptPath, 'utf8'); } catch { return null; }
  const totals = [];
  for (const line of log.split('\n')) {
    if (!line.includes('"usage"')) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    const u = e.message?.usage;
    if (e.isSidechain || !u || typeof u.input_tokens !== 'number') continue;
    totals.push(u.input_tokens + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0));
  }
  if (!totals.length) return null;
  const total = totals[totals.length - 1];
  const baseline = Number(process.env.CTX_BASELINE) || Math.min(...totals);
  return { total, messages: Math.max(0, total - baseline), log };
}
