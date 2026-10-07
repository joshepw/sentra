import test from 'node:test';
import assert from 'node:assert/strict';
import { accessSync } from 'node:fs';
import { demoCaseKey, demoCaseNumber, demoVehicleProfile, demoCaseChange, EMPTY_DEMO_CASE, incidentTitle } from '../src/lib/case-demo.ts';

const item = (overrides = {}) => ({ uid: 'incident-1', camera: 'seguros', kind: 'uturn', review: 'candidate',
  playback: { run_id: 'run-1', camera: 'seguros', at: 100, track_uid: 'session-1-track-4' }, ...overrides });

test('the curated category keeps its own title instead of becoming a red-light infraction', () => {
  assert.equal(incidentTitle('incidente'), 'Incidente');
  assert.equal(incidentTitle('rojo'), 'Posible cruce en rojo');
  assert.equal(incidentTitle('uturn'), 'Posible vuelta en U');
});

test('case state does not collide across analysis, camera or incident and does not inherit a real decision', () => {
  const original = item({ review: 'confirmed' });
  assert.equal(new Set([original, item({ uid: 'incident-2' }), item({ camera: 'little' }), item({ run_id: 'run-2' })].map(demoCaseKey)).size, 4);
  assert.equal(EMPTY_DEMO_CASE.decision, 'pending');
  assert.match(demoCaseNumber(original), /^DEM-/);
  assert.equal(demoCaseNumber(original), demoCaseNumber(structuredClone(original)));
});

test('multiple incidents on the same observed track share a simulated profile, other sessions do not', () => {
  const first = item(), second = item({ uid: 'incident-2', kind: 'rojo' });
  assert.deepEqual(demoVehicleProfile(first), demoVehicleProfile(second));
  assert.notDeepEqual(demoVehicleProfile(first), demoVehicleProfile(item({ playback: { ...first.playback, track_uid: 'session-2-track-4' } })));
  assert.notDeepEqual(demoVehicleProfile(first), demoVehicleProfile(item({ camera: 'little' })));
  assert.match(demoVehicleProfile(first).document, /^DEMO-/);
});

test('person observations never receive invented vehicle or registered-owner data', () => {
  assert.equal(demoVehicleProfile(item({ type: 'persona' })), null);
  assert.equal(demoVehicleProfile(item({ class_id: 0 })), null);
});

test('every simulated profile references a shipped fictional portrait', () => {
  const portraits = new Set();
  for (let index = 0; index < 80; index++) {
    const profile = demoVehicleProfile(item({ track_uid: `fictional-track-${index}` }));
    assert.match(profile.portrait, /^\/senttra\/demo-portraits\/[hm]\d\.webp$/);
    accessSync(new URL(`../public${profile.portrait}`, import.meta.url));
    portraits.add(profile.portrait);
  }
  assert.equal(portraits.size, 5);
});

test('demo decisions snapshot notes, preserve the source item, and remain reversible without duplicate events', () => {
  const source = item(), sourceBefore = structuredClone(source);
  const annotated = demoCaseChange(EMPTY_DEMO_CASE, { note: 'Se observa la maniobra.' });
  const confirmed = demoCaseChange(annotated, { decision: 'confirmed', at: 100 });
  const edited = demoCaseChange(confirmed, { note: 'Nueva observación.' });
  assert.equal(edited.activity[0].note, annotated.note);
  assert.equal(demoCaseChange(edited, { decision: 'confirmed', at: 101 }), edited);
  const dismissed = demoCaseChange(edited, { decision: 'dismissed', at: 102 });
  const pending = demoCaseChange(dismissed, { decision: 'pending', at: 103 });
  assert.equal(pending.note, edited.note);
  assert.deepEqual(pending.activity.map(row => row.decision), ['confirmed', 'dismissed', 'pending']);
  assert.deepEqual(source, sourceBefore);
  assert.deepEqual(EMPTY_DEMO_CASE, { decision: 'pending', note: '', activity: [] });
});

test('notes and local activity remain bounded and invalid timestamps cannot produce an action', () => {
  assert.equal(demoCaseChange(EMPTY_DEMO_CASE, { note: 'x'.repeat(5000) }).note.length, 1000);
  assert.equal(demoCaseChange(EMPTY_DEMO_CASE, { decision: 'confirmed', at: NaN }), EMPTY_DEMO_CASE);
  let value = EMPTY_DEMO_CASE;
  for (let n = 0; n < 30; n++) value = demoCaseChange(value, { decision: n % 2 ? 'pending' : 'confirmed', at: n });
  assert.equal(value.activity.length, 12);
  assert.equal(value.activity.at(-1).at, 29);
});
