import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blokkeertPubliekeKalender,
  publiekeBezetteDagen,
  interneStatusVoorDag,
  huidigeBezetteDagen,
  type BezettingsItem,
} from '../src/platform/kalender.ts';

const optie: BezettingsItem = {
  periode: { start: '2026-09-12', eind: '2026-09-13' },
  status: 'optie',
  blokkeertPubliek: false,
};
const definitief: BezettingsItem = {
  periode: { start: '2026-09-07', eind: '2026-09-09' },
  status: 'definitief',
  blokkeertPubliek: true,
};
const internBlok: BezettingsItem = {
  periode: { start: '2026-12-25', eind: '2026-12-26' },
  status: 'interne_blokkade',
  blokkeertPubliek: true,
};
const internOpen: BezettingsItem = {
  periode: { start: '2026-12-24', eind: '2026-12-24' },
  status: 'interne_blokkade',
  blokkeertPubliek: false,
};

describe('kalender — nieuwe regels', () => {
  test('optie blokkeert de publieke kalender niet', () => {
    assert.equal(blokkeertPubliekeKalender({ status: 'optie' }), false);
    assert.equal(publiekeBezetteDagen([optie]).has('2026-09-12'), false);
    assert.equal(interneStatusVoorDag('2026-09-12', [optie]), 'optie');
  });

  test('definitief blokkeert de publieke kalender', () => {
    const bezet = publiekeBezetteDagen([definitief]);
    assert.equal(bezet.has('2026-09-07'), true);
    assert.equal(bezet.has('2026-09-09'), true);
    assert.equal(bezet.has('2026-09-10'), false);
  });

  test('interne kerstsluiting met vinkje blokkeert, zonder vinkje niet', () => {
    assert.equal(publiekeBezetteDagen([internBlok]).has('2026-12-25'), true);
    assert.equal(publiekeBezetteDagen([internOpen]).has('2026-12-24'), false);
    assert.equal(interneStatusVoorDag('2026-12-24', [internOpen]), 'interne_activiteit');
  });
});

describe('kalender — huidige Sanity-gedrag (voor parallelcontrole)', () => {
  test('zichtbaarheid verborgen telt niet als bezet', () => {
    const dagen = huidigeBezetteDagen([
      { startYmd: '2026-09-12', eindYmd: '2026-09-13', zichtbaarheid: 'verborgen' },
    ]);
    assert.equal(dagen.size, 0);
  });

  test('zichtbaarheid bezet of publiek telt de hele periode', () => {
    const dagen = huidigeBezetteDagen([
      { startYmd: '2026-09-07', eindYmd: '2026-09-09', zichtbaarheid: 'bezet' },
    ]);
    assert.equal(dagen.has('2026-09-07'), true);
    assert.equal(dagen.has('2026-09-08'), true);
    assert.equal(dagen.has('2026-09-09'), true);
  });
});
