// League tab vs Team tab (league-team-rules, 2026-10-29): the Avg Win M of a team on the League matrix equals the Team tab's Win M average
// for that team, on Total (Rest of season) and Per game. Needs playwright and the repo root on :8765 (PORT overrides). REPO=<repo root>.
import { chromium } from 'playwright';
import { leagueFx } from './league_fx.mjs';
const REPO = process.env.REPO || '/root/FantasyBBall', PORT = process.env.PORT || 8765;
const M = leagueFx(REPO);
const fails = []; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };
const num = s => parseFloat(String(s).replace(/[,%+]/g, '').replace('−', '-'));
const b = await chromium.launch();
async function open(url, my, errs) {
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
  await M.setup(ctx);
  await ctx.addInitScript(s => { if (!sessionStorage.getItem('s')) { localStorage.clear(); Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v)); sessionStorage.setItem('s', '1'); } }, M.seed(my));
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:' + PORT + '/' + url); await p.waitForSelector('#body:not([hidden])', { timeout: 20000 }).catch(() => {});
  return { p, ctx };
}
const errs = [];
for (const k of [0, 5]) {
  const my = M.TEAMS[k];
  const lg = await open('league.html', my, errs), tm = await open('team.html', my, errs);
  await tm.p.waitForFunction(() => document.getElementById('rost-meta').textContent === '' && !/…/.test(document.getElementById('matrix').textContent), null, { timeout: 30000 }).catch(() => {});
  for (const [basis, view] of [['total', 'ros'], ['pergame', 'game']]) {
    await lg.p.selectOption('#basis', basis); await lg.p.waitForTimeout(800);
    await tm.p.click('#view button[data-v="' + view + '"]');
    await tm.p.waitForFunction(() => document.getElementById('rost-meta').textContent === '' && !/…/.test(document.getElementById('matrix').textContent), null, { timeout: 30000 }).catch(() => {});
    await tm.p.waitForTimeout(500);
    const leagueAvg = num(await lg.p.$eval('#mx tbody tr.me td:last-child', e => e.textContent));
    const teamAvg = num(await tm.p.$eval('#matrix tr.tot td:last-child', e => e.textContent));
    ok(Math.abs(leagueAvg - teamAvg) <= 0.5, 'team ' + k + ' ' + basis + ': League Avg ' + leagueAvg + ' vs Team Win M ' + teamAvg);
  }
  await lg.ctx.close(); await tm.ctx.close();
}
ok(errs.length === 0, 'no page errors ' + errs.join('; '));
await b.close();
console.log(fails.length ? 'FAILED ' + fails.length : 'ALL PASS');
process.exit(fails.length ? 1 : 0);
