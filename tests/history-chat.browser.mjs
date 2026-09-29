import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE ?? '/home/paal/tmp-codex-test/worktrees/wheel-dev-guide/node_modules/playwright');
const origin=process.env.EDGE_TEST_ORIGIN ?? 'https://127.0.0.1:8462';
const output=process.env.EDGE_EVIDENCE_DIR;await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/opt/google/chrome/chrome',args:['--autoplay-policy=no-user-gesture-required','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',`--use-file-for-fake-audio-capture=${process.env.HISTORY_TEST_VOICE}`]});
const evidence={started:new Date().toISOString(),errors:[]};
try {
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1500,height:1000},permissions:['microphone']});
 const page=await context.newPage();page.on('pageerror',error=>evidence.errors.push(error.message));
 for(const path of ['/api/history/coverage','/api/history/search','/api/history/frames','/media/history/voice/'+'a'.repeat(32)+'.wav','/media/history/thumbs/'+'a'.repeat(24)+'.jpg'])assert.equal((await context.request.get(origin+'/edge'+path)).status(),401);
 await page.goto(origin+'/edge');await page.getByRole('link',{name:'Entrar con Zitadel'}).click();
 await page.waitForURL(origin+'/edge/live');await page.getByRole('textbox',{name:'Consulta de cámaras'}).waitFor();
 const coverage=await (await context.request.get(origin+'/edge/api/history/coverage')).json();assert(coverage.runs.length>0);
 await page.getByLabel('Consulta de cámaras').fill('Mostrame las pailas rojas desde 2026-09-26T19:02:11-06:00 hasta 2026-09-26T21:02:05-06:00');await page.getByRole('button',{name:'Enviar',exact:true}).click();
 await page.getByRole('button',{name:'Ver video',exact:true}).first().waitFor({timeout:90000});
 await page.waitForFunction(()=>{const a=document.querySelector('audio');return a?.readyState>=2&&a.currentTime>0;},null,{timeout:120000});
 const countBefore=await page.locator('article').count();assert(countBefore>0);
 evidence.cards=countBefore;evidence.voiceAutoplay=await page.locator('audio').last().evaluate(a=>({playing:!a.paused,duration:a.duration,currentTime:a.currentTime}));
 if(await page.getByRole('button',{name:'Ver más resultados',exact:true}).count()){
  await page.getByRole('button',{name:'Ver más resultados',exact:true}).click();await page.waitForFunction(n=>document.querySelectorAll('article').length>n,countBefore);evidence.pagination=true;
 }
 await page.getByRole('button',{name:'Ver video',exact:true}).first().click();
 await page.waitForFunction(()=>{const v=document.querySelector('[data-result-video]'),c=document.querySelector('[data-history-overlay]');return v?.readyState>=3&&v.currentTime>0&&Number(c?.dataset.boxes)>0;},null,{timeout:45000});
 const overlay=await page.locator('[data-history-overlay]').evaluate(c=>({...c.dataset}));assert(Number(overlay.observation)<=Number(overlay.time)+.0001);assert(Number(overlay.time)-Number(overlay.observation)<=.28);
 evidence.overlay=overlay;
 const videoUrl=await page.locator('[data-result-video]').getAttribute('src');
 const range=await context.request.get(origin+videoUrl,{headers:{Range:'bytes=0-127'}});assert.equal(range.status(),206);assert.equal((await range.body()).length,128);
 await page.locator('[data-result-video]').evaluate(v=>{v.pause();v.currentTime+=1;});
 await page.waitForTimeout(500);const paused=await page.locator('[data-history-overlay]').evaluate(c=>({...c.dataset}));assert(Number(paused.observation)<=Number(paused.time)+.0001);evidence.seekPause=true;
 await page.getByRole('button',{name:'Ocultar cajas',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-history-overlay]')?.dataset.boxes==='0');
 await page.getByRole('button',{name:'Mostrar cajas',exact:true}).click();await page.waitForFunction(()=>Number(document.querySelector('[data-history-overlay]')?.dataset.boxes)>0);
 await page.screenshot({path:output+'/history-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Cerrar video',exact:true}).click();
 await page.getByRole('button',{name:'Otras cámaras',exact:true}).first().click();
 await page.getByText(/Sugerencias de apariencia/).waitFor({timeout:30000});evidence.visualCandidates=true;
 await page.getByLabel('Consulta de cámaras').fill('Mostrame los cruces en rojo desde 2026-09-26T19:02:11-06:00 hasta 2026-09-26T21:02:05-06:00');await page.getByRole('button',{name:'Enviar',exact:true}).click();await page.locator('[aria-live="polite"]').filter({hasText:/incidencias con esos filtros/}).waitFor({timeout:90000});
 await page.waitForFunction(()=>!document.querySelector('input#history-question')?.disabled&&[...document.querySelectorAll('button')].find(b=>b.textContent==='Grabar voz')?.disabled===false,null,{timeout:120000});
 const events=await (await context.request.get(origin+'/edge/api/history/incidents')).json();
 if(events.items.length){
  await page.getByRole('button',{name:'Ver video',exact:true}).first().click();await page.locator('[aria-label="Video del resultado"] summary').click();await page.getByRole('button',{name:'Descartar',exact:true}).click();await page.locator('[aria-label="Video del resultado"] summary').filter({hasText:'Descartada en revisión'}).waitFor();
  const checked=await (await context.request.get(origin+'/edge/api/history/incidents')).json();assert.equal(checked.items[0].review,'dismissed');evidence.reviewFixtureOnly=true;
 }
 await page.getByRole('button',{name:'Cerrar video',exact:true}).click();
 await page.getByRole('checkbox',{name:'Responder con voz'}).uncheck();
 await page.getByRole('button',{name:'Grabar voz',exact:true}).click();await page.getByRole('button',{name:/Enviar voz/}).waitFor();await page.waitForTimeout(4800);const submittedVoice=page.waitForResponse(response=>new URL(response.url()).pathname==='/edge/api/history/chat'&&response.request().method()==='POST');await page.getByRole('button',{name:/Enviar voz/}).click();await submittedVoice;
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Grabar voz')?.disabled===false,null,{timeout:120000});
 evidence.microphoneTranscript=await page.locator('#history-transcript').textContent();assert.match(evidence.microphoneTranscript,/pailas rojas/i);
 await page.getByLabel('Consulta de cámaras').fill('Mostrame todas las pailas rojas ayer de 1 a 2pm');await page.getByRole('button',{name:'Enviar',exact:true}).click();
 await page.locator('[aria-live="polite"]').filter({hasText:/Todavía no hay detecciones indexadas para ese horario/}).waitFor({timeout:90000});evidence.explicitDateNoCoverage=true;
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);evidence.mobileOverflow=false;
 await page.screenshot({path:output+'/history-mobile.png',fullPage:true});
 const bootstrap=await (await context.request.get(origin+'/edge/api/live/bootstrap')).json();
 const mcp=await context.request.post(origin+'/edge/api/history/mcp',{headers:{Origin:origin,'X-CSRF-Token':bootstrap.user.csrf},data:{jsonrpc:'2.0',id:1,method:'tools/list'}});assert.equal(mcp.status(),200);assert.equal((await mcp.json()).result.tools.length,6);evidence.mcp=true;
 await page.getByRole('button',{name:'Salir',exact:true}).click();await page.getByRole('link',{name:'Entrar con Zitadel'}).waitFor();assert.equal((await context.request.get(origin+videoUrl)).status(),401);assert.equal((await context.request.get(origin+'/edge/api/history/coverage')).status(),401);
 evidence.logout=true;assert.deepEqual(evidence.errors,[]);evidence.finished=new Date().toISOString();await writeFile(output+'/history-browser.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
} catch(error){evidence.failure=String(error);await writeFile(output+'/history-browser-failed.json',JSON.stringify(evidence,null,2)+'\n');throw error;} finally {await browser.close();}
