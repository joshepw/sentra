import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = process.env.EDGE_TEST_ORIGIN ?? 'http://127.0.0.1:8263';
const output = process.env.EDGE_EVIDENCE_DIR ?? 'test-artifacts/incident-context';
assert(process.env.EDGE_TEST_VIDEO, 'Supply a decodable 60-second fixture through EDGE_TEST_VIDEO');
const bytes = await readFile(process.env.EDGE_TEST_VIDEO);
await mkdir(output, { recursive: true });
const started = Date.parse('2026-09-30T07:04:00-06:00') / 1000;
const uid = number => number.toString(16).padStart(24, '0');
const items = [11, 22].map(id => ({ uid: uid(id), camera: 'seguros', title: 'Seguros Atlántida', kind: 'uturn',
  review: 'candidate', at: started + 14,
  playback: { camera: 'seguros', at: started + 14, run_id: 'fixture', track_uid: uid(id), incident_uid: uid(id) } }));
const incidents = [
  ...[11, 22].map(id => ({ uid: uid(id), track_uid: uid(id), camera: 'seguros', session: 'first', local_id: id,
    kind: 'uturn', review: 'candidate', at: started + 65 })),
  { uid: uid(44), track_uid: uid(44), camera: 'seguros', session: 'second', local_id: 44, kind: 'rojo', review: 'confirmed', at: started + 40 },
  { uid: uid(33), track_uid: uid(33), camera: 'little', session: 'first', local_id: 33, kind: 'uturn', review: 'candidate', at: started + 14 },
  { uid: uid(55), track_uid: uid(55), camera: 'seguros', session: 'first', local_id: 55, kind: 'uturn', review: 'dismissed', at: started + 14 },
];
const frames = Array.from({ length: 600 }, (_, index) => ({ camera: 'seguros', session: index < 300 ? 'first' : 'second',
  captured_at: started + index / 10, source_pts: index / 10, width: 640, height: 360, region_revision: 20,
  objects: (index < 300 ? [11, 22, 33, 55] : [11, 22, 44]).map((id, position) => ({ id, class_id: 2,
    label: 'Carro', score: .95, box: [.03 + position * .24, .45, .23 + position * .24, .85] })) }));
const evidence = { checks: [], errors: [] };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/google/chrome/chrome', headless: true });
let page;
try {
  for (const viewport of [{ width: 393, height: 668 }, { width: 1280, height: 900 }]) {
    const context = await browser.newContext({ viewport, isMobile: viewport.width < 1024, hasTouch: true, serviceWorkers: 'block' });
    page = await context.newPage();
    page.on('pageerror', error => evidence.errors.push(error.message));
    await page.addInitScript(() => {
      for (const name of ['clearRect', 'strokeRect', 'fillText']) {
        const original = CanvasRenderingContext2D.prototype[name];
        CanvasRenderingContext2D.prototype[name] = function (...args) {
          if (this.canvas.hasAttribute('data-history-overlay')) {
            if (name === 'clearRect') this.canvas.drawn = [];
            else (this.canvas.drawn ??= []).push({ name, color: name === 'strokeRect' ? this.strokeStyle : this.fillStyle,
              dash: this.getLineDash(), args });
          }
          return original.apply(this, args);
        };
      }
    });
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.route('**/edge/auth/**', route => route.abort());
    await page.route('**/edge/media/**', route => route.abort());
    await page.route('**/incident-context-fixture.mp4', route => {
      const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? '');
      const start = Number(range?.[1] ?? 0), end = Math.min(Number(range?.[2] || bytes.length - 1), bytes.length - 1);
      return route.fulfill({ status: range ? 206 : 200, contentType: 'video/mp4', body: bytes.subarray(start, end + 1),
        headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } : {}) } });
    });
    await page.route('**/senttra/hls.min.js', route => route.fulfill({ contentType: 'application/javascript',
      body: 'window.Hls = class { static isSupported() { return false; } };' }));
    await page.route('**/edge/api/**', async route => {
      const url = new URL(route.request().url()), path = url.pathname;
      let body;
      if (path.endsWith('/live/bootstrap')) body = { cameras: [{ key: 'seguros', title: 'Seguros Atlántida', receiving: false,
        url: '/unused.m3u8' }], user: { csrf: 'fixture' }, storage: {} };
      else if (path.endsWith('/history/coverage')) body = { runs: [] };
      else if (path.endsWith('/history/chat')) body = { id: 'a'.repeat(32), status: 'complete', phase: 'complete',
        result: { items, total: 120, next_cursor: 'not-loaded', counting: 'candidate_events', filters: { kind: 'uturn' } } };
      else if (path.endsWith('/live/archive')) body = { segments: [{ id: 'b'.repeat(24), started, ended: started + 60,
        state: 'ok', url: '/incident-context-fixture.mp4' }], gaps: [] };
      else if (path.endsWith('/history/frames')) body = { frames, incidents,
        focus: { local_id: Number.parseInt(url.searchParams.get('uid'), 16), session: 'first' } };
      await route.fulfill({ status: body ? 200 : 404, json: body ?? {} });
    });
    await page.goto(origin + '/edge');
    await page.getByRole('button', { name: 'Silenciar voz', exact: true }).click();
    await page.getByRole('textbox', { name: 'Consulta de cámaras' }).fill('Mostrar vueltas en U');
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    const results = page.getByRole('complementary', { name: 'Resultados de la consulta' });
    const open = number => results.locator(`[data-result-number="${number}"]`).getByRole('button', { name: 'Ver video', exact: true }).click();
    await open(1);
    await page.waitForFunction(() => document.querySelector('[data-history-overlay]')?.dataset.otherIncidents === '1');
    const player = page.getByRole('region', { name: 'Video del resultado' });
    await player.getByRole('button', { name: 'Pausar', exact: true }).click();
    const drawing = () => page.locator('[data-history-overlay]').evaluate(canvas => ({ drawn: canvas.drawn,
      other: canvas.dataset.otherIncidents, height: document.querySelector('[data-result-video]').getBoundingClientRect().height,
      overflow: document.documentElement.scrollWidth > innerWidth }));
    let state = await drawing();
    let boxes = state.drawn.filter(call => call.name === 'strokeRect');
    assert.deepEqual(boxes.map(box => [box.color, box.dash]), [
      ['#57f1aa', []], ['#57f1aa', []], ['#ff9b42', [6, 4]], ['#ffdb68', []],
    ], 'Selected vehicle stays solid and above context; normal/dismissed/wrong-camera tracks stay green');
    assert(state.drawn.some(call => call.name === 'fillText' && call.args[0] === 'Posible: vuelta en U'));
    assert(state.height >= 160 && !state.overflow);
    await page.getByLabel('Leyenda de incidencias', { exact: true }).waitFor();
    await page.screenshot({ path: `${output}/${viewport.width}-context.png` });
    evidence.checks.push({ viewport, check: 'selection, context, review and mobile size', state });

    await page.locator('[data-result-video]').evaluate(video => { video.currentTime = 32; });
    await page.waitForFunction(() => document.querySelector('[data-history-overlay]')?.drawn?.some(call => call.name === 'fillText' && call.args[0] === 'Confirmada: cruce en rojo'));
    state = await drawing(); boxes = state.drawn.filter(call => call.name === 'strokeRect');
    assert.deepEqual(boxes.map(box => box.color), ['#57f1aa', '#57f1aa', '#ff9b42'],
      'A reused numeric ID is not the selected or offending vehicle in another session');
    evidence.checks.push({ viewport, check: 'session reset and incident outside loaded search page', state });
    await player.getByRole('button', { name: 'Ocultar cajas', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-history-overlay]')?.dataset.boxes === '0');
    assert.equal(await page.getByLabel('Leyenda de incidencias', { exact: true }).count(), 0);
    await player.getByRole('button', { name: 'Mostrar cajas', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-history-overlay]')?.dataset.otherIncidents === '1');
    assert(await page.locator('[data-result-video]').evaluate(video => video.paused && video.currentTime === 32));
    evidence.checks.push({ viewport, check: 'hide/show boxes preserves paused video' });

    await open(2);
    await page.waitForFunction(() => document.querySelector('[data-history-overlay]')?.drawn?.some(call => call.name === 'fillText' && call.args[0] === 'Carro #22 · seleccionada'));
    state = await drawing(); boxes = state.drawn.filter(call => call.name === 'strokeRect');
    assert.equal(boxes.at(-1).color, '#ffdb68');
    assert.equal(state.other, '1');
    evidence.checks.push({ viewport, check: 'switching result changes selection', state });
    await context.close(); page = null;
  }
  assert.deepEqual(evidence.errors, []);
  await writeFile(`${output}/result.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ checks: evidence.checks.map(({ viewport, check }) => ({ viewport, check })), errors: evidence.errors }));
} catch (error) {
  evidence.failure = String(error);
  await page?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  await writeFile(`${output}/failure.json`, JSON.stringify(evidence, null, 2));
  throw error;
} finally { await browser.close(); }
