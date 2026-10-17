# Draft field (2026-10-17): how much do LOFB teams tilt from the room's consensus toward value? LOFB 2022-24.
# Consensus = a player's mean pick across that season's divisions. Value = prior-season total z (per-game z over the top
# 200, 9 cats, FG/FT as excess makes, × games played). Value slot = the consensus pick of the player at the same value rank.
# Per team (rounds 1-10): tilt b = Σ r·v / Σ v², r = pick − consensus, v = value slot − consensus. b = 1: drafts by value
# relative to the room; b = 0: drafts like the room. Null: picks shuffled among the 12 teams within each division round.
# NOTE: the room's own average tilt is 0 by construction (consensus is the room's mean), so this measures how teams
# differ from each other, not the room's absolute tilt vs Fantrax ADP (no historical ADP for 2022-24).
import json, glob, collections, unicodedata, numpy as np, pandas as pd
rng = np.random.default_rng(11)
norm = lambda s: ''.join(ch for ch in unicodedata.normalize('NFKD', s) if not unicodedata.combining(ch)).lower().replace('.', '').replace("'", '').replace(' jr', '').replace(' iii', '').replace(' ii', '').strip()
A = {p['id']: p for p in json.load(open('collect/data/adp/2026-10-17.json'))['players']}
L = pd.concat([pd.read_csv(f, usecols=['game_id', 'season', 'player_name', 'minutes', 'pts', 'reb', 'ast', 'fgm', 'fga', 'fg3m', 'ftm', 'fta', 'stl', 'blk', 'tov']) for f in ('logs_early.csv', 'logs3.csv')])
L = L[L.game_id.astype(str).str.lstrip('0').str.startswith('2') & (L.minutes > 0)]
V = {}
for yr, season in ((2022, '2021-22'), (2023, '2022-23'), (2024, '2023-24')):
    S = L[L.season == season]; g = S.groupby('player_name').agg('sum', numeric_only=True); n = S.groupby('player_name').size()
    g = g[n >= 10]; n = n[n >= 10]; pg = g.div(n, axis=0); fgp = g.fgm.sum() / g.fga.sum(); ftp = g.ftm.sum() / g.fta.sum()
    M = pd.DataFrame({'fg': pg.fgm - fgp * pg.fga, 'ft': pg.ftm - ftp * pg.fta, '3': pg.fg3m, 'pts': pg.pts, 'reb': pg.reb, 'ast': pg.ast, 'stl': pg.stl, 'blk': pg.blk, 'to': -pg.tov})
    top = M.loc[(M.pts + M.reb + M.ast).sort_values(ascending=False).index[:200]]
    z = ((M - top.mean()) / top.std()).sum(1) * n
    V[yr] = {norm(k): v for k, v in z.items()}
def tilts(P, cons, vslot):
    num, den = collections.defaultdict(float), collections.defaultdict(float)
    for p in P:
        pid = p['player']
        if p['round'] > 10 or pid not in vslot: continue
        r = p['pick'] - cons[pid]; v = vslot[pid] - cons[pid]
        if abs(v) > 60: continue
        num[(p['division'], p['team'])] += r * v; den[(p['division'], p['team'])] += v * v
    return {k: num[k] / den[k] for k in num if den[k] > 0}
out = []
for f in sorted(glob.glob('collect/data/drafts/*.json')):
    d = json.load(open(f)); yr = d['format']['seasonYear']; P = d['picks']
    vof = {}
    for pid, a in A.items():
        last, _, first = a['name'].partition(', '); k = norm(first + ' ' + last)
        if k in V[yr]: vof[pid] = V[yr][k]
    by = collections.defaultdict(list)
    for p in P: by[p['player']].append(p['pick'])
    cons = {k: np.mean(v) for k, v in by.items() if len(v) >= 3}
    ids = [k for k in cons if k in vof]
    cs = sorted(cons[k] for k in ids); vr = sorted(ids, key=lambda k: -vof[k])
    vslot = {k: cs[i] for i, k in enumerate(vr)}
    real = tilts(P, cons, vslot)
    # null: shuffle which team made each pick within (division, round)
    nulls = []
    grp = collections.defaultdict(list)
    for p in P: grp[(p['division'], p['round'])].append(p)
    for it in range(30):
        Q = []
        for key, ps in grp.items():
            teams = [p['team'] for p in ps]; rng.shuffle(teams)
            Q += [dict(p, team=t) for p, t in zip(ps, teams)]
        nulls += list(tilts(Q, cons, vslot).values())
    rb, nb = np.array(list(real.values())), np.array(nulls)
    q90 = np.quantile(nb, 0.9); q10 = np.quantile(nb, 0.1)
    out.append((yr, len(rb), rb.std(), nb.std(), (rb > q90).mean(), (rb < q10).mean(), np.corrcoef([cons[k] for k in ids], [vslot[k] for k in ids])[0, 1]))
    print(f"{yr}: {len(rb)} teams · tilt sd real {rb.std():.3f} vs shuffled {nb.std():.3f} · excess sd {np.sqrt(max(0, rb.var() - nb.var())):.3f} · "
          f"above shuffled 90th pct {100 * (rb > q90).mean():.0f}% (10% by chance) · below 10th {100 * (rb < q10).mean():.0f}% · consensus vs value-slot corr {out[-1][-1]:.2f}")
