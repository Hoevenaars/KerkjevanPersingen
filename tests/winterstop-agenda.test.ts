import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const blokkade = readFileSync(
  new URL('../supabase/migrations/20261006140945_winterstop_agenda_bezet.sql', import.meta.url),
  'utf8',
);
const agenda = readFileSync(
  new URL('../supabase/migrations/20261006142810_winterstop_alleen_verhuurkalender.sql', import.meta.url),
  'utf8',
);
const bezetting = readFileSync(
  new URL('../supabase/migrations/20261001180000_activiteit_beheer.sql', import.meta.url),
  'utf8',
);

test('kerstweekend 2026 hoort bij de winterstop en blokkeert de verhuurkalender', () => {
  assert.match(blokkade, /date '2026-12-26'/);
  assert.match(blokkade, /date '2026-12-27'/);
  assert.match(blokkade, /blokkeert_verhuurkalender/);
  assert.match(blokkade, /'Winterstop'/);
  assert.equal(blokkade.includes('publieke_agenda'), false);
  const functie = bezetting.slice(
    bezetting.indexOf('function public.publieke_bezetting'),
    bezetting.indexOf('revoke all on function public.publieke_bezetting'),
  );
  assert.match(functie, /from public\.interne_activiteiten i/);
  assert.match(functie, /where i\.blokkeert_verhuurkalender/);
});

test('de publieke agenda toont de winterstop niet', () => {
  const functie = agenda.slice(agenda.indexOf('function public.publieke_agenda'));
  assert.equal(functie.includes('interne_activiteiten'), false);
  assert.equal(functie.includes("'Bezet'"), false);
  assert.match(functie, /p\.zichtbaarheid = 'publiek'/);
});
