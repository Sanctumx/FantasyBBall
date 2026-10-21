import json
a=open('app.html').read()
P=json.dumps(json.load(open('players.json')),separators=(',',':'))
S=json.dumps(json.load(open('sched.json')),separators=(',',':'))
a=a.replace('/*__DATA__*/','const PLAYERS='+P+';').replace('/*__SCHED__*/','const SCHED='+S+';').replace('/*__ENGINE__*/',open('engine.js').read()).replace('/*__SHARED__*/',open('shared.js').read()).replace('/*__STORE__*/',open('league_store.js').read())
open('courtside-draft-board.html','w').write(a)
# League page (2026-10-18): same data, engine and shared helpers, plus the league math
l=open('league.html').read()
l=l.replace('/*__DATA__*/','const PLAYERS='+P+';').replace('/*__SCHED__*/','const SCHED='+S+';').replace('/*__ENGINE__*/',open('engine.js').read()).replace('/*__SHARED__*/',open('shared.js').read()).replace('/*__STORE__*/',open('league_store.js').read()).replace('/*__LEAGUE__*/',open('league_core.js').read())
_a=open('app.html').read(); _i=_a.index('<dialog class="how"'); _e=_a.index('</dialog>',_i)+len('</dialog>')
l=l.replace('<!--__HOW__-->',_a[_i:_e])   # How it works: one copy of the text, shown on both pages
open('courtside-league.html','w').write(l)
# In-Season page (2026-10-20): same data, engine and shared helpers, plus the in-season modules and the daily schedule
D=json.dumps(json.load(open('sched_days.json')),separators=(',',':'))
i=open('inseason.html').read()
mods=''.join(open(f).read()+chr(10) for f in ['inseason_league.js','inseason_players.js','matchup_core.js','trade_core.js'])
i=i.replace('/*__DATA__*/','const PLAYERS='+P+';').replace('/*__DAYS__*/','const SCHED_DAYS='+D+';').replace('/*__ENGINE__*/',open('engine.js').read()).replace('/*__SHARED__*/',open('shared.js').read()).replace('/*__STORE__*/',open('league_store.js').read()).replace('/*__INSEASON__*/',mods)
i=i.replace('<!--__HOW__-->',_a[_i:_e])
open('courtside-inseason.html','w').write(i)
# Settings page (2026-10-20): the shared league store and toolbar only (no player data)
s=open('settings.html').read()
s=s.replace('/*__SCHED__*/','const SCHED='+S+';').replace('/*__SHARED__*/',open('shared.js').read()).replace('/*__STORE__*/',open('league_store.js').read())
open('courtside-settings.html','w').write(s)
# Rankings page (2026-10-21): same data, engine and shared helpers, plus the in-season player modules and the rankings core
r=open('rankings.html').read()
mods=''.join(open(f).read()+chr(10) for f in ['inseason_league.js','inseason_players.js','rankings_core.js'])
r=r.replace('/*__DATA__*/','const PLAYERS='+P+';').replace('/*__ENGINE__*/',open('engine.js').read()).replace('/*__SHARED__*/',open('shared.js').read()).replace('/*__STORE__*/',open('league_store.js').read()).replace('/*__RANKINGS__*/',mods)
open('courtside-rankings.html','w').write(r)
