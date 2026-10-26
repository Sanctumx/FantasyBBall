const test = require('node:test'), assert = require('node:assert'), path = require('node:path'), { spawnSync } = require('node:child_process');
const HOOK = path.join(__dirname, '..', '..', '.claude', 'hooks', 'before-bash.mjs');
const run = command => spawnSync('node', [HOOK], { input: JSON.stringify({ tool_input: { command } }), encoding: 'utf8' }).status;

test('before-bash blocks the commands that raise permission prompts', () => {
  ['cd src && ls', 'git status; cd ../x', 'sed -i s/a/b/ f.js', 'sed -n 1p f && sed --in-place s/a/b/ f',
    "cat > f.txt <<'EOF'\nhi\nEOF", "python - <<'EOF'\nopen('f','w').write('x')\nEOF", "node - <<'EOF'\nrequire('fs').writeFileSync('f','x')\nEOF",
  ].forEach(c => assert.strictEqual(run(c), 2, c));
});

test('before-bash lets ordinary and read-only commands through', () => {
  ['git status', 'git -C ../x log --oneline', 'node --test src/tests/*.test.js', "node -e \"console.log(1)\"", 'sed -n 1,5p src/a.js',
    "node - <<'EOF'\nconsole.log(require('./a.json').length)\nEOF", 'echo "cd is a word"',
  ].forEach(c => assert.strictEqual(run(c), 0, c));
});

test('before-bash ignores a blocked pattern named inside a commit message, but not one chained after it', () => {
  assert.strictEqual(run('git commit -m "chore: hook blocks cd prefixes and sed -i"'), 0);
  assert.strictEqual(run("git commit -m \"$(cat <<'EOF'\nfix: no sed -i, no cd src && x\nEOF\n)\""), 0);
  assert.strictEqual(run('git commit -m "x" && cd src && ls'), 2);
});
