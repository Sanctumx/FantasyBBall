// PreToolUse hook (Edit|Write): the session handoff is edited on main only; a branch keeps its notes in
// src/work/<branch>.md. Blocks (exit 2, message shown to Claude) an edit to the handoff when the checkout being
// edited is not on main. Override: ALLOW_HANDOFF_EDIT=1, or add the branch to CONFIG.allowBranches.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const CONFIG = {
  handoff: 'src/SESSION_HANDOFF.md',
  mainBranch: 'main',
  allowBranches: ['handoff-workstreams'],  // the branch that introduces the rule edits the handoff once
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
if (path.relative(root, abs).split(path.sep).join('/') !== CONFIG.handoff) process.exit(0);
const branch = git(root, 'branch', '--show-current') || '(detached)';
if (branch === CONFIG.mainBranch || CONFIG.allowBranches.includes(branch)) process.exit(0);
process.stderr.write(
  `Blocked: ${CONFIG.handoff} is edited on ${CONFIG.mainBranch} only (this checkout is on ${branch}). ` +
  `Write src/work/${branch}.md instead; see docs/release-handoff.md "Reading the handoff and branch notes". ` +
  `To override once, set ALLOW_HANDOFF_EDIT=1.\n`);
process.exit(2);
