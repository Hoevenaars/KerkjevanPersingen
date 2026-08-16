import {test, describe} from 'node:test';
import assert from 'node:assert/strict';
import {
  bouwNieuwsbriefHtml,
  FOOTER_LANDSCHAP_URL,
  LOGO_URL,
  SFEER_URL,
} from '../src/lib/nieuwsbrief-html.ts';
import {activiteitRaaktWeekend, komendWeekend, kopAgendaBlok} from '../src/lib/week.ts';

describe('komendWeekend', () => {
  test('vrijdag wijst naar het komende za/zo', () => {
    const weekend = komendWeekend(new Date('2026-08-14T12:00:00Z'));
    assert.equal(weekend.zaterdag, '2026-08-15');
    assert.equal(weekend.zondag, '2026-08-16');
  });

  test('zondag hoort bij het weekend dat zaterdag begon', () => {
    const weekend = komendWeekend(new Date('2026-08-16T12:00:00Z'));
    assert.equal(weekend.zaterdag, '2026-08-15');
    assert.equal(weekend.zondag, '2026-08-16');
  });
});

describe('activiteitRaaktWeekend', () => {
  const weekend = {zaterdag: '2026-08-15', zondag: '2026-08-16'};

  test('een expositie die dit weekend loopt telt mee', () => {
    assert.equal(
      activiteitRaaktWeekend('2026-08-15T09:00:00.000Z', '2026-08-16T17:00:00.000Z', weekend),
      true,
    );
  });

  test('een expositie in 2027 telt niet als dit weekend', () => {
    assert.equal(
      activiteitRaaktWeekend('2027-07-31T21:52:00.000Z', '2027-08-01T21:52:00.000Z', weekend),
      false,
    );
  });
});

describe('kopAgendaBlok', () => {
  test('dit weekend versus binnenkort', () => {
    assert.equal(kopAgendaBlok(true), 'Dit weekend');
    assert.equal(kopAgendaBlok(false), 'Binnenkort');
  });
});

describe('bouwNieuwsbriefHtml', () => {
  const blok = {
    titel: 'Expositie Licht en Steen',
    datumTekst: 'zaterdag 15 en zondag 16 augustus 2026',
    omschrijving: 'Schilderijen in het kerkje.',
    fotoUrl: 'https://cdn.sanity.io/images/voorbeeld.jpg',
    fotoAlt: 'Expositie in het kerkje',
    agendaUrl: 'https://kerkjepersingen.nl/agenda/licht-en-steen/',
    kop: 'Dit weekend',
    isExpositie: true,
  };

  const html = bouwNieuwsbriefHtml(
    {kortNieuws: 'Het bord is vervangen.', donatieUpdate: 'De gevel is gevoegd.'},
    blok,
    'https://kerkjepersingen.nl/vrienden/afmelden?token=abc',
  );

  test('toont zegel, sfeerfoto en footer-landschap', () => {
    assert.equal(html.includes(LOGO_URL), true);
    assert.equal(html.includes(SFEER_URL), true);
    assert.equal(html.includes(FOOTER_LANDSCHAP_URL), true);
  });

  test('toont de expositiefoto uit het CMS, niet alleen tekst', () => {
    assert.equal(html.includes(blok.fotoUrl), true);
    assert.equal(html.includes(blok.titel), true);
    assert.equal(html.includes('11.00 tot 17.00'), true);
  });

  test('houdt de uitschrijflink', () => {
    assert.equal(html.includes('token=abc'), true);
  });
});
