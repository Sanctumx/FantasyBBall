// Local dev server: serves the repo root and answers /api/fantrax with the real worker (worker/index.js), so league loading works locally.
// Usage: node .claude/scripts/serve-local.mjs [port=8765]   (run from any folder; serves the repo this script lives in)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = +process.argv[2] || 8765;
// worker/index.js has no .mjs extension or package type, so load its source as a module through a data URL
const worker = (await import('data:text/javascript;base64,' + fs.readFileSync(path.join(ROOT, 'worker/index.js')).toString('base64'))).default;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const env = {
  ASSETS: {
    async fetch(req) {
      let p = decodeURIComponent(new URL(req.url).pathname); if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return new Response('Not found', { status: 404 });
      return new Response(fs.readFileSync(f), { headers: { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' } });
    }
  }
};
const ctx = { waitUntil() {} };

http.createServer(async (rq, rs) => {
  try {
    const r = await worker.fetch(new Request('http://localhost:' + PORT + rq.url, { method: rq.method }), env, ctx);
    rs.writeHead(r.status, Object.fromEntries(r.headers)); rs.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { rs.writeHead(500); rs.end(String(e)); }
}).listen(PORT, () => console.log('Courtside local: http://localhost:' + PORT + '/  (repo ' + ROOT + ')'));
