// Status line: model and effort, context used, plan usage (5-hour window), prompt cache state, git branch, and a
// hint when it's time to /clear. Claude Code pipes session JSON on stdin and shows what this prints. Runs locally
// and uses no tokens. Thresholds are at the top.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Context thresholds in tokens, not %: on a 1M-token window, 50% is 500K tokens, far past the point where every
// message re-sending the whole conversation gets expensive. The rule is about the conversation itself (the Messages
// line in /context): plan a break past about 115K of it, stop past about 265K. The status line sees only the total,
// so it adds the fixed start-up cost (system, tools, skills, CLAUDE.md): about 35K in the terminal and VS Code, which
// gives 150K / 300K. Many MCP servers raise it; set CTX_BASELINE to the total /context shows in a fresh session.
const BASELINE = Number(process.env.CTX_BASELINE) || 35000;
const BREAK_AT = BASELINE + 115000;  // plan a break: /handoff, then /clear at the next stop
const STOP_AT = BASELINE + 265000;   // stop at the next safe point
const COLD_MIN = 60000;   // a cold cache only matters once there's this much to re-read
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

const cw = d.context_window || {};
const ctx = typeof cw.used_percentage === 'number' && cw.context_window_size
  ? Math.round(cw.used_percentage / 100 * cw.context_window_size)
  : (typeof cw.total_input_tokens === 'number' ? cw.total_input_tokens : null);
const k = n => (n >= 1000 ? Math.round(n / 1000) + 'K' : String(n));
if (ctx !== null) parts.push(c(ctx >= STOP_AT ? 'r' : ctx >= BREAK_AT ? 'y' : 'g', `ctx ${k(ctx)}`));

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
if (ctx !== null && ctx >= STOP_AT) parts.push(c('r', '→ stop at the next safe point: /handoff, then /clear'));
else if (ctx !== null && ctx >= BREAK_AT) parts.push(c('y', '→ /handoff, then /clear at the next stop'));
else if (pc && pc.caching_observed && !pc.warm && ctx !== null && ctx >= COLD_MIN) parts.push(c('y', '→ cache cold: /handoff, then /clear'));
else if (plan !== null && plan >= PLAN_WARN_AT) parts.push(c('r', '→ near the 5-hour limit: /handoff before it runs out'));

process.stdout.write(parts.join('  ·  ') + '\n');
