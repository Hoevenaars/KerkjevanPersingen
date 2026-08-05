import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { valideer, leesFormulier, teVaak, LEGE_AANVRAAG, type Aanvraag } from '../src/lib/validatie.ts';

function overmorgen(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d.toISOString().split('T')[0];
}

function overDrieDagen(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toISOString().split('T')[0];
}

function eergisteren(): string {
  const d = new Date();
  d.setDate(d.getDate() - 2);
  return d.toISOString().split('T')[0];
}

const geldig: Aanvraag = {
  datum: overmorgen(),
  datumTot: '',
  soort: 'bruiloft',
  personen: '80',
  naam: 'Kim Jansen',
  email: 'kim@voorbeeld.nl',
  telefoon: '0612345678',
  toelichting: 'Ceremonie van 14 tot 16 uur.',
};

describe('valideer — happy path', () => {
  test('een complete aanvraag levert geen fouten op', () => {
    assert.deepEqual(valideer(geldig), {});
  });

  test('telefoon en toelichting zijn optioneel', () => {
    assert.deepEqual(valideer({ ...geldig, telefoon: '', toelichting: '' }), {});
  });
});

describe('valideer — datum', () => {
  test('lege datum wordt afgekeurd', () => {
    assert.ok(valideer({ ...geldig, datum: '' }).datum);
  });

  test('datum in het verleden wordt afgekeurd', () => {
    assert.ok(valideer({ ...geldig, datum: eergisteren() }).datum);
  });

  test('onzin in het datumveld wordt afgekeurd', () => {
    assert.ok(valideer({ ...geldig, datum: 'volgende week' }).datum);
  });

  test('vandaag mag nog', () => {
    const vandaag = new Date().toISOString().split('T')[0];
    assert.equal(valideer({ ...geldig, datum: vandaag }).datum, undefined);
  });

  test('ver in de toekomst mag — het bestuur plant tot in 2028', () => {
    assert.equal(valideer({ ...geldig, datum: '2028-06-17' }).datum, undefined);
  });
});

describe('valideer — datumTot (periode)', () => {
  test('leeg blijven mag — eendaagse aanvraag', () => {
    assert.equal(valideer({ ...geldig, datumTot: '' }).datumTot, undefined);
  });

  test('een geldige periode (tot na datum) wordt geaccepteerd', () => {
    assert.equal(
      valideer({ ...geldig, datum: overmorgen(), datumTot: overDrieDagen() }).datumTot,
      undefined
    );
  });

  test('dezelfde dag als datum wordt geaccepteerd (eendaags, expliciet ingevuld)', () => {
    assert.equal(valideer({ ...geldig, datumTot: geldig.datum }).datumTot, undefined);
  });

  test('een datumTot vóór de startdatum wordt afgekeurd', () => {
    assert.ok(valideer({ ...geldig, datum: overDrieDagen(), datumTot: overmorgen() }).datumTot);
  });

  test('onzin in datumTot wordt afgekeurd', () => {
    assert.ok(valideer({ ...geldig, datumTot: 'ergens volgende maand' }).datumTot);
  });
});

describe('valideer — soort', () => {
  test('lege keuze wordt afgekeurd', () => {
    assert.ok(valideer({ ...geldig, soort: '' }).soort);
  });

  test('een waarde buiten de lijst wordt afgekeurd', () => {
    assert.ok(valideer({ ...geldig, soort: 'braderie' }).soort);
  });
});

describe('valideer — personen', () => {
  test('leeg wordt afgekeurd', () => {
    assert.ok(valideer({ ...geldig, personen: '' }).personen);
  });

  test('nul wordt afgekeurd', () => {
    assert.ok(valideer({ ...geldig, personen: '0' }).personen);
  });

  test('boven de bovengrens wordt afgekeurd', () => {
    assert.ok(valideer({ ...geldig, personen: '501' }).personen);
  });

  test('geen getal wordt afgekeurd', () => {
    assert.ok(valideer({ ...geldig, personen: 'veel' }).personen);
  });

  test('een half persoon wordt afgekeurd', () => {
    assert.ok(valideer({ ...geldig, personen: '12,5' }).personen);
  });

  test('de grenswaarden zelf zijn geldig', () => {
    assert.equal(valideer({ ...geldig, personen: '1' }).personen, undefined);
    assert.equal(valideer({ ...geldig, personen: '500' }).personen, undefined);
  });
});

describe('valideer — e-mail', () => {
  test('leeg wordt afgekeurd', () => {
    assert.ok(valideer({ ...geldig, email: '' }).email);
  });

  for (const fout of ['kim', 'kim@', '@voorbeeld.nl', 'kim@voorbeeld', 'kim @voorbeeld.nl']) {
    test(`"${fout}" wordt afgekeurd`, () => {
      assert.ok(valideer({ ...geldig, email: fout }).email);
    });
  }

  test('een adres met plusteken wordt geaccepteerd', () => {
    assert.equal(valideer({ ...geldig, email: 'kim+kerk@voorbeeld.nl' }).email, undefined);
  });
});

describe('valideer — telefoon', () => {
  test('te kort wordt afgekeurd', () => {
    assert.ok(valideer({ ...geldig, telefoon: '0612' }).telefoon);
  });

  test('een nummer met spaties en streepjes wordt geaccepteerd', () => {
    assert.equal(valideer({ ...geldig, telefoon: '06-12 34 56 78' }).telefoon, undefined);
  });
});

describe('valideer — meerdere fouten tegelijk', () => {
  test('een leeg formulier levert een fout per verplicht veld op', () => {
    const fouten = valideer(LEGE_AANVRAAG);
    assert.deepEqual(Object.keys(fouten).sort(), ['datum', 'email', 'naam', 'personen', 'soort']);
  });
});

describe('leesFormulier', () => {
  test('spaties rondom invoer worden weggehaald', () => {
    const data = new FormData();
    data.set('naam', '  Kim Jansen  ');
    data.set('email', ' kim@voorbeeld.nl ');
    const gelezen = leesFormulier(data);
    assert.equal(gelezen.naam, 'Kim Jansen');
    assert.equal(gelezen.email, 'kim@voorbeeld.nl');
  });

  test('ontbrekende velden worden lege tekst, geen undefined', () => {
    const gelezen = leesFormulier(new FormData());
    assert.deepEqual(gelezen, LEGE_AANVRAAG);
  });

  test('datumTot wordt correct uitgelezen', () => {
    const data = new FormData();
    data.set('datum', '2027-06-14');
    data.set('datumTot', '2027-06-15');
    const gelezen = leesFormulier(data);
    assert.equal(gelezen.datumTot, '2027-06-15');
  });
});

describe('teVaak', () => {
  test('laat vijf pogingen door en blokkeert de zesde', () => {
    const ip = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      assert.equal(teVaak(ip), false, `poging ${i + 1} zou nog moeten mogen`);
    }
    assert.equal(teVaak(ip), true);
  });

  test('houdt bezoekers uit elkaar', () => {
    const a = `test-a-${Math.random()}`;
    const b = `test-b-${Math.random()}`;
    for (let i = 0; i < 6; i++) teVaak(a);
    assert.equal(teVaak(b), false);
  });
});
