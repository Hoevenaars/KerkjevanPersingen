import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bccVoorKerkjeOntvanger,
  isInterneKerkjeSleutel,
  laadKerkjeLeden,
  toezichtBcc,
} from '../src/lib/toezicht-bcc.ts';

test('aanvraag naar contractbeheer krijgt een BCC naar Nick', () => {
  assert.deepEqual(bccVoorKerkjeOntvanger('contractbeheer.kvp@gmail.com', [], {}), [
    'nhoevenaars@gmail.com',
  ]);
  assert.deepEqual(bccVoorKerkjeOntvanger('Contractbeheer.KVP@gmail.com', [], {}), [
    'nhoevenaars@gmail.com',
  ]);
});

test('een relatie met een kerkje-rol krijgt dezelfde kopie', () => {
  assert.deepEqual(bccVoorKerkjeOntvanger('GeertKroes@live.nl', ['geertkroes@live.nl'], {}), [
    'nhoevenaars@gmail.com',
  ]);
});

test('mail naar een aanvrager blijft zonder toezichtkopie', () => {
  assert.deepEqual(bccVoorKerkjeOntvanger('info@reinvanvucht.nl', ['geertkroes@live.nl'], {}), []);
});

test('mail naar Nick zelf krijgt geen BCC naar hetzelfde adres', () => {
  assert.deepEqual(bccVoorKerkjeOntvanger('nhoevenaars@gmail.com', ['nhoevenaars@gmail.com'], {}), []);
});

test('lege TOEZICHT_BCC_EMAIL zet de kopie uit', () => {
  assert.deepEqual(
    bccVoorKerkjeOntvanger('contractbeheer.kvp@gmail.com', [], { TOEZICHT_BCC_EMAIL: '' }),
    [],
  );
});

test('CONTACT_FALLBACK_EMAIL en CONTACT_BCC_EMAIL tellen mee bij interne mail', () => {
  assert.deepEqual(
    bccVoorKerkjeOntvanger('bestuur@kerkje.test', [], { CONTACT_FALLBACK_EMAIL: 'bestuur@kerkje.test' }),
    ['nhoevenaars@gmail.com'],
  );
  assert.deepEqual(
    bccVoorKerkjeOntvanger('contractbeheer.kvp@gmail.com', [], {
      CONTACT_BCC_EMAIL: 'archief@kerkje.test, nhoevenaars@gmail.com',
    }),
    ['nhoevenaars@gmail.com', 'archief@kerkje.test'],
  );
});

test('bestuursnotificaties gelden als interne mail, ook bij een ander ontvangstadres', async () => {
  assert.equal(isInterneKerkjeSleutel('aanvraag_bestuur'), true);
  assert.equal(isInterneKerkjeSleutel('contact_bestuur'), true);
  assert.equal(isInterneKerkjeSleutel('aanvraag_bevestiging'), false);
  const bcc = await toezichtBcc('ander-bestuur@example.nl', {}, true);
  assert.deepEqual(bcc, ['nhoevenaars@gmail.com']);
  const extern = await toezichtBcc('aanvrager@example.nl', {}, false);
  assert.deepEqual(extern, []);
});

test('zonder service-role blijft de ledenlijst bij de vaste postbus', async () => {
  assert.deepEqual(await laadKerkjeLeden({}), ['contractbeheer.kvp@gmail.com']);
});
