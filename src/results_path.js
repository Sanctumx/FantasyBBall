// Where backtest result files (bt_<name>_<season>_...json) live: src/results/. Readers also look in src/ so a run started from an
// older checkout (which wrote next to the scripts) is still found; results/ wins when both have the same name.
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'results'), OLD = __dirname;

function resultPath(name) { fs.mkdirSync(DIR, { recursive: true }); return path.join(DIR, name); }

function listResults(re, dirs = [DIR, OLD]) {
  const seen = new Set(), out = [];
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) if (re.test(f) && !seen.has(f)) { seen.add(f); out.push(path.join(d, f)); }
  }
  return out;
}

function findResult(name, dirs = [DIR, OLD]) {
  for (const d of dirs) { const p = path.join(d, name); if (fs.existsSync(p)) return p; }
  return null;
}

function readResult(name, dirs) { const p = findResult(name, dirs); if (!p) throw new Error('result file not found: ' + name); return JSON.parse(fs.readFileSync(p)); }

module.exports = { resultPath, listResults, findResult, readResult, DIR };
