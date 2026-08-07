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
  adres: 'Voorbeeldstraat 12, 1234 AB Voorbeeldstad',
  telefoon: '0612345678',
  toelichting: 'Ceremonie van 14 tot 16 uur.',
  website: '',
  eerderGeexposeerd: '',
  medeExposanten: '',
  akkoordVoorwaarden: '',
  negeerWaarschuwing: '',
};

describe('valideer — happy path', () => {
  test('een complete aanvraag levert geen fouten op', () => {
    assert.deepEqual(valideer(geldig), {});
  });

  test('toelichting is optioneel', () => {
    assert.deepEqual(valideer({ ...geldig, toelichting: '' }), {});
  });
});

describe('valideer — soorten (nu 4, was 5)', () => {
  test('alle vier geldige soorten worden geaccepteerd', () => {
    for (const soort of ['expositie', 'bruiloft', 'concert', 'diverse']) {
      const invoer = soort === 'expositie'
        ? { ...geldig, soort, personen: '', akkoordVoorwaarden: 'ja' }
        : { ...geldig, soort };
      assert.equal(valideer(invoer).soort, undefined, `soort "${soort}" zou geldig moeten zijn`);
    }
  });

  test('de oude waarden "viering" en "anders" zijn niet meer geldig', () => {
    assert.ok(valideer({ ...geldig, soort: 'viering' }).soort);
    assert.ok(valideer({ ...geldig, soort: 'anders' }).soort);
  });

  test('lege keuze wordt afgekeurd', () => {
    assert.ok(valideer({ ...geldig, soort: '' }).soort);
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
});

describe('valideer — datumTot (periode, blijft optioneel)', () => {
  test('leeg blijven mag — eendaagse aanvraag', () => {
    assert.equal(valideer({ ...geldig, datumTot: '' }).datumTot, undefined);
  });

  test('een geldige periode wordt geaccepteerd', () => {
    assert.equal(
      valideer({ ...geldig, datum: overmorgen(), datumTot: overDrieDagen() }).datumTot,
      undefined
    );
  });

  test('een datumTot vóór de startdatum wordt afgekeurd', () => {
    assert.ok(valideer({ ...geldig, datum: overDrieDagen(), datumTot: overmorgen() }).datumTot);
  });
});

describe('valideer — personen (verplicht, behalve bij expositie)', () => {
  test('leeg wordt afgekeurd bij bruiloft', () => {
    assert.ok(valideer({ ...geldig, soort: 'bruiloft', personen: '' }).personen);
  });

  test('leeg mag bij expositie', () => {
    assert.equal(
      valideer({ ...geldig, soort: 'expositie', personen: '', akkoordVoorwaarden: 'ja' }).personen,
      undefined
    );
  });

  test('nul wordt afgekeurd', () => {
    assert.ok(valideer({ ...geldig, personen: '0' }).personen);
  });

  test('boven de bovengrens wordt afgekeurd', () => {
    assert.ok(valideer({ ...geldig, personen: '501' }).personen);
  });

  test('de grenswaarden zelf zijn geldig', () => {
    assert.equal(valideer({ ...geldig, personen: '1' }).personen, undefined);
    assert.equal(valideer({ ...geldig, personen: '500' }).personen, undefined);
  });
});

describe('valideer — naam, e-mail, adres', () => {
  test('lege naam wordt afgekeurd', () => {
    assert.ok(valideer({ ...geldig, naam: '' }).naam);
  });

  test('leeg e-mailadres wordt afgekeurd', () => {
    assert.ok(valideer({ ...geldig, email: '' }).email);
  });

  for (const fout of ['kim', 'kim@', '@voorbeeld.nl', 'kim@voorbeeld', 'kim @voorbeeld.nl']) {
    test(`e-mail "${fout}" wordt afgekeurd`, () => {
      assert.ok(valideer({ ...geldig, email: fout }).email);
    });
  }

  test('leeg adres wordt afgekeurd', () => {
    assert.ok(valideer({ ...geldig, adres: '' }).adres);
  });
});

describe('valideer — telefoon (nu verplicht, was optioneel)', () => {
  test('leeg telefoonnummer wordt afgekeurd', () => {
    assert.ok(valideer({ ...geldig, telefoon: '' }).telefoon);
  });

  test('te kort wordt afgekeurd', () => {
    assert.ok(valideer({ ...geldig, telefoon: '0612' }).telefoon);
  });

  test('een geldig nummer met spaties en streepjes wordt geaccepteerd', () => {
    assert.equal(valideer({ ...geldig, telefoon: '06-12 34 56 78' }).telefoon, undefined);
  });
});

describe('valideer — expositie-specifieke velden', () => {
  test('consent verplicht bij expositie', () => {
    assert.ok(valideer({ ...geldig, soort: 'expositie', akkoordVoorwaarden: '' }).akkoordVoorwaarden);
  });

  test('consent NIET verplicht bij bruiloft', () => {
    assert.equal(valideer({ ...geldig, soort: 'bruiloft', akkoordVoorwaarden: '' }).akkoordVoorwaarden, undefined);
  });

  test('mede-exposanten mag leeg blijven', () => {
    assert.equal(
      valideer({ ...geldig, soort: 'expositie', personen: '', akkoordVoorwaarden: 'ja', medeExposanten: '' }).medeExposanten,
      undefined
    );
  });
});

describe('valideer — meerdere fouten tegelijk', () => {
  test('een leeg formulier levert een fout per verplicht veld op (incl. telefoon)', () => {
    const fouten = valideer(LEGE_AANVRAAG);
    assert.deepEqual(
      Object.keys(fouten).sort(),
      ['adres', 'datum', 'email', 'naam', 'personen', 'soort', 'telefoon']
    );
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
