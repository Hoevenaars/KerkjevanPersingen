import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  VRIJGEKOMEN_EXPOSITIE_WEEKEND,
  VRIJGEKOMEN_WEEKEND_BANNER_AAN,
  aanvraagPadVrijgekomenWeekend,
  bannerInhoud,
  bannerUitFormulier,
  bannerUitRpc,
  bannerZichtbaar,
  bezetteDagenUitBronnen,
  knopVanWeekend,
  parseVrijgekomenWeekend,
  periodeVanWeekend,
  toonVrijgekomenWeekendBanner,
  toonVrijgekomenWeekendBannerOpPagina,
  volledigVrijeWeekenden,
  vrijgekomenWeekendRij,
  weekendDatumKaarten,
  weekendNogBeschikbaar,
} from '../src/lib/vrijgekomen-weekend.ts';
import { bezetteKalenderDagen } from '../src/lib/datum.ts';

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

describe('gegenereerde periode', () => {
  test('bouwt datum, knop en aanvraaglink uit het gekozen weekend', () => {
    const inhoud = bannerInhoud('2026-10-17');
    assert.equal(inhoud.zondag, '2026-10-18');
    assert.equal(inhoud.periode, 'zaterdag 17 en zondag 18 oktober 2026');
    assert.equal(inhoud.knop, 'Vraag 17 en 18 oktober aan');
    assert.equal(inhoud.aanvraagPad, aanvraagPadVrijgekomenWeekend());
    assert.equal(periodeVanWeekend('2026-10-31', '2026-11-01'), 'zaterdag 31 oktober 2026 en zondag 1 november 2026');
    assert.equal(knopVanWeekend('2026-10-31', '2026-11-01'), 'Vraag 31 oktober en 1 november aan');
  });
});

describe('volledigVrijeWeekenden', () => {
  const nu = new Date('2026-10-06T12:00:00Z');

  test('biedt alleen weekenden aan waarin beide dagen vrij zijn', () => {
    const bezet = new Set(['2026-10-11', '2026-10-25']);
    const keuzes = volledigVrijeWeekenden(bezet, nu, 2);
    const zaterdagen = keuzes.map((keuze) => keuze.zaterdag);
    assert.equal(zaterdagen.includes('2026-10-10'), false);
    assert.equal(zaterdagen.includes('2026-10-17'), true);
    assert.equal(zaterdagen.includes('2026-10-24'), false);
    assert.equal(keuzes.find((keuze) => keuze.zaterdag === '2026-10-17')?.label, '17 en 18 oktober 2026');
  });

  test('een expositie die alleen op zaterdag staat, bezet ook de zondag', () => {
    const dagen = bezetteDagenUitBronnen({
      boekingen: [{ status: 'definitief', start: '2026-10-17', eind: '2026-10-17', soort: 'expositie' }],
    }, bezetteKalenderDagen);
    assert.equal(dagen.has('2026-10-17'), true);
    assert.equal(dagen.has('2026-10-18'), true);
    assert.equal(volledigVrijeWeekenden(dagen, nu, 1).some((keuze) => keuze.zaterdag === '2026-10-17'), false);
  });

  test('een verborgen of geannuleerde activiteit houdt het weekend niet bezet', () => {
    const dagen = bezetteDagenUitBronnen({
      agenda: [
        { start: '2026-10-17', eind: '2026-10-18', soort: 'expositie', publicatiestatus: 'verborgen' },
        { start: '2026-10-24', eind: '2026-10-25', soort: 'expositie', publicatiestatus: 'bezet', levenscyclus: 'geannuleerd' },
      ],
      blokkades: [{ start: '2026-10-31', eind: '2026-11-01', blokkeert: false }],
    }, bezetteKalenderDagen);
    const keuzes = volledigVrijeWeekenden(dagen, nu, 2).map((keuze) => keuze.zaterdag);
    assert.equal(keuzes.includes('2026-10-17'), true);
    assert.equal(keuzes.includes('2026-10-24'), true);
    assert.equal(keuzes.includes('2026-10-31'), true);
  });
});

describe('banner aan of uit', () => {
  test('een uitgezet of voorbij weekend blijft van de site', () => {
    const uit = { actief: false, zaterdag: '2026-10-17' };
    assert.equal(bannerZichtbaar(uit, new Date('2026-10-06T12:00:00Z'), new Set()), false);
    assert.equal(bannerZichtbaar(
      { actief: true, zaterdag: '2026-10-17' },
      new Date('2026-10-19T12:00:00Z'),
      new Set(),
    ), false);
    assert.equal(toonVrijgekomenWeekendBannerOpPagina(
      '/',
      new Date('2026-10-06T12:00:00Z'),
      { actief: true, zaterdag: '2026-10-17' },
      new Set(['2026-10-18']),
    ), false);
  });

  test('het formulier bewaart alleen een vrij weekend', () => {
    const vrij = new Set(['2026-10-17']);
    const aan = bannerUitFormulier({
      get: (naam) => (naam === 'zaterdag' ? '2026-10-17' : null),
      getAll: () => ['0', '1'],
    }, vrij);
    assert.equal(aan.actief, true);
    assert.equal(aan.zaterdag, '2026-10-17');
    assert.throws(
      () => bannerUitFormulier({
        get: (naam) => (naam === 'zaterdag' ? '2026-10-24' : null),
        getAll: () => ['0', '1'],
      }, vrij),
      /niet vrij/,
    );
    assert.throws(
      () => bannerUitFormulier({
        get: () => '',
        getAll: () => ['0', '1'],
      }, vrij),
      /Kies een vrij weekend/,
    );
  });

  test('opgeslagen json komt terug en de publieke functie valt terug op het standaardweekend', () => {
    const rij = vrijgekomenWeekendRij({ actief: true, zaterdag: '2026-10-17' });
    assert.equal(rij.sleutel, 'vrijgekomen_weekend_banner');
    assert.deepEqual(parseVrijgekomenWeekend(rij.waarde), { actief: true, zaterdag: '2026-10-17' });
    const tijdens = new Date('2026-10-06T12:00:00Z');
    assert.equal(bannerUitRpc(null, { message: 'function ontbreekt' }, tijdens)?.zaterdag, '2026-10-17');
    assert.equal(bannerUitRpc(null, null, tijdens), null);
    assert.equal(bannerUitRpc({ zaterdag: '2026-11-07', zondag: '2026-11-08' }, null, tijdens)?.zaterdag, '2026-11-07');
    assert.equal(bannerUitRpc({ zaterdag: '2026-10-17' }, null, new Date('2026-10-19T12:00:00Z')), null);
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

test('publiceren beheert de banner en de site leest alleen die instelling', () => {
  const pagina = readFileSync(new URL('../src/pages/beheer/publiceren/index.astro', import.meta.url), 'utf8');
  const sql = readFileSync(new URL('../supabase/migrations/20261006181000_vrijgekomen_weekend_banner.sql', import.meta.url), 'utf8');
  const component = readFileSync(new URL('../src/components/VrijgekomenWeekendBanner.astro', import.meta.url), 'utf8');
  assert.match(pagina, /Vrij weekend/);
  assert.match(pagina, /name="actie" value="vrij_weekend_banner"/);
  assert.match(pagina, /Banner tonen/);
  assert.match(pagina, /volledigVrijeWeekenden/);
  assert.match(pagina, /data-periode/);
  assert.match(sql, /vrijgekomen_weekend_banner/);
  assert.match(sql, /'zaterdag', '2026-10-17'/);
  assert.match(sql, /publieke_vrijgekomen_weekend_banner/);
  assert.match(sql, /grant execute on function public\.publieke_vrijgekomen_weekend_banner\(\) to anon, authenticated, service_role/);
  assert.match(component, /leesVrijgekomenWeekendBanner/);
  assert.match(component, /class="banner"/);
});
