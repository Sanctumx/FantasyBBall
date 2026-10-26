// PreToolUse hook (Bash): the user's standing rule is no `cd` prefixes, no `sed -i` and no heredoc patch scripts, since each one
// raises a permission prompt (CLAUDE.md, "The user's working rules"). Blocks (exit 2, message shown to Claude) a command that does
// one of them; read-only inspection snippets (`node -e`, a heredoc that only prints) still pass. Override: ALLOW_BASH_PATTERNS=1.
import { readFileSync } from 'node:fs';

const RULES = [
  [/(^|&&|;|\|\|)\s*cd\s/, 'a `cd` prefix: run from the repo root, use absolute paths, or `git -C <dir>` for another worktree'],
  [/\bsed\s+(-[a-zA-Z]*i|--in-place)/, '`sed -i`: change the file with the Edit tool'],
  [/\bcat\s+>>?\s*\S+\s*<</, 'a `cat > file <<EOF` write: use the Write tool'],
  [/\b(python3?|node|perl)\s+-\s*<<[\s\S]*(writeFile|\.write\(|open\([^)]*['"][wa]|\.replace\(|re\.sub|\.sub\()/, 'a heredoc patch script: use the Edit/Write tools'],
];

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
const cmd = input.tool_input && input.tool_input.command;
if (!cmd || process.env.ALLOW_BASH_PATTERNS === '1') process.exit(0);
const hit = RULES.find(([re]) => re.test(cmd));
if (!hit) process.exit(0);
process.stderr.write(`Blocked: ${hit[1]} (the user's rule, CLAUDE.md "The user's working rules"; each of these raises a permission prompt). Rewrite the command without it.\n`);
process.exit(2);
