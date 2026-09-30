import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? '/home/paal/tmp-codex-test/worktrees/wheel-dev-guide/node_modules/playwright');
const origin = process.env.EDGE_TEST_ORIGIN ?? 'http://127.0.0.1:8782';
const output = process.env.EDGE_EVIDENCE_DIR ?? 'test-artifacts/camera-time';
const videoPath = process.env.EDGE_TEST_VIDEO ?? 'test-artifacts/edge-layout/fixture.mp4';
const videoBytes = await readFile(videoPath);
await mkdir(output, { recursive: true });
const at = Date.parse('2026-09-30T07:00:00-06:00') / 1000;
const cameras = [{ key: 'little', title: 'Little Caesars' }, { key: 'seguros', title: 'Seguros Atlántida' }];
const segments = [[-12, 'b'], [-4, 'a'], [4, 'c'], [20, 'd']].map(([offset, id]) => ({
  id: id.repeat(24), camera: 'little', started: at + offset, ended: at + offset + 8,
  duration: 8, state: 'ok', url: `/fixture-video.mp4?segment=${id}`,
}));
const playback = { camera: 'little', at, run_id: null, source: 'camera_time', segment_id: 'a'.repeat(24) };
const evidence = { fixture: true, errors: [], checks: [], queries: [], receipts: [], frames: 0 };
let page, mode = 'search', job, count = 0, archiveDelay = 0, badMedia = false, completed = 0;
const browser = await chromium.launch({ headless: true, executablePath: '/opt/google/chrome/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const waitUntil = async predicate => {
  const deadline = Date.now() + 25000;
  while (!predicate()) { assert(Date.now() < deadline, 'Fixture response timed out'); await new Promise(resolve => setTimeout(resolve, 30)); }
};
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => evidence.errors.push(error.message));
  // All APIs and media are fixtures, even when exercising the public bundle.
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.route('**/fixture-video.mp4*', route => {
    if (badMedia && route.request().url().includes('segment=d')) return route.fulfill({ status: 404, body: '' });
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? '');
    const start = range ? Number(range[1]) : 0, end = range?.[2] ? Number(range[2]) : videoBytes.length - 1;
    return route.fulfill({ status: range ? 206 : 200, contentType: 'video/mp4', body: videoBytes.subarray(start, end + 1),
      headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${videoBytes.length}` } : {}) } });
  });
  await page.route('**/edge/media/**', route => route.abort());
  await page.route('**/senttra/hls.min.js', route => route.fulfill({ contentType: 'application/javascript', body: `
    window.Hls = class {
      static isSupported() { return true; }
      static Events = { ERROR: 'error', FRAG_BUFFERED: 'buffered', FRAG_CHANGED: 'changed' };
      loadSource() {} on() {} destroy() {}
      attachMedia(video) { video.loop = true; video.src = '/fixture-video.mp4'; }
    };
  ` }));
  const videoState = () => page.locator('[data-result-video]').evaluate(video => ({
    at: Number(video.dataset.started) + video.currentTime, segment: video.dataset.segment,
    paused: video.paused, ready: video.readyState, seeking: video.seeking,
  }));
  await page.route('**/edge/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body;
    if (path.endsWith('/live/bootstrap')) body = { cameras: cameras.map(camera => ({ ...camera, receiving: true,
      url: `/edge/media/live/${camera.key}/index.m3u8` })), user: { csrf: 'fixture-only' }, storage: {} };
    else if (path.endsWith('/history/coverage')) body = { runs: [] };
    else if (path.endsWith('/live/archive')) {
      if (archiveDelay) await new Promise(resolve => setTimeout(resolve, archiveDelay));
      body = { segments, gaps: [], truncated: false };
    } else if (path.endsWith('/history/frames')) { evidence.frames++; body = { frames: [], focus: null }; }
    else if (path.endsWith('/history/chat')) {
      const request = route.request().postDataJSON(); evidence.queries.push(request);
      job = { id: (++count).toString(16).padStart(32, '0'), phase: 'applying', status: 'waiting_action' };
      if (mode === 'search') {
        Object.assign(job, { status: 'complete', result: { total: 1, counting: 'appearances', filters: { camera: 'seguros' }, items: [{
          uid: 'e'.repeat(24), camera: 'seguros', title: 'Seguros Atlántida', type: 'paila', color: 'rojo', first: at,
          playback: { camera: 'seguros', at, run_id: 'fixture', track_uid: 'e'.repeat(24) },
        }] } }); completed++;
      } else if (mode === 'unavailable') {
        Object.assign(job, { status: 'complete', result: { available: false, reason: 'no_recording',
          recording_request: { camera: 'little', at: at - 86400, local_time: '2026-09-29T07:00:00-06:00' },
          note: 'No hay grabación disponible de Little Caesars para el 29/09/2026 a las 07:00:00, hora de Honduras.' } }); completed++;
      } else if (['pause', 'play', 'seek', 'missing-seek'].includes(mode)) {
        assert.equal(request.selected_uid, undefined);
        assert.deepEqual(request.viewer.playback, playback);
        job.action = { kind: 'media', revision: request.viewer.revision, playback: request.viewer.playback,
          operation: mode.includes('seek') ? 'seek' : mode, ...(mode.includes('seek') ? { seconds: mode === 'seek' ? -7 : -120 } : {}) };
      } else {
        job.action = { kind: 'open_archive', revision: request.viewer.revision,
          playback: mode === 'bad-media' ? { ...playback, at: at + 24, segment_id: 'd'.repeat(24) } : playback };
      }
      body = mode === 'stale' ? { ...job, status: 'queued', action: undefined } : job;
    } else if (path.endsWith('/applied')) {
      const receipt = route.request().postDataJSON();
      const video = await page.locator('[data-result-video]').count() ? await videoState() : null;
      evidence.receipts.push({ mode, ...receipt, video });
      await writeFile(`${output}/receipts.json`, JSON.stringify(evidence.receipts, null, 2));
      if (receipt.status === 'applied' && job.action.kind === 'open_archive') {
        assert(video.ready >= 2 && !video.seeking, 'Open receipt requires decoded video and finished seek');
        assert.equal(video.segment, job.action.playback.segment_id);
        assert(Math.abs(video.at - job.action.playback.at) < .6, 'Open receipt is for the exact requested instant');
      }
      body = { ...job, status: 'complete', phase: 'complete', reply: receipt.status === 'applied' ? 'Acción aplicada.' : 'La acción no se aplicó.' };
      completed++;
    } else if (path.includes('/history/chat/')) body = job;
    await route.fulfill({ status: body ? 200 : 404, json: body ?? {} });
  });
  await page.goto(origin + '/edge');
  await page.getByRole('button', { name: 'Silenciar voz', exact: true }).click();
  async function send(text, selectedMode = mode, wait = true) {
    mode = selectedMode; const before = completed;
    await page.getByRole('textbox', { name: 'Consulta de cámaras' }).fill(text);
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    if (wait) { await waitUntil(() => completed > before); await page.waitForTimeout(100); }
  }
  await send('Pailas rojas', 'search');
  assert.equal(await page.locator('[data-result-number]').count(), 1);
  archiveDelay = 700;
  await send('Mostrame Little Caesars a las 7 de la mañana', 'open', false);
  await page.waitForTimeout(200); assert.equal(evidence.receipts.length, 0, 'Opening must wait for archive and decoded video');
  await waitUntil(() => evidence.receipts.length === 1); archiveDelay = 0;
  assert.equal(evidence.receipts[0].status, 'applied');
  assert.equal(await page.locator('[data-result-number]').count(), 1, 'Prior search cards survive direct camera playback');
  assert.equal(evidence.frames, 0, 'A recording without an analysis must not request frames from another run');
  assert.match(await page.getByRole('region', { name: 'Video del resultado' }).innerText(), /Little Caesars · grabación/);
  evidence.checks.push('Camera/time opens the exact decoded instant without a result UID or detection run; prior search cards survive');

  await send('Pausá el video', 'pause');
  const paused = await videoState(); assert(paused.paused);
  await send('Retrocedé siete segundos', 'seek');
  const sought = await videoState(); assert(sought.paused); assert.equal(sought.segment, 'b'.repeat(24));
  assert(Math.abs(sought.at - (paused.at - 7)) < .1);
  await send('Retrocedé dos minutos', 'missing-seek');
  assert.equal(evidence.receipts.at(-1).reason, 'unavailable_time');
  assert.deepEqual(await videoState(), sought);
  await send('Reanudá', 'play'); assert.equal((await videoState()).paused, false);
  await send('Mostrame Little Caesars a las 7 de la mañana', 'open');
  assert.equal(evidence.receipts.at(-1).status, 'applied');
  await send('Pausá', 'pause');
  await send('Mostrame Little Caesars a las 7 de la mañana', 'open');
  assert.equal(evidence.receipts.at(-1).status, 'applied');
  evidence.checks.push('Direct pause/play and cross-segment seek work; missing intervals fail without moving; repeated identical opens reset the time');

  await send('Pausá', 'pause'); const prior = await videoState();
  await send('Little Caesars ayer a las 7', 'unavailable');
  assert.deepEqual(await videoState(), prior);
  assert.match(await page.getByLabel('Asistente de cámaras', { exact: true }).getByRole('alert').innerText(), /29\/09\/2026.*07:00:00/);
  assert.equal(await page.locator('[data-result-number]').count(), 1);
  await page.screenshot({ path: `${output}/desktop.png` });
  await page.setViewportSize({ width: 390, height: 710 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: `${output}/mobile.png` });
  evidence.checks.push('An unavailable instant explains camera/date/time and preserves playback and results; mobile fits');

  const priorReceipts = evidence.receipts.length;
  await send('Abrí Little Caesars a las 7', 'stale', false);
  await page.getByRole('button', { name: 'Cerrar video', exact: true }).click();
  await waitUntil(() => evidence.receipts.length > priorReceipts);
  assert.equal(evidence.receipts.at(-1).status, 'stale');
  assert.equal(await page.locator('[data-result-video]').count(), 0);
  badMedia = true;
  await send('Little Caesars a las 7 y 24 segundos', 'bad-media');
  assert.equal(evidence.receipts.at(-1).status, 'failed');
  assert.equal(evidence.receipts.at(-1).reason, 'recording_unavailable');
  assert.match(await page.getByRole('region', { name: 'Video del resultado' }).innerText(), /No se pudo reproducir/);
  evidence.checks.push('A changed view rejects delayed opening; media errors send a failure receipt instead of confirming success');
  assert.deepEqual(evidence.errors, []);
  await writeFile(`${output}/result.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ checks: evidence.checks, errors: evidence.errors, receipts: evidence.receipts.length }));
} catch (error) {
  await page?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  await writeFile(`${output}/failure.json`, JSON.stringify({ ...evidence, error: String(error) }, null, 2));
  throw error;
} finally { await browser.close(); }
