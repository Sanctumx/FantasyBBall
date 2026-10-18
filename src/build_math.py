# Builds math.html (repo root) from an HTML export of the "Math Behind the Model" doc (2026-10-17), so the board can link
# to a page anyone can read without signing in. Export the doc's tab as HTML (Claude Docs export), save it, then:
#   python3 build_math.py <export.html>
# Formulas (```latex blocks) are typeset here with KaTeX (node + `npm i katex@0.16.9`; pass its folder as the 2nd
# argument); KaTeX's stylesheet and fonts are inlined, so the page loads nothing but Google Fonts; styling follows the board.
import sys, re, html as H, json, subprocess
src = open(sys.argv[1], encoding='utf-8').read()
src = re.sub(r'\s*·\s*<span data-atom="mention"[^>]*>.*?</span>', '', src)           # byline: keep the as-of date only
src = re.sub(r'<p><time data-atom="date" datetime="([^"]+)">[^<]*</time></p>', r'<p class="asof">Updated \1</p>', src, count=1)
src = re.sub(r'<table>', '<div class="tw"><table>', src).replace('</table>', '</table></div>')
KATEX = sys.argv[2] if len(sys.argv) > 2 else 'katex'
blocks = [H.unescape(m) for m in re.findall(r'<pre><code class="language-latex">(.*?)</code></pre>', src, flags=re.S)]
js = "const k=require(process.argv[1]);const a=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(a.map(t=>k.renderToString(t,{displayMode:true,throwOnError:false}))))"
out = json.loads(subprocess.run(['node', '-e', js, KATEX], input=json.dumps(blocks), capture_output=True, text=True, check=True).stdout)
it = iter(out)
src = re.sub(r'<pre><code class="language-latex">.*?</code></pre>', lambda m: '<div class="eq">' + next(it) + '</div>', src, flags=re.S)
# KaTeX's stylesheet and fonts go inline (woff2 as data URIs): pages hosted as Claude artifacts can't load a cdnjs stylesheet,
# and without it every formula shows as doubled plain text.
import os, base64
KD = os.path.join(KATEX, 'dist') if os.path.isdir(os.path.join(KATEX, 'dist')) else KATEX
kcss = open(os.path.join(KD, 'katex.min.css'), encoding='utf-8').read()
kcss = re.sub(r'url\(fonts/([\w-]+)\.woff2\) format\("woff2"\)(,url\(fonts/[^)]+\) format\("[a-z]+"\))*',
              lambda m: 'url(data:font/woff2;base64,' + base64.b64encode(open(os.path.join(KD, 'fonts', m.group(1) + '.woff2'), 'rb').read()).decode() + ') format("woff2")', kcss)
assert 'url(fonts/' not in kcss, 'unexpected KaTeX font rule'
title = H.unescape(re.search(r'<h1[^>]*>(.*?)</h1>', src).group(1))
page = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{H.escape(title)}</title>
<meta name="description" content="Formulas, fitted numbers and backtests behind the Courtside Draft Kit board.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>{kcss}</style>
<style>
:root{{--bg:#EFF1EE;--surface:#FFFFFF;--sunk:#F6F7F5;--ink:#15191B;--muted:#5D666B;--line:#D8DCD7;--accent:#C24E1B;color-scheme:light}}
@media (prefers-color-scheme: dark){{:root{{--bg:#0F1214;--surface:#171B1E;--sunk:#13171A;--ink:#E6E9E5;--muted:#99A2A7;--line:#2A3135;--accent:#EC7840;color-scheme:dark}}}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 "IBM Plex Sans",system-ui,sans-serif}}
main{{max-width:880px;margin:0 auto;padding:24px 16px 64px;background:var(--surface);min-height:100vh}}
.back{{display:inline-block;margin-bottom:12px;color:var(--accent);text-decoration:none;font-weight:500}}
h1,h2,h3{{font-family:"Barlow Condensed","Arial Narrow",sans-serif;line-height:1.15;letter-spacing:.01em}}
h1{{font-size:2.3rem;margin:.2em 0 .1em}} h2{{font-size:1.65rem;margin:1.8em 0 .4em;padding-top:.6em;border-top:1px solid var(--line)}} h3{{font-size:1.25rem;margin:1.4em 0 .3em}}
.asof{{color:var(--muted);margin-top:0}}
a{{color:var(--accent)}}
code{{font-family:"IBM Plex Mono",monospace;font-size:.9em}}
pre{{background:var(--sunk);border:1px solid var(--line);border-radius:6px;padding:12px 14px;overflow-x:auto}}
.eq{{overflow-x:auto;overflow-y:hidden;padding:2px 0}}
.tw{{overflow-x:auto;margin:1em 0}}
table{{border-collapse:collapse;font-size:.92rem;min-width:100%}}
th,td{{border:1px solid var(--line);padding:6px 9px;text-align:left;vertical-align:top}} th{{background:var(--sunk);font-weight:600}}
td p,th p,li p{{margin:0}}
</style>
</head>
<body>
<main>
<a class="back" href="./">← Back to the board</a>
{src}
</main>
</body>
</html>
'''
open('../math.html', 'w', encoding='utf-8').write(page)
print('wrote math.html:', len(page), 'bytes,', len(out), 'formulas typeset')
