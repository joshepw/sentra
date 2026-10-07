import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = process.env.EDGE_TEST_ORIGIN ?? 'http://127.0.0.1:8267';
const output = process.env.EDGE_EVIDENCE_DIR ?? 'test-artifacts/case-file';
assert(process.env.EDGE_TEST_VIDEO, 'Supply a synthetic 60-second MP4 through EDGE_TEST_VIDEO');
const videoBytes = await readFile(process.env.EDGE_TEST_VIDEO);
await mkdir(output, { recursive: true });
const started = Date.parse('2026-09-30T07:04:00-06:00') / 1000;
const evidenceTime = 14.375;
const items = Array.from({ length: 18 }, (_, index) => ({ uid: `incident-${index + 1}`, camera: 'seguros',
  title: 'Seguros Atlántida', kind: 'uturn', review: 'candidate', type: 'auto', color: 'gris', at: started + evidenceTime,
  thumbnail_url: '/case-thumbnail.svg',
  playback: { camera: 'seguros', at: started + evidenceTime, run_id: 'fixture', track_uid: `track-${index + 1}`, incident_uid: `incident-${index + 1}` } }));
const evidence = { checks: [], errors: [], posts: [], pages: 0 };
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH ?? '/opt/google/chrome/chrome' });
let page;
const check = label => evidence.checks.push(label);

try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 393, height: 668 }]) {
    const context = await browser.newContext({ viewport, isMobile: viewport.width < 1024, hasTouch: true, serviceWorkers: 'block' });
    page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => evidence.errors.push(error.message));
    let mode = 'incidents';
    // All private requests and media are intercepted, including on the public deployment.
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.route('**/edge/auth/**', route => route.abort());
    await page.route('**/edge/media/**', route => route.abort());
    await page.route('**/missing-crop.jpg', route => route.fulfill({ status: 404, body: '' }));
    await page.route('**/case-thumbnail.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 110"><rect width="180" height="110" fill="#1c2e25"/><path d="M0 95L180 30" stroke="#778078" stroke-width="45"/><rect x="60" y="30" rx="15" width="64" height="52" fill="#b4bebb"/><rect x="69" y="43" width="46" height="25" rx="5" fill="#354b47"/><path d="M61 44v-8m62 8v-8M61 80v-8m62 8v-8" stroke="#111" stroke-width="8"/></svg>' }));
    await page.route('**/case-fixture.mp4', route => {
      const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? '');
      const start = Number(range?.[1] ?? 0), end = Math.min(Number(range?.[2] || videoBytes.length - 1), videoBytes.length - 1);
      return route.fulfill({ status: range ? 206 : 200, contentType: 'video/mp4', body: videoBytes.subarray(start, end + 1),
        headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${videoBytes.length}` } : {}) } });
    });
    await page.route('**/senttra/hls.min.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.Hls = class { static isSupported() { return false; } };' }));
    await page.route('**/edge/api/**', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname;
      if (request.method() === 'POST') evidence.posts.push(path);
      let body;
      if (path.endsWith('/live/bootstrap')) body = { cameras: [{ key: 'seguros', title: 'Seguros Atlántida', receiving: false, url: '/unused.m3u8' },
        { key: 'little', title: 'Little Caesars', receiving: false, url: '/unused.m3u8' }], user: { csrf: 'fixture-only' }, storage: {} };
      else if (path.endsWith('/history/coverage')) body = { runs: [] };
      else if (path.endsWith('/history/chat')) {
        let result = { items: items.slice(0, 12), total: 18, next_cursor: 'page-2', counting: 'candidate_events', filters: { kind: 'uturn' } };
        if (mode === 'person') result = { total: 1, items: [{ ...items[0], uid: 'person-1', kind: undefined, type: 'persona', class_id: 0 }], counting: 'appearances' };
        if (mode === 'vehicle') result = { total: 1, items: [{ ...items[0], uid: 'vehicle-1', kind: undefined }], counting: 'appearances' };
        if (mode === 'missing-crop' || mode === 'broken-crop') result = { total: 1, items: [{ ...items[0], uid: mode, thumbnail_url: mode === 'missing-crop' ? null : '/missing-crop.jpg' }] };
        if (mode === 'other-camera') result = { total: 1, items: [{ ...items[3], camera: 'little', title: 'Little Caesars', playback: { ...items[3].playback, camera: 'little' } }] };
        if (mode === 'time') result = { playback: { camera: 'seguros', at: started + 14, run_id: 'fixture', source: 'camera_time', segment_id: 'fixture-segment' } };
        body = { id: 'a'.repeat(32), status: 'complete', phase: 'complete', result };
      } else if (path.endsWith('/history/incidents') && url.searchParams.has('cursor')) {
        evidence.pages++; body = { items: items.slice(12), total: 18, counting: 'candidate_events', filters: { kind: 'uturn' } };
      } else if (path.endsWith('/live/archive')) body = { segments: [{ id: 'fixture-segment', started, ended: started + 60, state: 'ok', url: '/case-fixture.mp4' }], gaps: [] };
      else if (path.endsWith('/history/frames')) body = { frames: [], incidents: [], focus: null };
      await route.fulfill({ status: body ? 200 : 404, json: body ?? {} });
    });
    await page.goto(origin + '/edge');
    await page.getByRole('button', { name: 'Silenciar voz', exact: true }).click();
    const query = async kind => {
      mode = kind;
      await page.getByRole('textbox', { name: 'Consulta de cámaras' }).fill(kind);
      const submitted = page.waitForResponse(response => new URL(response.url()).pathname === '/edge/api/history/chat' && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Enviar', exact: true }).click();
      await (await submitted).finished();
      await page.getByRole('tab', { name: 'Resultados', exact: true }).waitFor();
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent === 'Grabar voz' && !button.disabled));
    };
    const resultsTab = page.getByRole('tab', { name: 'Resultados', exact: true });
    const caseTab = page.getByRole('tab', { name: 'Ficha', exact: true });
    const open = async number => {
      await resultsTab.click();
      await page.locator(`[data-result-number="${number}"]`).getByRole('button', { name: 'Ver video', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-result-video]')?.readyState >= 2);
    };
    await query('incidents');
    await page.getByRole('heading', { name: '18 incidencias', exact: true }).waitFor();
    assert(await caseTab.isDisabled());
    await page.locator('[data-result-number="4"]').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('[data-result-number="4"] img')?.naturalWidth > 0);
    const scrollBefore = await page.locator('[data-result-list]').evaluate(element => element.scrollTop);
    await open(4);
    assert.equal(await caseTab.getAttribute('aria-selected'), 'true');
    assert.equal(await page.getByRole('button', { name: /Mostrar mapa y actividad/ }).getAttribute('aria-expanded'), 'false');
    const player = page.getByRole('region', { name: 'Video del resultado' });
    await player.getByRole('button', { name: 'Pausar', exact: true }).click();
    await page.evaluate(() => { window.caseVideo = document.querySelector('[data-result-video]'); window.caseTime = window.caseVideo.currentTime; });
    const plate = await page.locator('[data-demo-plate]').innerText();
    const number = await page.locator('[data-case-number]').innerText();
    await page.waitForFunction(() => {
      const crop = document.querySelector('[data-case-file] img[alt="Recorte de la observación"]');
      const portrait = document.querySelector('[data-demo-portrait]');
      return crop?.naturalWidth > 0 && portrait?.naturalWidth === 200 && portrait?.naturalHeight === 250;
    });
    const portraitSource = await page.locator('[data-demo-portrait]').getAttribute('src');
    assert(await page.locator('[data-demo-owner]').getByText('Foto ficticia', { exact: true }).isVisible());
    assert(await page.getByText('Sin identificar', { exact: true }).isVisible());
    check(`${viewport.width}: incident crop loads in list and case; shipped fictional portrait is visible without expanding details`);
    const caseRect = await page.getByRole('complementary', { name: 'Resultados de la consulta' }).boundingBox();
    if (viewport.width >= 1024) {
      assert(Math.abs(caseRect.width - 340) <= 1);
      const box = await player.boundingBox();
      assert(box.x + box.width < caseRect.x && box.width > 900);
    }
    await page.screenshot({ path: `${output}/${viewport.width}-case.png` });
    await resultsTab.click();
    assert(Math.abs(await page.locator('[data-result-list]').evaluate(element => element.scrollTop) - scrollBefore) < 2, 'Opening a case preserves the list position');
    await resultsTab.press('ArrowRight');
    assert.equal(await caseTab.getAttribute('aria-selected'), 'true');
    assert(await page.evaluate(() => window.caseVideo === document.querySelector('[data-result-video]') && window.caseVideo.paused && Math.abs(window.caseVideo.currentTime - window.caseTime) < .05));
    await page.getByRole('button', { name: /Mostrar mapa y actividad/ }).click();
    assert(await page.getByLabel('Mapa del corredor', { exact: true }).isVisible());
    await page.getByRole('button', { name: /Ocultar mapa y actividad/ }).click();
    assert(await page.evaluate(() => window.caseVideo === document.querySelector('[data-result-video]')));
    check(`${viewport.width}: two columns, automatic case tab, saved result scroll, keyboard tabs and map preserve video`);

    await page.locator('[data-result-video]').evaluate(video => { video.pause(); video.currentTime = 25; });
    await page.waitForFunction(() => Math.abs(document.querySelector('[data-result-video]')?.currentTime - 25) < .05);
    await page.getByRole('button', { name: 'Volver al momento', exact: true }).click();
    await page.waitForFunction(at => {
      const video = document.querySelector('[data-result-video]');
      return video?.paused && !video.seeking && Math.abs(video.currentTime - at) < .05;
    }, evidenceTime);
    await page.getByRole('button', { name: 'Volver al momento', exact: true }).click();
    await page.getByRole('button', { name: 'Volver al momento', exact: true }).waitFor();
    assert.equal(await page.locator('[data-case-file] [role="alert"]').count(), 0, 'Returning again at the same timestamp succeeds');
    assert(await page.evaluate(() => window.caseVideo === document.querySelector('[data-result-video]')));
    check(`${viewport.width}: replay returns to the evidence timestamp and preserves paused video`);

    await page.getByText('Identificación y licencia simuladas', { exact: true }).click();
    await page.getByText('Sin identificar', { exact: true }).waitFor();
    await page.getByRole('textbox', { name: /Observación del agente/ }).fill('Se revisó el tramo completo. Nota de demostración.');
    await page.getByRole('button', { name: 'Confirmar infracción · Demo', exact: true }).click();
    assert.match(await page.locator('[data-case-decision]').innerText(), /Confirmada/);
    assert.match(await page.locator('[data-case-file]').innerText(), /Revisión guardada: pendiente/);
    await page.getByRole('button', { name: 'Preparar acta · Demo', exact: true }).click();
    const report = page.getByRole('dialog', { name: 'Acta de demostración' });
    assert(await report.isVisible());
    assert.match(await report.innerText(), /SIN VALIDEZ OFICIAL/);
    assert((await report.innerText()).includes(plate));
    assert((await report.innerText()).includes(number));
    assert((await report.innerText()).includes('Se revisó el tramo completo.'));
    await page.waitForFunction(() => document.querySelector('[data-report-portrait]')?.naturalWidth > 0);
    assert.equal(await report.locator('[data-report-portrait]').getAttribute('src'), portraitSource);
    await page.screenshot({ path: `${output}/${viewport.width}-report.png` });
    await page.keyboard.press('Escape');
    assert(!(await report.isVisible()));
    await page.getByRole('button', { name: 'Siguiente resultado', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: /Observación del agente/ }).inputValue(), '');
    assert.match(await page.locator('[data-case-decision]').innerText(), /Pendiente/);
    await page.getByRole('button', { name: 'Resultado anterior', exact: true }).click();
    assert.equal(await page.locator('[data-demo-plate]').innerText(), plate);
    assert.equal(await page.locator('[data-demo-portrait]').getAttribute('src'), portraitSource);
    assert.match(await page.getByRole('textbox', { name: /Observación del agente/ }).inputValue(), /tramo completo/);
    assert.match(await page.locator('[data-case-decision]').innerText(), /Confirmada/);
    await page.getByRole('button', { name: 'Descartar · Demo', exact: true }).click();
    await page.getByRole('button', { name: 'Dejar pendiente', exact: true }).click();
    assert.match(await page.locator('[data-case-decision]').innerText(), /Pendiente/);
    check(`${viewport.width}: stable simulated profile, notes, confirmation, acta, reversible decisions and case isolation`);

    if (viewport.width < 1024) {
      await page.getByRole('button', { name: /Contraer ficha/ }).click();
      assert(!(await page.locator('[data-case-file]').isVisible()));
      await page.getByRole('button', { name: /Expandir ficha/ }).click();
      assert(await page.locator('[data-case-file]').isVisible());
    }
    for (const size of viewport.width >= 1024 ? [{ width: 1366, height: 768 }, { width: 1024, height: 768 }] : [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      await page.locator('[data-result-video]').scrollIntoViewIfNeeded();
      const metrics = await page.locator('[data-result-video]').evaluate(video => ({ width: video.getBoundingClientRect().width,
        height: video.getBoundingClientRect().height, decoded: video.videoWidth, overflow: document.documentElement.scrollWidth > innerWidth }));
      assert(metrics.height >= 160 && metrics.decoded > 0 && !metrics.overflow, JSON.stringify({ size, metrics }));
      await page.getByRole('button', { name: 'Confirmar infracción · Demo', exact: true }).scrollIntoViewIfNeeded();
      assert(await page.getByRole('textbox', { name: 'Consulta de cámaras' }).isVisible());
      await page.screenshot({ path: `${output}/${size.width}x${size.height}-layout.png` });
      check(`${size.width}x${size.height}: readable video and reachable case actions without horizontal overflow`);
    }
    await page.setViewportSize(viewport);
    await player.getByRole('button', { name: 'Cerrar video', exact: true }).click();
    assert.equal(await resultsTab.getAttribute('aria-selected'), 'true');
    assert(await caseTab.isDisabled());
    assert(await page.getByLabel('Mapa del corredor', { exact: true }).isVisible());
    await open(4);
    assert.match(await page.getByRole('textbox', { name: /Observación del agente/ }).inputValue(), /tramo completo/);
    await open(12);
    const pageCount = evidence.pages;
    await page.getByRole('button', { name: 'Siguiente resultado', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-result-context]')?.textContent.includes('13 / 18'));
    assert.equal(evidence.pages, pageCount + 1);
    check(`${viewport.width}: next-case navigation loads only the required result page`);
    await query('person'); await open(1);
    assert.equal(await page.locator('[data-demo-plate]').count(), 0);
    assert.equal(await page.locator('[data-demo-portrait]').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Confirmar infracción · Demo', exact: true }).count(), 0);
    for (const cropMode of ['missing-crop', 'broken-crop']) {
      await query(cropMode); await open(1);
      await page.getByText('Sin recorte disponible', { exact: true }).waitFor();
      await page.waitForFunction(() => document.querySelector('[data-demo-portrait]')?.naturalWidth > 0);
      assert.equal(await page.locator('[data-case-file] img[alt="Recorte de la observación"]').count(), 0);
    }
    check(`${viewport.width}: absent and failed evidence crops keep their own fallback and never use a portrait`);
    await query('vehicle'); await open(1);
    assert.equal(await page.locator('[data-demo-plate]').count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Confirmar infracción · Demo', exact: true }).count(), 0);
    await query('other-camera'); await open(1);
    assert.equal(await page.getByRole('textbox', { name: /Observación del agente/ }).inputValue(), '');
    assert.notEqual(await page.locator('[data-demo-plate]').innerText(), plate);
    await query('time');
    await page.waitForFunction(() => document.querySelector('[role="tab"][aria-controls$="case-panel"]')?.disabled);
    assert(await caseTab.isDisabled());
    check(`${viewport.width}: no invented person identities or incidents, camera isolation and camera/time playback retained`);
    await context.close(); page = null;
  }
  assert(evidence.posts.every(path => path.endsWith('/history/chat')), `The demonstration must never write reviews: ${JSON.stringify(evidence.posts)}`);
  assert.deepEqual(evidence.errors, []);
  await writeFile(`${output}/result.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ checks: evidence.checks, reviewWrites: 0, errors: evidence.errors }));
} catch (error) {
  evidence.failure = String(error);
  await page?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  await writeFile(`${output}/failure.json`, JSON.stringify(evidence, null, 2));
  throw error;
} finally { await browser.close(); }
