import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { agendaOverzichtUitLijst, type Activiteit } from '../src/lib/content.ts';
import { activiteitVanAgendaRij, stelPubliekeAgenda, type AgendaRij } from '../src/lib/publiek-lezen.ts';
import { formatWinterstopDatum, WINTERSTOP_TEKST, WINTERSTOP_TITEL } from '../src/lib/winterstop.ts';

const sql = readFileSync(
  new URL('../supabase/migrations/20261111120000_agenda_winterstop_en_ongepubliceerd.sql', import.meta.url),
  'utf8',
);

function activiteit(deel: Partial<Activiteit> & Pick<Activiteit, 'start' | 'soort'>): Activiteit {
  return {
    _id: deel._id ?? deel.start,
    slug: deel.slug ?? '',
    interneTitel: deel.interneTitel ?? 'Activiteit',
    publiekeTitel: deel.publiekeTitel,
    eind: deel.eind,
    zichtbaarheid: 'publiek',
    ...deel,
  };
}

test('Rob de Valk van 8 en 9 mei 2027 gaat van de agenda af zolang hij niet gepubliceerd is', () => {
  assert.match(sql, /date '2027-05-08'/);
  assert.match(sql, /date '2027-05-09'/);
  assert.match(sql, /rob de valk/);
  assert.match(sql, /zichtbaarheid = 'verborgen'/);
  assert.match(sql, /p\.gepubliceerd = false/);
  assert.match(sql, /zodra_content_compleet/);
});

test('een ongepubliceerde activiteit zonder tekst komt niet in publieke_agenda', () => {
  const functie = sql.slice(sql.indexOf('function public.publieke_agenda'));
  assert.match(functie, /p\.gepubliceerd/);
  assert.match(functie, /p\.publicatie_trigger = 'direct'/);
  assert.match(functie, /uiterlijk_%/);
  assert.match(functie, /p\.publicatie_trigger = 'zodra_content_compleet'/);
  assert.match(functie, /korte_omschrijving, p\.volledige_omschrijving, p\.omschrijving/);
});

test('winterstop wordt één tegel per seizoen met de vaste tekst', () => {
  const functie = sql.slice(sql.indexOf('function public.publieke_agenda'));
  assert.match(functie, /lower\(btrim\(titel\)\) = 'winterstop'/);
  assert.match(functie, /vorig_eind \+ 21/);
  assert.match(functie, /'winterstop'/);
  assert.equal(functie.includes(WINTERSTOP_TEKST), true);
  assert.equal((functie.match(/Winterstop/g) ?? []).length > 0, true);
});

test('een winterstoprij houdt de vaste titel en komt op de agenda', () => {
  const rij: AgendaRij = {
    id: -20261219,
    slug: null,
    titel: WINTERSTOP_TITEL,
    start_datum: '2026-12-19',
    eind_datum: '2027-02-14',
    omschrijving: WINTERSTOP_TEKST,
    korte_omschrijving: WINTERSTOP_TEKST,
    foto_pad: '/foto/nieuwe-vlag.jpg',
    foto_alt: 'Het kerkje van Persingen',
    publicatie_trigger: 'direct',
    zichtbaarheid: 'publiek',
    inhoud_status: 'niet_vereist',
    soort: 'winterstop',
  };
  const item = activiteitVanAgendaRij(rij);
  assert.equal(item.publiekeTitel, WINTERSTOP_TITEL);
  assert.equal(item.soort, 'winterstop');
  assert.equal(item.slug, '');
  assert.equal(item.korteOmschrijving, WINTERSTOP_TEKST);
  const lijst = stelPubliekeAgenda([rij], new Date('2026-11-11T12:00:00Z'));
  assert.equal(lijst.length, 1);
  assert.equal(lijst[0]?.start.slice(0, 10), '2026-12-19');
  assert.equal(lijst[0]?.eind?.slice(0, 10), '2027-02-14');
});

test('het eerstvolgende winterseizoen volgt de exposities op de homepage', () => {
  const nu = new Date('2026-11-11T12:00:00Z');
  const lijst = [
    activiteit({
      start: '2026-11-14T12:00:00+01:00',
      eind: '2026-11-15T12:00:00+01:00',
      soort: 'expositie',
      publiekeTitel: 'Natuurlijk',
    }),
    activiteit({
      start: '2026-12-19T12:00:00+01:00',
      eind: '2027-02-14T12:00:00+01:00',
      soort: 'winterstop',
      publiekeTitel: WINTERSTOP_TITEL,
      korteOmschrijving: WINTERSTOP_TEKST,
    }),
    activiteit({
      start: '2027-05-08T12:00:00+02:00',
      eind: '2027-05-09T12:00:00+02:00',
      soort: 'expositie',
      publiekeTitel: 'Expositie: Iemand anders',
    }),
    activiteit({
      start: '2027-12-18T12:00:00+01:00',
      eind: '2028-02-13T12:00:00+01:00',
      soort: 'winterstop',
      publiekeTitel: WINTERSTOP_TITEL,
    }),
  ];
  const overzicht = agendaOverzichtUitLijst(lijst, nu);
  assert.equal(overzicht.volgende?.publiekeTitel, 'Natuurlijk');
  assert.equal(overzicht.daarna?.soort, 'winterstop');
  assert.equal(overzicht.daarna?.start.slice(0, 10), '2026-12-19');
});

test('een winterstop binnen één maand blijft een periode, geen weekend', () => {
  const tekst = formatWinterstopDatum('2029-12-15T12:00:00+01:00', '2029-12-30T12:00:00+01:00');
  assert.match(tekst, /15 december 2029 t\/m/);
  assert.match(tekst, /30 december 2029/);
  assert.equal(tekst.includes(' en '), false);
});

test('tijdens de winterstop is die de lopende activiteit op de homepage', () => {
  const nu = new Date('2027-01-10T12:00:00Z');
  const overzicht = agendaOverzichtUitLijst([
    activiteit({
      start: '2026-12-19T12:00:00+01:00',
      eind: '2027-02-14T12:00:00+01:00',
      soort: 'winterstop',
      publiekeTitel: WINTERSTOP_TITEL,
    }),
    activiteit({
      start: '2027-05-08T12:00:00+02:00',
      eind: '2027-05-09T12:00:00+02:00',
      soort: 'expositie',
      publiekeTitel: 'Expositie: Later',
    }),
    activiteit({
      start: '2027-12-18T12:00:00+01:00',
      eind: '2028-02-13T12:00:00+01:00',
      soort: 'winterstop',
      publiekeTitel: WINTERSTOP_TITEL,
    }),
  ], nu);
  assert.equal(overzicht.vandaag?.soort, 'winterstop');
  assert.equal(overzicht.volgende?.publiekeTitel, 'Expositie: Later');
  assert.equal(overzicht.daarna, null);
});
