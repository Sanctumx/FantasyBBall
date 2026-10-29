// The Team-tab fixtures as a mock Fantrax league for League page checks (the League tab runs the Team-tab code, which needs periods and a schedule).
// -> { seed(), setup(ctx) } : setup routes fonts, Fantrax answers and ESPN stats and fixes the clock.
import fs from 'node:fs';
import path from 'node:path';
export function leagueFx(REPO) {
  const fx = n => fs.readFileSync(path.join(REPO, 'src/tests/fixtures', n), 'utf8');
  const FX = { league: fx('fx_league.json'), rosters: fx('fx_rosters.json'), standings: fx('fx_standings.json'), players: fx('fx_players.json') };
  const NOW = Date.UTC(2026, 9, 21, 12), LID = 'abc123', TEAMS = Object.keys(JSON.parse(FX.league).teamInfo);
  const seed = (my = TEAMS[0]) => ({
    'courtside-settings-v1': JSON.stringify({ v: 1, settings: { teams: TEAMS.length, roster: 12, scoring: 'h2h', cats: 9, asb: 'merged', poStart: 18, poFmt: '2-2-2', ilSpots: 3 }, league: { id: LID, name: 'Home', teams: [], loadedAt: 1 }, note: '' }),
    'courtside-leagues-v1': JSON.stringify([{ id: LID, name: 'Home', myTeam: my, used: 1 }]) });
  const setup = async ctx => {
    await ctx.route(/fonts\.g/, r => r.fulfill({ body: '', contentType: 'text/css' }));
    await ctx.route(/stats\/espn\.json/, r => r.fulfill({ body: fx('espn_2025_26.json'), contentType: 'application/json' }));
    await ctx.route(/api\/fantrax/, r => r.fulfill({ body: FX[new URL(r.request().url()).searchParams.get('what')] || '{}', contentType: 'application/json' }));
    await ctx.addInitScript(t => { Date.now = () => t; }, NOW);
  };
  return { seed, setup, TEAMS };
}
