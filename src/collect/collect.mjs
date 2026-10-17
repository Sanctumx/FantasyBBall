// Collects real-draft data for fitting how far drafters stray from ADP.
//   1. Saves today's Fantrax NBA ADP to data/adp/YYYY-MM-DD.json (one snapshot per UTC day; later runs that day overwrite it).
//   2. For every league ID in leagues.txt, saves the league format and its draft picks to data/drafts/<leagueId>.json.
//      A league whose draft is complete is not fetched again.
// Stored per pick: round, overall pick, pick in round, division (multi-draft leagues), team id, Fantrax player id, pick time.
// No team or owner names. Pick numbers count within a division's draft.
// Run from src/collect:  node collect.mjs        (Node 18+; FANTRAX_BASE overrides the API base for tests)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.FANTRAX_BASE || 'https://www.fantrax.com/fxea/general/';
const DATA = path.join(HERE, 'data');

async function get(route) {
  const r = await fetch(BASE + route, { headers: { accept: 'application/json', 'user-agent': 'courtside-draft-collector' } });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { throw new Error(`${route}: not JSON (HTTP ${r.status})`); }
  if (!r.ok || (body && body.error)) throw new Error(`${route}: ${body && body.error ? JSON.stringify(body.error) : 'HTTP ' + r.status}`);
  return body;
}

const json = o => JSON.stringify(o) + '\n';
const today = () => new Date().toISOString().slice(0, 10);

async function snapshotAdp() {
  const rows = await get('getAdp?sport=NBA&start=1&limit=1000&order=ADP');
  if (!Array.isArray(rows) || !rows.length) throw new Error('getAdp returned no players');
  const adp = rows.filter(p => p && p.id && p.ADP != null)
    .map(p => ({ id: p.id, name: p.name, pos: p.pos, adp: p.ADP }));
  const file = path.join(DATA, 'adp', today() + '.json');
  await writeFile(file, json({ date: today(), fetchedAt: new Date().toISOString(), players: adp }));
  console.log(`ADP: ${adp.length} players -> ${path.relative(HERE, file)}`);
}

// League format only: what the fit needs to compare drafts. Names of teams and owners are left out.
function leagueFormat(info) {
  const teams = info.teamInfo ? Object.keys(info.teamInfo).length : (Array.isArray(info.teams) ? info.teams.length : null);
  const pick = k => (info[k] !== undefined ? info[k] : undefined);
  const cats = info.scoringSystem && info.scoringSystem.scoringCategories && info.scoringSystem.scoringCategories.PLAYER;
  return {
    teams,
    leagueName: pick('leagueName'),
    seasonYear: pick('seasonYear'),
    categories: cats ? Object.keys(cats) : undefined,
    draftType: pick('draftType'),
    scoringType: pick('scoringType') ?? pick('scoring') ?? pick('scoringSystem'),
    roster: pick('rosterInfo') ?? pick('roster'),
    infoKeys: Object.keys(info)        // kept so unknown fields can be mapped later
  };
}

function draftPicks(res) {
  const list = res.draftPicks || res.picks || res.draft || [];
  return list.map(p => ({
    round: p.round, pick: p.pick, pickInRound: p.pickInRound, division: p.division ?? null,
    team: p.teamId, player: p.playerId || null, time: p.time ?? null
  }));
}

async function collectLeague(id) {
  const file = path.join(DATA, 'drafts', id + '.json');
  if (existsSync(file)) {
    const prev = JSON.parse(await readFile(file, 'utf8'));
    if (prev.complete) { console.log(`${id}: draft complete, skipped`); return; }
  }
  const [info, res] = await Promise.all([get(`getLeagueInfo?leagueId=${id}`), get(`getDraftResults?leagueId=${id}`)]);
  const picks = draftPicks(res);
  const made = picks.filter(p => p.player).length;
  const complete = picks.length > 0 && made === picks.length;
  const divisions = new Set(picks.map(p => p.division).filter(Boolean)).size || 1;
  const meta = { draftType: res.draftType, draftState: res.draftState, startDate: res.startDate, endDate: res.endDate };
  await writeFile(file, json({ leagueId: id, fetchedAt: new Date().toISOString(), complete, divisions, draft: meta, format: leagueFormat(info), resultKeys: Object.keys(res), picks }));
  console.log(`${id}: ${made}/${picks.length} picks made${complete ? ' (complete)' : ''}`);
}

async function main() {
  await mkdir(path.join(DATA, 'adp'), { recursive: true });
  await mkdir(path.join(DATA, 'drafts'), { recursive: true });
  let failed = 0;
  try { await snapshotAdp(); } catch (e) { failed++; console.error('ADP failed:', e.message); }
  const ids = (await readFile(path.join(HERE, 'leagues.txt'), 'utf8')).split('\n')
    .map(l => l.replace(/#.*/, '').trim()).filter(Boolean);
  for (const id of ids) {
    if (!/^[A-Za-z0-9]{4,40}$/.test(id)) { console.error(`${id}: not a league ID, skipped`); continue; }
    try { await collectLeague(id); } catch (e) { failed++; console.error(`${id} failed:`, e.message); }
  }
  if (failed) process.exitCode = 1;
}
main();
