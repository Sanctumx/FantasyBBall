# Hashtag Basketball 2026-27 projections (per game, exported 2026-10-21, data/hashtag_2026-10-21.xlsx) → players.json 'hs'.
# Matched to BBM players by normalized name; FG%/FT% from the percentage, attempts from the "(made/att)" text.
import json, re, unicodedata, pandas as pd
norm = lambda s: re.sub(r'[^a-z ]', '', ''.join(ch for ch in unicodedata.normalize('NFKD', str(s)) if not unicodedata.combining(ch)).lower().replace(' jr', '').replace(' iii', '').replace(' ii', '').replace(' iv', '')).replace('  ', ' ').strip()
X = pd.read_excel('data/hashtag_2026-10-21.xlsx')
X = X[X['PLAYER'].astype(str) != 'PLAYER']
def shot(s):
    m = re.match(r'\s*([\d.]+)\s*\(([\d.]+)/([\d.]+)\)', str(s)); return (float(m.group(1)), float(m.group(3))) if m else (None, None)
H = {}
for _, r in X.iterrows():
    fgp, fga = shot(r['FG%']); ftp, fta = shot(r['FT%'])
    if fga is None: continue
    H[norm(r['PLAYER'])] = dict(name=r['PLAYER'], g=float(r['GP']), m=float(r['MPG']), pts=float(r['PTS']), tpm=float(r['3PM']), reb=float(r['TREB']), ast=float(r['AST']),
                               stl=float(r['STL']), blk=float(r['BLK']), fgp=fgp, fga=fga, ftp=ftp, fta=fta, to=float(r['TO']))
ALIAS = {'Cam Johnson': 'Cameron Johnson', 'Herb Jones': 'Herbert Jones', 'Lu Dort': 'Luguentz Dort'}   # BBM name → Hashtag name
P = json.load(open('players.json'))
hit, miss = 0, []
for p in P:
    k = norm(ALIAS.get(p['n'], p['n']))
    h = H.get(k)
    if h: p['hs'] = {kk: v for kk, v in h.items() if kk != 'name'}; hit += 1
    else: p.pop('hs', None); miss.append(p['n'])
json.dump(P, open('players.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('hashtag rows', len(H), '| BBM players', len(P), '| matched', hit)
print('BBM players with no Hashtag projection:', miss)
