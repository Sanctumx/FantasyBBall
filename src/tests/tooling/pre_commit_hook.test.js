const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const hooks = path.join(__dirname, '..', '..', '..', '.githooks');
const FILE = 'src/SESSION_HANDOFF.md';
const SHARED = [FILE, 'src/IDEAS.md', 'src/HANDOFF_ARCHIVE.md'];

// A repo whose main is also its origin/main, with the shared files committed, then a branch cut from it.
function repo(branch) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'precommit-'));
  const git = (...a) => {
    const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.hooksPath=' + hooks, '-C', dir, ...a],
      { encoding: 'utf8', env: { ...process.env, ALLOW_HANDOFF_EDIT: '' } });
    return r;
  };
  git('init', '-q', '-b', 'main');
  fs.mkdirSync(path.join(dir, 'src'));
  for (const f of SHARED) fs.writeFileSync(path.join(dir, f), 'base\n');
  git('add', '-A'); git('commit', '-q', '-m', 'base', '--no-verify');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  if (branch !== 'main') git('checkout', '-q', '-b', branch);
  return { dir, git };
}
const edit = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };

test('a commit changing a shared file on a feature branch is refused', () => {
  for (const f of SHARED) {
    const { dir, git } = repo('some-task');
    edit(dir, f, 'changed\n'); git('add', '-A');
    const r = git('commit', '-q', '-m', 'x');
    assert.notStrictEqual(r.status, 0, f);
    assert.match(r.stderr, /src\/handoffs\/some-task\.md/);
    assert.match(r.stderr, /ledger/);
  }
});

test('notes files and other files commit fine on a feature branch', () => {
  const { dir, git } = repo('some-task');
  edit(dir, 'src/handoffs/some-task.md', 'notes\n'); edit(dir, 'src/other.js', '1\n'); git('add', '-A');
  assert.strictEqual(git('commit', '-q', '-m', 'x').status, 0);
});

test('shared files commit on main, on the ledger branch and with the override', () => {
  for (const name of ['main', 'ledger']) {
    const m = repo(name);
    for (const f of SHARED) edit(m.dir, f, 'changed\n');
    m.git('add', '-A');
    assert.strictEqual(m.git('commit', '-q', '-m', 'x').status, 0, name);
  }
  const b = repo('some-task');
  edit(b.dir, FILE, 'changed\n'); b.git('add', '-A');
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.hooksPath=' + hooks, '-C', b.dir, 'commit', '-q', '-m', 'x'],
    { encoding: 'utf8', env: { ...process.env, ALLOW_HANDOFF_EDIT: '1' } });
  assert.strictEqual(r.status, 0);
});

test('the resume step (restore the shared files to the merge-base version) passes', () => {
  const { dir, git } = repo('some-task');
  edit(dir, FILE, 'changed\n'); git('add', '-A'); git('commit', '-q', '-m', 'x', '--no-verify');
  const base = git('merge-base', 'HEAD', 'origin/main').stdout.trim();
  git('checkout', base, '--', FILE);
  assert.strictEqual(git('commit', '-q', '-m', 'restore').status, 0);
});

test('the commit that finishes a conflicted merge of main is not blocked', () => {
  const { dir, git } = repo('some-task');
  edit(dir, 'src/handoffs/some-task.md', 'notes\n'); edit(dir, 'src/other.js', 'branch\n'); git('add', '-A'); git('commit', '-q', '-m', 'w');
  git('checkout', '-q', 'main'); edit(dir, FILE, 'main change\n'); edit(dir, 'src/other.js', 'main\n'); git('add', '-A'); git('commit', '-q', '-m', 'm', '--no-verify');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  git('checkout', '-q', 'some-task');
  assert.notStrictEqual(git('merge', 'origin/main', '--no-edit').status, 0);
  edit(dir, 'src/other.js', 'resolved\n'); git('add', '-A');
  assert.strictEqual(git('commit', '-q', '--no-edit').status, 0);
});
