const test = require('node:test'), assert = require('node:assert'), path = require('node:path'), { spawnSync } = require('node:child_process');
const HOOK = path.join(__dirname, '..', '..', '..', '.claude', 'hooks', 'guard-ask.mjs');
const run = command => {
  const r = spawnSync('node', [HOOK], { input: JSON.stringify({ tool_input: { command } }), encoding: 'utf8' });
  assert.strictEqual(r.status, 0, command);
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : null;
};

test('guard-ask forces a prompt on push, merge and delete', () => {
  ['git push', 'git push -u origin x', 'git -C ../x push origin main', 'git status && git push', 'gh pr merge 5 --merge',
    'gh api repos/a/b/pulls/5/merge -X PUT', 'rm -rf build', 'ls; rm x', 'git branch -d x', 'git branch -D x', 'git worktree remove ../w',
    'Remove-Item -Recurse foo',
  ].forEach(c => assert.strictEqual(run(c), 'ask', c));
});

test('guard-ask stays silent for ordinary commands and for words inside a commit message', () => {
  ['git status', 'git pull --ff-only', 'git branch', 'git worktree add ../w', 'node --test src/tests/', 'ls src/rm-notes', 'echo format',
    'git commit -m "docs: ask before git push and rm"',
  ].forEach(c => assert.strictEqual(run(c), null, c));
});
