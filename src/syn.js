const E=require('./engine.js');const L=E.CATS.map(c=>c.l);
function syn(raw){const P=E.prepPlayers(raw);const cfg={teams:14,roster:12,slot:7,order:'snake',scoring:'most',cats:9,adpSrc:'ftx',basis:'mix',catW:[1,1,1,1,1,1,1,1,1]};E.buildContext(P,cfg);
 const pool=P.slice().sort((a,b)=>a.adpUse-b.adpUse).slice(0,168);const n=pool.length;
 const m=[...Array(9)].map((_,c)=>pool.reduce((s,p)=>s+p.boardC[c],0)/n);
 const sd=[...Array(9)].map((_,c)=>Math.sqrt(pool.reduce((s,p)=>s+(p.boardC[c]-m[c])**2,0)/n));
 const out=[];for(let a=0;a<9;a++)for(let b=a+1;b<9;b++){const r=pool.reduce((s,p)=>s+(p.boardC[a]-m[a])*(p.boardC[b]-m[b]),0)/n/sd[a]/sd[b];out.push([a,b,r]);}
 return out.sort((x,y)=>y[2]-x[2]);}
const D=require('./bt_data.json');
const sets={'2026-27 proj':require('./players.json'),'2024-25 bt':D['2024-25'].players,'2025-26 bt':D['2025-26'].players};
for(const [k,raw] of Object.entries(sets)){const s=syn(raw);console.log(k.padEnd(13),s.slice(0,8).map(([a,b,r])=>L[a]+'+'+L[b]+' '+r.toFixed(2)).join(' | '));}
