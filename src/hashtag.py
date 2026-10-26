# Hashtag Basketball 2026-27 projections (per game, newest data/hashtag_YYYY-MM-DD.xlsx) → players.json 'hs'.
# Matched to BBM players by normalized name; FG%/FT% from the percentage, attempts from the "(made/att)" text.
import json, re, unicodedata, glob, pandas as pd
norm = lambda s: re.sub(r'[^a-z ]', '', ''.join(ch for ch in unicodedata.normalize('NFKD', str(s)) if not unicodedata.combining(ch)).lower().replace(' jr', '').replace(' iii', '').replace(' ii', '').replace(' iv', '')).replace('  ', ' ').strip()
SRC = sorted(glob.glob('data/hashtag_*.xlsx'))[-1]; print('Hashtag file:', SRC)
X = pd.read_excel(SRC)
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
ADD_TO_RANK = 300   # Hashtag-only players up to this Hashtag rank are added (idea 126)
POS_FIX = {'Mario Hezonja': 'SF'}   # Hashtag leaves POS blank (2026-10-25 export); position by hand
TEAM = {'GS': 'GSW', 'NO': 'NOR', 'NY': 'NYK', 'SA': 'SAS', 'PHX': 'PHO', 'BKN': 'BKN'}
# idempotent: drop rows added by an earlier run, then add every Hashtag player BBM lacks
P = [p for p in P if p.get('src') != 'hs']
have = {norm(ALIAS.get(p['n'], p['n'])) for p in P}
import glob
snap = json.load(open(sorted(glob.glob('collect/data/adp/*.json'))[-1]))['players']
fx = {}
for q in snap:
    n = q['name']; n = (n.split(', ')[1] + ' ' + n.split(', ')[0]) if ', ' in n else n
    fx[norm(n)] = q['adp']
rk, added = max(p['rk'] for p in P), []
for _, r in X.iterrows():
    k = norm(r['PLAYER'])
    if k in have or k not in H or int(str(r['R#']).split()[0]) > ADD_TO_RANK: continue
    h = H[k]; rk += 1
    adp = float(r['ADP']) if str(r['ADP']) not in ('nan', '', '-') else None
    P.append(dict(n=h['name'], t=TEAM.get(r['TEAM'], r['TEAM']), p=POS_FIX.get(h['name']) or str(r['POS']).replace(',', '/'), **{kk: v for kk, v in h.items() if kk != 'name'},
                  adp=adp, ftx=fx.get(k), rk=rk, inj='', risk='', note='Hashtag only (no BBM projection).', src='hs',
                  hs={kk: v for kk, v in h.items() if kk != 'name'}))
    added.append(h['name'])
print('Hashtag-only players added:', len(added))
blank = [q['n'] for q in P if q.get('src') == 'hs' and q['p'] in ('nan', '')]
if blank: print('::warning::blank position for', blank, '- add to POS_FIX')
json.dump(P, open('players.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('hashtag rows', len(H), '| BBM players', len(P), '| matched', hit)
print('BBM players with no Hashtag projection:', miss)
