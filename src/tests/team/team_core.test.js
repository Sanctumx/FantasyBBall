// Team tab core: preview roster state and swaps (#131, 2026-10-25)
const test = require('node:test'), assert = require('node:assert');
const I = require('../../inseason_league.js'), T = require('../../team_core.js');
const fx = n => require('../fixtures/' + n);
const L = I.parseLeague(fx('fx_league.json')), ROS = I.parseRosters(fx('fx_rosters.json'));
const me = L.teams[0].id, other = L.teams[1].id;
const snap = JSON.stringify(ROS);

test('initState maps Fantrax slots: ACTIVE to active, RESERVE to reserve, IR to il', () => {
  const s = T.initState(ROS[me]);
  assert.strictEqual(s.order.length, ROS[me].length);
  ROS[me].forEach(x => assert.strictEqual(s.slots[x.fid], { ACTIVE: 'active', RESERVE: 'reserve', IR: 'il' }[x.slot]));
});

test('moveSlot returns a new state and accepts the three slots; there is no bench', () => {
  const s = T.initState(ROS[me]), k = s.order[0], n = T.moveSlot(s, k, 'reserve');
  assert.strictEqual(n.slots[k], 'reserve');
  assert.notStrictEqual(n, s);
  assert.notStrictEqual(s.slots[k], 'reserve');
  assert.throws(() => T.moveSlot(s, 'nope', 'reserve'));
  assert.throws(() => T.moveSlot(s, k, 'bench'));
  assert.throws(() => T.moveSlot(s, k, 'elsewhere'));
});

test('applySwap: 2-for-1 removes the outgoing players, adds the incoming one to the reserve, and leaves the saved roster alone', () => {
  const s = T.initState(ROS[me]), outK = s.order.slice(0, 2), inK = ROS[other][0].fid;
  const n = T.applySwap(s, outK, [inK]);
  assert.strictEqual(n.order.length, s.order.length - 1);
  outK.forEach(k => assert.ok(!(k in n.slots)));
  assert.strictEqual(n.slots[inK], 'reserve');
  assert.strictEqual(JSON.stringify(ROS), snap);
  assert.strictEqual(s.order.length, ROS[me].length);
});

test('applySwap throws on an unknown outgoing key, a duplicate, or an incoming player already on the roster', () => {
  const s = T.initState(ROS[me]), inK = ROS[other][0].fid;
  assert.throws(() => T.applySwap(s, ['nope'], [inK]));
  assert.throws(() => T.applySwap(s, [s.order[0]], [inK, inK]));
  assert.throws(() => T.applySwap(s, [s.order[0]], [s.order[1]]));
});

test('window runs from now to the end of the last regular period; gamesLeft counts a team\'s tip-offs in it', () => {
  const lg = { lastRegular: 2, periods: [{ n: 1, start: 0, end: 1000 * 100 }, { n: 2, start: 1000 * 100, end: 1000 * 200 }, { n: 3, start: 1000 * 200, end: 1000 * 300 }] };
  const ctx = { L: lg, nowMs: 1000 * 50, DAYS: { games: { AAA: [10, 50, 60, 150, 199, 200, 250], BBB: [] } } };
  assert.deepStrictEqual(T.window(ctx), { from: 1000 * 50, to: 1000 * 200 });
  assert.strictEqual(T.gamesLeft(ctx, 'AAA'), 4);   // 50 (now counts), 60, 150, 199; 200 is the end, 250 is playoffs, 10 is past
  assert.strictEqual(T.gamesLeft(ctx, 'BBB'), 0);
  assert.strictEqual(T.gamesLeft(ctx, 'ZZZ'), 0);
});

// Plays %: real fixture players, hand-built schedule (every team plays once, the same night)
const Pl = require('../../inseason_players.js'), M = require('../../matchup_core.js'), PLAYERS = require('../../players.json');
const pool = Pl.buildPool({ PLAYERS, fxPlayers: fx('fx_players.json'), espn: fx('espn_2025_26.json'), L, rosters: ROS });
const NOW = Date.UTC(2026, 9, 21, 12), NIGHT = Math.floor(Date.UTC(2026, 9, 23, 2) / 1000);
const oneNight = keys => { const g = {}; keys.forEach(k => { g[pool.byKey.get(k).t] = [NIGHT]; }); return { games: g }; };
const mkCtx = keys => M.makeCtx({ L, pool, DAYS: oneNight(keys), rosters: ROS, me, nowMs: NOW });
const stateOf = (act, reserve, il) => ({ order: [].concat(act, reserve, il || []), slots: Object.assign({}, ...act.map(k => ({ [k]: 'active' })), ...reserve.map(k => ({ [k]: 'reserve' })), ...(il || []).map(k => ({ [k]: 'il' }))) });
const valueOf = (ctx, k) => Pl.valueZ(pool.byKey.get(k).line, 82, ctx.ref);

test('Plays %: 12 active players with a game on a 10-slot night, the two lowest per-game values sit', () => {
  const keys = ROS[me].map(x => x.fid).slice(0, 12), ctx = mkCtx(keys), r = T.playsPct(ctx, stateOf(keys, []));
  const sorted = keys.slice().sort((a, b) => valueOf(ctx, b) - valueOf(ctx, a));
  sorted.slice(0, 10).forEach(k => assert.strictEqual(r[k].pct, 1, k));
  sorted.slice(10).forEach(k => assert.strictEqual(r[k].pct, 0, k));
  keys.forEach(k => assert.strictEqual(r[k].gl, 1));
});

test('Plays %: reserve players get the slots the active players leave open; IL rows show what they would get as one more reserve player', () => {
  const keys = ROS[me].map(x => x.fid).slice(0, 12), ctx = mkCtx(keys);
  const full = T.playsPct(ctx, stateOf(keys.slice(0, 10), keys.slice(10, 12)));   // 10 active use every slot
  keys.slice(10).forEach(k => assert.strictEqual(full[k].pct, 0));
  const open = T.playsPct(ctx, stateOf(keys.slice(0, 8), keys.slice(8, 10), [keys[10]]));   // 8 active leave 2 slots
  keys.slice(8, 10).forEach(k => assert.strictEqual(open[k].pct, 1));
  assert.ok(!open[keys[8]].hypo && open[keys[10]].hypo);
  // IL player + the 2 reserve players compete for the 2 open slots: the two best per-game values play
  const top2 = new Set(keys.slice(8, 11).sort((a, b) => valueOf(ctx, b) - valueOf(ctx, a)).slice(0, 2));
  assert.strictEqual(open[keys[10]].pct, top2.has(keys[10]) ? 1 : 0);
  const lone = T.playsPct(ctx, stateOf(keys.slice(0, 8), [], [keys[10]]));
  assert.strictEqual(lone[keys[10]].pct, 1);
});

// Team-tab Plays % (2026-10-26): Reserve is a parking place (0%, no nights), IL gets games only on the seasonal bases
const tabCtx = (keys, basis) => Object.assign(mkCtx(keys), { teamTab: true, basis });
const gOf = k => pool.byKey.get(k).g, near = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;

test('Team-tab Plays %: a Reserve player takes no nights and shows 0%; adding one changes nobody else\'s games', () => {
  const keys = ROS[me].map(x => x.fid).slice(0, 12);
  for (const basis of ['pergame', 'total']) {
    const ctx = tabCtx(keys, basis), a = T.playsPct(ctx, stateOf(keys.slice(0, 8), [])), b = T.playsPct(ctx, stateOf(keys.slice(0, 8), keys.slice(8, 12)));
    keys.slice(8).forEach(k => { assert.deepStrictEqual([b[k].played, b[k].pct, !!b[k].hypo], [0, 0, false], basis + k); });
    keys.slice(0, 8).forEach(k => { assert.strictEqual(b[k].played, a[k].played, basis + k); assert.strictEqual(b[k].pct, a[k].pct, basis + k); });
  }
});

test('Team-tab Plays %: an IL player gets no games on Per game; on the seasonal basis he plays his availability share and is not hypo', () => {
  const keys = ROS[me].map(x => x.fid).slice(0, 5), il = keys[4], g = gOf(il), st = stateOf(keys.slice(0, 4), [], [il]);
  const per = T.playsPct(tabCtx(keys, 'pergame'), st), tot = T.playsPct(tabCtx(keys, 'total'), st);
  assert.deepStrictEqual([per[il].played, per[il].pct, !!per[il].hypo], [0, 0, false]);
  assert.ok(!tot[il].hypo && near(tot[il].played, Math.min(1, g / 82)), 'g ' + g);
  assert.ok(near(tot[il].pct, 1));   // Plays % is the lineup share of the games he is there for, so availability is not counted twice
  assert.strictEqual(T.playsPct(mkCtx(keys), st)[il].hypo, true);   // a plain ctx is as before
});

// IL timeline (2026-10-29, replaces the shared-slot pairs): an IL player is out for the first nOut games of his team's window, then plays at the
// league-wide typical availability (his projected games g/82 carry both his current absence and the generic chance of missing games later, so
// only the part of his missed games above a typical player's goes up front); his total stays avail x GL. After he is back everyone competes for
// the nightly slots, so whoever is worst by value loses nights then, not before.
const nightsOf = (keys, counts) => { const g = {}; keys.forEach((k, i) => { g[pool.byKey.get(k).t] = Array.from({ length: counts[i] }, (_, n) => NIGHT + n * 86400); }); return { games: g }; };
const timelineCtx = (keys, counts, basis) => Object.assign(M.makeCtx({ L, pool, DAYS: nightsOf(keys, counts), rosters: ROS, me, nowMs: NOW }), { teamTab: true, basis: basis || 'total' });
const withG = (k, g, fn) => { const pp = pool.byKey.get(k), was = pp.g; pp.g = g; try { return fn(); } finally { pp.g = was; } };

test('IL timeline: typicalAvail is the league-wide median availability of the rostered non-IL players', () => {
  const keys = ROS[me].map(x => x.fid).slice(0, 5), ctx = timelineCtx(keys, [10, 10, 10, 10, 10]);
  const own = pool.players.filter(p => p.owner && p.slot !== 'IR').map(p => T.avail(ctx, p)).sort((a, b) => a - b);
  assert.ok(near(T.typicalAvail(ctx), own[Math.floor((own.length - 1) / 2)] / 2 + own[Math.ceil((own.length - 1) / 2)] / 2));
  assert.strictEqual(T.typicalAvail(tabCtx(keys, 'pergame')), 1);
});

test('IL timeline: nOut games up front, the same total as his availability, and he is back at the typical rate', () => {
  const keys = ROS[me].map(x => x.fid).slice(0, 10), act = keys.slice(0, 9), il = keys[9], counts = new Array(10).fill(10);
  withG(il, 50, () => {
    const ctx = timelineCtx(keys, counts), a = T.avail(ctx, pool.byKey.get(il)), aT = T.typicalAvail(ctx), r = T.ilReturn(ctx, il);
    assert.ok(a < aT, 'fixture: below the typical player');
    assert.strictEqual(r.nOut, Math.round(10 * (1 - a / aT)));
    assert.ok(r.nOut > 0 && near(r.a * (10 - r.nOut), a * 10, 1e-9), 'total games kept');
    assert.strictEqual(r.tRet, (NIGHT + r.nOut * 86400) * 1000);
    const res = T.playsPct(ctx, stateOf(act, [], [il]));   // 9 active + IL = 10 = the nightly limit, so no night is capped
    assert.ok(near(res[il].played, a * 10, 1e-9) && near(res[il].played, T.soloGames(ctx, il), 1e-9));
  });
  // a player at or above the typical rate has no absence up front
  withG(il, 82, () => assert.strictEqual(T.ilReturn(timelineCtx(keys, counts), il).nOut, 0));
});

test('IL timeline: the cover plays his own games until the IL player is back, even when his team has fewer games left than the IL player\'s', () => {
  const keys = ROS[me].map(x => x.fid).slice(0, 11), act = keys.slice(0, 10), il = keys[10], counts = [6, 7, 8, 9, 10, 6, 7, 8, 9, 10, 10];
  withG(il, 40, () => {
    const ctx = timelineCtx(keys, counts), r = T.ilReturn(ctx, il), res = T.playsPct(ctx, stateOf(act, [], [il])), base = T.playsPct(ctx, stateOf(act, []));
    assert.ok(r.nOut >= 4, 'fixture: a long absence ' + r.nOut);
    act.forEach((k, i) => {
      const before = Math.min(counts[i], r.nOut);   // nights before his return: 10 active players fit the limit, so nobody is cut
      assert.ok(res[k].played >= before * T.avail(ctx, pool.byKey.get(k)) - 1e-9, k + ' keeps his games before the return');
      assert.ok(res[k].played > 0, k);
    });
    assert.ok(res[il].played > 0 && res[il].played <= T.soloGames(ctx, il) + 1e-9);
    // after he is back, whoever is worst by value gives up nights: nobody gains from the IL player being on the roster
    act.forEach(k => assert.ok(res[k].played <= base[k].played + 1e-9, k));
  });
});

test('IL timeline: with a roster limit, o.rank picks who is dropped when the IL player returns, not nightValue', () => {
  const keys = ROS[me].map(x => x.fid).slice(0, 13), act = keys.slice(0, 12), il = keys[12], counts = new Array(13).fill(10);
  withG(il, 40, () => {
    const ctx = timelineCtx(keys, counts), r = T.ilReturn(ctx, il), st = stateOf(act, [], [il]);   // 12 active + 1 IL > maxPlayers (12)
    const byValue = act.slice().sort((x, y) => valueOf(ctx, x) - valueOf(ctx, y)), best = byValue[byValue.length - 1], worst = byValue[0];
    const res = T.playsPct(ctx, st, { rank: k => (k === best ? -1 : 0) });
    assert.ok(r.nOut > 0 && r.nOut < 10);
    assert.strictEqual(res[best].drop, (NIGHT + r.nOut * 86400) * 1000, 'the lowest-ranked player leaves at the return');
    assert.ok(res[best].played <= T.avail(ctx, pool.byKey.get(best)) * r.nOut + 1e-9, 'only his games before it');
    assert.strictEqual(res[worst].drop, undefined, 'the lowest nightValue is not dropped when the rank says otherwise');
    // a protected (Infinity) player is never dropped, and ties in rank fall back to nightValue
    const res2 = T.playsPct(ctx, st, { rank: k => (k === worst || k === il ? Infinity : 0) });
    assert.strictEqual(res2[worst].drop, undefined);
    assert.strictEqual(Object.keys(res2).filter(k => res2[k].drop != null).length, 1);
    assert.throws(() => T.playsPct(ctx, st), /rank/, 'over the limit with no rank');
    assert.doesNotThrow(() => T.playsPct(ctx, stateOf(act.slice(0, 11), [], [il])), 'under the limit needs no rank');
  });
});

test('IL timeline: 12 Active + 2 IL with different returns: the j-th lowest-ranked drop leaves at the j-th return; a dropped IL player never plays', () => {
  const keys = ROS[me].map(x => x.fid).slice(0, 13).concat(ROS[other][0].fid), act = keys.slice(0, 12), il1 = keys[12], il2 = keys[13], counts = new Array(14).fill(10);
  withG(il1, 40, () => withG(il2, 55, () => {
    const ctx = timelineCtx(keys, counts), r1 = T.ilReturn(ctx, il1), r2 = T.ilReturn(ctx, il2), st = stateOf(act, [], [il1, il2]);
    assert.ok(r1.nOut > 0 && r2.nOut > 0 && r1.tRet !== r2.tRet, 'fixture: different returns ' + r1.nOut + ' ' + r2.nOut);
    const [early, late] = [r1.tRet, r2.tRet].sort((x, y) => x - y), rank = k => (act.includes(k) ? act.indexOf(k) : Infinity);   // act[0] lowest, act[1] next, the IL players protected
    const res = T.playsPct(ctx, st, { rank });
    assert.strictEqual(res[act[0]].drop, early);
    assert.strictEqual(res[act[1]].drop, late);
    assert.strictEqual(res[act[2]].drop, undefined);
    // a dropped IL player never plays, and his return frees the spot: only one counted player goes
    const res2 = T.playsPct(ctx, st, { rank: k => (k === il2 ? -1 : rank(k)) });
    assert.strictEqual(res2[il2].played, 0);
    assert.strictEqual(res2[act[0]].drop, r1.tRet);
    assert.strictEqual(res2[act[1]].drop, undefined);
  }));
});

test('IL timeline: o.force drops that many even under the limit (at the first return, the window middle with no IL player); o.noDrop keeps everyone', () => {
  const keys = ROS[me].map(x => x.fid).slice(0, 13), act = keys.slice(0, 11), il = keys[12], rank = k => (act.includes(k) ? act.indexOf(k) : Infinity);
  withG(il, 40, () => {
    const ctx = timelineCtx(keys, new Array(13).fill(10)), r = T.ilReturn(ctx, il), w = T.window(ctx);
    const under = T.playsPct(ctx, stateOf(act, [], [il]), { force: 1, rank });   // 11 + IL = 12: nobody has to go
    assert.strictEqual(under[act[0]].drop, (NIGHT + r.nOut * 86400) * 1000);
    const lone = T.playsPct(ctx, stateOf(act, []), { force: 1, rank });   // no IL player: the window's middle
    assert.strictEqual(lone[act[0]].drop, w.from + (w.to - w.from) / 2);
    const over = T.playsPct(ctx, stateOf(keys.slice(0, 12), [], [il]), { noDrop: true });
    assert.ok(Object.keys(over).every(k => over[k].drop == null));
  });
});

test('IL timeline: soloGames(ctx, key, to) counts the games only up to `to`', () => {
  const keys = ROS[me].map(x => x.fid).slice(0, 3), ctx = timelineCtx(keys, [10, 10, 10]), k = keys[0], w = T.window(ctx);
  assert.ok(near(T.soloGames(ctx, k, w.to), T.soloGames(ctx, k), 1e-9));
  const half = (NIGHT + 4 * 86400) * 1000;
  assert.ok(near(T.soloGames(ctx, k, half), T.avail(ctx, pool.byKey.get(k)) * 4, 1e-9));
  assert.strictEqual(T.soloGames(ctx, k, w.from), 0);
});

test('Team-tab Plays %: a player under 82 projected games plays fewer games on total than on Per game, and the same on a full-season player', () => {
  const keys = ROS[me].map(x => x.fid).slice(0, 4), st = stateOf(keys, []);
  const per = T.playsPct(tabCtx(keys, 'pergame'), st), tot = T.playsPct(tabCtx(keys, 'total'), st), mix = T.playsPct(tabCtx(keys, 'mix'), st);
  keys.forEach(k => {
    const a = Math.min(1, gOf(k) / 82);
    assert.strictEqual(per[k].played, 1, k);
    assert.ok(near(tot[k].played, a), k); assert.ok(near(mix[k].played, (1 + a) / 2), k);
  });
  assert.ok(keys.some(k => gOf(k) < 82), 'fixture has an injured or part-season player');
});

test('counted: active and reserve players in roster order, never IL', () => {
  const keys = ROS[me].map(x => x.fid).slice(0, 5), st = stateOf(keys.slice(0, 2), keys.slice(2, 4), [keys[4]]);
  assert.deepStrictEqual(T.counted(st), keys.slice(0, 4));
});

test('Plays %: pct is null when the team has no games left', () => {
  const keys = ROS[me].map(x => x.fid).slice(0, 3), ctx = M.makeCtx({ L, pool, DAYS: { games: {} }, rosters: ROS, me, nowMs: NOW });
  const r = T.playsPct(ctx, stateOf(keys, []));
  keys.forEach(k => { assert.strictEqual(r[k].pct, null); assert.strictEqual(r[k].gl, 0); });
});

// weightedZ and teamLine (task 4)
const R = require('../../rankings_core.js'), Rows = R.projSource(PLAYERS, 'avg');

test('weightedZ with all weights 1 reproduces the Rankings Zscore exactly; 0 drops a category; 0.5 halves it', () => {
  const tab = R.table(Rows, { teams: 12, roster: 12, type: 'h2h', basis: 'pergame' }).filter(r => r.z != null).slice(0, 40);
  tab.forEach(r => assert.ok(Math.abs(T.weightedZ(r.cats, null) - r.z) < 1e-12));
  tab.forEach(r => assert.ok(Math.abs(T.weightedZ(r.cats, [1, 1, 1, 1, 1, 1, 1, 1, 1]) - r.z) < 1e-12));
  const r = tab[0], W = Pl.WEIGHTS, w0 = [1, 1, 1, 1, 1, 1, 1, 1, 1], w5 = w0.slice();
  w0[3] = 0; w5[3] = 0.5;
  assert.ok(Math.abs(T.weightedZ(r.cats, w0) - (r.z - r.cats[3] * W[3])) < 1e-12);
  assert.ok(Math.abs(T.weightedZ(r.cats, w5) - (r.z - 0.5 * r.cats[3] * W[3])) < 1e-12);
});

test('teamLine: Plays % x line summed over players, counting stats per active slot, percentages from makes and attempts', () => {
  const a = { fgp: 0.5, fga: 10, ftp: 0.8, fta: 5, tpm: 2, pts: 20, reb: 5, ast: 4, stl: 1, blk: 1, to: 2 };
  const b = { fgp: 0.4, fga: 20, ftp: 0.5, fta: 4, tpm: 1, pts: 10, reb: 3, ast: 2, stl: 0, blk: 0, to: 1 };
  const t = T.teamLine([{ line: a, pct: 1 }, { line: b, pct: 0.5 }], 10);
  assert.ok(Math.abs(t.pts - 2.5) < 1e-12 && Math.abs(t.to - 0.25) < 1e-12);
  assert.ok(Math.abs(t.fga - 2) < 1e-12 && Math.abs(t.fgp - (5 + 4) / 20) < 1e-12);
  assert.ok(Math.abs(t.ftp - (4 + 1) / 7) < 1e-12);
  assert.strictEqual(T.teamLine([], 10).fgp, 0);
  assert.strictEqual(T.teamLine([{ line: a, pct: null }], 10).pts, 0);   // no games left counts for nothing
});

// name search (task 5)
test('search: accent- and case-insensitive, partial, every word must match, starts-with first, limit honoured', () => {
  const list = [{ n: 'Nikola Jokić' }, { n: 'Nikola Vučević' }, { n: 'Jonas Valančiūnas' }, { n: 'Bojan Bogdanović' }, { n: 'Luka Dončić' }, { n: 'Dan Smith' }, { n: 'Anthony Edwards' }];
  const names = q => T.search(list, q).map(x => x.n);
  assert.deepStrictEqual(names('jokic'), ['Nikola Jokić']);
  assert.deepStrictEqual(names('NIK vu'), ['Nikola Vučević']);
  assert.deepStrictEqual(names('doncic'), ['Luka Dončić']);
  assert.deepStrictEqual(names('jo'), ['Nikola Jokić', 'Jonas Valančiūnas']);
  assert.deepStrictEqual(names('an'), ['Anthony Edwards', 'Jonas Valančiūnas', 'Bojan Bogdanović', 'Dan Smith']);   // a word starting with it first, then inside a word, list order within each
  assert.deepStrictEqual(names(''), []);
  assert.deepStrictEqual(names('zzz'), []);
  assert.strictEqual(T.search(list, 'n', 2).length, 2);
});

// review fixes (2026-10-25)
test('Plays %: an "out" player sits out only the rest of the current week, and the bench uses his open nights', () => {
  const keys = ROS[me].map(x => x.fid).slice(0, 11), early = Math.floor(NOW / 1000) + 3600, g = {};
  keys.forEach(k => { g[pool.byKey.get(k).t] = [early, NIGHT]; });
  const ctx = M.makeCtx({ L, pool, DAYS: { games: g }, rosters: ROS, me, nowMs: NOW });
  ctx.curEnd = NOW + 2 * 3600 * 1000;   // the current week ends between the two nights
  ctx.out = new Set([keys[0]]);
  const r = T.playsPct(ctx, stateOf(keys.slice(0, 10), [keys[10]]));
  assert.deepStrictEqual([r[keys[0]].gl, r[keys[0]].pct], [2, 0.5]);   // misses the early night only
  assert.strictEqual(r[keys[1]].pct, 1);
  assert.strictEqual(r[keys[10]].pct, 0.5);   // takes the slot the out player leaves on the early night
});

test('weightedZ follows the league: in an 8-category league turnovers carry no weight, as in Rankings.table', () => {
  const tab = R.table(Rows, { teams: 12, roster: 12, type: 'h2h', basis: 'pergame', cats: 8 }).filter(r => r.z != null).slice(0, 20);
  tab.forEach(r => assert.ok(Math.abs(T.weightedZ(r.cats, null, 8) - r.z) < 1e-12));
});

test('playsPct marks IL rows as hypothetical and teamLine leaves them out', () => {
  const keys = ROS[me].map(x => x.fid).slice(0, 4), ctx = mkCtx(keys), r = T.playsPct(ctx, stateOf(keys.slice(0, 2), [keys[2]], [keys[3]]));
  assert.ok(!r[keys[0]].hypo && !r[keys[2]].hypo);
  assert.strictEqual(r[keys[3]].hypo, true);
  const line = pool.byKey.get(keys[0]).line;
  assert.strictEqual(T.teamLine([Object.assign({ line }, r[keys[3]])], 10).pts, 0);
});

test('applySwap records the swap in state.moves; moveSlot keeps the record; an empty swap leaves it as it was (D3)', () => {
  const s = T.initState(ROS[me]), inK = ROS[other][0].fid;
  assert.deepStrictEqual(s.moves, []);
  const w = T.applySwap(s, [s.order[0]], [inK]);
  assert.deepStrictEqual(w.moves, [{ out: [s.order[0]], in: [inK] }]);
  assert.deepStrictEqual(T.moveSlot(w, inK, 'active').moves, w.moves);
  assert.deepStrictEqual(T.applySwap(w, [], []).moves, w.moves);
  assert.deepStrictEqual(s.moves, []);
});

// ---- the Team-tab flag (2026-10-26): ctx.teamTab turns Reserve into a parking slot and applies the basis; a plain ctx never changes ----
test('tabState: Fantrax ACTIVE and RESERVE are both active (Courtside Active = active + bench), IR is il, no moves', () => {
  const s = T.tabState(ROS[me]);
  ROS[me].forEach(x => assert.strictEqual(s.slots[x.fid], x.slot === 'IR' ? 'il' : 'active'));
  assert.deepStrictEqual(s.order, ROS[me].map(x => x.fid));
  assert.deepStrictEqual(s.moves, []);
});

test('countedSlots: a plain ctx counts active + reserve; the Team tab on Per game counts only active, on the seasonal bases active + il', () => {
  assert.deepStrictEqual(T.countedSlots({}), ['active', 'reserve']);
  assert.deepStrictEqual(T.countedSlots(undefined), ['active', 'reserve']);
  assert.deepStrictEqual(T.countedSlots({ teamTab: true, basis: 'pergame' }), ['active']);
  assert.deepStrictEqual(T.countedSlots({ teamTab: true, basis: 'total' }), ['active', 'il']);
  assert.deepStrictEqual(T.countedSlots({ teamTab: true, basis: 'mix' }), ['active', 'il']);
});

test('counted(state, ctx): without a ctx it is today\'s counted (active + reserve); with a Team-tab ctx it follows countedSlots', () => {
  const s = T.initState(ROS[me]), k = s.order.find(x => s.slots[x] === 'il'), r = s.order.find(x => s.slots[x] === 'reserve');
  assert.ok(k && r);
  assert.ok(T.counted(s).includes(r) && !T.counted(s).includes(k));
  assert.ok(!T.counted(s, { teamTab: true, basis: 'pergame' }).includes(r));
  assert.ok(T.counted(s, { teamTab: true, basis: 'total' }).includes(k));
  assert.deepStrictEqual(T.counted(s, {}), T.counted(s));
});

test('avail: 1 on a plain ctx and on Per game; min(1, g/82) on the seasonal basis; halfway on Mix', () => {
  const pp = { g: 41 }, full = { g: 90 };
  assert.strictEqual(T.avail({}, pp), 1);
  assert.strictEqual(T.avail({ teamTab: true, basis: 'pergame' }, pp), 1);
  assert.strictEqual(T.avail({ teamTab: true, basis: 'total' }, pp), 0.5);
  assert.strictEqual(T.avail({ teamTab: true, basis: 'total' }, full), 1);
  assert.strictEqual(T.avail({ teamTab: true, basis: 'mix' }, pp), 0.75);
  assert.strictEqual(T.avail({ teamTab: true, basis: 'mix' }, full), 1);
});
