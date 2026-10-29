// Hashtag Basketball projections, once a day (user, 2026-10-29). Your own premium account, one page request per run, no crawling.
//   node src/collect/hashtag_fetch.mjs login      open a browser, log in by hand once; the session is saved to .auth/hashtag.json (git-ignored)
//   node src/collect/hashtag_fetch.mjs discover   print what the logged-in page offers (export button, tables, settings), for building the fetch
// Playwright lives outside the repo: PW_DIR (default C:/Users/Fefe/Documents/pw-tools) holds its node_modules.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUTH = path.join(root, '.auth', 'hashtag.json');
const URL_PROJ = 'https://hashtagbasketball.com/fantasy-basketball-projections';
const { chromium } = createRequire(path.join(process.env.PW_DIR || 'C:/Users/Fefe/Documents/pw-tools', 'x.js'))('playwright');

const mode = process.argv[2];
if (mode === 'login') {
  fs.mkdirSync(path.dirname(AUTH), { recursive: true });
  const browser = await chromium.launch({ headless: false }), ctx = await browser.newContext(), page = await ctx.newPage();
  await page.goto(URL_PROJ);
  console.log('Log in in the browser window, then close the window. The session is saved when you close it.');
  // save on every navigation, so the cookies are kept even if the window is closed abruptly
  const save = () => ctx.storageState({ path: AUTH }).catch(() => {});
  page.on('load', save);
  await new Promise(res => browser.on('disconnected', res));
  console.log(fs.existsSync(AUTH) ? 'Saved ' + AUTH : 'No session saved');
} else if (mode === 'discover') {
  if (!fs.existsSync(AUTH)) throw new Error('Run login first');
  const browser = await chromium.launch(), ctx = await browser.newContext({ storageState: AUTH }), page = await ctx.newPage();
  await page.goto(URL_PROJ, { waitUntil: 'networkidle' });
  const info = await page.evaluate(() => ({
    title: document.title,
    text: document.body.innerText.slice(0, 400),
    controls: [...document.querySelectorAll('select, input, button, a')].filter(e => e.offsetParent).map(e => `${e.tagName} ${e.id || e.name || ''} ${(e.value || e.innerText || '').trim().slice(0, 40)}`)
      .filter(s => /export|download|excel|csv|select|ddl|btn|login|logout/i.test(s)).slice(0, 60),
    selects: [...document.querySelectorAll('select')].map(s => ({ id: s.id, value: s.value, options: [...s.options].map(o => o.text).slice(0, 12) })),
    tables: [...document.querySelectorAll('table')].map(t => ({ id: t.id, rows: t.rows.length, head: t.rows[0] ? t.rows[0].innerText.replace(/\s+/g, ' ').slice(0, 200) : '' })),
  }));
  console.log(JSON.stringify(info, null, 1));
  await browser.close();
} else if (mode === 'fetch') {
  // the full table (Show = All) with the page's own settings, written as src/data/hashtag_<date>.xlsx in the layout hashtag.py reads, then hashtag.py refreshes players.json
  if (!fs.existsSync(AUTH)) throw new Error('Run login first');
  const COLS = ['R#', 'PLAYER', 'ADP', 'POS', 'TEAM', 'GP', 'MPG', 'FG%', 'FT%', '3PM', 'PTS', 'TREB', 'AST', 'STL', 'BLK', 'TO', 'TOTAL'], MIN_ROWS = 300;
  const browser = await chromium.launch(), ctx = await browser.newContext({ storageState: AUTH }), page = await ctx.newPage();
  await page.goto(URL_PROJ, { waitUntil: 'networkidle' });
  if (!(await page.locator('#LoginStatus2').innerText()).includes('Logout')) throw new Error('Not logged in: the saved session has expired, run login again');
  await page.selectOption('#ContentPlaceHolder1_DDSHOW', { label: 'All' });   // an ASP.NET postback: wait for the grid to grow, not for a navigation
  await page.waitForFunction(min => document.querySelectorAll('#ContentPlaceHolder1_GridView1 tr').length > min, MIN_ROWS, { timeout: 30000 });
  const rows = await page.evaluate(() => [...document.querySelectorAll('#ContentPlaceHolder1_GridView1 tr')].map(tr => [...tr.cells].map(c => c.innerText.replace(/\s+/g, ' ').trim())));
  await browser.close();
  const head = rows[0], body = rows.slice(1).filter(r => r.length === COLS.length && r[1] && r[1] !== 'PLAYER');
  if (JSON.stringify(head) !== JSON.stringify(COLS)) throw new Error('Columns changed: ' + head.join(','));
  if (body.length < MIN_ROWS) throw new Error(`Only ${body.length} players (expected at least ${MIN_ROWS}); the login may have lapsed`);
  const date = new Date().toISOString().slice(0, 10), out = path.join(root, 'src', 'data', `hashtag_${date}.xlsx`), tmp = out + '.json';
  fs.writeFileSync(tmp, JSON.stringify({ cols: COLS, body }));
  const { execFileSync } = await import('node:child_process');
  execFileSync('python', ['-I', '-c', 'import json,sys,pandas as pd; d=json.load(open(sys.argv[1],encoding="utf-8")); df=pd.DataFrame(d["body"],columns=d["cols"]); df=df.apply(lambda c: pd.to_numeric(c) if pd.to_numeric(c,errors="coerce").notna().sum()==c.replace("",None).notna().sum() else c); df.to_excel(sys.argv[2],index=False)', tmp, out]);
  fs.unlinkSync(tmp);
  console.log(`Wrote ${out}: ${body.length} players`);
  if (process.argv[3] !== '--no-merge') execFileSync('python', ['-I', 'hashtag.py'], { cwd: path.join(root, 'src'), stdio: 'inherit' });
} else {
  console.error('usage: hashtag_fetch.mjs login | discover | fetch [--no-merge]');
  process.exit(1);
}
