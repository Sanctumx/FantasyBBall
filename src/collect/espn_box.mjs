// Saves every player's box-score line for each completed NBA regular-season game to monthly files stats/box-YYYY-MM.json
// (served at /stats/box-YYYY-MM.json), for the Rankings windows (last week / 2 weeks / month) and the in-season tools.
//   node src/collect/espn_box.mjs [--season 2027] [--dates 20261027,20261028] [--out stats]
//   defaults: season $ESPN_SEASON or 2027 (the year the season ends); dates $BOX_DATES or today and the 2 days before (New York dates,
//   the day ESPN's scoreboard files a game under); out = stats/ at the repo root.
// A game is saved once and never rewritten; a game whose summary fails or looks incomplete is retried by the next hourly run.
// ESPN files the NBA Cup final (CC) and the All-Star games (ALLSTAR) under regular season, and play-in games are season type 5,
// so only competition type STD counts. File shape: { season, month, updatedAt, cols, names: {espnId: name},
//   games: { gameId: { d: 'YYYY-MM-DD' (New York date), teams: { ABBR: [[espnId, ...cols]] } } } } (ESPN's team abbreviations).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=';
const SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=';

export const COLS = ['min', 'fgm', 'fga', 'ftm', 'fta', 'tpm', 'pts', 'reb', 'ast', 'stl', 'blk', 'to'];
// ESPN key → our column; keys holding "made-attempted" are split
const SIMPLE = { minutes: 'min', points: 'pts', rebounds: 'reb', assists: 'ast', steals: 'stl', blocks: 'blk', turnovers: 'to' };
const SPLIT = { 'fieldGoalsMade-fieldGoalsAttempted': ['fgm', 'fga'], 'freeThrowsMade-freeThrowsAttempted': ['ftm', 'fta'], 'threePointFieldGoalsMade-threePointFieldGoalsAttempted': ['tpm', null] };
const num = x => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const dashed = day => day.slice(0, 4) + '-' + day.slice(4, 6) + '-' + day.slice(6, 8);

// Completed standard regular-season games of the season on a scoreboard day (YYYYMMDD)
export function finalGames(scoreboard, season, day) {
  return ((scoreboard && scoreboard.events) || []).filter(e => e.season && e.season.year === season && e.season.type === 2
    && e.competitions && e.competitions[0] && e.competitions[0].type && e.competitions[0].type.abbreviation === 'STD'
    && e.status && e.status.type && e.status.type.completed === true).map(e => ({ id: String(e.id), d: dashed(day) }));
}

// One game's box: { teams: { ABBR: [[espnId, ...COLS]] }, names }, or null unless both teams have at least 5 players who played
export function parseBox(summary) {
  const teams = {}, names = {}, groups = summary && summary.boxscore && summary.boxscore.players;
  if (!Array.isArray(groups) || groups.length !== 2) return null;
  for (const g of groups) {
    const st = g.statistics && g.statistics[0], abbr = g.team && g.team.abbreviation;
    if (!st || !abbr || !Array.isArray(st.keys)) return null;
    const rows = [];
    for (const a of st.athletes || []) {
      if (a.didNotPlay || !a.stats || !a.stats.length) continue;
      const v = {};
      st.keys.forEach((k, i) => {
        if (SIMPLE[k]) v[SIMPLE[k]] = num(a.stats[i]);
        else if (SPLIT[k]) { const [m, t] = String(a.stats[i]).split('-'); if (SPLIT[k][0]) v[SPLIT[k][0]] = num(m); if (SPLIT[k][1]) v[SPLIT[k][1]] = num(t); }
      });
      const id = String(a.athlete.id);
      rows.push([id, ...COLS.map(c => v[c] || 0)]); names[id] = a.athlete.displayName;
    }
    if (rows.length < 5) return null;
    teams[abbr] = rows;
  }
  return Object.keys(teams).length === 2 ? { teams, names } : null;
}

// New York date (YYYYMMDD) of an instant: the day ESPN's scoreboard files a game under
export const etDay = now => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now).replace(/-/g, '');
// today and the n-1 days before it, as New York dates
export function daysBack(now, n) {
  const t = etDay(now), base = Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8));
  return Array.from({ length: n }, (_, i) => new Date(base - i * 86400000).toISOString().slice(0, 10).replace(/-/g, ''));
}
export const monthOf = d => d.slice(0, 7);

// The month file with the new games added (a saved game is never rewritten), or null when nothing is new
export function mergeMonth(prev, season, month, games, now) {
  const have = (prev && prev.games) || {}, fresh = games.filter(g => !have[g.id] && monthOf(g.d) === month);
  if (!fresh.length) return null;
  const out = { season, month, updatedAt: now.toISOString(), cols: COLS, names: Object.assign({}, prev && prev.names), games: Object.assign({}, have) };
  fresh.forEach(g => { Object.assign(out.names, g.box.names); out.games[g.id] = { d: g.d, teams: g.box.teams }; });
  return out;
}

// events not yet saved in their month file; files = { 'YYYY-MM': file | null }
export const missingGames = (files, events) => events.filter(e => { const f = files[monthOf(e.d)]; return !(f && f.games && f.games[e.id]); });

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function fetchJson(url) {
  const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'courtside-stats-collector' } });
  if (!r.ok) throw new Error('ESPN answered HTTP ' + r.status);
  return r.json();
}

export async function run({ season, dates, outDir, now = new Date(), fetchJson: get = fetchJson, log = console.log, pauseMs = 250 }) {
  const events = [], seen = new Set(); let failed = 0;
  for (const day of dates) {
    try { finalGames(await get(SCOREBOARD + day), season, day).forEach(e => { if (!seen.has(e.id)) { seen.add(e.id); events.push(e); } }); }
    catch (e) { failed++; log(`::warning::Scoreboard for ${day} failed (${e.message}); the next run retries.`); }
  }
  if (failed === dates.length) throw new Error('ESPN scoreboard unreachable for ' + dates.join(','));
  const files = {};
  for (const m of new Set(events.map(e => monthOf(e.d)))) {
    try { files[m] = JSON.parse(await readFile(path.join(outDir, `box-${m}.json`), 'utf8')); } catch (e) { files[m] = null; }
  }
  const got = {};   // month → [{ id, d, box }]
  for (const e of missingGames(files, events)) {
    try {
      if (pauseMs) await sleep(pauseMs);
      const box = parseBox(await get(SUMMARY + e.id));
      if (!box) throw new Error('box score incomplete');
      (got[monthOf(e.d)] = got[monthOf(e.d)] || []).push({ id: e.id, d: e.d, box });
    } catch (err) { log(`::warning::Box score for game ${e.id} not saved (${err.message}); the next run retries.`); }
  }
  let added = 0; const written = [];
  for (const [m, games] of Object.entries(got)) {
    const next = mergeMonth(files[m], season, m, games, now); if (!next) continue;
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, `box-${m}.json`), JSON.stringify(next));
    added += games.length; written.push(`box-${m}.json`);
  }
  return { added, written };
}

async function main() {
  const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
  const now = new Date(), season = Number(arg('season') || process.env.ESPN_SEASON || 2027);
  const dates = (arg('dates') || process.env.BOX_DATES || '').split(',').map(s => s.trim()).filter(Boolean);
  const { added, written } = await run({ season, dates: dates.length ? dates : daysBack(now, 3), outDir: arg('out') || path.join(HERE, '..', '..', 'stats'), now });
  console.log(added ? `Saved ${added} games to ${written.join(', ')}.` : 'No new final games; nothing written.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
