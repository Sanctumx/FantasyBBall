// Saves ESPN's per-game season stats for every NBA player to stats/espn.json (served at /stats/espn.json), for the
// in-season tools (perceived value in the Trade Analyzer, players without projections).
//   node src/collect/espn_stats.mjs [season]     season = the year the season ends (2027 = 2026-27); default 2027 or $ESPN_SEASON
// ESPN answers with the latest season that has data when the requested one has none yet (it returns 2025-26 for 2027
// until games are played), so the file is only written when the answer is for the season asked for. It runs hourly in game
// windows, so it also writes only when the numbers changed since the saved file (fetchedAt = when they last changed).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', '..', 'stats', 'espn.json');
const BASE = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete';

// ESPN label → our field (per-game values)
const FIELDS = {
  gamesPlayed: 'gp', avgMinutes: 'min', avgPoints: 'pts', avgRebounds: 'reb', avgAssists: 'ast', avgSteals: 'stl', avgBlocks: 'blk',
  avgTurnovers: 'to', avgThreePointFieldGoalsMade: 'tpm', avgFieldGoalsMade: 'fgm', avgFieldGoalsAttempted: 'fga',
  avgFreeThrowsMade: 'ftm', avgFreeThrowsAttempted: 'fta'
};

export function parseByAthlete(body) {
  const cats = body.categories || [];
  return (body.athletes || []).map(a => {
    const row = { id: String(a.athlete.id), n: a.athlete.displayName, t: a.athlete.teamShortName || '' };
    cats.forEach((c, k) => {
      const vals = (a.categories[k] || {}).values || [];
      c.names.forEach((name, j) => { if (FIELDS[name]) row[FIELDS[name]] = vals[j]; });
    });
    return row;
  });
}

export function shouldWrite(body, season) {
  return !!(body && body.requestedSeason && body.requestedSeason.year === season && Array.isArray(body.athletes) && body.athletes.length > 0);
}

// Same numbers as the saved file (order and fetchedAt ignored)? The collector runs hourly, so it only writes when ESPN's averages moved.
const byId = ps => JSON.stringify(ps.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
export function sameStats(prev, players, season) {
  return !!(prev && prev.season === season && Array.isArray(prev.players) && byId(prev.players) === byId(players));
}

// The file to write, or null when ESPN has no stats for the season yet or nothing changed since the saved file.
export function nextFile(prev, first, players, season, now) {
  if (!shouldWrite(first, season) || sameStats(prev, players, season)) return null;
  return { season, label: first.requestedSeason.displayName, fetchedAt: now.toISOString(), players };
}

async function fetchAll(season) {
  const players = []; let first = null;
  for (let page = 1, pages = 1; page <= pages; page++) {
    const r = await fetch(`${BASE}?category=general&limit=1000&page=${page}&season=${season}&seasontype=2`, { headers: { accept: 'application/json', 'user-agent': 'courtside-stats-collector' } });
    if (!r.ok) throw new Error('ESPN answered HTTP ' + r.status);
    const body = await r.json();
    if (!first) first = body;
    pages = (body.pagination && body.pagination.pages) || 1;
    players.push(...parseByAthlete(body));
  }
  return { first, players };
}

async function main() {
  const season = Number(process.argv[2] || process.env.ESPN_SEASON || 2027);
  const { first, players } = await fetchAll(season);
  if (!shouldWrite(first, season)) {
    console.log(`::warning::ESPN has no ${season} season stats yet (it answered ${first && first.requestedSeason && first.requestedSeason.displayName}); stats/espn.json left as it is.`);
    return;
  }
  let prev = null; try { prev = JSON.parse(await readFile(OUT, 'utf8')); } catch (e) {}
  const out = nextFile(prev, first, players, season, new Date());
  if (!out) { console.log('Unchanged since the last collection; nothing written.'); return; }
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out));
  console.log(`Saved ${players.length} players for ${out.label}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
