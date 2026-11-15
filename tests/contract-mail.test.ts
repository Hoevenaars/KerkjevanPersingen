import assert from 'node:assert/strict';
import test from 'node:test';
import { stelMailconceptSamen } from '../src/platform/mailconcept.ts';
import {
  boekingIdVoorLog,
  contractTemplateVan,
  stelContractbriefOp,
  tariefTekst,
  vulPlaatsHouders,
} from '../src/platform/contract-mail.ts';
import type { MailTemplateDef } from '../src/platform/mailtemplates/types.ts';

const template: MailTemplateDef = {
  id: 'contract_begeleiding',
  naam: 'Contract meesturen',
  categorie: 'Boeking',
  actief: true,
  ontvanger: 'Huurder',
  cc: '',
  bcc: '',
  trigger: {
    soort: 'handmatig_gestart',
    beschrijving: 'Handmatig',
    automatischVersturen: false,
    conceptKlaarzetten: true,
  },
  verzendwijze: 'handmatig',
  onderwerp: 'Contract voor {{naam}}',
  aanhef: '',
  introductie: '',
  hoofdtekst: 'Beste {naam},\n\nUw {soort} op {datum}. Het tarief is {tarief}.',
  callToActionTekst: '',
  secundaireTekst: '',
  slottekst: '',
  ondertekening: '',
  knoppen: [],
};

test('de contractbrief vult naam, datum, soort en tarief', () => {
  assert.equal(tariefTekst('490.00'), '€\u00a0490,00');
  assert.equal(tariefTekst(''), 'nog niet ingevuld');
  assert.equal(contractTemplateVan([
    { id: 'afwijzing', naam: 'Afwijzing' },
    { id: 'contract_begeleiding', naam: 'Contract meesturen' },
  ])?.id, 'contract_begeleiding');
  const brief = stelContractbriefOp({
    naam: 'Nick Hoevenaars',
    soortLabel: 'Expositie',
    start: '2027-05-15',
    eind: '2027-05-16',
    tarief: '490.00',
    template,
  });
  assert.equal(brief.onderwerp, 'Contract voor Nick Hoevenaars');
  assert.match(brief.tekst, /Beste Nick Hoevenaars/);
  assert.match(brief.tekst, /Expositie/);
  assert.match(brief.tekst, /15 mei 2027 – 16 mei 2027/);
  assert.match(brief.tekst, /€\u00a0490,00/);
  assert.equal(/\{[a-z_]+\}/.test(brief.tekst), false);
  assert.equal(vulPlaatsHouders('{{onbekend}} en {onbekend}', { naam: 'A' }), '{{onbekend}} en {onbekend}');
});

test('een complete contractbrief krijgt geen tweede aanhef', () => {
  const brief = stelContractbriefOp({
    naam: 'Nick Hoevenaars',
    soortLabel: 'Expositie',
    start: '2027-05-15',
    eind: '2027-05-15',
    tarief: '',
    template: null,
  });
  const concept = stelMailconceptSamen({
    ontvanger: 'nick@voorbeeld.nl',
    naam: 'Nick Hoevenaars',
    template: null,
    onderwerp: brief.onderwerp,
    inhoud: brief.tekst,
    briefAlCompleet: true,
  });
  assert.equal('fout' in concept, false);
  if ('fout' in concept) return;
  assert.equal(concept.text.match(/Beste Nick/g)?.length, 1);
  assert.match(concept.text, /nog niet ingevuld/);
  assert.match(concept.text, /15 mei 2027/);
});

test('een testmail koppelt de boeking niet aan de checklist', () => {
  const dossier = { soort: 'aanvraag' as const, id: '12', ontvanger: 'a@b.c', naam: 'A', boekingId: '44' };
  assert.equal(boekingIdVoorLog(dossier, 'test'), null);
  assert.equal(boekingIdVoorLog(dossier, 'uit'), null);
  assert.equal(boekingIdVoorLog(dossier, 'aan'), '44');
  assert.equal(boekingIdVoorLog({ ...dossier, soort: 'boeking', id: '44' }, 'test'), '44');
});
