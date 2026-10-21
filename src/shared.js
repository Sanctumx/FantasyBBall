// Helpers shared by the Draft Kit (app.html) and the League page (league.html), 2026-10-18: name matching for players
// whose spelling differs between Fantrax and the projections, projection blending, and the page toolbar.
(function (root) {
  'use strict';
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const stripSfx = k => k.replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/\s+/g, ' ').trim();
  // Fantrax and the projections spell some players differently; both directions
  const NAME_ALIAS = (() => { const m = {}, pairs = [['alex sarr', 'alexandre sarr'], ['cameron johnson', 'cam johnson'], ['herbert jones', 'herb jones'], ['luguentz dort', 'lu dort'],
    ['nicolas claxton', 'nic claxton'], ['carlton carrington', 'bub carrington'], ['gregory jackson', 'gg jackson'], ['moritz wagner', 'moe wagner'], ['nahshon hyland', 'bones hyland'], ['kenyon martin', 'kj martin']];
    pairs.forEach(([a, b]) => { m[a] = b; m[b] = a; }); return m; })();
  // the projected player a name means: exact, without suffixes, a known alias, or the same last name with one first name a
  // short form of the other (Cam / Cameron), using the team to break a tie
  function findListed(P, name, team) {
    const k2 = stripSfx(norm(name)), L = P.filter(q => !q.unlisted), key2 = q => stripSfx(q.key != null ? q.key : norm(q.n));
    let p = L.find(q => key2(q) === k2) || (NAME_ALIAS[k2] && L.find(q => key2(q) === NAME_ALIAS[k2]));
    if (p) return p;
    const parts = k2.split(' '); if (parts.length < 2 || parts[0].length < 2) return null;
    const first = parts[0], last = parts.slice(1).join(' ');
    const c = L.filter(q => { const qp = key2(q).split(' '); return qp.length > 1 && qp.slice(1).join(' ') === last && qp[0].length >= 2 && (qp[0].startsWith(first) || first.startsWith(qp[0])); });
    if (c.length === 1) return c[0];
    if (c.length > 1 && team) { const t = c.filter(q => q.t === team); if (t.length === 1) return t[0]; }
    return null;
  }
  // Projections: BBM, Hashtag (raw.hs, per game) or their average (games, minutes and per-game stats averaged; FG% and FT%
  // from the averaged makes over the averaged attempts). Players Hashtag doesn't project keep their BBM numbers.
  const PROJ_KEYS = ['g', 'm', 'pts', 'tpm', 'reb', 'ast', 'stl', 'blk', 'fga', 'fta', 'to'];
  function projOf(raw, proj) {
    const h = raw.hs;
    if (proj === 'bbm' || !h) return raw;
    if (proj === 'hs') return h;
    const o = {}; PROJ_KEYS.forEach(k => { o[k] = (raw[k] + h[k]) / 2; });
    o.fgp = o.fga ? (raw.fgp * raw.fga + h.fgp * h.fga) / 2 / o.fga : raw.fgp;
    o.ftp = o.fta ? (raw.ftp * raw.fta + h.ftp * h.fta) / 2 / o.fta : raw.ftp;
    return o;
  }
  // Toolbar between the pages; `active` is 'kit', 'league', 'matchup' or 'trades' (the last two are sections of inseason.html)
  const TOOLBAR_HTML = active => '<nav class="sitenav" aria-label="Pages">' +
    [['kit', './', 'Draft'], ['league', 'league.html', 'League'], ['matchup', 'inseason.html#matchup', 'Matchup'], ['trades', 'inseason.html#trades', 'Trade']]
      .map(([k, href, label]) => '<a href="' + href + '"' + (active === k ? ' aria-current="page"' : '') + '>' + label + '</a>').join('') + '</nav>';
  const TOOLBAR_CSS = '.sitenav{display:inline-flex;gap:2px;padding:3px;border:1px solid var(--line);border-radius:8px;background:var(--sunk)}' +
    '.sitenav a{padding:6px 14px;border-radius:6px;color:var(--muted);text-decoration:none;font-weight:600;font-size:.92rem}' +
    '.sitenav a:hover{color:var(--ink)}' +
    '.sitenav a[aria-current="page"]{background:var(--surface);color:var(--ink);box-shadow:inset 0 -2px 0 var(--accent)}' +
    '.sitenav a:focus-visible{outline:2px solid var(--accent);outline-offset:1px}';
  const api = { norm, stripSfx, NAME_ALIAS, findListed, PROJ_KEYS, projOf, TOOLBAR_HTML, TOOLBAR_CSS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Shared = api;
})(this);
