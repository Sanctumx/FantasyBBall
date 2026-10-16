import pandas as pd, numpy as np, json, unicodedata, re
d=pd.read_csv('logs3.csv',dtype={'game_id':str}); d['game_date']=pd.to_datetime(d.game_date)
d=d[d.season.isin(['2024-25','2025-26'])]
# team schedule from logs: one row per team-game; second night of a back-to-back = played the day before too
tg=d[['season','team','game_id','game_date']].drop_duplicates(['season','team','game_id']).sort_values(['season','team','game_date'])
tg['b2b']=tg.groupby(['season','team']).game_date.diff().dt.days.eq(1)
print('team B2B second nights per team-season:', round(tg.groupby(['season','team']).b2b.sum().mean(),1))
pl=d[d.minutes>0][['season','player_id','player_name','team','game_id','game_date']]
rows=[]
for (s,pid),g in pl.groupby(['season','player_id']):
    for team,gt in g.groupby('team'):
        lo,hi=gt.game_date.min(),gt.game_date.max()
        sch=tg[(tg.season==s)&(tg.team==team)&(tg.game_date>=lo)&(tg.game_date<=hi)]
        played=set(gt.game_id)
        b=sch[sch.b2b]; o=sch[~sch.b2b]
        rows.append(dict(pid=pid,name=gt.player_name.iloc[-1],nb=len(b),pb=sum(x in played for x in b.game_id),no=len(o),po=sum(x in played for x in o.game_id)))
R=pd.DataFrame(rows).groupby('pid').agg(name=('name','last'),nb=('nb','sum'),pb=('pb','sum'),no=('no','sum'),po=('po','sum'))
R=R[(R.no>=20)]
ro=R.po/R.no
# shrink the B2B play rate toward the player's normal rate with a prior worth 6 B2B games
rb=(R.pb+6*ro)/(R.nb+6)
R['skip']=(1-rb/ro).clip(0,1); R['ro']=ro
print(R.sort_values('skip',ascending=False).head(15)[['name','nb','pb','no','po','skip']].to_string())
def key(s): s=unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower(); s=re.sub(r'[^a-z ]','',s); return re.sub(r'\b(jr|sr|ii|iii|iv)\b','',s).split()
P=json.load(open('players.json')); byk={' '.join(key(n)):v for n,v in zip(R.name,R.skip)}
hit=0
for p in P:
    k=' '.join(key(p['n']))
    if k in byk: p['b2b']=round(float(byk[k]),2); hit+=1
print('matched',hit,'of',len(P)); print('missing (top 60 by ADP):',[p['n'] for p in sorted(P,key=lambda p:p.get('ftx') or 999)[:60] if 'b2b' not in p])
json.dump(P,open('players_b2b.json','w'))
