import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = process.env.EDGE_TEST_ORIGIN ?? 'http://127.0.0.1:8265';
const output = process.env.EDGE_EVIDENCE_DIR ?? 'test-artifacts/live-incident-context';
assert(process.env.EDGE_TEST_HLS, 'Supply full/ and preview/ HLS fixtures through EDGE_TEST_HLS');
await mkdir(output, { recursive: true });
const cameras = [['crowne1', 'Crowne Plaza 1'], ['seguros', 'Seguros Atlántida'], ['seguros1', 'Seguros Atlántida 1'],
  ['seguros2', 'Seguros Atlántida 2'], ['little', 'Little Caesars'], ['little1', 'Little Caesars 1'], ['axis9', '9 Avenida']];
const evidence = { checks: [], errors: [], media: [] };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/google/chrome/chrome', headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'] });
let page;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 960 }, serviceWorkers: 'block' });
  page.on('pageerror', error => evidence.errors.push(error.message));
  await page.addInitScript(() => {
    for (const name of ['clearRect', 'strokeRect', 'fillText']) {
      const original = CanvasRenderingContext2D.prototype[name];
      CanvasRenderingContext2D.prototype[name] = function (...args) {
        if (this.canvas.hasAttribute('data-detection-overlay')) {
          if (name === 'clearRect') this.canvas.drawn = [];
          else (this.canvas.drawn ??= []).push({ name, color: name === 'strokeRect' ? this.strokeStyle : this.fillStyle, dash: this.getLineDash(), args });
        }
        return original.apply(this, args);
      };
    }
    window.EventSource = class {
      constructor(url) { this.camera = new URL(url, location.origin).searchParams.get('camera'); this.listeners = {}; this.revision = 0;
        this.timer = setInterval(() => this.emit(), 250); }
      addEventListener(name, listener) { this.listeners[name] = listener; }
      emit() {
        const entry = (local_id, at, review, camera = this.camera) => ({ uid: String(local_id), track_uid: String(local_id),
          camera, session: 'fixture', local_id, kind: 'rojo', review, at: 1700000000 + at });
        this.listeners.state?.({ data: JSON.stringify({ cameras: { [this.camera]: { status: 'running' } }, incidents: [
          entry(42, 20, window.review ?? 'candidate'), entry(43, 22, 'confirmed'),
          entry(44, 1, 'confirmed', 'other-camera'), entry(55, 1, 'dismissed'),
        ] }) });
        const revision = ++this.revision;
        const frames = Array.from({ length: 600 }, (_, index) => ({ camera: this.camera,
          session: window.resetSession ? 'new-session' : 'fixture', segment: `s${100 + Math.floor(index / 20)}.mp4`,
          offset: (index % 20) / 10, captured_at: 1700000000 + index / 10, sequence: index * 10000 + revision,
          width: 1280, height: 720, region_revision: 20,
          objects: [42, 43, 44, 55].map((id, position) => ({ id, class_id: 2, label: 'Auto', score: .95,
            box: [.02 + position * .24, .45, .22 + position * .24, .8] })),
        }));
        this.listeners.frames?.({ data: JSON.stringify({ frames }) });
      }
      close() { clearInterval(this.timer); }
    };
  });
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.route('**/edge/auth/**', route => route.abort());
  await page.route('**/edge/api/**', async route => {
    const url = new URL(route.request().url());
    let body;
    if (url.pathname.endsWith('/live/bootstrap')) body = { cameras: cameras.map(([key, title]) => ({ key, title, receiving: true,
      detections: { status: 'running' }, url: `/edge/media/live/${key}/index.m3u8`, preview_url: `/edge/media/live/${key}/index.m3u8?preview=1`,
    })), user: { csrf: 'fixture' }, storage: {} };
    else if (url.pathname.endsWith('/history/coverage')) body = { runs: [] };
    await route.fulfill({ status: body ? 200 : 404, json: body ?? {} });
  });
  await page.route('**/edge/media/**', async route => {
    const url = new URL(route.request().url()), match = /^\/edge\/media\/live\/([a-z0-9]+)\/(index\.m3u8|s\d+\.mp4)$/.exec(url.pathname);
    if (!match) return route.abort();
    const quality = url.searchParams.get('preview') === '1' ? 'preview' : 'full';
    let body = await readFile(path.join(process.env.EDGE_TEST_HLS, quality, match[2]));
    if (match[2].endsWith('.m3u8') && quality === 'preview') body = Buffer.from(body.toString().replaceAll('.mp4\n', '.mp4?preview=1\n'));
    evidence.media.push({ camera: match[1], quality, name: match[2] });
    await route.fulfill({ status: 200, body, contentType: match[2].endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t', headers: { 'Cache-Control': 'no-store' } });
  });
  const waitVideo = (count, width) => page.waitForFunction(({ count, width }) => {
    const videos = [...document.querySelectorAll('[data-live-video]')];
    return videos.length === count && videos.every(video => video.videoWidth === width && video.readyState >= 2);
  }, { count, width });
  const snapshot = async camera => {
    const state = await page.locator(`[data-detection-overlay="${camera}"]`).evaluate(canvas => ({ drawn: canvas.drawn, at: Number(canvas.dataset.time), incidents: canvas.dataset.incidents }));
    assert(state.drawn.every(call => call.dash.length === 0));
    state.colors = state.drawn.filter(call => call.name === 'strokeRect' && call.color !== '#00150d').map(call => call.color);
    return state;
  };
  const seek = async (camera, seconds) => {
    await page.waitForFunction(camera => document.querySelector(`[data-detection-overlay="${camera}"]`)?.dataset.boxes === '4', camera);
    const base = await page.locator(`[data-live-video="${camera}"]`).evaluate((video, camera) => {
      video.pause();
      const canvas = document.querySelector(`[data-detection-overlay="${camera}"]`);
      return video.currentTime - (Number(canvas.dataset.time) - 1700000000);
    }, camera);
    await page.locator(`[data-live-video="${camera}"]`).evaluate((video, target) => { video.currentTime = target; }, base + seconds);
    await page.waitForFunction(({ camera, seconds }) => Math.abs(Number(document.querySelector(`[data-detection-overlay="${camera}"]`)?.dataset.time) - 1700000000 - seconds) < .08, { camera, seconds });
    return snapshot(camera);
  };
  await page.goto(origin + '/edge/live');
  await page.getByRole('button', { name: 'Abrir sector 1era Calle', exact: true }).click();
  await waitVideo(7, 640);
  for (const [camera] of cameras) {
    const state = await seek(camera, 25);
    assert.deepEqual(state.colors, ['#57f1aa', '#57f1aa', '#ffdb68', '#ff5263']);
  }
  assert(evidence.media.every(row => row.quality === 'preview'));
  evidence.checks.push('All seven 360p streams render both incidents with the same solid status colors');
  await page.screenshot({ path: `${output}/mosaic.png` });
  let state = await seek('little', 19); assert.deepEqual(state.colors, Array(4).fill('#57f1aa'));
  state = await seek('little', 20.1); assert.deepEqual(state.colors, ['#57f1aa', '#57f1aa', '#57f1aa', '#ffdb68']);
  state = await seek('little', 22.1); assert.equal(state.incidents, '2');
  state = await seek('little', 19); assert.equal(state.incidents, '0');
  evidence.checks.push('Demuxed video clock starts each mark at its own event and clears it on rewind');
  await page.getByRole('button', { name: 'Ver Little Caesars', exact: true }).click();
  await waitVideo(1, 1280); state = await seek('little', 25);
  assert.deepEqual(state.colors, ['#57f1aa', '#57f1aa', '#ffdb68', '#ff5263']);
  evidence.checks.push('Individual 720p camera keeps the same incident context and timing');
  await page.evaluate(() => { window.review = 'confirmed'; });
  await page.waitForFunction(() => document.querySelector('[data-detection-overlay="little"]')?.drawn?.filter(call => call.name === 'strokeRect' && call.color === '#ff5263').length === 2);
  await page.evaluate(() => { window.review = 'dismissed'; });
  await page.waitForFunction(() => document.querySelector('[data-detection-overlay="little"]')?.dataset.incidents === '1');
  assert(await page.locator('[data-live-video="little"]').evaluate(video => video.paused));
  evidence.checks.push('Paused camera receives current confirmation and dismissal from heartbeat snapshots');
  await page.evaluate(() => { window.resetSession = true; });
  await page.waitForFunction(() => document.querySelector('[data-detection-overlay="little"]')?.dataset.incidents === '0');
  evidence.checks.push('A restarted tracker with reused numeric IDs inherits no previous incidents');
  await page.evaluate(() => { window.resetSession = false; window.review = 'candidate'; });
  await page.setViewportSize({ width: 393, height: 668 });
  await seek('little', 25);
  await page.screenshot({ path: `${output}/mobile-camera.png` });
  evidence.checks.push('Mobile single camera retains both solid status colors');
  assert.deepEqual(evidence.errors, []);
  await writeFile(`${output}/result.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ checks: evidence.checks, errors: evidence.errors }));
} catch (error) {
  evidence.failure = String(error); await page?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  await writeFile(`${output}/failure.json`, JSON.stringify(evidence, null, 2)); throw error;
} finally { await browser.close(); }
