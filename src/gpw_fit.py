# Fit the two weekly-games constants (2026-10-17).
# GPW (3.45 in the engine): average games per team per fantasy week. VAR_GAMES (0.55): variance of a player's games in a week.
import json, numpy as np, pandas as pd
S = json.load(open('sched.json')); g = S['games']; W = len(S['weeks'])
tot = np.array([[g[t][w] for w in range(W)] for t in g])            # teams × 25 calendar weeks
merged = np.delete(tot, 17, axis=1); merged[:, 16] += tot[:, 17]     # All-Star weeks merged -> 24 matchup weeks
print(f'2026-27 schedule: {tot.sum(1).mean():.1f} listed games per team (NBA Cup knockout games are not in the file); '
      f'per matchup week {merged.mean():.3f} (82/24 = {82/24:.3f}); team-week variance {merged.var(axis=1).mean():.3f}')
L = pd.concat([pd.read_csv(f, dtype={'game_id': str}, usecols=['game_id', 'game_date', 'season', 'player_id', 'team', 'minutes']) for f in ('logs_early.csv', 'logs3.csv')])
L = L[L.game_id.str.startswith('002')]; L['game_date'] = pd.to_datetime(L.game_date)
D = json.load(open('bt_data.json')); out = []
for s in D:
    t = L[L.season == s]; st = t.game_date.min(); st = st - pd.Timedelta(days=st.weekday()); t = t.assign(wk=(t.game_date - st).dt.days // 7)
    nwk = t.wk.max() + 1
    team_wk = t.drop_duplicates(['team', 'game_id']).groupby(['team', 'wk']).size().unstack(fill_value=0).reindex(columns=range(nwk), fill_value=0)
    pool = set(p['pid'] for p in D[s]['players'][:168])
    pl = t[(t.minutes > 0) & t.player_id.isin(pool)]
    for pid, gpl in pl.groupby('player_id'):
        wk = gpl.groupby('wk').size().reindex(range(nwk), fill_value=0)
        team = gpl.team.mode()[0]; tw = team_wk.loc[team]
        live = tw > 0
        act = wk[live]; on = act[act > 0]                                # weeks he played at least once
        if len(on) < 10: continue
        out.append(dict(s=s, all=act.var(), on=on.var(), sched=tw[live].var(), mean_on=on.mean()))
R = pd.DataFrame(out)
print(f'drafted player-seasons {len(R)}: weekly games variance — all weeks {R["all"].mean():.2f}, '
      f'weeks he played {R.on.mean():.2f} (mean {R.mean_on.mean():.2f} games), his team schedule alone {R.sched.mean():.2f}')
print(R.groupby('s')[['all', 'on', 'sched']].mean().round(2).to_string())
