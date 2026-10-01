import test from 'node:test';
import assert from 'node:assert/strict';
import { PRIMARY_SECTOR, SECTORS, sectorAfterChange } from '../src/lib/edge-sectors.ts';

test('explicit sector navigation and directory selection take precedence', () => {
  assert.equal(sectorAfterChange(PRIMARY_SECTOR, { sector: null }), null);
  assert.equal(sectorAfterChange(PRIMARY_SECTOR, { sector: 'trejo' }), 'trejo');
  assert.equal(sectorAfterChange('trejo', { sector: PRIMARY_SECTOR, all: true }), PRIMARY_SECTOR);
});

test('named cameras and playback open their real sector from the directory or empty sectors', () => {
  for (const sector of [null, 'satelite', 'guamilito']) {
    assert.equal(sectorAfterChange(sector, { camera: 'little' }), PRIMARY_SECTOR);
  }
  assert.equal(sectorAfterChange(null, { mode: 'live' }), PRIMARY_SECTOR);
});

test('an unrelated action or live request does not substitute cameras for an empty sector', () => {
  assert.equal(sectorAfterChange('satelite', {}), 'satelite');
  assert.equal(sectorAfterChange('satelite', { mode: 'live' }), 'satelite');
  assert.equal(sectorAfterChange(null, {}), null);
  assert.equal(SECTORS.length, 6);
  assert.equal(new Set(SECTORS.map(sector => sector.id)).size, 6);
});
