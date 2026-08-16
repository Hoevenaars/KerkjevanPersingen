import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { maandagVanWeekIso } from '../src/lib/week.ts';

describe('maandagVanWeekIso', () => {
  test('donderdag 13 augustus 2026 (NL) valt in de week van maandag 10 augustus', () => {
    // 12:00 UTC = 14:00 Amsterdam (zomertijd)
    assert.equal(maandagVanWeekIso(new Date('2026-08-13T12:00:00Z')), '2026-08-10');
  });

  test('zondag hoort bij de week die op de voorgaande maandag begon', () => {
    assert.equal(maandagVanWeekIso(new Date('2026-08-16T12:00:00Z')), '2026-08-10');
  });

  test('maandag zelf blijft die maandag', () => {
    assert.equal(maandagVanWeekIso(new Date('2026-08-10T12:00:00Z')), '2026-08-10');
  });
});
