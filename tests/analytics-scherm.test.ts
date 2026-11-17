import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { analyticsHref, bundelVerwijzers, leesAnalyticsScherm, vergelijking } from '../src/platform/analytics-scherm.ts';

const NU = new Date('2026-09-29T12:00:00.000Z');
const ZONE = 'Europe/Amsterdam';

describe('analyticscherm', () => {
  test('een vaste periode bewaart de filters en laat 30 dagen uit de url', () => {
    const scherm = leesAnalyticsScherm(new URLSearchParams('periode=7&pagina=agenda&apparaat=mobile&bron=google.com'), NU, ZONE);
    assert.equal(scherm.eigen, false);
    assert.equal(scherm.periode.dagen, 7);
    assert.equal(scherm.selectie.pageKey, 'agenda');
    assert.equal(analyticsHref(scherm, { periode: 30 }), '/beheer/analytics/?pagina=agenda&apparaat=mobile&bron=google.com');
    assert.equal(analyticsHref(scherm, { pagina: null }), '/beheer/analytics/?periode=7&apparaat=mobile&bron=google.com');
    assert.equal(analyticsHref(scherm, { wisFilters: true }), '/beheer/analytics/?periode=7');
  });

  test('een eigen bereik wint en een ongeldig bereik valt terug', () => {
    const eigen = leesAnalyticsScherm(new URLSearchParams('van=2026-09-01&tot=2026-09-14'), NU, ZONE);
    assert.equal(eigen.eigen, true);
    assert.equal(eigen.periode.dagen, 14);
    assert.equal(analyticsHref(eigen, { periode: 7 }), '/beheer/analytics/?periode=7');
    const kapot = leesAnalyticsScherm(new URLSearchParams('van=morgen&tot=later'), NU, ZONE);
    assert.equal(kapot.ongeldigePeriode, true);
    assert.equal(kapot.periode.dagen, 30);
    assert.equal(leesAnalyticsScherm(new URLSearchParams('bron=direct'), NU, ZONE).selectie.bron, 'direct');
    assert.equal(leesAnalyticsScherm(new URLSearchParams('pagina=../geheim&apparaat=laptop'), NU, ZONE).selectie.pageKey, undefined);
  });

  test('de vergelijking noemt de vorige periode zonder deling door nul', () => {
    assert.equal(vergelijking(12, 10, 30).tekst, '20% meer dan de 30 dagen ervoor.');
    assert.equal(vergelijking(8, 10, 7).richting, 'minder');
    assert.equal(vergelijking(4, 0, 1).tekst, 'Geen weergaven in de dag ervoor.');
    assert.equal(vergelijking(3, 3, 90).richting, 'gelijk');
  });

  test('gelijke namen zoals Google vormen één herkomst', () => {
    const gebundeld = bundelVerwijzers([
      { host: 'google.com', label: 'Google', pageviews: 2 },
      { host: 'google.nl', label: 'Google', pageviews: 3 },
      { host: null, label: 'Direct', pageviews: 5 },
    ]);
    assert.deepEqual(
      gebundeld.map((bron) => [bron.label, bron.pageviews, bron.hosts.length]),
      [
        ['Direct', 5, 1],
        ['Google', 5, 2],
      ],
    );
    const scherm = leesAnalyticsScherm(new URLSearchParams('herkomst=Google'), NU, ZONE);
    assert.equal(scherm.selectie.bronLabel, 'Google');
    assert.equal(analyticsHref(scherm, { herkomst: null }), '/beheer/analytics/');
    assert.equal(leesAnalyticsScherm(new URLSearchParams('herkomst=<script>'), NU, ZONE).selectie.bronLabel, undefined);
  });
});
