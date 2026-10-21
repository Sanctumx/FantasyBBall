"""Per-team NBA tip-off times (epoch seconds, UTC) for the in-season tools: python3 sched_days.py nba-2026-UTC.csv
Writes sched_days.json = {"source": ..., "games": {team code: [epoch, ...]}} with the same team codes as sched.json."""
import csv, json, datetime as dt, os, sys
# same team-name map as sched_b2b.py (that script runs on import, so it can't be imported)
NAMES={'Atlanta Hawks':'ATL','Brooklyn Nets':'BKN','Boston Celtics':'BOS','Charlotte Hornets':'CHA','Chicago Bulls':'CHI','Cleveland Cavaliers':'CLE','Dallas Mavericks':'DAL','Denver Nuggets':'DEN','Detroit Pistons':'DET','Golden State Warriors':'GSW','Houston Rockets':'HOU','Indiana Pacers':'IND','LA Clippers':'LAC','Los Angeles Clippers':'LAC','Los Angeles Lakers':'LAL','Memphis Grizzlies':'MEM','Miami Heat':'MIA','Milwaukee Bucks':'MIL','Minnesota Timberwolves':'MIN','New Orleans Pelicans':'NOR','New York Knicks':'NYK','Oklahoma City Thunder':'OKC','Orlando Magic':'ORL','Philadelphia 76ers':'PHI','Phoenix Suns':'PHO','Portland Trail Blazers':'POR','Sacramento Kings':'SAC','San Antonio Spurs':'SAS','Toronto Raptors':'TOR','Utah Jazz':'UTA','Washington Wizards':'WAS'}
games = {}
for r in csv.DictReader(open(sys.argv[1], encoding='utf-8-sig')):
    t = dt.datetime.strptime(r['Date'], '%d/%m/%Y %H:%M').replace(tzinfo=dt.timezone.utc)
    for side in ('Home Team', 'Away Team'):
        if r[side] in NAMES:
            games.setdefault(NAMES[r[side]], []).append(int(t.timestamp()))
for g in games.values():
    g.sort()
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sched_days.json')
json.dump({'source': os.path.basename(sys.argv[1]), 'games': dict(sorted(games.items()))}, open(out, 'w'), separators=(',', ':'))
print('teams', len(games), 'games per team', sorted({len(g) for g in games.values()}))
