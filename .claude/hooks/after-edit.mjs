// PostToolUse hook (Edit|Write): runs the unit tests after an edit to tested code, and warns when the handoff
// grows past its budget. Silent when everything is fine; on a problem it prints to stderr and exits 2, which
// Claude Code shows to Claude. Edit CONFIG for another project; nothing else needs changing.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const CONFIG = {
  // Files (relative to the project root) whose edits trigger the tests. '*' matches within one folder.
  testOn: ['src/engine.js', 'src/league_core.js', 'src/inseason_league.js', 'src/inseason_players.js', 'src/matchup_core.js', 'src/trade_core.js', 'src/shared.js', 'src/backtest.js', 'src/tests/**/*.test.js'],
  testCmd: ['node', ['--test', 'src/tests/']],
  testTimeoutMs: 120000,
  handoff: 'src/SESSION_HANDOFF.md',
  handoffMaxLines: 150,
  handoffMaxBytes: 8000,  // long lines slip past a line count; bytes track what each session pays to read
};

// Glob to regex: '**/' = any folders (or none), '**' = anything, '*' = anything within one folder.
const toRegex = glob => new RegExp('^' + glob.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  .replace(/\*\*\//g, '\u0000').replace(/\*\*/g, '\u0001').replace(/\*/g, '[^/]*')
  .replace(/\u0000/g, '(?:.*/)?').replace(/\u0001/g, '.*') + '$');

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
const file = input.tool_input && input.tool_input.file_path;
if (!file) process.exit(0);
// The checkout being edited: the git root of the folder Claude is working in. In a git worktree this differs from
// CLAUDE_PROJECT_DIR, which stays on the main checkout, so the tests must run where the edit happened.
const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const abs = path.resolve(cwd, file);
const gitRoot = dir => {
  const r = spawnSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  return r.status === 0 ? path.resolve(r.stdout.trim()) : null;
};
const root = gitRoot(path.dirname(abs)) || process.env.CLAUDE_PROJECT_DIR || cwd;
const rel = path.relative(root, abs).split(path.sep).join('/');

const problems = [];

if (CONFIG.testCmd && CONFIG.testOn.some(g => toRegex(g).test(rel))) {
  const [cmd, args] = CONFIG.testCmd;
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', timeout: CONFIG.testTimeoutMs, shell: process.platform === 'win32' });
  if (r.error) problems.push(`Unit tests could not run after editing ${rel}: ${r.error.message}`);
  else if (r.status !== 0) {
    const out = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n');
    // Each failing test: its "not ok" line and the indented details under it.
    const failing = [];
    out.forEach((l, i) => { if (/^\s*not ok/.test(l)) failing.push(l, ...out.slice(i + 1, i + 9).filter(d => /^\s{2,}\S/.test(d) && !/^\s*(ok|not ok|#)/.test(d))); });
    problems.push(`Unit tests FAIL after editing ${rel}:\n${(failing.length ? failing : out.slice(-25)).join('\n')}`);
  }
}

if (rel === CONFIG.handoff) {
  const text = readFileSync(path.join(root, rel), 'utf8');
  const lines = text.split('\n').length, bytes = Buffer.byteLength(text);
  if (lines > CONFIG.handoffMaxLines || bytes > CONFIG.handoffMaxBytes)
    problems.push(`${rel} is ${lines} lines / ${bytes} bytes (budget ${CONFIG.handoffMaxLines} / ${CONFIG.handoffMaxBytes}). ` +
      'Move stable reference to its own file and finished detail to the archive, unchanged.');
}

if (problems.length) { process.stderr.write(problems.join('\n\n') + '\n'); process.exit(2); }
