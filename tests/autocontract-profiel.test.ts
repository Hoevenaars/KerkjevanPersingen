import assert from 'node:assert/strict';
import { test } from 'node:test';
import { leesAutocontractProfiel, berekenAutocontractTermijnen } from '../src/platform/autocontract-profiel.ts';

const p = {
  tijdVan: '10:00', tijdTot: '17:00', opbouw: 'Vrijdag', afbouw: 'Zondag',
  aanbetalingEuro: 100, betalingBinnenDagen: 14,
  restantMaandenVoorStart: 6, kortVoorStartVolledig: true,
};

test('alleen volledig vastgelegde profielen mogen automatisch contracten voorbereiden', () => {
  assert.equal(leesAutocontractProfiel({ ...p, tijdVan: '' }), null);
  assert.equal(leesAutocontractProfiel({ ...p, tijdVan: 'morgen' }), null);
  assert.equal(leesAutocontractProfiel({ ...p, tijdVan: '18:00', tijdTot: '17:00' }), null);
  assert.equal(leesAutocontractProfiel({ ...p, aanbetalingEuro: null }), null);
  assert.equal(leesAutocontractProfiel({ ...p, betalingBinnenDagen: -1 }), null);
  assert.deepEqual(leesAutocontractProfiel(p), p);
});

test('ruim voor het evenement: aanbetaling en later een aparte restfactuur', () => {
  const r = berekenAutocontractTermijnen({ prijsEuro: 490, profiel: p, vandaag: '2026-11-18', start: '2027-08-21' });
  assert.deepEqual(r, { ok: true, termijnen: { aanbetaling: 100, aanbetalingVerval: '2026-12-02', restVerval: '2027-02-21' } });
});

test('kort voor het evenement: uitsluitend de volledige huursom verschuldigd', () => {
  const r = berekenAutocontractTermijnen({ prijsEuro: 490, profiel: p, vandaag: '2026-11-18', start: '2027-02-20' });
  assert.deepEqual(r, { ok: true, termijnen: { aanbetaling: 0, aanbetalingVerval: '', restVerval: '2026-12-02' } });
});

test('zonder expliciete kortetermijnafspraak blokkeert automatische voorbereiding', () => {
  const r = berekenAutocontractTermijnen({ prijsEuro: 490, profiel: { ...p, kortVoorStartVolledig: false }, vandaag: '2026-11-18', start: '2027-02-20' });
  assert.equal(r.ok, false);
});

test('rekening houden met maandultimo en schrikkeljaar', () => {
  const r = berekenAutocontractTermijnen({ prijsEuro: 490, profiel: { ...p, restantMaandenVoorStart: 1 }, vandaag: '2026-11-01', start: '2027-03-31' });
  assert.deepEqual(r, { ok: true, termijnen: { aanbetaling: 100, aanbetalingVerval: '2026-11-15', restVerval: '2027-02-28' } });
});

test('zonder vastgesteld tarief geen automatische facturatie', () => {
  const r = berekenAutocontractTermijnen({ prijsEuro: NaN, profiel: p, vandaag: '2026-11-18', start: '2027-08-21' });
  assert.equal(r.ok, false);
});

test('standaardafspraken ondersteunen ook centbedragen zonder afrondingsverlies', () => {
  const profiel = { ...p, aanbetalingEuro: 100.25 };
  assert.deepEqual(leesAutocontractProfiel(profiel), profiel);
  const uit = berekenAutocontractTermijnen({ prijsEuro: 490.5, profiel, vandaag: '2026-11-18', start: '2027-08-21' });
  assert.equal(uit.ok, true);
  if (uit.ok) assert.equal(uit.termijnen.aanbetaling, 100.25);
  assert.equal(berekenAutocontractTermijnen({ prijsEuro: 490.123, profiel, vandaag: '2026-11-18', start: '2027-08-21' }).ok, false);
});

test('geen automatische factuur als de betalingsdatum na het evenement ligt', () => {
  const r = berekenAutocontractTermijnen({ prijsEuro: 490, profiel: p, vandaag: '2026-11-18', start: '2026-11-19' });
  assert.equal(r.ok, false);
});

test('geen eerste automatische pakketfactuur wanneer er nog niets verschuldigd is', () => {
  const r = berekenAutocontractTermijnen({ prijsEuro: 490, profiel: { ...p, aanbetalingEuro: 0 }, vandaag: '2026-11-18', start: '2027-08-21' });
  assert.equal(r.ok, false);
});
