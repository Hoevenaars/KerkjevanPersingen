import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  beoordeelContractstatus,
  beoordeelHandmatigeBetaling,
  beoordeelInhoud,
  beoordeelVerhuurtype,
  beoordeelVerplaatsing,
  contractBeeld,
  leesTermijnkeuze,
  overlapNummers,
} from '../src/platform/handmatig-beheer.ts';

describe('handmatige betaling', () => {
  test('aanbetaling ontvangen zet alleen de open aanbetaling, zonder een bedrag te verzinnen', () => {
    const uit = beoordeelHandmatigeBetaling({
      keuze: 'aanbetaling',
      regels: [
        { soort: 'aanbetaling', status: 'open' },
        { soort: 'restant', status: 'open' },
      ],
    });
    assert.equal(uit.ok, true);
    if (uit.ok) {
      assert.deepEqual(uit.markeer, ['aanbetaling']);
      assert.equal(uit.zetVlag, true);
      assert.match(uit.tekst, /niets van de bank/);
      assert.match(uit.tekst, /geen mail/);
    }
  });

  test('volledige betaling zet aanbetaling en restant', () => {
    const uit = beoordeelHandmatigeBetaling({
      keuze: 'volledig',
      regels: [
        { soort: 'aanbetaling', status: 'open' },
        { soort: 'restant', status: 'open' },
        { soort: 'historisch', status: 'open' },
      ],
    });
    assert.equal(uit.ok, true);
    if (uit.ok) assert.deepEqual(uit.markeer, ['aanbetaling', 'restant']);
  });

  test('een ontbrekende restantregel wordt niet aangemaakt', () => {
    const uit = beoordeelHandmatigeBetaling({
      keuze: 'volledig',
      regels: [{ soort: 'aanbetaling', status: 'open' }],
    });
    assert.equal(uit.ok, true);
    if (uit.ok) {
      assert.deepEqual(uit.markeer, ['aanbetaling']);
      assert.match(uit.tekst, /geen restantregel/);
    }
  });

  test('een betaling die al binnen is schrijft niets', () => {
    const uit = beoordeelHandmatigeBetaling({
      keuze: 'aanbetaling',
      regels: [{ soort: 'aanbetaling', status: 'ontvangen' }],
    });
    assert.equal(uit.ok, false);
    if (!uit.ok) assert.match(uit.melding, /al op ontvangen/);
  });

  test('zonder betaalregel gebeurt er niets', () => {
    const uit = beoordeelHandmatigeBetaling({ keuze: 'volledig', regels: [] });
    assert.equal(uit.ok, false);
    if (!uit.ok) assert.match(uit.melding, /geen bedrag verzonnen/);
  });
});

describe('verplaatsen en type', () => {
  test('een expositie verplaatst alleen naar een heel weekend zonder overlap', () => {
    const uit = beoordeelVerplaatsing({
      status: 'definitief',
      verhuurtype: 'expositie',
      start: '2027-05-08',
      eind: '2027-05-09',
      huidigStart: '2027-07-10',
      huidigEind: '2027-07-11',
      overlapNummers: [],
    });
    assert.deepEqual(uit, { ok: true, start: '2027-05-08', eind: '2027-05-09' });
    const dag = beoordeelVerplaatsing({
      status: 'definitief',
      verhuurtype: 'expositie',
      start: '2027-05-08',
      eind: '2027-05-08',
      huidigStart: '2027-07-10',
      huidigEind: '2027-07-11',
      overlapNummers: [],
    });
    assert.equal(dag.ok, false);
    const bezet = beoordeelVerplaatsing({
      status: 'migratie_vastgelegd',
      verhuurtype: 'bruiloft',
      start: '2027-05-03',
      eind: '2027-05-05',
      huidigStart: '2027-04-01',
      huidigEind: '2027-04-02',
      overlapNummers: ['BKG-1'],
    });
    assert.equal(bezet.ok, false);
    if (!bezet.ok) assert.match(bezet.melding, /BKG-1/);
  });

  test('zonder verhuurtype wordt niet verplaatst en een leeg type kan gekozen worden', () => {
    const uit = beoordeelVerplaatsing({
      status: 'definitief',
      verhuurtype: '',
      start: '2027-05-03',
      eind: '2027-05-05',
      huidigStart: '2027-04-01',
      huidigEind: '2027-04-02',
      overlapNummers: [],
    });
    assert.equal(uit.ok, false);
    if (!uit.ok) assert.match(uit.melding, /verhuurtype/);
    assert.equal(beoordeelVerhuurtype('', 'expositie').ok, true);
    assert.equal(beoordeelVerhuurtype('expositie', 'expositie').ok, false);
    assert.equal(beoordeelVerhuurtype('', 'onbekend').ok, false);
  });

  test('overlap telt een geannuleerde boeking niet mee', () => {
    assert.deepEqual(overlapNummers({
      boekingId: '67',
      start: '2027-07-10',
      eind: '2027-07-11',
      boekingen: [
        { id: '70', status: 'definitief', start: '2027-07-10', eind: '2027-07-11', nummer: 'BKG-70' },
        { id: '76', status: 'geannuleerd', start: '2027-07-10', eind: '2027-07-11', nummer: 'BKG-76' },
      ],
    }), ['BKG-70']);
  });
});

describe('inhoud en contract', () => {
  test('goedkeuren bewaart de status en publiceert niet', () => {
    const uit = beoordeelInhoud({ besluit: 'goedkeuren', reden: '', heeftActiviteit: true, status: 'ingediend' });
    assert.equal(uit.ok, true);
    if (uit.ok) assert.equal(uit.status, 'goedgekeurd');
    const geen = beoordeelInhoud({ besluit: 'goedkeuren', reden: '', heeftActiviteit: false, status: '' });
    assert.equal(geen.ok, false);
    if (!geen.ok) assert.match(geen.melding, /site is niet gewijzigd/);
    const af = beoordeelInhoud({ besluit: 'afkeuren', reden: '  ', heeftActiviteit: true, status: 'ingediend' });
    assert.equal(af.ok, false);
  });

  test('contractstatus volgt een bestand en anders de handmatige keuze', () => {
    assert.equal(contractBeeld(['getekend_contract']).volgtBestand, true);
    assert.deepEqual(contractBeeld(['getekend_contract']).keuzes, []);
    assert.equal(contractBeeld([]).label, 'Geen contract');
    assert.equal(beoordeelContractstatus(contractBeeld([]), 'getekend').ok, true);
    assert.equal(beoordeelContractstatus(contractBeeld(['contract']), 'geen').ok, false);
    assert.equal(beoordeelContractstatus(contractBeeld(['contract']), 'getekend').ok, true);
  });
});

describe('annuleren', () => {
  test('open termijnen laten staan of afboeken, een andere keuze niet', () => {
    assert.equal(leesTermijnkeuze(''), 'laten');
    assert.equal(leesTermijnkeuze('laten'), 'laten');
    assert.equal(leesTermijnkeuze('afboeken'), 'afboeken');
    assert.equal(leesTermijnkeuze('terugstorten'), null);
  });
});
