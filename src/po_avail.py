# Playoff-time availability of injury-prone players (2026-10-17). Drafted pool (top 168 of each backtest season),
# regular season only. Weeks counted from each season's first Monday; fantasy playoffs = weeks 18-23, as in the backtest.
# A player's availability = games played / his team's games (team of his last game before each date).
import json, numpy as np, pandas as pd
L = pd.concat([pd.read_csv(f, dtype={'game_id': str}, usecols=['game_id', 'game_date', 'season', 'player_id', 'team', 'minutes']) for f in ('logs_early.csv', 'logs3.csv')])
L = L[L.game_id.str.startswith('002')]; L['game_date'] = pd.to_datetime(L.game_date)
D = json.load(open('bt_data.json')); prev = {'2022-23': '2021-22', '2023-24': '2022-23', '2024-25': '2023-24', '2025-26': '2024-25'}
rows = []
for s in prev:
    t = L[L.season == s]; st = t.game_date.min(); st = st - pd.Timedelta(days=st.weekday())
    t = t.assign(wk=(t.game_date - st).dt.days // 7)
    tg = t.groupby('team').apply(lambda g: g.drop_duplicates('game_id')[['game_date', 'wk']].sort_values('game_date'))
    played = t[t.minutes > 0]
    pp = L[(L.season == prev[s]) & (L.minutes > 0)].groupby('player_id').size()
    for p in D[s]['players'][:168]:
        g = played[played.player_id == p['pid']].sort_values('game_date')
        if g.empty: continue
        dates = list(g.game_date); teams = list(g.team); pset = set(dates)
        cnt = {'rs': [0, 0], 'po': [0, 0], 'early': [0, 0]}
        for tm in set(teams):
            for d, wk in tg.loc[tm].itertuples(index=False):
                prevg = [i for i, x in enumerate(dates) if x <= d]
                cur = teams[prevg[-1]] if prevg else teams[0]
                if cur != tm: continue
                k = 'po' if 17 <= wk <= 22 else ('rs' if wk < 17 else None)
                if k is None: continue
                cnt[k][0] += d in pset; cnt[k][1] += 1
                if wk < 6: cnt['early'][0] += d in pset; cnt['early'][1] += 1
        if cnt['rs'][1] < 40 or cnt['po'][1] < 10: continue
        rows.append(dict(s=s, rs=cnt['rs'][0] / cnt['rs'][1], po=cnt['po'][0] / cnt['po'][1], early=cnt['early'][0] / max(1, cnt['early'][1]), prior=pp.get(p['pid'], 0) / 82))
R = pd.DataFrame(rows)
print('player-seasons', len(R))
print(f"mean availability: weeks 1-17 {R.rs.mean():.3f}, playoff weeks 18-23 {R.po.mean():.3f}")
b = np.polyfit(R.prior, R.po, 1); b2 = np.polyfit(R.prior, R.rs, 1)
print(f"prior-season availability predicts: playoff-weeks slope {b[0]:.2f}, weeks 1-17 slope {b2[0]:.2f}")
R['risk'] = pd.qcut(R.prior, 4, labels=['most injury-prone quarter', 'q2', 'q3', 'healthiest quarter'])
print(R.groupby('risk', observed=True)[['prior', 'rs', 'po']].mean().round(3).to_string())
R['start'] = np.where(R.early < 0.5, 'missed most of weeks 1-6', 'healthy early')
print(R.groupby('start')[['rs', 'po']].agg(['mean', 'count']).round(3).to_string())
c = R[['rs', 'po']].corr().iloc[0, 1]; print(f'corr(availability weeks 1-17, playoff weeks) = {c:.2f}')
