// Retry with backoff for the ESPN collectors (#136, 2026-10-25)
const test = require('node:test'), assert = require('node:assert');
const load = () => import('../../collect/espn_fetch.mjs');
const res = (status, body = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const seq = (...rs) => { const calls = []; const f = async () => { calls.push(1); const r = rs[Math.min(calls.length - 1, rs.length - 1)]; if (r instanceof Error) throw r; return r; }; f.calls = calls; return f; };
const opts = f => ({ fetchImpl: f, sleep: async ms => { opts.slept.push(ms); }, retries: 3, baseMs: 100 });
opts.slept = [];

test('retries 429, 403 and 5xx with doubling waits, then returns the body', async () => {
  const { fetchJsonRetry } = await load(); opts.slept = [];
  const f = seq(res(429), res(503), res(403), res(200, { ok: 1 }));
  assert.deepStrictEqual(await fetchJsonRetry('u', opts(f)), { ok: 1 });
  assert.strictEqual(f.calls.length, 4);
  assert.deepStrictEqual(opts.slept, [100, 200, 400]);
});

test('retries a network error too', async () => {
  const { fetchJsonRetry } = await load(); opts.slept = [];
  const f = seq(new Error('reset'), res(200, { a: 2 }));
  assert.deepStrictEqual(await fetchJsonRetry('u', opts(f)), { a: 2 });
});

test('gives up after the retries with the last status', async () => {
  const { fetchJsonRetry } = await load(); opts.slept = [];
  const f = seq(res(500));
  await assert.rejects(fetchJsonRetry('u', opts(f)), /HTTP 500/);
  assert.strictEqual(f.calls.length, 4);
});

test('does not retry a 404', async () => {
  const { fetchJsonRetry } = await load(); opts.slept = [];
  const f = seq(res(404));
  await assert.rejects(fetchJsonRetry('u', opts(f)), /HTTP 404/);
  assert.strictEqual(f.calls.length, 1);
});
