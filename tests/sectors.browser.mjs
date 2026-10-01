import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? '/home/paal/tmp-codex-test/worktrees/wheel-dev-guide/node_modules/playwright');
const origin = process.env.EDGE_TEST_ORIGIN ?? 'http://127.0.0.1:8782';
const output = process.env.EDGE_EVIDENCE_DIR ?? 'test-artifacts/sectors';
const bytes = await readFile(process.env.EDGE_TEST_VIDEO ?? 'test-artifacts/edge-layout/fixture.mp4');
await mkdir(output, { recursive: true });
const cameras = [
  ['crowne1', 'Crowne Plaza 1'], ['seguros', 'Seguros Atlántida'], ['seguros1', 'Seguros Atlántida 1'],
  ['seguros2', 'Seguros Atlántida 2'], ['little', 'Little Caesars'], ['little1', 'Little Caesars 1'], ['axis9', '9 Avenida'],
].map(([key, title]) => ({ key, title }));
const sectors = { armenta: 'Armenta', satelite: 'La Satélite', andes: 'Los Andes', guamilito: 'Guamilito', trejo: 'La Trejo' };
const at = Date.parse('2026-09-30T07:00:00-06:00') / 1000;
const playback = { camera: 'little', at: at + 5, source: 'camera_time', segment_id: 'a'.repeat(24), run_id: null };
const evidence = { checks: [], requests: [], receipts: [], media: [], errors: [] };
const browser = await chromium.launch({ headless: true, executablePath: '/opt/google/chrome/chrome',
  args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
let action, job, count = 0, delayedAction = false, archiveDelay = 0, archiveRequests = 0, receiving = true;
const waitUntil = async predicate => {
  const deadline = Date.now() + 25000;
  while (!predicate()) { assert(Date.now() < deadline, 'Fixture timed out'); await new Promise(resolve => setTimeout(resolve, 25)); }
};
try {
  page.on('pageerror', error => evidence.errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.route('**/fixture-sectors.mp4*', route => {
    evidence.media.push(route.request().url());
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? '');
    const start = range ? Number(range[1]) : 0, end = range?.[2] ? Number(range[2]) : bytes.length - 1;
    return route.fulfill({ status: range ? 206 : 200, contentType: 'video/mp4', body: bytes.subarray(start, end + 1),
      headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } : {}) } });
  });
  await page.route('**/edge/media/**', route => route.abort());
  await page.route('**/senttra/hls.min.js', route => route.fulfill({ contentType: 'application/javascript', body: `
    window.Hls = class {
      static isSupported() { return true; }
      static Events = { ERROR: 'error', FRAG_BUFFERED: 'buffered', FRAG_CHANGED: 'changed' };
      loadSource(source) { this.source = source; } on() {} destroy() {}
      attachMedia(video) { video.loop = true; video.src = '/fixture-sectors.mp4?camera=' + encodeURIComponent(this.source); }
    };
  ` }));
  await page.route('**/edge/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body;
    if (path.endsWith('/live/bootstrap')) body = { cameras: cameras.map(camera => ({ ...camera, receiving,
      url: `/edge/media/live/${camera.key}/index.m3u8` })), user: { csrf: 'fixture-only' }, storage: {} };
    else if (path.endsWith('/history/coverage')) body = { runs: [] };
    else if (path.endsWith('/live/archive')) {
      archiveRequests++;
      if (archiveDelay) await new Promise(resolve => setTimeout(resolve, archiveDelay));
      body = { segments: [{ id: playback.segment_id, started: at, ended: at + 60, state: 'ok', url: '/fixture-sectors.mp4?archive=1' }], gaps: [] };
    } else if (path.endsWith('/history/chat')) {
      const request = route.request().postDataJSON();
      evidence.requests.push({ text: request.text, audio: !!request.audio, viewer: request.viewer });
      job = { id: (++count).toString(16).padStart(32, '0'), status: 'waiting_action', phase: 'applying',
        action: { ...action, revision: request.viewer.revision } };
      if (action.kind === 'fixture_search') {
        job = { id: job.id, status: 'complete', phase: 'complete', result: { total: 1, counting: 'appearances', filters: {}, items: [{
          uid: 'e'.repeat(24), camera: 'little', title: 'Little Caesars', type: 'paila', color: 'rojo', first: at,
          playback: { camera: 'little', at, run_id: 'fixture', track_uid: 'e'.repeat(24) },
        }] } };
      }
      body = delayedAction ? { ...job, status: 'queued', action: undefined } : job;
    } else if (path.endsWith('/applied')) {
      const receipt = route.request().postDataJSON(); evidence.receipts.push(receipt);
      body = { ...job, status: 'complete', phase: 'complete', reply: receipt.status === 'applied' ? 'Vista actualizada.' : 'La vista cambió.' };
    } else if (path.includes('/history/chat/')) {
      if (delayedAction) await new Promise(resolve => setTimeout(resolve, 800));
      body = job;
    }
    await route.fulfill({ status: body ? 200 : 404, json: body ?? {} });
  });
  await page.goto(origin + '/edge');
  await page.getByRole('button', { name: 'Silenciar voz', exact: true }).click();
  const directory = () => page.getByRole('region', { name: 'Sectores', exact: true });
  const openFirst = () => page.getByRole('button', { name: 'Abrir sector 1era Calle', exact: true }).click();
  const back = () => page.getByRole('button', { name: 'Ver sectores', exact: true }).click();
  const idle = () => page.waitForFunction(() => !document.querySelector('button[aria-haspopup="dialog"]')?.disabled);
  const send = async (text, changes, { microphone = false, wait = true } = {}) => {
    action = changes.kind ? changes : { kind: 'view', changes };
    const before = evidence.receipts.length;
    if (microphone) {
      await page.getByRole('button', { name: 'Grabar voz', exact: true }).click();
      await page.getByRole('button', { name: 'Enviar voz', exact: true }).waitFor();
      await page.waitForTimeout(700);
      await page.getByRole('button', { name: 'Enviar voz', exact: true }).click();
    } else {
      await page.getByRole('textbox', { name: 'Consulta de cámaras' }).fill(text);
      await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    }
    if (wait) {
      await waitUntil(() => evidence.receipts.length > before);
      assert.equal(evidence.receipts.at(-1).status, 'applied');
      await idle();
    }
  };
  await directory().waitFor();
  assert.equal(await page.locator('[data-sector]').count(), 6);
  assert.equal(await page.locator('video').count(), 0);
  assert.equal(evidence.media.length, 0);
  assert.equal(await page.getByText('Sin cámaras conectadas', { exact: true }).count(), 5);
  assert.match(await page.locator('[data-sector="primera_calle"]').innerText(), /7 cámaras/);
  await page.screenshot({ path: `${output}/sectors-desktop.png`, fullPage: true });
  evidence.checks.push('Default directory shows six sectors, seven real configured cameras, five empty sectors, and no media players or downloads');

  await send('Pailas rojas', { kind: 'fixture_search' }, { wait: false });
  await page.locator('[data-result-number]').waitFor(); await idle();
  assert.match(await page.getByRole('navigation', { name: 'Navegación de sectores' }).innerText(), /1era Calle/);
  await back();
  evidence.checks.push('A real search from the directory opens its results in 1era Calle');

  await openFirst();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-live-video]')].filter(v => v.readyState >= 2 && !v.paused).length === 7);
  assert.deepEqual(await page.locator('[data-live-camera]').evaluateAll(nodes => nodes.map(node => node.dataset.liveCamera).sort()), cameras.map(c => c.key).sort());
  await page.screenshot({ path: `${output}/first-street-desktop.png`, fullPage: true });
  evidence.checks.push('Clicking 1era Calle opens all seven configured cameras together with actual native playback');

  for (const [id, title] of Object.entries(sectors)) {
    await back();
    const before = evidence.media.length;
    await page.getByRole('button', { name: `Abrir sector ${title}`, exact: true }).click();
    assert.equal(await page.locator(`[data-empty-sector="${id}"]`).count(), 1);
    assert.equal(await page.locator('video').count(), 0);
    assert.equal(await page.getByLabel('Mapa y tráfico del corredor', { exact: true }).count(), 0);
    assert.equal(await page.getByLabel('Resultados de la consulta', { exact: true }).count(), 0);
    await page.waitForTimeout(100);
    assert.equal(evidence.media.length, before);
  }
  evidence.checks.push('Each empty sector opens honestly without players, downloads, another sector map, traffic or search results');

  await send('Mostrame los sectores', { sector: null, close_video: true });
  await directory().waitFor();
  assert.equal(evidence.requests.at(-1).viewer.sector, 'trejo');
  assert.deepEqual(evidence.requests.at(-1).viewer.result_ids, []);
  assert.deepEqual(evidence.requests.at(-1).viewer.filters, {});
  await send('Mostrame 1era Calle', { sector: 'primera_calle', all: true, mode: 'live', close_video: true });
  assert.equal(await page.locator('[data-live-camera]').count(), 7);
  await send('', { sector: 'satelite', close_video: true }, { microphone: true });
  assert(evidence.requests.at(-1).audio);
  assert.equal(await page.locator('[data-empty-sector="satelite"]').count(), 1);
  evidence.checks.push('Text and microphone actions navigate directory, all seven cameras and an empty sector with correctly scoped viewer context');

  await send('Mostrame Little Caesars a las 7', { kind: 'open_archive', playback });
  assert.equal(await page.locator('[data-result-video]').count(), 1);
  assert.match(await page.getByRole('navigation', { name: 'Navegación de sectores' }).innerText(), /1era Calle/);
  await send('Volvé a los sectores', { sector: null, close_video: true });
  await directory().waitFor();
  assert.equal(await page.locator('video').count(), 0);
  evidence.checks.push('A named real camera opens its archive from an empty sector; returning to sectors closes archive playback');

  delayedAction = true;
  let before = evidence.receipts.length;
  await send('Mostrame 1era Calle', { sector: 'primera_calle', all: true, mode: 'live', close_video: true }, { wait: false });
  await page.getByRole('button', { name: 'Abrir sector Armenta', exact: true }).click();
  await waitUntil(() => evidence.receipts.length > before); await idle();
  assert.equal(evidence.receipts.at(-1).status, 'stale');
  assert.equal(await page.locator('[data-empty-sector="armenta"]').count(), 1);
  assert.equal(await page.locator('video').count(), 0);
  delayedAction = false;
  await back(); await openFirst();
  archiveDelay = 1200; before = evidence.receipts.length;
  const archiveBefore = archiveRequests;
  await send('Abrí Little Caesars a las 7', { kind: 'open_archive', playback }, { wait: false });
  await waitUntil(() => archiveRequests > archiveBefore);
  await back();
  await waitUntil(() => evidence.receipts.length > before); await idle();
  await page.waitForTimeout(1300);
  assert.equal(evidence.receipts.at(-1).status, 'stale');
  assert.equal(await page.locator('video').count(), 0);
  await directory().waitFor();
  evidence.checks.push('Manual sector navigation rejects both a delayed voice action and an archive load without reviving hidden video');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/sectors-mobile.png`, fullPage: true });
  const trejo = page.getByRole('button', { name: 'Abrir sector La Trejo', exact: true });
  await trejo.scrollIntoViewIfNeeded(); await trejo.click();
  await page.screenshot({ path: `${output}/empty-mobile.png`, fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole('button', { name: 'Ver cámaras de 1era Calle', exact: true }).click();
  assert.equal(await page.locator('[data-live-camera]').count(), 7);
  await back(); receiving = false;
  await page.waitForFunction(() => document.querySelector('[data-sector="primera_calle"]')?.textContent.includes('0 en vivo'));
  assert.match(await page.locator('[data-sector="primera_calle"]').innerText(), /7 cámaras/);
  evidence.checks.push('Mobile reaches every sector; a signal outage changes live counts without removing the seven configured cameras');
  assert.deepEqual(evidence.errors, []);
  console.log(JSON.stringify({ checks: evidence.checks, receipts: evidence.receipts.length, errors: evidence.errors }));
} finally {
  await writeFile(`${output}/result.json`, JSON.stringify(evidence, null, 2));
  await browser.close();
}
