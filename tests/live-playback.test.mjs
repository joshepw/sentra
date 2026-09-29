import test from 'node:test';
import assert from 'node:assert/strict';
import { livePlaybackPosition } from '../src/lib/live-playback.ts';

const ranges = pairs => ({ length: pairs.length, start: i => pairs[i][0], end: i => pairs[i][1] });

test('returning to live retains twelve seconds of playback reserve', () => {
  assert.equal(livePlaybackPosition(ranges([[100, 160]])), 148);
  assert.equal(livePlaybackPosition(ranges([[0, 12]])), 0);
});

test('reconnection uses only the latest continuous range', () => {
  assert.equal(livePlaybackPosition(ranges([[100, 140], [150, 180]])), 168);
  assert.equal(livePlaybackPosition(ranges([[100, 140], [150, 155]])), 150);
});

test('startup with no timeline or invalid ranges never seeks to a made-up position', () => {
  for (const pairs of [[], [[0, 0]], [[5, 4]], [[NaN, 20]], [[0, Infinity]], [[-1, 20]]]) {
    assert.equal(livePlaybackPosition(ranges(pairs)), null);
  }
  assert.equal(livePlaybackPosition(ranges([[10, 10.05]])), 10);
});
