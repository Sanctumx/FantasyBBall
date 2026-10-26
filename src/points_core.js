// Points mode (#137): fantasy points of a stat line and its variance, in the engine's own units. Pure; browser and Node.
// A player's FP per game is m = sum of weight x stat over the 11 point stats (fgm = fgp x fga, ftm = ftp x fta, as in prepPlayers).
// Variances use the engine's per-stat fits plus the within-player per-game correlations measured by points_fit.js.
// The engine view (below) puts one FP total in category slot FP_SLOT so Engine.evaluate runs unchanged.
(function (root) {
  'use strict';
  const Eng = root.Engine || require('./engine.js');
  const V = Eng.VARS;
  const STATS = ['pts', 'reb', 'ast', 'stl', 'blk', 'to', 'tpm', 'fgm', 'fga', 'ftm', 'fta'];
  // pooled within-player per-game correlation, STATS order (logs3.csv, 2023-24 to 2025-26, 723 player-seasons; points_fit.js)
  const RHO = [[1,0.266792,0.158245,0.132771,0.078307,0.105515,0.661442,0.936542,0.746937,0.45797,0.450334],[0.266792,1,0.19313,0.07668,0.120267,0.130567,0.096615,0.259927,0.332803,0.149784,0.164514],[0.158245,0.19313,1,0.110404,0.049083,0.086772,0.086326,0.152083,0.180555,0.075083,0.077246],[0.132771,0.07668,0.110404,1,0.031628,0.070447,0.0623,0.131739,0.151708,0.059698,0.066785],[0.078307,0.120267,0.049083,0.031628,1,0.037035,0.037042,0.073029,0.084922,0.046119,0.048935],[0.105515,0.130567,0.086772,0.070447,0.037035,1,0.054546,0.094183,0.098167,0.069185,0.074498],[0.661442,0.096615,0.086326,0.0623,0.037042,0.054546,1,0.574231,0.431381,0.047454,0.050242],[0.936542,0.259927,0.152083,0.131739,0.073029,0.094183,0.574231,1,0.77874,0.165897,0.178942],[0.746937,0.332803,0.180555,0.151708,0.084922,0.098167,0.431381,0.77874,1,0.194198,0.204821],[0.45797,0.149784,0.075083,0.059698,0.046119,0.069185,0.047454,0.165897,0.194198,1,0.943422],[0.450334,0.164514,0.077246,0.066785,0.048935,0.074498,0.050242,0.178942,0.204821,0.943422,1]];
  // variance / mean of the four stats the engine has no fit for (points_fit.js; the same method gives the engine's 7: reb 1.336, to 1.022)
  const DISP = { fgm: 1.225, fga: 1.406, ftm: 2.004, fta: 2.182 };
  const ENG_IX = { tpm: 2, pts: 3, reb: 4, ast: 5, stl: 6, blk: 7, to: 8 };   // slot of the engine's own per-game variance

  // per-game stats of a line (raw or prepped); shooting made = percentage x attempts, 0 when there are no attempts
  function statsOf(l) {
    const num = v => v > 0 || v < 0 ? +v : 0, fga = num(l.fga), fta = num(l.fta);
    return { pts: num(l.pts), reb: num(l.reb), ast: num(l.ast), stl: num(l.stl), blk: num(l.blk), to: num(l.to), tpm: num(l.tpm),
      fgm: fga > 0 ? num(l.fgp) * fga : 0, fga, ftm: fta > 0 ? num(l.ftp) * fta : 0, fta };
  }
  const wOf = w => STATS.map(k => (w && +w[k]) || 0);
  function perGame(l, w) { const s = statsOf(l), a = wOf(w); return STATS.reduce((t, k, i) => t + a[i] * s[k], 0); }
  const quad = (a, v) => { let t = 0; for (let i = 0; i < 11; i++) { if (!a[i]) continue; for (let j = 0; j < 11; j++) if (a[j]) t += a[i] * a[j] * RHO[i][j] * v[i] * v[j]; } return Math.max(0, t); };
  // game-to-game variance of one game's FP
  function pgVar(l, w) {
    const s = statsOf(l), ev = Eng.perGameVar(Object.assign({}, l, { fga: s.fga, fta: s.fta, fgp: s.fga > 0 ? s.fgm / s.fga : 0, ftp: s.fta > 0 ? s.ftm / s.fta : 0 }));
    const sd = STATS.map(k => Math.sqrt(ENG_IX[k] != null ? ev[ENG_IX[k]] : DISP[k] * s[k]));
    return quad(wOf(w), sd);
  }
  // projection error of a season's FP at g games: the engine's 12% per counting stat, correlated by the same rho
  function projVar(l, g, w) { const s = statsOf(l); return Math.pow(V.PROJ_SD * g, 2) * quad(wOf(w), STATS.map(k => s[k])); }
  // weekly variance: games in a week x per-game variance + variance of the games count x m squared
  function weekVar(l, g, w) { const m = perGame(l, w); return (V.GPW * g / 82) * pgVar(l, w) + m * m * V.VAR_GAMES; }
  const key = w => wOf(w).join(',');


  // ---------- the engine view: one FP total in category slot FP_SLOT, zeros elsewhere ----------
  // Engine.evaluate then runs unchanged: its single-category chance for FP_SLOT is the normal chance one weekly total beats another,
  // and Win M = 100 x gainC[FP_SLOT]. Never read gainM (it runs over 9 slots with 8 tied).
  const FP_SLOT = 3;
  const WEEKS = Eng.WEEKS;

  // team noise in the units of ctx.idioNoise / loadS / h2hNoise, from the engine's own 80 simulated ADP drafts
  // (the draws, SIGMA_G2 factor and formulas of the engine's scaleFor, for the FP total only)
  function noise(P, ctx, cfg, w) {
    const sims = Eng.draftSims(P, cfg), N = cfg.teams, teamsN = sims.length * N;
    const m = P.map(p => perGame(p, w)), WV = P.map((p, i) => weekVar(p, p.gUse, w));
    let s1 = 0, s2 = 0, wpg = 0, wsum = 0, picks = 0;
    sims.forEach(sim => sim.forEach(team => team.forEach(i => { s1 += m[i]; s2 += m[i] * m[i]; wpg += WV[i] - m[i] * m[i] * V.VAR_GAMES; wsum += WV[i]; picks++; })));
    const nT = picks / teamsN, S1 = s1 / teamsN, S2 = s2 / teamsN, PGv = wpg / teamsN, nk = cfg.noiseK != null ? +cfg.noiseK : 1;
    const idio = Math.max(1e-9, PGv + V.SIGMA_G2 * Math.max(0, S2 - S1 * S1 / nT));
    return { idio: 2 * idio * WEEKS * WEEKS * nk, load: S1 / nT * WEEKS, h2h: 2 * (wsum / teamsN) * WEEKS * WEEKS * nk };
  }

  // mean per-game FP of the free-agent tier, the engine's pgRepl for FP: ADP ranks N*R+1 .. N*R+20
  function replFP(P, cfg, w) {
    const byAdp = P.slice().sort((a, b) => Eng.adpOf(a, cfg.adpSrc) - Eng.adpOf(b, cfg.adpSrc));
    const fa = byAdp.slice(Math.min(byAdp.length - 1, cfg.teams * cfg.roster), Math.min(byAdp.length, cfg.teams * cfg.roster + 20));
    return fa.reduce((t, p) => t + perGame(p, w), 0) / (fa.length || 1);
  }

  // P: prepped players after Engine.buildContext(P, cfg) (they carry gUse); returns copies for Engine.evaluate
  function engineView(P, ctx, cfg, w) {
    const rep = replFP(P, cfg, w), nz = noise(P, ctx, cfg, w);
    const view = P.map(p => {
      const m = perGame(p, w), x = new Float64Array(Eng.NC), pv = new Float64Array(Eng.NC);
      x[FP_SLOT] = m * p.gUse + Math.max(0, V.SEASON_G - p.gUse) * ctx.ilFill * rep;
      pv[FP_SLOT] = projVar(p, p.gUse, w);
      return Object.assign({}, p, { x, pv, fieldV: x[FP_SLOT], boardRaw: x[FP_SLOT] });
    });
    const vctx = Object.assign({}, ctx), set = (a, v) => { const o = new Float64Array(Eng.NC); o[FP_SLOT] = v; return o; };
    vctx.idioNoise = set(0, nz.idio); vctx.loadS = set(0, nz.load); vctx.h2hNoise = set(0, nz.h2h);
    vctx.pgRepl = set(0, rep); vctx.streamK = new Float64Array(Eng.NC).fill(1);
    return { P: view, ctx: vctx };
  }

  // a stat line at `games` season games as a team-total entry (IL fill off): the points version of Engine.entryVec
  function entry(l, games, ctx, w) {
    const x = new Float64Array(Eng.NC), pv = new Float64Array(Eng.NC);
    x[FP_SLOT] = perGame(l, w) * games; pv[FP_SLOT] = projVar(l, games, w);
    return { x, pv };
  }

  const api = { FP_SLOT, noise, engineView, entry, STATS, RHO, DISP, statsOf, perGame, pgVar, projVar, weekVar, key };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Points = api;
})(this);
