# Daily player stats for the realistic-league scoring sim (stream_sim.js): bt_daily.json from logs3.csv + bt_data.json
import pandas as pd, json
d = pd.read_csv('logs3.csv', dtype={'game_id': str}); d = d[d.minutes > 0].copy(); d['game_date'] = pd.to_datetime(d.game_date)
D = json.load(open('bt_data.json')); out = {}
for season in ['2024-25', '2025-26']:
    t = d[d.season == season].copy(); st = t.game_date.min(); st = st - pd.Timedelta(days=st.weekday())
    t['day'] = (t.game_date - st).dt.days
    t = t[t.player_id.isin(set(p['pid'] for p in D[season]['players']))]
    daily = {}
    for r in t[['player_id', 'day', 'fgm', 'fga', 'ftm', 'fta', 'fg3m', 'pts', 'reb', 'ast', 'stl', 'blk', 'tov']].itertuples(index=False):
        daily.setdefault(str(r[0]), []).append([int(x) for x in r[1:]])
    out[season] = dict(daily=daily, ndays=int(t.day.max()) + 1)
json.dump(out, open('bt_daily.json', 'w'))
