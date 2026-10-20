// In-season player pool: projection loader, name matching, value scale (2026-10-20)
const test = require('node:test'), assert = require('node:assert');
const I = require('../inseason_league.js'), Pl = require('../inseason_players.js'), PLAYERS = require('../players.json');
const fx = n => require('./fixtures/' + n), ESPN = fx('espn_2025_26.json'), FXP = fx('fx_players.json');
const L = I.parseLeague(fx('fx_league.json')), ROS = I.parseRosters(fx('fx_rosters.json'));
const mk = (over) => Pl.buildPool(Object.assign({ PLAYERS, fxPlayers: FXP, espn: ESPN, L, rosters: ROS }, over || {}));
const pool = mk();
const fidOf = re => Object.keys(FXP).find(k => re.test(FXP[k].name));
const near = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;

test('every rostered player is in the pool with owner and slot', () => {
  let n = 0, ir = 0;
  for (const t of Object.keys(ROS)) for (const r of ROS[t]) {
    const p = pool.byKey.get(r.fid); assert.ok(p, 'missing ' + r.fid);
    assert.strictEqual(p.owner, t); assert.strictEqual(p.slot, r.slot); n++; if (r.slot === 'IR') ir++;
  }
  assert.strictEqual(n, 178); assert.strictEqual(ir, 11);
});

test('projected player uses the averaged projection', () => {
  const w = pool.byKey.get(fidOf(/Wembanyama/));
  assert.strictEqual(w.src, 'proj');
  assert.ok(near(w.line.pts, (27.521 + 25.6) / 2, 1e-9));
  assert.ok(w.adp != null && w.g > 60);
});

test('no projection falls back to ESPN actual, then waiver level, and is listed', () => {
  const k = pool.byKey.get(fidOf(/Keldon/)), m = pool.byKey.get(fidOf(/Mara, Aday/));
  assert.strictEqual(k.src, 'actual'); assert.ok(k.actual && k.actual.gp > 0);
  assert.strictEqual(m.src, 'waiver'); assert.strictEqual(m.actual, null);
  const names = pool.unmatched.noProj.map(p => p.n);
  assert.ok(names.includes('Aday Mara') && names.includes('Keldon Johnson') && names.includes('Mikel Brown'));
  assert.strictEqual(pool.unmatched.noProj.length, 6);
  assert.ok(m.line.pts > 0 && m.g > 0 && m.g === k.g);   // waiver-level line and games, never zero
});

test('ESPN GS / NY / SA codes match players.json GSW / NYK / SAS players', () => {
  const sa = pool.byKey.get(fidOf(/Keldon/));   // Fantrax SA, ESPN SA, projections SAS
  assert.strictEqual(sa.t, 'SAS');
  assert.ok(pool.players.filter(p => p.src === 'proj' && p.t === 'GSW').length >= 5);
  assert.ok(pool.players.filter(p => p.src === 'proj' && p.t === 'NYK').length >= 5);
});

test('an updated players.json flows through unchanged code', () => {
  const copy = JSON.parse(JSON.stringify(PLAYERS));
  const w = copy.find(r => r.n === 'Victor Wembanyama'); w.pts += 10; w.hs.pts += 10;
  const added = Object.assign({}, copy.find(r => r.n === 'Victor Wembanyama'), { n: 'Aday Mara', t: 'OKC', ftx: 400, adp: 400, rk: 400 });
  copy.push(added);
  const p2 = mk({ PLAYERS: copy });
  assert.ok(near(p2.byKey.get(fidOf(/Wembanyama/)).line.pts, pool.byKey.get(fidOf(/Wembanyama/)).line.pts + 10, 1e-9));
  assert.strictEqual(p2.byKey.get(fidOf(/Mara, Aday/)).src, 'proj');
});

test('valueZ is standardized over the ref pool', () => {
  const proj = Pl.projLines(PLAYERS), ref = Pl.makeValueRef(proj, 168);
  const top = proj.slice().sort((a, b) => (a.adp == null ? 999 : a.adp) - (b.adp == null ? 999 : b.adp)).slice(0, 168);
  const z = top.map(p => Pl.valueZ(p.line, p.g, ref)), mean = z.reduce((a, b) => a + b, 0) / z.length;
  const sd = Math.sqrt(z.reduce((a, b) => a + (b - mean) ** 2, 0) / z.length);
  assert.ok(near(mean, 0, 1e-9) && near(sd, 1, 1e-9));
  const cz = Pl.catZ(top[0].line, ref); assert.strictEqual(cz.length, 9);
});

test('curLine shrinks toward the projection', () => {
  const p = Object.assign({}, pool.byKey.get(fidOf(/Keldon/)));
  p.line = Object.assign({}, p.line, { pts: 10 });
  const act = pts => Object.assign({}, p, { actual: { gp: p.actual.gp, line: Object.assign({}, p.actual.line, { pts }) } });
  const zero = Object.assign({}, act(30), { actual: { gp: 0, line: act(30).actual.line } });
  assert.strictEqual(Pl.curLine(zero).pts, 10);
  const big = Object.assign({}, act(30), { actual: { gp: 1e6, line: act(30).actual.line } });
  assert.ok(near(Pl.curLine(big).pts, 30, 1e-3));
  const mid = Object.assign({}, act(30), { actual: { gp: Pl.SHRINK_GAMES, line: act(30).actual.line } });
  assert.ok(near(Pl.curLine(mid).pts, 20, 1e-9));
  assert.deepStrictEqual(Pl.curLine(Object.assign({}, p, { actual: null })), p.line);
});
