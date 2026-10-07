import test from 'node:test';
import assert from 'node:assert/strict';
import { indexIncidents, incidentAt, detectionInstant, detectionColor } from '../src/lib/incident-overlays.ts';
const event = (overrides = {}) => ({ uid: 'first', track_uid: 'track', camera: 'seguros', session: 'one', local_id: 42,
  kind: 'uturn', review: 'candidate', at: 100, ...overrides });
test('an incident starts at its exact displayed instant and rewinding removes the mark', () => {
  const index = indexIncidents([event()], 'seguros');
  assert.equal(incidentAt(index, 'one', 42, 99.999999), undefined);
  assert.equal(incidentAt(index, 'one', 42, 100)?.review, 'candidate');
  assert.equal(incidentAt(index, 'one', 42, 130)?.review, 'candidate');
  assert.equal(incidentAt(index, 'one', 42, 90), undefined);
});
test('review priority never anticipates a future confirmed maneuver', () => {
  const index = indexIncidents([event({ uid: 'second', at: 110, kind: 'rojo', review: 'confirmed' }), event(),
    event({ uid: 'third', at: 120 })], 'seguros');
  assert.equal(incidentAt(index, 'one', 42, 105)?.review, 'candidate');
  assert.equal(incidentAt(index, 'one', 42, 110)?.review, 'confirmed');
  assert.equal(incidentAt(index, 'one', 42, 121)?.uid, 'second');
  assert.equal(incidentAt(index, 'one', 42, 105)?.review, 'candidate');
});
test('camera/session collisions, dismissals and invalid timestamps never highlight vehicles', () => {
  for (const overrides of [{ camera: 'little' }, { review: 'dismissed' }, { kind: 'other' }, { at: NaN }, { at: Infinity }, { local_id: '42' }]) {
    assert.equal(incidentAt(indexIncidents([event(overrides)], 'seguros'), 'one', 42, 130), undefined);
  }
  const index = indexIncidents([event()], 'seguros');
  assert.equal(incidentAt(index, 'restarted', 42, 130), undefined);
  assert.equal(incidentAt(index, 'one', 43, 130), undefined);
  assert.equal(incidentAt(index, 'one', 42, NaN), undefined);
  assert.equal(indexIncidents(null, 'seguros').size, 0);
});
test('live clock uses demuxed fragment offset and preserves held demo observation timing', () => {
  assert.equal(detectionInstant({ captured_at: 100.1, offset: .1 }, .25), 100.25);
  assert.equal(detectionInstant({ captured_at: 101.93, offset: 0, segment_started_at: 102 }, .05), 102.05);
  assert(Number.isNaN(detectionInstant({ offset: 0 }, .1)));
  assert(Number.isNaN(detectionInstant({ captured_at: NaN, offset: 0 }, .1)));
});
test('status colors are consistent across vehicle classes and refreshed reviews', () => {
  for (const class_id of [2, 3, 5, 7]) {
    assert.equal(detectionColor({ class_id }), '#57f1aa');
    assert.equal(detectionColor({ class_id }, event()), '#ffdb68');
    assert.equal(detectionColor({ class_id }, event({ review: 'confirmed' })), '#ff5263');
  }
  assert.equal(detectionColor({ class_id: 0 }), '#68c8ff');
  assert.equal(incidentAt(indexIncidents([event({ review: 'dismissed' })], 'seguros'), 'one', 42, 120), undefined);
});
