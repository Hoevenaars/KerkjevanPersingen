import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { maandagVanWeekIso, datumVoorPreview } from '../src/lib/week.ts';

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

  test('maandag 17 augustus 2026 is een nieuwe week', () => {
    assert.equal(maandagVanWeekIso(new Date('2026-08-17T12:00:00Z')), '2026-08-17');
  });
});

describe('datumVoorPreview', () => {
  test('zonder week-parameter blijft het nu', () => {
    const nu = new Date('2026-08-16T12:00:00Z');
    assert.equal(datumVoorPreview(null, nu), nu);
  });

  test('week=2026-08-17 zoekt die maandag, niet de zondag ervoor', () => {
    const datum = datumVoorPreview('2026-08-17');
    assert.equal(maandagVanWeekIso(datum), '2026-08-17');
  });

  test('ongeldige week wordt afgekeurd', () => {
    assert.throws(() => datumVoorPreview('17 augustus'), /YYYY-MM-DD/);
  });
});
