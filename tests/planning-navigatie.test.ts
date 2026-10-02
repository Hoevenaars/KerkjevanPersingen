import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  gastbegeleidersPerBoeking,
  leesPlanningSelectie,
  metJaar,
  metPeriode,
  metTerug,
  planningHref,
  stelPlanning,
  terugLink,
  type PlanningInvoer,
} from '../src/platform/planning.ts';

const vandaag = '2026-10-02';

function item(over: Partial<PlanningInvoer> & Pick<PlanningInvoer, 'sleutel' | 'start' | 'eind' | 'titel'>): PlanningInvoer {
  return {
    href: '/beheer/planning/',
    type: 'expositie',
    status: 'definitief',
    publicatiestatus: 'publiek',
    zichtbaarOpWebsite: false,
    bron: 'boeking',
    ...over,
  };
}

test('huidig jaar is standaard geselecteerd', () => {
  const selectie = leesPlanningSelectie(new URLSearchParams(), vandaag);
  assert.equal(selectie.jaar, 2026);
  assert.equal(selectie.q, '');
  assert.equal(selectie.filter, 'alles');
});

test('vorig en volgend jaar wisselen en bewaren filters', () => {
  const start = leesPlanningSelectie(new URLSearchParams('type=expositie&q=isabelle&filter=niet_openbaar'), vandaag);
  const verder = new URL(planningHref('/beheer/planning/', metJaar(start, 2027), vandaag), 'https://beheer.lokaal');
  const selectie = leesPlanningSelectie(verder.searchParams, vandaag);
  assert.equal(selectie.jaar, 2027);
  assert.equal(selectie.type, 'expositie');
  assert.equal(selectie.q, 'isabelle');
  assert.equal(selectie.filter, 'niet_openbaar');
  const terug = new URL(planningHref('/beheer/planning/', metJaar(selectie, 2026), vandaag), 'https://beheer.lokaal');
  assert.equal(leesPlanningSelectie(terug.searchParams, vandaag).jaar, 2026);
  assert.equal(terug.searchParams.get('q'), 'isabelle');
});

test('datum van en tot begrenzen de lijst', () => {
  const items = [
    item({ sleutel: 'okt', start: '2026-10-03', eind: '2026-10-04', titel: 'Oktober' }),
    item({ sleutel: 'nov', start: '2026-11-07', eind: '2026-11-08', titel: 'November' }),
  ];
  const lijst = stelPlanning(items, { vandaag, jaar: 'alle', van: '2026-11-01', tot: '2026-11-30' });
  assert.deepEqual(lijst.map((rij) => rij.titel), ['November']);
});

test('zoeken vindt titel, persoon, organisatie en gastbegeleider', () => {
  const items = [
    item({
      sleutel: 'jona',
      start: '2026-11-07',
      eind: '2026-11-08',
      titel: 'November 7/8',
      huurder: 'Galerie Noord',
      organisatie: 'Hoevenaars',
      gastbegeleiders: 'Jona Mars',
      email: 'jona@example.test',
      nummer: 'B-42',
    }),
    item({
      sleutel: 'ander',
      start: '2026-12-01',
      eind: '2026-12-02',
      titel: 'Kerstmarkt',
      type: 'diverse',
      huurder: 'Iemand anders',
    }),
  ];
  assert.equal(stelPlanning(items, { vandaag, jaar: 2026, q: 'Kerstmarkt' })[0]?.titel, 'Kerstmarkt');
  assert.equal(stelPlanning(items, { vandaag, jaar: 2026, q: 'Jona' })[0]?.sleutel, 'jona');
  assert.equal(stelPlanning(items, { vandaag, jaar: 2026, q: 'Hoevenaars' })[0]?.sleutel, 'jona');
  assert.equal(stelPlanning(items, { vandaag, jaar: 2026, q: 'jona@example.test' })[0]?.sleutel, 'jona');
  assert.equal(stelPlanning(items, { vandaag, jaar: 2026, q: 'jona@example.test', emailZoeken: false }).length, 0);
  assert.equal(stelPlanning(items, { vandaag, jaar: 2026, q: 'B-42' })[0]?.sleutel, 'jona');
});

test('een maandnaam filtert op de datum, technische ids niet', () => {
  const items = [
    item({ sleutel: 'nov', start: '2026-11-07', eind: '2026-11-08', titel: 'Herfst', legacyId: 'EL8', boekingId: '550e8400-e29b-41d4-a716-446655440000' }),
    item({ sleutel: 'dec', start: '2026-12-01', eind: '2026-12-02', titel: 'November in de titel' }),
  ];
  assert.deepEqual(stelPlanning(items, { vandaag, jaar: 2026, q: 'november' }).map((rij) => rij.sleutel), ['nov']);
  assert.equal(stelPlanning(items, { vandaag, jaar: 2026, q: 'bron:12' }).length, 0);
  assert.equal(stelPlanning(items, { vandaag, jaar: 2026, q: '550e8400-e29b-41d4-a716-446655440000' }).length, 0);
  assert.equal(stelPlanning(items, { vandaag, jaar: 2026, q: 'legacy:EL8' }).length, 0);
  assert.equal(stelPlanning(items, { vandaag, jaar: 2026, q: 'EL8' }).length, 0);
});

test('jaar, type en zoekterm combineren en het eerstvolgende blijft bovenaan', () => {
  const items = [
    item({ sleutel: 'vroeg', start: '2028-02-01', eind: '2028-02-02', titel: 'Februari Isabelle', type: 'expositie' }),
    item({ sleutel: 'later', start: '2028-06-01', eind: '2028-06-02', titel: 'Zomer Isabelle', type: 'expositie', zichtbaarOpWebsite: true }),
    item({ sleutel: 'concert', start: '2028-03-01', eind: '2028-03-02', titel: 'Concert Isabelle', type: 'concert' }),
    item({ sleutel: 'ander-jaar', start: '2027-04-01', eind: '2027-04-02', titel: 'Isabelle toen', type: 'expositie' }),
    item({ sleutel: 'gekoppeld', start: '2028-02-19', eind: '2028-02-20', titel: 'Februari 19/20', type: '', boekingId: '98', bron: 'boeking' }),
    item({
      sleutel: 'activiteit',
      start: '2028-02-19',
      eind: '2028-02-20',
      titel: 'Expositie Isabelle Hartman',
      type: 'expositie',
      exposant: 'Isabelle Hartman',
      boekingId: '98',
      bron: 'activiteit',
      publicatiestatus: 'publiek',
    }),
  ];
  const lijst = stelPlanning(items, { vandaag, jaar: 2028, type: 'expositie', filter: 'niet_openbaar', q: 'Isabelle' });
  assert.deepEqual(lijst.map((rij) => rij.sleutel), ['vroeg', 'gekoppeld']);
  const gemengd = stelPlanning([
    item({ sleutel: 'maart', start: '2026-03-01', eind: '2026-03-02', titel: 'Maart' }),
    item({ sleutel: 'nov', start: '2026-11-07', eind: '2026-11-08', titel: 'November' }),
  ], { vandaag, jaar: 2026 });
  assert.deepEqual(gemengd.map((rij) => rij.sleutel), ['nov', 'maart']);
});

test('terug vanuit detail bewaart de filterurl', () => {
  const lijst = planningHref('/beheer/planning/', {
    jaar: 2028,
    van: '',
    tot: '',
    periode: '',
    filter: 'alles',
    type: 'expositie',
    q: 'isabelle',
  }, vandaag);
  const href = metTerug('/beheer/boekingen/98/', lijst);
  const terug = terugLink(new URL(href, 'https://beheer.lokaal').searchParams.get('terug'));
  assert.equal(terug?.label, 'Planning');
  assert.equal(terug?.href, '/beheer/planning/?jaar=2028&type=expositie&q=isabelle');
  assert.equal(terugLink('https://elders.example/beheer/planning/?q=isabelle'), null);
  assert.equal(terugLink('/beheer/boekingen/?jaar=2028'), null);
});

test('periode-snelkeuze en gastbegeleiders komen uit één index', () => {
  const dezeMaand = leesPlanningSelectie(
    new URL(planningHref('/beheer/agenda/', metPeriode(leesPlanningSelectie(new URLSearchParams('q=Jona'), vandaag), 'deze_maand'), vandaag), 'https://beheer.lokaal').searchParams,
    vandaag,
  );
  assert.equal(dezeMaand.periode, 'deze_maand');
  assert.equal(dezeMaand.q, 'Jona');
  const namen = gastbegeleidersPerBoeking(
    [{ boekingId: '1', relatieNaam: 'Jona Mars' }, { boekingId: '1', relatieNaam: 'Jona Mars' }],
    [{ boekingId: '1', naam: 'Hoevenaars' }],
  );
  assert.equal(namen.size, 1);
  assert.match(namen.get('1') ?? '', /Jona Mars/);
  assert.match(namen.get('1') ?? '', /Hoevenaars/);
});

test('navigatie leest gekoppelde gegevens in één view, niet per rij', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261002180000_planning_navigatie.sql', import.meta.url), 'utf8');
  const planning = readFileSync(new URL('../src/pages/beheer/planning/index.astro', import.meta.url), 'utf8');
  const agenda = readFileSync(new URL('../src/pages/beheer/agenda/index.astro', import.meta.url), 'utf8');
  const nav = readFileSync(new URL('../src/components/beheer/PlanningNavigatie.astro', import.meta.url), 'utf8');
  assert.match(sql, /create or replace view public\.planning_zoekbron/);
  assert.match(sql, /security_invoker = true/);
  assert.match(sql, /string_agg\(distinct r\.naam/);
  assert.equal((sql.match(/from public\.gastbegeleider_toewijzingen/g) ?? []).length, 1);
  assert.match(sql, /not exists \([\s\S]*legacy_id/);
  assert.equal(sql.includes('legacy_id) as'), false);
  assert.match(planning, /gastbegeleidersPerBoeking/);
  assert.match(planning, /agendaPerBoeking/);
  assert.equal(planning.includes('.from('), false);
  assert.equal(planning.includes('.rpc('), false);
  assert.equal(agenda.includes('.from('), false);
  assert.match(planning, /PlanningNavigatie/);
  assert.match(agenda, /PlanningNavigatie/);
  assert.match(nav, /name="q"/);
  assert.match(nav, /name="van"/);
  assert.match(nav, /name="tot"/);
  assert.match(nav, /Vorig jaar/);
  assert.match(nav, /Volgend jaar/);
});
