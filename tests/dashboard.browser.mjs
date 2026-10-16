import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = process.env.EDGE_TEST_ORIGIN ?? 'http://127.0.0.1:8269';
const output = process.env.EDGE_EVIDENCE_DIR ?? 'test-artifacts/dashboard';
assert(process.env.EDGE_TEST_VIDEO, 'Supply a synthetic 60-second MP4 through EDGE_TEST_VIDEO');
const video = await readFile(process.env.EDGE_TEST_VIDEO);
await mkdir(output, { recursive: true });
const at = Date.parse('2026-09-30T07:04:00-06:00') / 1000;
const cameras = [['crowne1', 'Crowne Plaza 1'], ['seguros', 'Seguros Atlántida'], ['seguros1', 'Seguros Atlántida 1'], ['seguros2', 'Seguros Atlántida 2'], ['little', 'Little Caesars'], ['little1', 'Little Caesars 1'], ['axis9', '9 Avenida']].map(([key, title]) => ({ key, title, receiving: true, url: `/edge/media/live/${key}/index.m3u8`, preview_url: `/edge/media/live/${key}/preview/index.m3u8` }));
const makeItem = (kind, index = 0) => ({ uid: `fixture-${kind ?? 'vehicle'}-${index}`, camera: 'seguros', title: 'Seguros Atlántida', kind, review: 'candidate', type: 'paila', color: 'rojo', class_id: 2,
  at: at + 15, first: at, thumbnail_url: '/fixture-thumb.svg', playback: { camera: 'seguros', at: at + 15, run_id: 'fixture', ...(kind ? { incident_uid: `fixture-${kind}-${index}` } : { track_uid: `fixture-vehicle-${index}` }) } });
const summary = {
  totals: { uturn: 1274, rojo: 326 }, counting: 'appearances_per_camera_session',
  distributions: { vehicle_colors: [{ key: 'blanco', total: 12500 }, { key: 'gris', total: 7420 }, { key: 'rojo', total: 3810 }, { key: 'azul', total: 2900 }, { key: 'sin_clasificar', total: 1200 }],
    shirt_colors: [{ key: 'negro', total: 2400 }, { key: 'blanco', total: 1900 }, { key: 'rojo', total: 800 }, { key: 'sin_clasificar', total: 280 }],
    vehicle_types: [{ key: 'turismo', total: 13900 }, { key: 'paila', total: 8100 }, { key: 'moto', total: 6300 }, { key: 'bus', total: 1200 }, { key: 'sin_clasificar', total: 1100 }] },
  hours: Array.from({ length: 24 }, (_, hour) => ({ hour, vehicles: Math.round(250 + 1700 * Math.abs(Math.sin((hour - 4) / 7))), uturn: 15 + hour * 3, rojo: hour + 2 })),
  featured: makeItem('incidente'), events: [makeItem('uturn'), makeItem('rojo'), makeItem('incidente'), makeItem('uturn', 2)],
};
const evidence = { checks: [], errors: [], catalogs: [], recordings: [], receipts: [], media: [] };
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH ?? '/opt/google/chrome/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 393, height: 852 }]) {
    const context = await browser.newContext({ viewport, isMobile: viewport.width < 700, hasTouch: viewport.width < 700, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => evidence.errors.push(error.message));
    let fail = false, expire = false, empty = false, archiveMissing = false, delayed = false, job;
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.route('**/edge/auth/**', route => route.abort());
    await page.route('**/__navigation-origin', route => route.fulfill({ contentType: 'text/html', body: '<h1>Previous page</h1><a href="/edge">Entrar a Edge</a>' }));
    await page.route('**/fixture-thumb.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120"><rect width="240" height="120" fill="#283832"/><path d="M0 110L240 10" stroke="#6e7c74" stroke-width="58"/><path d="M0 110L240 10" stroke="#d0cda4" stroke-width="2" stroke-dasharray="18 14"/><g transform="translate(90 35)rotate(-20 30 25)"><rect width="65" height="40" rx="10" fill="#adb9af"/><rect x="15" y="4" width="30" height="32" rx="4" fill="#38534c"/></g></svg>' }));
    await page.route('**/fixture-dashboard.mp4*', route => {
      const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? '');
      const start = Number(range?.[1] ?? 0), end = Math.min(Number(range?.[2] || video.length - 1), video.length - 1);
      return route.fulfill({ status: range ? 206 : 200, contentType: 'video/mp4', body: video.subarray(start, end + 1), headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${video.length}` } : {}) } });
    });
    await page.route('**/edge/media/**', route => { evidence.media.push(new URL(route.request().url()).pathname); return route.fulfill({ contentType: 'application/vnd.apple.mpegurl', body: '#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nsegment.m4s\n' }); });
    await page.route('**/senttra/hls.min.js', route => route.fulfill({ contentType: 'application/javascript', body: `window.Hls = class { static isSupported() { return true; } static Events = { ERROR:'error', FRAG_BUFFERED:'buffered', FRAG_CHANGED:'changed' }; loadSource(source) { this.source=source; } on() {} destroy() {} attachMedia(video) { video.loop=true; video.src='/fixture-dashboard.mp4'; } };` }));
    await page.route('**/edge/api/**', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname;
      let body;
      if (path.endsWith('/live/bootstrap')) body = { cameras, user: { csrf: 'fixture-only' }, storage: {} };
      else if (path.endsWith('/history/coverage')) body = { runs: [] };
      else if (path.endsWith('/history/dashboard')) {
        await new Promise(resolve => setTimeout(resolve, 350));
        if (expire || fail) return route.fulfill({ status: expire ? 401 : 503, json: { error: 'fixture unavailable' } });
        body = empty ? { ...summary, totals: { uturn: 0, rojo: 0 }, featured: null, events: [], distributions: { vehicle_colors: [], shirt_colors: [], vehicle_types: [] } } : summary;
      } else if (path.endsWith('/history/catalog')) {
        const filters = Object.fromEntries(url.searchParams); evidence.catalogs.push(filters);
        const kind = filters.category === 'incidents' ? filters.kind ?? 'uturn' : undefined;
        const item = makeItem(kind);
        if (filters.category === 'persons') Object.assign(item, { type: 'persona', class_id: 0, color: filters.color });
        body = { catalog: true, filters, total: kind === 'uturn' ? 1274 : kind === 'rojo' ? 326 : 3, counting: kind ? 'candidate_events' : 'appearances_per_camera_session', items: filters.cursor ? [{ ...item, uid: 'fixture-page-2' }] : [item, { ...item, uid: 'fixture-page-1b' }], next_cursor: filters.cursor ? null : 'next-page' };
      } else if (path.endsWith('/history/recording')) {
        evidence.recordings.push(Object.fromEntries(url.searchParams));
        body = { available: !archiveMissing, recording_request: { camera: 'seguros', at }, ...(archiveMissing ? { reason: 'no_recording' } : { playback: { camera: 'seguros', at: at + 15, source: 'camera_time', segment_id: 'fixture-segment', run_id: 'fixture' } }) };
      } else if (path.endsWith('/history/chat')) {
        job = { id: 'f'.repeat(32), status: 'waiting_action', phase: 'applying', action: { kind: 'view', revision: request.postDataJSON().viewer.revision, changes: { sector: 'primera_calle', all: true, mode: 'live' } } };
        body = delayed ? { ...job, status: 'queued', action: undefined } : job;
      } else if (path.endsWith('/applied')) { evidence.receipts.push(request.postDataJSON()); body = { ...job, status: 'complete', phase: 'complete' }; }
      else if (path.includes('/history/chat/')) { await new Promise(resolve => setTimeout(resolve, delayed ? 700 : 0)); body = job; }
      else if (path.endsWith('/live/archive')) body = { segments: [{ id: 'fixture-segment', started: at, ended: at + 60, duration: 60, state: 'ok', url: '/fixture-dashboard.mp4' }], gaps: [] };
      else if (path.endsWith('/history/frames')) body = { frames: [], incidents: [], focus: null };
      else if (path.endsWith('/history/similar')) body = { total: 0, items: [], note: 'No hay coincidencias visuales.' };
      await route.fulfill({ status: body ? 200 : 404, json: body ?? {} });
    });
    const nav = title => page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', { name: title, exact: true }).click();
    const home = () => nav('Inicio');
    const card = id => page.locator(`[data-dashboard-card="${id}"]`);
    const searchChoice = id => page.locator(`[data-explore-choice="${id}"]`).click();
    await page.goto(origin + '/__navigation-origin');
    await page.getByRole('link', { name: 'Entrar a Edge' }).click();
    await page.getByRole('heading', { name: 'Preparando tu centro de control' }).waitFor();
    await card('uturn').waitFor();
    assert.equal(await page.locator('[data-dashboard-card]').count(), 6);
    assert.equal(await page.locator('video').count(), 0);
    assert.match(await card('uturn').innerText(), /1,274/);
    assert.match(await card('rojo').innerText(), /326/);
    assert(!/\b1\s+incidente/.test(await card('incidente').innerText()));
    assert.equal(await page.locator('input[type="date"],input[type="datetime-local"]:visible').count(), 0);
    assert.equal(await page.getByText(/Próximamente/).count(), 0);
    await page.screenshot({ path: `${output}/home-${viewport.width}.png`, fullPage: true });
    evidence.checks.push(`${viewport.width}: six home tiles, truthful loading, accumulated counts, no period selector or mounted videos`);
    await page.getByRole('button', { name: 'Silenciar voz', exact: true }).click();
    const initialHistoryLength = await page.evaluate(() => history.length);
    await home(); await home();
    assert.equal(await page.evaluate(() => history.length), initialHistoryLength);
    await card('activity').click(); await page.getByRole('group', { name: 'Gráfica de actividad acumulada por hora' }).waitFor();
    assert.equal(await page.evaluate(() => history.length), initialHistoryLength + 1);
    await page.goBack(); await card('uturn').waitFor();
    await page.goForward(); await page.getByRole('group', { name: 'Gráfica de actividad acumulada por hora' }).waitFor();
    await page.goBack(); await card('uturn').waitFor();
    await card('explorer').click(); await searchChoice('combined');
    await page.getByLabel('Tipo de vehículo', { exact: true }).selectOption('paila');
    await page.getByLabel('Color', { exact: true }).selectOption('rojo');
    await page.getByLabel('Cámara', { exact: true }).selectOption('seguros');
    await page.getByRole('button', { name: 'Buscar apariciones' }).click(); await page.locator('[data-result-number="1"]').waitFor();
    await page.getByRole('button', { name: 'Ver más resultados', exact: true }).click(); await page.locator('[data-result-number="3"]').waitFor();
    const beforeOpening = evidence.catalogs.length;
    await page.locator('[data-result-number="1"]').getByRole('button', { name: 'Ver video', exact: true }).click();
    await page.locator('[data-result-video]').waitFor();
    await page.getByRole('button', { name: 'Siguiente resultado', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-result-number="2"]')?.getAttribute('aria-current') === 'true');
    await page.goBack();
    await page.waitForFunction(() => document.querySelector('[data-result-number="1"]')?.getAttribute('aria-current') === 'true');
    await page.goBack(); await page.locator('[data-result-number="3"]').waitFor();
    assert.equal(await page.locator('[data-result-video]').count(), 0);
    assert.equal(await page.getByRole('tab', { name: 'Resultados', exact: true }).getAttribute('aria-selected'), 'true');
    assert.equal(evidence.catalogs.length, beforeOpening);
    await page.goForward(); await page.locator('[data-result-video]').waitFor();
    assert.equal(await page.getByRole('tab', { name: 'Ficha', exact: true }).getAttribute('aria-selected'), 'true');
    await page.goBack(); await page.locator('[data-result-number="3"]').waitFor();
    await page.goBack(); await page.getByRole('button', { name: 'Buscar apariciones' }).waitFor();
    assert.equal(await page.getByLabel('Tipo de vehículo', { exact: true }).inputValue(), 'paila');
    assert.equal(await page.getByLabel('Color', { exact: true }).inputValue(), 'rojo');
    assert.equal(await page.getByLabel('Cámara', { exact: true }).inputValue(), 'seguros');
    await page.goBack(); await page.locator('[data-explore-choice="combined"]').waitFor();
    await page.goBack(); await card('uturn').waitFor();
    await page.goBack(); await page.getByRole('heading', { name: 'Previous page' }).waitFor();
    await page.goForward(); await card('uturn').waitFor();
    // Moving past Edge's first screen still leaves normally; no duplicate home
    // entry or back-button trap is inserted to hide the previous document.
    await page.getByRole('button', { name: 'Silenciar voz', exact: true }).click();
    await card('control').click();
    await page.getByRole('button', { name: 'Honduras', exact: true }).click();
    await page.getByRole('button', { name: 'Cortés', exact: true }).click();
    await page.getByRole('button', { name: 'San Pedro Sula', exact: true }).click();
    const beforeMapControls = await page.evaluate(() => history.length);
    await page.getByRole('button', { name: 'Acercar mapa' }).click();
    await page.getByRole('button', { name: 'Mostrar cámaras', exact: true }).click();
    assert.equal(await page.evaluate(() => history.length), beforeMapControls);
    await page.getByRole('button', { name: 'Abrir cámaras', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-live-camera]').length === 7);
    await page.getByRole('button', { name: 'Ver Seguros Atlántida', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-live-camera]').length === 1);
    await page.goBack(); await page.waitForFunction(() => document.querySelectorAll('[data-live-camera]').length === 7);
    await page.goBack(); await page.locator('[data-map-level="sps"]').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Mostrar cámaras', exact: true }).getAttribute('aria-pressed'), 'false');
    await page.goBack(); await page.locator('[data-map-level="cortes"]').waitFor();
    await page.goBack(); await page.locator('[data-map-level="honduras"]').waitFor();
    await page.goBack(); await page.locator('[data-map-level="region"]').waitFor();
    await page.goForward(); await page.locator('[data-map-level="honduras"]').waitFor();
    await page.goBack(); await page.locator('[data-map-level="region"]').waitFor();
    await page.goBack(); await card('uturn').waitFor();
    const stored = await page.evaluate(() => history.state.senttraView);
    assert.deepEqual(Object.keys(stored).sort(), ['id', 'location']);
    assert(!/fixture|paila|csrf|playback|items/.test(JSON.stringify(stored)));
    evidence.checks.push(`${viewport.width}: native Back/Forward restores menus, filters, paginated results, selected evidence, map levels/layers and camera views; no duplicate entries, private history payload or exit trap`);
    await card('uturn').click();
    await page.getByRole('heading', { name: '1274 incidencias', exact: true }).waitFor();
    assert.equal(evidence.catalogs.at(-1).category, 'incidents'); assert.equal(evidence.catalogs.at(-1).kind, 'uturn');
    await page.getByRole('button', { name: 'Ver más resultados', exact: true }).click();
    await page.locator('[data-result-number="3"]').waitFor();
    assert.equal(evidence.catalogs.at(-1).cursor, 'next-page');
    await home(); await card('rojo').click(); await page.getByRole('heading', { name: '326 incidencias', exact: true }).waitFor();
    assert.equal(evidence.catalogs.at(-1).kind, 'rojo');
    await home(); await card('incidente').click();
    await page.locator('[data-result-video]').waitFor();
    assert.equal(await page.getByRole('tab', { name: 'Ficha', exact: true }).getAttribute('aria-selected'), 'true');
    evidence.checks.push(`${viewport.width}: both incident totals open correct catalog; cursor pagination retains filters; featured incident opens evidence and case directly`);
    await home(); await card('activity').click();
    await page.getByRole('group', { name: 'Gráfica de actividad acumulada por hora' }).waitFor();
    await page.getByRole('button', { name: '7:00, 956 vehículos, 36 vueltas en U, 9 cruces en rojo' }).count();
    assert.equal(await page.locator('.ed-full-chart [role="button"]').count(), 24);
    await page.locator('.ed-full-chart [role="button"]').nth(7).click();
    assert.match(await page.locator('.ed-chart-reading').innerText(), /07:00/);
    await page.screenshot({ path: `${output}/activity-${viewport.width}.png`, fullPage: true });
    await nav('Explorador'); assert.equal(await page.locator('[data-explore-choice]').count(), 6);
    await page.screenshot({ path: `${output}/explorer-${viewport.width}.png`, fullPage: true });
    await searchChoice('vehicle_colors');
    await page.screenshot({ path: `${output}/colors-${viewport.width}.png`, fullPage: true });
    await page.locator('.ed-distribution-legend').getByRole('button', { name: /Sin clasificar/ }).click();
    await page.locator('[data-result-number="1"]').waitFor(); assert.equal(evidence.catalogs.at(-1).color, 'sin_clasificar');
    await nav('Explorador'); await page.getByRole('button', { name: '← Todas las búsquedas', exact: true }).click();
    await searchChoice('shirt_colors'); await page.locator('.ed-distribution-legend').getByRole('button', { name: /^Rojo/ }).click();
    await page.locator('[data-result-number="1"]').waitFor(); assert.equal(evidence.catalogs.at(-1).category, 'persons');
    await nav('Explorador'); await page.getByRole('button', { name: '← Todas las búsquedas', exact: true }).click(); await searchChoice('vehicle_types');
    await page.locator('.ed-distribution-legend').getByRole('button', { name: /^Motocicleta/ }).click();
    await page.locator('[data-result-number="1"]').waitFor(); assert.equal(evidence.catalogs.at(-1).type, 'moto');
    await nav('Explorador'); await page.getByRole('button', { name: '← Todas las búsquedas', exact: true }).click(); await searchChoice('combined');
    await page.getByLabel('Tipo de vehículo', { exact: true }).selectOption('bus'); assert(await page.getByLabel('Color', { exact: true }).isDisabled());
    await page.getByLabel('Tipo de vehículo', { exact: true }).selectOption('paila'); await page.getByLabel('Color', { exact: true }).selectOption('rojo'); await page.getByLabel('Cámara', { exact: true }).selectOption('seguros');
    await page.getByRole('button', { name: 'Buscar apariciones' }).click(); await page.locator('[data-result-number="1"]').waitFor();
    assert.deepEqual({ type: evidence.catalogs.at(-1).type, color: evidence.catalogs.at(-1).color, camera: evidence.catalogs.at(-1).camera }, { type: 'paila', color: 'rojo', camera: 'seguros' });
    await nav('Explorador'); await page.getByRole('button', { name: '← Todas las búsquedas', exact: true }).click(); await searchChoice('similar');
    await page.getByRole('button', { name: 'Elegir un vehículo' }).click(); await page.locator('[data-result-number="1"]').waitFor();
    await page.locator('[data-result-number="1"]').getByRole('button', { name: 'Otras cámaras' }).click(); await page.getByText('No hay coincidencias visuales.', { exact: true }).waitFor();
    await nav('Explorador'); await page.getByRole('button', { name: '← Todas las búsquedas', exact: true }).click(); await searchChoice('archive');
    await page.getByLabel('Cámara', { exact: true }).selectOption('seguros'); await page.getByLabel('Fecha y hora de Honduras').fill('2026-09-30T07:04');
    archiveMissing = true; await page.getByRole('button', { name: 'Abrir grabación' }).click(); await page.getByText('No hay grabación disponible para esa cámara y ese momento.').waitFor();
    archiveMissing = false; await page.getByRole('button', { name: 'Abrir grabación' }).click(); await page.locator('[data-result-video]').waitFor();
    assert.equal(Number(evidence.recordings.at(-1).at), at);
    evidence.checks.push(`${viewport.width}: 24-hour chart, all six explorer entries, unknown colors, shirt and motorcycle filters, combined query, similarity and exact-time archive including a gap`);
    await nav('Centro de control');
    await page.locator('[data-map-level="region"]').waitFor();
    const regions = page.locator('.ed-region-region .ed-territory path');
    const fills = await regions.evaluateAll(nodes => nodes.map(node => getComputedStyle(node).fill)); assert.equal(new Set(fills).size, 1);
    await page.getByRole('button', { name: 'Guatemala', exact: true }).click(); assert.equal(await page.locator('[data-map-level="region"]').count(), 1);
    await page.getByRole('button', { name: 'El Salvador', exact: true }).click(); assert.equal(await page.locator('[data-map-level="region"]').count(), 1);
    await page.screenshot({ path: `${output}/region-${viewport.width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Honduras', exact: true }).click();
    assert.equal(await page.locator('.ed-region-honduras [data-map-area]').count(), 18);
    await page.getByRole('button', { name: 'Atlántida', exact: true }).click(); assert.equal(await page.locator('[data-map-level="honduras"]').count(), 1);
    await page.getByRole('button', { name: 'Cortés', exact: true }).click();
    await page.getByRole('button', { name: 'San Pedro Sula', exact: true }).click();
    await page.locator('[data-map-level="sps"]').waitFor();
    assert(await page.locator('.ed-geography-city .ed-camera-node').count() > 35);
    await page.screenshot({ path: `${output}/city-${viewport.width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Acercar mapa' }).click(); await page.getByRole('button', { name: 'Restablecer mapa' }).click();
    await page.getByRole('button', { name: 'Mostrar cámaras', exact: true }).click(); assert.equal(await page.locator('.ed-geography-city .ed-camera-node').count(), 0);
    await page.getByRole('button', { name: 'Mostrar cámaras', exact: true }).click();
    await page.getByRole('button', { name: 'Abrir cámaras · punto 12', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-live-camera]').length === 7);
    await nav('Centro de control'); assert.equal(await page.locator('[data-map-level="sps"]').count(), 1);
    assert.equal(await page.locator('[data-map-incident]').count(), 3);
    await page.locator('[data-map-incident]').first().click(); await page.locator('[data-result-video]').waitFor();
    evidence.checks.push(`${viewport.width}: equal country/departments styling, only intended map route advances, dense real street map, camera layers/zoom, node to seven-camera mosaic, remembered map and real alert evidence`);
    await home();
    await nav('Explorador');
    delayed = true; await page.getByRole('textbox', { name: 'Consulta de cámaras' }).fill('Mostrame las cámaras'); const pendingChat = page.waitForResponse(response => response.url().endsWith('/history/chat')); await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    await pendingChat; await page.goBack(); await card('uturn').waitFor();
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(button => button.textContent === 'Grabar voz')?.disabled);
    assert.equal(evidence.receipts.at(-1).status, 'stale'); delayed = false;
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1));
    fail = true; await page.reload(); await page.getByRole('heading', { name: 'No se pudo preparar la vista' }).waitFor(); assert.equal(await page.locator('[data-dashboard-card]').count(), 0);
    fail = false; await page.getByRole('button', { name: 'Volver a intentar' }).click(); await card('uturn').waitFor();
    empty = true; await page.reload(); await card('uturn').waitFor(); assert(await card('incidente').isDisabled()); assert.match(await card('uturn').innerText(), /\b0\b/);
    expire = true; await page.reload(); await page.getByRole('link', { name: 'Entrar con Zitadel' }).waitFor();
    evidence.checks.push(`${viewport.width}: stale assistant receipt after navigation, no horizontal overflow, failed summary retries without invented zero counts, empty history, expired-session boundary`);
    await context.close();
  }
  assert.deepEqual(evidence.errors, []);
  await writeFile(`${output}/evidence.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ checks: evidence.checks, errors: evidence.errors }, null, 2));
} finally { await browser.close(); }
