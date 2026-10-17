# Positions for backtest players (2026-10-17). bt_data had every player as SF.
# 1) BBM 2026-27 eligibility (players.json) where the name matches; 2) otherwise a 7-nearest-neighbour vote on per-36
# stats (AST, REB, BLK, 3PM, STL, FTA share, PTS) trained on BBM players, keeping the Fantrax primary position when known.
# Writes bt_pos.json {pid: "PG/SG"}; leave-one-out check on the BBM players printed.
import json, unicodedata, numpy as np
norm = lambda s: ''.join(ch for ch in unicodedata.normalize('NFKD', s) if not unicodedata.combining(ch)).lower().replace('.', '').replace("'", '').replace(' jr', '').replace(' iii', '').replace(' ii', '').replace(' sr', '').strip()
POS = ['PG', 'SG', 'SF', 'PF', 'C']
def feat(p):
    m = max(p['m'], 10); k = 36 / m
    return [p['ast'] * k, p['reb'] * k, p['blk'] * k, p['tpm'] * k, p['stl'] * k, p['fta'] / max(p['fga'], 1), p['pts'] * k]
BB = json.load(open('players.json'))
Xb = np.array([feat(p) for p in BB]); Yb = np.array([[ps in p['p'].split('/') for ps in POS] for p in BB], float)
mu, sd = Xb.mean(0), Xb.std(0); Xs = (Xb - mu) / sd
W = np.array([1.5, 1.5, 1.2, 1.0, 0.6, 0.6, 0.4])   # AST/REB/BLK separate guards from bigs most
def vote(x, excl=None, prim=None):
    d = (((Xs - (x - mu) / sd) * W) ** 2).sum(1)
    if excl is not None: d[excl] = 1e9
    nn = np.argsort(d)[:7]; share = Yb[nn].mean(0)
    el = [POS[i] for i in range(5) if share[i] >= 0.4]
    if prim and prim not in el: el.append(prim)
    if not el: el = [POS[int(np.argmax(share))]]
    # eligibility is contiguous on the PG..C line (e.g. no PG/C)
    ix = sorted(POS.index(e) for e in el); el = POS[ix[0]:ix[-1] + 1]
    return '/'.join(el[:3])
# leave-one-out on BBM players
hit = np.zeros(5); tot = 0; exact = 0
for i, p in enumerate(BB):
    g = vote(Xb[i], excl=i).split('/'); t = p['p'].split('/')
    hit += [(ps in g) == (ps in t) for ps in POS]; exact += set(g) == set(t); tot += 1
print('LOO per-position agreement', dict(zip(POS, (hit / tot).round(3))), 'exact set', round(exact / tot, 3))
B = {norm(p['n']): p['p'] for p in BB}
F = {}
for p in json.load(open('collect/data/adp/2026-10-17.json'))['players']:
    l, _, f = p['name'].partition(', '); F[norm(f + ' ' + l)] = p['pos'] if p['pos'] in POS else None
D = json.load(open('bt_data.json')); out = {}; src = {'bbm': 0, 'knn+fantrax': 0, 'knn': 0}
for s in D:
    for p in D[s]['players']:
        k = norm(p['n'])
        if k in B: out[str(p['pid'])] = B[k]; src['bbm'] += 1
        else:
            out[str(p['pid'])] = vote(np.array(feat(p)), prim=F.get(k)); src['knn+fantrax' if F.get(k) else 'knn'] += 1
json.dump(out, open('bt_pos.json', 'w'))
import collections
print('sources (player-seasons)', src); print(collections.Counter(out.values()).most_common(10))
