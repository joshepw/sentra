import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = process.env.EDGE_TEST_ORIGIN ?? 'http://127.0.0.1:8268';
const output = process.env.EDGE_EVIDENCE_DIR ?? 'test-artifacts/curated-incident';
assert(process.env.EDGE_CURATED_FIXTURE && process.env.EDGE_TEST_VIDEO, 'Supply captured API fixtures and the matching original segment');
const root = process.env.EDGE_CURATED_FIXTURE;
const fixture = JSON.parse(await readFile(path.join(root, 'browser-fixture.json'), 'utf8'));
const segment = JSON.parse(await readFile(path.join(root, 'segment.json'), 'utf8'));
const videoBytes = await readFile(process.env.EDGE_TEST_VIDEO);
const item = fixture.result.items[0], ids = item.details.participants.map(participant => participant.local_id);
assert.equal(fixture.result.total, 1); assert.equal(ids.length, 2);
await mkdir(output, { recursive: true });
const evidence = { checks: [], errors: [], requests: [], writes: [] };
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH ?? '/opt/google/chrome/chrome' });
let page;
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 393, height: 668 }]) {
    const context = await browser.newContext({ viewport, isMobile: viewport.width < 1024, hasTouch: true, serviceWorkers: 'block' });
    page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => evidence.errors.push(error.message));
    await page.addInitScript(() => {
      for (const name of ['clearRect', 'strokeRect', 'fillText']) {
        const original = CanvasRenderingContext2D.prototype[name];
        CanvasRenderingContext2D.prototype[name] = function (...args) {
          if (this.canvas.hasAttribute('data-history-overlay')) {
            if (name === 'clearRect') this.canvas.drawn = [];
            else (this.canvas.drawn ??= []).push({ name, color: name === 'strokeRect' ? this.strokeStyle : this.fillStyle, args });
          }
          return original.apply(this, args);
        };
      }
    });
    // Public-deployment checks never use real sessions or issue production writes.
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.route('**/edge/auth/**', route => route.abort());
    await page.route('**/edge/media/**', async route => {
      const requestPath = new URL(route.request().url()).pathname;
      if (requestPath === item.thumbnail_url) return route.fulfill({ contentType: 'image/jpeg', body: await readFile(path.join(root, 'fixture/history/thumbs', path.basename(requestPath))) });
      return route.abort();
    });
    await page.route('**/curated-fixture.mp4', route => {
      const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? '');
      const start = Number(range?.[1] ?? 0), end = Math.min(Number(range?.[2] || videoBytes.length - 1), videoBytes.length - 1);
      return route.fulfill({ status: range ? 206 : 200, contentType: 'video/mp4', body: videoBytes.subarray(start, end + 1),
        headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${videoBytes.length}` } : {}) } });
    });
    await page.route('**/senttra/hls.min.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.Hls = class { static isSupported() { return false; } };' }));
    await page.route('**/edge/api/**', async route => {
      const request = route.request(), url = new URL(request.url()), requestPath = url.pathname;
      if (request.method() !== 'GET') evidence.writes.push(requestPath);
      let body;
      if (requestPath.endsWith('/live/bootstrap')) body = { cameras: [{ key: item.camera, title: item.title, receiving: false, url: '/unused.m3u8' }], user: { csrf: 'fixture-only' }, storage: {} };
      else if (requestPath.endsWith('/history/coverage')) body = fixture.result.coverage;
      else if (requestPath.endsWith('/history/incidents')) {
        if (url.searchParams.get('kind') === 'incidente') { evidence.requests.push(url.search); body = fixture.result; }
        else body = { items: [], total: 0, counting: 'candidate_events', filters: {} };
      } else if (requestPath.endsWith('/live/archive')) body = { segments: [{ id: segment.id, started: segment.started, ended: segment.ended, state: 'ok', url: '/curated-fixture.mp4' }], gaps: [] };
      else if (requestPath.endsWith('/history/frames')) body = fixture.metadata;
      await route.fulfill({ status: body ? 200 : 404, json: body ?? {} });
    });
    const check = text => evidence.checks.push(`${viewport.width}: ${text}`);
    await page.goto(origin + '/edge');
    await page.getByRole('button', { name: 'Silenciar voz', exact: true }).click();
    await page.getByRole('button', { name: /1era Calle/ }).first().click();
    await page.getByRole('button', { name: 'Incidente', exact: true }).click();
    await page.getByRole('heading', { name: '1 incidente', exact: true }).waitFor();
    assert.equal(await page.locator('[data-result-number]').count(), 1);
    await page.waitForFunction(() => { const image = document.querySelector('[data-result-number] img'); return image?.complete && image.naturalWidth > 0; });
    assert((await page.locator('[data-result-number]').innerText()).includes('Incidente'));
    assert(!(await page.locator('[data-result-number]').innerText()).includes('cruce en rojo'));
    check('one saved case, correct category and real thumbnail');
    await page.getByRole('button', { name: 'Ver video', exact: true }).click();
    const player = page.getByRole('region', { name: 'Video del resultado' });
    await page.waitForFunction(() => document.querySelector('[data-result-video]')?.readyState >= 2);
    await player.getByRole('button', { name: 'Pausar', exact: true }).click();
    const initialAt = await page.locator('[data-result-video]').evaluate(video => Number(video.dataset.started) + video.currentTime);
    assert(initialAt < item.at - 5 && initialAt >= item.at - 8.1, 'Playback includes the lead-in');
    await page.getByRole('heading', { name: 'Incidente', exact: true }).waitFor();
    for (const id of ids) assert((await page.locator('[data-incident-participants]').innerText()).includes(`#${id}`));
    check('existing case file links both vehicles and starts eight seconds before the event');
    const seek = async at => {
      await page.locator('[data-result-video]').evaluate((video, value) => { video.pause(); video.currentTime = value - Number(video.dataset.started); }, at);
      await page.waitForFunction(value => {
        const video = document.querySelector('[data-result-video]'), canvas = document.querySelector('[data-history-overlay]');
        return video?.paused && !video.seeking && video.readyState >= 2 && Math.abs(Number(canvas?.dataset.time) - value) < .06;
      }, at);
      return page.locator('[data-history-overlay]').evaluate(canvas => ({ count: Number(canvas.dataset.incidents), drawn: canvas.drawn }));
    };
    let state = await seek(item.at + 1);
    assert.equal(state.count, 2);
    for (const id of ids) assert(state.drawn.some(call => call.name === 'fillText' && call.args[0].includes(`#${id}`)));
    assert.equal(state.drawn.filter(call => call.name === 'fillText' && call.args[0] === 'Pendiente: incidente').length, 2);
    assert.equal(state.drawn.filter(call => call.name === 'strokeRect' && call.color === '#ffdb68').length, 2);
    check('both real vehicles are highlighted as the same incident while paused');
    await page.screenshot({ path: `${output}/${viewport.width}-incident.png` });
    state = await seek(item.at - .15); assert.equal(state.count, 0);
    state = await seek(item.at + 1); assert.equal(state.count, 2);
    check('rewinding before the event clears the marks and seeking forward restores them');
    await player.getByRole('button', { name: 'Ocultar cajas', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-history-overlay]')?.dataset.boxes === '0');
    await player.getByRole('button', { name: 'Mostrar cajas', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-history-overlay]')?.dataset.incidents === '2');
    await page.getByRole('button', { name: 'Confirmar incidente · Demo', exact: true }).click();
    assert.equal((await page.locator('[data-history-overlay]').getAttribute('data-incidents')), '2');
    await page.getByRole('button', { name: 'Descartar · Demo', exact: true }).click();
    await page.getByRole('button', { name: 'Dejar pendiente', exact: true }).click();
    await page.getByRole('button', { name: 'Volver al momento', exact: true }).click();
    await page.waitForFunction(at => { const v = document.querySelector('[data-result-video]'); return v?.paused && !v.seeking && Math.abs(Number(v.dataset.started) + v.currentTime - at) < .05; }, item.at);
    assert(await page.getByRole('button', { name: 'Siguiente resultado', exact: true }).isDisabled());
    assert(await page.getByRole('button', { name: 'Resultado anterior', exact: true }).isDisabled());
    assert.equal(await page.getByRole('link', { name: 'Descargar evidencia', exact: true }).getAttribute('href'), item.clip_url);
    assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
    check('case controls preserve playback, there is exactly one result, evidence link and mobile layout work');
    await context.close(); page = null;
  }
  assert.deepEqual(evidence.errors, []); assert.deepEqual(evidence.writes, []); assert.equal(evidence.requests.length, 2);
  await writeFile(`${output}/result.json`, JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence));
} catch (error) {
  evidence.failure = String(error); await page?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  await writeFile(`${output}/failure.json`, JSON.stringify(evidence, null, 2)); throw error;
} finally { await browser.close(); }
