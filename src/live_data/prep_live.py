# Projections, box scores and team schedules for the LOFB 2024-25 replay (idea 146).
# Run from src/ after build_id_map.py:  PYTHONUTF8=1 python live_data/prep_live.py
#  -> live_data/proj.json   {fantrax id: {n, g, m, pts, tpm, reb, ast, stl, blk, fgp, fga, ftp, fta, to, adp}, '_waiver': {line + g}}
#     the app's 'avg' projection (BBM PasteBBM and Hashtag UpdateHashtag averaged field by field; whichever exists if only one), as bt_proj.py reads the kit
#  -> live_data/box.json    {fantrax id: [[day, fgm, fga, ftm, fta, fg3m, pts, reb, ast, stl, blk, tov, min, team], ...]}  day = days since 2024-10-22
#  -> live_data/games.json  {team: [dates]}  every 2024-25 game any player in logs3.csv played
import json, re, unicodedata, datetime
import openpyxl, pandas as pd

norm = lambda s: re.sub(r'[^a-z ]', '', ''.join(ch for ch in unicodedata.normalize('NFKD', str(s)) if not unicodedata.combining(ch)).lower().replace(' jr', '').replace(' iii', '').replace(' ii', '').replace(' iv', '')).replace('  ', ' ').strip()
ALIAS = {'cameron johnson': 'cam johnson', 'herbert jones': 'herb jones', 'luguentz dort': 'lu dort', 'nicolas claxton': 'nic claxton', 'alexandre sarr': 'alex sarr', 'moe wagner': 'moritz wagner', 'carlton carrington': 'bub carrington', 'gregory jackson': 'gg jackson', 'nah shon hyland': 'bones hyland', 'kenyon martin': 'kj martin'}
key = lambda s: ALIAS.get(norm(s), norm(s))
K = ['g', 'm', 'pts', 'tpm', 'reb', 'ast', 'stl', 'blk', 'fgp', 'fga', 'ftp', 'fta', 'to']
KIT = 'data/proj_2024-25_kit.xlsx'
D0 = datetime.date(2024, 10, 22)

def sheet(sh):
    R = list(openpyxl.load_workbook(KIT, read_only=True, data_only=True)[sh].iter_rows(values_only=True)); return R[0], R[1:]
def bbm():
    h, R = sheet('PasteBBM'); ix = {c: i for i, c in enumerate(h)}; out = {}
    for r in R:
        if not r[ix['Name']] or r[ix['g']] is None: continue
        out[key(r[ix['Name']])] = {k: float(r[ix[c]] or 0) for k, c in zip(K, ['g', 'm/g', 'p/g', '3/g', 'r/g', 'a/g', 's/g', 'b/g', 'fg%', 'fga/g', 'ft%', 'fta/g', 'to/g'])}
    return out
def hs():
    h, R = sheet('UpdateHashtag'); ix = {c: i for i, c in enumerate(h) if c}; out = {}; adp = {}
    for r in R:
        if len(r) <= ix['FTA'] or not r[ix['NAME']] or r[ix['GP']] is None: continue
        k = key(r[ix['NAME']])
        out[k] = {c: float(r[ix[x]] or 0) for c, x in zip(K, ['GP', 'MPG', 'PTS', '3PM', 'TREB', 'AST', 'STL', 'BLK', 'FG%', 'FGA', 'FT%', 'FTA', 'TO'])}
        if isinstance(r[ix['ADP']], (int, float)): adp[k] = float(r[ix['ADP']])
    return out, adp

B, (H, A) = bbm(), hs()
idm = json.load(open('live_data/id_map.json', encoding='utf8'))
proj = {}
for fid, v in idm.items():
    k = key(v['name']); src = [x[k] for x in (B, H) if k in x]
    if not src: continue
    p = {c: sum(s[c] for s in src) / len(src) for c in K}; p['n'] = v['name']; p['adp'] = A.get(k)
    proj[fid] = p
# the app's no-projection level: the average of the 15 lowest-ranked projected players (by ADP here)
tail = sorted([p for p in proj.values() if p['adp'] is not None], key=lambda p: -p['adp'])[:15]
proj['_waiver'] = {c: sum(p[c] for p in tail) / len(tail) for c in K}
json.dump(proj, open('live_data/proj.json', 'w'))
print('projected', len(proj) - 1, 'of', len(idm), '| waiver g', round(proj['_waiver']['g'], 1), 'pts', round(proj['_waiver']['pts'], 1))

d = pd.read_csv('logs3.csv', usecols=['season', 'game_date', 'player_id', 'team', 'minutes', 'fgm', 'fga', 'ftm', 'fta', 'fg3m', 'pts', 'reb', 'ast', 'stl', 'blk', 'tov'])
d = d[d.season == '2024-25'].fillna(0)
g = {t: sorted(set(x)) for t, x in d.groupby('team')['game_date']}
json.dump(g, open('live_data/games.json', 'w'))
by_nba = {v['nba']: fid for fid, v in idm.items()}
box = {}
for pid, x in d[d.player_id.isin(by_nba)].groupby('player_id'):
    x = x.sort_values('game_date')
    box[by_nba[pid]] = [[(datetime.date.fromisoformat(r.game_date) - D0).days, r.fgm, r.fga, r.ftm, r.fta, r.fg3m, r.pts, r.reb, r.ast, r.stl, r.blk, r.tov, r.minutes, r.team] for r in x.itertuples()]
json.dump(box, open('live_data/box.json', 'w'), default=float)
print('box players', len(box), 'of', len(idm), '| teams', len(g), '| games per team', sorted({len(v) for v in g.values()}))
