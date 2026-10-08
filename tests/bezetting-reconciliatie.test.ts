import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { periodesOverlappen } from '../src/platform/datum.ts';

const sql = readFileSync(
  new URL('../supabase/migrations/20261008120000_bezetting_reconciliatie_2027_2029.sql', import.meta.url),
  'utf8',
);

const formulier = readFileSync(new URL('../src/pages/verhuur/aanvragen/index.astro', import.meta.url), 'utf8');

test('beschikbaarheid gebruikt één overlap en faalt dicht', () => {
  const check = sql.slice(sql.indexOf('function public.is_periode_beschikbaar'), sql.indexOf('revoke all on function public.is_periode_beschikbaar'));
  assert.match(check, /bezet\.start_datum <= v_eind/);
  assert.match(check, /bezet\.eind_datum >= p_start/);
  assert.match(check, /from public\.publieke_bezetting\(\)/);
  assert.match(check, /when others then/);
  assert.match(check, /return false/);
  assert.match(sql, /v_publieke_bezetting/);
  assert.match(sql, /from public\.publieke_bezetting\(\)/);
});

test('aanvraag wordt geweigerd vóór opslaan, mail en job', () => {
  const opslaan = sql.slice(sql.indexOf('function public.bewaar_test_aanvraag'), sql.indexOf('revoke all on function public.bewaar_test_aanvraag'));
  const check = opslaan.indexOf('is_periode_beschikbaar');
  const insert = opslaan.indexOf('insert into public.aanvragen');
  const job = opslaan.indexOf('insert into public.communicatie_jobs');
  assert.ok(check > 0 && check < insert);
  assert.ok(insert < job);
  assert.match(opslaan, /De beschikbaarheid kon niet worden gecontroleerd/);
  assert.match(opslaan, /Deze periode is niet beschikbaar/);
  assert.match(formulier, /await periodeBeschikbaar/);
  assert.ok(formulier.indexOf('await periodeBeschikbaar') < formulier.indexOf('await bewaarTestAanvraag'));
  assert.ok(formulier.indexOf('await periodeBeschikbaar') < formulier.indexOf('verstuurGecontroleerd'));
});

test('gedeeltelijke, exacte en volledige overlap worden geweigerd; een aangrenzende periode niet', () => {
  const bestaand = { start: '2027-04-24', eind: '2027-04-25' };
  assert.equal(periodesOverlappen(bestaand, { start: '2027-04-25', eind: '2027-04-26' }), true);
  assert.equal(periodesOverlappen(bestaand, { start: '2027-04-24', eind: '2027-04-24' }), true);
  assert.equal(periodesOverlappen(bestaand, { start: '2027-04-25', eind: '2027-04-25' }), true);
  assert.equal(periodesOverlappen(bestaand, { start: '2027-04-23', eind: '2027-04-26' }), true);
  assert.equal(periodesOverlappen(bestaand, { start: '2027-04-26', eind: '2027-04-27' }), false);
});

test('reconciliatie voegt ontbrekende JA-rijen toe en verwijdert geen boekingen', () => {
  assert.match(sql, /BKG-RECON-2027-019/);
  assert.match(sql, /BKG-RECON-2027-070/);
  assert.match(sql, /BKG-RECON-2028-054/);
  assert.equal(sql.includes('delete from'), false);
  assert.match(sql, /status = 'geannuleerd'/);
  assert.equal(sql.includes('2027-07-03'), false);
  assert.equal(sql.includes('2027-07-04'), false);
  assert.equal(sql.includes('2027-07-26'), false);
  assert.equal(sql.includes('2027-09-10'), false);
});
