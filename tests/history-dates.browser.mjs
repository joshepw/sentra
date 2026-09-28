import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? '/home/paal/tmp-codex-test/worktrees/wheel-dev-guide/node_modules/playwright');
const origin = process.env.EDGE_TEST_ORIGIN ?? 'http://127.0.0.1:8761';
const output = process.env.EDGE_EVIDENCE_DIR;
const reproduce = process.env.EXPECT_DATE_ERROR === '1';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/opt/google/chrome/chrome' });
const evidence = { started: new Date().toISOString(), origin, consoleErrors: [], cases: [] };
const bootstrap = { cameras: [{ key: 'little', title: 'Little Caesars', receiving: false, url: '/edge/media/live/little/index.m3u8' }], user: { name: 'Date fixture', csrf: 'fixture-only' }, storage: {}, transport_ok: false };
const cases = [
  { name: 'explicit Honduras date', start: '2026-09-26T19:02:11-06:00', end: '2026-09-26T21:02:05-06:00', time: /7:02:11/ },
  { name: 'UTC date', start: '2026-09-27T01:02:11Z', end: '2026-09-27T03:02:05Z', time: /7:02:11/ },
  { name: 'local date without timezone', start: '2026-09-26T19:02:11', end: '2026-09-26T21:02:05', time: /7:02:11/ },
  { name: 'epoch seconds', start: 1790470931, end: 1790478125, time: /7:02:11/ },
  { name: 'epoch strings', start: '1790470931', end: '1790478125', time: /7:02:11/ },
  { name: 'date only', start: '2026-09-26', end: '2026-09-27', time: /12:00:00/ },
  { name: 'unusable date response', start: 'not-a-date', end: 'not-a-date', time: /Hora no disponible/ },
];
let selected = cases[0];
try {
  // API responses are isolated in this browser. No authenticated production
  // request, chat job, data write or model call is made by the regression.
  const context = await browser.newContext({ timezoneId: 'Asia/Tokyo', viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.on('console', message => { if (message.type() === 'error') evidence.consoleErrors.push(message.text()); });
  await page.route('**/edge/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body;
    if (path === '/edge/api/live/bootstrap') body = bootstrap;
    else if (path === '/edge/api/history/coverage') body = { runs: [] };
    else if (path === '/edge/api/history/chat' && route.request().method() === 'POST') body = {
      id: 'a'.repeat(32), status: 'complete', phase: 'complete', reply: 'No hay coincidencias para ese período.',
      result: { total: 0, items: [], counting: 'appearances', filters: { start: selected.start, end: selected.end, type: 'paila', color: 'rojo' } },
    };
    await route.fulfill({ status: body ? 200 : 404, contentType: 'application/json', body: JSON.stringify(body ?? {}) });
  });
  await page.goto(origin + '/edge');
  await page.getByRole('textbox', { name: 'Consulta de cámaras' }).waitFor();
  await page.getByRole('checkbox', { name: 'Responder con voz' }).uncheck();
  for (const row of cases) {
    selected = row;
    await page.getByRole('textbox', { name: 'Consulta de cámaras' }).fill('Pailas rojas de ayer: ' + row.name);
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    if (reproduce) {
      await page.getByRole('heading', { name: 'Algo falló en el sistema.' }).waitFor();
      assert(evidence.consoleErrors.some(error => /Invalid time value/.test(error)));
      evidence.reproduced = true;
      await page.screenshot({ path: output + '/date-error-before.png' });
      break;
    }
    await page.getByRole('button', { name: 'Grabar voz', exact: true }).waitFor();
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(button => button.textContent === 'Grabar voz')?.disabled);
    const contextText = await page.getByLabel('Filtros de la búsqueda').innerText();
    assert.match(contextText, row.time);
    assert.equal(await page.getByRole('heading', { name: 'Algo falló en el sistema.' }).count(), 0);
    await page.getByText('Sin coincidencias en el historial procesado para esos filtros.').waitFor();
    evidence.cases.push(row.name);
  }
  if (!reproduce) {
    assert.deepEqual(evidence.consoleErrors, []);
    await page.screenshot({ path: output + '/date-error-fixed.png' });
  }
  evidence.finished = new Date().toISOString();
  await writeFile(output + (reproduce ? '/date-error-before.json' : '/date-error-fixed.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} finally { await browser.close(); }
