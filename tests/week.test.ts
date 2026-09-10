import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { maandagVanWeekIso, datumVoorPreview, eerstvolgendeVrijeWeekenden } from '../src/lib/week.ts';

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

describe('eerstvolgendeVrijeWeekenden', () => {
  test('na de september-weekenden en Second Nature (3-4 okt) is 10-11 oktober als eerste vrij', () => {
    const bezet = new Set([
      '2026-09-12', '2026-09-13',
      '2026-09-19', '2026-09-20',
      '2026-09-26', '2026-09-27',
      '2026-10-03', '2026-10-04',
    ]);
    const weekenden = eerstvolgendeVrijeWeekenden(bezet, 3, new Date('2026-09-10T12:00:00Z'));
    assert.equal(weekenden[0].zaterdag, '2026-10-10');
    assert.equal(weekenden[0].zondag, '2026-10-11');
  });

  test('als oktober verder bezet is, is 7-8 november het eerstvolgende vrije weekend', () => {
    const bezet = new Set([
      '2026-09-12', '2026-09-13',
      '2026-09-19', '2026-09-20',
      '2026-09-26', '2026-09-27',
      '2026-10-03', '2026-10-04',
      '2026-10-10', '2026-10-11',
      '2026-10-17', '2026-10-18',
      '2026-10-24', '2026-10-25',
      '2026-10-31', '2026-11-01',
    ]);
    const weekenden = eerstvolgendeVrijeWeekenden(bezet, 3, new Date('2026-09-10T12:00:00Z'));
    assert.equal(weekenden[0].zaterdag, '2026-11-07');
    assert.equal(weekenden[0].zondag, '2026-11-08');
    assert.equal(weekenden[0].zaterdagVrij, true);
    assert.equal(weekenden[0].zondagVrij, true);
  });

  test('een halfbezet weekend blijft kiesbaar', () => {
    const bezet = new Set(['2026-11-08']);
    const weekenden = eerstvolgendeVrijeWeekenden(bezet, 1, new Date('2026-11-05T12:00:00Z'));
    assert.equal(weekenden[0].zaterdag, '2026-11-07');
    assert.equal(weekenden[0].zaterdagVrij, true);
    assert.equal(weekenden[0].zondagVrij, false);
  });

  test('op zondag slaat het huidige weekend over', () => {
    const weekenden = eerstvolgendeVrijeWeekenden(new Set(), 1, new Date('2026-11-08T12:00:00Z'));
    assert.equal(weekenden[0].zaterdag, '2026-11-14');
  });
});
