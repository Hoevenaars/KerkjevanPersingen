import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  VRIJGEKOMEN_EXPOSITIE_WEEKEND,
  VRIJGEKOMEN_WEEKEND_BANNER_AAN,
  aanvraagPadVrijgekomenWeekend,
  toonVrijgekomenWeekendBanner,
  toonVrijgekomenWeekendBannerOpPagina,
  weekendDatumKaarten,
  weekendNogBeschikbaar,
} from '../src/lib/vrijgekomen-weekend.ts';

describe('aanvraagPadVrijgekomenWeekend', () => {
  test('linkt naar het aanvraagformulier met dit weekend en soort expositie', () => {
    const pad = aanvraagPadVrijgekomenWeekend();
    assert.equal(
      pad,
      '/verhuur/aanvragen/?datum=2026-10-17&datumTot=2026-10-18&soort=expositie',
    );
    assert.equal(VRIJGEKOMEN_EXPOSITIE_WEEKEND.zaterdag, '2026-10-17');
    assert.equal(VRIJGEKOMEN_EXPOSITIE_WEEKEND.zondag, '2026-10-18');
  });
});

describe('weekendDatumKaarten', () => {
  test('zet 17 en 18 oktober als zichtbare datumkaarten', () => {
    const [zaterdag, zondag] = weekendDatumKaarten();
    assert.equal(zaterdag.weekdag, 'zaterdag');
    assert.equal(zaterdag.dag, '17');
    assert.match(zaterdag.maand, /^okt/i);
    assert.equal(zondag.weekdag, 'zondag');
    assert.equal(zondag.dag, '18');
    assert.match(zondag.maand, /^okt/i);
  });
});

describe('copy', () => {
  test('noemt de vrijgekomen datum in titel of knop', () => {
    assert.match(VRIJGEKOMEN_EXPOSITIE_WEEKEND.eyebrow, /vrij/i);
    assert.match(VRIJGEKOMEN_EXPOSITIE_WEEKEND.titel, /vrijgekomen/i);
    assert.match(VRIJGEKOMEN_EXPOSITIE_WEEKEND.knop, /17 en 18 oktober/i);
  });
});

describe('VRIJGEKOMEN_WEEKEND_BANNER_AAN', () => {
  test('staat aan omdat 17-18 oktober weer vrij is', () => {
    assert.equal(VRIJGEKOMEN_WEEKEND_BANNER_AAN, true);
  });
});

describe('weekendNogBeschikbaar', () => {
  test('blijft true tot en met zondag 18 oktober (Nederlandse tijd)', () => {
    assert.equal(weekendNogBeschikbaar(new Date('2026-09-10T12:00:00Z')), true);
    assert.equal(weekendNogBeschikbaar(new Date('2026-10-17T12:00:00Z')), true);
    // 21:30 UTC = 23:30 Amsterdam (zomertijd) — nog steeds 18 oktober
    assert.equal(weekendNogBeschikbaar(new Date('2026-10-18T21:30:00Z')), true);
  });

  test('is false vanaf maandag 19 oktober Nederlandse tijd', () => {
    // 22:30 UTC op 18 oktober = 00:30 Amsterdam op 19 oktober
    assert.equal(weekendNogBeschikbaar(new Date('2026-10-18T22:30:00Z')), false);
    assert.equal(weekendNogBeschikbaar(new Date('2026-10-19T12:00:00Z')), false);
  });
});

describe('toonVrijgekomenWeekendBanner', () => {
  test('blijft zichtbaar tot en met zondag 18 oktober (Nederlandse tijd)', () => {
    assert.equal(toonVrijgekomenWeekendBanner(new Date('2026-09-10T12:00:00Z')), true);
    assert.equal(toonVrijgekomenWeekendBanner(new Date('2026-10-17T12:00:00Z')), true);
    // 21:30 UTC = 23:30 Amsterdam (zomertijd) — nog steeds 18 oktober
    assert.equal(toonVrijgekomenWeekendBanner(new Date('2026-10-18T21:30:00Z')), true);
  });

  test('verdwijnt vanaf maandag 19 oktober Nederlandse tijd', () => {
    // 22:30 UTC op 18 oktober = 00:30 Amsterdam op 19 oktober
    assert.equal(toonVrijgekomenWeekendBanner(new Date('2026-10-18T22:30:00Z')), false);
    assert.equal(toonVrijgekomenWeekendBanner(new Date('2026-10-19T12:00:00Z')), false);
  });
});

describe('toonVrijgekomenWeekendBannerOpPagina', () => {
  test('staat op homepage, verhuur en agenda', () => {
    const nu = new Date('2026-09-14T12:00:00Z');
    assert.equal(toonVrijgekomenWeekendBannerOpPagina('/', nu), true);
    assert.equal(toonVrijgekomenWeekendBannerOpPagina('/verhuur/', nu), true);
    assert.equal(toonVrijgekomenWeekendBannerOpPagina('/agenda/', nu), true);
  });

  test('blijft weg op het aanvraagformulier', () => {
    const nu = new Date('2026-09-14T12:00:00Z');
    assert.equal(toonVrijgekomenWeekendBannerOpPagina('/verhuur/aanvragen/', nu), false);
    assert.equal(
      toonVrijgekomenWeekendBannerOpPagina('/verhuur/aanvragen/bedankt/', nu),
      false,
    );
  });
});
