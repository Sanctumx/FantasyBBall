// In-season league calendar, Fantrax parsing and daily schedule (2026-10-20)
const test = require('node:test'), assert = require('node:assert');
const I = require('../inseason_league.js');
const fx = n => require('./fixtures/' + n), SCHED = require('../sched.json'), DAYS = require('../sched_days.json');
const L = I.parseLeague(fx('fx_league.json'));
const HOUR = 3600e3, DAY = 24 * HOUR;

test('parseFxDate reads Fantrax offsets', () => {
  assert.strictEqual(I.parseFxDate('2026-10-26T19:00:00.0-0400'), Date.UTC(2026, 9, 26, 23));
  assert.strictEqual(I.parseFxDate('2026-11-02T18:59:59.0-0500'), Date.UTC(2026, 10, 2, 23, 59, 59));
  assert.strictEqual(I.parseFxDate('2026-10-20T15:00:00+0000'), Date.UTC(2026, 9, 20, 15));
});

test('league shape', () => {
  assert.strictEqual(L.teams.length, 14);
  assert.strictEqual(L.periods.length, 20);
  const p7 = L.periods.find(p => p.n === 7);
  assert.strictEqual(p7.end - p7.start, 14 * DAY);
  assert.strictEqual(L.lastRegular, 15);   // matchups 16+ are playoff seeds / TBD although Fantrax states 17
  assert.strictEqual(L.statedLastRegular, 17);
  assert.deepStrictEqual(Object.keys(L.matchups).map(Number).sort((a, b) => a - b), Array.from({ length: 15 }, (_, i) => i + 1));
  for (const n of Object.keys(L.matchups)) assert.strictEqual(L.matchups[n].length, 7);
  assert.strictEqual(L.maxActive, 10);
  assert.strictEqual(L.maxPlayers, 12);
  assert.strictEqual(L.season, 2026);
  assert.ok(Object.values(L.fxStatus).includes('FA') && Object.values(L.fxStatus).includes('T'));
});

test('rosters and standings parse', () => {
  const R = I.parseRosters(fx('fx_rosters.json'));
  assert.strictEqual(Object.keys(R).length, 14);
  assert.strictEqual(Object.values(R).reduce((a, r) => a + r.length, 0), 178);
  assert.strictEqual(Object.values(R).reduce((a, r) => a + r.filter(x => x.slot === 'IR').length, 0), 11);
  assert.ok(Object.values(R).every(r => r.every(x => ['ACTIVE', 'RESERVE', 'IR'].includes(x.slot))));
  const S = I.parseStandings(fx('fx_standings.json'));
  assert.strictEqual(Object.keys(S).length, 14);
  assert.strictEqual(S[Object.keys(S)[0]].record, '0-0-0');
});

test('current period', () => {
  assert.strictEqual(I.currentPeriod(L, Date.UTC(2026, 9, 21)), 1);
  assert.strictEqual(I.currentPeriod(L, Date.UTC(2026, 9, 1)), 1);
  assert.strictEqual(I.currentPeriod(L, Date.UTC(2026, 11, 5)), 7);
  assert.strictEqual(I.currentPeriod(L, Date.UTC(2027, 2, 10)), null);
});

test('opponents are mutual and unique each regular period', () => {
  const ids = L.teams.map(t => t.id);
  for (let n = 1; n <= L.lastRegular; n++) {
    const seen = new Set();
    for (const id of ids) {
      const o = I.opponentOf(L, id, n);
      assert.ok(o && o !== id, 'period ' + n);
      assert.strictEqual(I.opponentOf(L, o, n), id);
      seen.add(id);
    }
    assert.strictEqual(seen.size, 14);
  }
  assert.strictEqual(I.opponentOf(L, L.teams[0].id, 16), null);
  assert.deepStrictEqual(I.regularFrom(L, 13), [13, 14, 15]);
});

test('every Fantrax team code maps to a sched.json team', () => {
  const codes = new Set(Object.values(fx('fx_players.json')).map(p => p.team));
  for (const c of codes) {
    const m = I.toProjTeam(c);
    if (c === '(N/A)' || c === 'FA' || c === '') { assert.strictEqual(m, ''); continue; }
    assert.ok(SCHED.games[m], 'Fantrax code ' + c + ' -> ' + m);
  }
  assert.deepStrictEqual(['GS', 'NO', 'NOP', 'NY', 'SA', 'PHX', 'UTAH', 'WSH'].map(I.toProjTeam), ['GSW', 'NOR', 'NOR', 'NYK', 'SAS', 'PHO', 'UTA', 'WAS']);
});

test('sched_days agrees with sched.json', () => {
  const dayOf = ms => I.localDay(ms);
  for (const t of Object.keys(SCHED.games)) {
    const g = DAYS.games[t].map(s => s * 1000);
    assert.strictEqual(g.length, SCHED.games[t].reduce((a, b) => a + b, 0), t + ' season total');
    let all = 0;
    for (const p of L.periods) {
      const n = g.filter(ms => ms >= p.start && ms < p.end).length; all += n;
      const from = dayOf(p.start), to = dayOf(p.end);
      const weeks = SCHED.weeks.map((w, i) => [w, SCHED.games[t][i]]).filter(([w]) => w >= from && w < to).reduce((a, [, c]) => a + c, 0);
      assert.ok(Math.abs(n - weeks) <= 1, `${t} period ${p.n}: ${n} vs ${weeks}`);
    }
    assert.strictEqual(all, g.length, t + ' every game is inside a period');
  }
});

test('rosterGames applies availability and the daily cap', () => {
  const T0 = Date.UTC(2026, 10, 2, 1);   // 2026-11-01 19:00 local
  const tips = [0, 1, 3].map(d => (T0 + d * DAY) / 1000);   // games on three local days
  const D = { games: { AAA: tips, BBB: [] } };
  const win = [T0 - HOUR, T0 + 7 * DAY];
  const e = a => ({ t: 'AAA', a, from: win[0], to: win[1] });
  assert.deepStrictEqual(I.rosterGames([e(1), e(1)], D, 10), [3, 3]);
  assert.deepStrictEqual(I.rosterGames([e(0.5)], D, 10), [1.5]);
  const twelve = Array.from({ length: 12 }, () => ({ t: 'AAA', a: 1, from: T0 - HOUR, to: T0 + HOUR }));
  I.rosterGames(twelve, D, 10).forEach(g => assert.ok(Math.abs(g - 10 / 12) < 1e-12));
  assert.deepStrictEqual(I.rosterGames([{ t: 'AAA', a: 1, from: T0 + 4 * DAY, to: T0 + 6 * DAY }, { t: 'BBB', a: 1, from: win[0], to: win[1] }], D, 10), [0, 0]);
});

test('local day is UTC minus six hours', () => {
  assert.strictEqual(I.localDay(Date.UTC(2026, 9, 21, 5, 59)), '2026-10-20');
  assert.strictEqual(I.localDay(Date.UTC(2026, 9, 21, 6, 0)), '2026-10-21');
  assert.strictEqual(I.dayStart('2026-10-21'), Date.UTC(2026, 9, 21, 6));
  assert.strictEqual(I.nextDayStart(Date.UTC(2026, 9, 21, 12)), Date.UTC(2026, 9, 22, 6));
});

test('every ESPN team code maps to a sched.json team', () => {
  const codes = new Set(require('./fixtures/espn_2025_26.json').players.map(p => p.t));
  assert.ok(codes.size >= 30);
  for (const c of codes) assert.ok(SCHED.games[I.toProjTeam(c)], 'ESPN code ' + c);
});
