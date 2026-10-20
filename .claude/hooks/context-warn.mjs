// UserPromptSubmit hook: warns you (not Claude) when the conversation is getting long, so you don't have to run
// /context. It reads the token count from the last reply in the session log, subtracts the fixed start-up cost, and
// prints one line only past the thresholds. Runs locally and uses no tokens. Silent otherwise, and silent on any error.
// Set CTX_BASELINE to the total /context shows in a fresh chat (default 35000: terminal and VS Code).
import { readFileSync } from 'node:fs';

const BASELINE = Number(process.env.CTX_BASELINE) || 35000;
const BREAK_AT = 115000;  // Messages: plan a break (/handoff, then /clear at the next stop)
const STOP_AT = 265000;   // Messages: stop at the next safe point

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
if (!input.transcript_path) process.exit(0);

let total = null;
try {
  const lines = readFileSync(input.transcript_path, 'utf8').split('\n');
  for (let i = lines.length - 1; i >= 0 && total === null; i--) {
    if (!lines[i].includes('"usage"')) continue;
    let u;
    try { u = JSON.parse(lines[i]).message?.usage; } catch { continue; }
    if (u && typeof u.input_tokens === 'number') {
      total = u.input_tokens + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    }
  }
} catch { process.exit(0); }
if (total === null) process.exit(0);

const messages = Math.max(0, total - BASELINE);
const k = n => Math.round(n / 1000) + 'K';
let text = null;
if (messages >= STOP_AT) text = `Context ${k(total)} (about ${k(messages)} of conversation): stop at the next safe point, run /handoff, then /clear.`;
else if (messages >= BREAK_AT) text = `Context ${k(total)} (about ${k(messages)} of conversation): finish this step, then /handoff and /clear.`;
if (text) process.stdout.write(JSON.stringify({ systemMessage: text }) + '\n');
