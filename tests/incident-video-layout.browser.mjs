import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = process.env.EDGE_TEST_ORIGIN ?? 'http://127.0.0.1:8262';
const output = process.env.EDGE_EVIDENCE_DIR ?? 'test-artifacts/incident-video-layout';
assert(process.env.EDGE_TEST_VIDEO, 'EDGE_TEST_VIDEO must be a decodable 60-second MP4 fixture');
const bytes = await readFile(process.env.EDGE_TEST_VIDEO);
await mkdir(output, { recursive: true });
const started = Date.parse('2026-09-30T03:22:00-06:00') / 1000;
const items = Array.from({ length: 30 }, (_, index) => {
  const uid = (index + 1).toString(16).padStart(24, '0');
  return { uid, camera: 'seguros', title: 'Seguros Atlántida', kind: 'uturn', review: 'candidate', at: started + 14,
    playback: { camera: 'seguros', at: started + 14, run_id: 'fixture', incident_uid: uid } };
});
const result = { total: items.length, counting: 'candidate_events', items,
  filters: { kind: 'uturn', start: started - 24870, end: started + 61530 } };
const evidence = { checks: [], errors: [] };
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/google/chrome/chrome' });
let page;

async function fixture(viewport) {
  const context = await browser.newContext({ viewport, isMobile: viewport.width < 1024, hasTouch: true, serviceWorkers: 'block' });
  const current = await context.newPage();
  current.on('pageerror', error => evidence.errors.push(error.message));
  // The published bundle can be tested without a real login, camera request or review write.
  await current.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await current.route('**/edge/auth/**', route => route.abort());
  await current.route('**/edge/media/**', route => route.abort());
  await current.route('**/incident-layout-fixture.mp4', route => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? '');
    const start = range ? Number(range[1]) : 0;
    const end = Math.min(range?.[2] ? Number(range[2]) : bytes.length - 1, bytes.length - 1);
    return route.fulfill({ status: range ? 206 : 200, contentType: 'video/mp4', body: bytes.subarray(start, end + 1),
      headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } : {}) } });
  });
  await current.route('**/senttra/hls.min.js', route => route.fulfill({ contentType: 'application/javascript',
    body: 'window.Hls = class { static isSupported() { return false; } };' }));
  await current.route('**/edge/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body;
    if (path.endsWith('/live/bootstrap')) body = { cameras: [{ key: 'seguros', title: 'Seguros Atlántida', receiving: false,
      url: '/unused.m3u8' }], user: { csrf: 'fixture-only' }, storage: {} };
    else if (path.endsWith('/history/coverage')) body = { runs: [] };
    else if (path.endsWith('/history/chat')) body = { id: 'a'.repeat(32), status: 'complete', phase: 'complete', result };
    else if (path.endsWith('/live/archive')) body = { segments: [{ id: 'b'.repeat(24), started, ended: started + 60,
      state: 'ok', url: '/incident-layout-fixture.mp4' }], gaps: [] };
    else if (path.endsWith('/history/frames')) body = { frames: [], focus: null };
    await route.fulfill({ status: body ? 200 : 404, json: body ?? {} });
  });
  await current.goto(origin + '/edge');
  await current.getByRole('button', { name: 'Silenciar voz', exact: true }).click();
  await current.getByRole('textbox', { name: 'Consulta de cámaras' }).fill('Mostrar las vueltas en U');
  await current.getByRole('button', { name: 'Enviar', exact: true }).click();
  await current.getByRole('heading', { name: '30 incidencias', exact: true }).waitFor();
  return { context, page: current };
}

async function measure(label) {
  const measurement = await page.locator('[data-result-video]').evaluate(video => {
    const box = video.getBoundingClientRect();
    let top = Math.max(0, box.top), bottom = Math.min(innerHeight, box.bottom);
    for (let element = video.parentElement; element; element = element.parentElement) {
      if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(element).overflowY)) {
        const parent = element.getBoundingClientRect();
        top = Math.max(top, parent.top); bottom = Math.min(bottom, parent.bottom);
      }
    }
    return { height: box.height, width: box.width, visibleHeight: Math.max(0, bottom - top),
      ready: video.readyState, mediaWidth: video.videoWidth, mediaHeight: video.videoHeight,
      time: video.currentTime, paused: video.paused, horizontalOverflow: document.documentElement.scrollWidth > innerWidth };
  });
  evidence.checks.push({ label, ...measurement });
  assert(measurement.height >= 120 && measurement.visibleHeight >= 120,
    `The incident must show a usable video image: ${JSON.stringify(measurement)}`);
  assert(!measurement.horizontalOverflow, 'The phone must not overflow horizontally');
  assert(measurement.ready >= 2 && measurement.mediaWidth > 0, 'The visible element must contain decoded video');
  return measurement;
}

try {
  for (const viewport of [{ width: 393, height: 668 }, { width: 320, height: 568 }, { width: 844, height: 390 }, { width: 1280, height: 900 }]) {
    const active = await fixture(viewport); page = active.page;
    const results = page.getByRole('complementary', { name: 'Resultados de la consulta' });
    const card = results.locator('[data-result-number="4"]');
    await card.getByRole('button', { name: 'Ver video', exact: true }).click();
    const player = page.getByRole('region', { name: 'Video del resultado' });
    await page.waitForFunction(() => {
      const video = document.querySelector('[data-result-video]');
      return video?.readyState >= 2 && !video.paused && video.currentTime > 2.2;
    });
    await page.screenshot({ path: `${output}/${viewport.width}x${viewport.height}.png` });
    const before = await measure(`${viewport.width}x${viewport.height} incident`);
    await page.waitForFunction(time => document.querySelector('[data-result-video]')?.currentTime > time + .3, before.time);
    await player.locator('summary').click();
    await player.getByRole('button', { name: 'Confirmar incidencia', exact: true }).waitFor();
    await page.locator('[data-result-video]').scrollIntoViewIfNeeded();
    await measure(`${viewport.width}x${viewport.height} expanded review`);
    await player.getByRole('button', { name: 'Cerrar video', exact: true }).click();
    assert.equal(await page.locator('[data-result-video]').count(), 0);
    await results.locator('[data-result-number="5"]').getByRole('button', { name: 'Ver video', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-result-video]')?.readyState >= 2);
    await measure(`${viewport.width}x${viewport.height} next incident`);
    const composer = await page.getByRole('textbox', { name: 'Consulta de cámaras' }).boundingBox();
    assert(composer && composer.y >= 0 && composer.y + composer.height <= viewport.height + 1, 'The composer remains on screen');
    await active.context.close(); page = null;
  }
  assert.deepEqual(evidence.errors, []);
  await writeFile(`${output}/result.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} catch (error) {
  evidence.failure = String(error);
  await page?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  await writeFile(`${output}/failure.json`, JSON.stringify(evidence, null, 2));
  throw error;
} finally { await browser.close(); }
