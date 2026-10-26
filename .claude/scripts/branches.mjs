// Start-of-session report: every local branch other than main, with how far it is from origin/main, whether it is
// pushed, whether its work already landed, where its worktree is, and the first line of "## Next" in its notes file
// (src/handoffs/<branch>.md). Also says when the ledger branch holds records that are not on main yet.
// Run from any checkout of the repo: node .claude/scripts/branches.mjs [--no-fetch]. Read-only.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const CONFIG = {
  main: 'main',
  ledger: 'ledger',
  notes: b => `src/handoffs/${b}.md`,
};

const git = (...args) => {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
};
if (!process.argv.includes('--no-fetch')) spawnSync('git', ['fetch', '-q', '--prune'], { stdio: 'ignore' });

const base = git('rev-parse', '--verify', '-q', `origin/${CONFIG.main}`) ? `origin/${CONFIG.main}` : CONFIG.main;

const worktrees = {};
let cur = null;
for (const line of (git('worktree', 'list', '--porcelain') || '').split('\n')) {
  if (line.startsWith('worktree ')) cur = line.slice(9);
  else if (line.startsWith('branch refs/heads/') && cur) worktrees[line.slice(18)] = cur;
}

const refs = (git('for-each-ref', '--format=%(refname:short)|%(upstream)|%(upstream:track)', 'refs/heads') || '')
  .split('\n').filter(Boolean).map(l => { const [name, upstream, track] = l.split('|'); return { name, upstream, track }; });

const count = (a, b) => parseInt(git('rev-list', '--count', `${a}..${b}`) || '0', 10);

function nextLine(b) {
  const wt = worktrees[b];
  const file = CONFIG.notes(b);
  let text = wt && existsSync(path.join(wt, file)) ? readFileSync(path.join(wt, file), 'utf8') : null;
  if (text === null) text = git('show', `${b}:${file}`);
  if (text === null) text = git('show', `${base}:${file}`);
  if (text === null) return 'NO HANDOFF FILE';
  const m = text.split('\n');
  const i = m.findIndex(l => /^## Next\s*$/.test(l));
  if (i < 0) return '(no "## Next" section)';
  const first = m.slice(i + 1).find(l => l.trim());
  return first ? first.trim().slice(0, 200) : '(empty "## Next" section)';
}

const out = [];
const others = refs.filter(r => r.name !== CONFIG.main && r.name !== CONFIG.ledger);
for (const r of others) {
  const ahead = count(base, r.name), behind = count(r.name, base);
  const pushed = !r.upstream ? 'not pushed' : /gone/.test(r.track) ? 'upstream gone' : /ahead/.test(r.track) ? `pushed, ${r.track.replace(/[\[\]]/g, '')}` : 'pushed';
  let state = '';
  if (ahead === 0) state = ' · merged (nothing ahead of main)';
  else {
    const cherry = (git('cherry', base, r.name) || '').split('\n').filter(Boolean);
    if (cherry.length && cherry.every(l => l.startsWith('-'))) state = ' · landed (every commit is on main under other hashes)';
  }
  out.push(`${r.name} ahead ${ahead} / behind ${behind} · ${pushed}${state}${worktrees[r.name] ? ` · worktree ${worktrees[r.name]}` : ''}`);
  out.push(`    Next: ${nextLine(r.name)}`);
}
if (!others.length) out.push(`No other branches besides ${CONFIG.main}.`);

if (refs.some(r => r.name === CONFIG.ledger)) {
  const n = count(base, CONFIG.ledger);
  if (n > 0) out.push(`${CONFIG.ledger} has ${n} commit${n === 1 ? '' : 's'} not on ${CONFIG.main}: records waiting to land (node .claude/scripts/ledger.mjs land).`);
}
console.log(out.join('\n'));
