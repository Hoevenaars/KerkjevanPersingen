import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { periodeKort, startscherm, type StartInvoer } from '../src/platform/dashboard-start.ts';

const href: StartInvoer['href'] = {
  aanvragen: '/beheer/aanvragen/',
  opties: '/beheer/boekingen/?status=optie',
  aanvraag: (id) => `/beheer/aanvragen/${id}/`,
  boeking: (id) => `/beheer/boekingen/${id}/`,
  activiteit: (id) => `/beheer/agenda/${id}/`,
  planning: (naam, start) => `/beheer/planning/?jaar=${start.slice(0, 4)}&maand=${Number(start.slice(5, 7))}&q=${encodeURIComponent(naam)}`,
  planningZonder: (start) => `/beheer/planning/?begeleider=nee&jaar=${start.slice(0, 4)}&maand=${Number(start.slice(5, 7))}`,
};

function invoer(extra: Partial<StartInvoer> = {}): StartInvoer {
  return {
    vandaag: '2026-11-16',
    aanvragen: [],
    boekingen: [],
    activiteiten: [],
    intern: [],
    documenten: [],
    mails: [],
    faseBetalingen: [],
    toewijzingen: [],
    gastheren: [],
    ziet: { aanvragen: true, boekingen: true, agenda: true, planning: true },
    href,
    ...extra,
  };
}

test('periode toont een meerdaagse activiteit één keer, met tijdstip als dat bekend is', () => {
  assert.equal(periodeKort('2026-11-21', '2026-11-22', '2026-11-16'), 'za 21 – zo 22 nov');
  assert.equal(periodeKort('2026-11-21T14:00:00', '2026-11-21T14:00:00', '2026-11-16'), 'za 21 nov');
  const scherm = startscherm(invoer({
    boekingen: [{
      id: 'expo',
      titel: 'Week in het kerkje',
      huurder: 'Sanne Bakker',
      start: '2026-11-21T14:00:00',
      eind: '2026-11-22T17:00:00',
      status: 'definitief',
      soort: 'expositie',
    }],
  }));
  assert.equal(scherm.agendaTotaal, 1);
  assert.equal(scherm.tellers[2]?.aantal, 1);
  assert.equal(scherm.agenda[0]?.wanneer, 'za 21 – zo 22 nov');
  assert.equal(scherm.agenda[0]?.tijd, '14:00–17:00');
  assert.equal(scherm.agenda[0]?.soort, 'Expositie');
  assert.equal(scherm.agenda[0]?.zonderBegeleider, true);
});

test('opties tellen mee, maar staan niet als boeking in de agenda', () => {
  const scherm = startscherm(invoer({
    boekingen: [
      {
        id: 'nu',
        titel: 'Optie nu',
        huurder: 'Piet',
        start: '2026-11-20',
        eind: '2026-11-21',
        status: 'optie',
        soort: 'concert',
        optieEind: '2026-11-25',
      },
      {
        id: 'later',
        titel: 'Optie later',
        huurder: 'Kees',
        start: '2027-03-01',
        eind: '2027-03-02',
        status: 'optie',
        soort: 'concert',
      },
      {
        id: 'weg',
        titel: 'Verlopen',
        huurder: 'Oud',
        start: '2026-08-01',
        eind: '2026-08-02',
        status: 'optie_verlopen',
        soort: 'concert',
        optieEind: '2026-07-01',
      },
      {
        id: 'vast',
        titel: 'Vast',
        huurder: 'Anna',
        start: '2026-11-18',
        eind: '2026-11-18',
        status: 'definitief',
        soort: 'viering',
      },
    ],
  }));
  assert.equal(scherm.tellers[1]?.aantal, 2);
  assert.equal(scherm.tellers[1]?.href, '/beheer/boekingen/?status=optie');
  assert.equal(scherm.agenda.some((item) => item.naam === 'Optie nu'), false);
  assert.equal(scherm.agenda.some((item) => item.naam === 'Vast'), true);
  const actie = scherm.acties.find((item) => item.id === 'opties');
  assert.equal(actie?.aantal, 1);
  assert.match(actie?.toelichting ?? '', /Piet/);
  assert.equal(actie?.href, '/beheer/boekingen/nu/');
});

test('gastbegeleiders komen uit de planning en blijven allemaal zichtbaar', () => {
  const scherm = startscherm(invoer({
    gastheren: [
      { id: 'g-1', naam: 'Henk Vos' },
      { id: 'g-2', naam: 'Betty Vos' },
    ],
    toewijzingen: [
      { boekingId: 'expo', relatieId: 'g-2', relatieNaam: 'Betty Vos' },
      { boekingId: 'expo', relatieId: 'g-1', relatieNaam: 'Henk Vos' },
      { boekingId: 'expo', relatieId: 'g-1', relatieNaam: 'Henk Vos' },
    ],
    boekingen: [{
      id: 'expo',
      titel: 'Keramiek',
      huurder: 'Sanne',
      start: '2026-11-20',
      eind: '2026-11-22',
      status: 'definitief',
      soort: 'expositie',
      gastheerId: 'g-1',
    }],
  }));
  assert.equal(scherm.agenda.length, 1);
  assert.deepEqual(scherm.agenda[0]?.begeleiders.map((item) => item.naam), ['Betty Vos', 'Henk Vos']);
  assert.match(scherm.agenda[0]?.begeleiders[0]?.href ?? '', /q=Betty%20Vos/);
  assert.match(scherm.agenda[0]?.begeleiders[0]?.href ?? '', /maand=11/);
  assert.equal(scherm.agenda[0]?.zonderBegeleider, false);
  assert.equal(scherm.acties.some((item) => item.id === 'gastbegeleiders'), false);
});

test('een boeking zonder koppeling meldt dat er geen gastbegeleider is', () => {
  const scherm = startscherm(invoer({
    boekingen: [{
      id: 'expo',
      titel: 'Keramiek',
      huurder: 'Sanne',
      start: '2026-11-20',
      eind: '2026-11-20',
      status: 'definitief',
      soort: 'expositie',
    }],
    intern: [{
      id: 'bestuur',
      titel: 'Bestuursbijeenkomst',
      start: '2026-11-19',
      eind: '2026-11-19',
      blokkeert: false,
    }],
  }));
  assert.equal(scherm.agenda[0]?.naam, 'Bestuursbijeenkomst');
  assert.equal(scherm.agenda[0]?.zonderBegeleider, false);
  assert.equal(scherm.agenda[0]?.soort, 'Intern');
  assert.equal(scherm.agenda[1]?.zonderBegeleider, true);
  const actie = scherm.acties.find((item) => item.id === 'gastbegeleiders');
  assert.match(actie?.href ?? '', /begeleider=nee/);
  assert.equal(scherm.agendaTotaal, 2);
});

test('de agenda toont vijf activiteiten en bewaart de rest', () => {
  const boekingen = Array.from({ length: 6 }, (_, index) => ({
    id: `b${index}`,
    titel: `Activiteit ${index}`,
    huurder: `Huurder ${index}`,
    start: `2026-11-${String(17 + index).padStart(2, '0')}`,
    eind: `2026-11-${String(17 + index).padStart(2, '0')}`,
    status: 'definitief',
    soort: 'concert',
    gastheerId: 'g',
  }));
  const scherm = startscherm(invoer({
    gastheren: [{ id: 'g', naam: 'Henk' }],
    boekingen,
  }));
  assert.equal(scherm.agenda.length, 5);
  assert.equal(scherm.agendaExtra.length, 1);
  assert.equal(scherm.agendaTotaal, 6);
  assert.equal(scherm.agenda[0]?.naam, 'Activiteit 0');
  assert.equal(scherm.agendaExtra[0]?.naam, 'Activiteit 5');
});

test('acties bundelen aanvragen, contracten en ontbrekende exposanteninformatie', () => {
  const scherm = startscherm(invoer({
    aanvragen: [
      { id: 'a1', naam: 'Nova', start: '2026-12-01', eind: '2026-12-02', status: 'nieuw' },
      { id: 'a2', naam: 'Ada', start: '2026-12-04', eind: '2026-12-05', status: 'goedgekeurd', boekingId: 'b-ada' },
    ],
    boekingen: [
      {
        id: 'b-ada',
        titel: 'Ada',
        huurder: 'Ada',
        start: '2026-12-04',
        eind: '2026-12-05',
        status: 'optie',
        soort: 'expositie',
        aanvraagId: 'a2',
      },
      {
        id: 'b-expo',
        titel: 'Keramiek',
        huurder: 'Sanne',
        start: '2026-11-28',
        eind: '2026-11-29',
        status: 'definitief',
        soort: 'expositie',
        gastheerId: 'g',
      },
    ],
    activiteiten: [{
      id: 'act-expo',
      boekingId: 'b-expo',
      titel: 'Keramiek',
      start: '2026-11-28',
      eind: '2026-11-29',
      contentstatus: 'niet_aangeleverd',
      soort: 'expositie',
    }],
    gastheren: [{ id: 'g', naam: 'Henk' }],
    faseBetalingen: [
      { boekingId: 'b-expo', soort: 'restant', status: 'open' },
    ],
    documenten: [],
  }));
  assert.equal(scherm.tellers[0]?.aantal, 2);
  assert.equal(scherm.acties[0]?.id, 'aanvragen');
  assert.equal(scherm.acties[0]?.href, '/beheer/aanvragen/');
  assert.equal(scherm.acties.some((item) => item.id === 'contracten'), true);
  assert.match(scherm.acties.find((item) => item.id === 'contracten')?.toelichting ?? '', /niet verstuurd/);
  assert.match(scherm.acties.find((item) => item.id === 'exposanten')?.toelichting ?? '', /Sanne/);
  assert.equal(JSON.stringify(scherm).includes('betaling'), false);
  assert.equal(JSON.stringify(scherm).includes('restant'), false);
  assert.equal(scherm.acties.length <= 5, true);
});

test('een optie zonder einddatum en een lege contentstatus vragen geen actie', () => {
  const scherm = startscherm(invoer({
    boekingen: [{
      id: 'open',
      titel: 'Open optie',
      huurder: 'Lot',
      start: '2026-11-20',
      eind: '2026-11-21',
      status: 'optie',
      soort: 'expositie',
    }],
    activiteiten: [{
      id: 'leeg',
      boekingId: 'open',
      titel: 'Open optie',
      start: '2026-11-20',
      eind: '2026-11-21',
      contentstatus: null,
    }],
  }));
  assert.equal(scherm.tellers[1]?.aantal, 1);
  assert.equal(scherm.acties.some((item) => item.id === 'opties'), false);
  assert.equal(scherm.acties.some((item) => item.id === 'exposanten'), false);
  assert.equal(scherm.agendaTotaal, 0);
});

test('wie boekingen niet mag zien, ziet geen opties en geen huur in de agenda', () => {
  const scherm = startscherm(invoer({
    ziet: { aanvragen: false, boekingen: false, agenda: true, planning: false },
    aanvragen: [{ id: 'a', naam: 'Nova', start: '2026-12-01', eind: '2026-12-01', status: 'nieuw' }],
    boekingen: [{
      id: 'b',
      titel: 'Expo',
      huurder: 'Nova',
      start: '2026-11-20',
      eind: '2026-11-20',
      status: 'definitief',
      soort: 'expositie',
    }],
    intern: [{ id: 'i', titel: 'Sluiting', start: '2026-11-18', eind: '2026-11-18', blokkeert: true }],
  }));
  assert.equal(scherm.tellers[0]?.aantal, 0);
  assert.equal(scherm.tellers[0]?.href, null);
  assert.equal(scherm.tellers[1]?.aantal, 0);
  assert.deepEqual(scherm.agenda.map((item) => item.naam), ['Sluiting']);
  assert.equal(scherm.agenda[0]?.soort, 'Blokkade');
});

test('het dashboard toont geen betalingsblokken', () => {
  const pagina = readFileSync(new URL('../src/pages/beheer/index.astro', import.meta.url), 'utf8');
  const scherm = readFileSync(new URL('../src/components/beheer/Startscherm.astro', import.meta.url), 'utf8');
  assert.equal(pagina.includes('Openstaande betalingen'), false);
  assert.equal(pagina.includes('financi'), false);
  assert.equal(scherm.includes('betaling'), false);
  assert.equal(scherm.includes('Afwijkingen'), false);
});
