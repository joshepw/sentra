import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { slowRecordingGateway } from './slow-recording-gateway.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? '/home/paal/tmp-codex-test/worktrees/wheel-dev-guide/node_modules/playwright');
const upstream = process.env.EDGE_TEST_ORIGIN ?? 'http://127.0.0.1:8782';
const file = process.env.EDGE_TEST_SLOW_VIDEO;
assert(file, 'EDGE_TEST_SLOW_VIDEO must point to a representative fragmented 60.5-second MP4');
const output = process.env.EDGE_EVIDENCE_DIR ?? 'test-artifacts/history-buffer';
await mkdir(output, { recursive: true });
const gateway = await slowRecordingGateway(upstream, file), origin = gateway.origin;
const browser = await chromium.launch({ headless: true, executablePath: '/opt/google/chrome/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const start = 1790770000, duration = 60.499822, target = start + duration - .18;
const rows = ['a', 'b'].map((id, index) => ({ id: id.repeat(24), started: start + index * duration,
  ended: start + (index + 1) * duration, state: 'ok', url: `/slow-recording.mp4?part=${id}` }));
const playback = { camera: 'little', at: target, run_id: null, source: 'camera_time', segment_id: rows[0].id };
// A real decodable 4-second WAV of silence exercises fetch, decode and Web Audio.
const voiceBytes = Buffer.alloc(44 + 24000 * 4 * 2);
voiceBytes.write('RIFF', 0); voiceBytes.writeUInt32LE(voiceBytes.length - 8, 4); voiceBytes.write('WAVEfmt ', 8);
voiceBytes.writeUInt32LE(16, 16); voiceBytes.writeUInt16LE(1, 20); voiceBytes.writeUInt16LE(1, 22);
voiceBytes.writeUInt32LE(24000, 24); voiceBytes.writeUInt32LE(48000, 28); voiceBytes.writeUInt16LE(2, 32); voiceBytes.writeUInt16LE(16, 34);
voiceBytes.write('data', 36); voiceBytes.writeUInt32LE(voiceBytes.length - 44, 40);
const reports = [], errors = [];
let page;
try {
  for (const { voice, cancel = false } of [{ voice: false }, { voice: true }, { voice: false, cancel: true }]) {
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', error => errors.push(error.message));
    const requests = [], receipts = [];
    const mediaRequests = new Set();
    page.on('request', request => { if (request.url().includes('/slow-recording.mp4')) mediaRequests.add(request); });
    page.on('requestfinished', request => mediaRequests.delete(request));
    page.on('requestfailed', request => mediaRequests.delete(request));
    let job, appliedAt = 0, audioRequests = 0;
    await page.addInitScript(() => {
      const ids = new WeakMap(); let next = 0;
      window.bufferProbe = { events: [], loading: [], voices: [] };
      const identity = element => { if (!ids.has(element)) ids.set(element, ++next); return ids.get(element); };
      const snapshot = (event, element) => {
        const region = document.querySelector('[aria-label="Video del resultado"]');
        if (!region?.contains(element)) return;
        const following = region.querySelector('[data-next-video]');
        window.bufferProbe.events.push({ event, now: performance.now(), node: identity(element), segment: element.dataset.segment,
          active: element.hasAttribute('data-result-video'), time: element.currentTime, ready: element.readyState, paused: element.paused,
          ahead: Array.from({ length: element.buffered.length }, (_, i) => [element.buffered.start(i), element.buffered.end(i)]),
          nextNode: following && identity(following), nextReady: following?.readyState,
          nextAhead: following && Array.from({ length: following.buffered.length }, (_, i) => [following.buffered.start(i), following.buffered.end(i)]) });
      };
      for (const event of ['loadstart', 'loadeddata', 'seeking', 'seeked', 'playing', 'waiting', 'pause', 'ended']) {
        document.addEventListener(event, e => { if (e.target instanceof HTMLVideoElement) snapshot(event, e.target); }, true);
      }
      let previous;
      setInterval(() => {
        const region = document.querySelector('[aria-label="Video del resultado"]');
        if (!region) return;
        const loading = !!region.querySelector('[data-video-loading]');
        if (loading !== previous) { window.bufferProbe.loading.push({ now: performance.now(), loading }); previous = loading; }
      }, 10);
      const original = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        if (this.buffer?.duration > 1) window.bufferProbe.voices.push(performance.now());
        return original.apply(this, args);
      };
    });
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.route('**/senttra/hls.min.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.Hls = class { static isSupported() { return false; } };' }));
    await page.route('**/edge/media/history/voice/**', async route => {
      audioRequests++;
      await new Promise(resolve => setTimeout(resolve, 3000));
      await route.fulfill({ status: 200, contentType: 'audio/wav', body: voiceBytes });
    });
    await page.route('**/edge/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let body;
      if (path.endsWith('/live/bootstrap')) body = { cameras: [{ key: 'little', title: 'Little Caesars', receiving: false, url: '/unused.m3u8' }], user: { csrf: 'fixture-only' }, storage: {} };
      else if (path.endsWith('/history/coverage')) body = { runs: [] };
      else if (path.endsWith('/live/archive')) { requests.push(path); body = { segments: rows, gaps: [] }; }
      else if (path.endsWith('/history/chat')) {
        const request = route.request().postDataJSON(); assert.equal(request.voice, voice);
        job = { id: 'c'.repeat(32), status: 'waiting_action', phase: 'applying', action: { kind: 'open_archive', playback, revision: request.viewer.revision } };
        body = job;
      } else if (path.endsWith('/applied')) {
        const receipt = route.request().postDataJSON(); receipts.push(receipt); appliedAt = Date.now();
        assert.equal(receipt.status, cancel ? 'stale' : 'applied');
        if (!cancel) {
          assert.equal(receipt.diagnostics.segment_id, rows[0].id);
          assert(Math.abs(receipt.diagnostics.at - target) < .1);
        }
        body = { ...job, status: voice ? 'working' : 'complete', phase: voice ? 'voice' : 'complete' };
      } else if (path.includes('/history/chat/')) body = Date.now() - appliedAt < 2000
        ? { ...job, status: 'working', phase: 'voice' }
        : { ...job, status: 'complete', phase: 'complete', ...(voice ? { audio_url: `/edge/media/history/voice/${job.id}.wav` } : {}) };
      await route.fulfill({ status: body ? 200 : 404, json: body ?? {} });
    });
    await page.goto(origin + '/edge');
    if (!voice) await page.getByRole('button', { name: 'Silenciar voz', exact: true }).click();
    await page.getByRole('textbox', { name: 'Consulta de cámaras' }).fill('Mostrame Little Caesars a esta hora');
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    if (cancel) {
      const deadline = Date.now() + 5000;
      while (mediaRequests.size < 2 && Date.now() < deadline) await page.waitForTimeout(30);
      assert(mediaRequests.size >= 2, 'Both native streams must be loading before testing cancellation');
      await page.getByRole('button', { name: 'Cerrar video', exact: true }).click();
      while ((mediaRequests.size || !receipts.length) && Date.now() < deadline) await page.waitForTimeout(30);
      assert.equal(receipts.at(-1)?.status, 'stale'); assert.equal(mediaRequests.size, 0);
      assert.equal(await page.locator('[data-result-video], [data-next-video]').count(), 0);
      reports.push({ voice, cancel, receipts, checks: ['closing during preparation cancels both video streams and rejects the pending action'] });
      await page.close(); page = null; continue;
    }
    await page.waitForFunction(() => {
      const video = document.querySelector('[data-result-video]');
      return video?.dataset.segment === 'b'.repeat(24) && video.currentTime >= 7;
    }, null, { timeout: 55000 });
    const probe = await page.evaluate(() => window.bufferProbe);
    const first = probe.events.find(row => row.event === 'playing' && row.segment === 'a'.repeat(24));
    const second = probe.events.find(row => row.event === 'playing' && row.segment === 'b'.repeat(24));
    assert(first && second, 'Both actual recordings must play');
    assert.equal(second.node, first.nextNode, 'The prepared video element is reused across the boundary');
    assert(first.nextReady >= 2, 'The next recording is decoded before starting the final fraction of the current recording');
    assert(first.nextAhead.some(([begin, end]) => begin < .04 && end >= 2.8), 'Three seconds of reserve span the boundary');
    assert.equal(probe.events.filter(row => row.event === 'loadstart' && row.node === second.node).length, 1, 'Promotion never reloads the next source');
    assert.equal(probe.loading.filter(row => row.now > first.now && row.loading).length, 0, 'Playback and voice must not flash loading again');
    assert.equal(requests.length, 1, 'Voice and bootstrap renders never re-open the archive');
    assert.equal(audioRequests, voice ? 1 : 0);
    assert.equal(probe.voices.length, voice ? 1 : 0);
    if (voice) assert(probe.voices[0] - first.now > 4500, 'Video proceeds while TTS generation and download are delayed');
    reports.push({ voice, audioRequests, receipts, probe, checks: ['three-second reserve across segment boundary', 'same preloaded native video reused', 'no loading flicker after playback', 'voice does not reload or delay video'] });
    await page.getByRole('button', { name: 'Cerrar video', exact: true }).click();
    assert.equal(await page.locator('[data-result-video], [data-next-video]').count(), 0);
    await page.close(); page = null;
  }
  assert.deepEqual(errors, []);
  await writeFile(`${output}/result.json`, JSON.stringify({ reports, errors }, null, 2));
  console.log(JSON.stringify({ scenarios: reports.length, checks: reports.map(row => ({ voice: row.voice, checks: row.checks })), errors }));
} catch (error) {
  const probe = await page?.evaluate(() => window.bufferProbe).catch(() => null);
  await writeFile(`${output}/failure.json`, JSON.stringify({ reports, errors, error: String(error), probe }, null, 2));
  await page?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  throw error;
} finally { await browser.close(); await gateway.close(); }
