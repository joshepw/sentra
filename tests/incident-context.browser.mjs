import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = process.env.EDGE_TEST_ORIGIN ?? 'http://127.0.0.1:8265';
const output = process.env.EDGE_EVIDENCE_DIR ?? 'test-artifacts/incident-context';
assert(process.env.EDGE_TEST_VIDEO, 'Supply a decodable 60-second fixture through EDGE_TEST_VIDEO');
const bytes = await readFile(process.env.EDGE_TEST_VIDEO);
await mkdir(output, { recursive: true });
const started = Date.parse('2026-09-30T07:04:00-06:00') / 1000;
const uid = number => number.toString(16).padStart(24, '0');
const playback = { camera: 'seguros', at: started + 18, run_id: 'fixture', source: 'camera_time', segment_id: 'b'.repeat(24) };
const items = [11, 22].map(id => ({ uid: uid(id), camera: 'seguros', title: 'Seguros Atlántida', kind: 'uturn',
  review: 'candidate', at: started + 14,
  details: { stop_band: [10, 10, 500, 500], trajectory: [[started + 2, .1, .5], [started + 14, .2, .7]] },
  playback: { camera: 'seguros', at: started + 14, run_id: 'fixture', track_uid: uid(id), incident_uid: uid(id) } }));
const person = { uid: uid(33), camera: 'seguros', title: 'Seguros Atlántida', type: 'persona', class_id: 0, first: started + 18,
  playback: { camera: 'seguros', at: started + 18, run_id: 'fixture', track_uid: uid(33) } };
const incidents = [
  ...[11, 22].map((id, i) => ({ uid: uid(id), track_uid: uid(id), camera: 'seguros', session: 'first', local_id: id,
    kind: 'uturn', review: 'candidate', at: started + 14 + i * 2 })),
  { uid: uid(111), track_uid: uid(11), camera: 'seguros', session: 'first', local_id: 11, kind: 'rojo', review: 'confirmed', at: started + 25 },
  { uid: uid(44), track_uid: uid(44), camera: 'seguros', session: 'second', local_id: 44, kind: 'rojo', review: 'confirmed', at: started + 40 },
  { uid: uid(33), track_uid: uid(33), camera: 'little', session: 'first', local_id: 33, kind: 'uturn', review: 'candidate', at: started + 1 },
  { uid: uid(55), track_uid: uid(55), camera: 'seguros', session: 'first', local_id: 55, kind: 'uturn', review: 'dismissed', at: started + 1 },
];
const frames = Array.from({ length: 600 }, (_, index) => ({ camera: 'seguros', session: index < 300 ? 'first' : 'second',
  captured_at: started + index / 10, source_pts: index / 10, width: 640, height: 360, region_revision: 20,
  objects: (index < 300 ? [11, 22, 33, 55] : [11, 22, 44]).map((id, position) => ({ id, class_id: id === 33 ? 0 : 2,
    label: id === 33 ? 'Persona' : 'Carro', score: .95, box: [.03 + position * .24, .45, .23 + position * .24, .85] })) }));
const evidence = { checks: [], errors: [], receipts: [] };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/google/chrome/chrome', headless: true });
let page;
try {
  for (const viewport of [{ width: 393, height: 668 }, { width: 1280, height: 900 }]) {
    let mode = 'incidents', job, nextJob = 0;
    const reviews = {};
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
      else if (path.endsWith('/history/chat')) {
        const request = route.request().postDataJSON();
        job = { id: (++nextJob).toString(16).padStart(32, '0'), status: 'complete', phase: 'complete' };
        if (mode === 'time' || mode === 'raw') Object.assign(job, { status: 'waiting_action', phase: 'applying',
          action: mode === 'time' ? { kind: 'open_archive', revision: request.viewer.revision, playback }
            : { kind: 'view', revision: request.viewer.revision, changes: { mode: 'history', camera: 'seguros', all: false, close_video: true } } });
        else job.result = { items: mode === 'person' ? [person] : items, total: mode === 'person' ? 1 : 120,
          next_cursor: mode === 'person' ? null : 'not-loaded', counting: mode === 'person' ? 'appearances' : 'candidate_events',
          filters: mode === 'person' ? { type: 'persona' } : { kind: 'uturn' } };
        body = job;
      } else if (path.endsWith('/applied')) { evidence.receipts.push(route.request().postDataJSON()); body = { ...job, status: 'complete', phase: 'complete' }; }
      else if (path.includes('/history/chat/')) body = job;
      else if (path.endsWith('/live/archive')) body = { segments: [{ id: playback.segment_id, started, ended: started + 60,
        duration: 60, state: 'ok', url: '/incident-context-fixture.mp4' }], gaps: [] };
      else if (path.endsWith('/history/recording')) body = { available: true, playback };
      else if (path.endsWith('/history/frames')) body = { frames, incidents: incidents.map(row => ({ ...row, review: reviews[row.uid] ?? row.review })),
        focus: url.searchParams.has('uid') ? { local_id: Number.parseInt(url.searchParams.get('uid'), 16), session: 'first' } : null };
      else if (path.endsWith('/history/review')) { const request = route.request().postDataJSON(); reviews[request.uid] = request.decision; body = { id: request.uid, review: request.decision }; }
      await route.fulfill({ status: body ? 200 : 404, json: body ?? {} });
    });
    await page.goto(origin + '/edge');
    await page.getByRole('button', { name: 'Silenciar voz', exact: true }).click();
    const send = async selectedMode => { mode = selectedMode;
      await page.getByRole('textbox', { name: 'Consulta de cámaras' }).fill(selectedMode);
      await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    };
    await send('incidents');
    const results = page.getByRole('complementary', { name: 'Resultados de la consulta' });
    const open = number => results.locator(`[data-result-number="${number}"]`).getByRole('button', { name: 'Ver video', exact: true }).click();
    await open(1);
    await page.waitForFunction(() => document.querySelector('[data-history-overlay]')?.dataset.boxes === '4');
    const player = page.getByRole('region', { name: 'Video del resultado' });
    await player.getByRole('button', { name: 'Pausar', exact: true }).click();
    const drawing = async () => {
      const state = await page.locator('[data-history-overlay]').evaluate(canvas => ({ drawn: canvas.drawn,
        other: canvas.dataset.otherIncidents, height: document.querySelector('[data-result-video], [data-history-video]').getBoundingClientRect().height,
        overflow: document.documentElement.scrollWidth > innerWidth }));
      assert(state.drawn.every(call => call.dash.length === 0), 'No dashed boxes or dashed stop band');
      const strokes = state.drawn.filter(call => call.name === 'strokeRect' && call.color !== '#00150d');
      state.colors = strokes.map(call => call.color); return state;
    };
    const seek = async (seconds, raw = false) => {
      await page.locator(raw ? '[data-history-video]' : '[data-result-video]').evaluate((video, at) => { video.pause(); video.currentTime = at; }, seconds);
      await page.waitForFunction(({ at, raw }) => {
        const video = document.querySelector(raw ? '[data-history-video]' : '[data-result-video]');
        const canvas = document.querySelector('[data-history-overlay]');
        return video && !video.seeking && video.readyState >= 2 && Number(canvas?.dataset.boxes) > 0
          && Math.abs(Number(canvas.dataset.time) - at) < .05;
      }, { at: started + seconds, raw });
      return drawing();
    };
    const check = (name, state) => evidence.checks.push({ viewport, check: name, state });
    let state = await seek(10);
    assert.deepEqual(state.colors, ['#57f1aa', '#68c8ff', '#57f1aa', '#ffffff', '#57f1aa']);
    assert(state.drawn.some(call => call.args[0] === 'Carro #11 · Inspeccionando'));
    assert(state.height >= 160 && !state.overflow);
    check('Before the maneuver: green vehicle with independent white inspection outline', state);
    state = await seek(14.1); assert.deepEqual(state.colors, ['#57f1aa', '#68c8ff', '#57f1aa', '#ffffff', '#ffdb68']);
    check('Only the first event has started', state);
    state = await seek(18); assert.deepEqual(state.colors, ['#68c8ff', '#57f1aa', '#ffdb68', '#ffffff', '#ffdb68']);
    assert.equal(state.other, '1'); check('Two concurrent candidates are both yellow; selected stays on top', state);
    await page.screenshot({ path: `${output}/${viewport.width}-both-incidents.png` });
    state = await seek(26); assert.equal(state.colors.at(-1), '#ff5263'); assert(state.colors.includes('#ffdb68'));
    check('A later confirmed event turns the selected vehicle red without changing its white selection', state);
    state = await seek(10); assert(!state.colors.includes('#ff5263') && !state.colors.includes('#ffdb68'));
    check('Rewinding removes all future incident colors', state);
    state = await seek(32); assert.deepEqual(state.colors, ['#57f1aa', '#57f1aa', '#57f1aa']);
    state = await seek(42); assert.deepEqual(state.colors, ['#57f1aa', '#57f1aa', '#ff5263']);
    check('Session restart does not borrow earlier IDs; off-page red-light incident stays mapped', state);
    await player.getByRole('button', { name: 'Ocultar cajas', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-history-overlay]')?.dataset.boxes === '0');
    assert.equal(await page.getByLabel('Leyenda de incidencias', { exact: true }).count(), 0);
    await player.getByRole('button', { name: 'Mostrar cajas', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-history-overlay]')?.dataset.incidents === '1');
    assert(await page.locator('[data-result-video]').evaluate(video => video.paused && video.currentTime === 42));
    await open(2); await page.waitForFunction(() => document.querySelector('[data-history-overlay]')?.drawn?.some(call => call.args[0] === 'Carro #22 · Inspeccionando'));
    state = await seek(18); assert.equal(state.colors.at(-1), '#ffdb68');
    await player.locator('summary').click();
    await player.getByRole('button', { name: 'Confirmar incidencia', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-history-overlay]')?.drawn?.some(call => call.name === 'strokeRect' && call.color === '#ff5263'));
    state = await drawing(); assert.equal(state.colors.at(-1), '#ff5263');
    await player.getByRole('button', { name: 'Descartar', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-history-overlay]')?.dataset.incidents === '1');
    state = await drawing(); assert.equal(state.colors.at(-1), '#57f1aa'); assert(state.colors.includes('#ffffff'));
    check('Confirm and dismiss update paused frame; inspection remains independent', state);
    await player.getByRole('button', { name: 'Dejar pendiente', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-history-overlay]')?.dataset.incidents === '2');
    await send('person'); await open(1);
    await page.waitForFunction(() => document.querySelector('[data-history-overlay]')?.drawn?.some(call => call.args[0] === 'Persona #33 · Inspeccionando'));
    state = await seek(18); assert.equal(state.colors.filter(color => color === '#ffdb68').length, 2);
    assert.equal(state.colors.at(-1), '#68c8ff'); check('A person search retains both vehicle incidents and independently selects the person', state);
    await send('time');
    await page.waitForFunction(() => document.querySelector('[data-history-overlay]')?.dataset.incidents === '2' && !document.querySelector('[data-history-overlay]')?.drawn?.some(call => call.color === '#ffffff'));
    state = await seek(18); assert.equal(state.colors.filter(color => color === '#ffdb68').length, 2); assert(!state.colors.includes('#ffffff'));
    check('Direct camera/time playback shows the same events without selecting an incident', state);
    await send('raw');
    await page.locator('[data-history-video]').waitFor();
    state = await seek(18, true); assert.equal(state.colors.filter(color => color === '#ffdb68').length, 2);
    check('Saved-segment camera browser resolves its analysis and uses the same incident colors', state);
    await page.screenshot({ path: `${output}/${viewport.width}-saved-segment.png` });
    await context.close(); page = null;
  }
  assert.deepEqual(evidence.errors, []);
  assert(evidence.receipts.every(receipt => receipt.status === 'applied'));
  await writeFile(`${output}/result.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ checks: evidence.checks.map(({ viewport, check }) => ({ viewport, check })), errors: evidence.errors }));
} catch (error) {
  evidence.failure = String(error);
  await page?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  await writeFile(`${output}/failure.json`, JSON.stringify(evidence, null, 2));
  throw error;
} finally { await browser.close(); }
