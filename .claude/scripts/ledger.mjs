// The ledger worktree: a permanent second checkout where the shared records (session handoff, ideas ledger, archive)
// are edited and landed on main without touching any feature branch. Commands (run from any checkout of the repo):
//   setup  create ../<repo>-ledger on branch "ledger" from origin/main (safe to repeat)
//   next   print the next free idea number (highest numeric id in origin/main's ideas ledger + 1)
//   land   rebase "ledger" onto origin/main, check that only shared files changed, push ledger:main (fast-forward only)
// Edit shared files in the ledger worktree, commit there ("docs: ..."), then land. A new idea row is landed at once, so
// the push is what claims its number: a rejected push means someone else took it, so run land again after renumbering.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const CONFIG = {
  main: 'main',
  branch: 'ledger',
  shared: ['src/SESSION_HANDOFF.md', 'src/IDEAS.md', 'src/HANDOFF_ARCHIVE.md'],
  ideas: 'src/IDEAS.md',
  suffix: '-ledger',
};

const run = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' });
const out = (cwd, ...args) => { const r = run(cwd, ...args); return r.status === 0 ? r.stdout.trim() : null; };
const fail = msg => { process.stderr.write(msg + '\n'); process.exit(1); };

const here = out(process.cwd(), 'rev-parse', '--show-toplevel') || fail('Not inside a git repository.');
const trees = [];
for (const l of (out(here, 'worktree', 'list', '--porcelain') || '').split('\n')) {
  if (l.startsWith('worktree ')) trees.push({ path: l.slice(9) });
  else if (l.startsWith('branch refs/heads/') && trees.length) trees[trees.length - 1].branch = l.slice(18);
}
const mainTree = trees[0].path;
const ledgerPath = (trees.find(t => t.branch === CONFIG.branch) || {}).path
  || path.join(path.dirname(mainTree), path.basename(mainTree) + CONFIG.suffix);

const cmd = process.argv[2];
const origin = `origin/${CONFIG.main}`;

if (cmd === 'setup') {
  run(here, 'fetch', '-q');
  if (trees.some(t => t.branch === CONFIG.branch)) { console.log(`Ledger worktree: ${ledgerPath}`); process.exit(0); }
  const args = run(here, 'rev-parse', '--verify', '-q', CONFIG.branch).status === 0
    ? ['worktree', 'add', ledgerPath, CONFIG.branch]
    : ['worktree', 'add', '-b', CONFIG.branch, ledgerPath, origin];
  const r = run(here, ...args);
  if (r.status !== 0) fail(r.stderr);
  console.log(`Ledger worktree: ${ledgerPath}`);
} else if (cmd === 'next') {
  run(here, 'fetch', '-q');
  const text = out(here, 'show', `${origin}:${CONFIG.ideas}`) || fail(`${CONFIG.ideas} not found on ${origin}.`);
  let max = 0;
  for (const m of text.matchAll(/^\|\s*(\d+)[a-z]?\s*\|/gm)) max = Math.max(max, parseInt(m[1], 10));
  console.log(max + 1);
} else if (cmd === 'land') {
  if (!trees.some(t => t.branch === CONFIG.branch)) fail('No ledger worktree. Run: node .claude/scripts/ledger.mjs setup');
  run(ledgerPath, 'fetch', '-q');
  if (out(ledgerPath, 'status', '--porcelain')) fail(`Uncommitted changes in ${ledgerPath}: commit them first.`);
  if (!out(ledgerPath, 'rev-list', `${origin}..${CONFIG.branch}`)) { console.log('Nothing to land.'); process.exit(0); }
  const rb = run(ledgerPath, 'rebase', origin);
  if (rb.status !== 0) { run(ledgerPath, 'rebase', '--abort'); fail(`Rebase onto ${origin} conflicted; resolve it in ${ledgerPath} and run land again.\n${rb.stderr}`); }
  const changed = (out(ledgerPath, 'diff', '--name-only', `${origin}..${CONFIG.branch}`) || '').split('\n').filter(Boolean);
  const bad = changed.filter(f => !CONFIG.shared.includes(f));
  if (bad.length) fail(`Not landing: the ledger branch changes files outside the shared records: ${bad.join(', ')}`);
  const push = run(ledgerPath, 'push', 'origin', `${CONFIG.branch}:${CONFIG.main}`);
  if (push.status !== 0) fail(`Push rejected (main moved or the number was taken); run land again.\n${push.stderr}`);
  console.log(`Landed ${changed.join(', ')} on ${CONFIG.main}.`);
} else {
  fail('Usage: node .claude/scripts/ledger.mjs setup | next | land');
}
