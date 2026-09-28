import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('/home/paal/tmp-codex-test/worktrees/wheel-dev-guide/node_modules/playwright');
const origin = process.env.EDGE_TEST_ORIGIN ?? 'https://127.0.0.1:8562';
const output = process.env.EDGE_EVIDENCE_DIR;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/opt/google/chrome/chrome', args: [
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  '--use-file-for-fake-audio-capture=/home/paal/tmp-codex-test/senttra-voice-controls-20260928/voice-smoke-input.wav',
] });
const evidence = { started: new Date().toISOString(), errors: [], jobs: [] };
let page;
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, permissions: ['microphone'], viewport: { width: 1440, height: 1000 } });
  page = await context.newPage();
  page.on('pageerror', error => evidence.errors.push(error.message));
  page.on('response', async response => {
    if (/\/history\/chat\/[0-9a-f]{32}$/.test(new URL(response.url()).pathname)) {
      const value = await response.json().catch(() => null);
      if (value?.status === 'complete' || value?.status === 'failed') evidence.jobs.push({ transcript: value.transcript, status: value.status, tool: value.tool, reply: value.reply, error: value.error, action: value.action, audio: !!value.audio_url });
    }
  });
  await page.goto(origin + '/edge');
  await page.getByRole('link', { name: 'Entrar con Zitadel' }).click();
  await page.getByRole('textbox', { name: 'Consulta de cámaras' }).waitFor();
  await page.getByRole('checkbox', { name: 'Responder con voz' }).uncheck();
  const send = async text => {
    await page.getByRole('textbox', { name: 'Consulta de cámaras' }).fill(text);
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent === 'Grabar voz')?.disabled, null, { timeout: 65000 });
  };
  const results = page.locator('[aria-label="Resultados de la consulta"]');
  await send('Mostrame las pailas rojas de este tramo');
  assert.equal(await results.locator('article').count(), 24);
  await send('Solo las de Seguros Atlántida');
  assert.equal(await results.locator('article').count(), 14);
  assert((await results.locator('article').allTextContents()).every(text => text.includes('Seguros Atlántida')));
  evidence.refinement = true;
  await page.getByRole('checkbox', { name: 'Responder con voz' }).check();
  await send('Abrí la segunda');
  const player = page.getByRole('region', { name: 'Video del resultado' });
  await player.waitFor();
  await player.getByText('Seguros Atlántida · grabación', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('[data-result-video]')?.readyState >= 3, null, { timeout: 45000 });
  await page.waitForFunction(() => Number(document.querySelector('[data-history-overlay]')?.dataset.boxes) > 0, null, { timeout: 25000 });
  await page.evaluate(() => { window.reviewVideo = document.querySelector('[data-result-video]'); });
  evidence.openSecond = true;
  await page.getByRole('button', { name: 'Grabar voz', exact: true }).click();
  await page.waitForTimeout(4200);
  await page.getByRole('button', { name: /Enviar voz/ }).click();
  await player.getByRole('button', { name: 'Mostrar cajas', exact: true }).waitFor({ timeout: 65000 });
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent === 'Grabar voz')?.disabled, null, { timeout: 65000 });
  assert(await page.evaluate(() => window.reviewVideo === document.querySelector('[data-result-video]')));
  assert.equal(await player.locator('[data-history-overlay]').getAttribute('data-boxes'), '0');
  evidence.microphoneControlsOverlay = true;
  await page.screenshot({ path: output + '/voice-controls-desktop.png' });
  await page.setViewportSize({ width: 390, height: 760 });
  const microphone = await page.getByRole('button', { name: 'Grabar voz', exact: true }).boundingBox();
  assert(microphone && microphone.x >= 0 && microphone.x + microphone.width <= 391);
  await page.screenshot({ path: output + '/voice-controls-mobile.png' });
  await send('Mostrá las cajas');
  await player.getByRole('button', { name: 'Ocultar cajas', exact: true }).waitFor();
  assert(await page.evaluate(() => window.reviewVideo === document.querySelector('[data-result-video]')));
  await send('Cerrá el video del resultado');
  await player.waitFor({ state: 'detached' });
  await send('Solo las de Little Caesars 1');
  assert.equal(await results.locator('article').count(), 0);
  await send('Abrí la segunda');
  assert.equal(await player.count(), 0);
  await page.getByRole('alert').filter({ hasText: /resultado.*lista actual|resultado actual/ }).waitFor();
  evidence.emptyResultsDoNotOpenOldVideo = true;
  await send('Mostrame Little Caesars 1 y ocultá las otras cámaras');
  assert.equal(await page.locator('[data-live-video]').count(), 1);
  assert.equal(await page.locator('[data-live-video]').getAttribute('data-live-video'), 'little1');
  evidence.cameraAction = true;
  assert.deepEqual(evidence.errors, []);
  evidence.finished = new Date().toISOString();
  await writeFile(output + '/voice-controls.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} catch (error) {
  evidence.failure = String(error);
  if (page) { evidence.body = (await page.locator('body').innerText()).slice(0, 7000); await page.screenshot({ path: output + '/voice-controls-failure.png' }).catch(() => {}); }
  await writeFile(output + '/voice-controls-failed.json', JSON.stringify(evidence, null, 2));
  throw error;
} finally { await browser.close(); }
