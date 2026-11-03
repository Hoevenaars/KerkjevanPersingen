import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  new URL('../supabase/migrations/20261103143000_winterstop_doordeweeks.sql', import.meta.url),
  'utf8',
);

function seizoenenUitSql(bron: string): [string, string][] {
  return [...bron.matchAll(/date '(\d{4}-\d{2}-\d{2})', date '(\d{4}-\d{2}-\d{2})'/g)].map((match) => [match[1], match[2]]);
}

function binnenSeizoen(dag: string, seizoenen: readonly [string, string][]): boolean {
  return seizoenen.some(([start, eind]) => start <= dag && dag <= eind);
}

test('elk winterseizoen wordt één blokkade, inclusief de ontbrekende kerst van 2028', () => {
  assert.match(sql, /blokkeert_verhuurkalender/);
  assert.match(sql, /'Winterstop'/);
  assert.match(sql, /not exists/);
  const seizoenen = seizoenenUitSql(sql);
  assert.deepEqual(seizoenen, [
    ['2026-12-19', '2027-02-14'],
    ['2027-12-18', '2028-02-13'],
    ['2028-12-23', '2029-02-18'],
    ['2029-12-15', '2029-12-30'],
  ]);
  for (const [start] of seizoenen) {
    assert.match(sql, new RegExp(`BLK-winterstop-seizoen-${start}`));
  }
});

test('doordeweekse dagen binnen de winterstop vallen in het seizoen, de dagen eromheen niet', () => {
  const seizoenen = seizoenenUitSql(sql);
  const binnen = (dag: string) => binnenSeizoen(dag, seizoenen);
  assert.equal(binnen('2026-12-18'), false);
  assert.equal(binnen('2026-12-21'), true);
  assert.equal(binnen('2027-01-01'), true);
  assert.equal(binnen('2027-01-04'), true);
  assert.equal(binnen('2027-02-12'), true);
  assert.equal(binnen('2027-02-15'), false);

  assert.equal(binnen('2027-12-17'), false);
  assert.equal(binnen('2027-12-20'), true);
  assert.equal(binnen('2028-02-14'), false);

  assert.equal(binnen('2028-12-17'), false);
  assert.equal(binnen('2028-12-22'), false);
  assert.equal(binnen('2028-12-25'), true);
  assert.equal(binnen('2028-12-31'), true);
  assert.equal(binnen('2029-01-02'), true);
  assert.equal(binnen('2029-02-19'), false);

  assert.equal(binnen('2029-12-14'), false);
  assert.equal(binnen('2029-12-18'), true);
  assert.equal(binnen('2029-12-31'), false);
});
