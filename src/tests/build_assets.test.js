const test = require('node:test'), assert = require('node:assert');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

// gen.py writes, besides the inlined courtside-*.html, a linked copy of every page (site/linked/) whose big scripts are
// hashed files (site/assets/<name>.<hash>.js). Build into a temp folder (GEN_OUT) so the repo is not touched.
const SRC = path.join(__dirname, '..'), OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-'));
const PAGES = ['draft-board', 'league', 'inseason', 'settings', 'rankings', 'team'];
const py = ['python3', 'python'].find(c => { try { return spawnSync(c, ['--version']).status === 0; } catch (e) { return false; } });
const run = py && spawnSync(py, ['gen.py'], { cwd: SRC, env: Object.assign({}, process.env, { GEN_OUT: OUT }), encoding: 'utf8' });
const skip = !py ? 'no python on this machine' : false;
const rd = f => fs.readFileSync(path.join(OUT, f), 'utf8');
const SCRIPT = /<script>([\s\S]*?)<\/script>/g, LINK = /<script src="(assets\/[^"]+)"><\/script>/g;
const squash = s => s.replace(/\s+/g, '');

test('gen.py runs', { skip }, () => { assert.strictEqual(run.status, 0, run.stderr); });

test('every linked script exists and its file name carries the hash of its content', { skip }, () => {
  let n = 0;
  for (const p of PAGES) for (const m of rd('site/linked/courtside-' + p + '.html').matchAll(LINK)) {
    const body = fs.readFileSync(path.join(OUT, 'site', m[1]));
    const hash = crypto.createHash('sha256').update(body).digest('hex').slice(0, 8);
    assert.match(m[1], new RegExp('^assets/[a-z_]+\\.' + hash + '\\.js$'), p + ': ' + m[1]); n++;
  }
  assert.ok(n >= 20, 'linked ' + n + ' scripts');
});

test('no placeholder is left in any page', { skip }, () => {
  for (const p of PAGES) for (const f of ['courtside-' + p + '.html', 'site/linked/courtside-' + p + '.html']) assert.ok(!rd(f).includes('/*__'), f);
  for (const f of fs.readdirSync(path.join(OUT, 'site/assets'))) assert.ok(!fs.readFileSync(path.join(OUT, 'site/assets', f), 'utf8').includes('/*__'), f);
});

test('the board artifact stays one self-contained file', { skip }, () => {
  assert.ok(!/<script src/.test(rd('courtside-draft-board.html')));
  assert.ok(/<script src="assets\/engine\./.test(rd('site/linked/courtside-draft-board.html')));
});

test('a linked page is the inlined page with its scripts moved out (same code, same order, same markup)', { skip }, () => {
  for (const p of PAGES) {
    const inl = rd('courtside-' + p + '.html'), lnk = rd('site/linked/courtside-' + p + '.html');
    const code = html => squash([...html.matchAll(SCRIPT)].map(m => m[1]).join(''));
    const linkedCode = squash([...lnk.matchAll(/<script(?: src="(assets\/[^"]+)")?>([\s\S]*?)<\/script>/g)].map(m => m[1] ? fs.readFileSync(path.join(OUT, 'site', m[1]), 'utf8') : m[2]).join(''));
    assert.strictEqual(linkedCode, code(inl), p + ': scripts');
    assert.strictEqual(squash(lnk.replace(LINK, '').replace(SCRIPT, '')), squash(inl.replace(SCRIPT, '')), p + ': markup');
  }
});

test('a file with a given hash is never rewritten with other content (names are content hashes)', { skip }, () => {
  const names = fs.readdirSync(path.join(OUT, 'site/assets'));
  assert.strictEqual(new Set(names).size, names.length);
  assert.ok(names.some(f => /^players\.[0-9a-f]{8}\.js$/.test(f)) && names.some(f => /^engine\.[0-9a-f]{8}\.js$/.test(f)));
});
