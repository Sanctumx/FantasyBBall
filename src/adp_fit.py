# How much should the board trust ADP over projections? (2026-10-17)
# Per season: projected season value (Season basis, 9-cat, each category standardized over the pool) from the preseason
# projections in bt_proj.json, the ADP-implied value (the projected-value curve read at the player's ADP rank: the value the
# market implies for that draft slot), and the actual value from that season's game logs (0 games = no value).
# Pool = the 200 best by real ADP. 2023-24 is left out of the ADP fits (its "ADP" is Hashtag's own rank).
# Fit actual = a + b·proj + c·adp_implied; w_adp = c / (b + c). Leave-one-season-out: fit on the other seasons, score the held-out one.
# Run: python3 adp_fit.py
import json, numpy as np, pandas as pd
PROJ = json.load(open('bt_proj.json'))
K = ['g', 'm', 'pts', 'tpm', 'reb', 'ast', 'stl', 'blk', 'fgp', 'fga', 'ftp', 'fta', 'to']
ZERO = {k: 0.0 for k in K}

def logs(season):
    f = 'logs_early.csv' if season < '2023-24' else 'logs3.csv'
    L = pd.read_csv(f, usecols=['game_id', 'season', 'player_id', 'minutes', 'pts', 'reb', 'ast', 'fgm', 'fga', 'fg3m', 'ftm', 'fta', 'stl', 'blk', 'tov'])
    L = L[(L.season == season) & L.game_id.astype(str).str.lstrip('0').str.startswith('2') & (L.minutes > 0)]
    g = L.groupby('player_id').agg('sum', numeric_only=True); n = L.groupby('player_id').size()
    return {str(k): dict(g=float(n[k]), m=g.minutes[k] / n[k], pts=g.pts[k] / n[k], tpm=g.fg3m[k] / n[k], reb=g.reb[k] / n[k], ast=g.ast[k] / n[k],
                         stl=g.stl[k] / n[k], blk=g.blk[k] / n[k], fga=g.fga[k] / n[k], fgp=g.fgm[k] / max(1, g.fga[k]), fta=g.fta[k] / n[k],
                         ftp=g.ftm[k] / max(1, g.fta[k]), to=g.tov[k] / n[k]) for k in g.index}

def values(D, pool):
    M = pd.DataFrame({k: [D.get(p, ZERO)[k] for p in pool] for k in K}, index=pool)
    G = M.g; fgp = (M.fgp * M.fga * G).sum() / (M.fga * G).sum(); ftp = (M.ftp * M.fta * G).sum() / (M.fta * G).sum()
    T = pd.DataFrame({'fg': (M.fgp - fgp) * M.fga * G, 'ft': (M.ftp - ftp) * M.fta * G, '3': M.tpm * G, 'pts': M.pts * G, 'reb': M.reb * G,
                      'ast': M.ast * G, 'stl': M.stl * G, 'blk': M.blk * G, 'to': -M.to * G})
    return ((T - T.mean()) / T.std()).sum(axis=1)

def avg(b, x):
    o = {k: (b[k] + x[k]) / 2 for k in K if k not in ('fgp', 'ftp')}
    o['fgp'] = (b['fgp'] * b['fga'] + x['fgp'] * x['fga']) / 2 / o['fga'] if o['fga'] else b['fgp']
    o['ftp'] = (b['ftp'] * b['fta'] + x['ftp'] * x['fta']) / 2 / o['fta'] if o['fta'] else b['ftp']
    return o

def season_frame(season, src):
    S = PROJ[season]
    get = (lambda e: avg(e['bbm'], e['hs']) if 'bbm' in e and 'hs' in e else None) if src == 'avg' else (lambda e: e.get(src))
    ids = [p for p, e in S.items() if 'adp' in e and get(e) is not None]
    ids = sorted(ids, key=lambda p: S[p]['adp'])[:200]
    D = {p: get(S[p]) for p in ids}; A = logs(season)
    vp = values(D, ids); va = values(A, ids)
    curve = np.sort(vp.values)[::-1]                                   # projected value by rank
    adp_rank = pd.Series({p: S[p]['adp'] for p in ids}).rank(method='first').astype(int) - 1
    vadp = pd.Series({p: curve[adp_rank[p]] for p in ids})
    return pd.DataFrame({'season': season, 'proj': vp, 'adp': vadp, 'act': va, 'adp_raw': [S[p]['adp'] for p in ids], 'g_act': [A.get(p, ZERO)['g'] for p in ids]})

def fit(df, cols):
    X = np.column_stack([np.ones(len(df))] + [df[c].values for c in cols]); y = df.act.values
    b, *_ = np.linalg.lstsq(X, y, rcond=None); return b

def score(df, pred, label):
    # rank corr with actual; mean actual value of the 56 / 112 the measure ranks best (rounds 1-4 / 1-8 of a 14-team league; 2022-23's pool has only 165)
    pred = np.asarray(pred, float); act = df.act.values
    rc = pd.Series(pred).rank().corr(pd.Series(act).rank())
    o = np.argsort(-pred)
    return dict(label=label, rank_corr=rc, top56=act[o[:56]].mean(), top112=act[o[:112]].mean(), top168=act[o[:112]].mean())

SETS = {'2022-23': 'hs', '2024-25': 'avg', '2025-26': 'bbm'}   # the source each season's backtest world uses
F = {s: season_frame(s, src) for s, src in SETS.items()}
print('Pools:', {s: (len(d), f"played {int((d.g_act > 0).sum())}") for s, d in F.items()})

print('\nIn-sample fit per season: actual = a + b·proj + c·adp_implied')
for s, d in F.items():
    a, b, c = fit(d, ['proj', 'adp'])
    print(f"  {s} ({SETS[s]:3}): b {b:.3f}  c {c:.3f}  → ADP weight {c / (b + c):.2f}   corr(proj, adp) {d.proj.corr(d.adp):.2f}")

print('\nLeave-one-season-out (weights fitted on the other two seasons):')
rows = []
for s in F:
    tr = pd.concat([F[t] for t in F if t != s]); te = F[s]
    a, b, c = fit(tr, ['proj', 'adp']); w = c / (b + c)
    for lab, pred in (('projection', te.proj.values), ('ADP', te.adp.values), (f'blend w={w:.2f}', ((1 - w) * te.proj + w * te.adp).values), ('blend 50/50', (0.5 * te.proj + 0.5 * te.adp).values)):
        r = score(te, pred, lab); r['season'] = s; rows.append(r)
R = pd.DataFrame(rows)
for s in F:
    print(f"  {s}"); print(R[R.season == s][['label', 'rank_corr', 'top56', 'top112']].to_string(index=False, float_format=lambda x: f'{x:.3f}'))

# bootstrap the out-of-sample gain of the fitted blend vs projection alone (pooled held-out players)
rng = np.random.default_rng(7); diffs = {'rank_corr': [], 'top112': []}
held = []
for s in F:
    tr = pd.concat([F[t] for t in F if t != s]); te = F[s].copy(); a, b, c = fit(tr, ['proj', 'adp']); w = c / (b + c)
    te['blend'] = (1 - w) * te.proj + w * te.adp; held.append(te)
for _ in range(1000):
    dd = []
    for te in held:
        i = rng.choice(len(te), len(te)); t = te.iloc[i]
        dd.append((score(t, t.blend.values, '')['rank_corr'] - score(t, t.proj.values, '')['rank_corr'], score(t, t.blend.values, '')['top112'] - score(t, t.proj.values, '')['top112']))
    diffs['rank_corr'].append(np.mean([x[0] for x in dd])); diffs['top112'].append(np.mean([x[1] for x in dd]))
print('\nFitted blend − projection, out of sample, mean of 3 seasons (bootstrap ± sd):', {k: f"{np.mean(v):+.3f} ± {np.std(v):.3f}" for k, v in diffs.items()})

# a weight grid on all three seasons (shape of the curve)
print('\nADP weight grid, mean over the 3 seasons:')
for w in [0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0]:
    sc = [score(d, ((1 - w) * d.proj + w * d.adp).values, '') for d in F.values()]
    print(f"  w {w:.1f}: rank corr {np.mean([x['rank_corr'] for x in sc]):.3f}  top56 {np.mean([x['top56'] for x in sc]):.3f}  top112 {np.mean([x['top112'] for x in sc]):.3f}   per season rank corr " + ' '.join(f"{x['rank_corr']:.3f}" for x in sc))

# 2024-25 only: BBM vs Hashtag vs ADP (the one season with all three)
print('\n2024-25, all three sources:')
S = PROJ['2024-25']; ids = sorted([p for p, e in S.items() if 'adp' in e and 'bbm' in e and 'hs' in e], key=lambda p: S[p]['adp'])[:200]
A = logs('2024-25'); va = values(A, ids); vb = values({p: S[p]['bbm'] for p in ids}, ids); vh = values({p: S[p]['hs'] for p in ids}, ids)
va2 = values({p: avg(S[p]['bbm'], S[p]['hs']) for p in ids}, ids)
curve = np.sort(va2.values)[::-1]; rk = pd.Series({p: S[p]['adp'] for p in ids}).rank(method='first').astype(int) - 1; vd = pd.Series({p: curve[rk[p]] for p in ids})
d = pd.DataFrame({'bbm': vb, 'hs': vh, 'adp': vd, 'act': va})
a, b1, b2, c = fit(d, ['bbm', 'hs', 'adp']); tot = b1 + b2 + c
print(f"  weights (in-sample): BBM {b1 / tot:.2f}  Hashtag {b2 / tot:.2f}  ADP {c / tot:.2f}")
for lab, pred in (('BBM', vb), ('Hashtag', vh), ('Average', va2), ('ADP', vd)):
    r = score(d, pred.values, lab); print(f"  {lab:8} rank corr {r['rank_corr']:.3f}  top56 {r['top56']:.3f}  top112 {r['top112']:.3f}")

# ---- Stat-level blend for the backtest → adp_blend.json {season: {w: {pid: s}}} ----
# Season value is linear in a player's per-game volume: scaling pts, 3PM, REB, AST, ST, BLK, TO, FGA, FTA (and minutes) by s
# scales every category total Σ T_c by s, so value = s·S − C with S = Σ T_c / sd_c and C = Σ mean_c / sd_c over the pool.
# s is set so value = (1 − w)·projected + w·ADP-implied; his category profile, percentages and games stay as projected.
# Clamped to 0.7-1.3; players outside the top 200 by ADP keep s = 1. 2023-24's "ADP" is Hashtag's rank (near no-op there).
def scales(season, src, ws):
    S0 = PROJ[season]
    get = (lambda e: avg(e['bbm'], e['hs']) if 'bbm' in e and 'hs' in e else (e.get('bbm') or e.get('hs'))) if src == 'avg' else (lambda e: e.get(src))
    ids = sorted([p for p, e in S0.items() if 'adp' in e and get(e) is not None], key=lambda p: S0[p]['adp'])[:200]
    M = pd.DataFrame({k: [get(S0[p])[k] for p in ids] for k in K}, index=ids); G = M.g
    fgp = (M.fgp * M.fga * G).sum() / (M.fga * G).sum(); ftp = (M.ftp * M.fta * G).sum() / (M.fta * G).sum()
    T = pd.DataFrame({'fg': (M.fgp - fgp) * M.fga * G, 'ft': (M.ftp - ftp) * M.fta * G, '3': M.tpm * G, 'pts': M.pts * G, 'reb': M.reb * G,
                      'ast': M.ast * G, 'stl': M.stl * G, 'blk': M.blk * G, 'to': -M.to * G})
    sd = T.std(); S = (T / sd).sum(axis=1); C = (T.mean() / sd).sum(); vp = S - C
    curve = np.sort(vp.values)[::-1]; rk = pd.Series({p: S0[p]['adp'] for p in ids}).rank(method='first').astype(int) - 1
    vadp = pd.Series({p: curve[rk[p]] for p in ids})
    out = {}
    for w in ws:
        tgt = (1 - w) * vp + w * vadp
        out[str(w)] = {p: (float(np.clip((tgt[p] + C) / S[p], 0.7, 1.3)) if S[p] > 0.5 else 1.0) for p in ids}
    return out
WORLD = {'2022-23': 'hs', '2023-24': 'hs', '2024-25': 'avg', '2025-26': 'bbm'}
BL = {s: scales(s, src, [0.25, 0.4]) for s, src in WORLD.items()}
json.dump(BL, open('adp_blend.json', 'w'))
print('\nadp_blend.json: scale s per player (w 0.25):')
for s in BL:
    v = np.array(list(BL[s]['0.25'].values())); print(f"  {s}: n {len(v)}  s 5/50/95% {np.percentile(v, 5):.3f} / {np.percentile(v, 50):.3f} / {np.percentile(v, 95):.3f}  clamped {int(((v <= 0.7) | (v >= 1.3)).sum())}")
