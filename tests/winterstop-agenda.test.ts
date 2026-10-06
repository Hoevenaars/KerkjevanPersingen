import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activiteitVanAgendaRij, stelPubliekeAgenda, type AgendaRij } from '../src/lib/publiek-lezen.ts';

const sql = readFileSync(
  new URL('../supabase/migrations/20261006140945_winterstop_agenda_bezet.sql', import.meta.url),
  'utf8',
);

test('kerstweekend 2026 hoort bij de winterstop en blokkeert de kalender', () => {
  assert.match(sql, /date '2026-12-26'/);
  assert.match(sql, /date '2026-12-27'/);
  assert.match(sql, /blokkeert_verhuurkalender/);
  assert.match(sql, /'Winterstop'/);
});

test('publieke agenda toont blokkerende interne activiteiten als Bezet', () => {
  const functie = sql.slice(sql.indexOf('function public.publieke_agenda'));
  assert.match(functie, /from public\.interne_activiteiten i/);
  assert.match(functie, /where i\.blokkeert_verhuurkalender/);
  assert.match(functie, /'Bezet'/);
  assert.match(functie, /'blokkade'/);
  assert.equal(functie.includes('i.titel'), false);
});

test('een blokkade-rij wordt een bezet agenda-item zonder detailpagina', () => {
  const rij: AgendaRij = {
    id: -1,
    slug: null,
    titel: 'Bezet',
    start_datum: '2026-12-26',
    eind_datum: '2026-12-27',
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
  const lijst = stelPubliekeAgenda([rij], new Date('2026-10-06T12:00:00Z'));
  assert.equal(lijst.length, 1);
  assert.equal(lijst[0]?.start.slice(0, 10), '2026-12-26');
});
