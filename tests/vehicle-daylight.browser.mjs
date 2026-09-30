import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? '/home/paal/tmp-codex-test/worktrees/wheel-dev-guide/node_modules/playwright');
const origin = process.env.EDGE_TEST_ORIGIN ?? 'http://127.0.0.1:8782';
const output = process.env.EDGE_EVIDENCE_DIR ?? 'test-artifacts/vehicle-daylight';
const videoPath = process.env.EDGE_TEST_VIDEO ?? 'test-artifacts/edge-layout/fixture.mp4';
await mkdir(output, { recursive: true });
const started = Date.parse('2026-09-30T08:00:00-06:00') / 1000;
const objects = ['camion_pequeno', 'camion_grande', 'paila', 'bus', 'busito'].map((type, index) => ({
  id: index + 1, class_id: index >= 3 ? 5 : index === 1 ? 7 : 2,
  label: 'Vehículo', score: .9, box: [.04 + index * .18, .2, .18 + index * .18, .7],
  attributes: { type, color: index >= 3 ? 'amarillo' : 'rojo', type_score: .9, color_score: .9,
    ready_source_pts: 2, view_source_pts: [0, .5, 1] },
}));
const frames = Array.from({ length: 80 }, (_, i) => ({ camera: 'little', session: 'fixture', segment: 'fixture.mp4',
  captured_at: started + i / 10, offset: i / 10, source_pts: 3 + i / 10, sequence: i + 1,
  width: 640, height: 360, region_revision: 0, objects }));
const items = objects.map((object, index) => ({ uid: String(index + 1), camera: 'little', title: 'Little Caesars',
  class_id: object.class_id, type: object.attributes.type, color: object.attributes.color,
  thumbnail_url: '/fixture-thumb.svg', first: started + 2,
  playback: { camera: 'little', at: started + 2, run_id: 'fixture', track_uid: String(index + 1) } }));
const evidence = { fixture: true, errors: [], checks: [], liveLabels: [], historyLabels: [] };
let mode = 'mixed', page;
const browser = await chromium.launch({ headless: true, executablePath: '/opt/google/chrome/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => evidence.errors.push(error.message));
  await page.addInitScript(({ frames }) => {
    window.drawnLabels = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
      const kind = this.canvas.hasAttribute('data-detection-overlay') ? 'live' : 'history';
      if (String(text).includes('#') && window.drawnLabels.length < 10000) window.drawnLabels.push({ kind, text });
      return original.call(this, text, ...args);
    };
    window.EventSource = class extends EventTarget {
      constructor() {
        super(); this.timer = setInterval(() => {
          this.dispatchEvent(new MessageEvent('state', { data: JSON.stringify({ cameras: { little: { status: 'running' } } }) }));
          this.dispatchEvent(new MessageEvent('frames', { data: JSON.stringify({ frames }) }));
        }, 100);
      }
      close() { clearInterval(this.timer); }
    };
  }, { frames });
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.route('**/fixture-video.mp4', route => route.fulfill({ contentType: 'video/mp4', path: videoPath }));
  await page.route('**/fixture-thumb.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="#345"/></svg>' }));
  await page.route('**/senttra/hls.min.js', route => route.fulfill({ contentType: 'application/javascript', body: `
    window.Hls = class {
      static isSupported() { return true; }
      static Events = { ERROR: 'error', FRAG_BUFFERED: 'buffered', FRAG_CHANGED: 'changed' };
      callbacks = {};
      loadSource() {} on(event, callback) { this.callbacks[event] = callback; }
      attachMedia(video) {
        video.loop = true; video.src = '/fixture-video.mp4';
        this.callbacks.buffered?.('buffered', { frag: { url: '/fixture.mp4', start: 0, duration: 8, startPTS: 0, endPTS: 8 } });
      }
      destroy() {}
    };
  ` }));
  await page.route('**/edge/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    let body;
    if (path.endsWith('/live/bootstrap')) body = { cameras: [{ key: 'little', title: 'Little Caesars', receiving: true,
      url: '/edge/media/live/little/index.m3u8', detections: { status: 'running' } }], user: { csrf: 'fixture-only' }, storage: {} };
    else if (path.endsWith('/history/coverage')) body = { runs: [] };
    else if (path.endsWith('/history/chat')) body = { id: 'a'.repeat(32), status: 'complete', phase: 'complete',
      result: { total: mode === 'mixed' ? 5 : mode === 'bus' ? 1 : 0, counting: 'appearances',
        // Retain legacy colors here to exercise defensive rendering as well.
        filters: mode === 'night' ? { type: 'paila', color: 'rojo', start: '2026-09-30T20:00:00-06:00', end: '2026-09-30T22:00:00-06:00' }
          : { start: '2026-09-28T00:00:00-06:00', end: '2026-09-30T18:00:00-06:00', ...(mode === 'bus' ? { type: 'bus', color: 'amarillo' } : {}) },
        ...(mode !== 'mixed' ? { search_hours: { start: '07:00', end: '18:00', timezone: 'America/Tegucigalpa', has_daytime_overlap: mode !== 'night' } } : {}),
        ...(mode === 'bus' ? { color_notice: 'Buses: búsqueda por tipo, sin filtro de color.' } : {}),
        items: mode === 'mixed' ? items : mode === 'bus' ? [items[3]] : [] } };
    else if (path.endsWith('/live/archive')) body = { segments: [{ id: 'fixture', camera: 'little', started, ended: started + 8,
      duration: 8, state: 'ok', url: '/fixture-video.mp4' }], gaps: [], truncated: false };
    else if (path.endsWith('/history/frames')) body = { frames, focus: { local_id: 4, session: 'fixture' } };
    return route.fulfill({ status: body ? 200 : 404, json: body ?? {} });
  });
  await page.goto(origin + '/edge');
  await page.waitForFunction(() => window.drawnLabels.some(row => row.kind === 'live' && row.text === 'Bus #4'));
  const validateLabels = labels => {
    for (const label of ['Camión pequeño #1', 'Camión grande #2', 'Paila · Rojo #3', 'Bus #4', 'Busito · Amarillo #5']) assert(labels.includes(label), label);
    assert(labels.filter(text => /^(Camión|Bus #)/.test(text)).every(text => !/Rojo|Amarillo|determinar|clasificar| · /.test(text)));
  };
  evidence.liveLabels = [...new Set(await page.evaluate(() => window.drawnLabels.filter(row => row.kind === 'live').map(row => row.text)))];
  validateLabels(evidence.liveLabels); evidence.checks.push('Live bus and truck boxes omit color; pickup and busito keep their colors');
  await page.getByRole('button', { name: 'Silenciar voz', exact: true }).click();
  async function send(text) {
    await page.getByRole('textbox', { name: 'Consulta de cámaras' }).fill(text);
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  }
  await send('Mostrar vehículos');
  const cards = page.locator('[data-result-number]'); await cards.nth(4).waitFor();
  assert.doesNotMatch(await cards.nth(3).innerText(), /Amarillo|Color sin determinar/);
  assert.match(await cards.nth(4).innerText(), /Busito · Amarillo/);
  assert.equal(await cards.nth(3).locator('img').getAttribute('alt'), 'Bus');
  await cards.nth(3).getByRole('button', { name: 'Ver video', exact: true }).click();
  await page.waitForFunction(() => window.drawnLabels.some(row => row.kind === 'history' && row.text === 'Bus #4'));
  evidence.historyLabels = [...new Set(await page.evaluate(() => window.drawnLabels.filter(row => row.kind === 'history').map(row => row.text)))];
  validateLabels(evidence.historyLabels); evidence.checks.push('History cards, image alternatives and playback omit stored bus color');
  mode = 'bus'; await send('Buses amarillos del 28 al 30 de septiembre');
  await page.getByText('Buses: búsqueda por tipo, sin filtro de color.', { exact: true }).waitFor();
  const context = page.locator('[data-result-context]');
  assert.match(await context.innerText(), /Solo 07:00–18:00 HN, cada día/);
  assert.doesNotMatch(await context.innerText(), /Amarillo/);
  assert.match(await context.innerText(), /28/); assert.match(await context.innerText(), /30/);
  assert.equal(await cards.count(), 1);
  await page.screenshot({ path: `${output}/desktop.png` });
  await page.setViewportSize({ width: 390, height: 710 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await cards.first().getByRole('button', { name: 'Ver video', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/mobile.png` });
  evidence.checks.push('Bus search keeps requested dates, shows the daily 07:00–18:00 policy and fits mobile');
  mode = 'night'; await send('Pailas rojas de 8 a 10 de la noche');
  await page.getByRole('heading', { name: 'Fuera del horario de búsqueda', exact: true }).waitFor();
  assert.equal(await cards.count(), 0);
  assert.doesNotMatch(await context.innerText(), /0 apariciones/);
  assert.doesNotMatch(await page.locator('[data-result-list]').innerText(), /Sin coincidencias/);
  assert.match(await page.locator('[data-result-list]').innerText(), /hora de Honduras/);
  await page.screenshot({ path: `${output}/night-mobile.png` });
  evidence.checks.push('Night requests explain the search restriction without claiming no vehicles passed');
  assert.deepEqual(evidence.errors, []);
  await writeFile(`${output}/result.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} catch (error) {
  await page?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  await writeFile(`${output}/failure.json`, JSON.stringify({ ...evidence, error: String(error) }, null, 2));
  throw error;
} finally { await browser.close(); }
