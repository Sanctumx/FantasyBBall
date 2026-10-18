import json
a=open('app.html').read()
P=json.dumps(json.load(open('players.json')),separators=(',',':'))
S=json.dumps(json.load(open('sched.json')),separators=(',',':'))
a=a.replace('/*__DATA__*/','const PLAYERS='+P+';').replace('/*__SCHED__*/','const SCHED='+S+';').replace('/*__ENGINE__*/',open('engine.js').read()).replace('/*__SHARED__*/',open('shared.js').read())
open('courtside-draft-board.html','w').write(a)
# League page (2026-10-18): same data, engine and shared helpers, plus the league math
l=open('league.html').read()
l=l.replace('/*__DATA__*/','const PLAYERS='+P+';').replace('/*__SCHED__*/','const SCHED='+S+';').replace('/*__ENGINE__*/',open('engine.js').read()).replace('/*__SHARED__*/',open('shared.js').read()).replace('/*__LEAGUE__*/',open('league_core.js').read())
_a=open('app.html').read(); _i=_a.index('<dialog class="how"'); _e=_a.index('</dialog>',_i)+len('</dialog>')
l=l.replace('<!--__HOW__-->',_a[_i:_e])   # How it works: one copy of the text, shown on both pages
open('courtside-league.html','w').write(l)
