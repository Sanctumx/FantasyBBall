import json, hashlib, os, re, shutil
# Every page is written twice: courtside-<page>.html with all code inlined (the draft board one is the claude.ai artifact and
# stays one self-contained file), and site/linked/courtside-<page>.html where each big script (data, Engine, shared modules)
# is a hashed file site/assets/<name>.<hash>.js, so the browser keeps it between pages (2026-10-26). GEN_OUT redirects both (tests).
OUT=os.environ.get('GEN_OUT','.')
def rd(f): return open(f).read()
def wr(f,t):
    f=os.path.join(OUT,f); os.makedirs(os.path.dirname(f) or '.',exist_ok=True); open(f,'w').write(t)
P=json.dumps(json.load(open('players.json')),separators=(',',':'))
S=json.dumps(json.load(open('sched.json')),separators=(',',':'))
D=json.dumps(json.load(open('sched_days.json')),separators=(',',':'))
def cat(fs): return ''.join(rd(f)+chr(10) for f in fs)
# placeholder -> (asset name, text); the order of replacement is the order the pages always used
SRC={'DATA':('players','const PLAYERS='+P+';'),'SCHED':('sched','const SCHED='+S+';'),'DAYS':('sched_days','const SCHED_DAYS='+D+';'),
     'ENGINE':('engine',rd('engine.js')),'SHARED':('shared',rd('shared.js')),'STORE':('store',rd('league_store.js')),'FXCACHE':('fxcache',rd('fx_cache.js')),
     'LEAGUE':('league_core',rd('league_core.js')),
     'INSEASON':('inseason_mods',cat(['inseason_league.js','inseason_players.js','matchup_core.js','points_core.js','team_core.js','win_k.js','team_win.js','trade_core.js'])),
     'RANKINGS':('rankings_mods',cat(['inseason_league.js','inseason_players.js','points_core.js','win_k.js','rankings_core.js'])),
     'TEAM':('team_mods',cat(['inseason_league.js','inseason_players.js','matchup_core.js','points_core.js','win_k.js','rankings_core.js','team_core.js','team_win.js','team_view.js'])),
     'LEAGUETAB':('league_tab',rd('league_tab.js'))}
ASSET={}   # file name under assets/ -> text
# the hash is of the bytes written, which are what open(...,'w') makes of the text on this machine
OUTENC=open(os.devnull,'w').encoding or 'utf-8'
def fill(t):
    for k in SRC: t=t.replace('/*__'+k+'__*/',SRC[k][1])
    return t
BLOCK=re.compile(r'<script>\s*((?:/\*__[A-Z]+__\*/\s*)+)</script>')
def link(t):
    def one(m):
        tags=[]
        for k in re.findall(r'/\*__([A-Z]+)__\*/',m.group(1)):
            name,text=SRC[k]; data=text.encode(OUTENC)
            fn=name+'.'+hashlib.sha256(data).hexdigest()[:8]+'.js'; ASSET[fn]=text
            tags.append('<script src="assets/'+fn+'"></script>')
        return '\n'.join(tags)
    t=BLOCK.sub(one,t)
    assert '/*__' not in t, 'a placeholder is outside a script block of its own'
    return t
def emit(page,tpl,how=None):
    t=rd(tpl)
    if how: t=t.replace('<!--__HOW__-->',how)
    wr('courtside-'+page+'.html',fill(t)); wr('site/linked/courtside-'+page+'.html',link(t))
emit('draft-board','app.html')
# League page (2026-10-18): same data, engine and shared helpers, plus the league math
_a=rd('app.html'); _i=_a.index('<dialog class="how"'); _e=_a.index('</dialog>',_i)+len('</dialog>')
HOW=_a[_i:_e]   # How it works: one copy of the text, shown on the In-Season page (the League Dashboard has its own, in league.html)
emit('league','league.html')
# In-Season page (2026-10-20): same data, engine and shared helpers, plus the in-season modules and the daily schedule
emit('inseason','inseason.html',HOW)
# Settings page (2026-10-20): the shared league store and toolbar only (no player data)
emit('settings','settings.html')
# Rankings page (2026-10-21): same data, engine and shared helpers, plus the in-season player modules and the rankings core
emit('rankings','rankings.html')
# Team page (2026-10-25, #131): the in-season modules, the rankings core (Zscore) and the Team tab modules; its How it works is its own
emit('team','team.html')
# the hashed script files; names are content hashes, so a changed file is a new name and old pages never meet new code
shutil.rmtree(os.path.join(OUT,'site/assets'),ignore_errors=True)   # only the files this build links; old hashes must not pile up
for fn,text in ASSET.items():
    f=os.path.join(OUT,'site/assets',fn); os.makedirs(os.path.dirname(f),exist_ok=True); open(f,'wb').write(text.encode(OUTENC))   # bytes, so the file is what the name's hash says on every OS
