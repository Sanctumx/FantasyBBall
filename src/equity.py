# Title equity (2026-10-17): a low-noise stand-in for titles. Fit P(title) from the team's matchup win rate and whether it made
# the playoffs, on every real-projection backtest draft (logistic regression), then score each arm by the change in predicted
# title chance, paired draft by draft against its baseline. Combined metric = inverse-variance blend of real titles and equity.
import json, glob, numpy as np, collections
rows = []; arms = {}
for f in glob.glob('bt_real_*.json'):
    d = json.load(open(f))
    for r in d['rows']: rows.append(r); arms[r['arm']] = d['name']
X = np.array([[1, r['me'], r['made']] for r in rows]); y = np.array([r['title'] for r in rows], float)
b = np.zeros(3)
for _ in range(50):   # Newton steps for logistic regression
    p = 1 / (1 + np.exp(-X @ b)); W = p * (1 - p)
    b += np.linalg.solve((X * W[:, None]).T @ X + 1e-6 * np.eye(3), X.T @ (y - p))
print(f"fit on {len(rows)} drafts: logit P(title) = {b[0]:.2f} + {b[1]:.2f} × matchup rate + {b[2]:.2f} × made playoffs")
eq = lambda r: 1 / (1 + np.exp(-(b[0] + b[1] * r['me'] + b[2] * r['made'])))
for m in (0.45, 0.50, 0.55, 0.60):
    print(f"  matchup {m:.2f}: title chance {100*eq({'me': m, 'made': 1}):.1f}% if in the playoffs")
by = collections.defaultdict(dict)
for r in rows: by[r['arm']][(r['season'], r['slot'], r['seed'])] = r
def se(a): a = np.array(a, float); return a.mean(), a.std(ddof=1) / np.sqrt(len(a))
def cmp(a, base):
    K = [k for k in by[a] if k in by[base]]
    if not K: return
    t = se([by[a][k]['title'] - by[base][k]['title'] for k in K]); e = se([eq(by[a][k]) - eq(by[base][k]) for k in K])
    wt, we = 1 / t[1] ** 2 if t[1] else 0, 1 / e[1] ** 2
    comb = ((wt * t[0] + we * e[0]) / (wt + we), (1 / (wt + we)) ** 0.5)
    print(f"{arms[a][:40]:40} n {len(K):3}  titles {100*t[0]:+5.1f} ± {100*t[1]:.1f}   equity {100*e[0]:+5.1f} ± {100*e[1]:.1f}   combined {100*comb[0]:+5.1f} ± {100*comb[1]:.1f}")
print('\nvs the current board (Win M + look-ahead, Punt Off), titles per 100 seasons:')
for a in sorted(k for k in by if k >= 12): cmp(a, 7)
print('\nvs the old board (slide + Auto):')
for a in (1, 3, 7): cmp(a, 0)
