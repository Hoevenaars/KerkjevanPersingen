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

test('de publieke agenda toont 3 en 4 juli 2027 nog niet als Bezet', () => {
  const later = readFileSync(
    new URL('../supabase/migrations/20261011103000_agenda_zonder_bezetkaart_20270703.sql', import.meta.url),
    'utf8',
  );
  const functie = later.slice(later.indexOf('function public.publieke_agenda'));
  assert.match(functie, /p\.zichtbaarheid = 'publiek'/);
  assert.equal(functie.includes("zichtbaarheid = 'bezet'"), false);
  assert.equal(functie.includes('blokkade'), false);
  assert.equal(functie.includes('Dit weekend is bezet'), false);
  assert.equal(later.includes('publieke_bezetting'), false);

  const verborgen: AgendaRij = {
    id: 273,
    slug: null,
    titel: 'Bezet',
    start_datum: '2027-07-03',
    eind_datum: '2027-07-04',
    omschrijving: 'Dit weekend is bezet.',
    foto_pad: null,
    foto_alt: null,
    publicatie_trigger: 'direct',
    zichtbaarheid: 'bezet',
    inhoud_status: 'niet_vereist',
    soort: 'blokkade',
  };
  assert.equal(stelPubliekeAgenda([verborgen], new Date('2026-10-11T12:00:00Z')).length, 0);
  assert.equal(activiteitVanAgendaRij(verborgen).zichtbaarheid, 'bezet');
});
