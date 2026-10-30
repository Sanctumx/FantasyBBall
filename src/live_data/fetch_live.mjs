// Fetch the LOFB 2024-25 replay data from public Fantrax endpoints (idea 146) into this folder.
// Usage: node fetch_live.mjs standings | rosters [fromDay toDay]
// Resumable: files already on disk are skipped. Output files are untracked.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const L = process.env.LEAGUE || '3j4mzn4ym0uezl91';   // LEAGUE=<id> OUT_DIR=<folder> fetches another season into HERE/<folder>
const OUT = process.env.OUT_DIR ? join(HERE, process.env.OUT_DIR) : HERE;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, init) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, init);
    if (r.ok) return r.text();
    await sleep(1000 * (i + 1));
  }
  throw new Error('failed ' + url);
}

async function standings() {
  mkdirSync(join(OUT, 'standings'), { recursive: true });
  for (let p = 1; p <= 19; p++) {
    const f = join(OUT, 'standings', `p${p}.json`);
    if (existsSync(f)) continue;
    const body = JSON.stringify({ msgs: [{ method: 'getStandings', data: { leagueId: L, view: 'SCHEDULE', period: String(p) } }] });
    const t = await get(`https://www.fantrax.com/fxpa/req?leagueId=${L}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    writeFileSync(f, t);
    console.log('standings period', p, t.length);
    await sleep(400);
  }
}

async function rosters(from, to) {
  mkdirSync(join(OUT, 'rosters'), { recursive: true });
  for (let d = from; d <= to; d++) {
    const f = join(OUT, 'rosters', `d${d}.json`);
    if (existsSync(f)) continue;
    const t = await get(`https://www.fantrax.com/fxea/general/getTeamRosters?leagueId=${L}&period=${d}`);
    writeFileSync(f, t);
    if (d % 10 === 0) console.log('roster day', d, t.length);
    await sleep(400);
  }
}

// Names for roster ids that getPlayerIds no longer lists (retired / released): the profile's urlName ("chris-paul").
async function profiles() {
  const { readFileSync } = await import('node:fs');
  const ids = JSON.parse(readFileSync(join(HERE, 'all_ids.json')));
  const known = JSON.parse(readFileSync(join(HERE, 'player_ids.json')));
  const out = {};
  for (const id of ids.filter(i => !known[i])) {
    const body = JSON.stringify({ msgs: [{ method: 'getPlayerProfile', data: { playerId: id } }] });
    const t = await get(`https://www.fantrax.com/fxpa/req?leagueId=${L}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    out[id] = JSON.parse(t).responses[0].data.miscData.urlName;
    await sleep(400);
  }
  writeFileSync(join(HERE, 'profile_names.json'), JSON.stringify(out));
  console.log(out);
}

const [, , what, a, b] = process.argv;
if (what === 'profiles') await profiles();
else
if (what === 'standings') await standings();
else if (what === 'rosters') await rosters(+(a || 1), +(b || 146));
else console.log('usage: node fetch_live.mjs standings | rosters [from to]');
