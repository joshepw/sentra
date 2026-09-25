import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE ?? '/home/paal/tmp-codex-test/worktrees/wheel-dev-guide/node_modules/playwright');
const origin=process.env.EDGE_TEST_ORIGIN ?? 'https://127.0.0.1:8262';
const output=process.env.EDGE_EVIDENCE_DIR ?? '/home/paal/Projects/senttra-live/evidence';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/opt/google/chrome/chrome',args:['--autoplay-policy=no-user-gesture-required']});
const result={started:new Date().toISOString(),errors:[],samples:[]};
try {
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1600,height:1050}});
  const page=await context.newPage();page.on('pageerror',error=>result.errors.push(error.message));
  for(const path of ['/api/live/bootstrap','/api/live/archive?camera=little1','/media/live/little1/index.m3u8']) {
    assert.equal((await context.request.get(origin+'/edge'+path)).status(),401);
  }
  await page.goto(origin+'/edge/live');
  await page.getByRole('link',{name:'Entrar con Zitadel'}).click();
  await page.waitForURL(origin+'/edge/live');
  const expected=Number(process.env.LIVE_EXPECTED_CAMERAS ?? 2);
  await page.waitForFunction(count=>document.querySelectorAll('video[data-live-video]').length===count,expected);
  await page.waitForFunction(()=>[...document.querySelectorAll('video[data-live-video]')].every(v=>v.readyState>=3&&!v.paused&&v.currentTime>1),null,{timeout:60000});
  const read=()=>page.locator('video[data-live-video]').evaluateAll(list=>list.map(v=>({camera:v.dataset.liveVideo,time:v.currentTime,ready:v.readyState,paused:v.paused,width:v.videoWidth,height:v.videoHeight,frames:v.getVideoPlaybackQuality().totalVideoFrames,dropped:v.getVideoPlaybackQuality().droppedVideoFrames})));
  result.initial=await read();console.log(JSON.stringify({event:'two_cameras_playing',cameras:result.initial}));
  await page.screenshot({path:output+'/continuous-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Seleccionar Little Caesars 1 en el mapa',exact:true}).click();
  await page.getByRole('button',{name:'Cámara seleccionada',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('video[data-live-video]').length===1);
  assert.equal((await read())[0].camera,'little1');
  await page.getByRole('button',{name:'Historial',exact:true}).click();
  await page.waitForFunction(()=>{const v=document.querySelector('[data-history-video]');return v?.readyState>=3&&v.currentTime>1;},null,{timeout:30000});
  const history=await page.locator('[data-history-video]').evaluate(v=>({url:v.getAttribute('src'),duration:v.duration,time:v.currentTime}));
  assert(history.duration>30);
  const range=await context.request.get(origin+history.url,{headers:{Range:'bytes=0-127'}});
  assert.equal(range.status(),206);assert.equal((await range.body()).length,128);
  assert.equal(await page.getByRole('link',{name:'Descargar tramo'}).getAttribute('href'),history.url);
  const rows=await (await context.request.get(origin+'/edge/api/live/archive?camera=little1')).json();
  const segment=rows.segments.at(-1);
  const target=Math.ceil(segment.started/60)*60;
  const input=new Date((target-6*3600)*1000).toISOString().slice(0,16);
  await page.getByLabel('Fecha y hora').fill(input);
  await page.getByRole('button',{name:'Buscar hora',exact:true}).click();
  await page.waitForFunction(id=>document.querySelector('[data-history-video]')?.getAttribute('src')?.includes(id),segment.id);
  await page.waitForFunction(offset=>{const v=document.querySelector('[data-history-video]');return v?.readyState>=2&&Math.abs(v.currentTime-offset)<5;},target-segment.started);
  result.history={...history,searched:input,range:206,download:true};
  await page.screenshot({path:output+'/continuous-history.png',fullPage:true});
  await page.getByRole('button',{name:'En vivo',exact:true}).click();
  await page.getByRole('button',{name:'Todas',exact:true}).click();
  await page.waitForFunction(count=>[...document.querySelectorAll('video[data-live-video]')].length===count,expected);
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:output+'/continuous-mobile.png',fullPage:true});
  await page.setViewportSize({width:1600,height:1050});
  const state=await (await context.request.get(origin+'/edge/api/live/bootstrap')).json();
  const stopped=structuredClone(state);stopped.cameras[0].receiving=false;
  await page.route('**/edge/api/live/bootstrap',route=>route.fulfill({json:stopped}));
  await page.locator(`[data-live-camera="${stopped.cameras[0].key}"]`).getByText('Sin señal',{exact:true}).waitFor({timeout:15000});
  await page.unroute('**/edge/api/live/bootstrap');
  await page.waitForFunction(()=>[...document.querySelectorAll('video[data-live-video]')].every(v=>v.readyState>=3&&!v.paused&&v.currentTime>1),null,{timeout:45000});
  result.stoppedSignalAndRecovery=true;result.mobileOverflow=false;
  const duration=Number(process.env.LIVE_WATCH_SECONDS ?? 60),started=Date.now();
  console.log(JSON.stringify({event:'interactive_checks_passed',watch_seconds:duration}));
  while(Date.now()-started<duration*1000) {
    await page.waitForTimeout(Math.min(10000,Math.max(1,duration*1000-(Date.now()-started))));
    const cameras=await read();assert.equal(cameras.length,expected,'All selected cameras remain mounted');
    for(const camera of cameras){
      assert.equal(camera.paused,false,`${camera.camera} keeps playing`);
      const previous=result.samples.at(-1)?.cameras.find(row=>row.camera===camera.camera);
      if(previous)assert(camera.frames>previous.frames,`${camera.camera} delivers frames during every sample interval`);
    }
    result.samples.push({seconds:(Date.now()-started)/1000,cameras});
    await writeFile(output+'/continuous-browser-progress.json',JSON.stringify({...result,watchSeconds:(Date.now()-started)/1000},null,2)+'\n');
    if(result.samples.length%6===0)console.log(JSON.stringify({event:'browser_progress',seconds:Math.round((Date.now()-started)/1000),cameras:result.samples.at(-1).cameras}));
  }
  result.watchSeconds=(Date.now()-started)/1000;
  result.final=await read();
  await page.getByRole('button',{name:'Salir',exact:true}).click();await page.getByRole('link',{name:'Entrar con Zitadel'}).waitFor();
  assert.equal((await context.request.get(origin+'/edge/api/live/bootstrap')).status(),401);
  assert.equal((await context.request.get(origin+history.url)).status(),401);
  assert.deepEqual(result.errors,[]);result.logout=true;result.finished=new Date().toISOString();
  await writeFile(output+'/continuous-browser.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({event:'continuous_browser_complete',watch_seconds:result.watchSeconds,errors:result.errors}));
} catch(error) {
  result.failure=String(error);await writeFile(output+'/continuous-browser-failed.json',JSON.stringify(result,null,2)+'\n');throw error;
} finally {await browser.close();}
