// UserPromptSubmit hook: past the thresholds it shows you one line (so you don't have to run /context) and tells Claude
// the same, so the break happens without being asked: finish the task, record it with /handoff, then you /clear.
// Runs locally and uses no tokens. Silent below the thresholds, and silent on any error.
import { readInput, readUsage, BREAK_AT, STOP_AT, k } from './context-usage.mjs';

const usage = readUsage(readInput().transcript_path);
if (!usage) process.exit(0);

const { total, messages } = usage;
const size = `Context ${k(total)} (about ${k(messages)} of conversation)`;
let text = null, rule = null;
if (messages >= STOP_AT) {
  text = `${size}: stop at the next safe point, run /handoff, then /clear.`;
  rule = 'Finish only the step in progress, do not start another task, run the handoff routine, then tell the user to /clear.';
} else if (messages >= BREAK_AT) {
  text = `${size}: finish this task, then /handoff and /clear.`;
  rule = 'Finish the current task, then run the handoff routine. Do not autorun further plan tasks. Tell the user to /clear.';
}
if (text) process.stdout.write(JSON.stringify({
  systemMessage: text,
  hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: `${text} ${rule}` },
}) + '\n');
