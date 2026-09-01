import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isZaterdag,
  isZondag,
  isDoordeweeks,
  weekendVan,
  dagenInPeriode,
  periodesOverlappen,
  voegDagenToe,
  formatWeekendLabel,
} from '../src/platform/datum.ts';

describe('datum', () => {
  test('12 september 2026 is een zaterdag', () => {
    assert.equal(isZaterdag('2026-09-12'), true);
    assert.equal(isZondag('2026-09-13'), true);
    assert.equal(isDoordeweeks('2026-09-14'), true);
  });

  test('weekendVan pakt za+zo vanuit een woensdag', () => {
    assert.deepEqual(weekendVan('2026-09-09'), { zaterdag: '2026-09-12', zondag: '2026-09-13' });
  });

  test('dagenInPeriode is inclusief', () => {
    assert.deepEqual(dagenInPeriode('2026-09-07', '2026-09-09'), [
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
    ]);
  });

  test('periodesOverlappen', () => {
    assert.equal(
      periodesOverlappen({ start: '2026-09-07', eind: '2026-09-09' }, { start: '2026-09-09', eind: '2026-09-11' }),
      true,
    );
    assert.equal(
      periodesOverlappen({ start: '2026-09-07', eind: '2026-09-08' }, { start: '2026-09-09', eind: '2026-09-10' }),
      false,
    );
  });

  test('optietermijn +14 dagen', () => {
    assert.equal(voegDagenToe('2026-09-01', 14), '2026-09-15');
  });

  test('formatWeekendLabel', () => {
    assert.equal(formatWeekendLabel('2026-09-12', '2026-09-13'), '12 en 13 september 2026');
  });
});
