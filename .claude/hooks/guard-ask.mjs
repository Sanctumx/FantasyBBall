// PreToolUse hook (Bash, PowerShell): the bare `Bash` allow rule in settings.json wins over the `permissions.ask` entries, so push,
// merge and delete would run without a prompt. This hook answers "ask" for them, which forces the prompt whatever the allow list
// says (CLAUDE.md, "The user's working rules": prompts only on push, merge and delete). Keep the list in step with `permissions.ask`.
import { readFileSync } from 'node:fs';

const RULES = [
  /\bgit\b[^;&|\n]*\bpush\b/,
  /\bgh\s+pr\s+merge\b/,
  /\bgh\s+api\b[^;&|\n]*merge/,
  /(^|[;&|\n]\s*)rm\s/,
  /\bgit\s+branch\s+-[dD]\b/,
  /\bgit\s+worktree\s+remove\b/,
  /\bRemove-Item\b/i,
];

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
const cmd = input.tool_input && input.tool_input.command;
if (!cmd) process.exit(0);
// A commit message may mention these words; drop the message argument (and its heredoc body) so only the command itself is checked.
const text = /\bgit\s+commit\b/.test(cmd)
  ? cmd.replace(/<<-?\s*'?(\w+)'?[\s\S]*?\n\s*\1\b/g, '').replace(/(\s-[a-zA-Z]*m|\s--message)([\s=]+)("[^"]*"|'[^']*'|[^\s;&|]+)/g, '$1 ""')
  : cmd;
if (!RULES.some(re => re.test(text))) process.exit(0);
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask',
  permissionDecisionReason: 'push, merge and delete always need the user\'s approval (CLAUDE.md)' } }));
