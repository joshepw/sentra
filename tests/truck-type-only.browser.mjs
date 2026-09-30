import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? '/home/paal/tmp-codex-test/worktrees/wheel-dev-guide/node_modules/playwright');
const origin = process.env.EDGE_TEST_ORIGIN ?? 'http://127.0.0.1:8782';
const output = process.env.EDGE_EVIDENCE_DIR ?? 'test-artifacts/truck-type-only';
const videoPath = process.env.EDGE_TEST_VIDEO ?? 'test-artifacts/edge-layout/fixture.mp4';
await mkdir(output, { recursive: true });
const started = Date.parse('2026-09-30T08:00:00-06:00') / 1000;
const objects = ['camion_pequeno', 'camion_grande', 'paila'].map((type, index) => ({
  id: index + 1, class_id: index === 0 ? 2 : index === 1 ? 7 : 2,
  label: 'Vehículo', score: .9, box: [.05 + index * .3, .2, .25 + index * .3, .7],
  attributes: { type, color: index === 1 ? 'azul' : 'rojo', type_score: .9, color_score: .9,
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
      result: { total: mode === 'mixed' ? 3 : 2, counting: 'appearances',
        // Older cached payloads still containing color must also render safely.
        filters: { start: started, end: started + 120, ...(mode === 'trucks' ? { type: 'camion', color: 'rojo' } : {}) },
        ...(mode === 'trucks' ? { color_notice: 'Camiones: búsqueda por tipo, sin filtro de color.' } : {}),
        items: mode === 'trucks' ? items.slice(0, 2) : items } };
    else if (path.endsWith('/history/similar')) body = { items: items.slice(0, 2) };
    else if (path.endsWith('/live/archive')) body = { segments: [{ id: 'fixture', camera: 'little', started, ended: started + 8,
      duration: 8, state: 'ok', url: '/fixture-video.mp4' }], gaps: [], truncated: false };
    else if (path.endsWith('/history/frames')) body = { frames, focus: { local_id: 1, session: 'fixture' } };
    return route.fulfill({ status: body ? 200 : 404, json: body ?? {} });
  });
  await page.goto(origin + '/edge');
  await page.waitForFunction(() => window.drawnLabels.some(row => row.kind === 'live' && row.text === 'Camión pequeño #1'));
  const validateLabels = labels => {
    assert(labels.includes('Camión pequeño #1')); assert(labels.includes('Camión grande #2'));
    assert(labels.includes('Paila · Rojo #3'));
    assert(labels.filter(text => text.startsWith('Camión')).every(text => !/Rojo|Azul|determinar|clasificar| · /.test(text)));
  };
  evidence.liveLabels = [...new Set(await page.evaluate(() => window.drawnLabels.filter(row => row.kind === 'live').map(row => row.text)))];
  validateLabels(evidence.liveLabels); evidence.checks.push('Live boxes show truck size only while retaining red pickup color');
  await page.getByRole('button', { name: 'Silenciar voz', exact: true }).click();
  async function send(text) {
    await page.getByRole('textbox', { name: 'Consulta de cámaras' }).fill(text);
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  }
  await send('Mostrar vehículos');
  const cards = page.locator('[data-result-number]'); await cards.nth(2).waitFor();
  assert.match(await cards.nth(0).innerText(), /Camión pequeño/);
  assert.doesNotMatch(await cards.nth(0).innerText(), /Rojo|Azul|Color sin determinar/);
  assert.doesNotMatch(await cards.nth(1).innerText(), /Rojo|Azul|Color sin determinar/);
  assert.match(await cards.nth(2).innerText(), /Paila · Rojo/);
  assert.equal(await cards.nth(0).locator('img').getAttribute('alt'), 'Camión pequeño');
  await cards.nth(0).getByRole('button', { name: 'Ver video', exact: true }).click();
  await page.waitForFunction(() => window.drawnLabels.some(row => row.kind === 'history' && row.text === 'Camión pequeño #1'));
  evidence.historyLabels = [...new Set(await page.evaluate(() => window.drawnLabels.filter(row => row.kind === 'history').map(row => row.text)))];
  validateLabels(evidence.historyLabels); evidence.checks.push('History titles, image alternatives and recorded video hide legacy truck colors');
  await page.screenshot({ path: `${output}/desktop.png` });
  mode = 'trucks'; await send('Camiones rojos');
  await page.getByText('Camiones: búsqueda por tipo, sin filtro de color.', { exact: true }).waitFor();
  assert.match(await page.locator('[data-result-context]').innerText(), /Camiones/);
  assert.doesNotMatch(await page.locator('[data-result-context]').innerText(), /Rojo/);
  assert.equal(await cards.count(), 2);
  await page.setViewportSize({ width: 390, height: 710 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: `${output}/mobile.png` });
  evidence.checks.push('Truck query context omits color, explains type-only results, fits mobile');
  await cards.nth(0).getByRole('button', { name: 'Otras cámaras', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[data-result-context]')?.textContent.includes('Camiones'));
  assert.doesNotMatch(await page.locator('[data-result-list]').innerText(), /Rojo|Azul|Color sin determinar/);
  evidence.checks.push('Other-camera suggestions also hide stored truck color');
  assert.deepEqual(evidence.errors, []);
  await writeFile(`${output}/result.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} catch (error) {
  await page?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  await writeFile(`${output}/failure.json`, JSON.stringify({ ...evidence, error: String(error) }, null, 2));
  throw error;
} finally { await browser.close(); }
