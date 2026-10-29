const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const SRC = path.join(__dirname, '..', '..');
const R = require(path.join(SRC, 'results_path.js'));

test('resultPath puts a file under src/results', () => {
  assert.strictEqual(R.resultPath('bt_x_1.json'), path.join(SRC, 'results', 'bt_x_1.json'));
});

test('listResults: results/ copy wins, each name once', () => {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'res-')), a = path.join(t, 'a'), b = path.join(t, 'b');
  fs.mkdirSync(a); fs.mkdirSync(b);
  fs.writeFileSync(path.join(a, 'bt_x_1.json'), '1'); fs.writeFileSync(path.join(b, 'bt_x_1.json'), '2');
  fs.writeFileSync(path.join(b, 'bt_x_2.json'), '3'); fs.writeFileSync(path.join(b, 'other.json'), '4');
  const got = R.listResults(/^bt_x_.*\.json$/, [a, b]);
  assert.deepStrictEqual(got, [path.join(a, 'bt_x_1.json'), path.join(b, 'bt_x_2.json')]);
  assert.strictEqual(R.findResult('bt_x_2.json', [a, b]), path.join(b, 'bt_x_2.json'));
  assert.strictEqual(R.findResult('nope.json', [a, b]), null);
});

test('no bt_*.js script writes a result file next to itself', () => {
  const bad = fs.readdirSync(SRC).filter(f => /^bt_.*\.js$/.test(f))
    .filter(f => /writeFileSync\(\s*['`]bt_/.test(fs.readFileSync(path.join(SRC, f), 'utf8')));
  assert.deepStrictEqual(bad, []);
  const noHelper = fs.readdirSync(SRC).filter(f => /^bt_.*\.js$/.test(f)).map(f => [f, fs.readFileSync(path.join(SRC, f), 'utf8')])
    .filter(([, s]) => /writeFileSync/.test(s) && !/resultPath/.test(s)).map(([f]) => f);
  assert.deepStrictEqual(noHelper, []);
});

test('summary scripts do not read results from the working directory', () => {
  const bad = fs.readdirSync(SRC).filter(f => /_sum2?\.js$/.test(f))
    .filter(f => /readdirSync\('\.'\)/.test(fs.readFileSync(path.join(SRC, f), 'utf8')));
  assert.deepStrictEqual(bad, []);
  for (const f of ['prize_equity.py', 'equity.py', 'strat_equity.py']) {
    if (!fs.existsSync(path.join(SRC, f))) continue;
    assert.ok(!/glob\.glob\(\s*['"]bt_/.test(fs.readFileSync(path.join(SRC, f), 'utf8')), f);
  }
});

test('no tracked bt result file sits in src/ (they live in src/results/)', () => {
  const out = cp.execFileSync('git', ['ls-files', 'src/bt_*_*.json'], { cwd: path.join(SRC, '..'), encoding: 'utf8' });
  assert.strictEqual(out.trim(), '');
});

test('bats name result files under results\\', () => {
  for (const f of fs.readdirSync(SRC).filter(f => /\.bat$/.test(f))) {
    for (const line of fs.readFileSync(path.join(SRC, f), 'utf8').split(/\r?\n/))
      if (/bt_[a-z0-9]+_[^ ]*\.json/i.test(line)) assert.ok(/results[\\/]/.test(line), f + ': ' + line);
  }
});
