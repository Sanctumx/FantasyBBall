// Rebuilds espn_scoreboard.json and espn_summary.json (fixtures for espn_box.test.js) from live 2025-26 ESPN data.
//   node src/tests/fixtures/make_espn_box.mjs
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), H = { headers: { accept: 'application/json', 'user-agent': 'courtside-stats-collector' } };
const SB = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=', SUM = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=';
const get = async u => { const r = await fetch(u, H); if (!r.ok) throw new Error(u + ' HTTP ' + r.status); return r.json(); };
const trim = e => ({ id: e.id, date: e.date, season: e.season, status: { type: e.status.type },
  competitions: [{ type: e.competitions[0].type, competitors: e.competitions[0].competitors.map(c => ({ homeAway: c.homeAway, team: { abbreviation: c.team.abbreviation } })) }] });

const [a, cup, allstar, playin] = await Promise.all(['20260310', '20251216', '20260215', '20260415'].map(d => get(SB + d)));
const std = a.events.filter(e => e.competitions[0].type.abbreviation === 'STD').slice(0, 2).map(trim);
std[1].status.type = { name: 'STATUS_IN_PROGRESS', state: 'in', completed: false };
const pick = (b, f) => trim(b.events.find(f));
const events = [...std, pick(cup, e => e.competitions[0].type.abbreviation === 'CC'), pick(allstar, e => e.competitions[0].type.abbreviation === 'ALLSTAR'), pick(playin, e => e.season.type === 5)];
await writeFile(path.join(HERE, 'espn_scoreboard.json'), JSON.stringify({ events }, null, 1));

const s = await get(SUM + '401810791');
const out = { header: { competitions: [{ date: s.header.competitions[0].date, status: s.header.competitions[0].status }] },
  boxscore: { players: s.boxscore.players.map(t => ({ team: { abbreviation: t.team.abbreviation }, statistics: t.statistics.map(st => ({ keys: st.keys, names: st.names, totals: st.totals,
    athletes: st.athletes.map(x => ({ athlete: { id: x.athlete.id, displayName: x.athlete.displayName }, didNotPlay: x.didNotPlay, reason: x.reason, stats: x.stats })) })) })) } };
await writeFile(path.join(HERE, 'espn_summary.json'), JSON.stringify(out, null, 1));
console.log('events', events.map(e => e.id + ' ' + e.competitions[0].type.abbreviation + ' t' + e.season.type + ' ' + e.status.type.completed).join(' | '));
