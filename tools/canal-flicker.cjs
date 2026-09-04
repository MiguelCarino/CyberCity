/* west-flicker's method, but with the camera PINNED ON THE CANAL — which is the one place the
   shipped gate can never look, because it pins at the map's start and the channel is 100+ m away. */
const R=require('path').join(__dirname,'..')+'/',fs=require('fs');
global.CC=require(R+'src/core.js');global.window=undefined;
['world','proj','daylight','weather_state','city','surfaces','raycast','control'].forEach(m=>require(R+'src/'+m+'.js'));
fs.readdirSync(R+'src').sort().forEach(p=>{if(/^surf_.*\.js$/.test(p))require(R+'src/'+p)});
fs.readdirSync(R+'src/elements').sort().forEach(p=>require(R+'src/elements/'+p));
const COLS=120,ROWS=40,WARM=360,NF=WARM+240,PROBES=[3.5,5,7,9,12,15,19];
function goertzel(x,f){const n=x.length,w=2*Math.PI*f/60,c=2*Math.cos(w);let s1=0,s2=0,m=0;
 for(let i=0;i<n;i++)m+=x[i];m/=n;
 for(let i=0;i<n;i++){const v=(x[i]-m)*(0.5-0.5*Math.cos(2*Math.PI*i/(n-1)));const s0=v+c*s1-s2;s2=s1;s1=s0;}
 return 2*Math.sqrt(s1*s1+s2*s2-c*s1*s2)/n;}
function run(preset,seed,reduced,dOff){
  CC.World.force('japan'); CC.reducedMotion=!!reduced;
  const city=CC.City.make(seed); CC.Daylight.init(city); CC.Weather.init(city); CC.Control.reset();
  const live=CC.ELEMENTS.filter(e=>CC.inWorld(e,'japan')).sort((a,b)=>(a.layer|0)-(b.layer|0));
  const rng=CC.mulberry(seed^0x9e3779b9);
  for(const el of live) if(el.init) el.init(city,rng,{cols:COLS,rows:ROWS});
  // walk the autopilot until it is dOff metres from the channel, then PIN there
  const cam={x:city.startX,z:city.startZ,yaw:0,eyeY:1.7,fov:1.25,horizon:ROWS*0.56,cellAspect:0.5625,rows:ROWS,t:0};
  let found=false;
  for(let k=0;k<40000;k++){CC.Daylight.update(1/60,k/60);CC.Weather.update(1/60,k/60);CC.Control.update(1/60,k/60,cam,city);
    if(Math.abs(city.rivD(cam.x,cam.z)-dOff)<0.9){found=true;break;}}
  if(!found) return null;
  /* SCOPED EXACTLY AS tools/west-flicker.cjs SCOPES IT: only elements EXCLUSIVE to this world are
     drawn. A shared element (the crowd, the rain) is part of the baseline every world carries and
     the tool's own header spends a paragraph on why it is not this world's to answer for. Drawing
     them here measured the pedestrians and called it the canal. */
  const drawn=live.filter(e=>e.world&&CC.inWorld(e,'japan')&&!CC.inWorld(e,'cyber'));
  const f=CC.makeFrame(COLS,ROWS),N=COLS*ROWS,keep=NF-WARM,s=new Uint8Array(N*keep);
  const isWater=new Uint8Array(N);
  for(let k=0;k<NF;k++){const t=k/60;
    if(!CC.Weather.P.forced)CC.Weather.set(preset,t);
    CC.Weather.update(1/60,t);
    for(const el of live) if(el.update) el.update(1/60,t,cam);
    cam.t=t;CC.clearFrame(f);CC.Cast.render(f,cam,city);
    for(const el of drawn) if(el.draw) el.draw(f,cam,t);
    if(CC.Compose&&CC.Compose.post)CC.Compose.post(f,cam,t);
    if(k>=WARM){const b=(k-WARM)*N;for(let i=0;i<N;i++)s[b+i]=f.lum[i];}
  }
  let water=0;
  for(let i=0;i<N;i++){ const rz=(i/COLS)|0; if(f.kind[i]===2&&rz>ROWS*0.56){isWater[i]=1;water++;} }
  let big=0,band=0,worst=0;const x=new Float64Array(keep);
  for(let i=0;i<N;i++){ if(!isWater[i]) continue;let b=0,mx=0,prev=s[i];
    for(let k=1;k<keep;k++){const v=s[k*N+i],d=Math.abs(v-prev);if(d>mx)mx=d;if(d>85)b++;prev=v;x[k]=v;}
    x[0]=s[i];
    if(b/(keep/60)>big)big=b/(keep/60);
    if(mx>worst)worst=mx;
    for(const fq of PROBES){const a=goertzel(x,fq);if(a>band)band=a;}}
  return {water,worst:(100*worst/255).toFixed(1),big:big.toFixed(2),band:(100*band/255).toFixed(2)};
}
/* One sweep, collected as it prints. The verdict below reads THIS array — an earlier cut ran the
   same eight configurations a second time to score them, which doubled a 13-second gate's runtime
   for numbers it had already computed and left two config lists to keep in step. */
const ROWS_ALL=[];
for(const [seed,dOff] of [[42,2],[42,8],[3,2],[3,8]])
  for(const p of ['kiri','typhoon'])
    { const r=run(p,seed,false,dOff); ROWS_ALL.push(r);
      console.log('seed',seed,'dist-to-channel',dOff+'m',p.padEnd(8),r?`waterCells ${String(r.water).padStart(4)}  worstStep ${r.worst}%  bigSteps ${r.big}/s  3-20Hz ${r.band}%`:'(never reached)'); }
const rm=run('typhoon',42,true,2);
console.log('reduced-motion @2m typhoon:', rm?`waterCells ${rm.water} worstStep ${rm.worst}% bigSteps ${rm.big}/s 3-20Hz ${rm.band}%`:'n/a');

/* THE VERDICT, which this file shipped without — CONTRACT.md names it the pattern to copy and a
   probe with no PASS/FAIL is a print-out, not a gate. Four codes rather than two, following
   tools/flicker-rate.cjs: 1 is a MEASURED violation, 3 is "the walk never reached the water", and
   those are not the same answer. The 2% rule is the project's, and the big-step cap is the one
   tools/west-flicker.cjs applies to a world that is not the default. */
const measured = ROWS_ALL.filter(Boolean);
if (!measured.length || measured.every(r => r.water === 0)) {
  console.log('RESULT: NOT_MEASURED — the walk never stood on the channel, or it rendered no water');
  process.exit(3);
}
const worstBand = Math.max(...measured.map(r => parseFloat(r.band)));
const worstBig  = Math.max(...measured.map(r => parseFloat(r.big)));
const bad = (worstBand > 2.0 ? ` 3-20Hz ${worstBand}% over 2%` : '') +
            (worstBig > 8.0 ? ` big steps ${worstBig}/s over 8/s` : '') +
            /* The reduced-motion row was printed and not judged, which is half a gate: the flag's
               rule is stricter than the live one — with it on, everything that modulates must be
               frozen or slow enough that the band is empty. */
            (rm && (parseFloat(rm.big) > 0 || parseFloat(rm.band) > 0.5)
              ? ` reduced motion is not still (${rm.big}/s, ${rm.band}%)` : '');
console.log(`RESULT: ${bad ? 'FAIL' + bad : 'PASS'}  (worst 3-20Hz ${worstBand}%, worst big steps ${worstBig}/s)`);
process.exit(bad ? 1 : 0);
