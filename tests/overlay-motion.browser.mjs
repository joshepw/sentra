import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = process.env.EDGE_TEST_ORIGIN ?? 'http://127.0.0.1:8266';
const output = process.env.EDGE_EVIDENCE_DIR ?? 'test-artifacts/overlay-motion';
const media = await readFile(process.env.EDGE_MOTION_VIDEO);
const started = 1790773440, segment = 'b'.repeat(24);
const boxAt = t => { const x = .45 + .29 * Math.sin(t * 1.2); return [x - .07, .4, x + .07, .65]; };
const frames = Array.from({ length: 120 }, (_, i) => ({ camera: 'seguros', session: 'fixture',
  captured_at: started + i / 10, source_pts: i / 10, width: 640, height: 360, region_revision: 20,
  objects: [{ id: 42, class_id: 2, label: 'Carro', score: .95,
    box: boxAt(Math.max(0, i / 10 - .12)), display_box: boxAt(i / 10), display_box_source: 'detector' }],
}));
const result = { checks: [], errors: [] };
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/google/chrome/chrome', headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'] });
let page;
try {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 393, height: 668 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    page = await context.newPage(); page.on('pageerror', error => result.errors.push(error.message));
    await page.addInitScript(() => {
      const stroke = CanvasRenderingContext2D.prototype.strokeRect;
      CanvasRenderingContext2D.prototype.strokeRect = function (...args) {
        if (this.canvas.hasAttribute('data-history-overlay') && this.strokeStyle === '#57f1aa') this.canvas.lastBox = args;
        return stroke.apply(this, args);
      };
    });
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.route('**/edge/auth/**', route => route.abort());
    await page.route('**/edge/media/**', route => route.abort());
    await page.route('**/overlay-motion-fixture.mp4', route => {
      const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? '');
      const start = Number(range?.[1] ?? 0), end = Math.min(Number(range?.[2] || media.length - 1), media.length - 1);
      return route.fulfill({ status: range ? 206 : 200, contentType: 'video/mp4', body: media.subarray(start, end + 1),
        headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${media.length}` } : {}) } });
    });
    await page.route('**/senttra/hls.min.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.Hls = class { static isSupported() { return false; } };' }));
    await page.route('**/edge/api/**', route => {
      const path = new URL(route.request().url()).pathname; let body;
      if (path.endsWith('/live/bootstrap')) body = { cameras: [{ key: 'seguros', title: 'Seguros Atlántida', receiving: false, url: '/unused.m3u8' }], user: { csrf: 'fixture' }, storage: {} };
      else if (path.endsWith('/history/coverage')) body = { runs: [] };
      else if (path.endsWith('/history/chat') || path.includes('/history/chat/')) body = { id: 'a'.repeat(32), status: 'complete', phase: 'complete', result: { items: [{
        uid: 'c'.repeat(24), camera: 'seguros', title: 'Seguros Atlántida', type: 'turismo', first: started + 1,
        playback: { camera: 'seguros', at: started + 1, run_id: 'fixture' },
      }], total: 1 } };
      else if (path.endsWith('/live/archive')) body = { segments: [{ id: segment, started, ended: started + 12, duration: 12, state: 'ok', url: '/overlay-motion-fixture.mp4' }], gaps: [] };
      else if (path.endsWith('/history/frames')) body = { frames, incidents: [], focus: null };
      return route.fulfill({ status: body ? 200 : 404, json: body ?? {} });
    });
    await page.goto(origin + '/edge');
    await page.getByRole('button', { name: 'Silenciar voz', exact: true }).click();
    await page.getByRole('textbox', { name: 'Consulta de cámaras' }).fill('Vehículo de prueba');
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    await page.getByRole('button', { name: 'Ver video', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-history-overlay]')?.dataset.boxes === '1');
    const video = page.locator('[data-result-video]');
    await page.getByRole('region', { name: 'Video del resultado' }).getByRole('button', { name: 'Pausar', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-result-video]')?.paused);
    const measure = () => page.evaluate(() => {
      const video = document.querySelector('[data-result-video]'), overlay = document.querySelector('[data-history-overlay]');
      const sample = document.createElement('canvas'); sample.width = 640; sample.height = 360;
      const context = sample.getContext('2d'); context.drawImage(video, 0, 0, 640, 360);
      const pixels = context.getImageData(0, 180, 640, 1).data; const white = [];
      for (let x = 0; x < 640; x++) if (pixels[x * 4] > 235 && pixels[x * 4 + 1] > 235 && pixels[x * 4 + 2] > 235) white.push(x);
      const rect = overlay.getBoundingClientRect(), scale = Math.min(rect.width / 640, rect.height / 360);
      const left = (rect.width - 640 * scale) / 2;
      const box = overlay.lastBox;
      const drawnCenter = (box[0] + box[2] / 2 - left) / scale;
      const imageCenter = (white[0] + white.at(-1)) / 2;
      return { imageCenter, drawnCenter, error: Math.abs(imageCenter - drawnCenter), time: video.currentTime,
        overlayTime: Number(overlay.dataset.time), paused: video.paused, ready: video.readyState, boxes: overlay.dataset.boxes };
    });
    // Pixel positions come from the decoded MP4, independently of drawing calls.
    // The stored tracking rectangle trails by 120 ms; using it fails these checks.
    for (const at of [2.7, 4.8, 1.6, 7.8, 3.3]) {
      await video.evaluate((v, at) => { v.pause(); v.currentTime = at; }, at);
      await page.waitForFunction(at => { const v = document.querySelector('[data-result-video]'), c = document.querySelector('[data-history-overlay]');
        return !v.seeking && Math.abs(Number(c?.dataset.time) - 1790773440 - at) < .05; }, at);
      const sample = await measure();
      assert(sample.paused, 'Seek inspection must keep playback paused');
      assert(sample.error < 4, `Paused/rewound box trails decoded picture: ${JSON.stringify(sample)}`);
      result.checks.push({ viewport, mode: 'pause/seek', sample });
    }
    await page.screenshot({ path: `${output}/${viewport.width}-aligned.png` });
    await video.evaluate(v => { v.currentTime = 4; });
    await page.waitForFunction(() => !document.querySelector('[data-result-video]').seeking);
    await video.evaluate(v => v.play());
    const samples = [];
    for (let i = 0; i < 15; i++) { await page.waitForTimeout(80); samples.push(await measure()); }
    const errors = samples.map(s => s.error).sort((a, b) => a - b);
    assert(errors[7] < 5 && errors[13] < 12, `Moving picture/canvas mismatch: ${JSON.stringify(samples)}`);
    result.checks.push({ viewport, mode: 'playing', median: errors[7], p93: errors[13], samples });
    await context.close(); page = null;
  }
  assert.deepEqual(result.errors, []);
  await writeFile(`${output}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ checks: result.checks.length, errors: result.errors, playing: result.checks.filter(c => c.mode === 'playing') }));
} catch (error) {
  result.failure = String(error); await page?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  await writeFile(`${output}/failure.json`, JSON.stringify(result, null, 2)); throw error;
} finally { await browser.close(); }
