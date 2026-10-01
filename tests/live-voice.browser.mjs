import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? '/home/paal/tmp-codex-test/worktrees/wheel-dev-guide/node_modules/playwright');
const origin = process.env.EDGE_TEST_ORIGIN ?? 'http://127.0.0.1:8782';
const output = process.env.EDGE_EVIDENCE_DIR ?? 'test-artifacts/live-voice';
const bytes = await readFile(process.env.EDGE_TEST_VIDEO ?? 'test-artifacts/edge-layout/fixture.mp4');
await mkdir(output, { recursive: true });
const cameras = [{ key: 'little', title: 'Little Caesars' }, { key: 'seguros', title: 'Seguros Atlántida' }];
const at = Date.parse('2026-09-30T07:00:00-06:00') / 1000;
const playback = { camera: 'little', at: at + 5, source: 'camera_time', segment_id: 'a'.repeat(24), run_id: null };
const evidence = { checks: [], requests: [], receipts: [], errors: [] };
const browser = await chromium.launch({ headless: true, executablePath: '/opt/google/chrome/chrome',
  args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let action = { kind: 'view', changes: { mode: 'live', close_video: true } }, job, count = 0;
const waitUntil = async predicate => {
  const deadline = Date.now() + 20000;
  while (!predicate()) { assert(Date.now() < deadline, 'Fixture timed out'); await new Promise(resolve => setTimeout(resolve, 30)); }
};
try {
  page.on('pageerror', error => evidence.errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.route('**/fixture-live.mp4*', route => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? '');
    const start = range ? Number(range[1]) : 0, end = range?.[2] ? Number(range[2]) : bytes.length - 1;
    return route.fulfill({ status: range ? 206 : 200, contentType: 'video/mp4', body: bytes.subarray(start, end + 1),
      headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } : {}) } });
  });
  await page.route('**/edge/media/**', route => route.abort());
  // Decode and seek real video; isolate live transport and authentication only.
  await page.route('**/senttra/hls.min.js', route => route.fulfill({ contentType: 'application/javascript', body: `
    window.Hls = class {
      static isSupported() { return true; }
      static Events = { ERROR: 'error', FRAG_BUFFERED: 'buffered', FRAG_CHANGED: 'changed' };
      loadSource(source) { this.source = source; } on() {}
      destroy() { clearTimeout(this.timer); }
      attachMedia(video) { this.timer = setTimeout(() => { video.loop = true; video.src = '/fixture-live.mp4?camera=' + encodeURIComponent(this.source); }, 900); }
    };
  ` }));
  await page.route('**/edge/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body;
    if (path.endsWith('/live/bootstrap')) body = { cameras: cameras.map(camera => ({ ...camera, receiving: true,
      url: `/edge/media/live/${camera.key}/index.m3u8` })), user: { csrf: 'fixture-only' }, storage: {} };
    else if (path.endsWith('/history/coverage')) body = { runs: [] };
    else if (path.endsWith('/live/archive')) body = { segments: [{ id: playback.segment_id, started: at, ended: at + 60,
      state: 'ok', url: '/fixture-live.mp4?archive=1' }], gaps: [] };
    else if (path.endsWith('/history/chat')) {
      const request = route.request().postDataJSON();
      evidence.requests.push({ text: request.text, audio: !!request.audio, viewer: request.viewer });
      job = { id: (++count).toString(16).padStart(32, '0'), status: 'waiting_action', phase: 'applying',
        action: { ...action, revision: request.viewer.revision } };
      body = job;
    } else if (path.endsWith('/applied')) {
      const receipt = route.request().postDataJSON();
      evidence.receipts.push(receipt);
      body = { ...job, status: 'complete', phase: 'complete', reply: 'Vista actualizada.' };
    } else if (path.includes('/history/chat/')) body = job;
    await route.fulfill({ status: body ? 200 : 404, json: body ?? {} });
  });
  await page.goto(origin + '/edge');
  await page.getByRole('button', { name: 'Silenciar voz', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir sector 1era Calle', exact: true }).click();
  const video = camera => page.locator(`[data-live-video="${camera}"]`);
  const ready = camera => page.waitForFunction(key => {
    const v = document.querySelector(`[data-live-video="${key}"]`);
    return v?.readyState >= 2 && v.seekable.length > 0 && !v.seeking;
  }, camera);
  const latest = camera => page.waitForFunction(key => {
    const v = document.querySelector(`[data-live-video="${key}"]`);
    if (!v || v.readyState < 2 || !v.seekable.length || v.seeking || v.paused) return false;
    const target = Math.max(v.seekable.start(v.seekable.length - 1), v.seekable.end(v.seekable.length - 1) - 12);
    return v.currentTime >= target - .2 && v.currentTime < target + 4;
  }, camera);
  const rewind = async camera => {
    await ready(camera);
    await video(camera).evaluate(v => { v.pause(); v.currentTime = 3; });
    await ready(camera);
  };
  const send = async (text, changes = { mode: 'live', close_video: true }, microphone = false) => {
    action = changes.kind ? changes : { kind: 'view', changes };
    const before = evidence.receipts.length;
    if (microphone) {
      await page.getByRole('button', { name: 'Grabar voz', exact: true }).click();
      await page.getByRole('button', { name: 'Enviar voz', exact: true }).waitFor();
      await page.waitForTimeout(800);
      await page.getByRole('button', { name: 'Enviar voz', exact: true }).click();
    } else {
      await page.getByRole('textbox', { name: 'Consulta de cámaras' }).fill(text);
      await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    }
    await waitUntil(() => evidence.receipts.length > before);
    assert.equal(evidence.receipts.at(-1).status, 'applied');
    await page.getByRole('button', { name: 'Grabar voz', exact: true }).waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('button[aria-haspopup="dialog"]')?.disabled);
  };
  await ready('little');
  for (const name of ['Todas', 'Cámara seleccionada', 'Volver al directo']) {
    assert.equal(await page.getByRole('button', { name, exact: true }).count(), 0, 'Removed control strip');
  }
  await video('little').evaluate(v => { v.dataset.identity = 'original-live-video'; });
  await rewind('little');
  await send('Volvé al directo');
  await latest('little');
  assert.equal(await video('little').getAttribute('data-identity'), 'original-live-video');
  evidence.checks.push('Paused live resumes at newest position with twelve-second reserve on the same player');

  await rewind('little');
  await send('', { mode: 'live', close_video: true }, true);
  await latest('little');
  assert(evidence.requests.at(-1).audio, 'Voice recorder sends actual recorded audio');
  evidence.checks.push('Repeated return through microphone resets position and resumes again');

  await rewind('little');
  await send('Ocultá las cajas', { boxes: false });
  assert(await video('little').evaluate(v => v.paused && Math.abs(v.currentTime - 3) < .1));
  evidence.checks.push('Unrelated box action preserves pause and position');

  await send('Mostrame Little Caesars a las 7', { kind: 'open_archive', playback });
  assert.equal(await page.locator('[data-result-video]').count(), 1);
  await send('Volvé al directo');
  assert.equal(await page.locator('[data-result-video]').count(), 0);
  assert.equal(await video('little').evaluate(v => v.seekable.length), 0, 'Command precedes delayed live timeline');
  await latest('little');
  evidence.checks.push('Returning from archive waits for live timeline before seeking to newest position');

  await send('Mostrame todas las cámaras', { all: true, mode: 'live', close_video: true });
  await latest('little'); await latest('seguros');
  assert.equal(await page.locator('[data-live-video]').count(), 2);
  await rewind('little'); await rewind('seguros');
  await send('Ir a lo actual');
  await latest('little'); await latest('seguros');
  assert.equal(evidence.requests.at(-1).viewer.all, true);
  evidence.checks.push('All-camera grid retains both cameras and returns both paused players to live');

  await send('Mostrame lo actual de Seguros', { camera: 'seguros', all: false, mode: 'live', close_video: true });
  await latest('seguros');
  assert.equal(await page.locator('[data-live-video]').count(), 1);
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  evidence.checks.push('Named camera selects one view; desktop and mobile retain video space without the strip');
  assert.deepEqual(evidence.errors, []);
  await writeFile(`${output}/result.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ checks: evidence.checks, receipts: evidence.receipts.length, errors: evidence.errors }));
} finally {
  await writeFile(`${output}/result.json`, JSON.stringify(evidence, null, 2));
  await browser.close();
}
