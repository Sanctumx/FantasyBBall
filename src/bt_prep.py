import pandas as pd, numpy as np, json
d=pd.read_csv('logs3.csv',dtype={'game_id':str}); d=d[d.minutes>0].copy()
d['game_date']=pd.to_datetime(d.game_date)
out={}
for prior,target in [('2023-24','2024-25'),('2024-25','2025-26')]:
    a=d[d.season==prior]; t=d[d.season==target]
    g=a.groupby('player_id').agg(n=('player_name','last'),t=('team','last'),g=('game_id','size'),m=('minutes','mean'),
        pts=('pts','mean'),tpm=('fg3m','mean'),reb=('reb','mean'),ast=('ast','mean'),stl=('stl','mean'),blk=('blk','mean'),
        fgm=('fgm','sum'),fga_t=('fga','sum'),ftm=('ftm','sum'),fta_t=('fta','sum'),to=('tov','mean'))
    g=g[g.g>=20]
    g['fga']=g.fga_t/g.g; g['fta']=g.fta_t/g.g; g['fgp']=(g.fgm/g.fga_t).fillna(0.45); g['ftp']=(g.ftm/g.fta_t.replace(0,np.nan)).fillna(0.7)
    # simple 9-cat season value for the market
    pool=g.sort_values('m',ascending=False).head(300)
    lfg=pool.fgm.sum()/pool.fga_t.sum(); lft=pool.ftm.sum()/pool.fta_t.sum()
    X=pd.DataFrame({'fg':(g.fgp-lfg)*g.fga_t,'ft':(g.ftp-lft)*g.fta_t,'tpm':g.tpm*g.g,'pts':g.pts*g.g,'reb':g.reb*g.g,'ast':g.ast*g.g,'stl':g.stl*g.g,'blk':g.blk*g.g,'to':-g.to*g.g})
    top=X.loc[pool.index]; val=((X-top.mean())/top.std()).sum(axis=1)
    rng=np.random.default_rng(7 if target=='2024-25' else 11)
    noisy=val.rank(ascending=False)*np.exp(rng.normal(0,0.25,len(val)))
    g['ftx']=noisy.rank().values; g=g.sort_values('ftx').head(260)
    players=[dict(pid=int(i),n=r.n,t=r.t,p='SF',g=float(min(r.g,82)),m=round(r.m,1),pts=r.pts,tpm=r.tpm,reb=r.reb,ast=r.ast,stl=r.stl,blk=r.blk,
                  fgp=r.fgp,fga=r.fga,ftp=r.ftp,fta=r.fta,to=r.to,adp=float(r.ftx),ftx=float(r.ftx),rk=0,inj='',risk='',note='') for i,r in g.iterrows()]
    # weekly actuals in the target season, Monday weeks
    t=t[t.player_id.isin(g.index)].copy()
    start=t.game_date.min(); start=start-pd.Timedelta(days=start.weekday())
    t['wk']=((t.game_date-start).dt.days//7).astype(int)
    W=t.groupby(['player_id','wk'])[['fgm','fga','ftm','fta','fg3m','pts','reb','ast','stl','blk','tov']].sum()
    nweeks=int(t.wk.max())+1
    weekly={}
    for (pid,wk),row in W.iterrows(): weekly.setdefault(str(pid),{})[int(wk)]=[int(x) for x in row.values]
    out[target]=dict(players=players,weekly=weekly,nweeks=nweeks)
    print(target,'players',len(players),'weeks',nweeks,'with actual games',sum(1 for p in players if str(p['pid']) in weekly))
json.dump(out,open('bt_data.json','w'))
