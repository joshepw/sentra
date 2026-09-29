import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? '/home/paal/tmp-codex-test/worktrees/wheel-dev-guide/node_modules/playwright');
const origin = 'http://127.0.0.1:8773';
const output = 'test-artifacts/edge-feedback';
const videoPath = 'test-artifacts/edge-layout/fixture.mp4';
await mkdir(output, { recursive: true });
const started = Date.parse('2026-09-26T00:00:00-06:00') / 1000;
const cameras = [{ key: 'little', title: 'Little Caesars' }, { key: 'little1', title: 'Little Caesars 1' }];
const run = { id: 'live', kind: 'live', started, ended: null, status: 'running',
  cameras: cameras.map(camera => ({ camera: camera.key, first: started, last: started + 86400, frames: 100 })) };
const browser = await chromium.launch({ headless: true, executablePath: '/opt/google/chrome/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const evidence = { fixture: true, errors: [], checks: [], queries: [] };
let page;

async function fixture({ scriptFailure = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const current = await context.newPage();
  current.on('pageerror', error => evidence.errors.push(error.message));
  const state = { phase: 'planning', complete: false, denied: false, graphRequests: 0 };
  await current.addInitScript(() => {
    // Synthetic audio exercises the real browser recorder and analyser without
    // requesting an actual microphone or using a production identity.
    const fixture = { mode: 'allow', captures: [], pending: null };
    const capture = () => {
      const context = new AudioContext(), oscillator = context.createOscillator();
      const gain = context.createGain(), destination = context.createMediaStreamDestination();
      gain.gain.value = .15; oscillator.frequency.value = 440;
      oscillator.connect(gain); gain.connect(destination); oscillator.start();
      const entry = { context, gain, stream: destination.stream };
      fixture.captures.push(entry); void context.resume(); return entry.stream;
    };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      if (fixture.mode === 'deny') throw new DOMException('Fixture denial', 'NotAllowedError');
      if (fixture.mode === 'delay') await new Promise(resolve => { fixture.pending = resolve; });
      return capture();
    } });
    window.fixtureAudio = fixture;
    window.fixtureTraffic = [];
    const originalFetch = window.fetch;
    window.fetch = function (resource, options) {
      if (/\/history\/(search|incidents)\?/.test(String(resource))) {
        window.fixtureTraffic.push({ readyState: document.querySelector('[data-live-video]')?.readyState, at: performance.now() });
      }
      return originalFetch.call(this, resource, options);
    };
  });
  // Block non-local requests and intercept the complete backend/media surface.
  await current.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await current.route('**/edge/media/**', route => route.fulfill({ status: 404, body: '' }));
  await current.route('**/fixture-video.mp4', route => route.fulfill({ contentType: 'video/mp4', path: videoPath }));
  await current.route('**/senttra/hls.min.js', route => scriptFailure ? route.abort() : route.fulfill({ contentType: 'application/javascript', body: `
    window.fixtureHls = [];
    window.Hls = class {
      static isSupported() { return true; }
      static Events = { ERROR: 'error', FRAG_BUFFERED: 'buffered', FRAG_CHANGED: 'changed', MANIFEST_PARSED: 'manifest' };
      constructor(config) { this.config = config; this.listeners = {}; window.fixtureHls.push(this); }
      loadSource() {} on(event, listener) { this.listeners[event] = listener; } destroy() {}
      attachMedia(video) { this.video = video; video.loop = true; }
      release() { this.listeners.manifest?.(); this.video.src = '/fixture-video.mp4'; }
    };
  ` }));
  await current.route('**/edge/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    let body, status = 200;
    if (path.endsWith('/live/bootstrap')) {
      if (state.denied) { status = 401; body = {}; }
      else body = { cameras: cameras.map(camera => ({ ...camera, receiving: true, url: `/edge/media/live/${camera.key}/index.m3u8` })),
        user: { name: 'Feedback fixture', csrf: 'fixture-only' }, storage: {} };
    } else if (path.endsWith('/history/coverage')) body = { runs: [run] };
    else if (path.endsWith('/history/search') || path.endsWith('/history/incidents')) {
      state.graphRequests++; body = { total: path.endsWith('/search') ? 42 : 1, items: [] };
    } else if (/\/history\/chat(?:\/[a-f0-9]+)?$/.test(path)) {
      if (route.request().method() === 'POST') {
        const request = route.request().postDataJSON();
        evidence.queries.push({ text: request.text, mime: request.mime, audioBytes: request.audio?.length,
          tracksEnded: await current.evaluate(() => window.fixtureAudio.captures.every(capture => capture.stream.getTracks().every(track => track.readyState === 'ended'))) });
      }
      body = { id: 'b'.repeat(32), status: state.complete ? 'complete' : 'working', phase: state.phase,
        ...(state.complete ? { reply: 'Consulta de prueba terminada.' } : {}) };
    }
    await route.fulfill({ status: body ? status : 404, contentType: 'application/json', body: JSON.stringify(body ?? {}) });
  });
  await current.goto(origin + '/edge');
  await current.getByRole('button', { name: 'Grabar voz', exact: true }).waitFor();
  return { page: current, context, state };
}

const wait = (page, predicate, arg) => page.waitForFunction(predicate, arg, { timeout: 10000 });
const tracksEnded = page => page.evaluate(() => window.fixtureAudio.captures.every(capture => capture.stream.getTracks().every(track => track.readyState === 'ended')));
const save = async (page, name) => {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${output}/${name}.png` });
};
try {
  const normal = await fixture(); page = normal.page;
  await page.locator('[data-video-loading]').waitFor();
  await save(page, 'video-loading-desktop');
  await page.waitForTimeout(600);
  assert.equal(normal.state.graphRequests, 0, 'Summary requests should give the first video frame priority');
  await page.evaluate(() => window.fixtureHls[0].release());
  await wait(page, () => document.querySelector('[data-live-video]')?.readyState >= 2);
  await page.locator('[data-video-loading]').waitFor({ state: 'detached' });
  await page.getByRole('img', { name: /^Apariciones de vehículos/ }).waitFor();
  assert(await page.evaluate(() => window.fixtureTraffic.length > 0 && window.fixtureTraffic.every(request => request.readyState >= 2)));
  const config = await page.evaluate(() => window.fixtureHls[0].config);
  assert.equal(config.liveSyncDurationCount, 6); assert.equal(config.liveMaxLatencyDurationCount, 9); assert.equal(config.maxBufferLength, 24);
  evidence.checks.push('first frame precedes traffic queries; playback reserve unchanged');
  await page.evaluate(() => { window.originalVideo = document.querySelector('[data-live-video]'); });
  await page.getByRole('button', { name: 'Grabar voz', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Grabando tu voz', { exact: true }).waitFor();
  await wait(page, () => Number(document.querySelector('[data-voice-meter]')?.dataset.soundLevel) > .3);
  assert(await page.evaluate(() => document.querySelector('dialog').contains(document.activeElement)));
  const bounds = await dialog.boundingBox(); assert.equal(bounds.width, 1440); assert.equal(bounds.height, 900);
  await save(page, 'recording-desktop');
  await page.evaluate(() => { window.fixtureAudio.captures.at(-1).gain.gain.value = 0; });
  await wait(page, () => Number(document.querySelector('[data-voice-meter]')?.dataset.soundLevel) < .02);
  await page.evaluate(() => { window.fixtureAudio.captures.at(-1).gain.gain.value = .15; });
  await wait(page, () => Number(document.querySelector('[data-voice-meter]')?.dataset.soundLevel) > .3);
  await page.setViewportSize({ width: 390, height: 710 });
  await save(page, 'recording-mobile');
  const sendBox = await dialog.getByRole('button', { name: 'Enviar voz', exact: true }).boundingBox();
  assert(sendBox.y + sendBox.height <= 710);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert(await tracksEnded(page)); assert.equal(evidence.queries.length, 0);
  assert(await page.getByRole('button', { name: 'Grabar voz', exact: true }).evaluate(element => element === document.activeElement));
  assert(await page.evaluate(() => window.originalVideo === document.querySelector('[data-live-video]') && !window.originalVideo.paused));
  evidence.checks.push('sound and silence drive the wave; fullscreen desktop/mobile; Escape stops capture and preserves video');

  await page.getByRole('button', { name: 'Grabar voz', exact: true }).click();
  await dialog.getByText('Grabando tu voz', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  assert(await tracksEnded(page)); assert.equal(evidence.queries.length, 0);
  await page.evaluate(() => { window.fixtureAudio.mode = 'delay'; });
  await page.getByRole('button', { name: 'Grabar voz', exact: true }).click();
  await dialog.getByText('Activando el micrófono', { exact: true }).waitFor();
  assert(await dialog.getByRole('button', { name: 'Enviar voz', exact: true }).isDisabled());
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.evaluate(() => window.fixtureAudio.pending());
  await wait(page, () => window.fixtureAudio.captures.at(-1).stream.getTracks().every(track => track.readyState === 'ended'));
  assert.equal(evidence.queries.length, 0);
  await page.evaluate(() => { window.fixtureAudio.mode = 'deny'; });
  await page.getByRole('button', { name: 'Grabar voz', exact: true }).click();
  await page.getByRole('alert').getByText(/No se pudo usar el micrófono/).waitFor();
  assert.equal(await dialog.isVisible(), false);
  evidence.checks.push('Cancel and late permission discard audio; denied microphone never claims to record');

  await page.evaluate(() => { window.fixtureAudio.mode = 'allow'; });
  normal.state.phase = 'transcribing';
  await page.getByRole('button', { name: 'Grabar voz', exact: true }).click();
  await dialog.getByText('Grabando tu voz', { exact: true }).waitFor();
  await page.waitForTimeout(700);
  await dialog.getByRole('button', { name: 'Enviar voz', exact: true }).click();
  const progress = page.locator('[data-assistant-progress]');
  await progress.getByRole('status').getByText('Pasando tu voz a texto', { exact: true }).waitFor();
  assert.equal(evidence.queries.length, 1); assert(evidence.queries[0].audioBytes > 100); assert(evidence.queries[0].mime.startsWith('audio/'));
  assert(evidence.queries[0].tracksEnded); assert.equal(await dialog.isVisible(), false);
  normal.state.phase = 'planning';
  await page.locator('[data-assistant-progress][data-phase="planning"]').waitFor();
  const word = await progress.locator('p[aria-hidden="true"]').innerText();
  await wait(page, previous => document.querySelector('[data-assistant-progress] p[aria-hidden="true"]').textContent !== previous, word);
  assert.equal(await progress.getByRole('status').innerText(), 'Interpretando tu consulta');
  await save(page, 'thinking-mobile');
  const progressBox = await progress.boundingBox(), resultsBox = await page.getByRole('complementary', { name: 'Resultados de la consulta' }).boundingBox();
  assert(progressBox.y + progressBox.height <= resultsBox.y + resultsBox.height, 'Mobile progress must remain inside its panel');
  await page.setViewportSize({ width: 1440, height: 900 });
  await save(page, 'thinking-desktop');
  normal.state.phase = 'querying';
  await progress.getByRole('status').getByText('Consultando el historial', { exact: true }).waitFor();
  normal.state.phase = 'voice';
  await progress.getByRole('status').getByText('Preparando la respuesta hablada', { exact: true }).waitFor();
  normal.state.complete = true;
  await progress.waitFor({ state: 'detached' });
  assert(await page.evaluate(() => window.originalVideo === document.querySelector('[data-live-video]') && !window.originalVideo.paused));
  evidence.checks.push('send releases microphone before POST; rotating words stay within actual phase; completion removes progress without remounting video');

  await page.evaluate(() => window.originalVideo.dispatchEvent(new Event('waiting')));
  await page.locator('[data-video-loading]').waitFor();
  await page.setViewportSize({ width: 390, height: 710 });
  await save(page, 'video-loading-mobile');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert(await page.locator('[data-video-loading]').evaluate(element => [...element.querySelectorAll('*'), element].every(node => getComputedStyle(node).animationName === 'none')));
  await page.evaluate(() => window.originalVideo.dispatchEvent(new Event('playing')));
  await page.locator('[data-video-loading]').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Grabar voz', exact: true }).click();
  await dialog.getByText('Grabando tu voz', { exact: true }).waitFor();
  normal.state.denied = true;
  await page.getByRole('heading', { name: 'Video en vivo e historial', exact: true }).waitFor({ timeout: 10000 });
  assert(await tracksEnded(page)); assert.equal(evidence.queries.length, 1);
  evidence.checks.push('buffering clears on playback; reduced motion disables decorative animation; session expiry stops capture');
  await normal.context.close();

  const stalled = await fixture(); page = stalled.page;
  await page.locator('[data-video-loading]').waitFor();
  await page.getByRole('img', { name: /^Apariciones de vehículos/ }).waitFor({ timeout: 10000 });
  assert(await page.locator('[data-video-loading]').isVisible());
  assert(await page.evaluate(() => window.fixtureTraffic.every(request => request.readyState < 2)));
  await stalled.context.close();
  evidence.checks.push('traffic has a bounded fallback when video cannot start');
  const failed = await fixture({ scriptFailure: true }); page = failed.page;
  await page.getByRole('button', { name: 'Recargar', exact: true }).waitFor();
  assert.equal(await page.locator('[data-video-loading]').count(), 0);
  await failed.context.close();
  evidence.checks.push('player script failure offers recovery instead of indefinite animation');
  assert.deepEqual(evidence.errors, []);
  await writeFile(`${output}/feedback.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ passed: true, checks: evidence.checks, errors: evidence.errors }));
} catch (error) {
  if (page && !page.isClosed()) await save(page, 'failure').catch(() => {});
  await writeFile(`${output}/feedback-failed.json`, JSON.stringify({ ...evidence, failure: String(error) }, null, 2));
  throw error;
} finally { await browser.close(); }
