import csv, json, datetime as dt, sys
NAMES={'Atlanta Hawks':'ATL','Brooklyn Nets':'BKN','Boston Celtics':'BOS','Charlotte Hornets':'CHA','Chicago Bulls':'CHI','Cleveland Cavaliers':'CLE','Dallas Mavericks':'DAL','Denver Nuggets':'DEN','Detroit Pistons':'DET','Golden State Warriors':'GSW','Houston Rockets':'HOU','Indiana Pacers':'IND','LA Clippers':'LAC','Los Angeles Clippers':'LAC','Los Angeles Lakers':'LAL','Memphis Grizzlies':'MEM','Miami Heat':'MIA','Milwaukee Bucks':'MIL','Minnesota Timberwolves':'MIN','New Orleans Pelicans':'NOR','New York Knicks':'NYK','Oklahoma City Thunder':'OKC','Orlando Magic':'ORL','Philadelphia 76ers':'PHI','Phoenix Suns':'PHO','Portland Trail Blazers':'POR','Sacramento Kings':'SAC','San Antonio Spurs':'SAS','Toronto Raptors':'TOR','Utah Jazz':'UTA','Washington Wizards':'WAS'}
S=json.load(open('sched.json')); W=len(S['weeks'])
games={}  # team -> list of (local date, week)
for r in csv.DictReader(open(sys.argv[1])):
    t=dt.datetime.strptime(r['Date'],'%d/%m/%Y %H:%M')-dt.timedelta(hours=6)   # UTC -> US local date
    for side in ('Home Team','Away Team'):
        if r[side] not in NAMES: continue
        code=NAMES[r[side]]; games.setdefault(code,[]).append((t.date(),int(r['Round Number'])))
b2b={}; chk={}
for code,gs in games.items():
    gs.sort(); arr=[0]*W; cnt=[0]*W
    for i,(d,w) in enumerate(gs):
        cnt[w-1]+=1
        if i and (d-gs[i-1][0]).days==1: arr[w-1]+=1
    b2b[code]=arr; chk[code]=cnt==S['games'][code]
print('weekly game counts match sched.json for', sum(chk.values()),'of',len(chk),'teams')
print('B2B second nights per team (season):', {k:sum(v) for k,v in sorted(b2b.items())})
S['b2b']=b2b; json.dump(S,open('sched.json','w'),separators=(',',':'))
