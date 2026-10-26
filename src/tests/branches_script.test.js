const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.join(__dirname, '..', '..', '.claude', 'scripts', 'branches.mjs');

// A clone with a bare origin; main has one commit pushed.
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'branches-'));
  const origin = path.join(root, 'origin.git'), dir = path.join(root, 'work');
  spawnSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
  spawnSync('git', ['clone', '-q', origin, dir]);
  const git = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-C', dir, ...a], { encoding: 'utf8' });
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
  git('checkout', '-q', '-b', 'main');
  put('a.txt', '1\n'); git('add', '-A'); git('commit', '-q', '-m', 'base'); git('push', '-q', '-u', 'origin', 'main');
  return { root, dir, git, put };
}
const report = dir => spawnSync('node', [script, '--no-fetch'], { cwd: dir, encoding: 'utf8' }).stdout;
const lineOf = (out, name) => out.split('\n').find(l => l.startsWith(name + ' ')) || '';

test('an unpushed branch with a handoff shows ahead count, no upstream and its Next line', () => {
  const { dir, git, put } = setup();
  git('checkout', '-q', '-b', 'calib-ros');
  put('src/handoffs/calib-ros.md', '# calib-ros\n\n## Next\n\nReview then PR.\n'); put('b.txt', '2\n');
  git('add', '-A'); git('commit', '-q', '-m', 'work');
  git('checkout', '-q', 'main');
  const out = report(dir);
  const l = lineOf(out, 'calib-ros');
  assert.match(l, /ahead 1/);
  assert.match(l, /not pushed/);
  assert.match(out, /Review then PR\./);
});

test('a branch without a handoff file is flagged', () => {
  const { dir, git, put } = setup();
  git('checkout', '-q', '-b', 'quick'); put('b.txt', '2\n'); git('add', '-A'); git('commit', '-q', '-m', 'work'); git('checkout', '-q', 'main');
  assert.match(report(dir), /quick[^\n]*[\s\S]*NO HANDOFF FILE/);
});

test('a branch whose commits are already on main under other hashes shows landed', () => {
  const { dir, git, put } = setup();
  git('checkout', '-q', '-b', 'fix'); put('b.txt', '2\n'); git('add', '-A'); git('commit', '-q', '-m', 'fix');
  git('checkout', '-q', 'main'); put('b.txt', '2\n'); git('add', '-A'); git('commit', '-q', '-m', 'same change'); git('push', '-q');
  assert.match(lineOf(report(dir), 'fix'), /landed/);
});

test('a branch behind main and a merged branch are reported', () => {
  const { dir, git, put } = setup();
  git('checkout', '-q', '-b', 'old'); put('src/handoffs/old.md', '## Next\n\nx\n'); git('add', '-A'); git('commit', '-q', '-m', 'w');
  git('checkout', '-q', 'main'); git('merge', '-q', '--no-ff', 'old', '-m', 'merge old');
  put('c.txt', '3\n'); git('add', '-A'); git('commit', '-q', '-m', 'more'); git('push', '-q');
  assert.match(lineOf(report(dir), 'old'), /merged/);
  git('checkout', '-q', '-b', 'lag', 'HEAD~2'); git('checkout', '-q', 'main');
  assert.match(lineOf(report(dir), 'lag'), /behind 3/);
});

test('unlanded ledger commits are called out', () => {
  const { dir, git, put } = setup();
  git('checkout', '-q', '-b', 'ledger'); put('src/IDEAS.md', 'row\n'); git('add', '-A'); git('commit', '-q', '-m', 'row'); git('checkout', '-q', 'main');
  assert.match(report(dir), /ledger has 1 commit not on main/);
});

test('stale branches are flagged: merged, far behind main, or with no handoff', () => {
  const { dir, git, put } = setup();
  git('checkout', '-q', '-b', 'old'); put('src/handoffs/old.md', '## Next\n\nx\n'); git('add', '-A'); git('commit', '-q', '-m', 'w');
  git('checkout', '-q', 'main'); git('merge', '-q', '--no-ff', 'old', '-m', 'merge old');
  git('checkout', '-q', '-b', 'quick'); put('q.txt', '1\n'); git('add', '-A'); git('commit', '-q', '-m', 'q');
  git('checkout', '-q', '-b', 'lag', 'HEAD~1'); put('src/handoffs/lag.md', '## Next\n\nx\n'); put('l.txt', '1\n'); git('add', '-A'); git('commit', '-q', '-m', 'l');
  git('checkout', '-q', 'main');
  for (let i = 0; i < 21; i++) { put(`m${i}.txt`, 'x\n'); git('add', '-A'); git('commit', '-q', '-m', `m${i}`); }
  git('push', '-q');
  const out = report(dir);
  assert.match(lineOf(out, 'old'), /STALE \(merged/);
  assert.match(lineOf(out, 'lag'), /STALE \(behind 21/);
  assert.match(out, /quick[^\n]*STALE \([^)]*no handoff/);
});

test('a live, current branch with a handoff is not flagged stale', () => {
  const { dir, git, put } = setup();
  git('checkout', '-q', '-b', 'live'); put('src/handoffs/live.md', '## Next\n\nx\n'); git('add', '-A'); git('commit', '-q', '-m', 'w'); git('checkout', '-q', 'main');
  assert.doesNotMatch(report(dir), /STALE/);
});

test('a main checkout parked on a feature branch is called out', () => {
  const { dir, git, put } = setup();
  git('checkout', '-q', '-b', 'feat'); put('src/handoffs/feat.md', '## Next\n\nx\n'); git('add', '-A'); git('commit', '-q', '-m', 'w');
  assert.match(report(dir), /main checkout[^\n]*is on feat, not main/i);
  git('checkout', '-q', 'main');
  assert.doesNotMatch(report(dir), /main checkout/i);
});

test('a clean repo with only main prints that nothing is in flight', () => {
  const { dir } = setup();
  assert.match(report(dir), /no other branches/i);
});
