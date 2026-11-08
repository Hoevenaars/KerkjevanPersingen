import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DemoAanvraag, DemoBoeking } from '../src/platform/demo-data.ts';
import { beheerToegang } from '../src/platform/autorisatie.ts';
import { verhuurOverzichtAan, verhuurVerzoekToegestaan } from '../src/platform/verhuur-vlag.ts';
import { leesDossierSporen } from '../src/platform/verhuur-dossier-lees.ts';
import {
  boekingBezetKalender,
  bolVoorSoort,
  leesPeriodeKeuze,
  maakDossier,
  maakVerhuurOverzicht,
  periodeLabel,
  type OverzichtBetaling,
  type OverzichtInvoer,
} from '../src/platform/verhuur-overzicht.ts';

function boeking(deel: Partial<DemoBoeking> & Pick<DemoBoeking, 'id' | 'status' | 'start' | 'eind'>): DemoBoeking {
  return {
    nummer: deel.id,
    interneTitel: '',
    soort: '',
    huurder: '',
    email: '',
    tarief: '',
    aanbetaling: '',
    aanbetalingBinnen: false,
    publiek: false,
    notities: '',
    relatieId: '',
    ...deel,
  };
}

function betaling(deel: Partial<OverzichtBetaling> & Pick<OverzichtBetaling, 'boekingId' | 'soort' | 'status'>): OverzichtBetaling {
  return {
    id: `${deel.boekingId}-${deel.soort}`,
    bedrag: 0,
    vervaldatum: '',
    ontvangenOp: '',
    ...deel,
  };
}

function invoer(deel: Partial<OverzichtInvoer> & Pick<OverzichtInvoer, 'jaar'>): OverzichtInvoer {
  return {
    maand: null,
    boekingen: [],
    betalingen: [],
    betaalregelsZichtbaar: true,
    blokkades: [],
    bronnen: [],
    aanvragen: [],
    documenten: [],
    ...deel,
  };
}

function rij(overzicht: ReturnType<typeof maakVerhuurOverzicht>, sleutel: string) {
  const gevonden = overzicht.rijen.find((item) => item.sleutel === sleutel);
  assert.ok(gevonden, sleutel);
  return gevonden;
}

describe('verhuurvlag', () => {
  test('alleen een expliciete true zet het scherm open', () => {
    assert.equal(verhuurOverzichtAan({}), false);
    assert.equal(verhuurOverzichtAan({ VERHUUR_OVERZICHT: 'false', BEHEER_ENABLED: 'true', DEV: true }), false);
    assert.equal(verhuurOverzichtAan({ VERHUUR_OVERZICHT: 'true' }), true);
    assert.equal(verhuurVerzoekToegestaan('POST'), false);
    assert.equal(verhuurVerzoekToegestaan('GET'), true);
  });

  test('iemand zonder boekingenrecht ziet de route niet', () => {
    assert.equal(
      beheerToegang({
        methode: 'GET',
        module: 'boekingen',
        ingelogd: true,
        actief: true,
        rechten: { isSuperAdmin: false, perModule: { finance: 'schrijven' } },
        viewAsActief: false,
      }),
      'verborgen',
    );
    assert.equal(
      beheerToegang({
        methode: 'GET',
        module: 'boekingen',
        ingelogd: true,
        actief: true,
        rechten: { isSuperAdmin: false, perModule: { boekingen: 'lezen' } },
        viewAsActief: false,
      }),
      'ok',
    );
  });
});

describe('periode', () => {
  test('een weekend en een doordeweekse dag krijgen een leesbaar label', () => {
    assert.equal(periodeLabel('2027-05-08', '2027-05-09'), '8 en 9 mei 2027');
    assert.equal(periodeLabel('2027-07-14', '2027-07-14'), '14 juli 2027');
    assert.equal(periodeLabel('2026-12-19', '2027-01-04'), '19 december 2026 t/m 4 januari 2027');
  });

  test('een ongeldige maand valt terug op het hele jaar', () => {
    assert.deepEqual(leesPeriodeKeuze({ get: (naam) => (naam === 'jaar' ? '2027' : '13') }, '2026-11-08'), {
      jaar: 2027,
      maand: null,
    });
  });
});

describe('verhuuroverzicht', () => {
  const withaar = boeking({
    id: '67',
    nummer: 'BKG-2027-028',
    status: 'migratie_vastgelegd',
    start: '2027-07-10',
    eind: '2027-07-11',
    huurder: 'Mirjam Withaar',
    medeExposanten: 'Mede-exposant',
    soort: '',
    aanbetalingBinnen: false,
    notities: 'Verplaatst',
  });
  const hovell = boeking({
    id: '76',
    nummer: 'BKG-2027-041',
    status: 'geannuleerd',
    start: '2027-07-10',
    eind: '2027-07-11',
    huurder: 'Mariet van Hovell tot Westerflier',
    aanbetalingBinnen: false,
  });
  const optie = boeking({
    id: 'optie',
    status: 'optie',
    start: '2027-06-05',
    eind: '2027-06-06',
    huurder: 'Optiehuurder',
    soort: 'expositie',
  });
  const doordeweeks = boeking({
    id: 'woensdag',
    status: 'definitief',
    start: '2027-07-14',
    eind: '2027-07-14',
    huurder: 'Doordeweeks',
    soort: 'diverse',
  });
  const betalingen = [
    betaling({ boekingId: '67', soort: 'aanbetaling', status: 'ontvangen', bedrag: 100 }),
    betaling({ boekingId: '67', soort: 'restant', status: 'open', bedrag: 50 }),
    betaling({ boekingId: '76', soort: 'aanbetaling', status: 'ontvangen', bedrag: 100 }),
    betaling({ boekingId: '76', soort: 'restant', status: 'open', bedrag: 50 }),
  ];

  test('4 november 2026 blijft zoals vastgelegd: mei vrij, juli alleen Withaar bezet', () => {
    const overzicht = maakVerhuurOverzicht(invoer({
      jaar: 2027,
      maand: null,
      boekingen: [withaar, hovell],
      betalingen,
    }));
    const mei = overzicht.rijen.find((item) => item.start === '2027-05-08' && item.herkomst === 'vrij');
    assert.ok(mei);
    assert.equal(mei.periodeLabel, '8 en 9 mei 2027');
    assert.equal(mei.bezet, false);

    const bezet = rij(overzicht, 'boeking:67');
    const geannuleerd = rij(overzicht, 'boeking:76');
    assert.equal(bezet.bezet, true);
    assert.equal(bezet.huurder, 'Mirjam Withaar');
    assert.equal(bezet.huurderExtra, 'Mede-exposant');
    assert.equal(bezet.aanbetaling, 'afgerond');
    assert.equal(bezet.rest, 'openstaand');
    assert.equal(bezet.contract, 'onbekend');
    assert.equal(bezet.vlagWijktAf, true);
    assert.equal(geannuleerd.bezet, false);
    assert.equal(geannuleerd.aanbetaling, 'afgerond');
    assert.equal(geannuleerd.rest, 'openstaand');
    assert.equal(
      overzicht.rijen.some((item) => item.herkomst === 'vrij' && item.start === '2027-07-10'),
      false,
    );
  });

  test('een aanvraag zonder boeking vult geen weekend', () => {
    const aanvraag: DemoAanvraag = {
      id: 'a1',
      status: 'nieuw',
      naam: 'Nieuwe aanvraag',
      email: 'a@example.test',
      telefoon: '',
      adres: '',
      soort: 'expositie',
      start: '2027-05-08',
      eind: '2027-05-09',
      personen: '',
      toelichting: '',
      binnengekomen: '2026-11-05',
    };
    const overzicht = maakVerhuurOverzicht(invoer({ jaar: 2027, aanvragen: [aanvraag] }));
    assert.equal(overzicht.aanvragen.length, 1);
    assert.equal(overzicht.aanvragen[0].heeftBoeking, false);
    const mei = overzicht.rijen.find((item) => item.start === '2027-05-08');
    assert.equal(mei?.herkomst, 'vrij');
  });

  test('optie, winterstop, doordeweeks en tegenstrijdige betaling', () => {
    const overzicht = maakVerhuurOverzicht(invoer({
      jaar: 2027,
      boekingen: [optie, doordeweeks, boeking({
        id: 'mix',
        status: 'definitief',
        start: '2027-08-07',
        eind: '2027-08-08',
        huurder: 'Mix',
      })],
      betalingen: [
        betaling({ boekingId: 'mix', soort: 'aanbetaling', status: 'ontvangen' }),
        betaling({ boekingId: 'mix', soort: 'aanbetaling', status: 'open', id: 'mix-2' }),
      ],
      blokkades: [{
        id: 'w',
        titel: 'Winterstop',
        start: '2027-12-18',
        eind: '2028-01-03',
        blokkeert: true,
        notities: 'Dicht',
      }],
    }));
    assert.equal(rij(overzicht, 'boeking:optie').bezet, true);
    assert.equal(rij(overzicht, 'boeking:woensdag').periodeLabel, '14 juli 2027');
    assert.equal(
      overzicht.rijen.some((item) => item.herkomst === 'vrij' && item.start === '2027-07-17'),
      true,
    );
    assert.equal(rij(overzicht, 'boeking:mix').aanbetaling, 'tegenstrijdig');
    const winter = rij(overzicht, 'winter:w');
    assert.equal(winter.bezet, true);
    assert.equal(
      overzicht.rijen.some((item) => item.herkomst === 'vrij' && item.start === '2027-12-18'),
      false,
    );
  });

  test('een kalenderbron zonder boeking houdt het weekend bezet', () => {
    const overzicht = maakVerhuurOverzicht(invoer({
      jaar: 2027,
      maand: 5,
      bronnen: [{
        id: 'bron-1',
        titel: 'Bezet uit de kalender',
        start: '2027-05-08',
        eind: '2027-05-09',
        zichtbaarheid: 'bezet',
        levenscyclus: 'actief',
      }],
    }));
    assert.equal(rij(overzicht, 'kalender:bron-1').bezet, true);
    assert.equal(overzicht.rijen.some((item) => item.herkomst === 'vrij' && item.start === '2027-05-08'), false);
  });

  test('zonder finance-recht blijven de betaalbolletjes afgeschermd', () => {
    const overzicht = maakVerhuurOverzicht(invoer({
      jaar: 2027,
      maand: 7,
      betaalregelsZichtbaar: false,
      boekingen: [withaar],
      betalingen,
    }));
    assert.equal(rij(overzicht, 'boeking:67').aanbetaling, 'niet_zichtbaar');
    assert.equal(rij(overzicht, 'boeking:67').vlagWijktAf, false);
  });

  test('de boolean aanbetaling_ontvangen beslist de bol niet', () => {
    assert.equal(bolVoorSoort([betaling({ boekingId: '1', soort: 'aanbetaling', status: 'ontvangen' })], 'aanbetaling'), 'afgerond');
    assert.equal(bolVoorSoort([betaling({ boekingId: '1', soort: 'restant', status: 'open' })], 'restant'), 'openstaand');
    assert.equal(bolVoorSoort([], 'aanbetaling'), 'onbekend');
    assert.equal(boekingBezetKalender('migratie_vastgelegd'), true);
    assert.equal(boekingBezetKalender('geannuleerd'), false);
    assert.equal(boekingBezetKalender('aanvraag'), false);
  });
});

describe('dossier', () => {
  test('toont de ledger, geen verzonnen contractstatus en geen bevestigde mail', () => {
    const boekingRij = boeking({
      id: '67',
      status: 'migratie_vastgelegd',
      start: '2027-07-10',
      eind: '2027-07-11',
      huurder: 'Mirjam Withaar',
      email: 'huurder@example.test',
      aanbetalingBinnen: false,
      notities: 'Bijzonder',
      medeExposanten: 'Mede-exposant',
    });
    const blokken = maakDossier(
      boekingRij,
      invoer({
        jaar: 2027,
        boekingen: [boekingRij],
        betalingen: [
          betaling({ boekingId: '67', soort: 'aanbetaling', status: 'ontvangen', bedrag: 100, ontvangenOp: '2026-01-02' }),
          betaling({ boekingId: '67', soort: 'restant', status: 'open', bedrag: 40 }),
        ],
      }),
      { naam: 'Mirjam Withaar', organisatie: '', email: 'anders@example.test', telefoon: '0600000000', adres: 'Dorp 1' },
      null,
      { verzendingen: [], verzendingFout: null, audit: [], auditFout: null, auditZichtbaar: true },
    );
    const tekst = blokken.map((blok) => `${blok.titel} ${blok.toelichting} ${blok.regels.map((regel) => regel.waarde).join(' ')}`).join('\n');
    assert.match(tekst, /Mede-exposant/);
    assert.match(tekst, /0600000000/);
    assert.match(tekst, /Onbekend/);
    assert.match(tekst, /aanbetaling_ontvangen wijkt af/);
    assert.match(tekst, /Geen verzendregel gevonden/);
    assert.match(tekst, /geen bewijs dat de ontvanger/);
    assert.equal(blokken.some((blok) => blok.regels.some((regel) => regel.waarde === 'Verzonden')), false);
  });
});

describe('dossierlezer', () => {
  test('leest verzending en audit via de sessie en verbergt een mailadres', async () => {
    const gezien: string[] = [];
    const query = (tabel: string) => {
      const ketting = {
        eq() {
          return ketting;
        },
        order() {
          return ketting;
        },
        async limit() {
          if (tabel === 'auditlog') {
            return { data: [{ actie: 'bewaar', op: '2026-11-04T20:17:20Z', actor_type: 'gebruiker', van: 'oud@example.test', naar: 'migratie_vastgelegd' }], error: null };
          }
          return { data: [], error: null };
        },
      };
      return { select() { gezien.push(tabel); return ketting; } };
    };
    const sporen = await leesDossierSporen({ from: query }, '67', true);
    assert.deepEqual(gezien, ['communicatie_verzendingen', 'auditlog']);
    assert.equal(sporen.audit[0].van, 'adres verborgen');
    assert.equal(sporen.audit[0].naar, 'migratie_vastgelegd');
    assert.equal(sporen.verzendingen.length, 0);
  });

  test('een kijkrol leest de auditlog niet', async () => {
    let auditAangeroepen = false;
    const query = (tabel: string) => {
      const ketting = {
        eq() { return ketting; },
        order() { return ketting; },
        async limit() {
          if (tabel === 'auditlog') auditAangeroepen = true;
          return { data: [], error: null };
        },
      };
      return { select() { return ketting; } };
    };
    const sporen = await leesDossierSporen({ from: query }, '67', false);
    assert.equal(auditAangeroepen, false);
    assert.equal(sporen.auditZichtbaar, false);
  });
});
