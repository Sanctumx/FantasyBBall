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
  const reply = t => JSON.stringify({ message: { usage: { input_tokens: 10, cache_read_input_tokens: t - 10, cache_creation_input_tokens: 0 } } });
  fs.writeFileSync(log, reply(35000) + '\n' + reply(tokens) + '\n' + logExtra);
  const input = { transcript_path: log, session_id: 'test-' + path.basename(dir), ...extra };
  const r = spawnSync('node', [path.join(hooks, hook)], { input: JSON.stringify(input), encoding: 'utf8' });
  return { out: r.stdout.trim() ? JSON.parse(r.stdout) : null, input };
}

test('warn hook is silent below the break threshold', () => {
  assert.strictEqual(run('context-warn.mjs', 90000).out, null);
});

test('warn hook tells you and Claude past the break threshold', () => {
  const { out } = run('context-warn.mjs', 110000);
  assert.match(out.systemMessage, /finish this task/);
  assert.match(out.hookSpecificOutput.additionalContext, /Do not autorun/);
});

test('warn hook says stop past the stop threshold', () => {
  const { out } = run('context-warn.mjs', 320000);
  assert.match(out.hookSpecificOutput.additionalContext, /do not start another task/);
});

test('stop hook is silent below the threshold', () => {
  assert.strictEqual(run('context-stop.mjs', 90000).out, null);
});

test('stop hook blocks once past the threshold, then lets go', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxhook-'));
  const log = path.join(dir, 'log.jsonl');
  const reply = t => JSON.stringify({ message: { usage: { input_tokens: 1, cache_read_input_tokens: t - 1 } } });
  fs.writeFileSync(log, reply(35000) + '\n' + reply(160000) + '\n');
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

function runSeries(hook, totals, env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxhook-'));
  const log = path.join(dir, 'log.jsonl');
  fs.writeFileSync(log, totals.map(t => JSON.stringify({ message: { usage: { input_tokens: 1, cache_read_input_tokens: t - 1 } } })).join('\n') + '\n');
  const input = JSON.stringify({ transcript_path: log, session_id: 'series-' + path.basename(dir) });
  const r = spawnSync('node', [path.join(hooks, hook)], { input, encoding: 'utf8', env: { ...process.env, CTX_BASELINE: '', ...env } });
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
}

test('baseline is read from the session: a big start-up cost does not trigger the warning early', () => {
  assert.strictEqual(runSeries('context-warn.mjs', [95000, 140000]), null);
});

test('baseline follows the smallest total, so a compacted session still warns on time', () => {
  assert.match(runSeries('context-warn.mjs', [95000, 50000, 120000]).systemMessage, /finish this task/);
});

test('CTX_BASELINE overrides the measured baseline', () => {
  assert.match(runSeries('context-warn.mjs', [95000, 110000], { CTX_BASELINE: '35000' }).systemMessage, /finish this task/);
});

test('a session with a single reply never warns', () => {
  assert.strictEqual(runSeries('context-warn.mjs', [300000]), null);
});
