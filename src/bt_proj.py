# Real preseason projections and ADP for backtests (2026-10-17) → bt_proj.json: {season: {pid: {bbm, hs, adp}}}.
# 2024-25: BBM (PasteBBM) and Hashtag (UpdateHashtag) from data/proj_2024-25_kit.xlsx, ADP from the kit's ADP column.
# 2025-26: BBM (PasteBBM) and ADP (UpdateBBM) from data/proj_2025-26_kit2.xlsx; the kit's Hashtag tab is stale, so no hs.
# 2022-23 and 2023-24: Hashtag only ('Paste #BBall' tabs of data/proj_2022-23_kit.xlsx / proj_2023-24_kit.xlsx); ADP from that
# tab in 2022-23; 2023-24 has none, so Hashtag's own rank (R#) stands in as the market.
import json, re, unicodedata, openpyxl
norm = lambda s: re.sub(r'[^a-z ]', '', ''.join(ch for ch in unicodedata.normalize('NFKD', str(s)) if not unicodedata.combining(ch)).lower().replace(' jr', '').replace(' iii', '').replace(' ii', '').replace(' iv', '')).replace('  ', ' ').strip()
ALIAS = {'cameron johnson': 'cam johnson', 'herbert jones': 'herb jones', 'luguentz dort': 'lu dort', 'nicolas claxton': 'nic claxton', 'alexandre sarr': 'alex sarr', 'moe wagner': 'moritz wagner', 'carlton carrington': 'bub carrington', 'gregory jackson': 'gg jackson', 'nah shon hyland': 'bones hyland', 'kenyon martin': 'kj martin'}
key = lambda s: ALIAS.get(norm(s), norm(s))
K = ['g', 'm', 'pts', 'tpm', 'reb', 'ast', 'stl', 'blk', 'fgp', 'fga', 'ftp', 'fta', 'to']
def sheet(f, sh):
    R = list(openpyxl.load_workbook(f, read_only=True, data_only=True)[sh].iter_rows(values_only=True)); return R[0], R[1:]
def bbm(f):
    h, R = sheet(f, 'PasteBBM'); ix = {c: i for i, c in enumerate(h)}; out = {}
    for r in R:
        if not r[ix['Name']] or r[ix['g']] is None: continue
        out[key(r[ix['Name']])] = {k: float(r[ix[c]] or 0) for k, c in zip(K, ['g', 'm/g', 'p/g', '3/g', 'r/g', 'a/g', 's/g', 'b/g', 'fg%', 'fga/g', 'ft%', 'fta/g', 'to/g'])}
    return out
def hs(f):
    h, R = sheet(f, 'UpdateHashtag'); ix = {c: i for i, c in enumerate(h) if c}; out = {}
    for r in R:
        if len(r) <= ix['FTA'] or not r[ix['NAME']] or r[ix['GP']] is None: continue
        out[key(r[ix['NAME']])] = {k: float(r[ix[c]] or 0) for k, c in zip(K, ['GP', 'MPG', 'PTS', '3PM', 'TREB', 'AST', 'STL', 'BLK', 'FG%', 'FGA', 'FT%', 'FTA', 'TO'])}
    return out
def adp(f, sh):
    h, R = sheet(f, sh); return {key(r[2]): float(r[1]) for r in R if len(r) > 2 and r[2] and isinstance(r[1], (int, float))}
def paste(f):
    # 'Paste #BBall' format: R#, [ADP], PLAYER, POS, TEAM, GP, MPG, FG% '0.577(10.1/17.4)', FT%, 3PM, PTS, TREB, AST, STL, BLK, TO
    h, R = sheet(f, 'Paste #BBall'); ix = {(c if isinstance(c, str) else '3PM'): i for i, c in enumerate(h) if c is not None}
    shot = lambda v: (lambda m: (float(m.group(1)), float(m.group(3))) if m else (None, None))(re.match(r'\s*([\d.]+)\s*\(([\d.]+)/([\d.]+)\)', str(v)))
    P, A = {}, {}
    for r in R:
        if len(r) <= ix['TO'] or not r[ix['PLAYER']] or r[ix['GP']] is None: continue
        fgp, fga = shot(r[ix['FG%']]); ftp, fta = shot(r[ix['FT%']])
        if fga is None: continue
        k = key(r[ix['PLAYER']])
        P[k] = dict(g=float(r[ix['GP']]), m=float(r[ix['MPG']]), pts=float(r[ix['PTS']]), tpm=float(r[ix['3PM']]), reb=float(r[ix['TREB']]), ast=float(r[ix['AST']]), stl=float(r[ix['STL']]), blk=float(r[ix['BLK']]), fgp=fgp, fga=fga, ftp=ftp, fta=fta, to=float(r[ix['TO']]))
        a = r[ix['ADP']] if 'ADP' in ix else r[ix['R#']]
        if isinstance(a, (int, float)): A[k] = float(a)
    return P, A
DATA = json.load(open('bt_data.json')); out = {}
for season, f in (('2022-23', 'data/proj_2022-23_kit.xlsx'), ('2023-24', 'data/proj_2023-24_kit.xlsx')):
    H, A = paste(f); S = {}
    for p in DATA[season]['players']:
        k = key(p['n']); e = {}
        if k in H: e['hs'] = H[k]
        if k in A: e['adp'] = A[k]
        S[str(p['pid'])] = e
    out[season] = S
    print(season, 'pool', len(DATA[season]['players']), '| hs', sum(1 for e in S.values() if 'hs' in e), '| adp', sum(1 for e in S.values() if 'adp' in e), '| Hashtag players', len(H))
for season, f, src in (('2024-25', 'data/proj_2024-25_kit.xlsx', ('UpdateHashtag',)), ('2025-26', 'data/proj_2025-26_kit2.xlsx', ('UpdateBBM',))):
    B = bbm(f); H = hs(f) if season == '2024-25' else {}; A = adp(f, src[0])
    S = {}; nb = nh = na = 0
    for p in DATA[season]['players']:
        k = key(p['n']); e = {}
        if k in B: e['bbm'] = B[k]; nb += 1
        if k in H: e['hs'] = H[k]; nh += 1
        if k in A: e['adp'] = A[k]; na += 1
        S[str(p['pid'])] = e
    out[season] = S
    print(season, 'pool', len(DATA[season]['players']), '| bbm', nb, '| hs', nh, '| adp', na, '| top-150 by ADP matched to pool', sum(1 for k, v in A.items() if v <= 150 and any(key(p['n']) == k for p in DATA[season]['players'])), 'of', sum(1 for v in A.values() if v <= 150))
json.dump(out, open('bt_proj.json', 'w'))
