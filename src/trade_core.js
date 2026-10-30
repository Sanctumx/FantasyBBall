// Trade core (2026-10-20): rest-of-season Win M for a roster change, perceived player value and trade likelihood.
// Pure; browser and Node. Builds on matchup_core (a team's week vs its real opponent) and inseason_players (value scale).
(function (root) {
  'use strict';
  const InLeague = root.InLeague || require('./inseason_league.js'), InPlayers = root.InPlayers || require('./inseason_players.js'), TeamWin = root.TeamWin || require('./team_win.js'), SlotValue = root.SlotValue || require('./slot_value.js');

  // winM was 0.1 on the old pairMatchup scale; #147 moved dB to the TeamWin forecaster, where dB is larger, so 0.1 x 0.672 (a fit of old dB on new dB over
  // the 2145 one-for-one candidates of the fixture league, scratch script fit_winm.js) keeps the likelihood moving with dB as much as before.
  // #151 moved dB onto the Team tab's Season rules (IL at g/82, bench Active): the same fit of the 2145 candidates, dB(#147) on dB(#151), gave slope 0.922
  // (R2 0.785), so 0.07 x 0.922 = 0.065
  const TRADE_W = { cur: 0.4, proj: 0.3, adp: 0.3, shrinkGames: 20, slope: 2.0, winM: 0.065, tagGap: 0.5, bias: -0.75 };   // bias: a manager wants to come out ahead, so an even-looking swap is not a coin flip

  // Rest-of-season Win M with the rosters as given (fids per team): the Team tab's forecaster (TeamWin.leagueWin, one Engine.evaluate run, the
  // shared WinK.SHRINK on every term), the mean over every other team weighted equally (user, 2026-10-26: until playoff odds are in).
  // On the Team tab's Season rules (#151): IL players count at their availability g/82, the bench is Active. opts: cats, points, shrink as TeamWin.leagueWin. -> { mean, opps: [{ opp, p }] }, mean null with no weeks left
  function rosMeans(ctx, roster, teams, opts) {
    const none = { mean: null, opps: [] }, lw = ctx.cur == null ? null : TeamWin.leagueWin(ctx, roster, Object.assign({}, opts, { rows: teams })), out = {};
    teams.forEach(t => {
      if (!lw) { out[t] = none; return; }
      const row = lw.P[lw.ids.indexOf(t)], opps = lw.ids.map((o, j) => ({ opp: o, p: row[j] })).filter(x => x.opp !== t);
      out[t] = { mean: opps.length ? opps.reduce((s, x) => s + x.p, 0) / opps.length : null, opps };
    });
    return out;
  }
  const rosWinM = (ctx, roster, teamId, opts) => rosMeans(ctx, roster, [teamId], opts)[teamId];
  const optKey = o => o ? JSON.stringify([o.cats, o.points, o.shrink, o.basis]) : '';

  // projected players' values, best first (the ADP-implied value of a rank)
  function projValues(ctx) {
    if (!ctx._projVals) ctx._projVals = ctx.pool.players.filter(p => p.src === 'proj').map(p => InPlayers.valueZ(p.line, p.g, ctx.ref)).sort((a, b) => b - a);
    return ctx._projVals;
  }
  // an IL player's season value: his projected games (which already hold the time he misses) at his line, the rest of the season at the
  // line of his owner's worst non-IL player (user, 2026-10-26; the receiving team's in a trade, user 2026-10-27); everyone else is valued over his own games
  const FULL_G = 82;
  function worstLine(ctx, owner) {
    const c = ctx._worst = ctx._worst || {};
    if (!(owner in c)) {
      const ps = (ctx.roster[owner] || []).map(f => ctx.pool.byKey.get(f)).filter(p => p.slot !== 'IR').sort((a, b) => InPlayers.valueZ(a.line, a.g, ctx.ref) - InPlayers.valueZ(b.line, b.g, ctx.ref));
      c[owner] = ps.length ? ps[0].line : null;
    }
    return c[owner];
  }
  // fillOwner: the team whose worst player fills the rest (default his owner; in a trade the team that receives him, #153)
  function seasonZ(ctx, pp, line, fillOwner) {
    const fill = pp.slot === 'IR' && pp.g < FULL_G ? worstLine(ctx, fillOwner || pp.owner) : null;
    return fill ? InPlayers.valueZFill(line, pp.g, fill, FULL_G, ctx.ref) : InPlayers.valueZ(line, pp.g, ctx.ref);
  }
  function perceived(ctx, pp, fillOwner) {
    const proj = seasonZ(ctx, pp, pp.line, fillOwner), cur = seasonZ(ctx, pp, InPlayers.curLine(pp, TRADE_W.shrinkGames), fillOwner);
    const vals = projValues(ctx), rank = Math.max(1, Math.min(vals.length, Math.round(pp.adp == null ? 168 : pp.adp)));
    const adp = vals[rank - 1];
    return { cur, proj, adp, pv: TRADE_W.cur * cur + TRADE_W.proj * proj + TRADE_W.adp * adp, rv: proj };
  }

  function baseline(ctx, t, opts) {
    const ro = ctx._ros = ctx._ros || {}, k = t + '#' + optKey(opts);
    return ro[k] === undefined ? (ro[k] = rosWinM(ctx, ctx.roster, t, opts).mean) : ro[k];
  }
  // aGets: fids A receives from B; bGets: fids B receives from A. dA, dB in percentage points of rest-of-season Win M (opts: see rosMeans).
  // aAdds (#169): free agents A picks up in the freed slot (2x1 trades). With them the result also carries the breakdown
  // dA = dAPlayer + slot + dAPickup (dAPickup: the pickup alone, dAPlayer: the trade given the pickup, slot: the measured slot value), sortKey
  // (dAPlayer, plus slot with opts.slotInSort) and freed. opts also takes approach (1 plain rest-of-season, 2 week-weighted, default SlotValue.APPROACH),
  // slotInSort and curve, for the scripts and tests. Uneven trades subtract the value of the player B must drop from B's side of the likelihood
  function evaluateTrade(ctx, { a, b, aGets, bGets, aAdds }, opts) {
    if (a === b) throw new Error('A trade needs two different teams');
    const adds = aAdds || [], ra = new Set(ctx.roster[a]), rb = new Set(ctx.roster[b]);
    adds.forEach(f => { if (!ctx.pool.byKey.has(f) || Object.keys(ctx.roster).some(t => ctx.roster[t].includes(f))) throw new Error('Player ' + f + ' is not a free agent'); });
    aGets.forEach(f => { if (!rb.has(f)) throw new Error('Player ' + f + ' is not on the giving team'); if (bGets.includes(f)) throw new Error('Player ' + f + ' is on both sides'); });
    bGets.forEach(f => { if (!ra.has(f)) throw new Error('Player ' + f + ' is not on the giving team'); });
    const R = Object.assign({}, ctx.roster);
    R[a] = ctx.roster[a].filter(f => !bGets.includes(f)).concat(aGets, adds);
    R[b] = ctx.roster[b].filter(f => !aGets.includes(f)).concat(bGets);
    // a side left with more non-IL players than the limit drops its worst ones (#153); a team already over it is not charged for the trade
    const nonIR = f => ctx.pool.byKey.get(f).slot !== 'IR', val = f => { const p = ctx.pool.byKey.get(f); return InPlayers.valueZ(p.line, p.g, ctx.ref); };
    const capFor = (t, list) => {
      const over = list.filter(nonIR).length - Math.max(ctx.L.maxPlayers || 0, ctx.roster[t].filter(nonIR).length);
      return ctx.L.maxPlayers > 0 && over > 0 ? list.filter(nonIR).sort((x, y) => val(x) - val(y) || (x < y ? -1 : 1)).slice(0, over) : [];
    };
    const capDrops = t => capFor(t, R[t]);
    const drops = { [a]: capDrops(a), [b]: capDrops(b) };
    R[a] = R[a].filter(f => !drops[a].includes(f)); R[b] = R[b].filter(f => !drops[b].includes(f));
    // one league run gives both sides; cached per (the two changed rosters, options)
    const sig = t => R[t].slice().sort().join(','), cache = ctx._rosCache = ctx._rosCache || new Map(), key = a + '#' + sig(a) + '|' + b + '#' + sig(b) + '|' + optKey(opts);
    if (!cache.has(key)) { const m = rosMeans(ctx, R, [a, b], opts); cache.set(key, [m[a].mean, m[b].mean]); }
    const after = cache.get(key), dA = 100 * (after[0] - baseline(ctx, a, opts)), dB = 100 * (after[1] - baseline(ctx, b, opts));
    // B's view of the swap: an IL player is filled by B's worst player on either side (the fill swaps with him)
    const pvSum = fs => fs.reduce((s, f) => s + perceived(ctx, ctx.pool.byKey.get(f), b).pv, 0);
    const multi = aGets.length !== bGets.length;
    const gapB = pvSum(bGets) - pvSum(aGets) - (multi ? pvSum(drops[b]) : 0);
    const out = { dA, dB, total: dA + dB, likelihood: 1 / (1 + Math.exp(-(TRADE_W.slope * gapB + TRADE_W.winM * dB + TRADE_W.bias))), gapB, multi, drops, sortKey: dA, freed: false };
    if (!adds.length) return out;
    const o = opts || {}, curve = o.curve || SlotValue.CURVE, approach = o.approach != null ? o.approach : SlotValue.APPROACH, slotInSort = o.slotInSort != null ? o.slotInSort : SlotValue.SLOT_IN_SORT;
    // the pickup alone: my roster now plus the free agent, under the same cap rule
    const RF = Object.assign({}, ctx.roster); RF[a] = ctx.roster[a].concat(adds); const dF = capFor(a, RF[a]); RF[a] = RF[a].filter(f => !dF.includes(f));
    const fkey = 'F#' + a + '#' + sig(a).length + RF[a].slice().sort().join(',') + '|' + optKey(opts);
    if (!cache.has(fkey)) cache.set(fkey, rosMeans(ctx, RF, [a], opts)[a].mean);
    let mT = after[0], mF = cache.get(fkey), m0 = baseline(ctx, a, opts);
    if (approach === 2) {
      const wT = weightedWinM(ctx, R, a, opts, curve), wF = weightedWinM(ctx, RF, a, opts, curve), w0 = weightedWinM(ctx, ctx.roster, a, opts, curve);
      if (wT != null && wF != null && w0 != null) { mT = wT; mF = wF; m0 = w0; }
    }
    const dAPlayer = 100 * (mT - mF), dAPickup = 100 * (mF - m0);
    const nFreed = Math.min(adds.length, bGets.filter(nonIR).length - aGets.filter(nonIR).length), freed = nFreed > 0;
    const slot = freed ? nFreed * SlotValue.slotTerm(ctx, curve) : 0;
    return Object.assign(out, { dA: dAPlayer + slot + dAPickup, total: dAPlayer + slot + dAPickup + dB, dAPlayer, dAPickup, slot, freed, sortKey: dAPlayer + (slotInSort ? slot : 0) });
  }

  // My Win M averaged over the periods still to play (SlotValue.weights), from one plays pass split by period. null with no period left.
  // R is a full roster map; cached per changed rosters, options and curve
  function weightedWinM(ctx, R, team, opts, curve) {
    curve = curve || SlotValue.CURVE;
    const cache = ctx._wmCache = ctx._wmCache || new Map(), changed = Object.keys(R).filter(t => R[t] !== ctx.roster[t]).map(t => t + '#' + R[t].slice().sort().join(',')).join('|');
    const key = team + '|' + changed + '|' + optKey(opts) + '|' + SlotValue.sig(curve);
    if (!cache.has(key)) {
      const o = opts || {}, lw = TeamWin.leagueWinByPeriod(ctx, R, { cats: o.cats, points: o.points, shrink: o.shrink, basis: o.basis, rows: [team], through: 'all' });
      let m = null;
      if (lw) {
        const w = SlotValue.weights(ctx, curve), i = lw.ids.indexOf(team);
        m = lw.periods.reduce((s, p, k) => { const row = p.P[i].filter(x => x != null); return s + w[k].w * row.reduce((x, y) => x + y, 0) / row.length; }, 0);
      }
      cache.set(key, m);
    }
    return cache.get(key);
  }

  // ---- finder ----
  const oneForOne = (ctx, give, target, team, wopts) => {
    const r = evaluateTrade(ctx, { a: ctx.me, b: team, aGets: [target.key], bGets: [give.key] }, wopts), v = perceived(ctx, target);
    return { give, target, team, likelihood: r.likelihood, dA: r.dA, dB: r.dB, total: r.total, buyLow: v.rv - v.pv >= TRADE_W.tagGap };
  };
  const byValue = (a, b) => b.dA * b.likelihood - a.dA * a.likelihood;
  // every one-for-one trade for one of my players (myKey) with every other team's player, helpful or not, unfiltered; 'any' offers each of my players
  // wopts: the Win M options of rosMeans (basis: 'total' Season, the default, 'pergame', 'mix')
  function tradeCandidates(ctx, myKey, wopts) {
    const gives = myKey === 'any' ? ctx.roster[ctx.me] : [myKey], rows = [];
    gives.forEach(g => {
      const give = ctx.pool.byKey.get(g);
      Object.keys(ctx.roster).forEach(t => {
        if (t === ctx.me) return;
        ctx.roster[t].forEach(f => rows.push(oneForOne(ctx, give, ctx.pool.byKey.get(f), t, wopts)));
      });
    });
    return rows;
  }
  // minLikelihood is 0-1; minDA and minDB are Win M points. The filters run before the limit.
  function filterTrades(rows, { limit = 25, minLikelihood = 0, minDA = -Infinity, minDB = -Infinity } = {}) {
    return rows.filter(r => r.likelihood >= minLikelihood && r.dA >= minDA && r.dB >= minDB).sort(byValue).slice(0, limit);
  }
  // Text box input. Likelihood: "50%", "0.5" or "50" (above 1 means percent; a bare 1 is 100%). Win M points: "2", "2%".
  // Blank is no limit (null); anything else that is not a number is invalid (undefined).
  function parseFilter(kind, text) {
    const t = String(text == null ? '' : text).trim().toLowerCase().replace('％', '%').replace(/^(-?\d+),(\d+)/, '$1.$2');
    if (t === '' || t === 'any') return null;
    const m = /^(-?\d*\.?\d+)\s*(%|percent|pcts?|pts?|points?)?$/.exec(t);
    if (!m) return undefined;
    const v = parseFloat(m[1]);
    if (kind === 'lik') { const f = (m[2] && /^(%|percent|pcts?)$/.test(m[2])) || v > 1 ? v / 100 : v; return f >= 0 && f <= 1 ? f : undefined; }
    return v;
  }
  // Saved candidates (the page keeps them in the browser so a reload does not search again): compact rows, rebuilt from the pool
  // dp: round the numbers to that many decimals (the page keeps 4, which saves about 40% of the browser storage)
  const packCandidates = (rows, dp) => { const f = dp == null ? (x => x) : (x => Math.round(x * Math.pow(10, dp)) / Math.pow(10, dp)); return rows.map(r => [r.give.key, r.target.key, r.team, f(r.likelihood), f(r.dA), f(r.dB), f(r.total), r.buyLow ? 1 : 0]); };
  function unpackCandidates(packed, pool) {
    const out = [];
    packed.forEach(([g, t, team, likelihood, dA, dB, total, bl]) => {
      const give = pool.byKey.get(g), target = pool.byKey.get(t);
      if (give && target) out.push({ give, target, team, likelihood, dA, dB, total, buyLow: !!bl });
    });
    return out;
  }
  // What the candidates depend on: both sides' rosters, my team, the current period, the day, the weights and a model version
  function candSig(ctx, day, version) {
    const ros = Object.keys(ctx.roster).sort().map(t => t + ':' + ctx.roster[t].slice().sort().join(',')).join(';');
    let h = 0; const str = [ros, ctx.me, ctx.cur, day, version, JSON.stringify(TRADE_W)].join('|');
    for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0;
    return day + ':' + ctx.me + ':' + ctx.cur + ':' + (h >>> 0).toString(36) + ':' + str.length;
  }
  const findTrades = (ctx, myKey, opts) => filterTrades(tradeCandidates(ctx, myKey), Object.assign({ minDA: 1e-9 }, opts));   // by default only trades that help me
  // keep(player) leaves players out before the top `limit` are chosen (the page's Hide injured), so the lists refill instead of shrinking
  function sellHighBuyLow(ctx, { limit = 8, targets = 3, candidates = null, keep = null } = {}) {
    const tag = (pp, sign) => { const v = perceived(ctx, pp); return { player: pp, gap: sign * (v.pv - v.rv) }; };
    const mine = ctx.roster[ctx.me].map(f => ctx.pool.byKey.get(f)).filter(pp => !keep || keep(pp)).map(pp => tag(pp, 1)).filter(x => x.gap >= TRADE_W.tagGap).sort((a, b) => b.gap - a.gap).slice(0, limit);
    const sellHigh = mine.map(x => ({ player: x.player, gap: x.gap, trades: candidates ? filterTrades(candidates(x.player.key), { limit: targets, minDA: 1e-9 }) : findTrades(ctx, x.player.key, { limit: targets }) }));
    const theirs = [];
    Object.keys(ctx.roster).forEach(t => { if (t !== ctx.me) ctx.roster[t].forEach(f => { const pp = ctx.pool.byKey.get(f); if (keep && !keep(pp)) return; const x = tag(pp, -1); if (x.gap >= TRADE_W.tagGap) theirs.push(Object.assign(x, { team: t })); }); });
    const buyLow = theirs.sort((a, b) => b.gap - a.gap).slice(0, limit).map(x => ({
      player: x.player, gap: x.gap,
      trades: (candidates ? [].concat.apply([], ctx.roster[ctx.me].map(f => candidates(f).filter(r => r.target.key === x.player.key && r.dA > 0))) : ctx.roster[ctx.me].map(f => oneForOne(ctx, ctx.pool.byKey.get(f), x.player, x.team)).filter(r => r.dA > 0)).sort(byValue).slice(0, targets)
    }));
    return { sellHigh, buyLow };
  }

  const api = { TRADE_W, rosMeans, rosWinM, weightedWinM, perceived, evaluateTrade, tradeCandidates, filterTrades, parseFilter, packCandidates, unpackCandidates, candSig, findTrades, sellHighBuyLow };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Trade = api;
})(this);
