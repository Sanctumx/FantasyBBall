const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const hooks = path.join(__dirname, '..', '..', '.githooks');
const FILE = 'src/SESSION_HANDOFF.md';

// A repo whose main is also its origin/main, with the handoff committed, then a branch cut from it.
function repo(branch) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'precommit-'));
  const git = (...a) => {
    const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.hooksPath=' + hooks, '-C', dir, ...a],
      { encoding: 'utf8', env: { ...process.env, ALLOW_HANDOFF_EDIT: '' } });
    return r;
  };
  git('init', '-q', '-b', 'main');
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, FILE), 'base\n');
  git('add', '-A'); git('commit', '-q', '-m', 'base', '--no-verify');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  if (branch !== 'main') git('checkout', '-q', '-b', branch);
  return { dir, git };
}
const edit = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };

test('a commit changing the handoff on a feature branch is refused', () => {
  const { dir, git } = repo('some-task');
  edit(dir, FILE, 'changed\n'); git('add', '-A');
  const r = git('commit', '-q', '-m', 'x');
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /src\/work\/some-task\.md/);
});

test('notes files and other files commit fine on a feature branch', () => {
  const { dir, git } = repo('some-task');
  edit(dir, 'src/work/some-task.md', 'notes\n'); edit(dir, 'src/other.js', '1\n'); git('add', '-A');
  assert.strictEqual(git('commit', '-q', '-m', 'x').status, 0);
});

test('handoff changes commit on main and with the override', () => {
  const m = repo('main');
  edit(m.dir, FILE, 'changed\n'); m.git('add', '-A');
  assert.strictEqual(m.git('commit', '-q', '-m', 'x').status, 0);
  const b = repo('some-task');
  edit(b.dir, FILE, 'changed\n'); b.git('add', '-A');
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.hooksPath=' + hooks, '-C', b.dir, 'commit', '-q', '-m', 'x'],
    { encoding: 'utf8', env: { ...process.env, ALLOW_HANDOFF_EDIT: '1' } });
  assert.strictEqual(r.status, 0);
});

test('the resume step (restore the handoff to the merge-base version) passes', () => {
  const { dir, git } = repo('some-task');
  edit(dir, FILE, 'changed\n'); git('add', '-A'); git('commit', '-q', '-m', 'x', '--no-verify');
  const base = git('merge-base', 'HEAD', 'origin/main').stdout.trim();
  git('checkout', base, '--', FILE);
  assert.strictEqual(git('commit', '-q', '-m', 'restore').status, 0);
});
