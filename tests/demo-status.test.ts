import assert from 'node:assert/strict';
import test from 'node:test';
import { STANDAARD_AUTOMATISERINGEN, functioneleStatus } from '../src/platform/automatisering.ts';
import { labelVoorCommunicatie } from '../src/platform/demo-data.ts';

test('functionele status volgt de caller, niet alleen de schakelaar', () => {
  const op = (sleutel: string) => {
    const item = STANDAARD_AUTOMATISERINGEN.find((rij) => rij.sleutel === sleutel);
    assert.ok(item, sleutel);
    return functioneleStatus(item);
  };

  assert.equal(op('contact_bestuur').status, 'niet-aangesloten');
  assert.equal(op('contact_bestuur').label, 'NIET AANGESLOTEN');
  assert.match(op('contact_bestuur').toelichting, /geen formulier/);

  assert.equal(op('aanvraag_bestuur').status, 'actief');
  assert.equal(op('aanvraag_bevestiging').status, 'klaar');
  assert.equal(op('nieuwsbrief').status, 'klaar');
  const nieuwsbriefAan = STANDAARD_AUTOMATISERINGEN.find((rij) => rij.sleutel === 'nieuwsbrief');
  assert.ok(nieuwsbriefAan);
  assert.equal(functioneleStatus({ ...nieuwsbriefAan, status: 'actief' }).status, 'actief');
  assert.match(op('nieuwsbrief').toelichting, /nog niet geactiveerd/);
  assert.equal(op('nazorg').status, 'klaar');
  assert.equal(op('nazorg').label, 'KLAAR MAAR UIT');
  assert.match(op('nazorg').toelichting, /nog niet geactiveerd/);
  assert.equal(op('workflow').status, 'klaar');
  assert.equal(op('mailtemplate_test').status, 'test');
  assert.equal(op('handmatige_template').status, 'klaar');
  assert.equal(op('reservelijst_mail').status, 'klaar');
  assert.equal(op('gebruiker_uitnodiging').status, 'klaar');
});

test('een prognose heet nooit ingepland', () => {
  assert.equal(labelVoorCommunicatie('gepland', 'verwacht'), 'Verwacht');
  assert.equal(labelVoorCommunicatie('gepland', 'job'), 'Ingepland');
  assert.equal(labelVoorCommunicatie('verzonden', 'job'), 'Verzonden');
  assert.equal(labelVoorCommunicatie('fout', 'job'), 'Fout');
  assert.equal(labelVoorCommunicatie('geannuleerd', 'job'), 'Geannuleerd');
  assert.equal(labelVoorCommunicatie('geblokkeerd', 'job'), 'Geblokkeerd');
});
