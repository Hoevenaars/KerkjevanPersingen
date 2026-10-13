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
  inhoudUitInstelling,
  SLUITING_TEKST,
  SLUITING_TITEL,
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
    const leeg = { soort: 'weekend' as const, eyebrow: '', titel: '', tekst: '', knop: '', link: '' };
    const uit = { ...leeg, actief: false, zaterdag: '2026-10-17' };
    assert.equal(bannerZichtbaar(uit, new Date('2026-10-06T12:00:00Z'), new Set()), false);
    assert.equal(bannerZichtbaar(
      { ...leeg, actief: true, zaterdag: '2026-10-17' },
      new Date('2026-10-19T12:00:00Z'),
      new Set(),
    ), false);
    assert.equal(toonVrijgekomenWeekendBannerOpPagina(
      '/',
      new Date('2026-10-06T12:00:00Z'),
      { ...leeg, actief: true, zaterdag: '2026-10-17' },
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

  test('opgeslagen json komt terug en een ander weekend blijft een vrij weekend', () => {
    const rij = vrijgekomenWeekendRij({ actief: true, soort: 'weekend', zaterdag: '2026-11-07', eyebrow: '', titel: '', tekst: '', knop: '', link: '', tot: '' });
    assert.equal(rij.sleutel, 'vrijgekomen_weekend_banner');
    assert.equal(rij.waarde.soort, 'weekend');
    assert.deepEqual(parseVrijgekomenWeekend(rij.waarde), {
      actief: true,
      soort: 'weekend',
      zaterdag: '2026-11-07',
      eyebrow: '',
      titel: '',
      tekst: '',
      knop: '',
      link: '',
      tot: '',
    });
    const tijdens = new Date('2026-10-06T12:00:00Z');
    assert.equal(bannerUitRpc(null, null, tijdens), null);
    assert.equal(bannerUitRpc({ zaterdag: '2026-11-07', zondag: '2026-11-08' }, null, tijdens)?.zaterdag, '2026-11-07');
    assert.equal(bannerUitRpc({ soort: 'weekend', zaterdag: '2026-11-07', zondag: '2026-11-08' }, null, tijdens)?.soort, 'weekend');
  });
});

describe('sluiting in plaats van beschikbaar weekend', () => {
  const tijdens = new Date('2026-10-13T12:00:00Z');
  const boodschap = `${SLUITING_TITEL} ${SLUITING_TEKST}`;

  test('de oude beschikbaar-melding wordt de sluitingstekst, zonder datumkaarten', () => {
    const uitOpslag = parseVrijgekomenWeekend({ actief: true, zaterdag: '2026-10-17' });
    assert.equal(uitOpslag?.soort, 'tekst');
    assert.equal(`${uitOpslag?.titel} ${uitOpslag?.tekst}`, boodschap);
    const uitFunctie = bannerUitRpc({ zaterdag: '2026-10-17', zondag: '2026-10-18' }, null, tijdens);
    const inhoud = uitFunctie ? inhoudUitInstelling(uitFunctie) : null;
    assert.equal(inhoud?.kaarten.length, 0);
    assert.equal(inhoud?.knop, '');
    assert.equal(`${inhoud?.titel} ${inhoud?.tekst}`, boodschap);
    assert.equal(bannerUitRpc({ zaterdag: '2026-10-17' }, null, new Date('2026-10-19T12:00:00Z')), null);
    const terugval = bannerUitRpc(null, { message: 'function ontbreekt' }, tijdens);
    assert.equal(`${terugval?.titel} ${terugval?.tekst}`, boodschap);
  });

  test('een gewijzigde tekst in het formulier blijft bewaard', () => {
    const instelling = bannerUitFormulier({
      get: (naam) => ({
        soort: 'tekst',
        titel: SLUITING_TITEL,
        tekst: 'Gewijzigde tekst vanuit beheer.',
        tot: '2026-10-18',
      }[naam] ?? ''),
      getAll: () => ['1'],
    }, new Set());
    assert.equal(instelling.tekst, 'Gewijzigde tekst vanuit beheer.');
    assert.equal(instelling.tot, '2026-10-18');
    assert.equal(inhoudUitInstelling(instelling)?.kaarten.length, 0);
  });
});

describe('banner met alleen tekst', () => {
  const later = new Date('2027-06-01T12:00:00Z');

  function formVan(waarden: Record<string, string>, actief = true) {
    return {
      get: (naam: string) => waarden[naam] ?? null,
      getAll: () => (actief ? ['0', '1'] : ['0']),
    };
  }

  test('bewaart tekst zonder datum en zonder vrij weekend', () => {
    const instelling = bannerUitFormulier(formVan({
      soort: 'tekst',
      zaterdag: '2026-10-24',
      eyebrow: 'Let op',
      titel: 'Het kerkje is open',
      tekst: 'Kom langs wanneer het uitkomt.',
      knop: 'Bekijk de agenda',
      link: '/agenda/',
    }), new Set(['2026-10-17']));
    assert.equal(instelling.soort, 'tekst');
    assert.equal(instelling.actief, true);
    assert.equal(instelling.zaterdag, '2026-10-24');
    assert.equal(instelling.titel, 'Het kerkje is open');
    const inhoud = inhoudUitInstelling(instelling);
    assert.equal(inhoud?.soort, 'tekst');
    assert.deepEqual(inhoud?.kaarten, []);
    assert.equal(inhoud?.knop, 'Bekijk de agenda');
    assert.equal(inhoud?.aanvraagPad, '/agenda/');
    assert.equal(inhoud?.zaterdag, '');
    assert.equal(bannerZichtbaar(instelling, later, new Set(['2026-10-17', '2026-10-18'])), true);
    assert.equal(toonVrijgekomenWeekendBannerOpPagina('/verhuur/aanvragen/', later, instelling), false);
    assert.equal(toonVrijgekomenWeekendBannerOpPagina('/', later, instelling), true);
  });

  test('een tekstbanner kan zonder knop, en een onveilige link wordt geweigerd', () => {
    const zonderKnop = bannerUitFormulier(formVan({
      soort: 'tekst',
      titel: 'Welkom',
      tekst: 'Alleen deze tekst.',
    }), new Set());
    const inhoud = inhoudUitInstelling(zonderKnop);
    assert.equal(inhoud?.knop, '');
    assert.equal(inhoud?.aanvraagPad, '');
    assert.equal(inhoud?.kaarten.length, 0);
    assert.throws(
      () => bannerUitFormulier(formVan({
        soort: 'tekst',
        titel: 'Welkom',
        knop: 'Klik',
        link: 'javascript:alert(1)',
      }), new Set()),
      /link moet beginnen/,
    );
    assert.throws(
      () => bannerUitFormulier(formVan({ soort: 'tekst' }), new Set()),
      /titel of tekst/,
    );
    const uit = bannerUitFormulier(formVan({ soort: 'tekst' }, false), new Set());
    assert.equal(uit.actief, false);
    assert.equal(bannerZichtbaar(uit, later), false);
  });

  test('de publieke functie levert tekst ook nadat een weekend voorbij zou zijn', () => {
    const instelling = bannerUitRpc({
      soort: 'tekst',
      eyebrow: 'Let op',
      titel: 'Welkom',
      tekst: 'Kom langs.',
      knop: 'Lees meer',
      link: 'https://kerkjevanpersingen.nl/agenda',
    }, null, later);
    assert.equal(instelling?.soort, 'tekst');
    assert.equal(instelling?.titel, 'Welkom');
    const inhoud = instelling ? inhoudUitInstelling(instelling) : null;
    assert.equal(inhoud?.aanvraagPad, 'https://kerkjevanpersingen.nl/agenda');
    assert.equal(inhoud?.kaarten.length, 0);
    assert.equal(bannerUitRpc({ soort: 'tekst', titel: '   ', tekst: '' }, null, later), null);
    const onveilig = bannerUitRpc({
      soort: 'tekst',
      titel: 'Welkom',
      knop: 'Klik',
      link: 'javascript:alert(1)',
    }, null, later);
    assert.equal(onveilig ? inhoudUitInstelling(onveilig)?.aanvraagPad : 'mist', '');
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
  const tekstSql = readFileSync(new URL('../supabase/migrations/20261013193000_vrijgekomen_weekend_banner_tekst.sql', import.meta.url), 'utf8');
  const component = readFileSync(new URL('../src/components/VrijgekomenWeekendBanner.astro', import.meta.url), 'utf8');
  assert.match(pagina, /Vrij weekend/);
  assert.match(pagina, /name="actie" value="vrij_weekend_banner"/);
  assert.match(pagina, /Banner tonen/);
  assert.match(pagina, /volledigVrijeWeekenden/);
  assert.match(pagina, /data-periode/);
  assert.match(pagina, /name="soort" value="tekst"/);
  assert.match(pagina, /Alleen tekst, zonder datum/);
  assert.match(pagina, /#vrij-weekend-formulier:has\(input\[name="soort"\]\[value="tekst"\]:checked\) #banner-tekst-velden/);
  assert.match(sql, /vrijgekomen_weekend_banner/);
  assert.match(sql, /'zaterdag', '2026-10-17'/);
  assert.match(sql, /publieke_vrijgekomen_weekend_banner/);
  assert.match(sql, /grant execute on function public\.publieke_vrijgekomen_weekend_banner\(\) to anon, authenticated, service_role/);
  assert.match(tekstSql, /coalesce\(i\.waarde->>'soort', 'weekend'\) = 'tekst'/);
  assert.match(tekstSql, /Door omstandigheden is het kerkje komend weekend \(17\/18 oktober\) gesloten\./);
  assert.match(tekstSql, /Geen expositie dus\. Excuses voor het ongemak!/);
  assert.match(tekstSql, /'tot', '2026-10-18'/);
  assert.match(pagina, /name="tot"/);
  assert.match(tekstSql, /grant execute on function public\.publieke_vrijgekomen_weekend_banner\(\) to anon, authenticated, service_role/);
  assert.match(component, /leesVrijgekomenWeekendBanner/);
  assert.match(component, /class="banner"/);
  assert.match(component, /toonDatums/);
});
