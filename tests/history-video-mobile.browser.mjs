import {createRequire} from 'node:module';
import {mkdir, writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE ?? '/home/paal/tmp-codex-test/worktrees/wheel-dev-guide/node_modules/playwright');
const origin=process.env.EDGE_TEST_ORIGIN ?? 'https://127.0.0.1:8462';
const output=process.env.EDGE_EVIDENCE_DIR;
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/opt/google/chrome/chrome'});
const evidence={started:new Date().toISOString(),errors:[]};
try{
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:393,height:710},isMobile:true,hasTouch:true});
 const page=await context.newPage();page.on('pageerror',error=>evidence.errors.push(error.message));
 await page.goto(origin+'/edge');await page.getByRole('link',{name:'Entrar con Zitadel'}).tap();
 await page.getByRole('textbox',{name:'Consulta de cámaras'}).waitFor();
 await page.getByRole('checkbox',{name:'Responder con voz'}).uncheck();
 await page.getByRole('button',{name:'Pailas rojas',exact:true}).tap();
 const results=page.locator('[aria-label="Resultados de la consulta"]');
 const buttons=results.getByRole('button',{name:'Ver video',exact:true});
 await buttons.nth(5).waitFor({timeout:90000});
 const player=page.getByRole('region',{name:'Video del resultado'});
 const insideViewport=async locator=>locator.evaluate(element=>{
  const r=element.getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=0&&r.left>=0&&r.bottom<=innerHeight+.5&&r.right<=innerWidth+.5;
 });
 await buttons.nth(4).scrollIntoViewIfNeeded();
 const scrollBefore=await results.locator('[data-result-list]').evaluate(element=>element.scrollTop);
 await buttons.nth(4).tap();
 await player.waitFor();assert(await insideViewport(player),'Player must open inside the phone viewport');
 assert(await insideViewport(player.getByRole('button',{name:'Cerrar video',exact:true})));
 await page.waitForFunction(()=>{const v=document.querySelector('[data-result-video]');return v?.readyState>=3&&!v.paused&&v.currentTime>0;},null,{timeout:45000});
 assert(await insideViewport(player.locator('video')),'Video must be visible without scrolling');
 await page.waitForFunction(()=>Number(document.querySelector('[data-history-overlay]')?.dataset.boxes)>0,null,{timeout:30000});
 evidence.mobileVisible=true;evidence.autoplayWithoutBrowserOverride=true;
 await page.screenshot({path:output+'/video-mobile-visible.png'});
 await player.getByRole('button',{name:'Cerrar video',exact:true}).tap();await player.waitFor({state:'detached'});
 assert(Math.abs(await results.locator('[data-result-list]').evaluate(element=>element.scrollTop)-scrollBefore)<2,'Closing must keep the results scroll position');
 assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
 const expectedTitle=await results.locator('article').nth(5).locator('p').nth(1).innerText();
 await buttons.nth(5).tap();await player.waitFor();
 await player.getByText(expectedTitle+' · grabación',{exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('[data-result-video]')?.readyState>=3,null,{timeout:30000});
 assert(await insideViewport(player));evidence.reopenOtherResult=true;
 await player.getByRole('button',{name:'Cerrar video',exact:true}).tap();await player.waitFor({state:'detached'});
 evidence.inlineClose=true;
 // Slow and failed requests must be visible immediately in the same player.
 await page.route('**/edge/api/live/archive?**',async route=>{
  await new Promise(resolve=>setTimeout(resolve,1200));
  await route.fulfill({status:503,contentType:'application/json',body:'{}'});
 });
 await buttons.nth(4).tap();await player.getByText('Abriendo video…',{exact:true}).waitFor();
 assert(await insideViewport(player.getByText('Abriendo video…',{exact:true})));
 await player.getByText('No se pudo abrir la grabación.',{exact:true}).waitFor();
 assert(await insideViewport(player.getByText('No se pudo abrir la grabación.',{exact:true})));
 await player.getByRole('button',{name:'Cerrar video',exact:true}).tap();await player.waitFor({state:'detached'});
 await page.unroute('**/edge/api/live/archive?**');evidence.visibleLoadingAndError=true;
 // Keep an explicit play action when a mobile browser refuses autoplay.
 await page.evaluate(()=>{
  window.originalVideoPlay=HTMLMediaElement.prototype.play;
  window.originalSetAttribute=Element.prototype.setAttribute;
  Element.prototype.setAttribute=function(name,value){
   if(this instanceof HTMLVideoElement&&name.toLowerCase()==='autoplay')return;
   return window.originalSetAttribute.call(this,name,value);
  };
  HTMLMediaElement.prototype.play=function(){this.autoplay=false;this.pause();return Promise.reject(new DOMException('Autoplay blocked','NotAllowedError'));};
 });
 await buttons.nth(4).tap();await player.getByRole('button',{name:'Reanudar',exact:true}).waitFor({timeout:30000});
 await player.locator('video').evaluate(v=>v.pause());
 await page.evaluate(()=>{
  HTMLMediaElement.prototype.play=window.originalVideoPlay;delete window.originalVideoPlay;
  Element.prototype.setAttribute=window.originalSetAttribute;delete window.originalSetAttribute;
 });
 await player.getByRole('button',{name:'Reanudar',exact:true}).tap();
 await page.waitForFunction(()=>document.querySelector('[data-result-video]')?.paused===false);
 evidence.manualPlayFallback=true;
 await page.setViewportSize({width:844,height:390});
 assert(await insideViewport(player.getByRole('button',{name:'Cerrar video',exact:true})));evidence.landscapeCloseVisible=true;
 await player.getByRole('button',{name:'Cerrar video',exact:true}).tap();
 await page.setViewportSize({width:1500,height:1000});
 await buttons.first().click();await player.waitFor();
 assert(await insideViewport(player));evidence.desktopVisible=true;
 await page.screenshot({path:output+'/video-desktop-visible.png'});
 await player.getByRole('button',{name:'Cerrar video',exact:true}).click();
 assert.deepEqual(evidence.errors,[]);evidence.finished=new Date().toISOString();
 await writeFile(output+'/video-mobile.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
}catch(error){evidence.failure=String(error);await writeFile(output+'/video-mobile-failed.json',JSON.stringify(evidence,null,2)+'\n');throw error;}
finally{await browser.close();}
