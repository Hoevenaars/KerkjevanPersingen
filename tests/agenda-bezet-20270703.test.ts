import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activiteitVanAgendaRij, stelPubliekeAgenda, type AgendaRij } from '../src/lib/publiek-lezen.ts';

const sql = readFileSync(
  new URL('../supabase/migrations/20261011100000_agenda_bezet_kvp_20270703.sql', import.meta.url),
  'utf8',
);

test('KVP-20270703-BHFX krijgt een bezet agendarecord op 3 en 4 juli 2027', () => {
  assert.match(sql, /nummer = 'KVP-20270703-BHFX'/);
  assert.match(sql, /date '2027-07-03'/);
  assert.match(sql, /date '2027-07-04'/);
  assert.match(sql, /zichtbaarheid,\n  gepubliceerd/);
  assert.match(sql, /'bezet'/);
  assert.match(sql, /insert into public\.publieke_activiteiten/);
  assert.match(sql, /not exists/);
});

test('een bezet agendarecord komt op de publieke agenda als Bezet, zonder naam', () => {
  const functie = sql.slice(sql.indexOf('function public.publieke_agenda'));
  assert.match(functie, /p\.zichtbaarheid = 'bezet'/);
  assert.match(functie, /'Bezet'/);
  assert.match(functie, /'blokkade'/);
  assert.match(functie, /'Dit weekend is bezet\.'/);
  assert.equal(functie.includes('interne_activiteiten'), false);
  assert.equal(functie.includes('huurder_naam_snapshot'), false);

  const rij: AgendaRij = {
    id: 273,
    slug: null,
    titel: 'Bezet',
    start_datum: '2027-07-03',
    eind_datum: '2027-07-04',
    omschrijving: 'Dit weekend is bezet.',
    foto_pad: null,
    foto_alt: null,
    publicatie_trigger: 'direct',
    zichtbaarheid: 'publiek',
    inhoud_status: 'niet_vereist',
    soort: 'blokkade',
  };
  const item = activiteitVanAgendaRij(rij);
  assert.equal(item.publiekeTitel, 'Bezet');
  assert.equal(item.soort, 'blokkade');
  assert.equal(item.slug, '');
  const lijst = stelPubliekeAgenda([rij], new Date('2026-10-11T12:00:00Z'));
  assert.equal(lijst.length, 1);
  assert.equal(lijst[0]?.start.slice(0, 10), '2027-07-03');
  assert.equal(lijst[0]?.eind?.slice(0, 10), '2027-07-04');
});
