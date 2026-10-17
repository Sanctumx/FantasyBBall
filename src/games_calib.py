# Are injury-prone players over-valued? (2026-10-17)
# 1) How actual games relate to last season's games for drafted-calibre players (what the backtest projects from).
# 2) How BBM's 2026-27 projected games relate to the same players' 2025-26 games (what the board projects from).
import json, unicodedata, numpy as np, pandas as pd
norm = lambda s: ''.join(ch for ch in unicodedata.normalize('NFKD', s) if not unicodedata.combining(ch)).lower().replace('.', '').replace("'", '').replace(' jr', '').replace(' iii', '').replace(' ii', '').replace(' sr', '').strip()
L = pd.concat([pd.read_csv(f, dtype={'game_id': str}, usecols=['game_id', 'season', 'player_id', 'player_name', 'minutes']) for f in ('logs_early.csv', 'logs3.csv')])
L = L[L.game_id.str.startswith('002') & (L.minutes > 0)]
gp = L.groupby(['season', 'player_id']).size().unstack(0).fillna(0)
names = L.drop_duplicates('player_id').set_index('player_id').player_name
D = json.load(open('bt_data.json'))
rows = []
for s, prev in (('2022-23', '2021-22'), ('2023-24', '2022-23'), ('2024-25', '2023-24'), ('2025-26', '2024-25')):
    for p in D[s]['players'][:168]:          # the drafted pool: 14 teams x 12
        if p['pid'] in gp.index: rows.append(dict(season=s, prev=gp.loc[p['pid'], prev], act=gp.loc[p['pid'], s]))
R = pd.DataFrame(rows); R = R[R.prev >= 20]
b = np.polyfit(R.prev, R.act, 1)
print(f'1) backtest pool (drafted, prior games >= 20): actual = {b[1]:.1f} + {b[0]:.2f} x prior games   (n={len(R)})')
print(R.groupby(pd.cut(R.prev, [19, 50, 60, 70, 82])).act.agg(['mean', 'count']).round(1).to_string())
B = json.load(open('players.json')); gid = {norm(v): k for k, v in names.items()}
r2 = []
for p in B:
    k = gid.get(norm(p['n']))
    if k is not None and k in gp.index: r2.append(dict(n=p['n'], bbm=p['g'], last=gp.loc[k, '2025-26'], prev2=gp.loc[k, '2024-25'], adp=p['ftx']))
Q = pd.DataFrame(r2); Q = Q[(Q['last'] >= 20) & (Q.adp <= 168)]
b2 = np.polyfit(Q['last'], Q.bbm, 1)
print(f'\n2) BBM 2026-27 games vs 2025-26 games (top-168 ADP): bbm = {b2[1]:.1f} + {b2[0]:.2f} x last season   (n={len(Q)})')
print(Q.groupby(pd.cut(Q['last'], [19, 50, 60, 70, 82])).bbm.agg(['mean', 'count']).round(1).to_string())
print(Q[Q.n.str.contains('Leonard|Embiid|Morant|Irving|Williamson|Davis')].to_string(index=False))
