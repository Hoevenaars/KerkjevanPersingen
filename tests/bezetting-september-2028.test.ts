import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  new URL('../supabase/migrations/20261020140000_bezetting_2_3_september_2028.sql', import.meta.url),
  'utf8',
);

const functie = sql.slice(
  sql.indexOf('function public.publieke_bezetting'),
  sql.indexOf('revoke all on function public.publieke_bezetting'),
);

test('2 en 3 september 2028 worden weer als vergeven vastgelegd', () => {
  assert.match(sql, /01-10-2026:2028-09-02:frank-biemans-icm-denny-baggen/);
  assert.match(sql, /date '2028-09-02'/);
  assert.match(sql, /date '2028-09-03'/);
  assert.match(sql, /y3vBdxZBtQ6qbfdUZvDdKx/);
  assert.match(sql, /status = 'migratie_vastgelegd'/);
  assert.match(sql, /levenscyclus = 'actief'/);
  assert.equal(sql.includes('delete from'), false);
});

test('zichtbaarheid bezet blokkeert ook als alleen de levenscyclus is geannuleerd', () => {
  assert.match(functie, /a\.zichtbaarheid = 'bezet'/);
  assert.match(functie, /lokale_override/);
  assert.match(functie, /\? 'annulering'/);
  assert.match(functie, /a\.zichtbaarheid = 'publiek'/);
  assert.match(functie, /coalesce\(a\.levenscyclus, 'actief'\) <> 'geannuleerd'/);
  const bezetTak = functie.slice(functie.indexOf("a.zichtbaarheid = 'bezet'"), functie.indexOf("a.zichtbaarheid = 'publiek'"));
  assert.equal(bezetTak.includes('geannuleerd'), false);
});

test('een expliciet geannuleerde publieke activiteit blijft van de kalender af', () => {
  const publiekTak = functie.slice(functie.indexOf("a.zichtbaarheid = 'publiek'"));
  assert.match(publiekTak, /geannuleerd/);
  assert.equal(functie.includes('2027-07-31'), false);
});
