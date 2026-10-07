import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = process.env.EDGE_TEST_ORIGIN ?? 'http://127.0.0.1:8264';
const output = process.env.EDGE_EVIDENCE_DIR ?? 'test-artifacts/mosaic-quality';
assert(process.env.EDGE_TEST_HLS, 'EDGE_TEST_HLS must contain full/ and preview/ HLS fixtures with s100.mp4–s129.mp4');
await mkdir(output, { recursive: true });
const cameras = [
  ['crowne1', 'Crowne Plaza 1'], ['seguros', 'Seguros Atlántida'], ['seguros1', 'Seguros Atlántida 1'],
  ['seguros2', 'Seguros Atlántida 2'], ['little', 'Little Caesars'], ['little1', 'Little Caesars 1'], ['axis9', '9 Avenida'],
].map(([key, title]) => ({ key, title }));
const evidence = { checks: [], media: [], errors: [] };
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH ?? '/opt/google/chrome/chrome',
  args: ['--autoplay-policy=no-user-gesture-required'] });
let page, advertised = true;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, serviceWorkers: 'block' });
  page = await context.newPage();
  page.on('pageerror', error => evidence.errors.push(error.message));
  await page.addInitScript(() => {
    const original = CanvasRenderingContext2D.prototype.strokeRect;
    CanvasRenderingContext2D.prototype.strokeRect = function (...args) {
      if (this.canvas.hasAttribute('data-detection-overlay')) this.canvas.lastBox = args;
      return original.apply(this, args);
    };
    // Only detection metadata is simulated. The shipped hls.js decodes actual
    // MPEG-TS fragments at both sizes and supplies the overlay's demuxed clock.
    window.EventSource = class {
      constructor(url) {
        this.camera = new URL(url, location.origin).searchParams.get('camera');
        this.listeners = {}; this.revision = 0;
        this.timer = setInterval(() => this.emit(), 350);
      }
      addEventListener(name, listener) { this.listeners[name] = listener; }
      emit() {
        this.listeners.state?.({ data: JSON.stringify({ cameras: { [this.camera]: { status: 'running' } } }) });
        const revision = ++this.revision;
        const frames = Array.from({ length: 600 }, (_, index) => ({
          camera: this.camera, session: 'fixture', segment: `s${100 + Math.floor(index / 20)}.mp4`,
          offset: (index % 20) / 10, sequence: index * 10000 + revision,
          width: 1280, height: window.badAspect ? 960 : 720,
          objects: [{ id: 42, class_id: 2, label: 'Auto', score: .95, box: [.2, .3, .5, .7] }],
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
    if (url.pathname.endsWith('/live/bootstrap')) body = { cameras: cameras.map(camera => ({ ...camera, receiving: true,
      detections: { status: 'running' }, url: `/edge/media/live/${camera.key}/index.m3u8`,
      ...(advertised ? { preview_url: `/edge/media/live/${camera.key}/index.m3u8?preview=1` } : {}),
    })), user: { csrf: 'fixture-only' }, storage: {} };
    else if (url.pathname.endsWith('/history/coverage')) body = { runs: [] };
    await route.fulfill({ status: body ? 200 : 404, json: body ?? {} });
  });
  await page.route('**/edge/media/**', async route => {
    const url = new URL(route.request().url());
    const match = /^\/edge\/media\/live\/([a-z0-9]+)\/(index\.m3u8|s\d+\.mp4)$/.exec(url.pathname);
    if (!match) return route.abort();
    const quality = url.searchParams.get('preview') === '1' ? 'preview' : 'full';
    let body = await readFile(path.join(process.env.EDGE_TEST_HLS, quality, match[2]));
    if (match[2].endsWith('.m3u8') && quality === 'preview') body = Buffer.from(body.toString().replaceAll('.mp4\n', '.mp4?preview=1\n'));
    evidence.media.push({ camera: match[1], quality, name: match[2], bytes: body.length });
    await route.fulfill({ status: 200, body, contentType: match[2].endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t',
      headers: { 'Cache-Control': 'no-store' } });
  });
  const openSector = () => page.getByRole('button', { name: 'Abrir sector 1era Calle', exact: true }).click();
  const waitVideo = async (count, width) => page.waitForFunction(({ count, width }) => {
    const videos = [...document.querySelectorAll('[data-live-video]')];
    return videos.length === count && videos.every(video => video.videoWidth === width && video.readyState >= 2 && !video.paused && video.currentTime > 0);
  }, { count, width });
  const overlay = () => page.locator('[data-detection-overlay="little"]');
  const checkBoxes = async () => {
    await page.waitForFunction(() => document.querySelector('[data-detection-overlay="little"]')?.dataset.boxes === '1');
    const geometry = await overlay().evaluate(canvas => {
      const video = document.querySelector('[data-live-video="little"]');
      const rect = canvas.getBoundingClientRect(), scale = Math.min(rect.width / video.videoWidth, rect.height / video.videoHeight);
      const width = video.videoWidth * scale, height = video.videoHeight * scale;
      return { actual: canvas.lastBox, expected: [(rect.width - width) / 2 + .2 * width, (rect.height - height) / 2 + .3 * height, .3 * width, .4 * height] };
    });
    geometry.actual.forEach((number, index) => assert(Math.abs(number - geometry.expected[index]) < .01));
    return geometry;
  };
  await page.goto(origin + '/edge/live');
  await openSector();
  await waitVideo(7, 640);
  evidence.checks.push({ check: 'Seven actual HLS decoders use 360p in the mosaic', geometry: await checkBoxes() });
  assert(evidence.media.every(request => request.quality === 'preview'), 'The mosaic must not download the full rendition');
  await page.screenshot({ path: `${output}/desktop-mosaic.png` });

  await page.evaluate(() => { window.badAspect = true; });
  await page.waitForFunction(() => document.querySelector('[data-detection-status="little"]')?.textContent === 'Esperando el tamaño de video correcto…');
  assert.equal(await overlay().getAttribute('data-boxes'), '0');
  await page.evaluate(() => { window.badAspect = false; });
  await checkBoxes();
  evidence.checks.push({ check: 'Scaled boxes match the image; a mismatched aspect clears them' });

  await page.getByRole('button', { name: 'Ver Little Caesars', exact: true }).click();
  await waitVideo(1, 1280);
  assert.equal(await page.locator('[data-live-camera]').getAttribute('data-live-camera'), 'little');
  evidence.checks.push({ check: 'Clicking the camera name opens only that camera at 720p', geometry: await checkBoxes() });
  assert(evidence.media.some(request => request.camera === 'little' && request.quality === 'full' && request.name.endsWith('.mp4')));
  await page.screenshot({ path: `${output}/desktop-camera.png` });
  const video = page.locator('[data-live-video="little"]');
  const time = await video.evaluate(element => element.currentTime);
  await page.waitForFunction(time => document.querySelector('[data-live-video="little"]').currentTime > time + .3, time);

  await page.getByRole('button', { name: 'Ver sectores', exact: true }).click();
  await page.setViewportSize({ width: 393, height: 720 });
  await openSector();
  await waitVideo(7, 640);
  const title = page.getByRole('button', { name: 'Ver Seguros Atlántida', exact: true });
  await title.focus(); await title.press('Enter');
  await waitVideo(1, 1280);
  assert.equal(await page.locator('[data-live-camera]').getAttribute('data-live-camera'), 'seguros');
  await page.waitForFunction(() => document.querySelector('[data-detection-overlay="seguros"]')?.dataset.boxes === '1');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: `${output}/mobile-camera.png` });
  evidence.checks.push({ check: 'Returning restores 360p mosaic; keyboard activation selects the named camera on mobile' });

  advertised = false;
  await page.reload(); await openSector(); await waitVideo(7, 1280);
  evidence.checks.push({ check: 'A backend without preview_url retains its original streams' });
  assert.deepEqual(evidence.errors, []);
  await writeFile(`${output}/result.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ checks: evidence.checks, errors: evidence.errors }));
} catch (error) {
  evidence.failure = String(error);
  await page?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  await writeFile(`${output}/failure.json`, JSON.stringify(evidence, null, 2));
  throw error;
} finally { await browser.close(); }
