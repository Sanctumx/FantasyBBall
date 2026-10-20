// Status line: model and effort, context used, plan usage (5-hour window), prompt cache state, git branch, and a
// hint when it's time to /clear. Claude Code pipes session JSON on stdin and shows what this prints. Runs locally
// and uses no tokens. Thresholds are at the top.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const CLEAR_AT = 50;      // context % at which to plan a break (GUIDELINES: "more than about half")
const WARN_AT = 70;       // context % shown in red
const PLAN_WARN_AT = 80;  // 5-hour plan usage % shown in red

let d = {};
try { d = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { /* print what we can */ }

const color = process.env.NO_COLOR ? {} : { g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', dim: '\x1b[2m', x: '\x1b[0m' };
const c = (k, s) => (color[k] || '') + s + (color.x || '');
const pct = v => (typeof v === 'number' ? Math.round(v) : null);

const parts = [];

const model = d.model && d.model.display_name;
const effort = d.effort && d.effort.level;
if (model) parts.push(effort ? `${model} · ${effort}` : model);

const ctx = pct(d.context_window && d.context_window.used_percentage);
if (ctx !== null) parts.push(c(ctx >= WARN_AT ? 'r' : ctx >= CLEAR_AT ? 'y' : 'g', `ctx ${ctx}%`));

const plan = pct(d.rate_limits && d.rate_limits.five_hour && d.rate_limits.five_hour.used_percentage);
if (plan !== null) parts.push(c(plan >= PLAN_WARN_AT ? 'r' : 'dim', `5h ${plan}%`));

const pc = d.prompt_cache;
if (pc && pc.caching_observed) {
  const hit = pct(typeof pc.hit_ratio === 'number' ? pc.hit_ratio * 100 : null);
  parts.push(pc.warm ? c('dim', `cache ${hit !== null ? hit + '%' : 'warm'}`) : c('y', 'cache cold'));
}

try {
  const cwd = (d.workspace && d.workspace.current_dir) || d.cwd || process.cwd();
  const branch = execFileSync('git', ['-C', cwd, 'branch', '--show-current'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1000 }).trim();
  if (branch) parts.push(c('dim', branch));
} catch { /* not a git repo */ }

// One hint at most, most urgent first.
if (ctx !== null && ctx >= CLEAR_AT) parts.push(c('y', '→ /handoff, then /clear at the next stop'));
else if (pc && pc.caching_observed && !pc.warm && ctx !== null && ctx >= 20) parts.push(c('y', '→ cache cold: /handoff, then /clear'));
else if (plan !== null && plan >= PLAN_WARN_AT) parts.push(c('r', '→ near the 5-hour limit: /handoff before it runs out'));

process.stdout.write(parts.join('  ·  ') + '\n');
