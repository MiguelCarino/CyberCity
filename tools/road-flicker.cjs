/* canal-flicker's method, aimed at the STANDING WATER ON THE ROAD.
 *
 * WHY THIS FILE EXISTS. The road's puddle field was dead code for its whole life: surf_japan.js
 * declared `function water` twice at one scope, the canal painter hoisted over the field, and
 * every call from the road reached it with three arguments missing and got NaN back. Nothing in
 * the branch had ever run — including its `rip` term, whose rate the comment above it says was
 * tuned down from 2.4 to 0.6 "because at 2.4 a downpour drove it to 4.5 Hz" and the caster floors
 * the offset into a whole row. That tuning was done against a branch that could not execute, so
 * the number was reasoned about and never measured. Turning the branch on without a gate that can
 * see it would be shipping an unmeasured time-varying reflection into a photosensitivity budget.
 *
 * WHY NEITHER SHIPPED PROBE COVERS IT. canal-flicker walks until it is a stated distance FROM THE
 * CHANNEL, so its floor is mostly canal; west-flicker sees the road but scores the whole frame at
 * once, in the schedule's own weather, and reports one number per world. This one walks clear of
 * the channel, scores ONLY the floor cells, and runs the wet presets.
 *
 * AND THE WALK IS NOT THE POINT HERE, WHICH IS WORTH SAYING PLAINLY BECAUSE THE SIBLING PROBES ARE
 * BUILT THE OTHER WAY ROUND. A cherry and a canal are somewhere; the road is underfoot everywhere,
 * so two of the six rows below pin at frame 0 and that is not the blindness CONTRACT.md warns
 * about — it is the feature being where the camera already stands. What makes this a gate the
 * others are not is the CELL SELECTION and the WEATHER, not the pose. The lit count per row is
 * printed for that reason: it is the number that says the road in shot actually had water on it.
 *
 * The rows are run in the wet presets on purpose. `w` scales with wWet and the branch's threshold
 * moves with it, so a dry row measures a road with no water in it and would report a confident
 * 0.00 for a feature that was not on screen — the failure CONTRACT.md's newest rule is about. The
 * reduced-motion row must come back exactly still: `rp` is gated on CC.reducedMotion at source.
 *
 *   node tools/road-flicker.cjs
 */
const R=require('path').join(__dirname,'..')+'/',fs=require('fs');
global.CC=require(R+'src/core.js');global.window=undefined;
['world','proj','daylight','weather_state','city','surfaces','raycast','control'].forEach(m=>require(R+'src/'+m+'.js'));
fs.readdirSync(R+'src').sort().forEach(p=>{if(/^surf_.*\.js$/.test(p))require(R+'src/'+p)});
fs.readdirSync(R+'src/elements').sort().forEach(p=>require(R+'src/elements/'+p));
const COLS=120,ROWS=40,WARM=360,NF=WARM+600,PROBES=[3.5,5,7,9,12,15,19];
const BIG=255/3, RATE_CAP=1.00, BAND_CAP=2.00;
function goertzel(x,f){const n=x.length,w=2*Math.PI*f/60,c=2*Math.cos(w);let s1=0,s2=0,m=0;
 for(let i=0;i<n;i++)m+=x[i];m/=n;
 for(let i=0;i<n;i++){const v=(x[i]-m)*(0.5-0.5*Math.cos(2*Math.PI*i/(n-1)));const s0=v+c*s1-s2;s2=s1;s1=s0;}
 return 2*Math.sqrt(s1*s1+s2*s2-c*s1*s2)/n;}
function run(preset,seed,reduced){
  CC.World.force('japan'); CC.reducedMotion=!!reduced;
  const city=CC.City.make(seed); CC.Daylight.init(city); CC.Weather.init(city); CC.Control.reset();
  const live=CC.ELEMENTS.filter(e=>CC.inWorld(e,'japan')).sort((a,b)=>(a.layer|0)-(b.layer|0));
  const rng=CC.mulberry(seed^0x9e3779b9);
  for(const el of live) if(el.init) el.init(city,rng,{cols:COLS,rows:ROWS});
  const cam={x:city.startX,z:city.startZ,yaw:0,eyeY:1.7,fov:1.25,horizon:ROWS*0.56,cellAspect:0.5625,rows:ROWS,t:0};
  /* Walk until the channel is well out of range, so the floor in shot is road and not water.
     The weather is stamped during the walk as well as during the window: the puddle threshold
     moves with wWet, so a pose found in drizzle is not the pose that has pools in it. */
  let found=false,pin=0;
  for(let k=0;k<40000;k++){const t=k/60;
    if(!CC.Weather.P.forced)CC.Weather.set(preset,t);
    CC.Daylight.update(1/60,t);CC.Weather.update(1/60,t);CC.Control.update(1/60,t,cam,city);
    if(city.rivD(cam.x,cam.z)>28){found=true;pin=k;break;}}
  if(!found) return null;
  const drawn=live.filter(e=>e.world&&CC.inWorld(e,'japan')&&!CC.inWorld(e,'cyber'));
  const f=CC.makeFrame(COLS,ROWS),N=COLS*ROWS,keep=NF-WARM,s=new Uint8Array(N*keep);
  for(let k=0;k<NF;k++){const t=(pin+k)/60;
    if(!CC.Weather.P.forced)CC.Weather.set(preset,t);
    CC.Daylight.update(1/60,t);CC.Weather.update(1/60,t);
    for(const el of live) if(el.update) el.update(1/60,t,cam);
    cam.t=t;CC.clearFrame(f);CC.Cast.render(f,cam,city);
    for(const el of drawn) if(el.draw) el.draw(f,cam,t);
    if(CC.Compose&&CC.Compose.post)CC.Compose.post(f,cam,t);
    if(k>=WARM){const b=(k-WARM)*N;for(let i=0;i<N;i++)s[b+i]=f.lum[i];}
  }
  /* The road is the FLOOR below the horizon, which is what kind 2 means here. */
  let road=0,lit=0;const isRoad=new Uint8Array(N);
  for(let i=0;i<N;i++){const rz=(i/COLS)|0; if(f.kind[i]===2&&rz>ROWS*0.56){isRoad[i]=1;road++;}}
  let big=0,band=0,worst=0;const x=new Float64Array(keep);
  for(let i=0;i<N;i++){ if(!isRoad[i]) continue;
    let b=0,mx=0,prev=s[i];x[0]=prev;let anyLit=0;
    for(let k=1;k<keep;k++){const v=s[k*N+i],d=Math.abs(v-prev);if(d>mx)mx=d;if(d>BIG)b++;prev=v;x[k]=v;}
    for(let k=0;k<keep;k++) if(s[k*N+i]>=9){anyLit=1;break;}
    lit+=anyLit;
    if(mx>worst)worst=mx;
    const r=b/(keep/60); if(r>big)big=r;
    for(const pf of PROBES){const a=goertzel(x,pf); if(a>band)band=a;}
  }
  return {road,lit,worst:100*worst/255,big,band:100*band/255,pin};
}
console.log(`road puddle rate gate — ${COLS}x${ROWS}, ${(NF-WARM)/60}s measured, ${WARM} discarded, pinned >28 m from the channel\n`);
const rows=[];
for(const seed of [42,3,404]) for(const p of ['tsuyu','typhoon']){
  const r=run(p,seed,false); rows.push(r);
  console.log(`  seed ${String(seed).padStart(4)}  ${p.padEnd(8)}` + (!r ? '(never left the channel)' :
    `roadCells ${String(r.road).padStart(4)}(${String(r.lit).padStart(4)} lit)  worstStep ${r.worst.toFixed(1).padStart(5)}%  ` +
    `bigSteps ${r.big.toFixed(2).padStart(5)}/s  3-20Hz ${r.band.toFixed(2).padStart(5)}%  pinned f${r.pin}`));
}
const rm=run('typhoon',42,true);
console.log(`\n  reduced motion: ` + (!rm ? '(not reached)' :
  `roadCells ${rm.road}  worstStep ${rm.worst.toFixed(1)}%  bigSteps ${rm.big.toFixed(2)}/s  3-20Hz ${rm.band.toFixed(2)}%`));
const seen=rows.filter(r=>r&&r.lit>0);
if(!seen.length){console.log('\nRESULT: NOT_MEASURED — no pose put lit road in frame; this is the probe failing, not a PASS');process.exit(3);}
const wBig=Math.max(...seen.map(r=>r.big)),wBand=Math.max(...seen.map(r=>r.band));
const rmBad=rm&&(rm.big>0||rm.band>0.5);
const bad=(wBig>RATE_CAP?` big steps ${wBig.toFixed(2)}/s over ${RATE_CAP.toFixed(2)}/s`:'')+
          (wBand>BAND_CAP?` 3-20Hz ${wBand.toFixed(2)}% over ${BAND_CAP.toFixed(2)}%`:'')+
          (rmBad?' reduced motion is not still':'');
console.log(`\nRESULT: ${bad?'FAIL'+bad:'PASS'}  (worst big steps ${wBig.toFixed(2)}/s, worst 3-20Hz ${wBand.toFixed(2)}%, ${seen.length}/${rows.length} rows measured)`);
process.exit(bad?1:0);
