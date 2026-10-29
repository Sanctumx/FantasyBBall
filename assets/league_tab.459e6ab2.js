// League tab on the Team-tab rules (league-team-rules, 2026-10-29): every team is scored the way the Team tab scores one team.
// Win numbers are TeamWin.leagueWin (detail: shrunk match and category chances, one Engine.evaluate run); each team's stat line is
// the Team tab's own (TeamView.rows().avg per game; on the seasonal basis the rest-of-season totals of the players TeamWin.side counts).
// Pure; browser and Node. league.html only draws what this returns, in the shapes League.computeLeague gave it.
(function (root) {
  'use strict';
  const Eng = root.Engine || require('./engine.js'), TeamWin = root.TeamWin || require('./team_win.js'), TeamView = root.TeamView || require('./team_view.js');
  const NC = Eng.NC, TO = Eng.TO;

  const COUNT = ['tpm', 'pts', 'reb', 'ast', 'stl', 'blk', 'to'];
  // per game line -> the board's category order: FG%, FT%, 3PM, PTS, REB, AST, ST, BLK, TO
  const ofLine = l => [l.fgp, l.ftp, l.tpm, l.pts, l.reb, l.ast, l.stl, l.blk, l.to];
  // entries [{ p: per game line, games }] -> totals over those games, percentages from the summed makes and attempts
  function totals(entries) {
    const S = { fgm: 0, fga: 0, ftm: 0, fta: 0, tpm: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0 };
    entries.forEach(({ p, games }) => {
      S.fga += p.fga * games; S.fgm += p.fga * p.fgp * games; S.fta += p.fta * games; S.ftm += p.fta * p.ftp * games;
      COUNT.forEach(k => { S[k] += p[k] * games; });
    });
    return ofLine({ fgp: S.fga ? S.fgm / S.fga : 0, ftp: S.fta ? S.ftm / S.fta : 0, tpm: S.tpm, pts: S.pts, reb: S.reb, ast: S.ast, stl: S.stl, blk: S.blk, to: S.to });
  }

  // a = { ctx (a Team-tab context: teamTab, any basis), ids (team ids in display order), names, basis 'total' | 'pergame', cats 9 | 8,
  //       scoring 'h2h' | 'most' | 'roto', zCats? (pool player -> category Zscores, TeamView.rows's option) }
  // -> the League page's result { N, nc, cats, me, names, basis, match, cat, expCats, standings, raw, perGame, perWeek, z, rank, profile, il, W, swing },
  //    or null with no weeks left. `raw` is the per game line on 'pergame' and rest-of-season totals on 'total'; perWeek the totals per week left.
  function score(a) {
    const basis = a.basis === 'pergame' ? 'pergame' : 'total', nc = a.cats === 8 ? 8 : 9, ids = a.ids, N = ids.length;
    const lw = TeamWin.leagueWin(a.ctx, null, { basis, cats: nc, detail: true, points: a.points });
    if (!lw) return null;
    const tv = TeamWin.tabView(a.ctx, basis), cats = []; for (let c = 0; c < NC; c++) if (c !== TO || nc === 9) cats.push(c);
    const match = [], cat = [], expCats = [];
    for (let i = 0; i < N; i++) {
      match.push([]); cat.push([]); expCats.push([]);
      for (let j = 0; j < N; j++) {
        if (i === j) { match[i].push(null); cat[i].push(null); expCats[i].push(null); continue; }
        const li = lw.ids.indexOf(ids[i]), lj = lw.ids.indexOf(ids[j]), cp = lw.C[li][lj];
        match[i].push(lw.P[li][lj]); cat[i].push(cp); expCats[i].push(cp ? cats.reduce((s, c) => s + cp[c], 0) : null);
      }
    }
    const il = [], perGame = [], total = [], zSlot = [];
    ids.forEach(t => {
      const state = TeamWin.tradeState(a.ctx, t, a.ctx.roster[t]);
      il.push(state.order.filter(k => state.slots[k] === 'il'));
      const rows = TeamView.rows(tv, state, { cats: nc, view: 'game', zCats: a.zCats });
      perGame.push(ofLine(rows.avg)); zSlot.push(rows.avgCats);
      total.push(totals(TeamWin.side(tv, state, lw.W).map(e => ({ p: e.p, games: e.games * lw.W }))));
    });
    const raw = basis === 'pergame' ? perGame : total;
    const perWeek = basis === 'pergame' ? null : raw.map(r => r.map((v, c) => c < 2 ? v : v / lw.W));
    const z = raw.map(() => new Array(NC).fill(0)), rank = raw.map(() => new Array(NC).fill(0));
    for (let c = 0; c < NC; c++) {
      const col = raw.map(r => r[c]), m = col.reduce((s, b) => s + b, 0) / N, sd = Math.sqrt(col.reduce((s, b) => s + (b - m) ** 2, 0) / N) || 1;
      const sign = c === TO ? -1 : 1;
      col.forEach((v, t) => { z[t][c] = sign * (v - m) / sd; });
      col.map((v, t) => [sign * v, t]).sort((x, y) => y[0] - x[0]).forEach(([, t], k) => { rank[t][c] = k + 1; });
    }
    // with a.zCats (player -> his 9 category Zscores of the chosen type) the Zscore view shows each team's Plays % weighted Z per lineup slot,
    // the Team tab's own number; ranks stay across teams on the stat line above
    if (zSlot.every(Boolean)) zSlot.forEach((zs, t) => { z[t] = zs.slice(); });
    // standings: expected categories per game and mean match chance against the others; roto = 1 + the expected teams beaten, per category
    const sums = (M, f) => M.map(row => row.reduce((s, v) => s + (v == null ? 0 : f(v)), 0));
    const catsSum = sums(expCats, v => v), matchSum = sums(match, v => v);
    const roto = cat.map(row => cats.reduce((s, c) => s + 1 + row.reduce((x, cp) => x + (cp ? cp[c] : 0), 0), 0));
    const key = a.scoring === 'roto' ? roto : a.scoring === 'h2h' ? catsSum : matchSum;
    const ranked = key.map((v, t) => [v, t]).sort((x, y) => y[0] - x[0]).map(x => x[1]);
    const standings = ids.map((_, t) => ({ rank: ranked.indexOf(t) + 1, catsPerWeek: catsSum[t] / (N - 1), matchAvg: matchSum[t] / (N - 1), roto: roto[t] }));
    const profile = t => cats.map(c => {
      let w = 0; for (let j = 0; j < N; j++) if (j !== t) w += cat[t][j][c] / (N - 1);
      return { c, win: w, raw: raw[t][c], rank: rank[t][c] };
    });
    const me = Math.max(0, ids.indexOf(a.ctx.me));
    return { N, nc: cats.length, cats, me, names: a.names || ids, basis, match, cat, expCats, standings, raw, perGame, perWeek, z, rank, profile, il, W: lw.W, swing: lw.swing };
  }

  const api = { score, totals };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LeagueTab = api;
})(typeof self !== 'undefined' ? self : this);
