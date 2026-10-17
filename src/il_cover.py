# How much of drafted players' missed games can K IL spots cover when injuries overlap? (2026-10-17)
# Regular season only. A missed game = his team played and he didn't (or logged 0 minutes); his team on a missed
# day = the team of his last game before it (first game after, if none). Rosters: 126 drafted teams per season
# (backtest drafts, 3 seeds × slots 1/7/14 × 14 teams) passed as a JSON file.
# Coverage of K spots = Σ over team-days of min(players out, K) ÷ all missed games. "spell ≥ L": only absences of
# at least L straight team games are IL-eligible (short rests and 1-2 game knocks can't use an IL spot).
import sys, json, pandas as pd, numpy as np
R = json.load(open(sys.argv[1]))
d = pd.concat([pd.read_csv(f, dtype={'game_id': str}, usecols=['game_id', 'game_date', 'season', 'player_id', 'team', 'minutes']) for f in ('logs_early.csv', 'logs3.csv')])
d = d[d.game_id.str.startswith('002')]
res = {}
for season, rosters in R.items():
    t = d[d.season == season]
    tg = {tm: sorted(g.game_date.unique()) for tm, g in t.groupby('team')}
    pl = {pid: g[g.minutes > 0].sort_values('game_date') for pid, g in t.groupby('player_id')}
    miss = {}   # pid -> list of (date) missed, with spell lengths
    for ro in rosters:
        for pid in ro:
            if pid in miss: continue
            g = pl.get(pid)
            if g is None or g.empty: miss[pid] = None; continue
            played = dict(zip(g.game_date, g.team)); dates = list(g.game_date); teams = list(g.team)
            out = []
            for tm in set(teams):
                for day in tg[tm]:
                    if day in played: continue
                    # which team was he on that day: last game before, else first after
                    prev = [i for i, x in enumerate(dates) if x < day]
                    cur = teams[prev[-1]] if prev else teams[0]
                    if cur == tm: out.append(day)
            out.sort()
            # spells: consecutive missed team games (no played game between)
            spells, s = [], []
            allg = sorted(set(out) | set(dates))
            for day in allg:
                if day in played:
                    if s: spells.append(s); s = []
                else: s.append(day)
            if s: spells.append(s)
            miss[pid] = (len(dates), spells)
    cov = {}; tot = 0; gp = 0
    for ro in rosters:
        per = {L: {} for L in (1, 3, 7, 14)}
        for pid in ro:
            m = miss.get(pid)
            if not m: continue
            gp += m[0]
            for sp in m[1]:
                tot_add = len(sp)
                for L in per:
                    if len(sp) >= L:
                        for day in sp: per[L][day] = per[L].get(day, 0) + 1
            tot += sum(len(sp) for sp in m[1])
        for K in (1, 2, 3, 4):
            for L in per:
                cov[(K, L)] = cov.get((K, L), 0) + sum(min(v, K) for v in per[L].values())
            cov[(K, 'all7')] = cov.get((K, 'all7'), 0) + sum(per[7].values())
    res[season] = dict(missRate=tot / (tot + gp), cov={f'{K}|{L}': round(v / tot, 3) for (K, L), v in cov.items()})
    print(season, f'missed {100*tot/(tot+gp):.1f}% of team games;', ' '.join(f'IL{K}: any {cov[(K,1)]/tot:.2f} ≥3 {cov[(K,3)]/tot:.2f} ≥7 {cov[(K,7)]/tot:.2f} ≥14 {cov[(K,14)]/tot:.2f}' for K in (1, 2, 3, 4)), f'| ≥7 share uncapped {cov[(1,"all7")]/tot:.2f}')
