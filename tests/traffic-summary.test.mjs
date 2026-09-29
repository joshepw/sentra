import test from 'node:test';
import assert from 'node:assert/strict';
import { trafficPlan, trafficHourLabel, loadTrafficSummary } from '../src/lib/traffic-summary.ts';

const start = Date.parse('2026-09-26T19:02:11-06:00') / 1000;
const end = Date.parse('2026-09-26T21:02:05-06:00') / 1000;
const run = (first = start, last = end) => ({ id: 'archive', kind: 'archive', started: first, ended: last,
  cameras: [{ camera: 'little', first, last, frames: 100 }], status: 'complete', title: 'Fixture', totals: {} });

test('hourly chart keeps Honduras boundaries, partial hours and the selected camera coverage', () => {
  const plan = trafficPlan(run(), 'little');
  assert.deepEqual(plan.hours.map(row => trafficHourLabel(row.hour)), ['7 PM', '8 PM', '9 PM']);
  assert.equal(plan.hours[0].start, start);
  assert.equal(plan.hours.at(-1).end, end);
  assert.equal(plan.hours[0].end, plan.hours[1].start);
  assert.equal(trafficPlan(run(), 'missing'), null);
  assert.equal(trafficPlan(run(end, start), 'little'), null);
  const long = trafficPlan(run(start - 10 * 86400, end), 'little');
  assert.equal(long.hours.length, 24);
  assert(long.limited);
  const live = { ...run(), kind: 'live', ended: null };
  assert.equal(trafficPlan(live, 'little').end % 60, 0);
});

test('counts use API totals beyond pagination, with bounded concurrency and cached completed requests', async () => {
  const plan = trafficPlan(run(), 'little');
  let active = 0, peak = 0, calls = 0;
  const request = async input => {
    active++; calls++; peak = Math.max(peak, active);
    const url = new URL(input, 'https://fixture.invalid');
    assert.equal(url.searchParams.get('camera'), 'little');
    assert.equal(url.searchParams.get('run_id'), 'archive');
    assert.equal(url.searchParams.get('limit'), '1');
    if (url.pathname.endsWith('incidents')) assert.equal(url.searchParams.get('review'), 'candidate');
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    return Response.json({ total: url.pathname.endsWith('search') ? 5018 : 7, items: [{}], next_cursor: 'more' });
  };
  const cache = new Map();
  const rows = await loadTrafficSummary(plan, new AbortController().signal, cache, request);
  assert.equal(calls, 6); assert.equal(peak, 2);
  assert(rows.every(row => row.vehicles === 5018 && row.incidents === 7));
  await loadTrafficSummary(plan, new AbortController().signal, cache, request);
  assert.equal(calls, 6);
});

test('failed counts remain unknown, while genuine zero traffic is retained', async () => {
  const plan = trafficPlan(run(), 'little');
  const request = async input => input.includes('/incidents?') ? new Response('', { status: 503 }) : Response.json({ total: 0 });
  const rows = await loadTrafficSummary(plan, new AbortController().signal, new Map(), request);
  assert(rows.every(row => row.vehicles === 0 && row.incidents === null));
  const malformed = await loadTrafficSummary(plan, new AbortController().signal, new Map(), async () => Response.json({ total: '12' }));
  assert(malformed.every(row => row.vehicles === null && row.incidents === null));
});

test('expired sessions and cancelled camera selections stop a summary request', async () => {
  const plan = trafficPlan(run(), 'little');
  await assert.rejects(loadTrafficSummary(plan, new AbortController().signal, new Map(), async () => new Response('', { status: 401 })), /session_expired/);
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  await assert.rejects(loadTrafficSummary(plan, controller.signal, new Map(), async () => { calls++; return Response.json({ total: 1 }); }));
  assert.equal(calls, 0);
});
