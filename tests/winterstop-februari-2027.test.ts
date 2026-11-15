import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  new URL('../supabase/migrations/20261115120000_winterstop_zonder_weekend_12_14_februari_2027.sql', import.meta.url),
  'utf8',
);

test('12 tot en met 14 februari 2027 gaat uit de winterstop, 11 februari blijft erin', () => {
  assert.match(sql, /delete from public\.interne_activiteiten/);
  assert.match(sql, /start_datum >= date '2027-02-12'/);
  assert.match(sql, /eind_datum <= date '2027-02-14'/);
  assert.match(sql, /eind_datum = date '2027-02-11'/);
  assert.match(sql, /start_datum < date '2027-02-12'/);
  assert.match(sql, /eind_datum between date '2027-02-12' and date '2027-02-14'/);
  assert.equal(sql.includes("date '2027-02-06'"), false);
});
