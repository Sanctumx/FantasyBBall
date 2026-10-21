// Records the public Fantrax responses the in-season tests use (run by hand: node src/tests/fixtures/record_fx.mjs [leagueId]).
// Team names become "Team 1".."Team 14" so the fixtures carry no real names; ids are kept.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const id = process.argv[2] || 'mm5i19xxmv4hcbcy', B = 'https://www.fantrax.com/fxea/general/';
const get = async p => { for (let i = 0; i < 4; i++) { const r = await (await fetch(B + p)).json(); if (!(r && r.error && /RATE/i.test(JSON.stringify(r.error)))) return r; await new Promise(s => setTimeout(s, 2000)); } throw new Error('rate limited ' + p); };
const [info, ros, st, ids] = [await get('getLeagueInfo?leagueId=' + id), await get('getTeamRosters?leagueId=' + id), await get('getStandings?leagueId=' + id), await get('getPlayerIds?sport=NBA')];
const names = {}; Object.keys(ros.rosters).sort().forEach((t, i) => { names[t] = 'Team ' + (i + 1); });
const anon = (o) => { if (Array.isArray(o)) return o.map(anon); if (o && typeof o === 'object') { const r = {}; for (const k of Object.keys(o)) r[k] = anon(o[k]); if (o.id && names[o.id] && 'name' in o) { r.name = names[o.id]; r.shortName = 'T' + names[o.id].slice(5); } if (o.teamId && names[o.teamId] && 'teamName' in o) r.teamName = names[o.teamId]; return r; } return o; };
const keep = ['matchups', 'scoringPeriods', 'playoffs', 'rosterInfo', 'teamInfo', 'playerInfo', 'seasonYear', 'startDate', 'endDate'];
const league = {}; keep.forEach(k => { if (info[k] !== undefined) league[k] = info[k]; });
if (league.teamInfo) for (const t of Object.keys(league.teamInfo)) if (names[t]) { league.teamInfo[t] = Object.assign({}, league.teamInfo[t], { name: names[t], shortName: 'T' + names[t].slice(5) }); }
const rosters = { period: ros.period, rosters: {} }; for (const t of Object.keys(ros.rosters)) rosters.rosters[t] = Object.assign({}, ros.rosters[t], { teamName: names[t] });
const standings = anon(st);
const want = new Set(Object.keys(league.playerInfo || {})); const players = {};
for (const k of Object.keys(ids)) if (want.has(k)) players[k] = { name: ids[k].name, team: ids[k].team, position: ids[k].position };
const w = (n, o) => fs.writeFileSync(path.join(dir, n), JSON.stringify(anon(o)));
w('fx_league.json', league); w('fx_rosters.json', rosters); w('fx_standings.json', standings); w('fx_players.json', players);
console.log('teams', Object.keys(names).length, 'players with ids', Object.keys(players).length, 'of', want.size);
