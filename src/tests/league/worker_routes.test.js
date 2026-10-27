const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { pathToFileURL } = require('url');

// The Worker is an ES module with no package.json beside it, so load a copy as .mjs.
const tmp = path.join(os.tmpdir(), `worker-${process.pid}.mjs`);
fs.copyFileSync(path.join(__dirname, '..', '..', '..', 'worker', 'index.js'), tmp);
const seen = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async url => { seen.push(String(url)); return new Response('{"rosters":{}}'); };
test.after(() => { globalThis.fetch = realFetch; try { fs.unlinkSync(tmp); } catch {} });

const load = () => import(pathToFileURL(tmp).href).then(m => m.default);
const call = async (qs) => (await load()).fetch(new Request('https://x/api/fantrax?' + qs), {}, { waitUntil() {} });

test('rosters route calls getTeamRosters and caches 60 s', async () => {
  const res = await call('what=rosters&leagueId=rostersleague1');
  assert.strictEqual(seen.at(-1), 'https://www.fantrax.com/fxea/general/getTeamRosters?leagueId=rostersleague1');
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('cache-control'), /max-age=60/);
});

test('standings route calls getStandings', async () => {
  const res = await call('what=standings&leagueId=standingsleague1');
  assert.strictEqual(seen.at(-1), 'https://www.fantrax.com/fxea/general/getStandings?leagueId=standingsleague1');
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('cache-control'), /max-age=300/);
});

test('unknown what lists the new values', async () => {
  const res = await call('what=nope&leagueId=abcd1234');
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /rosters/);
  assert.match(body.error, /standings/);
});

test('a stale answer served because Fantrax failed carries x-courtside-age; a fresh one does not', async () => {
  const fresh = await call('what=rosters&leagueId=staleleague1');
  assert.strictEqual(fresh.headers.get('x-courtside-age'), null);
  const nowReal = Date.now, f = globalThis.fetch;
  Date.now = () => nowReal() + 300 * 1000; globalThis.fetch = async () => { throw new Error('down'); };
  try {
    const res = await call('what=rosters&leagueId=staleleague1');
    assert.strictEqual(res.status, 200);
    assert.ok(+res.headers.get('x-courtside-age') >= 299);
  } finally { Date.now = nowReal; globalThis.fetch = f; }
});
