// PreToolUse hook (Bash): the user's standing rule is no `sed -i` and no heredoc patch scripts, because a file written through Bash
// skips the Edit/Write hooks (before-edit.mjs guards the handoff, ledger and built pages; after-edit.mjs runs the tests)
// (CLAUDE.md, "The user's working rules"). Blocks (exit 2, message shown to Claude) a command that does
// one of them; read-only inspection snippets (`node -e`, a heredoc that only prints) still pass. Override: ALLOW_BASH_PATTERNS=1.
import { readFileSync } from 'node:fs';

const RULES = [
  [/\bsed\s+(-[a-zA-Z]*i|--in-place)/, '`sed -i`: change the file with the Edit tool'],
  [/\bcat\s+>>?\s*\S+\s*<</, 'a `cat > file <<EOF` write: use the Write tool'],
  [/\bcat\s*<<-?\s*['"]?\w+['"]?\s*>>?\s*\S+/, 'a `cat <<EOF > file` write: use the Write tool'],
  [/\b(python3?|node|perl)\s*(-\s*)?<<[\s\S]*(writeFile|\.write\(|write_text|write_bytes|open\([^)]*['"][wa])/, 'a heredoc patch script: use the Edit/Write tools'],
];

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
const cmd = input.tool_input && input.tool_input.command;
if (!cmd || process.env.ALLOW_BASH_PATTERNS === '1') process.exit(0);
// A commit message may name a blocked pattern; drop the message argument (and its heredoc body) so only the command itself is
// checked. Other quoted text on a commit line stays checked, so `git commit -m x; bash -c "sed -i ..."` is still blocked.
const text = /\bgit\s+commit\b/.test(cmd)
  ? cmd.replace(/<<-?\s*'?(\w+)'?[\s\S]*?\n\s*\1\b/g, '').replace(/(\s-[a-zA-Z]*m|\s--message)([\s=]+)("[^"]*"|'[^']*'|[^\s;&|]+)/g, '$1 ""')
  : cmd;
const hit = RULES.find(([re]) => re.test(text));
if (!hit) process.exit(0);
process.stderr.write(`Blocked: ${hit[1]} (the user's rule, CLAUDE.md "The user's working rules"; a file written through Bash skips the edit guards and post-edit tests). Rewrite the command without it.\n`);
process.exit(2);
