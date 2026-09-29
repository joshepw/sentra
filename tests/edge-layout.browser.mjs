import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? '/home/paal/tmp-codex-test/worktrees/wheel-dev-guide/node_modules/playwright');
const origin = process.env.EDGE_TEST_ORIGIN ?? 'http://127.0.0.1:8773';
const output = process.env.EDGE_EVIDENCE_DIR ?? 'test-artifacts/edge-layout';
const videoPath = process.env.EDGE_TEST_VIDEO ?? 'test-artifacts/edge-layout/fixture.mp4';
await mkdir(output, { recursive: true });
const started = Date.parse('2026-09-26T00:00:00-06:00') / 1000, ended = started + 86400;
const cameras = [{ key: 'little', title: 'Little Caesars' }, { key: 'little1', title: 'Little Caesars 1' },
  { key: 'seguros', title: 'Seguros Atlántida' }, { key: 'crowne', title: 'Crowne Plaza' }];
const run = { id: 'layout-fixture', kind: 'archive', title: '26 sep · prueba visual', started, ended, status: 'complete',
  cameras: cameras.map(camera => ({ camera: camera.key, first: started, last: ended, frames: 100 })), totals: { appearances: 1234, with_attributes: 1000 } };
const liveRun = { ...run, id: 'live', kind: 'live', title: 'Actividad actual · prueba visual', ended: null, status: 'running' };
const counts = [95, 40, 30, 40, 100, 160, 1100, 1500, 1450, 1720, 1890, 520, 2130, 1790, 900, 1600, 690, 910, 510, 970, 870, 500, 470, 290];
const browser = await chromium.launch({ headless: true, executablePath: '/opt/google/chrome/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const evidence = { errors: [], viewports: [], fixture: true, trafficRuns: [], queries: [] };
let page;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  page.on('pageerror', error => evidence.errors.push(error.message));
  // Every API/media request is a local browser fixture. No production session,
  // camera connection, history write or model call is used by this check.
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.route('**/fixture-video.mp4', route => route.fulfill({ status: 200, contentType: 'video/mp4', path: videoPath }));
  await page.route('**/senttra/hls.min.js', route => route.fulfill({ contentType: 'application/javascript', body: `
    window.Hls = class {
      static isSupported() { return true; }
      static Events = { ERROR: 'error', FRAG_BUFFERED: 'buffered', FRAG_CHANGED: 'changed' };
      loadSource() {} on() {} destroy() {}
      attachMedia(video) { video.loop = true; video.src = '/fixture-video.mp4'; }
    };
  ` }));
  await page.route('**/edge/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    let body;
    if (path.endsWith('/live/bootstrap')) body = { cameras: cameras.map(camera => ({ ...camera, receiving: true,
      url: `/edge/media/live/${camera.key}/index.m3u8` })), user: { name: 'Layout fixture', csrf: 'fixture-only' }, storage: {} };
    else if (path.endsWith('/history/coverage')) body = { runs: [run, liveRun] };
    else if (path.endsWith('/history/search') || path.endsWith('/history/incidents')) {
      evidence.trafficRuns.push(url.searchParams.get('run_id'));
      const hour = Math.max(0, Math.min(23, Math.floor((Number(url.searchParams.get('start')) - started) / 3600)));
      body = { total: path.endsWith('/search') ? counts[hour] : Math.round(counts[hour] / 140), items: [{}], next_cursor: 'more' };
    } else if (path.endsWith('/history/chat')) {
      evidence.queries.push(route.request().postDataJSON());
      body = { id: 'a'.repeat(32), status: 'complete', phase: 'complete', reply: 'Resultados de la prueba visual.',
      result: { total: 24, counting: 'appearances', items: Array.from({ length: 24 }, (_, index) => ({
        uid: String(index), camera: 'little1', title: 'Little Caesars 1', type: 'paila', color: 'rojo', first: started + index,
        playback: { camera: 'little1', at: started + 5, run_id: run.id, track_uid: String(index) },
      })) } };
    }
    else if (path.endsWith('/live/archive')) body = { segments: [{ id: 'fixture', camera: 'little1', started, ended: started + 8,
      duration: 8, state: 'ok', url: '/fixture-video.mp4' }], gaps: [], truncated: false };
    else if (path.endsWith('/history/frames')) body = { frames: [], focus: null };
    await route.fulfill({ status: body ? 200 : 404, contentType: 'application/json', body: JSON.stringify(body ?? {}) });
  });
  await page.goto(origin + '/edge');
  await page.getByRole('img', { name: /^Apariciones de vehículos/ }).waitFor();
  assert.deepEqual([...new Set(evidence.trafficRuns)], [liveRun.id], 'An archive listed first must not replace current activity');
  await page.waitForFunction(() => document.querySelector('[data-live-video]')?.readyState >= 2);
  const map = page.getByLabel('Mapa del corredor', { exact: true });
  const chart = page.getByLabel('Tráfico por hora', { exact: true });
  const panel = page.getByLabel('Panel de video', { exact: true });
  const composer = page.getByRole('textbox', { name: 'Consulta de cámaras' });
  const rect = async locator => {
    const box = await locator.boundingBox(); assert(box); return box;
  };
  const checkViewport = async (width, height, label) => {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(150);
    const boxes = { map: await rect(map), video: await rect(panel), composer: await rect(composer),
      results: await rect(page.getByRole('complementary', { name: 'Resultados de la consulta' })) };
    assert(boxes.map.y + boxes.map.height <= boxes.video.y + 1);
    for (const [name, box] of Object.entries(boxes)) {
      assert(box.x >= 0 && box.x + box.width <= width + 1 && box.y >= 0 && box.y + box.height <= height + 1, `${label} ${name}: ${JSON.stringify(box)}`);
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1));
    const picture = await rect(page.locator('[data-result-video], [data-live-video]').first());
    assert(picture.height >= 100, `${label}: the visible picture is too short (${picture.height}px)`);
    if (width >= 1024) {
      const graph = await rect(chart);
      assert(graph.x > boxes.map.x + boxes.map.width);
      assert(graph.width < boxes.map.width && graph.height <= 220);
    }
    evidence.viewports.push({ label, width, height, boxes });
    await page.screenshot({ path: `${output}/${label}.png` });
  };
  await checkViewport(1440, 900, 'live-desktop');
  await map.getByRole('button', { name: 'acercar', exact: true }).click();
  const transform = await map.locator('svg > g').getAttribute('transform');
  await page.evaluate(() => { window.originalVideo = document.querySelector('[data-live-video]'); });
  await page.waitForTimeout(5500);
  assert.equal(await map.locator('svg > g').getAttribute('transform'), transform, 'Status polling must preserve the map viewport');
  assert(await page.evaluate(() => window.originalVideo === document.querySelector('[data-live-video]')));
  await map.getByRole('button', { name: 'restablecer encuadre', exact: true }).click();
  await map.getByRole('button', { name: 'Seleccionar Little Caesars 1 en el mapa', exact: true }).click();
  await page.locator('[data-live-video="little1"]').waitFor();
  await checkViewport(1366, 768, 'live-laptop');
  await checkViewport(390, 844, 'live-mobile');
  await chart.scrollIntoViewIfNeeded();
  const mobileChart = await rect(chart);
  assert(mobileChart.x >= 0 && mobileChart.x + mobileChart.width <= 391);
  assert((await rect(composer)).y + (await rect(composer)).height <= 845);
  await page.screenshot({ path: `${output}/traffic-mobile.png` });
  await map.scrollIntoViewIfNeeded();
  await checkViewport(390, 710, 'live-small-mobile');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('checkbox', { name: 'Responder con voz' }).uncheck();
  await composer.fill('Mostrame las pailas rojas');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await page.getByRole('button', { name: 'Ver video', exact: true }).first().click();
  assert.equal(evidence.queries.at(-1).run_id, liveRun.id, 'Undated searches must use live detections');
  await page.waitForFunction(() => document.querySelector('[data-result-video]')?.readyState >= 2);
  const before = await rect(page.locator('[data-result-video]'));
  await page.locator('[data-result-list]').evaluate(element => { element.scrollTop = element.scrollHeight; });
  assert.deepEqual(await rect(page.locator('[data-result-video]')), before);
  await checkViewport(1440, 900, 'history-desktop');
  await checkViewport(390, 844, 'history-mobile');
  assert.deepEqual(evidence.errors, []);
  await writeFile(`${output}/layout.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ passed: true, viewports: evidence.viewports.map(row => row.label), errors: evidence.errors }));
} catch (error) {
  if (page) await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  await writeFile(`${output}/layout-failed.json`, JSON.stringify({ ...evidence, failure: String(error) }, null, 2));
  throw error;
} finally { await browser.close(); }
