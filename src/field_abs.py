# Draft field, absolute level (2026-10-17): how far a real room leans from preseason ADP toward projected value.
# LOFB Bowl 9-cat drafts 2022 (30 divisions) and 2024 (10), with the user's kits for the market and the projections:
# 2022-23 = Hashtag ADP + Hashtag projections, 2024-25 = kit ADP + BBM/Hashtag average (bt_proj.json). 2023 has no real ADP.
# Model (as the engine's Draft field): a player's expected slot = (1 − f)·ADP slot + f·value slot, value slot = his rank
# by projected season value. Room consensus = his mean pick across divisions. f = slope of (consensus − ADP slot) on
# (value slot − ADP slot), players in the top 150 by ADP drafted in most divisions. Bootstrap over players for the error.
# Run: python3 field_abs.py
import json, re, unicodedata, collections, numpy as np, pandas as pd
norm = lambda s: re.sub(r'[^a-z ]', '', ''.join(ch for ch in unicodedata.normalize('NFKD', str(s)) if not unicodedata.combining(ch)).lower().replace(' jr', '').replace(' iii', '').replace(' ii', '').replace(' iv', '')).replace('  ', ' ').strip()
ALIAS = {'cameron johnson': 'cam johnson', 'herbert jones': 'herb jones', 'luguentz dort': 'lu dort', 'nicolas claxton': 'nic claxton', 'alexandre sarr': 'alex sarr', 'moe wagner': 'moritz wagner', 'carlton carrington': 'bub carrington', 'gregory jackson': 'gg jackson', 'nah shon hyland': 'bones hyland', 'kenyon martin': 'kj martin'}
key = lambda s: ALIAS.get(norm(s), norm(s))
K = ['g', 'm', 'pts', 'tpm', 'reb', 'ast', 'stl', 'blk', 'fgp', 'fga', 'ftp', 'fta', 'to']
PROJ = json.load(open('bt_proj.json')); DATA = json.load(open('bt_data.json'))
FX = {p['id']: key(' '.join(reversed(p['name'].split(', ')))) for p in json.load(open('collect/data/adp/2026-10-17.json'))['players']}

def avg(b, x):
    o = {k: (b[k] + x[k]) / 2 for k in K if k not in ('fgp', 'ftp')}
    o['fgp'] = (b['fgp'] * b['fga'] + x['fgp'] * x['fga']) / 2 / o['fga'] if o['fga'] else b['fgp']
    o['ftp'] = (b['ftp'] * b['fta'] + x['ftp'] * x['fta']) / 2 / o['fta'] if o['fta'] else b['ftp']
    return o
def values(D, ids):
    M = pd.DataFrame({k: [D[p][k] for p in ids] for k in K}, index=ids); G = M.g
    fgp = (M.fgp * M.fga * G).sum() / (M.fga * G).sum(); ftp = (M.ftp * M.fta * G).sum() / (M.fta * G).sum()
    T = pd.DataFrame({'fg': (M.fgp - fgp) * M.fga * G, 'ft': (M.ftp - ftp) * M.fta * G, '3': M.tpm * G, 'pts': M.pts * G, 'reb': M.reb * G,
                      'ast': M.ast * G, 'stl': M.stl * G, 'blk': M.blk * G, 'to': -M.to * G})
    return ((T - T.mean()) / T.std()).sum(axis=1)

FIELD_F = {'Easy': 0.08, 'Average': 0.31, 'Strong': 0.46, 'Very strong': 0.62}
for f, season, src in (('collect/data/drafts/vnmb7hk2l7qsej5d.json', '2022-23', 'hs'), ('collect/data/drafts/3j4mzn4ym0uezl91.json', '2024-25', 'avg')):
    d = json.load(open(f)); P = d['picks']; nd = len(set(p['division'] for p in P))
    S = PROJ[season]; name2pid = {key(p['n']): str(p['pid']) for p in DATA[season]['players']}
    get = (lambda e: avg(e['bbm'], e['hs']) if 'bbm' in e and 'hs' in e else None) if src == 'avg' else (lambda e: e.get(src))
    # market + projections for the ADP top 200 with a projection
    ids = sorted([p for p, e in S.items() if 'adp' in e and get(e) is not None and get(e)['g'] > 0], key=lambda p: S[p]['adp'])[:200]
    v = values({p: get(S[p]) for p in ids}, ids)
    adp_slot = pd.Series({p: S[p]['adp'] for p in ids}).rank(method='first')
    val_slot = v.rank(ascending=False, method='first')
    # room consensus
    picks = collections.defaultdict(list)
    for p in P:
        nm = FX.get(p['player']); pid = name2pid.get(nm) if nm else None
        if pid: picks[pid].append(p['pick'])
    rows = []
    for p in ids:
        L = picks.get(p, [])
        if adp_slot[p] > 150 or len(L) < 0.8 * nd: continue
        rows.append((p, np.mean(L), adp_slot[p], val_slot[p]))
    R = pd.DataFrame(rows, columns=['pid', 'cons', 'adp', 'val'])
    # consensus is in picks of a 12-team draft; ADP/value slots are ranks: rescale consensus to rank units among these players
    R['cons_rk'] = R.cons.rank(method='first')
    y = (R.cons_rk - R.adp).values; x = (R.val - R.adp).values
    fit = lambda y, x: (x * y).sum() / (x * x).sum()
    fhat = fit(y, x); rng = np.random.default_rng(5)
    bs = [fit(y[i], x[i]) for i in (rng.integers(0, len(R), len(R)) for _ in range(2000))]
    # restrict to big disagreements (where the field setting matters)
    m = np.abs(x) >= 15; fbig = fit(y[m], x[m])
    rc = lambda a, b: pd.Series(a).rank().corr(pd.Series(b).rank())
    print(f"{season} ({d['format']['leagueName']}, {nd} divisions): {len(R)} players  f = {fhat:.2f} ± {np.std(bs):.2f}   "
          f"(players where value and ADP differ by 15+ slots: n {m.sum()}, f = {fbig:.2f})   rank corr consensus~ADP {rc(R.cons, R.adp):.3f}, ~value {rc(R.cons, R.val):.3f}")
print('\nBoard levels: ' + ', '.join(f'{k} {v}' for k, v in FIELD_F.items()))
