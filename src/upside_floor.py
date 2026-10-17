# Upside vs downside with a drop floor (2026-10-17): a late pick who busts gets dropped for a waiver player, so his value
# to you is max(actual, replacement). Replacement = average actual value of actual ranks 169-190 (2022-23 has only 165
# projected players, so it takes the other seasons' average). Compares young (NBA years 2-3) with veterans by round.
import json, numpy as np
R = json.load(open('upside_rows.json'))
def se(x): x = np.array(x); return x.mean(), x.std(ddof=1) / np.sqrt(len(x))
reps = {}
for s in sorted({r['season'] for r in R}):
    av = sorted([r['av'] for r in R if r['season'] == s], reverse=True)
    if len(av) >= 190: reps[s] = float(np.mean(av[168:190]))
fill = float(np.mean(list(reps.values())))
for r in R: r['rep'] = reps.get(r['season'], fill); r['kept'] = max(r['av'], r['rep'])
print('replacement level:', {s: round(reps.get(s, fill), 2) for s in sorted({r['season'] for r in R})})
for lab, lo, hi in [('Rounds 1-6 (ADP 1-84)', 0, 84), ('Rounds 7-12 (ADP 85-168)', 84, 168), ('Rounds 10-12 (ADP 127-168)', 126, 168)]:
    print('\n' + lab); out = {}
    for gl, f in [('Years 2-3', lambda e: e <= 3), ('Veterans 4+', lambda e: e >= 4)]:
        G = [r for r in R if lo < r['adp'] <= hi and f(r['exp'])]
        up = [max(r['av'] - r['pv'], 0) for r in G]; dn = [max(r['pv'] - r['kept'], 0) for r in G]; net = [r['kept'] - r['pv'] for r in G]; out[gl] = net
        print(f"  {gl:12} n {len(G):3}  upside {np.mean(up):.2f}  downside after drop {np.mean(dn):.2f}  net {se(net)[0]:+.2f} ± {se(net)[1]:.2f}")
    a, b = out['Years 2-3'], out['Veterans 4+']; print(f"  young − vets {np.mean(a) - np.mean(b):+.2f} ± {np.sqrt(se(a)[1] ** 2 + se(b)[1] ** 2):.2f}")
