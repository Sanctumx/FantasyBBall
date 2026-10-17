# Which projections? (2026-10-17) Preseason BBM and Hashtag from the user's draft kits (PasteBBM, UpdateHashtag) and their
# average, scored against that season's real regular-season results (logs3.csv). The 2025-26 kits' Hashtag tabs are stale
# (2024-25 data), so the valid head-to-head is 2024-25: python3 proj_eval.py data/proj_2024-25_kit.xlsx 2024-25
import sys
KIT, SEASON = (sys.argv[1], sys.argv[2]) if len(sys.argv) > 2 else ('data/proj_2024-25_kit.xlsx', '2024-25')
import openpyxl, re, unicodedata, numpy as np, pandas as pd
norm = lambda s: re.sub(r'[^a-z ]', '', ''.join(ch for ch in unicodedata.normalize('NFKD', str(s)) if not unicodedata.combining(ch)).lower().replace(' jr', '').replace(' iii', '').replace(' ii', '').replace(' iv', '')).replace('  ', ' ').strip()
ALIAS = {'cameron johnson': 'cam johnson', 'herbert jones': 'herb jones', 'luguentz dort': 'lu dort', 'nicolas claxton': 'nic claxton', 'alexandre sarr': 'alex sarr'}
key = lambda s: ALIAS.get(norm(s), norm(s))
K = ['g', 'm', 'pts', 'tpm', 'reb', 'ast', 'stl', 'blk', 'fgp', 'fga', 'ftp', 'fta', 'to']
wb = openpyxl.load_workbook(KIT, read_only=True, data_only=True)
R = list(wb['PasteBBM'].iter_rows(values_only=True)); h = R[0]; ix = {c: i for i, c in enumerate(h)}
B = {}
for r in R[1:]:
    if not r[ix['Name']] or r[ix['g']] is None: continue
    B[key(r[ix['Name']])] = dict(name=r[ix['Name']], rank=r[ix['Rank']], **{k: float(r[ix[c]] or 0) for k, c in zip(K, ['g', 'm/g', 'p/g', '3/g', 'r/g', 'a/g', 's/g', 'b/g', 'fg%', 'fga/g', 'ft%', 'fta/g', 'to/g'])})
R = list(wb['UpdateHashtag'].iter_rows(values_only=True)); h = R[0]; ix = {c: i for i, c in enumerate(h) if c}
H = {}
for r in R[1:]:
    if len(r) <= ix['FTA'] or not r[ix['NAME']] or r[ix['GP']] is None: continue
    H[key(r[ix['NAME']])] = dict(name=r[ix['NAME']], **{k: float(r[ix[c]] or 0) for k, c in zip(K, ['GP', 'MPG', 'PTS', '3PM', 'TREB', 'AST', 'STL', 'BLK', 'FG%', 'FGA', 'FT%', 'FTA', 'TO'])})
both = sorted(set(B) & set(H))
def avg(b, x):
    o = {k: (b[k] + x[k]) / 2 for k in K if k not in ('fgp', 'ftp')}
    o['fgp'] = (b['fgp'] * b['fga'] + x['fgp'] * x['fga']) / 2 / o['fga'] if o['fga'] else b['fgp']
    o['ftp'] = (b['ftp'] * b['fta'] + x['ftp'] * x['fta']) / 2 / o['fta'] if o['fta'] else b['ftp']
    return o
A = {k: avg(B[k], H[k]) for k in both}
L = pd.read_csv('logs3.csv', usecols=['game_id', 'season', 'player_name', 'minutes', 'pts', 'reb', 'ast', 'fgm', 'fga', 'fg3m', 'ftm', 'fta', 'stl', 'blk', 'tov'])
L = L[(L.season == SEASON) & L.game_id.astype(str).str.lstrip('0').str.startswith('2') & (L.minutes > 0)]
L['k'] = L.player_name.map(key)
g = L.groupby('k').agg('sum', numeric_only=True); n = L.groupby('k').size()
ACT = {k: dict(g=float(n[k]), m=g.minutes[k] / n[k], pts=g.pts[k] / n[k], tpm=g.fg3m[k] / n[k], reb=g.reb[k] / n[k], ast=g.ast[k] / n[k], stl=g.stl[k] / n[k], blk=g.blk[k] / n[k],
               fga=g.fga[k] / n[k], fgp=g.fgm[k] / max(1, g.fga[k]), fta=g.fta[k] / n[k], ftp=g.ftm[k] / max(1, g.fta[k]), to=g.tov[k] / n[k]) for k in g.index}
ZERO = dict(g=0, m=0, pts=0, tpm=0, reb=0, ast=0, stl=0, blk=0, fga=0, fgp=0, fta=0, ftp=0, to=0)
def values(D, pool):
    # Season basis 9-cat value: season totals, FG/FT as excess makes at the pool's %, each category standardized over the pool
    M = pd.DataFrame({k: [D.get(p, ZERO)[k] for p in pool] for k in K}, index=pool)
    G = M.g; fgp = (M.fgp * M.fga * G).sum() / (M.fga * G).sum(); ftp = (M.ftp * M.fta * G).sum() / (M.fta * G).sum()
    T = pd.DataFrame({'fg': (M.fgp - fgp) * M.fga * G, 'ft': (M.ftp - ftp) * M.fta * G, '3': M.tpm * G, 'pts': M.pts * G, 'reb': M.reb * G, 'ast': M.ast * G, 'stl': M.stl * G, 'blk': M.blk * G, 'to': -M.to * G})
    return ((T - T.mean()) / T.std()).sum(axis=1)
# Pool: the 200 best by the average projection (the draftable range), plus everyone either source ranks there
pre = values(A, both).sort_values(ascending=False)
pool = list(pre.index[:200])
actual = values(ACT, pool)
print(f'{SEASON}: BBM {len(B)} players, Hashtag {len(H)}, both {len(both)}; pool {len(pool)} (top 200 by Average); played {SEASON}: {sum(1 for p in pool if p in ACT)}')
rows = []
for name, D in (('BBM', B), ('Hashtag', H), ('Average', A)):
    v = values(D, pool)
    rho = pd.Series(v).rank().corr(actual.rank())
    top = v.sort_values(ascending=False).index
    t168 = actual[top[:168]].mean(); t56 = actual[top[:56]].mean()
    gm = np.mean([abs(D[p]['g'] - ACT.get(p, ZERO)['g']) for p in pool])
    pg = [p for p in pool if p in ACT and ACT[p]['g'] >= 20]
    sd = {k: np.std([ACT[p][k] for p in pg]) for k in ['pts', 'tpm', 'reb', 'ast', 'stl', 'blk', 'to', 'fgp', 'ftp', 'm']}
    err = {k: np.mean([abs(D[p][k] - ACT[p][k]) for p in pg]) / sd[k] for k in sd}
    rows.append((name, rho, gm, np.mean([err[k] for k in sd if k != 'm']), err['m'], t56, t168, err))
print(f"\n{'':8} {'value rank corr':>15} {'games MAE':>10} {'per-game err (sd)':>18} {'minutes err':>12} {'actual value, top 56':>21} {'top 168':>8}")
for name, rho, gm, e, em, t56, t168, err in rows:
    print(f"{name:8} {rho:15.3f} {gm:10.1f} {e:18.3f} {em:12.3f} {t56:21.2f} {t168:8.2f}")
print('\nper-stat error (in sd of the stat):')
for name, *_, err in rows: print(f"  {name:8} " + ' '.join(f"{k} {v:.3f}" for k, v in err.items()))
# bootstrap the value-rank correlation difference
rng = np.random.default_rng(3); vb, vh, va = values(B, pool), values(H, pool), values(A, pool); P = np.array(pool)
d = {'Average − BBM': [], 'Average − Hashtag': [], 'Hashtag − BBM': []}
for _ in range(2000):
    s = rng.choice(len(P), len(P)); a = actual.values[s]
    c = {nm: pd.Series(x.values[s]).rank().corr(pd.Series(a).rank()) for nm, x in (('B', vb), ('H', vh), ('A', va))}
    d['Average − BBM'].append(c['A'] - c['B']); d['Average − Hashtag'].append(c['A'] - c['H']); d['Hashtag − BBM'].append(c['H'] - c['B'])
print('\nvalue-rank corr differences (bootstrap ± sd):', {k: f"{np.mean(v):+.3f} ± {np.std(v):.3f}" for k, v in d.items()})
