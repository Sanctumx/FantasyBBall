a=open('courtside-draft-board.html').read()
head='''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Live snake draft board for 9-cat and 8-cat fantasy basketball: BBM projections, Fantrax ADP and live Fantrax draft sync.">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px/1.45 system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
'''
open('site/index.html','w').write(head+a+'\n</body>\n</html>\n')
