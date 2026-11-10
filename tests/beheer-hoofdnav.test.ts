import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { magContactenZien, moduleVoorPad, toegangVoorBeheerPad } from '../src/platform/autorisatie.ts';
import {
  dossierHref,
  groepeer,
  hoofditems,
  hoofdnavAan,
  herkomstUitQuery,
  locatieVoorPad,
  metHerkomst,
  padActief,
  sectieVoorPad,
  subitems,
} from '../src/platform/beheer-hoofdnav.ts';
import { financienBeeld } from '../src/platform/beheer-financien.ts';
import { vandaagLeeg, vandaagOverzicht } from '../src/platform/beheer-vandaag.ts';
import type { GebruikerRechten } from '../src/platform/types.ts';

const admin: GebruikerRechten = { isSuperAdmin: true, perModule: {} };
const nelleke: GebruikerRechten = {
  isSuperAdmin: false,
  perModule: { aanvragen: 'schrijven', dashboard: 'lezen', gebruikers: 'verborgen' },
};
const paul: GebruikerRechten = {
  isSuperAdmin: false,
  perModule: { aanvragen: 'verborgen', boekingen: 'lezen', finance: 'schrijven' },
};
const hans: GebruikerRechten = {
  isSuperAdmin: false,
  perModule: { dashboard: 'lezen' },
};
const vriend: GebruikerRechten = {
  isSuperAdmin: false,
  perModule: { vrienden: 'lezen' },
};
const agendaOpties = { verhuurAgenda: true };
const zonderAgenda = { verhuurAgenda: false };

describe('featurevlag hoofdnavigatie', () => {
  test('staat uit zonder expliciete true', () => {
    assert.equal(hoofdnavAan({}), false);
    assert.equal(hoofdnavAan({ BEHEER_HOOFDNAV: 'false', VERHUUR_OVERZICHT: 'true' }), false);
    assert.equal(hoofdnavAan({ BEHEER_HOOFDNAV: 'true' }), true);
    assert.equal(hoofdnavAan({ BEHEER_HOOFDNAV: true }), true);
  });
});

describe('zes hoofdonderdelen', () => {
  test('super admin ziet zes ingangen en geen migratie of analytics', () => {
    const items = hoofditems(admin, agendaOpties);
    assert.deepEqual(
      items.map((item) => item.label),
      ['Overzicht', 'Verhuur', 'Website', 'Contacten', 'Financiën', 'Instellingen'],
    );
    assert.equal(items.some((item) => item.href.includes('migratie')), false);
    assert.equal(items.some((item) => item.href.includes('analytics')), false);
    assert.equal(items.find((item) => item.sleutel === 'verhuur')?.href, '/beheer/verhuur/');
  });

  test('zonder verhuuragenda wijst Verhuur naar de bestaande boekingen', () => {
    const items = hoofditems(admin, zonderAgenda);
    assert.equal(items.find((item) => item.sleutel === 'verhuur')?.href, '/beheer/boekingen/');
    assert.equal(items.find((item) => item.sleutel === 'website')?.href, '/beheer/agenda/');
    assert.equal(subitems('verhuur', admin, zonderAgenda).some((item) => item.href === '/beheer/verhuur/'), false);
    assert.equal(subitems('website', admin, zonderAgenda).some((item) => item.href === '/beheer/website/'), false);
  });

  test('een aanvraagbeheerder krijgt geen boekingen of financiën', () => {
    const items = hoofditems(nelleke, agendaOpties);
    assert.deepEqual(items.map((item) => item.sleutel), ['overzicht', 'verhuur']);
    assert.equal(items[1]?.href, '/beheer/aanvragen/');
    const sub = subitems('verhuur', nelleke, agendaOpties);
    assert.deepEqual(sub.map((item) => item.label), ['Aanvragen']);
  });

  test('de penningmeester ziet verhuur en financiën, niet de aanvragen', () => {
    const items = hoofditems(paul, agendaOpties);
    assert.deepEqual(items.map((item) => item.sleutel), ['verhuur', 'financien']);
    assert.equal(subitems('verhuur', paul, agendaOpties).some((item) => item.sleutel === 'aanvragen'), false);
    assert.equal(subitems('financien', paul, agendaOpties).length, 0);
  });

  test('alleen het overzicht voor wie verder niets mag zien', () => {
    assert.deepEqual(hoofditems(hans, agendaOpties).map((item) => item.sleutel), ['overzicht']);
  });

  test('contacten volgt het smalste bestaande recht', () => {
    assert.equal(magContactenZien(vriend), true);
    assert.equal(magContactenZien(hans), false);
    assert.deepEqual(hoofditems(vriend, agendaOpties).map((item) => item.sleutel), ['contacten']);
    assert.deepEqual(subitems('contacten', vriend, agendaOpties).map((item) => item.label), ['Vrienden']);
  });

  test('instellingen zetten migratie bij technisch en benoemen wat niet opslaat', () => {
    const sub = subitems('instellingen', admin, agendaOpties);
    assert.equal(hoofditems(admin, agendaOpties).some((item) => item.href.includes('migratie')), false);
    assert.equal(sub.find((item) => item.sleutel === 'migratie')?.groep, 'Technisch');
    assert.equal(sub.find((item) => item.sleutel === 'migratie')?.toelichting, 'alleen bekijken');
    assert.equal(sub.find((item) => item.sleutel === 'verhuurinstellingen')?.toelichting, 'nog niet op te slaan');
    assert.equal(sub.find((item) => item.sleutel === 'analytics')?.groep, 'Technisch');
    const groepen = groepeer(sub).map((groep) => groep.titel);
    assert.deepEqual(groepen, ['Organisatie en verhuur', 'Personen en toegang', 'Communicatie', 'Technisch']);
  });
});

describe('paden blijven bereikbaar', () => {
  test('oude routes vallen in het nieuwe werkgebied', () => {
    assert.equal(sectieVoorPad('/beheer/aanvragen/12/'), 'verhuur');
    assert.equal(sectieVoorPad('/beheer/publiceren/'), 'website');
    assert.equal(sectieVoorPad('/beheer/nieuwsbrief/3/'), 'contacten');
    assert.equal(sectieVoorPad('/beheer/instellingen/finance/'), 'instellingen');
    assert.equal(sectieVoorPad('/beheer/finance/'), 'financien');
    assert.equal(sectieVoorPad('/beheer/migratie/'), 'instellingen');
    assert.equal(sectieVoorPad('/beheer/analytics/'), 'instellingen');
  });

  test('algemeen is niet actief op een subpagina', () => {
    assert.equal(padActief('/beheer/instellingen/meldingen/', '/beheer/instellingen/'), false);
    assert.equal(padActief('/beheer/instellingen/', '/beheer/instellingen/'), true);
    assert.equal(padActief('/beheer/boekingen/nieuw/', '/beheer/boekingen/'), true);
  });

  test('de locatie noemt het onderdeel', () => {
    assert.deepEqual(locatieVoorPad('/beheer/aanvragen/', nelleke, agendaOpties), {
      hoofd: 'Verhuur',
      sub: 'Aanvragen',
    });
  });

  test('herkomst blijft binnen beheer', () => {
    assert.equal(metHerkomst('/beheer/boekingen/b1/', 'overzicht'), '/beheer/boekingen/b1/?van=overzicht');
    assert.equal(metHerkomst('/beheer/verhuur/?dossier=b1', 'financien'), '/beheer/verhuur/?dossier=b1&van=financien');
    assert.equal(metHerkomst('https://elders.example/beheer/', 'overzicht'), 'https://elders.example/beheer/');
    assert.equal(herkomstUitQuery('overzicht')?.label, 'Overzicht');
    assert.equal(herkomstUitQuery('https://elders.example'), null);
    assert.equal(dossierHref('b 1', true), '/beheer/verhuur/?dossier=b%201');
    assert.equal(dossierHref('b1', false), '/beheer/boekingen/b1/');
  });

  test('contacten schrijft niets en erft geen module', () => {
    assert.equal(moduleVoorPad('/beheer/contacten/'), 'onbekend');
    assert.equal(
      toegangVoorBeheerPad({
        pathname: '/beheer/contacten/',
        methode: 'GET',
        ingelogd: true,
        actief: true,
        rechten: vriend,
        viewAsActief: false,
      }),
      'ok',
    );
    assert.equal(
      toegangVoorBeheerPad({
        pathname: '/beheer/contacten/',
        methode: 'POST',
        ingelogd: true,
        actief: true,
        rechten: vriend,
        viewAsActief: false,
      }),
      'alleen_lezen',
    );
    assert.equal(
      toegangVoorBeheerPad({
        pathname: '/beheer/contacten/',
        methode: 'GET',
        ingelogd: true,
        actief: true,
        rechten: hans,
        viewAsActief: false,
      }),
      'verborgen',
    );
    assert.equal(
      toegangVoorBeheerPad({
        pathname: '/beheer/finance/',
        methode: 'POST',
        ingelogd: true,
        actief: true,
        rechten: paul,
        viewAsActief: false,
      }),
      'ok',
    );
    assert.equal(
      toegangVoorBeheerPad({
        pathname: '/beheer/finance/',
        methode: 'POST',
        ingelogd: true,
        actief: true,
        rechten: nelleke,
        viewAsActief: false,
      }),
      'verborgen',
    );
  });
});

describe('financiën uit de betaaltabel', () => {
  test('open, ontvangen, geannuleerd en vlagverschil blijven uit elkaar', () => {
    const beeld = financienBeeld({
      naarBoeking: true,
      financeHref: '/beheer/finance/',
      hrefVoorBoeking: (id) => `/beheer/verhuur/?dossier=${id}`,
      boekingen: [
        { id: 'loopt', status: 'definitief', huurder: 'Jansen', titel: 'Expositie', aanbetalingBinnen: true },
        { id: 'stop', status: 'geannuleerd', huurder: 'De Vries', titel: 'Bruiloft', aanbetalingBinnen: false },
      ],
      betalingen: [
        { id: 'p1', boekingId: 'loopt', soort: 'aanbetaling', bedrag: 100, status: 'ontvangen', vervaldatum: '', ontvangenOp: '2026-10-01' },
        { id: 'p2', boekingId: 'loopt', soort: 'restant', bedrag: 250, status: 'open', vervaldatum: '2026-11-20', ontvangenOp: '' },
        { id: 'p3', boekingId: 'stop', soort: 'restant', bedrag: 80, status: 'open', vervaldatum: '2026-11-01', ontvangenOp: '' },
        { id: 'p4', boekingId: 'loopt', soort: 'restitutie', bedrag: 10, status: 'ontvangen', vervaldatum: '', ontvangenOp: '2026-09-01' },
      ],
    });
    assert.equal(beeld.open.length, 1);
    assert.equal(beeld.open[0]?.titel, 'Jansen');
    assert.match(beeld.open[0]?.toelichting ?? '', /Restbetaling/);
    assert.equal(beeld.totaalOpen, '€\u00a0250,00');
    assert.equal(beeld.ontvangen.length, 2);
    assert.equal(beeld.afwijkingen.some((item) => item.toelichting.includes('Geannuleerde boeking')), true);
    assert.equal(beeld.afwijkingen.some((item) => item.toelichting.includes('oude aanbetalingsvlag')), false);
  });

  test('een vlag die de betaalregel tegenspreekt wordt zichtbaar en niet gecorrigeerd', () => {
    const beeld = financienBeeld({
      naarBoeking: false,
      financeHref: '/beheer/finance/',
      hrefVoorBoeking: () => '/beheer/boekingen/x/',
      boekingen: [{ id: 'b', status: 'definitief', huurder: 'Piet', titel: 'Piet', aanbetalingBinnen: true }],
      betalingen: [
        { id: 'p', boekingId: 'b', soort: 'aanbetaling', bedrag: 50, status: 'open', vervaldatum: '2026-12-01', ontvangenOp: '' },
      ],
    });
    assert.equal(beeld.open.length, 1);
    assert.equal(beeld.afwijkingen.length, 1);
    assert.match(beeld.afwijkingen[0]?.toelichting ?? '', /oude aanbetalingsvlag/);
    assert.equal(beeld.afwijkingen[0]?.href, '/beheer/finance/#b');
  });
});

describe('wat er vandaag moet gebeuren', () => {
  const href = {
    aanvraag: (id: string) => `/beheer/aanvragen/${id}/`,
    boeking: (id: string) => `/beheer/verhuur/?dossier=${id}`,
    activiteit: (id: string) => `/beheer/agenda/${id}/`,
    finance: '/beheer/finance/',
    boekingen: '/beheer/boekingen/',
    systeem: null,
  };

  test('lege content en een geannuleerde boeking worden geen gewone taak', () => {
    const uit = vandaagOverzicht({
      vandaag: '2026-11-10',
      ziet: { aanvragen: true, boekingen: true, agenda: true, finance: true },
      href,
      aanvragen: [{ id: 'a1', naam: 'Nova', start: '2026-12-01', status: 'nieuw' }],
      boekingen: [
        {
          id: 'b1',
          titel: 'Expo',
          huurder: 'Nova',
          start: '2026-11-20',
          eind: '2026-11-22',
          status: 'definitief',
          soort: 'expositie',
          aanbetalingBinnen: false,
        },
        {
          id: 'oud',
          titel: 'Oud',
          huurder: 'Oud',
          start: '2026-11-12',
          eind: '2026-11-14',
          status: 'geannuleerd',
          soort: 'bruiloft',
          aanbetalingBinnen: false,
        },
        {
          id: 'los',
          titel: 'Los',
          huurder: 'Los',
          start: '2027-06-01',
          eind: '2027-06-03',
          status: 'migratie_vastgelegd',
          soort: '',
          aanbetalingBinnen: false,
        },
      ],
      activiteiten: [
        {
          id: 'act-leeg',
          titel: 'Zonder status',
          start: '2026-11-20',
          eind: '2026-11-22',
          contentstatus: null,
        },
        {
          id: 'act-wacht',
          titel: 'Te beoordelen',
          start: '2026-11-20',
          eind: '2026-11-22',
          contentstatus: 'in_beoordeling',
        },
        {
          id: 'act-mist',
          titel: 'Mist info',
          start: '2026-11-20',
          eind: '2026-11-22',
          contentstatus: 'niet_aangeleverd',
        },
      ],
      betalingen: [
        { id: 'open', boekingId: 'b1', soort: 'restant', bedrag: 20, status: 'open', vervaldatum: '2026-11-18', ontvangenOp: '' },
        { id: 'stop', boekingId: 'oud', soort: 'aanbetaling', bedrag: 20, status: 'open', vervaldatum: '2026-11-01', ontvangenOp: '' },
      ],
    });
    assert.equal(uit.aanvragen[0]?.titel, 'Nova');
    assert.equal(uit.binnenkort.some((item) => item.titel === 'Nova'), true);
    assert.equal(uit.binnenkort.some((item) => item.titel === 'Oud'), false);
    assert.equal(uit.opties.some((item) => item.titel === 'Oud'), false);
    assert.equal(uit.beoordelen.some((item) => item.titel === 'Zonder status'), false);
    assert.equal(uit.ontbreekt.some((item) => item.titel === 'Zonder status'), false);
    assert.equal(uit.beoordelen[0]?.titel, 'Te beoordelen');
    assert.match(uit.ontbreekt[0]?.toelichting ?? '', /nog niet aangeleverd/);
    assert.equal(uit.gastheren[0]?.titel, 'Nova');
    assert.equal(uit.betalingen.some((item) => item.titel === 'Oud'), false);
    assert.equal(uit.afwijkingen.some((item) => item.toelichting.includes('Geannuleerde boeking')), true);
    assert.equal(uit.afwijkingen.some((item) => item.titel.includes('zonder verhuurtype')), true);
    assert.equal(vandaagLeeg(uit), false);
  });

  test('wie financiën niet mag zien, ziet geen betaalregel', () => {
    const uit = vandaagOverzicht({
      vandaag: '2026-11-10',
      ziet: { aanvragen: true, boekingen: false, agenda: false, finance: false },
      href,
      aanvragen: [],
      boekingen: [],
      activiteiten: [],
      betalingen: [
        { id: 'open', boekingId: 'b', soort: 'restant', bedrag: 20, status: 'open', vervaldatum: '', ontvangenOp: '' },
      ],
    });
    assert.equal(uit.betalingen.length, 0);
    assert.equal(vandaagLeeg(uit), true);
  });
});
