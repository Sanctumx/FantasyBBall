// Rebuild the site and copy the built pages to the repo root (CLAUDE.md, "How changes get made", step 4).
// Run from any checkout of the repo: node .claude/scripts/build.mjs
// The only thing it deletes is <repo>/assets, which it then recreates from src/site/assets.
import { spawnSync } from 'node:child_process';
import { cpSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = path.join(root, 'src');
const PAGES = ['index', 'league', 'inseason', 'settings', 'rankings', 'team'];
const python = process.platform === 'win32' ? 'python' : 'python3';

for (const script of ['gen.py', 'build_site.py']) {
  const r = spawnSync(python, [script], { cwd: src, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`${script} failed (exit ${r.status})`);
    process.exit(r.status || 1);
  }
}

const site = path.join(src, 'site');
if (!existsSync(path.join(site, 'assets'))) {
  console.error('src/site/assets missing; build did not produce it');
  process.exit(1);
}
rmSync(path.join(root, 'assets'), { recursive: true, force: true });
cpSync(path.join(site, 'assets'), path.join(root, 'assets'), { recursive: true });
for (const p of PAGES) copyFileSync(path.join(site, `${p}.html`), path.join(root, `${p}.html`));
console.log(`built: assets + ${PAGES.length} pages copied to repo root`);
