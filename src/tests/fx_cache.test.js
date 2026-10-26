const test = require('node:test'), assert = require('node:assert');
const FX = require('../fx_cache.js');

const mem = (opts = {}) => {
  const d = {};
  return { d, get: k => (k in d ? d[k] : null), set: (k, v) => { if (opts.full) throw new Error('QuotaExceededError'); d[k] = v; }, remove: k => { delete d[k]; }, keys: () => Object.keys(d) };
};
const fake = (answers, log = []) => async (what, id) => { log.push(what + ':' + (id || '')); const a = answers[what]; if (a instanceof Error) throw a; return a; };
const H = (out = {}) => ({ onCached: (b, at) => { out.cached = { b, at }; }, onFresh: (b, at, ch) => { out.fresh = { b, at, ch }; }, onError: (e, had) => { out.err = { e, had }; } });

test('no cache: fetches all three in parallel, calls onFresh once as changed, never onCached', async () => {
  const st = mem(), log = [], out = {};
  const c = FX.create({ storage: st, fetcher: fake({ league: { a: 1 }, rosters: { b: 2 }, players: { c: 3 } }, log), now: () => 1000 });
  await c.swr([['league', 'L1'], ['rosters', 'L1'], ['players']], H(out));
  assert.deepStrictEqual(log, ['league:L1', 'rosters:L1', 'players:']);
  assert.strictEqual(out.cached, undefined);
  assert.deepStrictEqual(out.fresh, { b: [{ a: 1 }, { b: 2 }, { c: 3 }], at: 1000, ch: true });
});

test('everything cached: onCached comes first with the stored bodies, then onFresh unchanged', async () => {
  const st = mem(), out = {}, order = [];
  const ans = { league: { a: 1 }, rosters: { b: 2 } };
  await FX.create({ storage: st, fetcher: fake(ans), now: () => 1000 }).swr([['league', 'L1'], ['rosters', 'L1']], H());
  const c = FX.create({ storage: st, fetcher: fake(ans), now: () => 5000 });
  await c.swr([['league', 'L1'], ['rosters', 'L1']], { onCached: (b, at) => { order.push('c'); out.cached = { b, at }; }, onFresh: (b, at, ch) => { order.push('f'); out.fresh = { at, ch }; }, onError() { order.push('e'); } });
  assert.deepStrictEqual(order, ['c', 'f']);
  assert.deepStrictEqual(out.cached, { b: [{ a: 1 }, { b: 2 }], at: 1000 });   // at = when the oldest piece was fetched
  assert.deepStrictEqual(out.fresh, { at: 5000, ch: false });
});

test('fresh data that differs is reported as changed and replaces the cache', async () => {
  const st = mem(), out = {};
  await FX.create({ storage: st, fetcher: fake({ rosters: { n: 1 } }), now: () => 1 }).swr([['rosters', 'L1']], H());
  await FX.create({ storage: st, fetcher: fake({ rosters: { n: 2 } }), now: () => 2 }).swr([['rosters', 'L1']], H(out));
  assert.strictEqual(out.fresh.ch, true);
  assert.deepStrictEqual(FX.create({ storage: st, fetcher: fake({}), now: () => 3 }).peek('rosters', 'L1').body, { n: 2 });
});

test('changed compares with what the page drew, not with what another tab saved meanwhile', async () => {
  const st = mem(), out = {};
  await FX.create({ storage: st, fetcher: fake({ rosters: { n: 1 } }), now: () => 1 }).swr([['rosters', 'L1']], H());
  const other = async () => { st.d['courtside-fx-v1:rosters:L1'] = JSON.stringify({ at: 2, json: JSON.stringify({ n: 2 }) }); return { n: 2 }; };   // another tab saves the new answer first
  await FX.create({ storage: st, fetcher: other, now: () => 3 }).swr([['rosters', 'L1']], H(out));
  assert.strictEqual(out.fresh.ch, true);
});

test('a failed refresh keeps the cached copy and reports the error with had=true', async () => {
  const st = mem(), out = {};
  await FX.create({ storage: st, fetcher: fake({ league: { a: 1 } }), now: () => 1 }).swr([['league', 'L1']], H());
  const boom = new Error('offline');
  const c = FX.create({ storage: st, fetcher: fake({ league: boom }), now: () => 2 });
  await c.swr([['league', 'L1']], H(out));
  assert.strictEqual(out.err.e, boom); assert.strictEqual(out.err.had, true); assert.strictEqual(out.fresh, undefined);
  assert.deepStrictEqual(c.peek('league', 'L1').body, { a: 1 });
});

test('a failed fetch with nothing cached reports had=false', async () => {
  const out = {};
  await FX.create({ storage: mem(), fetcher: fake({ league: new Error('nohost') }) }).swr([['league', 'L1']], H(out));
  assert.strictEqual(out.err.had, false); assert.strictEqual(out.err.e.message, 'nohost');
});

test('entries past their maximum age are never shown (a day; players a week)', async () => {
  const st = mem(), DAY = 864e5, ans = { league: { a: 1 }, players: { p: 1 } };
  await FX.create({ storage: st, fetcher: fake(ans), now: () => 0 }).swr([['league', 'L1'], ['players']], H());
  const c = FX.create({ storage: st, fetcher: fake({}), now: () => 2 * DAY });
  assert.strictEqual(c.peek('league', 'L1'), null);
  assert.deepStrictEqual(c.peek('players').body, { p: 1 });
  assert.strictEqual(FX.create({ storage: st, fetcher: fake({}), now: () => 8 * DAY }).peek('players'), null);
});

test('one missing piece means no onCached (a half-cached page would be wrong)', async () => {
  const st = mem(), out = {};
  await FX.create({ storage: st, fetcher: fake({ league: { a: 1 } }), now: () => 1 }).swr([['league', 'L1']], H());
  await FX.create({ storage: st, fetcher: fake({ league: { a: 1 }, rosters: { b: 2 } }), now: () => 2 }).swr([['league', 'L1'], ['rosters', 'L1']], H(out));
  assert.strictEqual(out.cached, undefined); assert.strictEqual(out.fresh.ch, true);
});

test('entries are per league; saving another league drops the old one of the same kind', async () => {
  const st = mem(), ans = { rosters: { r: 1 } };
  const c = FX.create({ storage: st, fetcher: fake(ans), now: () => 1 });
  await c.swr([['rosters', 'L1']], H()); await c.swr([['rosters', 'L2']], H());
  assert.strictEqual(c.peek('rosters', 'L1'), null);
  assert.deepStrictEqual(c.peek('rosters', 'L2').body, { r: 1 });
});

test('a full storage is ignored: the page still gets fresh data', async () => {
  const out = {};
  await FX.create({ storage: mem({ full: true }), fetcher: fake({ league: { a: 1 } }), now: () => 1 }).swr([['league', 'L1']], H(out));
  assert.deepStrictEqual(out.fresh.b, [{ a: 1 }]); assert.strictEqual(out.err, undefined);
});

test('corrupt or foreign-format entries read as missing', () => {
  const st = mem(); st.d['courtside-fx-v1:league:L1'] = '{not json'; st.d['courtside-fx-v1:rosters:L1'] = JSON.stringify({ at: 'x', json: 5 });
  const c = FX.create({ storage: st, fetcher: fake({}) });
  assert.strictEqual(c.peek('league', 'L1'), null); assert.strictEqual(c.peek('rosters', 'L1'), null);
});

test('draft data is never cached', async () => {
  const st = mem(), log = [], c = FX.create({ storage: st, fetcher: fake({ draft: { k: 1 } }, log), now: () => 1 });
  assert.deepStrictEqual(await c.live('draft', 'L1'), { k: 1 });
  assert.deepStrictEqual(st.keys(), []); assert.strictEqual(c.peek('draft', 'L1'), null);
});

// fxFetch keeps the error rules of the old per-page fxGet
const resp = (status, body, type = 'application/json') => ({ status, ok: status >= 200 && status < 300, headers: { get: () => type }, json: async () => { if (body === undefined) throw new Error('bad'); return body; } });
test('fxFetch: same errors as the old fxGet', async () => {
  const f = (r) => FX.fxFetch('league', 'L1', async () => { if (r instanceof Error) throw r; return r; });
  assert.deepStrictEqual(await f(resp(200, { x: 1 })), { x: 1 });
  await assert.rejects(f(new Error('net')), /offline/);
  await assert.rejects(f(resp(200, { x: 1 }, 'text/html')), /nohost/);
  await assert.rejects(f(resp(200, undefined)), /nohost/);
  await assert.rejects(f(resp(404, {})), /nohost/);
  await assert.rejects(f(resp(429, { error: 'slow' })), e => e.message === 'slow' && e.status === 429);
  await assert.rejects(f(resp(500, {})), e => e.message === 'Fantrax answered 500' && e.status === 500);
});
test('fxFetch hands the response to onResponse after a good answer (the Worker\'s age header)', async () => {
  const seen = [];
  await FX.fxFetch('league', 'L1', async () => resp(200, { x: 1 }), r => seen.push(r.status));
  await assert.rejects(FX.fxFetch('league', 'L1', async () => resp(500, {}), r => seen.push(r.status)));
  assert.deepStrictEqual(seen, [200]);
});
test('fxFetch builds the same URL as before', async () => {
  const urls = [];
  await FX.fxFetch('rosters', 'a b', async (u, o) => { urls.push([u, o.cache]); return resp(200, {}); });
  await FX.fxFetch('players', null, async (u) => { urls.push(u); return resp(200, {}); });
  assert.deepStrictEqual(urls, [['api/fantrax?what=rosters&leagueId=a%20b', 'no-store'], 'api/fantrax?what=players']);
});
