const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const hooks = path.join(__dirname, '..', '..', '.claude', 'hooks');

function run(hook, tokens, extra = {}, logExtra = '') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxhook-'));
  const log = path.join(dir, 'log.jsonl');
  const usage = { message: { usage: { input_tokens: 10, cache_read_input_tokens: tokens, cache_creation_input_tokens: 0 } } };
  fs.writeFileSync(log, JSON.stringify(usage) + '\n' + logExtra);
  const input = { transcript_path: log, session_id: 'test-' + path.basename(dir), ...extra };
  const r = spawnSync('node', [path.join(hooks, hook)], { input: JSON.stringify(input), encoding: 'utf8' });
  return { out: r.stdout.trim() ? JSON.parse(r.stdout) : null, input };
}

test('warn hook is silent below the break threshold', () => {
  assert.strictEqual(run('context-warn.mjs', 100000).out, null);
});

test('warn hook tells you and Claude past the break threshold', () => {
  const { out } = run('context-warn.mjs', 160000);
  assert.match(out.systemMessage, /finish this task/);
  assert.match(out.hookSpecificOutput.additionalContext, /Do not autorun/);
});

test('warn hook says stop past the stop threshold', () => {
  const { out } = run('context-warn.mjs', 320000);
  assert.match(out.hookSpecificOutput.additionalContext, /do not start another task/);
});

test('stop hook is silent below the threshold', () => {
  assert.strictEqual(run('context-stop.mjs', 100000).out, null);
});

test('stop hook blocks once past the threshold, then lets go', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxhook-'));
  const log = path.join(dir, 'log.jsonl');
  fs.writeFileSync(log, JSON.stringify({ message: { usage: { input_tokens: 1, cache_read_input_tokens: 160000 } } }) + '\n');
  const input = JSON.stringify({ transcript_path: log, session_id: 'once-' + path.basename(dir) });
  const go = () => spawnSync('node', [path.join(hooks, 'context-stop.mjs')], { input, encoding: 'utf8' }).stdout.trim();
  assert.strictEqual(JSON.parse(go()).decision, 'block');
  assert.strictEqual(go(), '');
});

test('stop hook does not loop when a stop hook is already active', () => {
  assert.strictEqual(run('context-stop.mjs', 160000, { stop_hook_active: true }).out, null);
});

test('stop hook skips when a handoff was already run', () => {
  const typed = JSON.stringify({ message: { content: '<command-name>/handoff</command-name>' } }) + '\n';
  assert.strictEqual(run('context-stop.mjs', 160000, {}, typed).out, null);
});
