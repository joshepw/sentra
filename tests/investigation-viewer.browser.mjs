import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('/home/paal/tmp-codex-test/worktrees/wheel-dev-guide/node_modules/playwright');
const origin = process.env.EDGE_TEST_ORIGIN ?? 'https://127.0.0.1:8662';
const output = process.env.EDGE_EVIDENCE_DIR;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/opt/google/chrome/chrome', args: [
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  `--use-file-for-fake-audio-capture=${process.env.HISTORY_TEST_VOICE}`,
] });
const evidence = { started: new Date().toISOString(), errors: [], jobs: [] };
let page;
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, permissions: ['microphone'], viewport: { width: 1440, height: 1000 } });
  page = await context.newPage();
  page.on('pageerror', error => evidence.errors.push(error.message));
  page.on('response', async response => {
    if (/\/history\/chat\/[0-9a-f]{32}(\/applied)?$/.test(new URL(response.url()).pathname)) {
      const value = await response.json().catch(() => null);
      if (value?.status === 'complete' || value?.status === 'failed') evidence.jobs.push({ transcript: value.transcript, status: value.status, tool: value.tool, reply: value.reply, error: value.error, action: value.action, action_status: value.action_status, audio: !!value.audio_url });
    }
  });
  await page.goto(origin + '/edge');
  await page.getByRole('link', { name: 'Entrar con Zitadel' }).click();
  await page.getByRole('textbox', { name: 'Consulta de cámaras' }).waitFor();
  await page.getByRole('button', { name: 'Silenciar voz', exact: true }).click();
  const idle = () => page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent === 'Grabar voz')?.disabled, null, { timeout: 65000 });
  const send = async text => {
    await page.getByRole('textbox', { name: 'Consulta de cámaras' }).fill(text);
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    await idle();
  };
  const ready = () => page.waitForFunction(() => document.querySelector('[data-result-video]')?.readyState >= 3, null, { timeout: 45000 });
  const results = page.getByRole('complementary', { name: 'Resultados de la consulta' });
  await send('Mostrame las pailas rojas desde 2026-09-26T19:02:11-06:00 hasta 2026-09-26T21:02:05-06:00');
  assert.equal(await results.locator('article').count(), 24);
  await results.locator('article').nth(23).getByRole('button', { name: 'Ver video', exact: true }).click();
  await send('Siguiente resultado');
  assert.equal(await results.locator('article').count(), 48);
  assert.equal(await results.locator('[aria-current="true"]').getAttribute('data-result-number'), '25');
  evidence.nextPage = true;
  await send('Solo las de Seguros Atlántida');
  assert.equal(await results.locator('article').count(), 14);
  await send('Abrí la segunda');
  await ready();
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.getByRole('tab', { name: 'Resultados', exact: true }).click();
  assert.equal(await results.locator('[aria-current="true"]').getAttribute('data-result-number'), '2');
  const video = page.locator('[data-result-video]');
  const beforeScroll = await video.boundingBox();
  await results.locator('[data-result-list]').evaluate(element => { element.scrollTop = element.scrollHeight; });
  assert.deepEqual(await video.boundingBox(), beforeScroll);
  evidence.independentScroll = true;
  await page.getByRole('button', { name: 'Siguiente resultado', exact: true }).click();
  assert.equal(await results.locator('[aria-current="true"]').getAttribute('data-result-number'), '3');
  await send('Anterior resultado');
  assert.equal(await results.locator('[aria-current="true"]').getAttribute('data-result-number'), '2');
  await ready();
  await page.getByRole('button', { name: 'Activar voz', exact: true }).click();
  await page.getByRole('button', { name: 'Grabar voz', exact: true }).click();
  await page.waitForTimeout(3500);
  const submittedVoice = page.waitForResponse(response => new URL(response.url()).pathname === '/edge/api/history/chat' && response.request().method() === 'POST');
  await page.getByRole('button', { name: /Enviar voz/ }).click();
  await submittedVoice;
  await idle();
  assert(await video.evaluate(element => element.paused));
  assert(evidence.jobs.some(job => job.tool === 'controlar_video' && job.action?.operation === 'pause' && job.action_status === 'applied' && job.audio));
  evidence.microphonePause = true;
  const crossing = await video.evaluate(async element => {
    const started = Number(element.dataset.started);
    const segments = await fetch(`/edge/api/live/archive?camera=seguros&start=${started - 60}&end=${started + 120}`).then(response => response.json());
    const previous = segments.segments.find(row => row.started < started && Math.abs(row.ended - started) < .15);
    if (!previous) throw new Error('Representative recording has no contiguous previous segment');
    element.pause(); element.currentTime = 3;
    await new Promise(resolve => element.addEventListener('seeked', resolve, { once: true }));
    return { absolute: started + element.currentTime, segment: element.dataset.segment, previous: previous.id };
  });
  await page.getByRole('button', { name: 'Silenciar voz', exact: true }).click();
  await send('Retrocedé diez segundos');
  await ready();
  const after = await video.evaluate(element => ({ absolute: Number(element.dataset.started) + element.currentTime, segment: element.dataset.segment, paused: element.paused }));
  assert.equal(after.segment, crossing.previous);
  assert(Math.abs(crossing.absolute - after.absolute - 10) < .2);
  assert(after.paused);
  evidence.pausedSeekAcrossSegments = { before: crossing, after };
  await page.evaluate(() => { window.reviewVideo = document.querySelector('[data-result-video]'); });
  await send('Reanudá el video');
  assert(!(await video.evaluate(element => element.paused)));
  await send('Ocultá las cajas');
  assert(await page.evaluate(() => window.reviewVideo === document.querySelector('[data-result-video]')));
  await page.getByRole('button', { name: 'Mostrar cajas', exact: true }).click();
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await page.getByRole('tab', { name: 'Resultados', exact: true }).click();
  await results.locator('[data-result-list]').evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: output + '/investigation-desktop.png' });
  assert.equal(await page.getByRole('button', { name: /Conversación/i }).count(), 0);
  await page.setViewportSize({ width: 390, height: 760 });
  for (const locator of [video, results, page.getByRole('button', { name: 'Grabar voz', exact: true })]) {
    const box = await locator.boundingBox();
    assert(box && box.x >= 0 && box.x + box.width <= 391 && box.y >= 0 && box.y + box.height <= 761, JSON.stringify(box));
  }
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: output + '/investigation-mobile.png' });
  evidence.mobileFits = true;
  await results.locator('article').last().getByRole('button', { name: 'Ver video', exact: true }).click();
  await send('Siguiente resultado');
  assert.equal(await results.locator('[aria-current="true"]').getAttribute('data-result-number'), '14');
  assert(evidence.jobs.some(job => job.action_status === 'failed' && job.reply?.includes('No hay otro resultado')));
  await send('Solo las de Little Caesars 1');
  assert.equal(await results.locator('article').count(), 0);
  await send('Pausá el video');
  assert.equal(await video.count(), 0);
  assert(evidence.jobs.some(job => job.status === 'failed' && job.error?.includes('Primero abrí')));
  evidence.resultBounds = true;
  assert.deepEqual(evidence.errors, []);
  evidence.finished = new Date().toISOString();
  await writeFile(output + '/investigation-viewer.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} catch (error) {
  evidence.failure = String(error);
  if (page) { evidence.body = (await page.locator('body').innerText()).slice(0, 7000); await page.screenshot({ path: output + '/investigation-failure.png' }).catch(() => {}); }
  await writeFile(output + '/investigation-failed.json', JSON.stringify(evidence, null, 2));
  throw error;
} finally { await browser.close(); }
