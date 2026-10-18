# Prize equity (2026-10-18, the user's reporting metric; replaces title equity in reports). Prize: 1st 60, 2nd 30, losing
# semifinalist 5 (real_sum2.js). Equity = expected prize from logistic fits of P(title), P(reach final), P(reach semis) on
# matchup rate + made playoffs over every real-projection draft, combined with the actual prize by inverse variance, paired
# draft by draft against a baseline. Shown in title-equivalents per 100 seasons (prize ÷ 60), so it reads on the same scale.
# Run: python3 prize_equity.py <arm>:<baseline> [<arm>:<baseline> ...]     e.g. python3 prize_equity.py 41:23 42:23
import sys, json, glob, collections, numpy as np
rows, arms = [], {}
for f in glob.glob('bt_real_*.json'):
    d = json.load(open(f))
    for r in d['rows']: rows.append(r); arms[r['arm']] = d['name']
X = np.array([[1, r['me'], r['made']] for r in rows])
def logit(y):
    b = np.zeros(3)
    for _ in range(50):
        p = 1 / (1 + np.exp(-X @ b)); W = p * (1 - p); b += np.linalg.solve((X * W[:, None]).T @ X + 1e-6 * np.eye(3), X.T @ (y - p))
    return b
ge = lambda k: np.array([1.0 if (r['title'] if k == 3 else r['rounds'] >= k) else 0.0 for r in rows])
bT, bF, bS = logit(ge(3)), logit(ge(2)), logit(ge(1))
P = lambda b, r: 1 / (1 + np.exp(-(b[0] + b[1] * r['me'] + b[2] * r['made'])))
eq = lambda r: 60 * P(bT, r) + 30 * max(0, P(bF, r) - P(bT, r)) + 5 * max(0, P(bS, r) - P(bF, r))
prize = lambda r: 60 if r['title'] else 30 if r['rounds'] == 2 else 5 if r['rounds'] == 1 else 0
by = collections.defaultdict(dict)
for r in rows: by[r['arm']][(r['season'], r['slot'], r['seed'])] = r
se = lambda a: (np.mean(a), np.std(a, ddof=1) / np.sqrt(len(a)))
def comb(x, y): w1, w2 = 1 / x[1] ** 2, 1 / y[1] ** 2; return (w1 * x[0] + w2 * y[0]) / (w1 + w2), (1 / (w1 + w2)) ** 0.5
print(f'prize equity, title-equivalents per 100 seasons (prize 60/30/5 ÷ 60), fit on {len(rows)} drafts')
for spec in sys.argv[1:]:
    a, b = map(int, spec.split(':')); K = [k for k in by[a] if k in by[b]]
    if not K: print(f'{spec}: no paired drafts'); continue
    act = se([prize(by[a][k]) - prize(by[b][k]) for k in K]); e = se([eq(by[a][k]) - eq(by[b][k]) for k in K]); c = comb(act, e)
    print(f"{arms[a][:44]:44} vs arm {b:<3} n {len(K):3}  prize equity {c[0] / 0.6:+5.1f} ± {c[1] / 0.6:.1f}   (actual prize {act[0] / 0.6:+.1f} ± {act[1] / 0.6:.1f})")
