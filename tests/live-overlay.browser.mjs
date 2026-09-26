import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require('/home/paal/tmp-codex-test/worktrees/wheel-dev-guide/node_modules/playwright');
const origin=process.env.EDGE_TEST_ORIGIN??'https://127.0.0.1:8362';
const output=process.env.EDGE_EVIDENCE_DIR??'/home/paal/tmp-codex-test/senttra-live-overlay-20260926/evidence';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/opt/google/chrome/chrome',args:['--autoplay-policy=no-user-gesture-required']});
const result={started:new Date().toISOString(),errors:[],samples:[]};
let page;
try{
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1500,height:1000},
  deviceScaleFactor:Number(process.env.EDGE_TEST_DPR??.8)});
 await context.addInitScript(()=>{
  window.__hls=[];let exposed;
  Object.defineProperty(window,'Hls',{configurable:true,get:()=>exposed,set:Actual=>{
   exposed=class extends Actual{constructor(config){super(config);window.__hls.push(this);}};
  }});
 });
 page=await context.newPage();page.on('pageerror',error=>result.errors.push(error.message));
 for(const path of ['/api/live/detections','/api/live/detections/events?camera=little1']){
  assert.equal((await context.request.get(origin+'/edge'+path)).status(),401);
 }
 await page.goto(origin+'/edge');
 await page.getByRole('link',{name:'Entrar con Zitadel'}).click();
 await page.waitForURL(url=>url.origin===origin && ['/edge','/edge/live'].includes(url.pathname));
 await page.getByRole('button',{name:'Seleccionar Little Caesars 1 en el mapa',exact:true}).click();
 await page.getByRole('button',{name:'Cámara seleccionada',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('video[data-live-video]').length===1);
 const video=page.locator('video[data-live-video="little1"]');
 const canvas=page.locator('[data-detection-overlay="little1"]');
 await video.scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>Number(document.querySelector('[data-detection-overlay="little1"]')?.dataset.boxes)>0,null,{timeout:60000});
 await video.evaluate(v=>{window.__originalVideo=v;});
 const sample=()=>page.evaluate(()=>{
  const v=document.querySelector('video[data-live-video="little1"]'),c=document.querySelector('[data-detection-overlay="little1"]');
  const h=window.__hls.findLast(h=>h.media===v),f=h?.levelController?.levelLastLoaded;
  return {time:v.currentTime,paused:v.paused,ready:v.readyState,width:v.videoWidth,height:v.videoHeight,
   frames:v.getVideoPlaybackQuality().totalVideoFrames,dropped:v.getVideoPlaybackQuality().droppedVideoFrames,
   buffered:Array.from({length:v.buffered.length},(_,i)=>[v.buffered.start(i),v.buffered.end(i)]),
   seekable:Array.from({length:v.seekable.length},(_,i)=>[v.seekable.start(i),v.seekable.end(i)]),
   boxes:Number(c?.dataset.boxes??0),segment:c?.dataset.segment,offset:Number(c?.dataset.offset),observation:Number(c?.dataset.observation),
   canvasWidth:c?.width,canvasHeight:c?.height,status:document.querySelector('[data-detection-status="little1"]')?.textContent,
   sameVideo:window.__originalVideo===v,fragment:h?.streamController?.fragPlaying?{
    start:h.streamController.fragPlaying.start,startPTS:h.streamController.fragPlaying.startPTS,
    video:h.streamController.fragPlaying.elementaryStreams?.video,url:h.streamController.fragPlaying.url}:null,
   level:typeof f==='number'?f:null};
 });
 result.initial=await sample();
 assert.equal(result.initial.width,1920);assert.equal(result.initial.height,1080);
 result.devicePixelRatio=await page.evaluate(()=>window.devicePixelRatio);
 // Mark the full right/bottom edges so a partial clear cannot pass just because
 // the current traffic happens to be in the top-left of the image.
 await canvas.evaluate(c=>{
  const drawing=c.getContext('2d');drawing.save();drawing.resetTransform();
  drawing.fillStyle='#ff00ff';drawing.fillRect(c.width-16,0,16,c.height);
  drawing.fillRect(0,c.height-16,c.width,16);drawing.restore();
 });
 await page.waitForFunction(()=>{
  const c=document.querySelector('[data-detection-overlay="little1"]');
  const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
  for(let i=0;i<pixels.length;i+=4){
   if(pixels[i]===255&&pixels[i+1]===0&&pixels[i+2]===255&&pixels[i+3]===255)return false;
  }
  return true;
 },null,{timeout:3000});
 result.clearedEntireFrame=true;
 console.log(JSON.stringify({event:'live_overlay_visible',sample:result.initial}));
 await page.screenshot({path:output+'/overlay-desktop.png',fullPage:true});
 await page.getByLabel('Mostrar cajas',{exact:true}).uncheck();
 await page.waitForFunction(()=>document.querySelector('[data-detection-overlay="little1"]')?.dataset.boxes==='0');
 const hidden=await canvas.evaluate(c=>{const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return !data.some((value,index)=>index%4===3&&value>0);});
 assert(hidden,'The transparent layer clears when hidden');
 await page.waitForTimeout(800);result.hidden=await sample();
 assert(result.hidden.time>result.initial.time);assert(result.hidden.sameVideo);
 await page.getByLabel('Mostrar cajas',{exact:true}).check();
 await page.waitForFunction(()=>Number(document.querySelector('[data-detection-overlay="little1"]')?.dataset.boxes)>0);
 await video.evaluate(v=>v.pause());await page.waitForTimeout(200);const pause=await sample();
 await page.waitForTimeout(1300);const paused=await sample();
 assert(Math.abs(paused.time-pause.time)<.02);assert.equal(paused.segment,pause.segment);
 assert(Math.abs(paused.offset-pause.offset)<.02);assert(paused.boxes>0);
 result.pause=paused;
 result.seekRequest=await video.evaluate(v=>{
  const before=v.currentTime,seekableStart=v.seekable.start(0),bufferedStart=v.buffered.start(0);
  const target=Math.max(bufferedStart+.1,v.currentTime-1);
  v.currentTime=target;return{before,seekableStart,bufferedStart,target};
 });
 await page.waitForFunction(()=>{const v=document.querySelector('video[data-live-video="little1"]');return !v.seeking&&Number(document.querySelector('[data-detection-overlay="little1"]')?.dataset.boxes)>0;});
 result.seek=await sample();assert(Math.abs(result.seek.time-result.seekRequest.target)<.1);
 assert(result.seek.offset>=result.seek.observation-.0001);assert(result.seek.offset-result.seek.observation<=.281);
 await video.evaluate(v=>v.play());
 await page.getByRole('button',{name:'Volver al directo',exact:true}).click();
 await page.waitForFunction(()=>Number(document.querySelector('[data-detection-overlay="little1"]')?.dataset.boxes)>0);
 await page.getByRole('combobox',{name:'Filtrar detecciones de Little Caesars 1'}).selectOption('vehicles');
 await page.waitForFunction(()=>Number(document.querySelector('[data-detection-overlay="little1"]')?.dataset.boxes)>0);
 assert((await sample()).sameVideo);
 await page.getByRole('combobox',{name:'Filtrar detecciones de Little Caesars 1'}).selectOption('all');
 await page.waitForFunction(()=>Number(document.querySelector('[data-detection-overlay="little1"]')?.dataset.boxes)>0);
 await page.getByRole('button',{name:'Ampliar Little Caesars 1',exact:true}).click();
 await page.waitForFunction(()=>document.fullscreenElement?.contains(document.querySelector('[data-detection-overlay="little1"]')));
 await page.waitForTimeout(500);result.fullscreen=await sample();assert(result.fullscreen.boxes>0);
 await page.screenshot({path:output+'/overlay-fullscreen.png'});
 await page.evaluate(()=>document.exitFullscreen());
 await page.setViewportSize({width:390,height:844});await video.scrollIntoViewIfNeeded();
 await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 result.mobile=await sample();assert(result.mobile.boxes>0);
 await page.screenshot({path:output+'/overlay-mobile.png',fullPage:true});
 await page.setViewportSize({width:1500,height:1000});await video.scrollIntoViewIfNeeded();
 for(let i=0;i<12;i++){
  await page.waitForTimeout(1000);const s=await sample();result.samples.push(s);
  if(s.boxes>0){assert(s.offset>=s.observation-.0001);assert(s.offset-s.observation<=.281);}
 }
 assert(result.samples.filter(row=>row.boxes>0).length>=8,'Boxes remain matched across HLS segment boundaries');
 assert(result.samples.at(-1).frames>result.samples[0].frames+150);
 result.distinctSegments=[...new Set(result.samples.map(row=>row.segment).filter(Boolean))];
 assert(result.distinctSegments.length>=3);
 // A browser-side disconnect affects only this fixture client. The production
 // receiver and all other viewers continue without any network mutations.
 await context.setOffline(true);await page.waitForTimeout(1800);await context.setOffline(false);
 await page.waitForFunction(()=>Number(document.querySelector('[data-detection-overlay="little1"]')?.dataset.boxes)>0,null,{timeout:30000});
 result.reconnected=await sample();assert(result.reconnected.sameVideo);
 assert.deepEqual(result.errors,[]);
 await page.getByRole('button',{name:'Salir',exact:true}).click();
 await page.getByRole('link',{name:'Entrar con Zitadel'}).waitFor();
 assert.equal((await context.request.get(origin+'/edge/api/live/detections')).status(),401);
 result.finished=new Date().toISOString();result.logout=true;
 await writeFile(output+'/overlay-browser.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({event:'live_overlay_browser_pass',segments:result.distinctSegments,errors:result.errors}));
}catch(error){
 result.failure=String(error);
 if(page){result.currentText=await page.locator('body').innerText().catch(()=>null);await page.screenshot({path:output+'/overlay-failed.png',fullPage:true}).catch(()=>{});
 result.debug=await page.evaluate(()=>({hls:window.__hls?.map(h=>({url:h.url,mediaTime:h.media?.currentTime,frag:h.streamController?.fragPlaying?.url,
  startPTS:h.streamController?.fragPlaying?.startPTS,streams:h.streamController?.fragPlaying?.elementaryStreams,
  details:h.latestLevelDetails?.fragments?.slice(-3).map(f=>({url:f.url,start:f.start,startPTS:f.startPTS,streams:f.elementaryStreams}))}))})).catch(()=>null);}
 await writeFile(output+'/overlay-browser-failed.json',JSON.stringify(result,null,2)+'\n');throw error;
}finally{await browser.close();}
