// PreToolUse hook (Edit|Write): the shared records (session handoff, ideas ledger, archive) are edited on main only,
// in practice in the ledger worktree; a branch keeps its notes in src/handoffs/<branch>.md. Blocks (exit 2, message
// shown to Claude) an edit to one of them when the checkout being edited is not on main or the ledger branch.
// Override: ALLOW_HANDOFF_EDIT=1, or add the branch to CONFIG.allowBranches.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const CONFIG = {
  shared: ['src/SESSION_HANDOFF.md', 'src/IDEAS.md', 'src/HANDOFF_ARCHIVE.md'],
  notesDir: 'src/handoffs',
  mainBranch: 'main',
  allowBranches: ['ledger', 'handoff-workstreams'],  // ledger = the worktree for shared records; the second introduces the rule
};

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
const file = input.tool_input && input.tool_input.file_path;
if (!file || process.env.ALLOW_HANDOFF_EDIT === '1') process.exit(0);
const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const abs = path.resolve(cwd, file);
const git = (dir, ...args) => {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
};
const root = git(path.dirname(abs), 'rev-parse', '--show-toplevel');
if (!root) process.exit(0);
const rel = path.relative(root, abs).split(path.sep).join('/');
if (!CONFIG.shared.includes(rel)) process.exit(0);
const branch = git(root, 'branch', '--show-current') || '(detached)';
if (branch === CONFIG.mainBranch || CONFIG.allowBranches.includes(branch)) process.exit(0);
process.stderr.write(
  `Blocked: ${rel} is edited on ${CONFIG.mainBranch} only (this checkout is on ${branch}). ` +
  `Write ${CONFIG.notesDir}/${branch}.md for this branch's notes; for a shared record edit it in the ledger worktree ` +
  `(node .claude/scripts/ledger.mjs setup; see docs/release-handoff.md "Parallel sessions"). ` +
  `To override once, set ALLOW_HANDOFF_EDIT=1.\n`);
process.exit(2);
