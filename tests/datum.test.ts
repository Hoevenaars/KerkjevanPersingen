import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatDatum, formatDatumBereik } from '../src/lib/datum.ts';

describe('formatDatum', () => {
  test('toont datum en tijd in Nederlandse tijd', () => {
    assert.equal(
      formatDatum('2026-08-15T09:00:00.000Z'),
      'zaterdag 15 augustus 2026, 11:00 uur',
    );
  });

  test('laat de tijd weg als dat gevraagd is', () => {
    assert.equal(formatDatum('2026-08-15T09:00:00.000Z', false), 'zaterdag 15 augustus 2026');
  });
});

describe('formatDatumBereik', () => {
  test('een weekend-expositie toont zaterdag en zondag, zonder tijd', () => {
    assert.equal(
      formatDatumBereik({
        start: '2026-08-15T09:00:00.000Z',
        eind: '2026-08-16T15:00:00.000Z',
        soort: 'expositie',
      }),
      'zaterdag 15 en zondag 16 augustus 2026',
    );
  });

  test('een expositie met alleen zaterdag als eindtijd toont alsnog zondag', () => {
    assert.equal(
      formatDatumBereik({
        start: '2026-08-15T09:00:00.000Z',
        eind: '2026-08-15T15:00:00.000Z',
        soort: 'expositie',
      }),
      'zaterdag 15 en zondag 16 augustus 2026',
    );
  });

  test('een expositie zonder einddatum toont het hele weekend', () => {
    assert.equal(
      formatDatumBereik({
        start: '2026-08-15T09:00:00.000Z',
        soort: 'expositie',
      }),
      'zaterdag 15 en zondag 16 augustus 2026',
    );
  });

  test('een expositie alleen op zondag blijft één dag', () => {
    assert.equal(
      formatDatumBereik({
        start: '2026-08-16T09:00:00.000Z',
        eind: '2026-08-16T15:00:00.000Z',
        soort: 'expositie',
      }),
      'zondag 16 augustus 2026',
    );
  });

  test('een concert op één dag toont die dag één keer, zonder tijd', () => {
    assert.equal(
      formatDatumBereik({
        start: '2026-08-15T18:00:00.000Z',
        eind: '2026-08-15T20:00:00.000Z',
        soort: 'concert',
      }),
      'zaterdag 15 augustus 2026',
    );
  });

  test('een periode over een maandgrens gebruikt t/m', () => {
    assert.equal(
      formatDatumBereik({
        start: '2026-01-31T09:00:00.000Z',
        eind: '2026-02-01T15:00:00.000Z',
      }),
      'zaterdag 31 januari 2026 t/m zondag 1 februari 2026',
    );
  });
});
