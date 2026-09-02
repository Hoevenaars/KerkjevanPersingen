import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  zoekDemo,
  formatNl,
  verschuifMaand,
  maandRaster,
  demoDashboardBron,
} from '../src/platform/demo-data.ts';
import { dashboardVoor } from '../src/platform/dashboard.ts';

describe('demo-data voor klikbaar /beheer', () => {
  test('zoek “Jansen” vindt relatie, aanvraag en boeking', () => {
    const treffers = zoekDemo('Jansen');
    assert.ok(treffers.some((t) => t.soort === 'Relatie' && t.href.includes('r-817')));
    assert.ok(treffers.some((t) => t.soort === 'Aanvraag' && t.href.includes('a-101')));
    assert.ok(treffers.some((t) => t.soort === 'Boeking' && t.href.includes('b-042')));
  });

  test('zoek op Nederlandse datum “12 september”', () => {
    const treffers = zoekDemo('12 september');
    assert.ok(treffers.some((t) => t.href.includes('b-042')));
  });

  test('lege zoekterm geeft niets', () => {
    assert.deepEqual(zoekDemo('  '), []);
  });

  test('formatNl en maandverschuiving', () => {
    assert.equal(formatNl('2026-09-12'), '12 september 2026');
    assert.equal(verschuifMaand('2026-09', -1), '2026-08');
    assert.equal(verschuifMaand('2026-12', 1), '2027-01');
  });

  test('september 2026 begint op dinsdag (één lege maandagcel)', () => {
    const raster = maandRaster('2026-09');
    assert.equal(raster[0]?.ymd, null);
    assert.equal(raster[1]?.ymd, '2026-09-01');
    assert.equal(raster.filter((c) => c.ymd).length, 30);
  });

  test('dashboardkaarten uit voorbeelddata zijn klikbaar voor Super Admin', () => {
    const kaarten = dashboardVoor({ isSuperAdmin: true, perModule: {} }, demoDashboardBron());
    assert.ok(kaarten.some((k) => k.sleutel === 'nieuwe_aanvragen' && k.aantal === 1));
    assert.ok(kaarten.some((k) => k.sleutel === 'opties_verlopen' && k.aantal === 1));
    assert.ok(kaarten.some((k) => k.sleutel === 'gastheren_toewijzen' && k.aantal === 1));
    assert.ok(kaarten.every((k) => k.aantal > 0));
  });

  test('zoek “Vos” vindt de gastheer', () => {
    const treffers = zoekDemo('Vos');
    assert.ok(treffers.some((t) => t.soort === 'Gastheer' && t.href.includes('g-1')));
  });

  test('demoDashboardBron telt exposities zonder gastheer', () => {
    assert.equal(demoDashboardBron().gastherenToewijzen, 1);
  });
});
