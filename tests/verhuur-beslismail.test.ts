import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { bestuurMail, bestuurMailTekst, type Aanvraag } from '../src/lib/aanvraag.ts';
import { KERKJE_MAIL_MERK } from '../src/lib/kerkje-mail.ts';
import { beoordeelVerhuuraanvraag } from '../src/platform/verhuur-beoordeling.ts';
import { beoordeelAanvraag, type FaseAanvraag, type FaseWereld } from '../src/platform/aanvraag-fase.ts';

const aanvraag: Aanvraag = {
  naam: 'Karin Janssen', email: 'karin@example.test', telefoon: '0612345678',
  adres: 'Dorpsstraat 1', straat: '', huisnummer: '', toevoeging: '', postcode: '', woonplaats: '',
  soort: 'expositie', datum: '2027-07-10', datumTot: '2027-07-12', personen: '30',
  toelichting: 'Groepstentoonstelling', website: '', eerderGeexposeerd: 'ja',
  medeExposanten: '["Noor van Dijk"]', akkoordVoorwaarden: 'ja', negeerWaarschuwing: '',
};
const canoniekeAanvraag = {
  id: 17, status: 'nieuw', naam: aanvraag.naam, email: aanvraag.email,
  start: aanvraag.datum, eind: aanvraag.datumTot, verhuurtype: aanvraag.soort,
  medeExposanten: aanvraag.medeExposanten,
};
const links = {
  jaUrl: 'https://kerkjepersingen.nl/bestuur/besluit/?token=test&besluit=ja',
  neeUrl: 'https://kerkjepersingen.nl/bestuur/besluit/?token=test&besluit=nee',
};

describe('bestuursmail met een actuele beslissing', () => {
  test('de bestaande aanroep zonder opties houdt dezelfde gegevens en krijgt geen onbedoelde beslisknop', () => {
    const uit = bestuurMail(aanvraag);
    assert.match(uit.html, /Huuraanvraag/);
    assert.match(uit.html, /Karin Janssen/);
    assert.match(uit.text, /Noor van Dijk/);
    assert.match(uit.text, /Beantwoorden gaat rechtstreeks naar de aanvrager/);
    assert.equal(uit.html.split(KERKJE_MAIL_MERK).length - 1, 1);
    assert.equal(uit.html.includes('Ja, akkoord'), false);
    assert.equal(uit.text.includes('huurprijs nog vaststellen'), false);
    assert.equal(bestuurMailTekst(aanvraag), uit.html);
  });

  test('lopende aanvraag en 18-maandenwaarschuwing staan in HTML én tekst vóór de ja/nee-keuze', () => {
    const beoordeling = beoordeelVerhuuraanvraag({
      aanvraag: canoniekeAanvraag, vandaag: '2026-11-25', historieCompleet: true,
      tarief: { prijstype: 'vast', bedrag: 420.50 },
      aanvragen: [{ ...canoniekeAanvraag, id: 18, naam: 'Andere exposant', binnengekomenOp: '2026-11-24T10:00:00Z' }],
      historie: [{
        id: 33, expositieId: 'oud-33', bron: 'boekingen', referentie: 'KVP-33',
        start: '2026-02-01', eind: '2026-02-03', status: 'afgerond',
        deelnemers: [{ naam: 'Noor van Dijk' }],
      }],
    });
    const uit = bestuurMail(aanvraag, { ...links, beoordeling });
    for (const inhoud of [uit.html, uit.text]) {
      assert.match(inhoud, /Let op: er loopt al een aanvraag voor deze periode/);
      assert.match(inhoud, /Andere exposant/);
      assert.match(inhoud, /18-maandenregeling/);
      assert.match(inhoud, /Mogelijke overeenkomst: Noor van Dijk/);
      assert.match(inhoud, /Het bestuur mag afwijken/);
      assert.match(inhoud, /KVP-33/);
      assert.match(inhoud, /2027-08-03/);
      assert.match(inhoud, /inhoudelijke akkoord/);
      assert.match(inhoud, /geen voorrang/);
      assert.match(inhoud, /Alleen bevestigen legt het besluit vast/);
      assert.ok(inhoud.indexOf('18-maandenregeling') < inhoud.indexOf('Ja, akkoord'));
    }
    assert.match(uit.html, /href="https:\/\/kerkjepersingen\.nl\/bestuur\/besluit\/\?token=test&amp;besluit=ja"/);
    assert.match(uit.html, /href="https:\/\/kerkjepersingen\.nl\/bestuur\/besluit\/\?token=test&amp;besluit=nee"/);
    assert.ok(uit.text.includes(`Ja, akkoord: ${links.jaUrl}`));
    assert.ok(uit.text.includes(`Nee, afwijzen: ${links.neeUrl}`));
    assert.equal(uit.html.split(KERKJE_MAIL_MERK).length - 1, 1);
  });

  test('diverse en concert vragen een definitieve prijs zonder een vanafbedrag als afspraak te presenteren', () => {
    for (const soort of ['diverse', 'concert'] as const) {
      const beoordeling = beoordeelVerhuuraanvraag({
        aanvraag: { ...canoniekeAanvraag, verhuurtype: soort }, vandaag: '2026-11-25',
        tarief: { prijstype: 'vanaf', bedrag: 75 },
      });
      const uit = bestuurMail({ ...aanvraag, soort }, { ...links, beoordeling });
      for (const inhoud of [uit.html, uit.text]) {
        assert.match(inhoud, /huurprijs nog vaststellen/);
        assert.match(inhoud, /Indicatie vanaf/);
        assert.match(inhoud, /75,00/);
        assert.match(inhoud, /geen definitieve huurprijs/);
        assert.match(inhoud, /op de bevestigingspagina/);
      }
    }
  });

  test('onbekende historische dekking blijft expliciet en conflictgegevens zijn veilig ge-escaped', () => {
    const onveilig = '<img src=x onerror="alert(1)">';
    const beoordeling = beoordeelVerhuuraanvraag({
      aanvraag: canoniekeAanvraag, vandaag: '2026-11-25',
      tarief: { prijstype: 'vast', bedrag: 420 },
      aanvragen: [{ ...canoniekeAanvraag, id: 18, naam: onveilig }],
    });
    const uit = bestuurMail({ ...aanvraag, toelichting: '<script>test</script>' }, { ...links, beoordeling });
    assert.match(uit.text, /expositiehistorie is niet als compleet bevestigd/);
    assert.match(uit.html, /expositiehistorie is niet als compleet bevestigd/);
    assert.equal(uit.html.includes(onveilig), false);
    assert.equal(uit.html.includes('<script>'), false);
    assert.ok(uit.html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
    assert.ok(uit.text.includes(onveilig));
  });

  test('ongeldige of half aangeleverde beslislinks worden niet als beslismail opgebouwd', () => {
    for (const jaUrl of ['javascript:alert(1)', 'http://example.test/ja', 'https://naam:wachtwoord@example.test/ja', 'geen-url']) {
      assert.throws(() => bestuurMail(aanvraag, { ...links, jaUrl }), /twee geldige beslislinks/);
    }
    assert.throws(() => bestuurMail(aanvraag, { jaUrl: links.jaUrl }), /twee geldige beslislinks/);
    assert.throws(() => bestuurMail(aanvraag, { neeUrl: links.neeUrl }), /twee geldige beslislinks/);
    assert.match(bestuurMail(aanvraag, { jaUrl: 'http://localhost:4321/ja', neeUrl: 'http://localhost:4321/nee' }).text, /http:\/\/localhost:4321\/ja/);
  });
});

const leeg: FaseWereld = { aanvragen: [], boekingen: [], documenten: [], mails: [], betalingen: [], blokkades: [], activiteiten: [] };
const faseAanvraag: FaseAanvraag = { id: '17', status: 'in_behandeling', naam: aanvraag.naam, start: aanvraag.datum, eind: aanvraag.datumTot };

describe('fase van expliciet goedgekeurde aanvragen zonder reservering', () => {
  test('oude dossiers houden hun afleiding; een expliciet Ja kan zonder boeking in behandeling wachten', () => {
    const oud = beoordeelAanvraag(faseAanvraag, leeg);
    assert.equal(oud.fase, 'nieuw');
    assert.equal(oud.volgendeActie, 'Goedkeuren en in behandeling nemen');
    const nieuw = beoordeelAanvraag({ ...faseAanvraag, bestuursBesluit: 'ja', procesStatus: 'wacht_op_beschikbaarheid' }, leeg);
    assert.equal(nieuw.fase, 'in_behandeling');
    assert.equal(nieuw.geschikt, true);
    assert.equal(nieuw.boeking, null);
    assert.equal(nieuw.volgendeActie, 'Wachten op beschikbaarheid');
  });

  test('actueel conflict houdt inhoudelijk akkoord in behandeling en wijst geen periode toe', () => {
    const uit = beoordeelAanvraag({ ...faseAanvraag, bestuursBesluit: 'ja' }, {
      ...leeg, aanvragen: [{ ...faseAanvraag, id: '18', naam: 'Andere exposant' }],
    });
    assert.equal(uit.fase, 'in_behandeling');
    assert.equal(uit.beschikbaarheid.uitkomst, 'aanvraag');
    assert.equal(uit.volgendeActie, 'Wachten op beschikbaarheid');
    assert.equal(uit.boeking, null);
  });

  test('prijs, onvolledige periode en uitvoeringsblokkade krijgen hun eigen vervolgstap', () => {
    const gevallen: { extra: Partial<FaseAanvraag>; actie: string }[] = [
      { extra: { procesStatus: 'wacht_op_prijs' }, actie: 'Huurprijs vaststellen' },
      { extra: { start: '', eind: '' }, actie: 'Periode ontbreekt' },
      { extra: { blokkadeReden: 'Bestandsopslag niet beschikbaar' }, actie: 'Uitzondering controleren' },
      { extra: {}, actie: 'Reservering voorbereiden' },
    ];
    for (const geval of gevallen) {
      const uit = beoordeelAanvraag({ ...faseAanvraag, bestuursBesluit: 'ja', ...geval.extra }, leeg);
      assert.equal(uit.fase, 'in_behandeling');
      assert.equal(uit.volgendeActie, geval.actie);
    }
  });

  test('afwijzing en definitieve boeking blijven leidend bij achtergebleven procesvelden', () => {
    const afgewezen = beoordeelAanvraag({ ...faseAanvraag, status: 'afgewezen', bestuursBesluit: 'ja', procesStatus: 'wacht_op_beschikbaarheid' }, leeg);
    assert.equal(afgewezen.fase, 'afgewezen');
    const gereed = beoordeelAanvraag({ ...faseAanvraag, boekingId: 'b-17', bestuursBesluit: 'ja', procesStatus: 'wacht_op_beschikbaarheid' }, {
      ...leeg, boekingen: [{
        id: 'b-17', nummer: 'KVP-17', status: 'definitief', start: aanvraag.datum, eind: aanvraag.datumTot,
        titel: 'Expositie', huurder: aanvraag.naam, aanbetalingBinnen: true,
      }],
    });
    assert.equal(gereed.fase, 'gereed');
    assert.equal(gereed.volgendeActie, 'Geen actie');
  });
});
