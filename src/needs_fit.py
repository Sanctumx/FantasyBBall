# Do real drafters tilt picks toward their needs? (2026-10-17) LOFB Bowl 9-cat leagues 2022/2023/2024 (collect/data/drafts).
# Consensus = a player's mean pick across that league's divisions (the same 12-team format drafted 10-30 times).
# Residual z = (pick − consensus) / sd, sd = 1.5 + 0.075·consensus (fitted earlier on these drafts). Negative z = reach.
# Need: the team's shortfall in the picked player's position group (G = PG/SG, F = SF/PF, C) versus an even build,
# from its earlier picks. Positions come from today's Fantrax ADP list, which covers 70-85% of drafted players.
import json, glob, collections, numpy as np
A = {p['id']: p for p in json.load(open('collect/data/adp/2026-10-17.json'))['players']}
G = lambda pos: {'PG': 'G', 'SG': 'G', 'SF': 'F', 'PF': 'F', 'F': 'F', 'C': 'C'}.get(pos)
rows = []
for f in sorted(glob.glob('collect/data/drafts/*.json')):
    d = json.load(open(f)); P = d['picks']; yr = d['format']['seasonYear']
    by = collections.defaultdict(list)
    for p in P: by[p['player']].append(p['pick'])
    cons = {k: np.mean(v) for k, v in by.items() if len(v) >= 3}
    teams = collections.defaultdict(list)
    for p in sorted(P, key=lambda x: (x['division'] or '', x['pick'])):
        key = (p['division'], p['team']); hist = teams[key]
        pid = p['player']; a = A.get(pid); grp = G(a['pos']) if a else None
        if grp and pid in cons and len(hist) >= 1:
            c = cons[pid]; z = (p['pick'] - c) / (1.5 + 0.075 * c)
            known = [h for h in hist if h]; n = len(hist)
            cnt = collections.Counter(known)
            share = {'G': 0.4, 'F': 0.4, 'C': 0.2}
            # shortfall in his group, scaled to all earlier picks (unknown positions spread evenly)
            have = cnt[grp] + (n - len(known)) * share[grp]
            need = share[grp] * n - have
            rows.append(dict(yr=yr, rnd=p['round'], cons=c, z=z, grp=grp, need=need, have=cnt[grp], n=n, zeroC=(grp == 'C' and cnt['C'] == 0 and len(known) == n)))
        hist.append(grp)
import pandas as pd
R = pd.DataFrame(rows); R = R[(R.z.abs() < 6)]
print('picks used', len(R), 'by year', R.yr.value_counts().sort_index().to_dict())
X = np.column_stack([np.ones(len(R)), R.need, R.rnd, R.rnd ** 2])
b, *_ = np.linalg.lstsq(X, R.z, rcond=None); res = R.z - X @ b
se = np.sqrt(np.diag(np.linalg.inv(X.T @ X)) * res.var())
print(f'z ~ need: coef {b[1]:+.3f} ± {se[1]:.3f} (negative = teams reach for the position group they are short in)')
for yr, g in R.groupby('yr'):
    X2 = np.column_stack([np.ones(len(g)), g.need, g.rnd, g.rnd ** 2]); b2, *_ = np.linalg.lstsq(X2, g.z, rcond=None); r2 = g.z - X2 @ b2
    print(' ', yr, f'{b2[1]:+.3f} ± {np.sqrt(np.linalg.inv(X2.T @ X2)[1,1] * r2.var()):.3f}', len(g))
R['needb'] = pd.cut(R.need, [-9, -1.5, -0.5, 0.5, 1.5, 9], labels=['≤-1.5 (over)', '-1', '0', '+1', '≥1.5 (short)'])
print(R[R.rnd >= 3].groupby(['grp', 'needb'], observed=True).z.agg(['mean', 'count']).round(2).to_string())
print('centers when team has no C yet, by round (mean z):')
c = R[R.grp == 'C']; c['state'] = np.where(c.have == 0, 'no C yet', np.where(c.have == 1, '1 C', '2+ C'))
print(c[c.rnd >= 3].groupby([pd.cut(c.rnd, [2, 6, 10, 20]), 'state'], observed=True).z.agg(['mean', 'count']).round(2).to_string())

# ---- Category need: does the team reach for players strong where it is weak? ----
# Player strength = prior-season per-game z-scores (9 cats, FG/FT as volume-weighted excess) from the game logs.
# Team weakness = −(sum of its earlier picks' z per category), standardized; fit = Σ_c z_player,c × weakness_c / 9.
L = pd.concat([pd.read_csv(f, usecols=['game_id', 'season', 'player_name', 'minutes', 'pts', 'reb', 'ast', 'fgm', 'fga', 'fg3m', 'ftm', 'fta', 'stl', 'blk', 'tov']) for f in ('logs_early.csv', 'logs3.csv')])
L = L[L.game_id.astype(str).str.lstrip('0').str.startswith('2') & (L.minutes > 0)]
import unicodedata
norm = lambda s: ''.join(ch for ch in unicodedata.normalize('NFKD', s) if not unicodedata.combining(ch)).lower().replace('.', '').replace("'", '').replace(' jr', '').replace(' iii', '').replace(' ii', '').strip()
Z = {}
for yr, season in ((2022, '2021-22'), (2023, '2022-23'), (2024, '2023-24')):
    g = L[L.season == season].groupby('player_name').agg('sum', numeric_only=True); n = L[L.season == season].groupby('player_name').size()
    g = g[n >= 20].div(n[n >= 20], axis=0)
    fgp = g.fgm.sum() / g.fga.sum(); ftp = g.ftm.sum() / g.fta.sum()
    M = pd.DataFrame({'fg': g.fgm - fgp * g.fga, 'ft': g.ftm - ftp * g.fta, '3': g.fg3m, 'pts': g.pts, 'reb': g.reb, 'ast': g.ast, 'stl': g.stl, 'blk': g.blk, 'to': -g.tov})
    top = M.loc[(M['pts'] + M['reb'] + M['ast']).sort_values(ascending=False).index[:200]]
    M = (M - top.mean()) / top.std()
    Z[yr] = {norm(k): v.values for k, v in M.iterrows()}
rows2 = []
for f in sorted(glob.glob('collect/data/drafts/*.json')):
    d = json.load(open(f)); P = d['picks']; yr = d['format']['seasonYear']; ZY = Z[yr]
    by = collections.defaultdict(list)
    for p in P: by[p['player']].append(p['pick'])
    cons = {k: np.mean(v) for k, v in by.items() if len(v) >= 3}
    zof = {}
    for pid, a in A.items():
        last, _, first = a['name'].partition(', '); k = norm(first + ' ' + last)
        if k in ZY: zof[pid] = ZY[k]
    teams = collections.defaultdict(lambda: np.zeros(9))
    for p in sorted(P, key=lambda x: (x['division'] or '', x['pick'])):
        key = (p['division'], p['team']); pid = p['player']
        if pid in zof and pid in cons and p['round'] >= 2:
            tot = teams[key]; w = -(tot - tot.mean()); w = w / (np.abs(w).max() or 1)
            c = cons[pid]; rows2.append(dict(yr=yr, rnd=p['round'], z=(p['pick'] - c) / (1.5 + 0.075 * c), fit=float(zof[pid] @ w) / 9))
        if pid in zof: teams[key] = teams[key] + zof[pid]
C2 = pd.DataFrame(rows2); C2 = C2[C2.z.abs() < 6]; C2['fit'] = (C2.fit - C2.fit.mean()) / C2.fit.std()
X = np.column_stack([np.ones(len(C2)), C2.fit, C2.rnd, C2.rnd ** 2]); b, *_ = np.linalg.lstsq(X, C2.z, rcond=None); r = C2.z - X @ b
print(f'\ncategory fit: picks {len(C2)}; z ~ fit (per 1 sd of fit) {b[1]:+.3f} ± {np.sqrt(np.linalg.inv(X.T @ X)[1,1] * r.var()):.3f}')
for yr, g in C2.groupby('yr'):
    X2 = np.column_stack([np.ones(len(g)), g.fit, g.rnd, g.rnd ** 2]); b2, *_ = np.linalg.lstsq(X2, g.z, rcond=None); r2 = g.z - X2 @ b2
    print(' ', yr, f'{b2[1]:+.3f} ± {np.sqrt(np.linalg.inv(X2.T @ X2)[1,1] * r2.var()):.3f}', len(g))
print(C2.groupby(pd.qcut(C2.fit, 5)).z.agg(['mean', 'count']).round(3).to_string())
