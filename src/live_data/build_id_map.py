# Map Fantrax player ids (rosters of the LOFB 2024-25 league) to NBA ids in logs3.csv by name (idea 146).
# Run from src/: python live_data/build_id_map.py   -> live_data/id_map.json, prints what did not match.
import pandas as pd, json, re, unicodedata

def norm(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r"[.'\-]", " ", s)
    s = re.sub(r"\b(jr|sr|ii|iii|iv)\b", "", s)
    return re.sub(r"\s+", "", s)  # no spaces: "DeAaron" == "De'Aaron"

ids = json.load(open('live_data/all_ids.json'))
p = json.load(open('live_data/player_ids.json'))
d = pd.read_csv('logs3.csv', usecols=['season', 'player_id', 'player_name', 'game_date'])
d = d[d.season == '2024-25']
g = d.groupby('player_id').agg(name=('player_name', 'first'), n=('game_date', 'count'))
by = {}
for pid, r in g.iterrows():
    by.setdefault(norm(r['name']), []).append((pid, r['n']))

# logs3 spells these differently from Fantrax
ALIAS = {'06mjx': 'Ronald Holland II', '051oy': 'ga Bitadze', '051pb': 'Nic Claxton', '05uj1': 'Cam Thomas'}
prof = json.load(open('live_data/profile_names.json'))  # ids getPlayerIds no longer lists: url slug "chris-paul"

out, un, amb = {}, [], []
for i in ids:
    if i in ALIAS:
        full = ALIAS[i]
    elif i in p:
        last, _, first = p[i]['name'].partition(', ')
        full = first + ' ' + last
    elif i in prof:
        full = prof[i].replace('-', ' ')
    else:
        un.append((i, 'no name'))
        continue
    nm = full
    m = by.get(norm(full))
    if not m:
        un.append((i, nm))
        continue
    out[i] = {'nba': int(max(m, key=lambda x: x[1])[0]), 'name': nm}
    if len(m) > 1:
        amb.append((nm, m))

print('matched', len(out), 'of', len(ids))
print('unmatched', un)
print('ambiguous', amb)
json.dump(out, open('live_data/id_map.json', 'w'))
