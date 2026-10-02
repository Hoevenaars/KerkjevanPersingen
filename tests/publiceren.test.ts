import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { hoortOpPubliekeAgenda, magOpWebsiteZonderTiming } from '../src/lib/agenda-zichtbaarheid.ts';
import {
  STANDAARD_AFBEELDING,
  afbeeldingVoorWebsite,
  contentCompleet,
  detailVoorWebsite,
  kaartVoorWebsite,
  publicatieBesluit,
  publicatieChecks,
  publicatieDossierHref,
  publicatieUitBoekingen,
  publicatieWerklijst,
  slugNaPublicatie,
  slugUitActiviteit,
  uniekeSlug,
  werkstatus,
  type PublicatieBron,
} from '../src/platform/publiceren.ts';

const vandaag = '2026-10-02';

function item(over: Partial<PublicatieBron> & Pick<PublicatieBron, 'id' | 'start' | 'eind' | 'titel'>): PublicatieBron {
  return {
    exposanten: '',
    korteOmschrijving: '',
    volledigeOmschrijving: '',
    fotoPad: '',
    slug: '',
    publicatiestatus: 'bezet',
    ...over,
  };
}

test('activiteit binnen 8 weken staat op de werklijst, daarbuiten niet', () => {
  const lijst = publicatieWerklijst([
    item({ id: 'nu', start: '2026-10-20', eind: '2026-10-21', titel: 'Binnenkort' }),
    item({ id: 'ver', start: '2027-02-01', eind: '2027-02-02', titel: 'Ver weg' }),
    item({ id: 'loopt', start: '2026-09-28', eind: '2026-10-04', titel: 'Loopt' }),
    item({ id: 'later', start: '2026-11-01', eind: '2026-11-02', titel: 'November' }),
  ], vandaag);
  assert.deepEqual(lijst.items.map((rij) => rij.id), ['loopt', 'nu', 'later']);
  assert.equal(lijst.venster.van, '2026-10-02');
  assert.equal(lijst.venster.tot, '2026-11-27');
});

test('volledige content is klaar, ontbrekende korte tekst waarschuwt en force publish mag', () => {
  const klaar = item({
    id: '1',
    start: '2026-10-10',
    eind: '2026-10-11',
    titel: 'Evelien',
    exposanten: 'Evelien Bannenberg',
    korteOmschrijving: 'Kort.',
    volledigeOmschrijving: 'Lang.',
    fotoPad: '/foto/eigen.jpg',
    slug: 'evelien-bannenberg',
  });
  assert.equal(contentCompleet(publicatieChecks(klaar)), true);
  assert.equal(werkstatus(klaar), 'klaar');
  const zonderKort = { ...klaar, korteOmschrijving: '' };
  const checks = publicatieChecks(zonderKort);
  assert.equal(werkstatus(zonderKort, checks), 'mist_content');
  const geweigerd = publicatieBesluit(checks, false);
  assert.equal(geweigerd.mag, false);
  assert.match(geweigerd.melding, /nog niet volledig/);
  assert.equal(geweigerd.mail, false);
  assert.equal(geweigerd.jobs, 0);
  const geforceerd = publicatieBesluit(checks, true);
  assert.equal(geforceerd.mag, true);
  assert.equal(geforceerd.force, true);
  assert.ok(geforceerd.ontbrekend.some((veld) => /korte/i.test(veld)));
});

test('ontbrekende tekst en afbeelding breken de pagina niet', () => {
  const leeg = item({ id: '2', start: '2026-10-10', eind: '2026-10-11', titel: 'Leeg', volledigeOmschrijving: '' });
  assert.equal(detailVoorWebsite(leeg).length > 0, true);
  assert.equal(kaartVoorWebsite(leeg).length > 0, true);
  assert.equal(kaartVoorWebsite({ ...leeg, volledigeOmschrijving: 'Eerste zin. Tweede zin. Derde zin. Vierde zin.' }).includes('Vierde'), false);
  const beeld = afbeeldingVoorWebsite('');
  assert.equal(beeld.eigen, false);
  assert.equal(beeld.src, STANDAARD_AFBEELDING);
  assert.equal(afbeeldingVoorWebsite('/foto/eigen.jpg').eigen, true);
  assert.equal(afbeeldingVoorWebsite('/foto/eigen.jpg').src, '/foto/eigen.jpg');
});

test('slug uit exposanten, uniek en stabiel na publicatie', () => {
  assert.equal(slugUitActiviteit('Evelien Bannenberg', 'Expositie'), 'evelien-bannenberg');
  assert.equal(slugUitActiviteit('Nelian Smit / Winy Smit Vuijk', 'Titel'), 'nelian-smit-winy-smit-vuijk');
  assert.equal(slugUitActiviteit('', 'Éxpositie André'), 'expositie-andre');
  assert.equal(slugUitActiviteit('', 'A--B'), 'a-b');
  const bezet = new Set(['isabelle-hartman']);
  assert.equal(uniekeSlug('isabelle-hartman', bezet, '2028'), 'isabelle-hartman-2028');
  bezet.add('isabelle-hartman-2028');
  assert.equal(uniekeSlug('isabelle-hartman', bezet, '2028'), 'isabelle-hartman-2028-2');
  const gepubliceerd = item({
    id: '3',
    start: '2026-10-10',
    eind: '2026-10-11',
    titel: 'Isabelle',
    slug: 'isabelle-hartman',
    publicatiestatus: 'publiek',
  });
  const vast = slugNaPublicatie(gepubliceerd, 'isabelle-hartman-nieuw', false);
  assert.equal(vast.slug, 'isabelle-hartman');
  assert.match(vast.waarschuwing, /bewust/);
  assert.equal(slugNaPublicatie(gepubliceerd, 'isabelle-hartman-nieuw', true).slug, 'isabelle-hartman-nieuw');
});

test('publicatie toont de activiteit, verbergen haalt haar weg, zonder mail', () => {
  const basis = {
    gepubliceerd: true,
    inhoudStatus: 'niet_gestart' as const,
    eind: '2026-10-11',
    trigger: 'zodra_content_compleet',
    contentstatus: 'niet_aangeleverd',
    soort: 'expositie',
    titel: 'Evelien Bannenberg',
    korteOmschrijving: null,
    volledigeOmschrijving: null,
    hoofdafbeelding: null,
  };
  assert.equal(hoortOpPubliekeAgenda({ ...basis, zichtbaarheid: 'publiek' }, vandaag), true);
  assert.equal(hoortOpPubliekeAgenda({ ...basis, zichtbaarheid: 'verborgen' }, vandaag), false);
  assert.equal(magOpWebsiteZonderTiming({ zichtbaarheid: 'publiek', contentstatus: 'niet_aangeleverd' }), true);
  const besluit = publicatieBesluit(publicatieChecks(item({
    id: '4', start: '2026-10-10', eind: '2026-10-11', titel: 'Evelien',
  })), true);
  assert.equal(besluit.workflow, false);
  assert.equal(besluit.mail, false);
  assert.equal(besluit.jobs, 0);
});

test('verhuur in de komende 8 weken staat op de werklijst', () => {
  const activiteiten = [
    item({ id: 'evelien', start: '2026-11-07', eind: '2026-11-08', titel: 'expositie Evelien Bannenberg' }),
  ];
  const verhuur = publicatieUitBoekingen([
    { id: '42', start: '2026-10-10', eind: '2026-10-11', titel: 'Oktober 10/11', huurder: 'Martina Vieten', status: 'migratie_vastgelegd' },
    { id: '39', start: '2026-10-03', eind: '2026-10-04', titel: 'Oktober 3/4 geannuleerd', huurder: 'Jos van Riswick', status: 'geannuleerd' },
    { id: '257', start: '2026-11-07', eind: '2026-11-08', titel: 'November 7/8.', huurder: 'Evelien Bannenberg', status: 'migratie_vastgelegd' },
    { id: '51', start: '2026-11-28', eind: '2026-11-29', titel: 'November 28/29', huurder: 'Nick Cillessen', status: 'migratie_vastgelegd' },
  ], activiteiten);
  const lijst = publicatieWerklijst([...activiteiten, ...verhuur], vandaag);
  assert.deepEqual(lijst.items.map((rij) => rij.id), ['42', 'evelien']);
  assert.equal(lijst.items[0]?.exposanten, 'Martina Vieten');
  assert.equal(lijst.items[0]?.tabel, 'boekingen');
  assert.equal(publicatieDossierHref(lijst.items[0]!), '/beheer/boekingen/42/');
  assert.equal(werkstatus(lijst.items[0]!), 'mist_content');
});

test('publiceren toont geen technische bronvelden en blokkeert mail in sql', () => {
  const pagina = readFileSync(new URL('../src/pages/beheer/publiceren/index.astro', import.meta.url), 'utf8');
  const sql = readFileSync(new URL('../supabase/migrations/20261002200000_publiceren_boekingen.sql', import.meta.url), 'utf8');
  assert.match(pagina, /Te publiceren komende 8 weken/);
  assert.match(pagina, /Toch publiceren/);
  assert.match(pagina, /publicatieBesluit\(checks, actie === 'toch_publiceren'\)/);
  assert.equal(pagina.includes('name="bevestig"'), false);
  assert.match(pagina, /Genereer URL/);
  assert.match(pagina, /Standaardafbeelding wordt gebruikt/);
  assert.equal(pagina.includes('legacy_id'), false);
  assert.equal(pagina.includes('activiteit_bron'), false);
  assert.match(pagina, /Open de boeking/);
  assert.match(sql, /boekingen/);
  assert.match(sql, /boeking_id/);
  assert.match(sql, /force_publish/);
  assert.match(sql, /publiceren mag geen communicatiejob maken/);
  assert.equal(sql.includes('insert into public.communicatie_jobs'), false);
  assert.equal(sql.includes("p.contentstatus = 'goedgekeurd'"), false);
});
