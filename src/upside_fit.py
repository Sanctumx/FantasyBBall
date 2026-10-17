# What predicts a player beating his projection? (2026-10-17) Players in each backtest pool (prior-season stats as the
# projection). Value = sum of per-game category z (same scale as the board's per-game value). Residual = next season's
# per-game value − last season's. Candidate upside signals: per-36 value above per-game value (room to grow minutes),
# low minutes, few seasons in the logs (young), low games.
import json, numpy as np, pandas as pd
L = pd.concat([pd.read_csv(f, usecols=['game_id', 'season', 'player_id', 'minutes', 'pts', 'reb', 'ast', 'fgm', 'fga', 'fg3m', 'ftm', 'fta', 'stl', 'blk', 'tov']) for f in ('logs_early.csv', 'logs3.csv')])
L = L[L.game_id.astype(str).str.lstrip('0').str.startswith('2') & (L.minutes > 0)]
seasons = ['2021-22', '2022-23', '2023-24', '2024-25', '2025-26']
V = {}
for s in seasons:
    g = L[L.season == s].groupby('player_id'); n = g.size(); t = g.sum(numeric_only=True)
    pg = t.div(n, axis=0); fgp = t.fgm.sum() / t.fga.sum(); ftp = t.ftm.sum() / t.fta.sum()
    M = pd.DataFrame({'fg': pg.fgm - fgp * pg.fga, 'ft': pg.ftm - ftp * pg.fta, '3': pg.fg3m, 'pts': pg.pts, 'reb': pg.reb, 'ast': pg.ast, 'stl': pg.stl, 'blk': pg.blk, 'to': -pg.tov})
    top = M[n >= 20].loc[(M.pts + M.reb + M.ast)[n >= 20].sort_values(ascending=False).index[:200]]
    Zs = (M - top.mean()) / top.std()
    V[s] = pd.DataFrame({'v': Zs.sum(1), 'min': pg.minutes, 'g': n, 'v36': Zs.sum(1) * 0})
    # per-36 value: scale counting parts by 36/min (approximation for the role-growth signal)
    k = (36 / pg.minutes.clip(lower=8))
    M36 = M.mul(k, axis=0); V[s]['v36'] = ((M36 - top.mean()) / top.std()).sum(1)
first = {}
for s in seasons:
    for pid in V[s].index: first.setdefault(pid, s)
D = json.load(open('bt_data.json')); rows = []
for s in D:
    pv = seasons[seasons.index(s) - 1]
    for i, p in enumerate(D[s]['players'][:200]):
        pid = p['pid']
        if pid in V[pv].index and pid in V[s].index and V[s].loc[pid, 'g'] >= 15:
            a = V[pv].loc[pid]
            rows.append(dict(s=s, rank=i + 1, v=a.v, res=V[s].loc[pid, 'v'] - a.v, gap=a.v36 - a.v, mins=a['min'], g=a.g, young=int(first[pid] >= seasons[seasons.index(pv) - 1]) if seasons.index(pv) > 0 else 0))
R = pd.DataFrame(rows)
print('players', len(R), '| residual sd', round(R.res.std(), 2))
for col in ['gap', 'mins', 'g', 'young', 'v']:
    print(f'corr(residual, {col}) = {R.res.corr(R[col]):+.2f}')
X = np.column_stack([np.ones(len(R)), R.gap, R.mins, R.v, R.young]); b, *_ = np.linalg.lstsq(X, R.res, rcond=None)
print('fit res ~ gap + minutes + value + young:', dict(zip(['const', 'gap', 'mins', 'v', 'young'], b.round(3))))
R['late'] = R['rank'] > 120
print(R.groupby([pd.qcut(R.gap, 4), 'late'], observed=True).res.agg(['mean', 'std', 'count']).round(2).to_string())
# spread of outcomes (the part that matters for a droppable late pick): |residual| by signal
R['absr'] = R.res.abs()
X = np.column_stack([np.ones(len(R)), R.gap, R.mins, R.young]); b, *_ = np.linalg.lstsq(X, R.absr, rcond=None)
print('|res| ~ gap + minutes + young:', dict(zip(['const', 'gap', 'mins', 'young'], b.round(3))))
print(R.groupby(pd.cut(R.mins, [0, 20, 25, 30, 48])).res.agg(['mean', 'std', 'count']).round(2).to_string())
print(R.groupby('young').res.agg(['mean', 'std', 'count']).round(2).to_string())
# upside score per backtest player = predicted outcome spread from last season's signals, fitted without his season
U = {}
allrows = []
for s in D:
    pv = seasons[seasons.index(s) - 1]
    for p in D[s]['players']:
        pid = p['pid']
        if pid in V[pv].index:
            a = V[pv].loc[pid]
            allrows.append(dict(s=s, pid=pid, gap=a.v36 - a.v, mins=a['min'], young=int(first[pid] >= seasons[max(0, seasons.index(pv) - 1)]) if seasons.index(pv) > 0 else 0))
A2 = pd.DataFrame(allrows)
for s in D:
    o = R[R.s != s]; X = np.column_stack([np.ones(len(o)), o.gap, o.mins, o.young]); b, *_ = np.linalg.lstsq(X, o.absr, rcond=None)
    q = A2[A2.s == s]; u = b[0] + b[1] * q.gap.clip(-1, 8) + b[2] * q.mins + b[3] * q.young
    U[s] = {str(int(pid)): round(float(x), 3) for pid, x in zip(q.pid, u)}
json.dump(U, open('upside_bt.json', 'w')); print('upside scores', {s: len(v) for s, v in U.items()}, 'example sd', round(np.std(list(U['2024-25'].values())), 3))
