import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  kiesExpositieWeekend,
  valideerVerhuurperiode,
  expositieWeekendBeschikbaar,
} from '../src/platform/verhuur.ts';

describe('expositie — exact één weekend', () => {
  test('kiezen van zaterdag 12 september levert za+zo', () => {
    const uitkomst = kiesExpositieWeekend('2026-09-12');
    assert.equal(uitkomst.ok, true);
    assert.deepEqual(uitkomst.periode, { start: '2026-09-12', eind: '2026-09-13' });
  });

  test('een woensdag als start is ongeldig', () => {
    assert.equal(kiesExpositieWeekend('2026-09-09').ok, false);
  });

  test('alleen zaterdag is ongeldig', () => {
    assert.equal(valideerVerhuurperiode('expositie', '2026-09-12', '2026-09-12').ok, false);
  });

  test('alleen zondag is ongeldig', () => {
    assert.equal(valideerVerhuurperiode('expositie', '2026-09-13', '2026-09-13').ok, false);
  });

  test('vrijdag tot zondag is ongeldig', () => {
    assert.equal(valideerVerhuurperiode('expositie', '2026-09-11', '2026-09-13').ok, false);
  });

  test('doordeweekse expositie is ongeldig', () => {
    assert.equal(valideerVerhuurperiode('expositie', '2026-09-07', '2026-09-08').ok, false);
  });

  test('zaterdag bezet maakt het hele weekend onbeschikbaar', () => {
    const bezet = new Set(['2026-09-12']);
    const uitkomst = expositieWeekendBeschikbaar('2026-09-12', '2026-09-13', bezet);
    assert.equal(uitkomst.ok, false);
    assert.equal(uitkomst.melding, 'Weekend niet beschikbaar.');
  });

  test('zondag bezet maakt het hele weekend onbeschikbaar', () => {
    const bezet = new Set(['2026-09-13']);
    assert.equal(expositieWeekendBeschikbaar('2026-09-12', '2026-09-13', bezet).ok, false);
  });
});

describe('overige verhuur — alleen ma t/m vr', () => {
  test('maandag t/m woensdag is geldig', () => {
    const uitkomst = valideerVerhuurperiode('bruiloft', '2026-09-07', '2026-09-09');
    assert.equal(uitkomst.ok, true);
  });

  test('één vrijdag is geldig', () => {
    assert.equal(valideerVerhuurperiode('concert', '2026-09-11', '2026-09-11').ok, true);
  });

  test('bruiloft in het weekend is ongeldig', () => {
    const uitkomst = valideerVerhuurperiode('bruiloft', '2026-09-12', '2026-09-12');
    assert.equal(uitkomst.ok, false);
  });

  test('periode die zaterdag bevat is ongeldig', () => {
    assert.equal(valideerVerhuurperiode('diverse', '2026-09-11', '2026-09-12').ok, false);
  });

  test('interne activiteit mag in het weekend', () => {
    const intern = [{ sleutel: 'intern', naam: 'Intern', dagregel: 'elke_dag' as const, actief: true, volgorde: 9 }];
    assert.equal(valideerVerhuurperiode('intern', '2026-12-25', '2026-12-26', intern).ok, true);
  });
});
