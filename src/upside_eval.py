# Upside check (2026-10-17): do young players (1st-3rd NBA season) beat their preseason projections more than veterans,
# especially in the late rounds? Value = 9-cat season-total z (counting stats summed over games; FG%/FT% as volume-weighted
# impact), scaled on the top 168 projected players. Residual = actual value - projected value. Uses the projections each
# backtest season uses (Hashtag 2022-23 / 2023-24, Average 2024-25, BBM 2025-26) and actual weekly stats.
import json, numpy as np
D = json.load(open('bt_data.json')); PR = json.load(open('bt_proj.json'))
SRC = {'2022-23': 'hs', '2023-24': 'hs', '2024-25': 'avg', '2025-26': 'bbm'}
def entry(pid):   # rookie season start year from NBA person id
    for lo, y in [(1642801, 2025), (1642201, 2024), (1641705, 2023), (1631094, 2022), (1630526, 2021), (1630162, 2020), (1629601, 2019), (1628960, 2018), (1628365, 2017), (1627732, 2016)]:
        if pid >= lo: return y
    return 2000
def proj_of(e, src):
    if src == 'avg':
        xs = [e[s] for s in ('bbm', 'hs') if s in e]
        if not xs: return None
        k = xs[0].keys(); return {c: np.mean([x[c] for x in xs]) for c in k}
    return e.get(src) or e.get('bbm') or e.get('hs')
rows = []
for season, src in SRC.items():
    Y = int(season[:4]); W = D[season]['weekly']
    pool = []
    for pid, e in PR[season].items():
        p = proj_of(e, src)
        if not p: continue
        g = p['g']; fgm, ftm = p['fgp'] * p['fga'], p['ftp'] * p['fta']
        pr = np.array([fgm * g, p['fga'] * g, ftm * g, p['fta'] * g, p['tpm'] * g, p['pts'] * g, p['reb'] * g, p['ast'] * g, p['stl'] * g, p['blk'] * g, p['to'] * g])
        a = np.zeros(11)
        for wk in W.get(pid, {}).values(): a += np.array(wk[:11])
        pool.append((int(pid), e.get('adp') or 999, pr, a))
    top = sorted(pool, key=lambda r: r[1])[:168]
    T = np.array([r[2] for r in top])
    fgr, ftr = T[:, 0].sum() / T[:, 1].sum(), T[:, 2].sum() / T[:, 3].sum()
    def cats(v): return np.array([v[0] - fgr * v[1], v[2] - ftr * v[3], v[4], v[5], v[6], v[7], v[8], v[9], -v[10]])
    C = np.array([cats(r[2]) for r in top]); mu, sd = C.mean(0), C.std(0)
    val = lambda v: float(((cats(v) - mu) / sd).sum())
    for pid, adp, pr, a in pool:
        rows.append(dict(season=season, pid=pid, adp=adp, exp=Y - entry(pid) + 1, pv=val(pr), av=val(a)))
def se(x): x = np.array(x); return x.mean(), x.std(ddof=1) / np.sqrt(len(x)) if len(x) > 1 else 0
print('Residual = actual minus projected season value (z units; 1 unit ≈ the gap between ~10 draft spots in the middle rounds)')
for lab, lo, hi in [('Rounds 1-6 (ADP 1-84)', 0, 84), ('Rounds 7-12 (ADP 85-168)', 84, 168), ('Late / undrafted (ADP 169-250)', 168, 250)]:
    print('\n' + lab)
    for gl, f in [('Rookies', lambda e: e == 1), ('2nd year', lambda e: e == 2), ('3rd year', lambda e: e == 3), ('Years 1-3', lambda e: e <= 3), ('Veterans 4+', lambda e: e >= 4)]:
        R = [r for r in rows if lo < r['adp'] <= hi and f(r['exp'])]
        if len(R) < 3: continue
        res = [r['av'] - r['pv'] for r in R]; m, s = se(res)
        print(f"  {gl:12} n {len(R):3}  residual {m:+.2f} ± {s:.2f}   beat by 2+ {100*np.mean([x > 2 for x in res]):4.0f}%   missed by 2+ {100*np.mean([x < -2 for x in res]):4.0f}%")
    for s_ in SRC:
        y = [r['av'] - r['pv'] for r in rows if lo < r['adp'] <= hi and r['exp'] <= 3 and r['season'] == s_]; v = [r['av'] - r['pv'] for r in rows if lo < r['adp'] <= hi and r['exp'] >= 4 and r['season'] == s_]
        if len(y) > 2 and len(v) > 2: print(f"    {s_}: young − vets {np.mean(y) - np.mean(v):+.2f} (n {len(y)} / {len(v)})")
json.dump(rows, open('upside_rows.json', 'w'))
