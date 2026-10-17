# Players out at the start of each backtest season (2026-10-17): missed at least 5 of their team's opening games in a row
# (preseason injuries, known at draft time). kg = team games before his first appearance. Writes known_inj.json {season: {pid: kg}}.
import json, pandas as pd
L = pd.concat([pd.read_csv(f, dtype={'game_id': str}, usecols=['game_id', 'game_date', 'season', 'player_id', 'team', 'minutes']) for f in ('logs_early.csv', 'logs3.csv')])
L = L[L.game_id.str.startswith('002')]; L['game_date'] = pd.to_datetime(L.game_date)
D = json.load(open('bt_data.json')); out = {}
for s in D:
    t = L[L.season == s]; tg = t.drop_duplicates(['team', 'game_id']).groupby('team').game_date.apply(lambda x: sorted(x))
    pl = t[t.minutes > 0].sort_values('game_date').groupby('player_id').first()
    out[s] = {}
    for p in D[s]['players']:
        pid = p['pid']
        if pid not in pl.index: continue
        first, team = pl.loc[pid, 'game_date'], pl.loc[pid, 'team']
        kg = sum(1 for d in tg[team] if d < first)
        if kg >= 5: out[s][str(pid)] = int(kg)
    print(s, len(out[s]), 'players out at the start; in top 168:', sum(1 for p in D[s]['players'][:168] if str(p['pid']) in out[s]), sorted(out[s].values(), reverse=True)[:10])
json.dump(out, open('known_inj.json', 'w'))
