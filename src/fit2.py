import pandas as pd, numpy as np
d=pd.read_csv('logs3.csv',dtype={'game_id':str}); d=d[d.minutes>0]
lg=d.groupby('season')[['fgm','fga','ftm','fta']].sum()
d['fgx']=d.fgm-d.season.map(lg.fgm/lg.fga)*d.fga; d['ftx']=d.ftm-d.season.map(lg.ftm/lg.fta)*d.fta
S=['fg3m','pts','reb','ast','stl','blk','tov']
agg=d.groupby(['season','player_id']).agg(n=('minutes','size'),mpg=('minutes','mean'),**{k+'_m':(k,'mean') for k in S},**{k+'_v':(k,'var') for k in S},
  fga=('fga','mean'),fta=('fta','mean'),fgm_t=('fgm','sum'),fga_t=('fga','sum'),ftm_t=('ftm','sum'),fta_t=('fta','sum'),fgx_v=('fgx','var'),ftx_v=('ftx','var'))
pool=agg[(agg.n>=25)&(agg.mpg>=20)]; w=pool.n-1
print('player-seasons',len(pool),'games',int(pool.n.sum()))
r2=lambda v,p:1-(w*(v-p)**2).sum()/(w*(v-np.average(v,weights=w))**2).sum()
for k in S:
    m,v=pool[k+'_m'],pool[k+'_v']; a=(w*v).sum()/(w*m).sum()
    ok=(m>0)&(v>0); b,c=np.polyfit(np.log(m[ok]),np.log(v[ok]),1,w=w[ok])
    print(f"{k:5} linear a={a:.3f} R2={r2(v,a*m):.3f} | power {np.exp(c):.2f}*m^{b:.2f} R2={r2(v,np.exp(c)*m**b):.3f}")
for nm,xv,att,mk,at in [('FG','fgx_v','fga','fgm_t','fga_t'),('FT','ftx_v','fta','ftm_t','fta_t')]:
    p=pool[mk]/pool[at]; base=pool[att]*p*(1-p); print(nm,'k=%.3f'%((w*pool[xv]).sum()/(w*base).sum()))
for s in sorted(pool.index.get_level_values(0).unique()):
    q=pool.loc[s]; ww=q.n-1; print(s,{k:round((ww*q[k+'_v']).sum()/(ww*q[k+'_m']).sum(),2) for k in S})
