const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.join(__dirname, '..', '..', '.claude', 'scripts', 'ledger.mjs');
const IDEAS = 'src/IDEAS.md';

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-'));
  const origin = path.join(root, 'origin.git'), dir = path.join(root, 'work');
  spawnSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
  spawnSync('git', ['clone', '-q', origin, dir]);
  const git = (cwd, ...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-C', cwd, ...a], { encoding: 'utf8' });
  const put = (cwd, rel, text) => { fs.mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true }); fs.writeFileSync(path.join(cwd, rel), text); };
  git(dir, 'checkout', '-q', '-b', 'main');
  put(dir, IDEAS, '| 3 | x |\n| 15a | y |\n| 141 | z |\n'); put(dir, 'src/SESSION_HANDOFF.md', 'h\n'); put(dir, 'src/engine.js', '1\n');
  git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'base'); git(dir, 'push', '-q', '-u', 'origin', 'main');
  const run = (cwd, ...a) => spawnSync('node', [script, ...a], { cwd, encoding: 'utf8' });
  const ledger = path.join(root, 'work-ledger');
  return { root, origin, dir, ledger, git, put, run };
}
const originMain = (s) => s.git(s.origin, 'rev-parse', 'main').stdout.trim();

test('setup creates the ledger worktree on a branch called ledger, and is safe to repeat', () => {
  const s = setup();
  const r = s.run(s.dir, 'setup');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(s.git(s.ledger, 'branch', '--show-current').stdout.trim(), 'ledger');
  assert.strictEqual(s.run(s.dir, 'setup').status, 0);
});

test('next gives the highest numeric idea id on origin/main plus one', () => {
  const s = setup();
  assert.strictEqual(s.run(s.dir, 'next').stdout.trim(), '142');
});

test('land pushes the ledger commits to main when only shared files changed', () => {
  const s = setup(); s.run(s.dir, 'setup');
  s.put(s.ledger, IDEAS, '| 3 | x |\n| 15a | y |\n| 141 | z |\n| 142 | new |\n'); s.git(s.ledger, 'commit', '-qam', 'docs: row 142');
  const r = s.run(s.dir, 'land');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(originMain(s), s.git(s.ledger, 'rev-parse', 'ledger').stdout.trim());
});

test('land refuses when a non-shared file changed, and pushes nothing', () => {
  const s = setup(); s.run(s.dir, 'setup');
  const before = originMain(s);
  s.put(s.ledger, 'src/engine.js', '2\n'); s.git(s.ledger, 'commit', '-qam', 'oops');
  const r = s.run(s.dir, 'land');
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /src\/engine\.js/);
  assert.strictEqual(originMain(s), before);
});

test('land refuses with uncommitted changes in the ledger worktree', () => {
  const s = setup(); s.run(s.dir, 'setup');
  s.put(s.ledger, IDEAS, 'edited\n');
  const r = s.run(s.dir, 'land');
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /uncommitted/i);
});

test('land rebases onto a main that moved and still lands', () => {
  const s = setup(); s.run(s.dir, 'setup');
  s.put(s.ledger, 'src/HANDOFF_ARCHIVE.md', 'entry\n'); s.git(s.ledger, 'add', '-A'); s.git(s.ledger, 'commit', '-qm', 'archive');
  s.put(s.dir, 'src/engine.js', '2\n'); s.git(s.dir, 'commit', '-qam', 'other work'); s.git(s.dir, 'push', '-q');
  const r = s.run(s.dir, 'land');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(originMain(s), s.git(s.ledger, 'rev-parse', 'ledger').stdout.trim());
  assert.match(s.git(s.origin, 'log', '--format=%s', 'main').stdout, /other work/);
});

test('land with nothing waiting says so', () => {
  const s = setup(); s.run(s.dir, 'setup');
  const r = s.run(s.dir, 'land');
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /nothing to land/i);
});
