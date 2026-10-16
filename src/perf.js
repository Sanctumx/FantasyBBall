const E=require('./engine.js');const P=E.prepPlayers(require('./players.json'));
for (const m of ['off','auto']){const cfg={teams:14,roster:12,slot:7,order:'snake',scoring:'most',cats:9,adpSrc:'ftx',basis:'mix',orderBy:'gainM',catW:[1,1,1,1,1,1,1,1,1],scarZ:'vstrong',scarP:'light',zdrop:1,puntMode:m};
const ctx=E.buildContext(P,cfg); const picks=new Array(168).fill(null);
let ts=[]; for(let k=0;k<60;k++){const t=process.hrtime.bigint(); const r=E.evaluate(P,ctx,cfg,{picks}); ts.push(Number(process.hrtime.bigint()-t)/1e6);
 const av=P.filter(p=>!picks.includes(p.id)).sort((a,b)=>a.adpUse-b.adpUse); picks[k]=av[0].id;
 if(k===0||k===30) console.log(m,'pick',k,'active strategies',r.strategies.filter(s=>s.w>1e-4).length);}
console.log(m,'mean ms',(ts.reduce((a,b)=>a+b)/ts.length).toFixed(0),'max',Math.max(...ts).toFixed(0));}
