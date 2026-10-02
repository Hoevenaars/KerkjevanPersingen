import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  blokkeertBeschikbaarheid,
  hoortOpPubliekeAgenda,
  magOpWebsiteZonderTiming,
} from '../src/lib/agenda-zichtbaarheid.ts';
import { kaartTekst, detailTekst } from '../src/lib/activiteit-content.ts';
import { bezetteKalenderDagen } from '../src/lib/datum.ts';
import { annuleerActiviteit, wijzigContentstatus, wijzigPublicatiestatus, zichtbaarEnBezet, type ActiviteitRecord } from '../src/platform/activiteit-mutatie.ts';
import { huidigeBezetteDagen } from '../src/platform/kalender.ts';
import { dedupliceerPlanning, stelPlanning, type PlanningInvoer } from '../src/platform/planning.ts';
import { legeSnapshot, planBridge } from '../src/platform/sanity-bridge.ts';

const basis: ActiviteitRecord = {
  id: '12',
  titel: 'Second Nature',
  soort: 'expositie',
  publicatiestatus: 'publiek',
  contentstatus: 'goedgekeurd',
  levenscyclus: 'actief',
  geannuleerdOp: null,
  geannuleerdDoor: null,
  annuleringsreden: null,
  lokaleOverride: {},
  gepubliceerd: true,
  korteOmschrijving: 'Korte tekst voor de kaart.',
  volledigeOmschrijving: 'De volledige tekst van de expositie.',
  hoofdafbeelding: '/foto/exposities/second-nature.jpg',
};

const agendaBasis = {
  gepubliceerd: true,
  inhoudStatus: 'niet_gestart' as const,
  eind: '2026-10-04',
  trigger: 'zodra_content_compleet',
};

test('A annuleren bewaart de activiteit, haalt haar van de site en uit de bezetting, zonder mail', () => {
  const uit = annuleerActiviteit(basis, { actor: 'Nelleke', reden: 'Exposant zegt af', op: '2026-10-01T12:00:00Z' });
  assert.equal(uit.verwijderd, false);
  assert.equal(uit.record.levenscyclus, 'geannuleerd');
  assert.equal(uit.record.geannuleerdDoor, 'Nelleke');
  assert.equal(uit.record.annuleringsreden, 'Exposant zegt af');
  assert.equal(uit.record.lokaleOverride.annulering, true);
  assert.equal(uit.mail, false);
  assert.equal(uit.workflow, false);
  assert.equal(uit.jobs, 0);
  assert.equal(uit.audit[0]?.van, 'actief');
  assert.equal(uit.audit[0]?.naar, 'geannuleerd');
  const effect = zichtbaarEnBezet(uit.record, true);
  assert.equal(effect.zichtbaar, false);
  assert.equal(effect.blokkeert, false);
  const dagen = bezetteKalenderDagen([{ start: '2026-10-03T09:00:00.000Z', eind: '2026-10-04T16:00:00.000Z', zichtbaarheid: 'publiek', geannuleerd: true }]);
  assert.equal(dagen.has('2026-10-03'), false);
});

test('B geannuleerd staat niet in de standaardplanning en wel onder het filter', () => {
  const item: PlanningInvoer = {
    sleutel: 'a',
    href: '/beheer/agenda/a/',
    start: '2026-10-03',
    eind: '2026-10-04',
    titel: 'Second Nature',
    type: 'expositie',
    status: 'geannuleerd',
    publicatiestatus: 'publiek',
    zichtbaarOpWebsite: false,
    bron: 'activiteit',
    geannuleerd: true,
  };
  assert.equal(stelPlanning([item], { vandaag: '2026-10-01' }).length, 0);
  assert.equal(stelPlanning([item], { vandaag: '2026-10-01', filter: 'geannuleerd' }).length, 1);
});

test('C publiek, goedgekeurd en bereikt moment is zichtbaar', () => {
  assert.equal(magOpWebsiteZonderTiming({
    zichtbaarheid: 'publiek',
    contentstatus: 'goedgekeurd',
    soort: 'expositie',
    titel: 'Second Nature',
    korteOmschrijving: 'Korte tekst voor de kaart.',
    volledigeOmschrijving: 'De volledige tekst van de expositie.',
    hoofdafbeelding: '/foto/exposities/second-nature.jpg',
  }), true);
  assert.equal(hoortOpPubliekeAgenda({
    ...agendaBasis,
    zichtbaarheid: 'publiek',
    contentstatus: 'goedgekeurd',
    soort: 'expositie',
    titel: 'Second Nature',
    korteOmschrijving: 'Korte tekst voor de kaart.',
    volledigeOmschrijving: 'De volledige tekst van de expositie.',
    hoofdafbeelding: '/foto/exposities/second-nature.jpg',
  }, '2026-10-01'), true);
});

test('D publiek met onvolledige content blijft zichtbaar', () => {
  assert.equal(magOpWebsiteZonderTiming({
    zichtbaarheid: 'publiek',
    contentstatus: 'in_beoordeling',
    soort: 'expositie',
    titel: 'Second Nature',
    korteOmschrijving: 'Kort',
    volledigeOmschrijving: 'Lang',
    hoofdafbeelding: '/foto.jpg',
  }), true);
  assert.equal(hoortOpPubliekeAgenda({ ...agendaBasis, zichtbaarheid: 'publiek', contentstatus: 'aanpassing_nodig' }, '2026-10-01'), true);
  assert.equal(magOpWebsiteZonderTiming({ zichtbaarheid: 'publiek', geannuleerd: true }), false);
});

test('E bezet is niet zichtbaar en blokkeert wel', () => {
  assert.equal(magOpWebsiteZonderTiming({ zichtbaarheid: 'bezet', contentstatus: null }), false);
  assert.equal(blokkeertBeschikbaarheid({ zichtbaarheid: 'bezet' }), true);
});

test('F verborgen is niet zichtbaar en blokkeert niet', () => {
  assert.equal(magOpWebsiteZonderTiming({ zichtbaarheid: 'verborgen' }), false);
  assert.equal(blokkeertBeschikbaarheid({ zichtbaarheid: 'verborgen' }), false);
  assert.equal(huidigeBezetteDagen([{ startYmd: '2026-11-07', zichtbaarheid: 'verborgen' }]).size, 0);
});

test('G en H kaart en detail gebruiken losse velden', () => {
  const kaart = kaartTekst({
    korteOmschrijving: 'Kort op de kaart.',
    volledigeOmschrijving: 'Deze lange tekst mag niet de kaart worden.',
    omschrijving: 'Oude omschrijving.',
  });
  assert.equal(kaart.tekst, 'Kort op de kaart.');
  assert.equal(kaart.letterlijk, true);
  assert.equal(detailTekst({
    korteOmschrijving: 'Kort op de kaart.',
    volledigeOmschrijving: 'Volledige tekst\n\nTweede alinea.',
    omschrijving: 'Oude omschrijving.',
  }), 'Volledige tekst\n\nTweede alinea.');
});

test('I planning zet het eerstvolgende bovenaan en houdt meerdaags bij elkaar', () => {
  const items: PlanningInvoer[] = [
    { sleutel: 'later', href: '/b', start: '2026-11-01', eind: '2026-11-02', titel: 'Later', type: 'concert', status: 'definitief', publicatiestatus: 'bezet', zichtbaarOpWebsite: false, bron: 'boeking' },
    { sleutel: 'eerst', href: '/a', start: '2026-10-03', eind: '2026-10-04', titel: 'Eerst', type: 'expositie', status: 'definitief', publicatiestatus: 'publiek', zichtbaarOpWebsite: true, bron: 'boeking' },
  ];
  const lijst = stelPlanning(items, { vandaag: '2026-10-01' });
  assert.equal(lijst[0]?.titel, 'Eerst');
  assert.equal(lijst[1]?.titel, 'Later');
  assert.equal(lijst.filter((item) => item.titel === 'Eerst').length, 1);
});

test('J boeking en activiteit van hetzelfde evenement vallen samen', () => {
  const boeking: PlanningInvoer = {
    sleutel: 'boeking:1', href: '/beheer/boekingen/1/', start: '2026-10-03', eind: '2026-10-04',
    titel: 'Second Nature', type: 'expositie', status: 'definitief', publicatiestatus: 'publiek',
    zichtbaarOpWebsite: true, bron: 'boeking', boekingId: '1',
  };
  const activiteit: PlanningInvoer = {
    sleutel: 'activiteit:9', href: '/beheer/agenda/1/', start: '2026-10-03', eind: '2026-10-04',
    titel: 'Second Nature', type: 'expositie', status: 'online', publicatiestatus: 'publiek',
    zichtbaarOpWebsite: true, bron: 'activiteit', boekingId: '1',
  };
  const lijst = dedupliceerPlanning([activiteit, boeking]);
  assert.equal(lijst.length, 1);
  assert.equal(lijst[0]?.bron, 'boeking');
});

test('A gemigreerde boeking blijft zichtbaar en een activiteit op andere dagen ook', () => {
  const boeking: PlanningInvoer = {
    sleutel: 'boeking:40', href: '/beheer/boekingen/40/', start: '2026-10-03', eind: '2026-10-04',
    titel: 'Oktober 3/4', type: '', status: 'migratie_vastgelegd', publicatiestatus: null,
    zichtbaarOpWebsite: false, huurder: 'Monika Loster', bron: 'boeking', boekingId: '40',
  };
  const concert: PlanningInvoer = {
    sleutel: 'sanity:9', href: '/beheer/agenda/bron:9/', start: '2026-12-11', eind: '2026-12-11',
    titel: 'Concert: Lian van den Berg', type: 'concert', status: 'concept', publicatiestatus: 'verborgen',
    zichtbaarOpWebsite: false, bron: 'sanity',
  };
  const zelfdeDag: PlanningInvoer = {
    sleutel: 'activiteit:3', href: '/beheer/agenda/3/', start: '2028-02-19', eind: '2028-02-20',
    titel: 'Expositie Isabelle Hartman', type: 'expositie', status: 'mist_content', publicatiestatus: 'publiek',
    zichtbaarOpWebsite: false, bron: 'activiteit', legacyId: 'EL8',
  };
  const slot: PlanningInvoer = {
    sleutel: 'boeking:98', href: '/beheer/boekingen/98/', start: '2028-02-19', eind: '2028-02-20',
    titel: 'Februari 19/20', type: '', status: 'migratie_vastgelegd', publicatiestatus: null,
    zichtbaarOpWebsite: false, huurder: 'Ingrid Vissers', bron: 'boeking', boekingId: '98',
  };
  const winter: PlanningInvoer = {
    sleutel: 'intern:1', href: '/beheer/agenda/1/', start: '2026-12-19', eind: '2026-12-20',
    titel: 'Winterstop', type: 'intern', status: 'bezet', publicatiestatus: 'verborgen',
    zichtbaarOpWebsite: false, bron: 'intern',
  };
  const lijst = stelPlanning([boeking, concert, zelfdeDag, slot, winter], { vandaag: '2026-10-01' });
  assert.deepEqual(lijst.map((item) => item.titel), [
    'Oktober 3/4',
    'Concert: Lian van den Berg',
    'Winterstop',
    'Expositie Isabelle Hartman',
  ]);
  assert.equal(lijst[3]?.huurder, 'Ingrid Vissers');
  assert.equal(lijst[3]?.publicatiestatus, 'publiek');
  assert.equal(lijst[3]?.type, 'expositie');
  assert.equal(stelPlanning([boeking], { vandaag: '2026-10-01', filter: 'definitief' }).length, 1);
  const verborgen: PlanningInvoer = {
    sleutel: 'sanity:17', href: '/beheer/agenda/bron:17/', start: '2026-11-07', eind: '2026-11-08',
    titel: 'expositie Evelien Bannenberg', type: 'expositie', status: 'concept', publicatiestatus: 'verborgen',
    zichtbaarOpWebsite: false, bron: 'sanity',
  };
  const nov: PlanningInvoer = {
    ...boeking,
    sleutel: 'boeking:48',
    start: '2026-11-07',
    eind: '2026-11-08',
    titel: 'November 7/8',
    huurder: 'Jan Rensen',
  };
  const samen = dedupliceerPlanning([verborgen, nov]);
  assert.equal(samen.length, 1);
  assert.equal(samen[0]?.titel, 'November 7/8');
  assert.match(samen[0]?.aandacht ?? '', /Evelien Bannenberg/);
});

test('K een lokale annulering wordt door de bridge niet opnieuw actief', () => {
  const plan = planBridge('update', {
    _id: 'sanity-1',
    _type: 'activiteit',
    start: '2026-10-03T09:00:00.000Z',
    eind: '2026-10-04T16:00:00.000Z',
    zichtbaarheid: 'publiek',
    publiekeTitel: 'Second Nature',
    interneTitel: 'Second Nature',
  }, {
    ...legeSnapshot(),
    heeftPubliek: true,
    heeftBron: true,
    hash: 'oud',
    lokaleOverride: { ...legeSnapshot().lokaleOverride, geannuleerd: true },
  });
  assert.equal(plan.mail, false);
  assert.equal(plan.workflow, false);
  assert.equal(plan.status, 'review');
  const publiek = plan.stappen.find((stap) => stap.soort === 'publiek');
  assert.equal(publiek?.velden.zichtbaarheid, undefined);
  assert.equal(publiek?.velden.gepubliceerd, false);
  assert.equal(publiek?.velden.levenscyclus, 'geannuleerd');
  assert.equal(plan.stappen.some((stap) => stap.soort === 'conflict' && stap.velden.veld === 'annulering'), true);
});

test('L een lokale publicatiestatus wordt niet stil overschreven', () => {
  const plan = planBridge('update', {
    _id: 'sanity-2',
    _type: 'activiteit',
    start: '2026-11-07T09:00:00.000Z',
    eind: '2026-11-08T16:00:00.000Z',
    zichtbaarheid: 'publiek',
    publiekeTitel: 'Titel',
    interneTitel: 'Titel',
  }, {
    ...legeSnapshot(),
    heeftPubliek: true,
    heeftBron: true,
    hash: 'oud',
    lokaleOverride: { ...legeSnapshot().lokaleOverride, publicatiestatus: 'verborgen' },
  });
  const publiek = plan.stappen.find((stap) => stap.soort === 'publiek');
  assert.equal(publiek?.velden.zichtbaarheid, undefined);
  const conflict = plan.stappen.find((stap) => stap.soort === 'conflict' && stap.velden.veld === 'publicatiestatus');
  assert.equal(conflict?.velden.lokaal, 'verborgen');
  assert.equal(conflict?.velden.inkomend, 'publiek');
  assert.equal(plan.mail, false);
});

test('M en N bestaande publieke en bezette regels blijven gelijk zonder expliciete contentstatus', () => {
  assert.equal(hoortOpPubliekeAgenda({ ...agendaBasis, zichtbaarheid: 'publiek', gepubliceerd: false }, '2026-10-01'), true);
  assert.equal(hoortOpPubliekeAgenda({ ...agendaBasis, zichtbaarheid: 'bezet' }, '2026-10-01'), false);
  assert.equal(hoortOpPubliekeAgenda({ ...agendaBasis, zichtbaarheid: 'verborgen' }, '2026-10-01'), false);
  for (const zichtbaarheid of ['publiek', 'bezet', 'verborgen'] as const) {
    const oud = huidigeBezetteDagen([{ startYmd: '2026-11-07', eindYmd: '2026-11-08', zichtbaarheid }]);
    assert.equal(blokkeertBeschikbaarheid({ zichtbaarheid }), oud.has('2026-11-07'));
  }
  assert.equal(magOpWebsiteZonderTiming({ zichtbaarheid: 'publiek', contentstatus: null, soort: 'expositie', titel: 'Leon' }), true);
});

test('O publicatie- en contentwijziging auditen en starten geen mail', () => {
  const publicatie = wijzigPublicatiestatus(basis, { status: 'bezet', actor: 'Paul', op: '2026-10-01T12:00:00Z' });
  assert.equal(publicatie.audit[0]?.van, 'publiek');
  assert.equal(publicatie.audit[0]?.naar, 'bezet');
  assert.equal(publicatie.record.lokaleOverride.publicatiestatus, 'bezet');
  assert.equal(publicatie.mail, false);
  assert.equal(publicatie.jobs, 0);
  const content = wijzigContentstatus(basis, { status: 'aanpassing_nodig', actor: 'Paul', op: '2026-10-01T12:00:00Z' });
  assert.equal(content.audit[0]?.van, 'goedgekeurd');
  assert.equal(content.audit[0]?.naar, 'aanpassing_nodig');
  assert.equal(content.workflow, false);
  const sql = readFileSync(new URL('../supabase/migrations/20261001180000_activiteit_beheer.sql', import.meta.url), 'utf8');
  assert.equal(sql.includes('insert into public.communicatie_jobs'), false);
  assert.equal(sql.includes('activiteitbeheer mag geen communicatiejob maken'), true);
  const lezen = readFileSync(new URL('../supabase/migrations/20261001190000_activiteit_bron_lezen.sql', import.meta.url), 'utf8');
  assert.match(lezen, /grant select on table public\.activiteit_bron to authenticated/);
  assert.equal(lezen.includes('to anon'), false);
});

test('planningpagina declareert vandaag voordat de lijst die gebruikt', () => {
  const bron = readFileSync(new URL('../src/pages/beheer/planning/index.astro', import.meta.url), 'utf8');
  const frontmatter = bron.slice(bron.indexOf('---') + 3, bron.indexOf('\n---', 3));
  const declaratie = frontmatter.indexOf('const vandaag');
  assert.equal(frontmatter.indexOf('vandaag'), declaratie + 'const '.length);
  assert.ok(declaratie < frontmatter.indexOf('b.eind >= vandaag'));
});
