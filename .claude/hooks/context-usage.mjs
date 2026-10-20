// Shared by context-warn.mjs and context-stop.mjs: how much conversation is in the session, read from the last reply's
// token usage in the session log. Set CTX_BASELINE to the total /context shows in a fresh chat (default 35000).
import { readFileSync } from 'node:fs';

export const BASELINE = Number(process.env.CTX_BASELINE) || 35000;
export const BREAK_AT = 115000;  // Messages: finish the task, then /handoff and /clear
export const STOP_AT = 265000;   // Messages: stop at the next safe point
export const k = n => Math.round(n / 1000) + 'K';

export function readInput() {
  try { return JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}

// { total, messages, log } or null when the log can't be read or has no usage yet.
export function readUsage(transcriptPath) {
  if (!transcriptPath) return null;
  let log;
  try { log = readFileSync(transcriptPath, 'utf8'); } catch { return null; }
  const lines = log.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"usage"')) continue;
    let u;
    try { u = JSON.parse(lines[i]).message?.usage; } catch { continue; }
    if (u && typeof u.input_tokens === 'number') {
      const total = u.input_tokens + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      return { total, messages: Math.max(0, total - BASELINE), log };
    }
  }
  return null;
}
