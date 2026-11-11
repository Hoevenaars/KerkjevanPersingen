import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AGENDA_VOORUIT_DAGEN, binnenAgendaHorizon, nuZichtbaarOpWebsite } from '../src/lib/agenda-zichtbaarheid.ts';
import { activiteitUitSlugRijen, stelPubliekeAgenda, type AgendaRij } from '../src/lib/publiek-lezen.ts';
import { voegDagenToe } from '../src/platform/datum.ts';

const VANDAAG = '2026-11-11';
const NU = new Date('2026-11-11T12:00:00Z');

function rij(input: Partial<AgendaRij> & Pick<AgendaRij, 'id' | 'titel' | 'start_datum' | 'eind_datum'>): AgendaRij {
  return {
    slug: input.slug ?? null,
    omschrijving: input.omschrijving ?? null,
    foto_pad: null,
    foto_alt: null,
    publicatie_trigger: input.publicatie_trigger ?? 'direct',
    zichtbaarheid: input.zichtbaarheid ?? 'publiek',
    inhoud_status: 'niet_vereist',
    soort: input.soort ?? 'expositie',
    ...input,
  };
}

test('de agenda kijkt hooguit 8 weken vooruit, inclusief de grensdag', () => {
  assert.equal(AGENDA_VOORUIT_DAGEN, 56);
  const grens = voegDagenToe(VANDAAG, AGENDA_VOORUIT_DAGEN);
  assert.equal(grens, '2027-01-06');
  assert.equal(binnenAgendaHorizon(grens, VANDAAG), true);
  assert.equal(binnenAgendaHorizon('2027-01-07', VANDAAG), false);
  assert.equal(binnenAgendaHorizon('2026-11-01', VANDAAG), true);
  assert.equal(binnenAgendaHorizon('geen-datum', VANDAAG), false);
});

test('bezet in juli 2027 en de winterstops van latere jaren staan nog niet op de agenda', () => {
  const rijen: AgendaRij[] = [
    rij({
      id: 1,
      titel: 'Bezet',
      start_datum: '2027-07-03',
      eind_datum: '2027-07-04',
      omschrijving: 'Dit weekend is bezet.',
      soort: 'blokkade',
    }),
    rij({
      id: 2,
      titel: 'Winterstop',
      slug: 'winterstop-2027',
      start_datum: '2027-12-18',
      eind_datum: '2028-02-13',
      omschrijving: 'In deze periode krijgt het kerkje de rust en aandacht die nodig zijn voor onderhoud en behoud.',
      soort: 'intern',
    }),
    rij({
      id: 3,
      titel: 'Winterstop',
      slug: 'winterstop-2028',
      start_datum: '2028-12-23',
      eind_datum: '2029-02-18',
      soort: 'intern',
    }),
    rij({
      id: 4,
      titel: 'Winterstop',
      slug: 'winterstop-2029',
      start_datum: '2029-12-15',
      eind_datum: '2029-12-30',
      soort: 'intern',
    }),
    rij({
      id: 5,
      titel: 'Winterstop',
      slug: 'winterstop-2026',
      start_datum: '2026-12-19',
      eind_datum: '2027-02-14',
      soort: 'intern',
    }),
  ];

  const lijst = stelPubliekeAgenda(rijen, NU, 80);
  assert.deepEqual(lijst.map((item) => item.slug), ['winterstop-2026']);
  assert.equal(activiteitUitSlugRijen('winterstop-2027', rijen, NU), null);
  assert.equal(activiteitUitSlugRijen('winterstop-2028', rijen, NU), null);
  assert.equal(activiteitUitSlugRijen('winterstop-2029', rijen, NU), null);
});

test('een lopende winterstop blijft zichtbaar, een afgelopen niet', () => {
  const lopend = rij({
    id: 1,
    titel: 'Winterstop',
    slug: 'winterstop-2026',
    start_datum: '2026-12-19',
    eind_datum: '2027-02-14',
    soort: 'intern',
  });
  const tijdens = new Date('2027-01-15T12:00:00Z');
  assert.equal(stelPubliekeAgenda([lopend], tijdens).length, 1);
  const voorbij = new Date('2027-02-15T12:00:00Z');
  assert.equal(stelPubliekeAgenda([lopend], voorbij).length, 0);
});

test('een kortere publicatietiming blijft strenger dan de 8 weken', () => {
  assert.equal(nuZichtbaarOpWebsite({
    zichtbaarheid: 'publiek',
    start: '2027-01-06',
    eind: '2027-01-07',
    trigger: 'uiterlijk_1_maand',
    vandaag: VANDAAG,
    viaPubliekeAgenda: true,
    nu: NU,
  }), false);
  assert.equal(nuZichtbaarOpWebsite({
    zichtbaarheid: 'publiek',
    start: '2026-12-05',
    eind: '2026-12-06',
    trigger: 'direct',
    vandaag: VANDAAG,
    viaPubliekeAgenda: true,
    nu: NU,
  }), true);
});
