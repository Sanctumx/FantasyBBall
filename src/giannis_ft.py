# Do teams that draft Giannis punt FT%? (2026-10-17) LOFB 2022-24, same method as punt_real.py: each team's category
# profile from prior-season per-game z, standardized within its 12-team division; null = each round's picks shuffled
# among the teams (Giannis stays on some team, his teammates become random for their slots).
exec(open('punt_real.py').read().split("real, null = collections.defaultdict(list)")[0])
GID = [k for k, a in A.items() if a['name'] == 'Antetokounmpo, Giannis']
print('Giannis id', GID)
def ftz(R, gi):
    T = np.array([np.sum(r, axis=0) if r else np.zeros(9) for r in R]); S = (T - T.mean(0)) / (T.std(0) + 1e-9)
    # FT% profile of his team, and FT% without Giannis himself (deliberate punt = teammates also bad at FT)
    return S[gi, 1]
real, null, realX, nullX = [], [], [], []
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
        gp = [p for p in P if p['player'] in GID]
        if not gp: continue
        gt = ti[gp[0]['team']]
        R = [[] for _ in teams]; Rx = [[] for _ in teams]
        for p in P:
            if p['player'] in zof: R[ti[p['team']]].append(zof[p['player']]);
            if p['player'] in zof and p['player'] not in GID: Rx[ti[p['team']]].append(zof[p['player']])
        real.append(ftz(R, gt)); realX.append(ftz(Rx, gt))
        rounds = collections.defaultdict(list)
        for p in P: rounds[p['round']].append(p)
        for rep in range(40):
            Rn = [[] for _ in teams]; Rnx = [[] for _ in teams]; gj = None
            for rd, ps in rounds.items():
                for p, j in zip(ps, rng.permutation(len(ps))):
                    if p['player'] in GID: gj = j % 12
                    if p['player'] in zof: Rn[j % 12].append(zof[p['player']])
                    if p['player'] in zof and p['player'] not in GID: Rnx[j % 12].append(zof[p['player']])
            null.append(ftz(Rn, gj)); nullX.append(ftz(Rnx, gj))
r, n, rx, nx = map(np.array, (real, null, realX, nullX))
print(f'Giannis teams: {len(r)} (one per division)')
print(f'FT% of his team (sd vs division): real {r.mean():.2f}, shuffled {n.mean():.2f}; share below -1.5: real {np.mean(r < -1.5):.2f}, shuffled {np.mean(n < -1.5):.2f}')
print(f'FT% of his teammates alone: real {rx.mean():.2f}, shuffled {nx.mean():.2f}; share below -1: real {np.mean(rx < -1):.2f}, shuffled {np.mean(nx < -1):.2f}')
