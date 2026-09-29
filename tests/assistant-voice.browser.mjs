import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? '/home/paal/tmp-codex-test/worktrees/wheel-dev-guide/node_modules/playwright');
const origin = process.env.EDGE_TEST_ORIGIN ?? 'http://127.0.0.1:8782';
const output = process.env.EDGE_EVIDENCE_DIR ?? 'test-artifacts/assistant-voice';
await mkdir(output, { recursive: true });
// An audible PCM fixture exercises real decoding and scheduling in the browser.
const rate = 16000, samples = rate * 8, wav = Buffer.alloc(44 + samples * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(2000 * Math.sin(2 * Math.PI * 220 * i / rate)), 44 + i * 2);
const browser = await chromium.launch({ headless: true, executablePath: '/opt/google/chrome/chrome', args: ['--autoplay-policy=user-gesture-required'] });
const evidence = { fixture: true, errors: [], queries: [], checks: [] };
let page, releaseAudio;
const state = { hold: false, delayAudio: false, audioDenied: false, query: null };
let filters = { type: 'auto', color: 'azul', start: '2026-09-28T08:00:00', end: '2026-09-28T12:00:00' };
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 710 }, timezoneId: 'Asia/Tokyo' });
  page = await context.newPage(); page.on('pageerror', error => evidence.errors.push(error.message));
  await page.addInitScript(() => {
    window.voiceTrace = []; window.voiceCaptures = [];
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext {
      resume() { window.voiceTrace.push({ event: 'resume', gesture: navigator.userActivation.isActive }); return super.resume(); }
      createBufferSource() {
        const source = super.createBufferSource(), start = source.start.bind(source), stop = source.stop.bind(source);
        source.start = (...args) => {
          if (source.buffer?.duration > .1) window.voiceTrace.push({ event: 'start', state: this.state });
          return start(...args);
        };
        source.stop = (...args) => { if (source.buffer?.duration > .1) window.voiceTrace.push({ event: 'stop' }); return stop(...args); };
        return source;
      }
    };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      const context = new NativeAudioContext(), oscillator = context.createOscillator(), destination = context.createMediaStreamDestination();
      oscillator.connect(destination); oscillator.start(); await context.resume();
      window.voiceCaptures.push(destination.stream); return destination.stream;
    } });
  });
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.route('**/senttra/hls.min.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.Hls = null;' }));
  await page.route('**/edge/auth/logout', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/edge/media/history/voice/*.wav', async route => {
    if (state.delayAudio) await new Promise(resolve => { releaseAudio = resolve; });
    await route.fulfill({ status: state.audioDenied ? 401 : 200, contentType: 'audio/wav', body: state.audioDenied ? '' : wav }).catch(() => {});
  });
  await page.route('**/edge/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body;
    if (path.endsWith('/live/bootstrap')) body = { cameras: [{ key: 'little', title: 'Little Caesars', receiving: false, url: '/fixture.m3u8' }], user: { csrf: 'fixture-only' }, storage: {} };
    else if (path.endsWith('/history/coverage')) body = { runs: [] };
    else if (/\/history\/chat(?:\/[a-f0-9]+)?$/.test(path)) {
      const posted = route.request().method() === 'POST';
      if (posted) { state.query = route.request().postDataJSON(); evidence.queries.push(state.query); }
      body = { id: 'a'.repeat(32), status: posted || state.hold ? 'working' : 'complete', phase: 'voice',
        reply: 'Se encontraron 81 apariciones. Esta respuesta no debe escribirse.',
        transcript: 'Consulta de prueba que tampoco debe escribirse.',
        result: { total: 81, counting: 'appearances', filters, items: [] },
        ...(!posted && !state.hold && state.query.voice ? { audio_url: '/edge/media/history/voice/' + 'a'.repeat(32) + '.wav' } : {}),
      };
    }
    await route.fulfill({ status: body ? 200 : 404, json: body ?? {} });
  });
  await page.goto(origin + '/edge');
  const mute = () => page.getByRole('button', { name: 'Silenciar voz', exact: true });
  const unmute = () => page.getByRole('button', { name: 'Activar voz', exact: true });
  const starts = () => page.evaluate(() => window.voiceTrace.filter(row => row.event === 'start').length);
  const stops = () => page.evaluate(() => window.voiceTrace.filter(row => row.event === 'stop').length);
  const idle = () => page.waitForFunction(() => ![...document.querySelectorAll('button')].find(button => button.textContent === 'Grabar voz')?.disabled);
  const send = async (text = 'Autos azules esta mañana') => {
    await page.getByRole('textbox', { name: 'Consulta de cámaras' }).fill(text);
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  };
  await mute().waitFor();
  const muteBox = await mute().boundingBox(), logoutBox = await page.getByRole('button', { name: 'Salir', exact: true }).boundingBox();
  assert(muteBox.x + muteBox.width <= logoutBox.x && Math.abs(muteBox.y + muteBox.height / 2 - logoutBox.y - logoutBox.height / 2) < 2);
  assert.equal(await mute().getAttribute('aria-pressed'), 'false');
  await send();
  await page.waitForFunction(() => window.voiceTrace.some(row => row.event === 'start' && row.state === 'running'));
  await idle();
  assert(evidence.queries.at(-1).voice);
  assert(await page.evaluate(() => window.voiceTrace.some(row => row.event === 'resume' && row.gesture)));
  assert.equal(await page.locator('audio, #history-transcript').count(), 0);
  assert.equal(await page.getByRole('checkbox', { name: 'Responder con voz' }).count(), 0);
  assert.equal(await page.getByLabel('Filtros de la búsqueda').count(), 0);
  assert.doesNotMatch(await page.locator('body').innerText(), /Conversación|Se encontraron 81|Esta respuesta|Consulta de prueba|Tocá reproducir/);
  assert.match(await page.locator('[data-result-context]').innerText(), /81 apariciones[\s\S]*Azul · Todas las cámaras[\s\S]*08:00–12:00 · HN/);
  evidence.checks.push('automatic decoded audio after asynchronous reply with autoplay gesture restrictions; compact context; no transcript/player/ribbon');
  await mute().click(); assert.equal(await stops(), 1);
  await unmute().click(); assert.equal(await starts(), 1);
  state.hold = true; await send(); await mute().click(); await unmute().click(); state.hold = false;
  await idle(); await page.waitForTimeout(200); assert.equal(await starts(), 1);
  evidence.checks.push('mute stops current speech; unmute never replays speech or revives a pending response');
  await mute().click(); await send(); await idle();
  assert.equal(evidence.queries.at(-1).voice, false); assert.equal(await starts(), 1);
  await unmute().click();
  state.delayAudio = true; await send();
  while (!releaseAudio) await new Promise(resolve => setTimeout(resolve, 50));
  await mute().click(); releaseAudio(); releaseAudio = null; state.delayAudio = false;
  await unmute().click(); await idle(); await page.waitForTimeout(200); assert.equal(await starts(), 1);
  evidence.checks.push('mute cancels audio downloads and suppresses TTS on subsequent muted queries');
  filters = { ...filters, type: 'persona', color: 'rojo', camera: 'little' };
  await send('Personas con camisa roja');
  await page.waitForFunction(() => window.voiceTrace.filter(row => row.event === 'start').length === 2);
  await idle(); assert.match(await page.locator('[data-result-context]').innerText(), /Personas · Camisa: Rojo · Little Caesars/);
  const beforeMic = await stops();
  await page.getByRole('button', { name: 'Grabar voz', exact: true }).click();
  assert.equal(await stops(), beforeMic + 1);
  await page.getByRole('dialog').getByText('Grabando tu voz', { exact: true }).waitFor();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Enviar voz', exact: true }).click();
  await page.waitForFunction(() => window.voiceTrace.filter(row => row.event === 'start').length === 3);
  await idle(); assert(evidence.queries.at(-1).audio?.length > 100);
  assert(await page.evaluate(() => window.voiceCaptures.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))));
  evidence.checks.push('person/shirt context is explicit; microphone stops speech and a spoken query automatically receives audio');
  state.audioDenied = true; await send();
  await page.getByRole('link', { name: 'Entrar con Zitadel' }).waitFor();
  assert.equal(await starts(), 3);
  evidence.checks.push('expired audio authentication closes the protected view');
  state.audioDenied = false; await page.reload(); await mute().waitFor(); await send();
  await page.waitForFunction(() => window.voiceTrace.some(row => row.event === 'start'));
  await page.getByRole('button', { name: 'Salir', exact: true }).click();
  await page.getByRole('link', { name: 'Entrar con Zitadel' }).waitFor(); assert.equal(await stops(), 1);
  evidence.checks.push('logout stops speech immediately');
  assert.deepEqual(evidence.errors, []);
  await writeFile(`${output}/voice.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ passed: true, checks: evidence.checks, errors: evidence.errors }));
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  await writeFile(`${output}/failed.json`, JSON.stringify({ ...evidence, failure: String(error) }, null, 2)); throw error;
} finally { releaseAudio?.(); await browser.close(); }
