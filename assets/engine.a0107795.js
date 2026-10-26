/* DraftDesk-style snake draft engine. Pure functions over state; no DOM. */
(function (root) {
  'use strict';
  const CATS = [
    { k: 'fg', l: 'FG%' }, { k: 'ft', l: 'FT%' }, { k: 'tpm', l: '3PM' },
    { k: 'pts', l: 'PTS' }, { k: 'reb', l: 'REB' }, { k: 'ast', l: 'AST' },
    { k: 'stl', l: 'ST' }, { k: 'blk', l: 'BLK' }, { k: 'to', l: 'TO' }
  ];
  const NC = 9, TO = 8;
  const PUNT_BETA = 1.5;       // how hard your future picks lean toward a strategy's fit (tuned by backtest)
  const IL_FILL = [0, 0.47, 0.70, 0.79, 0.81];   // share of missed games filled at waiver level, by IL spots (2026-10-17)
  const PUNT_TAU = 0.01;       // softmax temperature on strategy win chance (2026-10-16: 0.01 beat 0.005 by +0.70 ± 0.23 on 320 fresh drafts)
  const PUNT_SYN_PAIRS = 24;   // synergy pairs Auto may blend (2026-10-17 realistic league, titles vs 20: 24 +1.9 ± 1.4, 28/32 +2.2, 16 −0.6, 8 −2.2)
  const PUNT_TOPK = 8;         // strategies that get a full Gain pass in Auto
  const WEEKS = 24;           // season split into weekly matchups
  const GPW = 3.42;           // average games per NBA team per matchup week (82 / 24; 2026-10-17)
  const VAR_GAMES = 0.82;     // variance of a player's games in a week he plays (2022-26 logs, drafted players; 2026-10-17)
  const SEASON_G = 80;        // games a fantasy roster spot can fill in a season
  const STREAM_G = 100;       // games a streaming spot fills in a season (streamers chosen for games)
  // Streamability (weekly adds patch weak counting categories): games each add brings in (picked up mid-week),
  // share of a week's adds aimed at any one category (managers chase about 3 close categories at once), and a cap.
  const STREAM_GPA = 1.75, STREAM_SHARE = 1 / 3, STREAM_CAP = 0.6, STREAM_MAX_ADDS = 10;
  const SIGMA_G2 = 1.87;      // weekly variance of one rostered player's games, from 2024-26 logs (team gap sd 6.7 / 12 players)
  const GH_Z = [-2.8569700139, -1.3556261800, 0, 1.3556261800, 2.8569700139];   // Gauss-Hermite nodes for N(0,1)
  const GH_W = [0.0112574113, 0.2220759220, 0.5333333333, 0.2220759220, 0.0112574113];     // variance of a player's games in a week
  const UNKNOWN_ADP = 175;

  // ---------- math ----------
  function erf(x) {
    const s = x < 0 ? -1 : 1; x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  const Phi = z => 0.5 * (1 + erf(z / Math.SQRT2));
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  // ---------- players ----------
  function prepPlayers(raw) {
    return raw.map((p, i) => {
      const g = p.g;
      return Object.assign({}, p, {
        id: i,
        fgm: p.fgp * p.fga * g, fgaT: p.fga * g,
        ftm: p.ftp * p.fta * g, ftaT: p.fta * g,
        tot: { tpm: p.tpm * g, pts: p.pts * g, reb: p.reb * g, ast: p.ast * g, stl: p.stl * g, blk: p.blk * g, to: p.to * g }
      });
    });
  }

  function adpOf(p, src) {
    const a = p.adp, f = p.ftx;
    if (src === 'ftx') return f != null ? f : UNKNOWN_ADP;
    if (src === 'blend') {
      if (a != null && f != null) return (a + f) / 2;
      return a != null ? a : (f != null ? f : UNKNOWN_ADP);
    }
    return a != null ? a : (f != null ? f : UNKNOWN_ADP);
  }
  // How far a player's real draft slot strays from his ADP (one standard deviation, in picks).
  // 'v2': fitted on 50 real 12-team 9-cat Fantrax snake drafts (LOFB Bowl 2022-24, 9,120 picks): scatter around a
  //       league's own consensus is 0.42·ADP^0.68, plus about 5% of ADP for how far a league's consensus sits from
  //       Fantrax's global ADP (estimated from the BBM vs Fantrax ADP gap; to be measured on live drafts).
  // 'v1': the original hand-set line, 0.9 + 0.13·ADP (kept for backtests).
  function adpSd(p, src, model) {
    const adp = adpOf(p, src);
    let sd;
    if (model === 'v1') sd = 0.9 + 0.13 * adp;      // v2 is the default: backtest 2026-10-16 showed no difference in results (0.0 ± 0.4 pts)
    else { const w = 0.42 * Math.pow(Math.max(adp, 1), 0.68), g = 0.05 * adp; sd = Math.sqrt(w * w + g * g); }
    if (src === 'blend' && p.adp != null && p.ftx != null) { const d = (p.adp - p.ftx) / 2; sd = Math.sqrt(sd * sd + d * d); }
    if (adp === UNKNOWN_ADP) sd = Math.max(sd, 25);
    return sd;
  }

  // Category vector (bigger is always better). Percentages are "excess makes" over the pool average.
  function vec(p, ctx, g) {
    const v = new Float64Array(NC);
    v[0] = (p.fgp - ctx.pFG) * p.fga * g;
    v[1] = (p.ftp - ctx.pFT) * p.fta * g;
    v[2] = p.tpm * g; v[3] = p.pts * g; v[4] = p.reb * g; v[5] = p.ast * g;
    v[6] = p.stl * g; v[7] = p.blk * g; v[8] = -p.to * g;
    return v;
  }
  // Projection error variance per player, season units.
  function projVar(p, g) {
    const v = new Float64Array(NC);
    v[0] = Math.pow(0.015 * p.fga * g, 2); v[1] = Math.pow(0.02 * p.fta * g, 2);
    const ks = ['tpm', 'pts', 'reb', 'ast', 'stl', 'blk', 'to'];
    ks.forEach((k, j) => { v[j + 2] = Math.pow(0.12 * p[k] * g, 2); });
    return v;
  }
  // One stat line at g games as a team-total entry: { x, pv }, what buildContext gives a pool player with IL fill off (Team tab, 2026-10-26).
  function entryVec(line, ctx, g) { return { x: vec(line, ctx, g), pv: projVar(line, g) }; }
  // Per-game noise variance per player, in each category's own units (the games-played variance is separate, see pairTeam).
  function perGameVar(p) {
    const v = new Float64Array(NC);
    v[0] = p.fga * p.fgp * (1 - p.fgp) * 0.932; v[1] = p.fta * p.ftp * (1 - p.ftp) * 1.115;
    v[2] = 1.154 * p.tpm; v[3] = 5.38 * Math.pow(Math.max(p.pts, 0), 0.78); v[4] = 1.336 * p.reb; v[5] = 1.251 * p.ast;
    v[6] = 1.066 * p.stl; v[7] = 1.109 * p.blk; v[8] = 1.022 * p.to;
    return v;
  }
  // Weekly noise variance per player (one week, per-week units).
  function weekVar(p, ctx, g) {
    const G = GPW * g / 82;
    const v = new Float64Array(NC);
    const fgEx = p.fgp * p.fga - ctx.pFG * p.fga, ftEx = p.ftp * p.fta - ctx.pFT * p.fta;
    // Per-game variances fitted on 2023-24 to 2025-26 game logs (723 player-seasons, 25+ games, 20+ mpg)
    v[0] = G * p.fga * p.fgp * (1 - p.fgp) * 0.932 + fgEx * fgEx * VAR_GAMES;
    v[1] = G * p.fta * p.ftp * (1 - p.ftp) * 1.115 + ftEx * ftEx * VAR_GAMES;
    const pg = { tpm: [p.tpm, 1.154 * p.tpm], pts: [p.pts, 5.38 * Math.pow(Math.max(p.pts, 0), 0.78)], reb: [p.reb, 1.336 * p.reb], ast: [p.ast, 1.251 * p.ast], stl: [p.stl, 1.066 * p.stl], blk: [p.blk, 1.109 * p.blk], to: [p.to, 1.022 * p.to] };
    ['tpm', 'pts', 'reb', 'ast', 'stl', 'blk', 'to'].forEach((k, j) => { const [m, vv] = pg[k]; v[j + 2] = G * vv + m * m * VAR_GAMES; });
    return v;
  }

  // Category weights: cfg.catW[c] (0 = punt, 1 = normal); older saves may only have cfg.punt.
  function catWeights(cfg) {
    const w = new Array(NC).fill(1);
    if (Array.isArray(cfg.catW)) for (let c = 0; c < NC; c++) { const v = +cfg.catW[c]; w[c] = isFinite(v) && v >= 0 ? v : 1; }
    else if (Array.isArray(cfg.punt)) cfg.punt.forEach(c => { w[c] = 0; });
    if (cfg.cats !== 9) w[TO] = 0;
    return w;
  }

  // ---------- playoff boost ----------
  // Chance a player drafted with `roundsLeft` rounds still to come (0 = last round) is on the drafting team when the
  // fantasy playoffs start. Fitted on LOFB Bowl 2022-24 (50 real 12-team 9-cat drafts): 25% for a last-round pick,
  // 54% with 3 rounds left, 88% with 8, about 95% early (trades and season-ending injuries).
  function playoffSurvival(roundsLeft) { return 0.965 / (1 + Math.exp(1.04 - 0.43 * Math.max(0, roundsLeft))); }
  // Playoff multiplier: 1 + strength × edge (his playoff games ÷ league average − 1), with the edge scaled by the
  // survival chance when `surv` is given; kept within ×0.5–×1.5.
  function playoffMult(edge, lam, surv) {
    if (!lam) return 1;
    return Math.max(0.5, Math.min(1.5, 1 + lam * (surv == null ? 1 : surv) * edge));
  }
  const PO_STRENGTH = { off: 0, light: 0.25, medium: 0.5, strong: 0.75, vstrong: 1 };

  // ---------- draft order ----------
  function teamAt(pick, N, order) {
    const r = Math.floor(pick / N), i = pick % N;
    let rev;
    if (order === '3rr') rev = r === 0 ? false : (r === 1 ? true : r % 2 === 0);
    else rev = r % 2 === 1;
    return rev ? N - 1 - i : i;
  }

  // ---------- league context (pool averages, Board scaling, weekly noise) ----------
  // One pass of simulated ADP drafts for a given games function: pool averages and team spread.
  function scaleFor(players, cfg, ctx, gOf) {
    const N = cfg.teams, R = cfg.roster, src = cfg.adpSrc;
    const X = players.map(p => { const x = vec(p, ctx, gOf(p)); if (ctx.ilFill && ctx.pgRepl) { const miss = Math.max(0, SEASON_G - gOf(p)) * ctx.ilFill; for (let c = 0; c < NC; c++) x[c] += miss * ctx.pgRepl[c]; } return x; });
    const WV = players.map(p => weekVar(p, ctx, gOf(p)));
    const PG = players.map(p => vec(p, ctx, 1));   // per-game category vector (signed, TO negative)
    const r = rng(1234 + N * 31 + R);
    const SIMS = 80;
    const sum = new Float64Array(NC), sq = new Float64Array(NC), wsum = new Float64Array(NC), dsum = new Float64Array(NC);
    const s1 = new Float64Array(NC), s2 = new Float64Array(NC), wpg = new Float64Array(NC); let rN = 0;
    let teamsN = 0, dN = 0;
    for (let s = 0; s < SIMS; s++) {
      const draws = players.map((p, i) => ({ i, t: adpOf(p, src) + gauss(r) * adpSd(p, src, cfg.sdModel) })).sort((a, b) => a.t - b.t);
      const tot = Array.from({ length: N }, () => new Float64Array(NC));
      const wk = Array.from({ length: N }, () => new Float64Array(NC));
      const picks = Math.min(N * R, draws.length);
      for (let k = 0; k < picks; k++) {
        const t = teamAt(k, N, cfg.order), i = draws[k].i;
        for (let c = 0; c < NC; c++) { tot[t][c] += X[i][c]; wk[t][c] += WV[i][c]; dsum[c] += X[i][c];
          const m = PG[i][c]; s1[c] += m; s2[c] += m * m; wpg[c] += WV[i][c] - m * m * VAR_GAMES; }
        dN++; rN++;
      }
      for (let t = 0; t < N; t++) { for (let c = 0; c < NC; c++) { sum[c] += tot[t][c]; sq[c] += tot[t][c] * tot[t][c]; wsum[c] += wk[t][c]; } teamsN++; }
    }
    const avgX = Array.from(dsum, v => v / dN);
    const teamSd = Array.from(sum, (v, c) => { const m = v / teamsN; return Math.sqrt(Math.max(1e-9, sq[c] / teamsN - m * m)); });
    const teamWeekVar = Array.from(wsum, v => v / teamsN);
    // Zscore sums each category's z times its weight; weight 0 = punted
    const W = catWeights(cfg);
    const zFrom = (x, sd) => {
      const bc = new Float64Array(NC); let b = 0;
      for (let c = 0; c < NC; c++) { bc[c] = (x[c] - avgX[c]) / sd[c]; b += bc[c] * W[c]; }
      const worst = []; for (let c = 0; c < NC; c++) if (W[c] > 0) worst.push(c);
      worst.sort((a, b2) => bc[a] * W[a] - bc[b2] * W[b2]);
      const d = i => worst[i] != null ? bc[worst[i]] * W[worst[i]] : 0;
      let raw = 0; for (let c = 0; c < NC; c++) if (c !== TO || cfg.cats === 9) raw += bc[c];
      return { b, raw, bc, z: [b, b - d(0), b - d(0) - d(1)], drop: worst.slice(0, 2) };
    };
    // True Zscore (2026-10-18): the classic z-score BBM and Hashtag show. Each category's mean and sd are taken over the
    // top N × R players by their own value (re-ranked until the pool settles), not over simulated drafts and team totals.
    // Shown when the page's Zscore type is "Zscore"; the Model pick reads it only when cfg.slideZ = 'true' (backtests).
    const K = Math.min(X.length, N * R);
    let rankV = X.map(x => { let v = 0; for (let c = 0; c < NC; c++) v += (x[c] - avgX[c]) / teamSd[c] * W[c]; return v; });
    let tMean = avgX.slice(), tSd = teamSd.slice();
    for (let it = 0; it < 4; it++) {
      const pool = rankV.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, K).map(a => a[1]);
      tMean = Array.from({ length: NC }, (_, c) => pool.reduce((s, i) => s + X[i][c], 0) / K);
      tSd = Array.from({ length: NC }, (_, c) => Math.sqrt(Math.max(1e-9, pool.reduce((s, i) => s + (X[i][c] - tMean[c]) ** 2, 0) / K)));
      rankV = X.map(x => { let v = 0; for (let c = 0; c < NC; c++) v += (x[c] - tMean[c]) / tSd[c] * W[c]; return v; });
    }
    const zTrue = x => { const bc = new Float64Array(NC); let b = 0;
      for (let c = 0; c < NC; c++) { bc[c] = (x[c] - tMean[c]) / tSd[c]; b += bc[c] * W[c]; }
      const worst = []; for (let c = 0; c < NC; c++) if (W[c] > 0) worst.push(c);
      worst.sort((a, b2) => bc[a] * W[a] - bc[b2] * W[b2]);
      const d = i => worst[i] != null ? bc[worst[i]] * W[worst[i]] : 0;
      return { bc, z: [b, b - d(0), b - d(0) - d(1)], drop: worst.slice(0, 2) }; };
    // Field value (2026-10-18): how the room ranks players by value, for There at / Lasts to when cfg.fieldZ = 'std' (the
    // page). Standard Zscore with fixed weights, every category ×1 and TO ×0.5 (×0 in 8-cat), the way most drafters read
    // BBM/Hashtag. Fixed: the user's category weights and Zscore type never move it.
    const Wf = Array.from({ length: NC }, (_, c) => c === TO ? (cfg.cats === 9 ? 0.5 : 0) : 1);
    let fV = X.map(x => { let v = 0; for (let c = 0; c < NC; c++) v += (x[c] - avgX[c]) / teamSd[c] * Wf[c]; return v; });
    let fMean = avgX.slice(), fSd = teamSd.slice();
    for (let it = 0; it < 4; it++) {
      const pool = fV.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, K).map(a => a[1]);
      fMean = Array.from({ length: NC }, (_, c) => pool.reduce((s, i) => s + X[i][c], 0) / K);
      fSd = Array.from({ length: NC }, (_, c) => Math.sqrt(Math.max(1e-9, pool.reduce((s, i) => s + (X[i][c] - fMean[c]) ** 2, 0) / K)));
      fV = X.map(x => { let v = 0; for (let c = 0; c < NC; c++) v += (x[c] - fMean[c]) / fSd[c] * Wf[c]; return v; });
    }
    const boards = X.map((x, i) => { const o = zFrom(x, teamSd); o.cl = zTrue(x); o.fv = fV[i]; return o; });
    // Shared games factor: a team's weekly total in every category moves with how many player-games it gets.
    // Per team: loading = average per-game production, factor variance = n * SIGMA_G2, rest is per-category noise.
    const nT = rN / teamsN, corr = { n: nT, load: new Float64Array(NC), idio: new Float64Array(NC), sigD2: nT * SIGMA_G2 };
    for (let c = 0; c < NC; c++) {
      const S1 = s1[c] / teamsN, S2 = s2[c] / teamsN, PGv = wpg[c] / teamsN;
      corr.load[c] = S1 / nT;
      corr.idio[c] = Math.max(1e-9, PGv + SIGMA_G2 * Math.max(0, S2 - S1 * S1 / nT));
    }
    return { X, WV, avgX, teamSd, teamWeekVar, boards, corr };
  }

  // ---------- league context (pool averages, Board scaling, weekly noise) ----------
  // cfg.basis: 'total' values season totals (projected games count); 'pergame' gives every player
  // the same games, so value comes from per-game production only.
  function buildContext(players, cfg) {
    const N = cfg.teams, R = cfg.roster, src = cfg.adpSrc;
    const byAdp = players.slice().sort((a, b) => adpOf(a, src) - adpOf(b, src));
    const pool = byAdp.slice(0, Math.min(players.length, N * R));
    let fgm = 0, fga = 0, ftm = 0, fta = 0, gs = 0;
    pool.forEach(p => { fgm += p.fgm; fga += p.fgaT; ftm += p.ftm; fta += p.ftaT; gs += p.g; });
    const ctx = { pFG: fgm / fga, pFT: ftm / fta, G0: gs / pool.length, basis: ['pergame', 'mix'].includes(cfg.basis) ? cfg.basis : 'total' };
    const G0 = ctx.G0;
    // Replacement level: per-game production of the best players left after the draft (the free-agent tier)
    { const fa = byAdp.slice(Math.min(byAdp.length - 1, N * R), Math.min(byAdp.length, N * R + 20)); ctx.pgRepl = new Float64Array(NC);
      fa.forEach(p => { const v = vec(p, ctx, 1); for (let c = 0; c < NC; c++) ctx.pgRepl[c] += v[c] / fa.length; }); }
    // IL spots: games a player misses are partly filled by a replacement on your roster (share grows with IL spots)
    // Share of missed games filled, by IL spots: 2 spots kept at the backtested 0.70; the curve follows real coverage with
    // overlapping absences (il_cover.py, 2022-26 logs: absences of 3+ games, 0.45 / 0.66 / 0.74 / 0.76 for 1-4 spots).
    // Old line: min(0.9, 0.35 × spots). cfg.ilShare (backtests) sets the share directly.
    const k = Math.max(0, Math.min(4, +cfg.ilSpots || 0)), f = Math.floor(k);
    ctx.ilFill = cfg.ilShare != null ? +cfg.ilShare : IL_FILL[f] + (k - f) * ((IL_FILL[f + 1] ?? IL_FILL[f]) - IL_FILL[f]);
    const tot = scaleFor(players, cfg, ctx, p => p.g);
    const pg = scaleFor(players, cfg, ctx, () => G0);
    // Mix: halfway between season and per game. Every category is linear in games, so the
    // midpoint of the two games counts gives exactly the average of the two stat lines.
    // cfg.missW (0..1): share of projected missed games that counts — G0 + w × (g − G0); 1 = Season, 0 = Per game, 0.5 = Mix
    const mw = cfg.missW != null ? Math.max(0, Math.min(1, +cfg.missW)) : null;
    // cfg.riskK (backtests, 2026-10-17): convex injury discount, extra missed games = 82 × k × max(0, missed share − 0.15)²
    // cfg.knownW (2026-10-17): players out at the start of the season (p.kg known missed games, from BBM's injury note)
    // get a share of those games credited back at their usual availability, since early absences hurt the regular season
    // (where you only need to qualify) and not the playoffs.
    const kw = +cfg.knownW || 0, gK = p => (kw && p.kg > 0 ? Math.min(82, p.g + kw * p.kg * p.g / Math.max(1, 82 - p.kg)) : p.g);
    const rk = +cfg.riskK || 0, gR = rk ? (p => Math.max(1, gK(p) - 82 * rk * Math.pow(Math.max(0, 1 - gK(p) / 82 - 0.15), 2))) : gK;
    const gOf = mw != null ? (p => G0 + mw * (gR(p) - G0)) : ctx.basis === 'pergame' ? (() => G0) : ctx.basis === 'mix' ? (p => (gR(p) + G0) / 2) : (p => gR(p));
    const act = mw != null ? scaleFor(players, cfg, ctx, gOf) : ctx.basis === 'pergame' ? pg : ctx.basis === 'mix' ? scaleFor(players, cfg, ctx, gOf) : tot;
    players.forEach((p, i) => {
      p.x = act.X[i]; p.wv = act.WV[i]; p.pv = projVar(p, gOf(p));
      p.board = act.boards[i].b; p.boardRaw = act.boards[i].raw; p.boardC = act.boards[i].bc; p.z = act.boards[i].z; p.zDrop = act.boards[i].drop;
      p.zCl = act.boards[i].cl;   // true (classic) Zscore
      p.fieldV = act.boards[i].fv;   // the room's value: Standard Zscore, TO ×0.5, fixed weights
    });
    ctx.avgX = act.avgX; ctx.teamSd = act.teamSd; ctx.teamWeekVar = act.teamWeekVar;
    ctx.h2hNoise = ctx.teamWeekVar.map(v => 2 * v * WEEKS * WEEKS);
    ctx.corr = act.corr;
    ctx.idioNoise = Array.from(act.corr.idio, v => 2 * v * WEEKS * WEEKS);          // season units, per pair
    ctx.gapSd = Math.sqrt(2 * act.corr.sigD2);                                      // weekly games gap between two teams
    ctx.loadS = Array.from(act.corr.load, l => l * WEEKS);                           // season units per game of gap
    // cfg.noiseK (backtests, 2026-10-17): scales the weekly matchup noise. Summing 2 weeks halves the noise variance
    // relative to the gap, so 0.5 = a 2-week playoff matchup; the board leaves it unset (1 = one-week matchups).
    { const nk = cfg.noiseK != null ? +cfg.noiseK : 1;
      if (nk !== 1) { ctx.h2hNoise = ctx.h2hNoise.map(v => v * nk); ctx.idioNoise = ctx.idioNoise.map(v => v * nk); ctx.gapSd *= Math.sqrt(nk); } }
    // H2H-adjusted Zscore (2026-10-18, backtests: slide.zKind 'h2h'): each category's z in units of the spread of a weekly
    // head-to-head gap between two teams, season difference plus week-to-week noise (with the shared games factor), the
    // same noise Win C uses. Volatile categories (steals, points) count less than in the team-spread Zscore.
    { const Wh = catWeights(cfg), sdH = ctx.teamSd.map((s, c) => Math.sqrt(s * s + (ctx.idioNoise[c] + Math.pow(ctx.loadS[c] * ctx.gapSd, 2)) / 2));
      players.forEach(p => { const bc = new Float64Array(NC); let b = 0;
        for (let c = 0; c < NC; c++) { bc[c] = (p.x[c] - ctx.avgX[c]) / sdH[c]; b += bc[c] * Wh[c]; }
        const worst = []; for (let c = 0; c < NC; c++) if (Wh[c] > 0) worst.push(c);
        worst.sort((a, b2) => bc[a] * Wh[a] - bc[b2] * Wh[b2]);
        const d = i => worst[i] != null ? bc[worst[i]] * Wh[worst[i]] : 0;
        p.zH = { bc, z0: b, z: [b, b - d(0), b - d(0) - d(1)], drop: worst.slice(0, 2) }; });
      ctx.sdH = sdH; }
    // Streamability: with weekly adds, a team behind in a counting category can stream players who help there.
    // Per category: (best free agents' per-game production − a generic streamer's) × streamer games aimed at that
    // category per week, as a share of how far apart two teams typically finish in a week. Capped at 60%.
    // Every category gap then counts for (1 − streamability): in Gain, Gain M, standings and scarcity.
    // Not exposed on the board (cfg.weeklyAdds is never set there): backtest 2026-10-16 with targeted streaming in every
    // league, 4 adds vs 0 = −2.1 ± 0.9 matchup pts. Kept for a future version that credits only out-streaming opponents.
    ctx.stream = new Float64Array(NC); ctx.streamK = new Float64Array(NC).fill(1);
    const adds = Math.min(STREAM_MAX_ADDS, Math.max(0, +cfg.weeklyAdds || 0));
    if (adds > 0) {
      const fa = byAdp.slice(Math.min(byAdp.length - 1, N * R), Math.min(byAdp.length, N * R + 40)).map(p => vec(p, ctx, 1));
      const vol = adds * STREAM_GPA * STREAM_SHARE;
      for (let c = 0; c < NC; c++) {
        const vals = fa.map(v => v[c]).sort((a, b) => b - a);
        const top = vals.slice(0, 5).reduce((a, b) => a + b, 0) / Math.min(5, vals.length);
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        const weekGap = Math.SQRT2 * ctx.teamSd[c] / WEEKS;
        ctx.stream[c] = Math.min(STREAM_CAP, Math.max(0, top - avg) * vol / Math.max(1e-9, weekGap));
        ctx.streamK[c] = 1 - ctx.stream[c];
      }
    }
    const rankBy = (key, out) => players.slice().sort((a, b) => b[key] - a[key]).forEach((p, i) => { p[out] = i + 1; });
    rankBy('board', 'boardRank');
    players.forEach(p => { p.zRank = [0, 0, 0]; });
    [0, 1, 2].forEach(d => players.slice().sort((a, b) => b.z[d] - a.z[d]).forEach((p, i) => { p.zRank[d] = i + 1; }));
    players.forEach(p => { p.adpUse = adpOf(p, src); p.sd = adpSd(p, src, cfg.sdModel) * (cfg.sdK != null ? +cfg.sdK : 1);   /* cfg.sdK: backtests only (2026-10-17) */ p.edge = p.adpUse - p.boardRank; });
    ctx.swing = ctx.teamWeekVar.map((v, c) => Math.sqrt(2 * v) / (ctx.teamSd[c] / WEEKS));
    // Punt synergy: correlation of category z among the players likely to be drafted. Pairs where weakness
    // in one category goes with weakness in the other let you stack the same player type.
    {
      const nc = cfg.cats === 9 ? NC : NC - 1;
      const pl = players.slice().sort((a, b) => a.adpUse - b.adpUse).slice(0, Math.min(players.length, N * R));
      const n = pl.length, m = [], sd = [];
      for (let c = 0; c < nc; c++) { m[c] = pl.reduce((s, p) => s + p.boardC[c], 0) / n; sd[c] = Math.sqrt(pl.reduce((s, p) => s + (p.boardC[c] - m[c]) ** 2, 0) / n) || 1; }
      const pairs = [];
      for (let a = 0; a < nc; a++) for (let b = a + 1; b < nc; b++) pairs.push([a, b, pl.reduce((s, p) => s + (p.boardC[a] - m[a]) * (p.boardC[b] - m[b]), 0) / n / sd[a] / sd[b]]);
      const r = {}; pairs.forEach(([a, b, v]) => { r[a + '_' + b] = v; });
      const tri = [];
      for (let a = 0; a < nc; a++) for (let b = a + 1; b < nc; b++) for (let c = b + 1; c < nc; c++) tri.push([a, b, c, (r[a + '_' + b] + r[a + '_' + c] + r[b + '_' + c]) / 3]);
      ctx.synPairs = pairs.sort((x, y) => y[2] - x[2]);
      ctx.synTriples = tri.sort((x, y) => y[3] - x[3]);
    }
    return ctx;
  }

  // ---------- punt strategies ----------
  // Common punt builds (category indexes: 0 FG%, 1 FT%, 2 3PM, 3 PTS, 4 REB, 5 AST, 6 ST, 7 BLK, 8 TO)
  const PUNT_COMMON = [[5, 8], [4, 7], [1, 2], [1, 8], [1, 5], [0, 8], [0, 4], [3, 8], [2, 5],
    [0, 4, 7], [1, 5, 8], [1, 2, 5], [2, 5, 8], [5, 6, 8], [0, 3, 8], [1, 2, 8], [0, 1, 8]];
  const PUNT_SET = 'all';
  function strategiesFor(cfg, ctx) {
    const nc = cfg.cats === 9 ? NC : NC - 1;
    const L = CATS.map(c => c.l);
    const mk = pr => ({ id: 'p' + pr.join('_'), label: 'Punt ' + pr.map(c => L[c]).join(' + '), punt: pr, size: pr.length });
    const out = [{ id: 'none', label: 'No punt', punt: [], size: 0 }];
    for (let c = 0; c < nc; c++) out.push({ id: 'p' + c, label: 'Punt ' + L[c], punt: [c], size: 1 });
    const set = cfg.puntSet || PUNT_SET;
    // Auto only blends the strategies marked auto: no punt, single punts and the top synergy pairs.
    // Backtests: blending all 130 doubles and triples chased strategies that only looked good by chance.
    const AUTO_PAIRS = ['p5_8', 'p4_7', 'p1_2'];
    out.forEach(s => { s.auto = true; });
    if (set === 'basic') { [[5, 8], [4, 7], [1, 2]].forEach(pr => { if (pr.every(c => c < nc)) out.push(Object.assign(mk(pr), { auto: true })); }); return out; }
    // 'synPtT': singles + top P synergy pairs + top T synergy triples (e.g. syn8t2)
    // '+to' suffix (e.g. syn8t0+to): also every pair with TO. Synergy never ranks TO pairs, because players weak in TO
    // are high-usage stars who are strong elsewhere, not weak.
    // 'thrNN' (e.g. thr40): every pair and triple with synergy ≥ NN/100, recomputed from each season's projections.
    // '+to': also every pair with TO. '+tt': also TO added to each stand-out non-TO pair when that triple's synergy ≥ 0.15
    // (the "guard" builds FG%/REB/BLK + TO; TO next to PTS/AST/3PM has negative synergy).
    if (set.startsWith('thr') && ctx && ctx.synPairs) {
      const cut = +set.match(/^thr(\d+)/)[1] / 100, add = (pr) => { const id = 'p' + pr.join('_'); if (!out.some(s => s.id === id)) out.push(Object.assign(mk(pr), { auto: true })); };
      const standout = ctx.synPairs.filter(p => p[2] >= cut);
      standout.forEach(([a, b]) => add([a, b]));
      ctx.synTriples.filter(t => t[3] >= cut).forEach(([a, b, c]) => add([a, b, c]));
      if (set.includes('+to') && cfg.cats === 9) for (let c = 0; c < TO; c++) add([c, TO]);
      if (set.includes('+tt') && cfg.cats === 9) standout.filter(p => p[0] !== TO && p[1] !== TO).forEach(([a, b]) => {
        const tr = [a, b, TO].sort((x, y) => x - y), syn = ctx.synTriples.find(t => t[0] === tr[0] && t[1] === tr[1] && t[2] === tr[2]);
        if (syn && syn[3] >= 0.15) add(tr);
      });
      return out;
    }
    if (set.startsWith('syn') && ctx && ctx.synPairs) {
      // '+tt3' suffix: also TO plus each of the top 3 synergy pairs, as triples (e.g. syn2t0+to+tt3)
      const ttm = set.match(/\+tt(\d+)$/), TT = ttm ? +ttm[1] : 0;
      const core = set.replace(/\+tt\d+$/, '');
      const withTO = core.endsWith('+to');
      const [P2 = 0, T3 = 0] = core.slice(3).replace('+to', '').split('t').map(x => +x || 0);   // 'syn20' = 20 pairs, no triples (a missing count used to mean all triples)
      ctx.synPairs.slice(0, P2).forEach(([a, b]) => out.push(Object.assign(mk([a, b]), { auto: true })));
      ctx.synTriples.slice(0, T3).forEach(([a, b, c]) => out.push(Object.assign(mk([a, b, c]), { auto: true })));
      if (withTO && cfg.cats === 9) for (let c = 0; c < TO; c++) { const id = 'p' + c + '_' + TO; if (!out.some(s => s.id === id)) out.push(Object.assign(mk([c, TO]), { auto: true })); }
      if (TT && cfg.cats === 9) ctx.synPairs.filter(pr => !pr.includes(TO)).slice(0, TT).forEach(([a, b]) => { const tr = [a, b, TO].sort((x, y) => x - y); const id = 'p' + tr.join('_'); if (!out.some(s => s.id === id)) out.push(Object.assign(mk(tr), { auto: true })); });
      return out;
    }
    else if (set === 'common') PUNT_COMMON.forEach(pr => { if (pr.every(c => c < nc)) out.push(mk(pr)); });
    else {
      for (let a = 0; a < nc; a++) for (let b = a + 1; b < nc; b++) out.push(mk([a, b]));
      for (let a = 0; a < nc; a++) for (let b = a + 1; b < nc; b++) for (let c = b + 1; c < nc; c++) out.push(mk([a, b, c]));
    }
    // Auto blends single punts plus the PUNT_SYN_PAIRS (20) most synergistic pairs from the current projections
    // (backtest: slightly ahead of fixed classic pairs; adding triples did not help)
    const autoPairs = ctx && ctx.synPairs ? ctx.synPairs.slice(0, PUNT_SYN_PAIRS).map(([a, b]) => 'p' + a + '_' + b) : AUTO_PAIRS;
    out.forEach(s => { if (s.size === 2 && autoPairs.includes(s.id)) s.auto = true; });
    if (cfg.puntAutoAll) out.forEach(s => { s.auto = true; });
    return out;
  }

  // ---------- availability ----------
  function survive(p, pick) { return 1 - Phi((pick - 0.5 - (p.adpE != null ? p.adpE : p.adpUse)) / (p.sdE != null ? p.sdE : p.sd)); }
  function availProb(p, from, to) {
    if (to <= from) return 1;
    const s0 = survive(p, from); if (s0 < 1e-9) return 0;
    return Math.min(1, survive(p, to) / s0);
  }

  // ---------- live evaluation ----------
  // state: { picks: Array(N*R) of player id | null }
  // Draft field: share of the room drafting by value instead of ADP. f = (kit-style + 0.5 × sharp) / 13 for opponent mixes
  // Easy 10 ADP / 2 sharp / 1 punter; Average 5 / 4 / 2 + 2 kit-style (the backtest league, = 4 kit users);
  // Strong 2 / 6 / 2 + 3; Very strong 0 / 6 / 2 + 5. Labelled guesses until fitted on a real draft against that day's ADP.
  const FIELD_F = { easy: 0.08, average: 0.31, strong: 0.46, vstrong: 0.62 };
  function evaluate(players, ctx, cfg, state) {
    const N = cfg.teams, R = cfg.roster, me = cfg.slot - 1, total = N * R;
    const nc = cfg.cats === 9 ? NC : NC - 1;
    const taken = new Set(state.picks.filter(v => v != null));
    // Opponents who draft with this board (cfg.oppBoard of the other teams) pick by board value, not ADP.
    // Each player's expected draft slot blends his ADP with where his value ranks among players left.
    {
      const cur0 = state.picks.indexOf(null), cur = cur0 < 0 ? total : cur0;
      // cfg.field (Draft field, 2026-10-17) sets the room's value weight f directly; otherwise f = kit users / (teams − 1)
      const f = cfg.field && FIELD_F[cfg.field] != null ? FIELD_F[cfg.field] : Math.min(1, Math.max(0, (+cfg.oppBoard || 0) / Math.max(1, N - 1)));
      players.forEach(p => { p.adpE = p.adpUse; p.sdE = p.sd; });
      if (f > 0) {
        // the room's value ranking: Standard Zscore with TO ×0.5 when cfg.fieldZ = 'std' (the page, 2026-10-18); else the
        // unweighted team-spread Zscore (backtests, where the simulated sharp drafters rank that way)
        const fvOf = cfg.fieldZ === 'std' ? (p => p.fieldV) : (p => p.boardRaw);
        const left = players.filter(p => !taken.has(p.id)).sort((a, b) => fvOf(b) - fvOf(a));
        left.forEach((p, i) => {
          const bAdp = cur + 1 + i, sb = 0.8 + 0.08 * i;
          p.adpE = (1 - f) * p.adpUse + f * bAdp;
          p.sdE = Math.sqrt((1 - f) * p.sd * p.sd + f * sb * sb + f * (1 - f) * Math.pow(p.adpUse - bAdp, 2));
        });
      }
    }
    const avail = players.filter(p => !taken.has(p.id)).sort((a, b) => a.adpE - b.adpE);

    const unfilled = [];
    for (let k = 0; k < total; k++) if (state.picks[k] == null) unfilled.push(k);
    const current = unfilled.length ? unfilled[0] : total; // 0-based pick on the clock
    // state.owner (optional): team index per pick from the host site, so traded picks land on the right team
    const tAt = k => (state.owner && state.owner[k] != null) ? state.owner[k] : teamAt(k, N, cfg.order);
    const myUnfilled = unfilled.filter(k => tAt(k) === me);
    const p1 = myUnfilled.length ? myUnfilled[0] : null;
    const p2 = myUnfilled.length > 1 ? myUnfilled[1] : null;

    // typical player at the j-th upcoming pick
    const M = unfilled.length;
    const typMean = [], typVar = [], typPv = [];
    const A = avail.length;
    for (let j = 0; j < M; j++) {
      const mean = new Float64Array(NC), vr = new Float64Array(NC), pv = new Float64Array(NC);
      if (A === 0) { typMean.push(mean); typVar.push(vr); typPv.push(pv); continue; }
      const c0 = Math.min(j, A - 1), w = 1.5 + 0.12 * j;
      const lo = Math.max(0, Math.floor(c0 - 3 * w)), hi = Math.min(A - 1, Math.ceil(c0 + 3 * w));
      let ws = 0;
      for (let i = lo; i <= hi; i++) {
        const wt = Math.exp(-0.5 * Math.pow((i - c0) / w, 2)); ws += wt;
        const x = avail[i].x, q = avail[i].pv;
        for (let c = 0; c < NC; c++) { mean[c] += wt * x[c]; pv[c] += wt * q[c]; }
      }
      for (let c = 0; c < NC; c++) { mean[c] /= ws; pv[c] /= ws; }
      for (let i = lo; i <= hi; i++) {
        const wt = Math.exp(-0.5 * Math.pow((i - c0) / w, 2)), x = avail[i].x;
        for (let c = 0; c < NC; c++) vr[c] += wt * Math.pow(x[c] - mean[c], 2);
      }
      for (let c = 0; c < NC; c++) vr[c] /= ws;
      typMean.push(mean); typVar.push(vr); typPv.push(pv);
    }
    const jOf = new Map(); unfilled.forEach((k, j) => jOf.set(k, j));

    // team forecasts
    const teams = Array.from({ length: N }, (_, t) => ({ t, mu: new Float64Array(NC), v: new Float64Array(NC), roster: [], left: 0 }));
    for (let k = 0; k < total; k++) {
      const t = tAt(k), T = teams[t];
      const pid = state.picks[k];
      if (pid != null) {
        const p = players[pid]; T.roster.push({ pick: k, p });
        for (let c = 0; c < NC; c++) { T.mu[c] += p.x[c]; T.v[c] += p.pv[c]; }
      } else {
        const j = jOf.get(k); T.left++;
        for (let c = 0; c < NC; c++) { T.mu[c] += typMean[j][c]; T.v[c] += 2 * typVar[j][c] + typPv[j][c]; }
      }
    }
    const noise = cfg.scoring === 'roto' ? new Float64Array(NC) : ctx.h2hNoise;
    const corrOn = cfg.scoring !== 'roto' && cfg.corr !== 'off' && ctx.corr;
    // marginal category win chance: with the games factor its full variance is idiosyncratic + factor
    const margNoise = corrOn ? ctx.idioNoise.map((v, c) => v + Math.pow(ctx.loadS[c] * ctx.gapSd, 2)) : noise;
    const SK = ctx.streamK || new Float64Array(NC).fill(1);   // streamability: share of each category gap that counts
    const winP = (a, av, b, bv, c) => Phi((a[c] - b[c]) * SK[c] / Math.sqrt(av[c] + bv[c] + margNoise[c] + 1e-9));

    // standings & my category chances
    // Matchup win chance: categories are independent given the weekly games gap, so average over the gap
    function pairMatch(a, av, b, bv) {
      if (!corrOn) { const ps = []; for (let c = 0; c < nc; c++) ps.push(winP(a, av, b, bv, c)); return matchProb(ps); }
      let M = 0; const ps = new Array(nc);
      for (let k = 0; k < GH_Z.length; k++) {
        const g = GH_Z[k] * ctx.gapSd;
        for (let c = 0; c < nc; c++) ps[c] = Phi(((a[c] - b[c]) * SK[c] + ctx.loadS[c] * g) / Math.sqrt(av[c] + bv[c] + ctx.idioNoise[c] + 1e-9));
        M += GH_W[k] * matchProb(ps);
      }
      return M;
    }
    function matchProb(ps) { // ps over nc categories -> P(win matchup) with ties counted half
      let dist = [1];
      for (const q of ps) { const nd = new Array(dist.length + 1).fill(0); dist.forEach((v, i) => { nd[i] += v * (1 - q); nd[i + 1] += v * q; }); dist = nd; }
      let w = 0; for (let i = 0; i < dist.length; i++) { if (2 * i > nc) w += dist[i]; else if (2 * i === nc) w += 0.5 * dist[i]; }
      return w;
    }
    const standings = teams.map(A_ => {
      let roto = 0, cats = 0, match = 0;
      for (let c = 0; c < nc; c++) roto += 1;
      teams.forEach(B => {
        if (B === A_) return;
        const ps = [];
        for (let c = 0; c < nc; c++) { const q = winP(A_.mu, A_.v, B.mu, B.v, c); ps.push(q); roto += q; cats += q; }
        match += pairMatch(A_.mu, A_.v, B.mu, B.v);
      });
      return { t: A_.t, roto, cats: cats / (N - 1), match };
    });
    const meT = teams[me];
    const myChance = new Float64Array(NC);
    teams.forEach(B => { if (B === meT) return; for (let c = 0; c < NC; c++) myChance[c] += winP(meT.mu, meT.v, B.mu, B.v, c) / (N - 1); });

    // gains
    // Matchup win chance against each other team: more categories won than lost, ties count half
    const myMatch = teams.filter(B => B !== meT).map(B => {
      const ps = []; for (let c = 0; c < nc; c++) ps.push(winP(meT.mu, meT.v, B.mu, B.v, c));
      return { t: B.t, p: pairMatch(meT.mu, meT.v, B.mu, B.v) };
    });
    const out = { current, p1, p2, unfilled, avail, teams, standings, myChance, myMatch, rows: [], pairProb: (A, B) => pairMatch(A.mu, A.v, B.mu, B.v), catProb: (A, B, c) => winP(A.mu, A.v, B.mu, B.v, c) };
    if (p1 == null) { players.forEach(p => { p.gain = 0; p.gainM = 0; p.gainC = new Float64Array(NC); }); return out; }
    const j1 = jOf.get(p1);
    // Baseline: the slot filled by a replacement-level player (best of what is left once the draft ends),
    // so Gain reads as how much a player raises your chances over leaving the pick to waivers.
    const rep = new Float64Array(NC), repPv = new Float64Array(NC);
    { const c0 = Math.min(M, A - 1), lo = Math.max(0, c0 - 4), hi = Math.min(A - 1, c0 + 4); let n = 0;
      for (let i = lo; i <= hi; i++) { n++; for (let c = 0; c < NC; c++) { rep[c] += avail[i].x[c]; repPv[c] += avail[i].pv[c]; } }
      for (let c = 0; c < NC; c++) { rep[c] /= n; repPv[c] /= n; } }
    // With weekly adds, the slot you are filling is worth at least a streaming spot all season
    // streamer baseline (cfg.streamBase = adds/week): not exposed, backtest showed no change in picks
    if ((+cfg.streamBase || 0) > 0 && ctx.pgRepl) { const sg = STREAM_G * Math.min(1, (+cfg.streamBase) / 4); for (let c = 0; c < NC; c++) rep[c] = Math.max(rep[c], ctx.pgRepl[c] * sg); }
    const opps = teams.filter(T => T !== meT);
    // cfg.fast (backtests): skip work that only feeds the page, and run punt-plan Gain passes on the top 40 only
    const fast = !!cfg.fast;
    const cand = fast ? avail.slice() : avail.concat([...taken].map(id => players[id]));
    const L = cand.length;
    // Gains for one forecast of my team: meMu/meV is my full forecast, slot* is what it assumed at my next pick,
    // mask[c] = 1 for categories that count toward Gain C (0 = punted under a strategy)
    function gainsFor(meMu, meV, slotMean, slotVar, slotPv, mask, inSub) {
      const baseMu = meMu.slice(), baseV = meV.slice();
      for (let c = 0; c < NC; c++) { baseMu[c] += rep[c] - slotMean[c]; baseV[c] += repPv[c] - slotPv[c] - 2 * slotVar[c]; }
      // baseline probabilities and (for most-cats) how often each category decides the week
      const baseP = opps.map(B => { const a = new Float64Array(NC); for (let c = 0; c < NC; c++) a[c] = winP(baseMu, baseV, B.mu, B.v, c); return a; });
      // Gain M baseline: chance of winning the whole matchup (more categories than the opponent, ties count half)
      const baseMatch = opps.map(B => pairMatch(baseMu, baseV, B.mu, B.v));
      let piv = null, pivScale = 1;
      if (cfg.scoring === 'most') {
        piv = baseP.map(ps => {
          const arr = new Float64Array(NC);
          for (let c = 0; c < nc; c++) {
            const others = []; for (let d = 0; d < nc; d++) if (d !== c) others.push(ps[d]);
            // P(win | c won) - P(win | c lost)
            let dist = [1];
            for (const q of others) { const nd = new Array(dist.length + 1).fill(0); dist.forEach((v, i) => { nd[i] += v * (1 - q); nd[i + 1] += v * q; }); dist = nd; }
            const win = add => { let w = 0; for (let i = 0; i < dist.length; i++) { const k = i + add; if (2 * k > nc) w += dist[i]; else if (2 * k === nc) w += 0.5 * dist[i]; } return w; };
            arr[c] = win(1) - win(0);
          }
          return arr;
        });
        let s = 0, n = 0; piv.forEach(a => { for (let c = 0; c < nc; c++) { s += a[c]; n++; } }); pivScale = s / n || 1;
      }
      const G = new Float64Array(L), GM = new Float64Array(L), GC = new Float64Array(L * NC);
      const mu = new Float64Array(NC), v = new Float64Array(NC), q = new Array(nc);
      for (let i = 0; i < L; i++) {
        if (inSub && !inSub[i]) continue;
        const p = cand[i];
        for (let c = 0; c < NC; c++) { mu[c] = baseMu[c] - rep[c] + p.x[c]; v[c] = baseV[c] - repPv[c] + p.pv[c]; }
        let gm = 0;
        opps.forEach((B, oi) => {
          for (let c = 0; c < nc; c++) {
            q[c] = winP(mu, v, B.mu, B.v, c);
            let d = q[c] - baseP[oi][c];
            if (piv) d *= piv[oi][c] / pivScale;
            GC[i * NC + c] += d / opps.length;
          }
          gm += (pairMatch(mu, v, B.mu, B.v) - baseMatch[oi]) / opps.length;
        });
        // Gain C counts every scoring category equally (user category weights only affect Zscore)
        let g = 0; for (let c = 0; c < nc; c++) { if (!mask[c]) GC[i * NC + c] = 0; g += GC[i * NC + c]; }
        G[i] = g; GM[i] = gm;
      }
      return { G, GM, GC };
    }
    const allOn = new Array(NC).fill(1);
    let res0 = gainsFor(meT.mu, meT.v, typMean[j1], typVar[j1], typPv[j1], allOn);

    // ---------- punt strategies ----------
    // For each strategy, my open picks are forecast as players near their ADP, tilted toward players
    // who fit it (weight × exp(β · Zscore without the punted categories)). V = my average matchup win
    // chance if I follow it. Punt-aware Gain blends each strategy's Gain by softmax(V / τ), or uses the locked one.
    const beta = cfg.puntBeta != null ? cfg.puntBeta : PUNT_BETA, tau = cfg.puntTau != null ? cfg.puntTau : PUNT_TAU;
    const strats = strategiesFor(cfg, ctx);
    const myJ = myUnfilled.map(k => jOf.get(k));
    const myDrafted = { mu: new Float64Array(NC), v: new Float64Array(NC) };
    teams[me].roster.forEach(r => { for (let c = 0; c < NC; c++) { myDrafted.mu[c] += r.p.x[c]; myDrafted.v[c] += r.p.pv[c]; } });
    function tiltedSlot(j, zOf) {
      const mean = new Float64Array(NC), vr = new Float64Array(NC), pv = new Float64Array(NC);
      if (A === 0) return { mean, vr, pv };
      const c0 = Math.min(j, A - 1), w = 1.5 + 0.12 * j;
      const lo = Math.max(0, Math.floor(c0 - 3 * w)), hi = Math.min(A - 1, Math.ceil(c0 + 3 * w));
      const wts = []; let ws = 0, zmax = -Infinity;
      for (let i = lo; i <= hi; i++) zmax = Math.max(zmax, zOf(avail[i]));
      for (let i = lo; i <= hi; i++) { const wt = Math.exp(-0.5 * Math.pow((i - c0) / w, 2) + beta * (zOf(avail[i]) - zmax)); wts.push(wt); ws += wt; }
      for (let i = lo; i <= hi; i++) { const wt = wts[i - lo] / ws, x = avail[i].x, qv = avail[i].pv; for (let c = 0; c < NC; c++) { mean[c] += wt * x[c]; pv[c] += wt * qv[c]; } }
      for (let i = lo; i <= hi; i++) { const wt = wts[i - lo] / ws, x = avail[i].x; for (let c = 0; c < NC; c++) vr[c] += wt * Math.pow(x[c] - mean[c], 2); }
      return { mean, vr, pv };
    }
    const stratsEval = !fast ? strats : ((cfg.puntMode || 'off') === 'off' && !cfg.puntLock) ? [] : strats.filter(S => S.auto || S.id === cfg.puntLock);
    const stratRes = stratsEval.map(S => {
      const mask = new Array(NC).fill(1); S.punt.forEach(c => { mask[c] = 0; });
      const zOf = p => { let z = 0; for (let c = 0; c < nc; c++) if (mask[c]) z += p.boardC[c]; return z; };
      const mu = myDrafted.mu.slice(), v = myDrafted.v.slice();
      let slot1 = null;
      myJ.forEach(j => {
        const s = tiltedSlot(j, zOf);
        for (let c = 0; c < NC; c++) { mu[c] += s.mean[c]; v[c] += 2 * s.vr[c] + s.pv[c]; }
        if (j === j1) slot1 = s;
      });
      let V = 0; const catP = new Float64Array(NC); opps.forEach(B => { const ps = []; for (let c = 0; c < nc; c++) { const q = winP(mu, v, B.mu, B.v, c); ps.push(q); catP[c] += q / opps.length; } V += pairMatch(mu, v, B.mu, B.v) / opps.length; });
      return { S, mask, mu, v, slot1, V, catP };
    });
    const mode = cfg.puntMode || 'off';
    const lockId = cfg.puntLock || '';
    let wts = null;
    if (mode !== 'off' || lockId) {
      if (lockId && stratsEval.some(S => S.id === lockId)) wts = stratRes.map(r => r.S.id === lockId ? 1 : 0);
      else { const vmax = Math.max(...stratRes.filter(r => r.S.auto).map(r => r.V)); const e = stratRes.map(r => r.S.auto ? Math.exp((r.V - vmax) / tau) : 0); const es = e.reduce((a, b) => a + b, 0); wts = e.map(x => x / es); }
      const G = new Float64Array(L), GM = new Float64Array(L), GC = new Float64Array(L * NC);
      // only the strongest strategies get a full Gain pass (the rest carry negligible weight)
      const keep = new Set(wts.map((w, k) => [w, k]).sort((a, b) => b[0] - a[0]).slice(0, PUNT_TOPK).map(x => x[1]));
      wts = wts.map((w, k) => keep.has(k) && w >= 1e-4 ? w : 0);
      let inSub = null;
      if (fast && L > 40) { inSub = new Uint8Array(L); Array.from(res0.GM, (g, i) => [g, i]).sort((a, b) => b[0] - a[0]).slice(0, 40).forEach(([, i]) => { inSub[i] = 1; }); }
      stratRes.forEach((r, k) => {
        if (wts[k] < 1e-4) return;
        const g = gainsFor(r.mu, r.v, r.slot1.mean, r.slot1.vr, r.slot1.pv, r.mask, inSub);
        for (let i = 0; i < L; i++) { G[i] += wts[k] * g.G[i]; GM[i] += wts[k] * g.GM[i]; }
        for (let i = 0; i < L * NC; i++) GC[i] += wts[k] * g.GC[i];
      });
      const ws = wts.reduce((a, b, k) => a + (b >= 1e-4 ? b : 0), 0) || 1;
      for (let i = 0; i < L; i++) { G[i] /= ws; GM[i] /= ws; } for (let i = 0; i < L * NC; i++) GC[i] /= ws;
      if (inSub) for (let i = 0; i < L; i++) if (!inSub[i]) { G[i] = res0.G[i]; GM[i] = res0.GM[i]; for (let c = 0; c < NC; c++) GC[i * NC + c] = res0.GC[i * NC + c]; }
      res0 = { G, GM, GC };
    }
    out.strategies = stratRes.map((r, k) => ({ id: r.S.id, label: r.S.label, punt: r.S.punt, size: r.S.size, auto: !!r.S.auto, V: r.V, catP: Array.from(r.catP), w: wts ? wts[k] : null })).sort((a, b) => b.V - a.V);
    out.puntActive = !!wts;
    for (let i = 0; i < L; i++) { const p = cand[i]; p.gain = res0.G[i]; p.gainM = res0.GM[i]; p.gainC = res0.GC.slice(i * NC, i * NC + NC); }

    // availability for my next two picks (1-based pick numbers)
    const cur1 = current + 1, p1n = p1 + 1, p2n = p2 != null ? p2 + 1 : null;
    for (const p of avail) {
      p.thereAt = availProb(p, cur1, p1n);
      p.lastsTo = p2n != null ? availProb(p, cur1, p2n) : null;
      p.lastsFromP1 = p2n != null ? availProb(p, p1n, p2n) : null;
      let safe = cur1, gone = null;
      for (let q = cur1; q <= total; q++) { const a = availProb(p, cur1, q); if (a >= 0.8) safe = q; if (gone == null && a <= 0.2) { gone = q; break; } }
      p.safeUntil = safe; p.goneBy = gone;
    }

    // ---------- scarcity ----------
    // Category: how thin each category is after the next round, per roster spot left (see below). Position: lineup slots teams still need at each position
    // versus good players left who can fill them. Both are indexes with 1 = average.
    {
      const POS = ['PG', 'SG', 'SF', 'PF', 'C'];
      const NEED = { PG: 1.5, SG: 1.5, SF: 1.5, PF: 1.5, C: 2 };
      const cats = []; for (let c = 0; c < NC; c++) if (c !== TO || cfg.cats === 9) cats.push(c);
      const byVal = avail.slice().sort((a, b) => b.boardRaw - a.boardRaw);   // unweighted: weights only affect Zscore
      // Category scarcity (2026-10-18, info only; user: scarce from the start AND scarce once a category is gone). Per
      // category, value = Zscore above the average drafted player, floored at 0. Take the players still likely to be drafted (the best `unfilled` available), remove the next round's
      // best in this category (N players: what the room takes before it comes back around), and measure the value per
      // roster spot left after that, against the value per spot of the whole draftable pool before any pick. Concentrated
      // categories (blocks, assists) score low early because the next round takes most of them; depleted ones (points late)
      // score low because little is left. Index = geometric mean over categories ÷ this category's ratio (1 = typical,
      // above 1 = scarce), clamped 0.2-5.
      if (!ctx._scarRef) {
        const all = players.filter(p => p.boardC).sort((a, b) => b.boardRaw - a.boardRaw), T0 = Math.min(all.length, N * cfg.roster);
        const repl = new Array(NC).fill(0);   // baseline = the average drafted player (Zscore 0): late, a category is thin when nobody left is above average in it
        const per = Array.from({ length: NC }, (_, c) => Math.max(1e-6, all.slice(0, T0).reduce((a, p) => a + Math.max(0, p.boardC[c] - repl[c]), 0) / Math.max(1, T0)));
        ctx._scarRef = { repl, per };
      }
      const M = Math.min(byVal.length, unfilled.length), draftable = byVal.slice(0, M), take = Math.min(N, Math.floor(M / 2));
      // eps (a tenth of a typical category's value per spot) keeps categories that have run out distinguishable late
      const eps = 0.1 * cats.reduce((a, c) => a + ctx._scarRef.per[c], 0) / cats.length;
      const cRatio = {}; let lsum = 0;
      cats.forEach(c => {
        const v = draftable.map(p => Math.max(0, p.boardC[c] - ctx._scarRef.repl[c])).sort((a, b) => b - a);
        const left = v.slice(take), perLeft = left.length ? left.reduce((a, x) => a + x, 0) / left.length : 0;
        cRatio[c] = (perLeft + eps) / (ctx._scarRef.per[c] + eps); lsum += Math.log(cRatio[c]);
      });
      const gm = Math.exp(lsum / cats.length), catIdx = {}; cats.forEach(c => { catIdx[c] = Math.max(0.2, Math.min(5, gm / cRatio[c])); });
      // positions: remaining need across all teams vs supply among the players who will be drafted
      const elig = p => { const ps = String(p.p || '').split('/').filter(x => NEED[x] != null); return ps.length ? ps : ['SF']; };
      const need = {}; POS.forEach(P => { need[P] = 0; });
      teams.forEach(T => {
        const have = {}; POS.forEach(P => { have[P] = 0; });
        T.roster.forEach(r => { const ps = elig(r.p); ps.forEach(P => { have[P] += 1 / ps.length; }); });
        POS.forEach(P => { need[P] += Math.max(0, NEED[P] - have[P]); });
      });
      const supply = {}; POS.forEach(P => { supply[P] = 0; });
      byVal.slice(0, Math.max(N, unfilled.length)).forEach(p => { const ps = elig(p); ps.forEach(P => { supply[P] += 1 / ps.length; }); });
      const ratio = {}; let rsum = 0;
      POS.forEach(P => { ratio[P] = (need[P] + 0.5) / Math.max(1, supply[P]); rsum += ratio[P]; });
      const posIdx = {}; POS.forEach(P => { posIdx[P] = ratio[P] / (rsum / POS.length); });
      out.scarcity = { catIdx, posIdx };
      // Separate settings and multipliers for category (Zscore) and position scarcity
      // Strength: Off 0%, Light 25%, Medium 50%, Strong 75%, Very strong 100% of the score
      const lamOf = v => ({ light: 0.25, medium: 0.5, strong: 0.75, vstrong: 1 })[v] || 0;
      const lamZ = lamOf(cfg.scarZ), lamP = lamOf(cfg.scarP);
      // taken players get scarcity too, so their stats still show when Hide taken is off
      for (const p of avail.concat([...taken].map(id => players[id]))) {
        let w = 0, ws = 0;
        cats.forEach(c => { const v = Math.max(0, p.boardC[c]) * SK[c]; w += v * (catIdx[c] - 1); ws += v; });
        const sc = ws > 0 ? Math.max(-0.5, Math.min(0.5, w / ws)) : 0;
        const sp = Math.max(-0.5, Math.min(0.5, Math.max(...elig(p).map(P => posIdx[P])) - 1));
        p.scarCat = sc; p.scarPos = sp; p.scar = (sc + sp) / 2;
        p.scarMultZ = Math.max(0.5, Math.min(1.5, 1 + lamZ * sc));
        p.scarMultP = Math.max(0.5, Math.min(1.5, 1 + lamP * sp));
        p.scarMult = p.scarMultZ * p.scarMultP;
        // playoff boost (p.poMult, set by the page from the NBA schedule) stacks on top of scarcity
        const m = p.scarMult * (p.poMult || 1);
        if (m !== 1) {
          p.gain *= m; p.gainM *= m;
          if (p.gainC) for (let c = 0; c < NC; c++) p.gainC[c] *= m;
        }
      }
    }

    // model pick order: the chosen metric (Gain or Gain M) now plus what is likely left at the following pick
    // Zscore option: the Zscore version currently shown (0 / −1 / −2), same look-ahead in Zscore units
    // cfg.zdropPct (0-100): share of the dropped categories that still counts in −1 / −2 (0 = dropped, 100 = Normal)
    const zKeep = Math.max(0, Math.min(100, +cfg.zdropPct || 0)) / 100, zOfE = p => { const d = cfg.zdrop || 0; return d ? p.z[d] + zKeep * (p.z[0] - p.z[d]) : p.z[0]; };
    if (cfg.orderBy === 'z') avail.forEach(p => { p.zSel = zOfE(p) * (p.scarMult || 1) * (p.poMult || 1); });
    // The Model pick always uses Gain M (matchup win chance), whatever # order by is set to
    const mk = 'gainM';
    const ordKey = cfg.orderBy === 'gainM' ? 'gainM' : cfg.orderBy === 'z' ? 'zSel' : 'gain';
    // Value of planning to take him at your next pick = his metric × the chance he is still there.
    const there = p => (p.thereAt == null ? 1 : p.thereAt);
    const val = p => p[mk] * there(p);
    const byGain = avail.slice().sort((a, b) => val(b) - val(a));
    const K = Math.min(10, byGain.length);
    const backToBack = p2 != null && unfilled.indexOf(p2) === unfilled.indexOf(p1) + 1;
    const look = avail.slice().sort((a, b) => b[mk] - a[mk]).slice(0, 30);
    const tail = look.length ? look[look.length - 1][mk] : 0;
    // expected value of the best other player, each still available with chance qOf(o)
    const bestOther = (cand, qOf) => {
      let mass = 1, E = 0;
      for (const o of look) {
        if (o === cand) continue;
        const q = qOf(o); E += mass * q * o[mk]; mass *= (1 - q);
        if (mass < 1e-4) break;
      }
      return E + mass * tail;
    };
    // Planning to take him at your next pick: you get him if he's there; if he's gone you take the best player
    // left instead (fallback). Your following pick is worth the same either way, so it is not discounted.
    // cfg.modelPickV1 restores the old score, there × (metric + following pick), which wrongly zeroed both when he's gone.
    for (let i = 0; i < K; i++) {
      const cand = byGain[i], th = there(cand);
      const E = p2 != null ? bestOther(cand, o => backToBack ? there(o) : (o.lastsTo == null ? 0 : o.lastsTo)) : 0;
      if (cfg.modelPickV1) cand.score = p2 != null ? th * (cand[mk] + E) : val(cand);
      else cand.score = th * cand[mk] + (1 - th) * bestOther(cand, there) + E;
    }
    // Model pick (under the hood): best expected value counting availability and the following pick.
    const top = byGain.slice(0, K).sort((a, b) => b.score - a.score);
    out.modelPick = top.length ? top[0].id : null;
    // The # column is a plain ranking by the chosen metric.
    const order = avail.slice().sort((a, b) => b[ordKey] - a[ordKey]);
    order.forEach((p, i) => { p.order = i + 1; });
    taken.forEach(id => { players[id].order = null; });
    out.order = order;
    return out;
  }

  // ---------- two-pick look-ahead (2026-10-17) ----------
  // On the clock: for the K best available players by Win M, re-run the board with him on your roster and value your
  // next pick as the expected Win M of the best player likely still there (each with his chance of lasting). The pick is
  // the one with the best Win M now + that next-pick value, so your next pick is valued for the roster it will join.
  // Backtest (realistic league, 640 paired drafts): titles +2.7 ± 2.1, playoffs made +5.5 ± 1.5, matchups +2.2 ± 0.5.
  // Returns the evaluation of the real state (re-run last, so every player's numbers are current) with modelPick set.
  function lookAhead2(players, ctx, cfg, state, K, res0) {
    const cur = state.picks.indexOf(null);
    const taken = new Set(state.picks.filter(v => v != null));
    const cands = players.filter(p => !taken.has(p.id)).sort((a, b) => b.gainM - a.gainM).slice(0, K || 4).map(p => ({ id: p.id, now: p.gainM }));
    if (cur < 0 || cands.length < 2) return res0;
    let best = cands[0].id, bs = -Infinity;
    for (const c of cands) {
      const pk = state.picks.slice(); pk[cur] = c.id;
      E2(players, ctx, cfg, Object.assign({}, state, { picks: pk }));
      const t2 = new Set(pk.filter(v => v != null));
      const left = players.filter(p => !t2.has(p.id)).sort((a, b) => b.gainM - a.gainM).slice(0, 30);
      let mass = 1, nxt = 0;
      for (const o of left) { const q = o.thereAt == null ? 1 : o.thereAt; nxt += mass * q * o.gainM; mass *= 1 - q; if (mass < 1e-4) break; }
      c.score = c.now + nxt; if (c.score > bs) { bs = c.score; best = c.id; }
    }
    const res = E2(players, ctx, cfg, state);
    res.modelPick = best; res.look2 = cands;
    return res;
  }
  // ---------- value-to-fit slide (2026-10-17) ----------
  // On the clock: score = (1 − w)·value + w·fit. Fit share w = 1 / (1 + e^(−k·(i − 1.5))), i = your 0-based pick index, k = 2
  // (2026-10-17, real-projection backtests): value share 95% / 73% / 27% / 5% at your picks 1-4, then ~0 (pure fit).
  // value = 50/50 standardized soft −1 Zscore (worst category's negative z counts half) and Win C, re-standardized;
  // fit = Win M + the look-ahead's next-pick value, for the 4 best by Win M and the 4 best by value.
  // Pool = the 40 best by Win M, soft Zscore and Win C. Mirrors backtest.js slidePick2 (value 'blend', fit 'look2').
  // Backtest (real projections + real ADP, the user's format, 2022-26, 320 paired drafts) vs Win M + look-ahead, Punt Off:
  // titles +1.3 ± 1.5, prize +1.7 ± 0.9, playoffs made +3.1 ± 2.1, matchups +1.8 ± 0.5. (The old √t slide lost there.)
  function slidePick(players, ctx, cfg, state, myIdx, res0) {
    const cur = state.picks.indexOf(null);
    const taken = new Set(state.picks.filter(v => v != null));
    const av = players.filter(p => !taken.has(p.id));
    if (cur < 0 || av.length < 2) return res0;
    const SLIDE_K = 2, SLIDE_MID = 1.5, w = 1 / (1 + Math.exp(-SLIDE_K * (myIdx - SLIDE_MID))), a1 = 0.5, wc = 0.5;
    // soft −1 ignores category weights (TO ×0.5 default included): unweighted Zscore over the scoring categories, worst one at half
    const sc = cfg.cats === 9 ? 9 : 8;
    // cfg.slideZ 'true' (2026-10-18): the value side uses the true Zscore instead of the team-spread one
    const bcOf = cfg.slideZ === 'true' ? (p => p.zCl.bc) : (p => p.boardC);
    const soft = p => { const bc = bcOf(p); let b = 0, lo = Infinity; for (let c = 0; c < 9; c++) { if (sc === 8 && c === TO) continue; b += bc[c]; if (bc[c] < lo) lo = bc[c]; } return b - a1 * Math.min(0, lo); };
    const byF = av.slice().sort((a, b) => b.gainM - a.gainM), byS = av.slice().sort((a, b) => soft(b) - soft(a)), byC = av.slice().sort((a, b) => b.gain - a.gain);
    const P2 = [...new Set(byF.slice(0, 40).concat(byS.slice(0, 40), byC.slice(0, 40)))];
    const ms = A => { const m = A.reduce((x, y) => x + y, 0) / A.length, s = Math.sqrt(A.reduce((x, y) => x + (y - m) ** 2, 0) / A.length) || 1; return [m, s]; };
    const S = P2.map(soft), C = P2.map(p => p.gain), F = P2.map(p => p.gainM), [mS, sS] = ms(S), [mC, sC] = ms(C), [mF, sF] = ms(F);
    let V = P2.map((p, i) => (1 - wc) * (S[i] - mS) / sS + wc * (C[i] - mC) / sC);
    const [mV, sV] = ms(V); V = V.map(v => (v - mV) / sV);
    const idx = P2.map((p, i) => i), order = A => idx.slice().sort((x, y) => A[y] - A[x]);
    const top = [...new Set(order(F).slice(0, 4).concat(order(V).slice(0, 4)))];
    const ids = P2.map(p => p.id), nxt = {};
    for (const i of top) {
      const pk = state.picks.slice(); pk[cur] = ids[i];
      E2(players, ctx, cfg, Object.assign({}, state, { picks: pk }));
      const t2 = new Set(pk.filter(v => v != null));
      const left = players.filter(p => !t2.has(p.id)).sort((a, b) => b.gainM - a.gainM).slice(0, 30);
      let mass = 1, e = 0;
      for (const o of left) { const q = o.thereAt == null ? 1 : o.thereAt; e += mass * q * o.gainM; mass *= 1 - q; if (mass < 1e-4) break; }
      nxt[i] = e;
    }
    const res = E2(players, ctx, cfg, state);
    const mN = top.reduce((a, i) => a + nxt[i], 0) / top.length;
    let best = ids[top[0]], bs = -Infinity; const cands = [];
    for (const i of top) {
      const fit = (F[i] + nxt[i] - mN - mF) / sF, sc = (1 - w) * V[i] + w * fit;
      cands.push({ id: ids[i], value: V[i], fit, score: sc });
      if (sc > bs) { bs = sc; best = ids[i]; }
    }
    res.modelPick = best; res.slide = { w, cands };
    return res;
  }
  // ---------- two-roster matchup with known games (in-season tools, 2026-10-20) ----------
  // pairMatchup(A, B, { cats: 9|8, projErr: true }): A, B are arrays of { p: StatLine, games, gVar? }. Percentages are
  // linearized around each team's own percentage, so the sign of the gap always follows the projected percentages.
  // gVar = variance of that entry's games (default VAR_GAMES * games / GPW); entries with games <= 0 are skipped.
  function matchProbN(ps, nc) {
    let dist = [1];
    for (const q of ps) { const nd = new Array(dist.length + 1).fill(0); dist.forEach((v, i) => { nd[i] += v * (1 - q); nd[i + 1] += v * q; }); dist = nd; }
    let w = 0; for (let i = 0; i < dist.length; i++) { if (2 * i > nc) w += dist[i]; else if (2 * i === nc) w += 0.5 * dist[i]; }
    return w;
  }
  function pairTeam(R, projErr, K) {
    let fga = 0, fgm = 0, fta = 0, ftm = 0;
    if (K) { fga = K.fga; fgm = K.fgm; fta = K.fta; ftm = K.ftm; }
    R.forEach(e => { if (!(e.games > 0)) return; fga += e.p.fga * e.games; fgm += e.p.fgp * e.p.fga * e.games; fta += e.p.fta * e.games; ftm += e.p.ftp * e.p.fta * e.games; });
    const ref = { pFG: fga > 0 ? fgm / fga : 0, pFT: fta > 0 ? ftm / fta : 0 };
    const s = new Array(NC).fill(1); s[0] = fga > 0 ? 1 / fga : 0; s[1] = fta > 0 ? 1 / fta : 0;
    const mean = new Float64Array(NC), idio = new Float64Array(NC), lsum = new Float64Array(NC), q = new Float64Array(NC);
    let S = 0;
    R.forEach(e => {
      if (!(e.games > 0)) return;
      const m = vec(e.p, ref, 1), pg = perGameVar(e.p), pv = projErr ? projVar(e.p, e.games) : null;
      const gv = e.gVar != null ? e.gVar : VAR_GAMES * e.games / GPW; S += gv;
      for (let c = 0; c < NC; c++) {
        const pgv = pg[c], sm = s[c] * m[c];
        if (c > 1) mean[c] += m[c] * e.games;
        idio[c] += s[c] * s[c] * e.games * pgv + (pv ? s[c] * s[c] * pv[c] : 0);
        lsum[c] += sm * gv; q[c] += sm * sm * gv;
      }
    });
    mean[0] = ref.pFG; mean[1] = ref.pFT;
    if (K) { mean[2] += K.tpm; mean[3] += K.pts; mean[4] += K.reb; mean[5] += K.ast; mean[6] += K.stl; mean[7] += K.blk; mean[8] -= K.to; }
    const lam = new Float64Array(NC);
    for (let c = 0; c < NC; c++) { lam[c] = S > 0 ? lsum[c] / S : 0; idio[c] += Math.max(0, q[c] - lam[c] * lam[c] * S); }
    return { mean, idio, lam, S };
  }
  // opts.known = [kA, kB]: each team's so-far totals { fgm, fga, ftm, fta, tpm, pts, reb, ast, stl, blk, to }, counted with no variance;
  // the entries are then the games still to play. With nothing known the result is unchanged. A category with no variance left
  // is decided exactly (win 1, tie 0.5, loss 0).
  function pairMatchup(A, B, opts) {
    const o = opts || {}, nc = o.cats === 8 ? 8 : 9, pe = o.projErr !== false, kn = o.known || [null, null];
    const a = pairTeam(A, pe, kn[0]), b = pairTeam(B, pe, kn[1]), cat = [];
    const step = (d, v) => o.known && v < 1e-12 ? (d > 1e-12 ? 1 : d < -1e-12 ? 0 : 0.5) : null;
    for (let c = 0; c < NC; c++) {
      if (c >= nc) { cat.push(null); continue; }
      const d = a.mean[c] - b.mean[c], v = a.idio[c] + b.idio[c] + a.lam[c] * a.lam[c] * a.S + b.lam[c] * b.lam[c] * b.S, st = step(d, v);
      cat.push(st != null ? st : Phi(d / Math.sqrt(v + 1e-9)));
    }
    const sa = Math.sqrt(a.S), sb = Math.sqrt(b.S), ps = new Array(nc);
    let match = 0;
    for (let j = 0; j < GH_Z.length; j++) for (let k = 0; k < GH_Z.length; k++) {
      let n = 0;   // categories tied exactly (known totals only) count for neither side
      for (let c = 0; c < nc; c++) {
        const d = a.mean[c] - b.mean[c] + a.lam[c] * sa * GH_Z[j] - b.lam[c] * sb * GH_Z[k], v = a.idio[c] + b.idio[c], st = step(d, v + a.S + b.S);
        if (st === 0.5) continue;
        ps[n++] = st != null ? st : Phi(d / Math.sqrt(v + 1e-9));
      }
      match += GH_W[j] * GH_W[k] * matchProbN(n < nc ? ps.slice(0, n) : ps, n);
    }
    const mu = t => Array.from(t.mean, (x, c) => c === TO ? -x : x);
    return { cat, match, mu: [mu(a), mu(b)] };
  }
  const E2 = (...a) => evaluate(...a);
  const api = { FIELD_F, slidePick, lookAhead2, strategiesFor, catWeights, CATS, NC, TO, WEEKS, prepPlayers, buildContext, evaluate, entryVec, teamAt, adpOf, adpSd, Phi, playoffSurvival, playoffMult, PO_STRENGTH };
  api.pairMatchup = pairMatchup;
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Engine = api;
})(this);
