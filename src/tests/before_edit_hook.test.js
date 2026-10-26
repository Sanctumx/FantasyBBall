const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const hook = path.join(__dirname, '..', '..', '.claude', 'hooks', 'before-edit.mjs');

function repoOn(branch) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beforeedit-'));
  spawnSync('git', ['init', '-q', '-b', branch, dir]);
  fs.mkdirSync(path.join(dir, 'src'));
  return dir;
}
function run(dir, rel, env = {}) {
  const input = { cwd: dir, tool_input: { file_path: path.join(dir, rel) } };
  return spawnSync('node', [hook], { input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, ALLOW_HANDOFF_EDIT: '', ...env } });
}

test('handoff edit is blocked on a feature branch and points to the notes file', () => {
  const r = run(repoOn('some-task'), 'src/SESSION_HANDOFF.md');
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /src\/handoffs\/some-task\.md/);
});

test('handoff edit is allowed on main', () => {
  assert.strictEqual(run(repoOn('main'), 'src/SESSION_HANDOFF.md').status, 0);
});

test('handoff edit is allowed on the migration branch and with the override', () => {
  assert.strictEqual(run(repoOn('handoff-workstreams'), 'src/SESSION_HANDOFF.md').status, 0);
  assert.strictEqual(run(repoOn('some-task'), 'src/SESSION_HANDOFF.md', { ALLOW_HANDOFF_EDIT: '1' }).status, 0);
});

test('ideas ledger and archive are blocked on a feature branch too, allowed on main and ledger', () => {
  for (const f of ['src/IDEAS.md', 'src/HANDOFF_ARCHIVE.md']) {
    const r = run(repoOn('some-task'), f);
    assert.strictEqual(r.status, 2);
    assert.match(r.stderr, /ledger/);
    assert.strictEqual(run(repoOn('main'), f).status, 0);
    assert.strictEqual(run(repoOn('ledger'), f).status, 0);
  }
  assert.strictEqual(run(repoOn('ledger'), 'src/SESSION_HANDOFF.md').status, 0);
});

test('notes files and other files are never blocked', () => {
  const dir = repoOn('some-task');
  assert.strictEqual(run(dir, 'src/handoffs/some-task.md').status, 0);
  assert.strictEqual(run(dir, 'src/engine.js').status, 0);
});
