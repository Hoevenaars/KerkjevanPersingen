import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { datumBlok, periodeKort, startscherm, vriendenmailStand, type StartInvoer } from '../src/platform/dashboard-start.ts';

const href: StartInvoer['href'] = {
  nieuw: '/beheer/aanvragen/?fase=nieuw',
  behandeling: '/beheer/aanvragen/?fase=in_behandeling',
  aanvraag: (id) => `/beheer/aanvragen/${id}/`,
  boeking: (id) => `/beheer/boekingen/${id}/`,
  activiteit: (id) => `/beheer/agenda/${id}/`,
  planning: (naam, start) => `/beheer/planning/?jaar=${start.slice(0, 4)}&maand=${Number(start.slice(5, 7))}&q=${encodeURIComponent(naam)}`,
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

test('een meerdaagse activiteit is één agendaregel met een datumblok', () => {
  assert.equal(periodeKort('2026-11-21', '2026-11-22', '2026-11-16'), 'za 21 – zo 22 nov');
  assert.deepEqual(datumBlok('2026-11-21T14:00:00', '2026-11-22T17:00:00'), {
    week: 'za – zo',
    dagen: '21 – 22',
    maand: 'nov',
  });
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
  assert.equal(scherm.agenda.length, 1);
  assert.equal(scherm.agenda[0]?.tijd, '14:00–17:00');
  assert.equal(scherm.agenda[0]?.soort, 'Expositie');
  assert.equal(scherm.agenda[0]?.zonderBegeleider, true);
  assert.equal(scherm.agenda[0]?.href, '/beheer/boekingen/expo/');
});

test('opties en geannuleerde boekingen staan niet in de agenda', () => {
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
        id: 'stop',
        titel: 'Afgezegd',
        huurder: 'Lot',
        start: '2026-11-19',
        eind: '2026-11-19',
        status: 'geannuleerd',
        soort: 'concert',
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
  assert.deepEqual(scherm.agenda.map((item) => item.naam), ['Vast']);
  assert.equal(scherm.tellers[1]?.label, 'In behandeling');
  assert.equal(JSON.stringify(scherm).includes('Piet'), false);
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
  assert.deepEqual(scherm.agenda[0]?.begeleiders.map((item) => item.naam), ['Betty Vos', 'Henk Vos']);
  assert.match(scherm.agenda[0]?.begeleiders[0]?.href ?? '', /q=Betty%20Vos/);
  assert.equal(scherm.agenda[0]?.zonderBegeleider, false);
});

test('een boeking zonder koppeling en een interne activiteit blijven uit elkaar', () => {
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
      id: 'schoon',
      titel: 'Grote schoonmaak',
      start: '2026-11-19',
      eind: '2026-11-19',
      blokkeert: false,
    }],
  }));
  assert.equal(scherm.agenda[0]?.naam, 'Grote schoonmaak');
  assert.equal(scherm.agenda[0]?.soort, 'Intern');
  const handmatig = startscherm(invoer({
    intern: [{
      id: 'schoon-2',
      titel: 'Interne activiteit — Grote schoonmaak',
      start: '2026-11-19',
      eind: '2026-11-19',
      blokkeert: true,
    }],
  }));
  assert.equal(handmatig.agenda[0]?.naam, 'Grote schoonmaak');
  assert.equal(handmatig.agenda[0]?.soort, 'Intern');
  assert.equal(handmatig.agenda[0]?.zonderBegeleider, false);
  assert.equal(scherm.agenda[0]?.zonderBegeleider, false);
  assert.equal(scherm.agenda[0]?.href, '/beheer/agenda/schoon/');
  assert.equal(scherm.agenda[1]?.zonderBegeleider, true);
  assert.equal(scherm.agenda.length, 2);
});

test('de agenda toont elke activiteit in de veertien dagen', () => {
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
  assert.equal(scherm.agenda.length, 6);
  assert.equal(scherm.agenda[0]?.naam, 'Activiteit 0');
  assert.equal(scherm.agenda[5]?.naam, 'Activiteit 5');
});

test('nieuw en in behandeling volgen de aanvraagfase, met de echte vervolgstap', () => {
  const scherm = startscherm(invoer({
    aanvragen: [
      { id: 'oud', naam: 'Marieke', start: '2026-12-01', eind: '2026-12-02', status: 'nieuw', soort: 'concert', binnengekomen: '2026-09-01' },
      { id: 'vers', naam: 'Jona', start: '2026-12-03', eind: '2026-12-03', status: 'nieuw', soort: 'expositie', binnengekomen: '2026-11-10' },
      { id: 'los', naam: 'Hendriks', start: '2026-11-20', eind: '2026-11-20', status: 'in_behandeling', soort: 'bruiloft', binnengekomen: '2026-08-01' },
      { id: 'ada', naam: 'Ada', start: '2027-05-15', eind: '2027-05-16', status: 'goedgekeurd', soort: 'expositie', boekingId: 'b-ada', binnengekomen: '2026-11-01' },
      { id: 'klaar', naam: 'Kim', start: '2026-09-09', eind: '2026-09-09', status: 'goedgekeurd', boekingId: 'b-kim', binnengekomen: '2026-08-01' },
    ],
    boekingen: [
      { id: 'b-ada', titel: 'Ada', huurder: 'Ada', start: '2027-05-15', eind: '2027-05-16', status: 'optie', soort: 'expositie', aanvraagId: 'ada' },
      { id: 'b-kim', titel: 'Kim', huurder: 'Kim', start: '2026-09-09', eind: '2026-09-09', status: 'definitief', soort: 'bruiloft', aanvraagId: 'klaar', aanbetalingBinnen: true },
    ],
    documenten: [{ boekingId: 'b-kim', soort: 'Contract', naam: 'getekend-kim.pdf' }],
    faseBetalingen: [{ boekingId: 'b-ada', soort: 'restant', status: 'open' }],
  }));
  assert.equal(scherm.tellers[0]?.aantal, 3);
  assert.equal(scherm.tellers[0]?.href, '/beheer/aanvragen/?fase=nieuw');
  assert.deepEqual(scherm.nieuw.rijen.map((rij) => rij.naam), ['Jona', 'Marieke', 'Hendriks']);
  assert.equal(scherm.nieuw.rijen[0]?.soort, 'Expositie');
  assert.equal(scherm.nieuw.rijen[0]?.wanneer, '3 dec 2026');
  assert.equal(scherm.tellers[1]?.aantal, 1);
  assert.equal(scherm.behandeling.rijen[0]?.naam, 'Ada');
  assert.equal(scherm.behandeling.rijen[0]?.stap, 'Contract verzenden');
  assert.equal(scherm.behandeling.href, '/beheer/aanvragen/?fase=in_behandeling');
  assert.equal(JSON.stringify(scherm).includes('restant'), false);
  assert.equal(JSON.stringify(scherm).includes('Kim'), false);
});

test('van elke aanvraaggroep zijn hooguit vijf rijen zichtbaar', () => {
  const aanvragen = Array.from({ length: 6 }, (_, index) => ({
    id: `a${index}`,
    naam: `Aanvraag ${index}`,
    start: '2026-12-01',
    eind: '2026-12-01',
    status: 'nieuw',
    binnengekomen: `2026-11-${String(10 - index).padStart(2, '0')}`,
  }));
  const scherm = startscherm(invoer({ aanvragen }));
  assert.equal(scherm.nieuw.totaal, 6);
  assert.equal(scherm.nieuw.rijen.length, 5);
  assert.equal(scherm.nieuw.rijen[0]?.naam, 'Aanvraag 0');
});

test('wie aanvragen niet mag zien, ziet geen lijst en geen huur zonder boekingsrecht', () => {
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
  assert.equal(scherm.nieuw.rijen.length, 0);
  assert.deepEqual(scherm.agenda.map((item) => item.naam), ['Sluiting']);
  assert.equal(scherm.agenda[0]?.soort, 'Blokkade');
});

test('vriendenmail is gereed als de brief van deze week ontbreekt of is goedgekeurd', () => {
  assert.equal(vriendenmailStand([], '2026-11-16'), 'Gereed');
  assert.equal(vriendenmailStand([
    { id: 'oud', week: '2026-09-21', verstuurd: false, overgeslagen: false, goedgekeurd: false },
  ], '2026-11-16'), 'Gereed');
  assert.equal(vriendenmailStand([
    { id: 'nu', week: '2026-11-16', verstuurd: false, overgeslagen: false, goedgekeurd: true },
  ], '2026-11-16'), 'Gereed');
  assert.equal(vriendenmailStand([
    { id: 'nu', week: '2026-11-16', verstuurd: false, overgeslagen: false, goedgekeurd: false },
  ], '2026-11-16'), 'Te controleren');
  const scherm = startscherm(invoer({
    nieuwsbrieven: [{ id: 'nu', week: '2026-11-16', verstuurd: false, overgeslagen: false, goedgekeurd: true }],
    href: { ...href, nieuwsbrief: '/beheer/nieuwsbrief/' },
  }));
  assert.equal(scherm.tellers[2]?.label, 'Vrienden mail');
  assert.equal(scherm.tellers[2]?.waarde, 'Gereed');
  assert.equal(scherm.tellers[2]?.href, '/beheer/nieuwsbrief/');
  const zonder = startscherm(invoer({
    ziet: { aanvragen: true, boekingen: true, agenda: true, planning: true, nieuwsbrief: false },
    nieuwsbrieven: [{ id: 'nu', week: '2026-11-16', verstuurd: false, overgeslagen: false, goedgekeurd: false }],
  }));
  assert.equal(zonder.tellers[2]?.href, null);
  assert.equal(zonder.tellers[2]?.waarde, '—');
});

test('het dashboard toont geen betalingsblokken', () => {
  const pagina = readFileSync(new URL('../src/pages/beheer/index.astro', import.meta.url), 'utf8');
  const scherm = readFileSync(new URL('../src/components/beheer/Startscherm.astro', import.meta.url), 'utf8');
  assert.equal(pagina.includes('Openstaande betalingen'), false);
  assert.equal(pagina.includes('financi'), false);
  assert.equal(scherm.includes('betaling'), false);
  assert.equal(scherm.includes('Opties'), false);
});
