import test from 'node:test';
import assert from 'node:assert/strict';
import { historyBufferedAhead, historyBufferReady } from '../src/lib/history-playback.ts';

const media = (at, ranges, extra = {}) => ({ currentTime: at, duration: 60.5, readyState: 4, seeking: false, error: null,
  buffered: { length: ranges.length, start: i => ranges[i][0], end: i => ranges[i][1] }, ...extra });

test('one decoded frame does not release the loading state without three seconds ahead', () => {
  assert.equal(historyBufferReady(media(40, [[40, 40.1]])), false);
  assert.equal(historyBufferReady(media(40, [[40, 43]])), true);
  assert.equal(historyBufferReady(media(40, [[40, 60]], { seeking: true })), false);
});

test('a seek near the end waits for the contiguous next recording before resuming', () => {
  const current = media(60.32, [[58, 60.5]]);
  assert.equal(historyBufferReady(current, null), false);
  assert.equal(historyBufferReady(current, media(0, [[0, .3]])), false);
  assert.equal(historyBufferReady(current, media(0, [[0, 3]])), true);
  assert.equal(historyBufferReady(current), true, 'A real archive ending must not wait for missing footage');
});

test('disjoint ranges and an incorrectly positioned next recording cannot supply reserve', () => {
  const current = media(30, [[0, 10], [30, 31], [40, 60]]);
  assert.equal(historyBufferedAhead(current), 1);
  assert.equal(historyBufferReady(current), false);
  assert.equal(historyBufferReady(media(60.32, [[58, 60.5]]), media(4, [[0, 60.5]])), false);
});
