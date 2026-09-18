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
      '/verhuur/aanvragen/?datum=2026-11-07&datumTot=2026-11-08&soort=expositie',
    );
    assert.equal(VRIJGEKOMEN_EXPOSITIE_WEEKEND.zaterdag, '2026-11-07');
    assert.equal(VRIJGEKOMEN_EXPOSITIE_WEEKEND.zondag, '2026-11-08');
  });
});

describe('weekendDatumKaarten', () => {
  test('zet 7 en 8 november als zichtbare datumkaarten', () => {
    const [zaterdag, zondag] = weekendDatumKaarten();
    assert.equal(zaterdag.weekdag, 'zaterdag');
    assert.equal(zaterdag.dag, '7');
    assert.match(zaterdag.maand, /^nov/i);
    assert.equal(zondag.weekdag, 'zondag');
    assert.equal(zondag.dag, '8');
    assert.match(zondag.maand, /^nov/i);
  });
});

describe('copy', () => {
  test('noemt de vrijgekomen datum in titel of knop', () => {
    assert.match(VRIJGEKOMEN_EXPOSITIE_WEEKEND.eyebrow, /vrij/i);
    assert.match(VRIJGEKOMEN_EXPOSITIE_WEEKEND.titel, /vrijgekomen/i);
    assert.match(VRIJGEKOMEN_EXPOSITIE_WEEKEND.knop, /7 en 8 november/i);
  });
});

describe('VRIJGEKOMEN_WEEKEND_BANNER_AAN', () => {
  test('staat uit omdat 7-8 november is vergeven', () => {
    assert.equal(VRIJGEKOMEN_WEEKEND_BANNER_AAN, false);
  });
});

describe('weekendNogBeschikbaar', () => {
  test('blijft true tot en met zondag 8 november (Nederlandse tijd)', () => {
    assert.equal(weekendNogBeschikbaar(new Date('2026-09-10T12:00:00Z')), true);
    assert.equal(weekendNogBeschikbaar(new Date('2026-11-07T12:00:00Z')), true);
    // 22:30 UTC = 23:30 Amsterdam (wintertijd) — nog steeds 8 november
    assert.equal(weekendNogBeschikbaar(new Date('2026-11-08T22:30:00Z')), true);
  });

  test('is false vanaf maandag 9 november Nederlandse tijd', () => {
    // 23:30 UTC op 8 november = 00:30 Amsterdam op 9 november
    assert.equal(weekendNogBeschikbaar(new Date('2026-11-08T23:30:00Z')), false);
    assert.equal(weekendNogBeschikbaar(new Date('2026-11-09T12:00:00Z')), false);
  });
});

describe('toonVrijgekomenWeekendBanner', () => {
  test('blijft weg zolang de schakelaar uit staat, ook tijdens het weekend', () => {
    assert.equal(toonVrijgekomenWeekendBanner(new Date('2026-09-10T12:00:00Z')), false);
    assert.equal(toonVrijgekomenWeekendBanner(new Date('2026-11-07T12:00:00Z')), false);
    assert.equal(toonVrijgekomenWeekendBanner(new Date('2026-11-08T22:30:00Z')), false);
  });
});

describe('toonVrijgekomenWeekendBannerOpPagina', () => {
  test('staat nergens zolang de schakelaar uit staat', () => {
    const nu = new Date('2026-09-14T12:00:00Z');
    assert.equal(toonVrijgekomenWeekendBannerOpPagina('/', nu), false);
    assert.equal(toonVrijgekomenWeekendBannerOpPagina('/verhuur/', nu), false);
    assert.equal(toonVrijgekomenWeekendBannerOpPagina('/agenda/', nu), false);
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
