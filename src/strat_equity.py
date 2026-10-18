# Scores the league of drafting strategies (bt_strat.js, run33): each strategy's prize equity per team-season, in
# title-equivalents per 100 seasons (prize 60/30/5 ÷ 60; fair share in a 14-team league = 100 × 100 / 14 / 60 ≈ 11.9).
# Equity = the prize_equity.py logistic fits (P(title / final / semis) on matchup rate + made playoffs, fit on every
# bt_real draft) combined by inverse variance with the actual prize. Errors: by draft (each strategy's mean minus the
# draft's mean, so league-wide luck cancels). Run: python3 strat_equity.py
import json, glob, collections, numpy as np
rows = [r for f in glob.glob('bt_real_*.json') for r in json.load(open(f))['rows']]
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
S = [r for f in glob.glob('bt_strat_*.json') for r in json.load(open(f))['rows']]
D = collections.defaultdict(list)
for r in S: D[(r['season'], r['seed'])].append(r)
NAME = {'board': 'Model pick (this board)', 'z': 'Standard Zscore, TO ×0.5', 'h2h': 'H2H-Adjusted Zscore, TO ×0.5', 'adp': 'ADP'}
fair = 100 * 100 / 14 / 60
print(f'{len(D)} drafts, {len(S)} team-seasons; fair share {fair:.1f}')
se = lambda a: (np.mean(a), np.std(a, ddof=1) / np.sqrt(len(a)))
def comb(x, y): w1, w2 = 1 / x[1] ** 2, 1 / y[1] ** 2; return (w1 * x[0] + w2 * y[0]) / (w1 + w2), (1 / (w1 + w2)) ** 0.5
for s in ['board', 'z', 'h2h', 'adp']:
    dE, dA, rate, made, title, n = [], [], [], [], [], 0
    for k, L in D.items():
        T = [r for r in L if r['strat'] == s]
        if not T: continue
        mE = np.mean([eq(r) for r in L]); mA = np.mean([prize(r) for r in L])
        dE.append(np.mean([eq(r) for r in T]) - mE); dA.append(np.mean([prize(r) for r in T]) - mA)
        rate += [r['me'] for r in T]; made += [r['made'] for r in T]; title += [r['title'] for r in T]; n += len(T)
    c = comb(se(dA), se(dE))
    print(f"{NAME[s]:30} teams {n:4}  prize equity {fair + c[0] / 0.6:5.1f} ± {c[1] / 0.6:.1f} (vs fair {c[0] / 0.6:+.1f})   actual {fair + se(dA)[0] / 0.6:5.1f}   matchup rate {np.mean(rate):.3f}   playoffs {100 * np.mean(made):.0f}%   titles {100 * np.mean(title):.1f}%")
