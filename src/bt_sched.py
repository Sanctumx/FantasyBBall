# Logs: logs_early.csv (2021-22, 2022-23) + logs3.csv (2023-24 to 2025-26)
# Team games per calendar week for the backtest seasons (bt_sched.json), from logs3.csv.
# Week 0 starts on the Monday of opening week, the same day 0 as bt_daily.json (mk_daily.py).
import pandas as pd, json
d = pd.concat([pd.read_csv(f, dtype={'game_id': str}) for f in ('logs_early.csv', 'logs3.csv')], ignore_index=True); d['game_date'] = pd.to_datetime(d.game_date)
out = {}
for season in ['2022-23', '2023-24', '2024-25', '2025-26']:
    t = d[d.season == season]; st = t.game_date.min(); st = st - pd.Timedelta(days=st.weekday())
    g = t.groupby(['team', 'game_id']).game_date.first().reset_index()
    g['wk'] = (g.game_date - st).dt.days // 7
    nweeks = int(g.wk.max()) + 1
    games = {team: [int(x) for x in grp.groupby('wk').size().reindex(range(nweeks), fill_value=0)] for team, grp in g.groupby('team')}
    out[season] = dict(start=str(st.date()), nweeks=nweeks, games=games)
    po = {k: sum(v[17:23]) for k, v in games.items()}
    print(season, 'start', st.date(), 'weeks', nweeks, 'teams', len(games), '| playoff-week games (wk 18-23): min', min(po.values()), 'max', max(po.values()), 'avg', round(sum(po.values()) / len(po), 1))
json.dump(out, open('bt_sched.json', 'w'))
