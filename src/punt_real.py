# Do real drafters punt? (2026-10-17) LOFB Bowl drafts 2022-24. Each team's drafted roster is scored per category with
# the players' prior-season per-game z (logs), standardized across the 12 teams of its division. A punting team has one
# or two categories far below the others. Null: the same drafts with each round's picks shuffled among the 12 teams
# (keeps every team's draft-slot value, removes any deliberate build). Players not matched to logs are left out alike.
import json, glob, collections, unicodedata, numpy as np, pandas as pd
rng = np.random.default_rng(7)
norm = lambda s: ''.join(ch for ch in unicodedata.normalize('NFKD', s) if not unicodedata.combining(ch)).lower().replace('.', '').replace("'", '').replace(' jr', '').replace(' iii', '').replace(' ii', '').strip()
A = {p['id']: p for p in json.load(open('collect/data/adp/2026-10-17.json'))['players']}
L = pd.concat([pd.read_csv(f, usecols=['game_id', 'season', 'player_name', 'minutes', 'pts', 'reb', 'ast', 'fgm', 'fga', 'fg3m', 'ftm', 'fta', 'stl', 'blk', 'tov']) for f in ('logs_early.csv', 'logs3.csv')])
L = L[L.game_id.astype(str).str.lstrip('0').str.startswith('2') & (L.minutes > 0)]
CATS = ['FG%', 'FT%', '3PM', 'PTS', 'REB', 'AST', 'ST', 'BLK', 'TO']
Z = {}
for yr, season in ((2022, '2021-22'), (2023, '2022-23'), (2024, '2023-24')):
    g = L[L.season == season].groupby('player_name').agg('sum', numeric_only=True); n = L[L.season == season].groupby('player_name').size()
    g = g[n >= 20]; nn = n[n >= 20]
    pg = g.div(nn, axis=0); fgp = g.fgm.sum() / g.fga.sum(); ftp = g.ftm.sum() / g.fta.sum()
    M = pd.DataFrame({'FG%': pg.fgm - fgp * pg.fga, 'FT%': pg.ftm - ftp * pg.fta, '3PM': pg.fg3m, 'PTS': pg.pts, 'REB': pg.reb, 'AST': pg.ast, 'ST': pg.stl, 'BLK': pg.blk, 'TO': -pg.tov})
    Z[yr] = {norm(k): v.values for k, v in M.iterrows()}
def team_stats(rosters):
    # rosters: list of lists of z-vectors (raw per-game contributions); returns per team the standardized category profile
    T = np.array([np.sum(r, axis=0) if r else np.zeros(9) for r in rosters])
    S = (T - T.mean(0)) / (T.std(0) + 1e-9)
    srt = np.sort(S, axis=1)
    return srt[:, 0], srt[:, 1], (S < -1.5).sum(1)
real, null = collections.defaultdict(list), collections.defaultdict(list)
for f in sorted(glob.glob('collect/data/drafts/*.json')):
    d = json.load(open(f)); yr = d['format']['seasonYear']; ZY = Z[yr]
    zof = {}
    for pid, a in A.items():
        last, _, first = a['name'].partition(', '); k = norm(first + ' ' + last)
        if k in ZY: zof[pid] = ZY[k]
    by_div = collections.defaultdict(list)
    for p in d['picks']: by_div[p['division']].append(p)
    for div, P in by_div.items():
        teams = sorted(set(p['team'] for p in P)); ti = {t: i for i, t in enumerate(teams)}
        if len(teams) != 12: continue
        rounds = collections.defaultdict(list)
        for p in P: rounds[p['round']].append(p)
        R = [[] for _ in teams]
        for p in P:
            if p['player'] in zof: R[ti[p['team']]].append(zof[p['player']])
        a, b, c = team_stats(R); real['min'] += list(a); real['second'] += list(b); real['n15'] += list(c)
        for rep in range(20):
            Rn = [[] for _ in teams]
            for rd, ps in rounds.items():
                perm = rng.permutation(len(ps))
                for p, j in zip(ps, perm):
                    if p['player'] in zof: Rn[j % 12].append(zof[p['player']])
            a, b, c = team_stats(Rn); null['min'] += list(a); null['second'] += list(b); null['n15'] += list(c)
r, n = {k: np.array(v) for k, v in real.items()}, {k: np.array(v) for k, v in null.items()}
print(f"teams: real {len(r['min'])}, null {len(n['min'])}")
print(f"weakest category (sd below division): real {r['min'].mean():.2f}, null {n['min'].mean():.2f}")
print(f"second weakest: real {r['second'].mean():.2f}, null {n['second'].mean():.2f}")
for thr in (-1.5, -2.0, -2.5):
    print(f"share of teams with a category below {thr}: real {np.mean(r['min'] < thr):.3f}, null {np.mean(n['min'] < thr):.3f}")
print(f"teams with 2+ categories below -1.5: real {np.mean(r['n15'] >= 2):.3f}, null {np.mean(n['n15'] >= 2):.3f}")

# which category do the extreme teams sit lowest in?
def which(rosters):
    T = np.array([np.sum(r, axis=0) if r else np.zeros(9) for r in rosters]); S = (T - T.mean(0)) / (T.std(0) + 1e-9)
    return [(int(np.argmin(s)), float(s.min())) for s in S]
cr, cn = collections.Counter(), collections.Counter(); nr = nn = 0
rng = np.random.default_rng(7)
for f in sorted(glob.glob('collect/data/drafts/*.json')):
    d = json.load(open(f)); yr = d['format']['seasonYear']; ZY = Z[yr]; zof = {}
    for pid, a in A.items():
        last, _, first = a['name'].partition(', '); k = norm(first + ' ' + last)
        if k in ZY: zof[pid] = ZY[k]
    by_div = collections.defaultdict(list)
    for p in d['picks']: by_div[p['division']].append(p)
    for div, P in by_div.items():
        teams = sorted(set(p['team'] for p in P)); ti = {t: i for i, t in enumerate(teams)}
        if len(teams) != 12: continue
        R = [[] for _ in teams]
        for p in P:
            if p['player'] in zof: R[ti[p['team']]].append(zof[p['player']])
        for c, v in which(R):
            nr += 1
            if v < -2: cr[CATS[c]] += 1
        rounds = collections.defaultdict(list)
        for p in P: rounds[p['round']].append(p)
        for rep in range(20):
            Rn = [[] for _ in teams]
            for rd, ps in rounds.items():
                for p, j in zip(ps, rng.permutation(len(ps))):
                    if p['player'] in zof: Rn[j % 12].append(zof[p['player']])
            for c, v in which(Rn):
                nn += 1
                if v < -2: cn[CATS[c]] += 1
print('teams below -2 in their weakest category, by category (real % of teams vs shuffled %):')
for c in CATS: print(f'  {c:4s} real {100*cr[c]/nr:4.1f}%  shuffled {100*cn[c]/nn:4.1f}%  excess {100*(cr[c]/nr-cn[c]/nn):+4.1f}')
