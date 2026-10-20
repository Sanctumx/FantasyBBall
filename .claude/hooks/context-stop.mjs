// Stop hook: when Claude finishes a turn past the break threshold and no handoff has been recorded this session, it
// blocks the stop once so Claude runs /handoff before the conversation goes on. Waiting until the turn ends means the
// task in progress is finished first. Fires once per session (marker file), never loops (stop_hook_active), and is
// silent on any error.
import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readInput, readUsage, BREAK_AT, k } from './context-usage.mjs';

const input = readInput();
if (input.stop_hook_active) process.exit(0);
const usage = readUsage(input.transcript_path);
if (!usage || usage.messages < BREAK_AT) process.exit(0);

// Already recorded: the user typed /handoff or /release, or Claude invoked the skill.
if (/<command-name>\/?(handoff|release)\b|"skill":"(?:[\w-]+:)?(handoff|release)"/.test(usage.log)) process.exit(0);

const marker = join(tmpdir(), `claude-context-stop-${String(input.session_id || 'x').replace(/[^\w-]/g, '')}`);
if (existsSync(marker)) process.exit(0);
try { writeFileSync(marker, '1'); } catch { process.exit(0); }

process.stdout.write(JSON.stringify({
  decision: 'block',
  reason: `The conversation is about ${k(usage.messages)} long and no handoff is recorded. If the task is finished, run the ` +
    `handoff routine now (the /handoff skill), then tell the user to /clear. If you are only waiting on a user decision ` +
    `mid-task, say so and skip the handoff.`,
}) + '\n');
