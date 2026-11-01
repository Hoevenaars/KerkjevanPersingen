import assert from 'node:assert/strict';
import test from 'node:test';
import { normaliseerPostcode, stelAdresSamen, toonAdres } from '../src/platform/adres.ts';
import { labelAkkoordVoorwaarden } from '../src/platform/aanvraag-weergave.ts';
import { aanvraagFotoPad, mimeUitBytes, valideerAanvraagFoto } from '../src/platform/aanvraag-foto.ts';
import { INITIELE_TARIEVEN, kiesTarief } from '../src/platform/finance.ts';
import { medeExposantenFout, parseMedeExposanten, serialiseerMedeExposanten, toonMedeExposanten } from '../src/platform/mede-exposanten.ts';
import { tariefIndicatie } from '../src/platform/tarief-indicatie.ts';
import { SOORTEN, leesFormulier, valideer, type Aanvraag } from '../src/lib/validatie.ts';
import { uniekeOntvangers } from '../src/lib/aanvraag-ontvangers.ts';
import { leesSupabaseBeheer, type SupabaseLeesClient } from '../src/platform/beheer-supabase-lees.ts';

test('diverse blijft de sleutel en heet zichtbaar Overige', () => {
  const soort = SOORTEN.find((item) => item.waarde === 'diverse');
  assert.equal(soort?.waarde, 'diverse');
  assert.equal(soort?.label, 'Overige');
});

test('adres wordt samengesteld en een Nederlandse postcode genormaliseerd', () => {
  assert.equal(normaliseerPostcode('6575ja'), '6575 JA');
  assert.equal(normaliseerPostcode('1234 AB'), '1234 AB');
  assert.equal(normaliseerPostcode('SW1A 1AA'), 'SW1A 1AA');
  assert.equal(stelAdresSamen({
    straat: 'Persingensestraat',
    huisnummer: '13',
    toevoeging: '',
    postcode: '6575 JA',
    woonplaats: 'Persingen',
  }), 'Persingensestraat 13, 6575 JA Persingen');
  assert.equal(stelAdresSamen({
    straat: 'Persingensestraat',
    huisnummer: '13',
    toevoeging: 'A',
    postcode: '6575ja',
    woonplaats: 'Persingen',
  }), 'Persingensestraat 13 A, 6575 JA Persingen');
  assert.equal(toonAdres({ adres: 'Oude straat 1, Dorp' }), 'Oude straat 1, Dorp');
});

test('het formulier bewaart het samengestelde adres naast de onderdelen', () => {
  const data = new FormData();
  data.set('straat', 'Persingensestraat');
  data.set('huisnummer', '13');
  data.set('toevoeging', 'A');
  data.set('postcode', '6575JA');
  data.set('woonplaats', 'Persingen');
  data.set('soort', 'bruiloft');
  const gelezen = leesFormulier(data);
  assert.equal(gelezen.postcode, '6575 JA');
  assert.equal(gelezen.adres, 'Persingensestraat 13 A, 6575 JA Persingen');
});

test('mede-exposanten blijven op vier en oude tekst blijft leesbaar', () => {
  assert.deepEqual(parseMedeExposanten(''), []);
  assert.deepEqual(parseMedeExposanten('Anna'), ['Anna']);
  assert.equal(serialiseerMedeExposanten([' Anna ', '', 'Bo']), '["Anna","Bo"]');
  assert.equal(toonMedeExposanten('["Anna","Bo"]'), 'Anna, Bo');
  assert.equal(toonMedeExposanten('Piet en Marie'), 'Piet en Marie');
  assert.equal(medeExposantenFout(serialiseerMedeExposanten(['1', '2', '3', '4'])), null);
  assert.equal(medeExposantenFout(serialiseerMedeExposanten(['1', '2', '3', '4', '5'])), 'Je kunt maximaal 4 mede-exposanten toevoegen.');
  assert.equal(medeExposantenFout('[geen json'), 'De mede-exposanten zijn niet leesbaar.');
  assert.equal(medeExposantenFout('a\nb\nc\nd\ne'), 'Je kunt maximaal 4 mede-exposanten toevoegen.');
});

test('tariefindicatie komt uit de centrale tariefkeuze', () => {
  const op = '2026-11-01';
  assert.equal(tariefIndicatie(kiesTarief(INITIELE_TARIEVEN, 'expositie', op)), '€490');
  assert.equal(tariefIndicatie(kiesTarief(INITIELE_TARIEVEN, 'bruiloft', op)), '€550');
  assert.equal(tariefIndicatie(kiesTarief(INITIELE_TARIEVEN, 'concert', op)), 'op aanvraag');
  assert.equal(tariefIndicatie(kiesTarief(INITIELE_TARIEVEN, 'diverse', op)), 'vanaf €250');
  assert.equal(tariefIndicatie(kiesTarief(INITIELE_TARIEVEN, 'expositie', '2029-06-01')), '€525');
  assert.equal(tariefIndicatie(kiesTarief(INITIELE_TARIEVEN, 'diverse', '2029-06-01')), 'vanaf €275');
  assert.equal(tariefIndicatie(null), '');
});

test('akkoord is ja, nee of onbekend zonder verzonnen tijdstip', () => {
  assert.equal(labelAkkoordVoorwaarden('expositie', true), 'Ja');
  assert.equal(labelAkkoordVoorwaarden('expositie', false), 'Nee');
  assert.equal(labelAkkoordVoorwaarden('bruiloft', false), '-');
  assert.equal(labelAkkoordVoorwaarden('expositie', null), '-');
  assert.equal(labelAkkoordVoorwaarden('diverse', undefined), '-');
});

test('extra ontvangers worden ontdubbeld', () => {
  assert.deepEqual(uniekeOntvangers(['Contractbeheer.kvp@gmail.com', ' contractbeheer.kvp@gmail.com ', 'hans@example.test', '']), [
    'contractbeheer.kvp@gmail.com',
    'hans@example.test',
  ]);
});

test('foto’s accepteren alleen echte afbeeldingen op een eigen pad', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(mimeUitBytes(jpeg), 'image/jpeg');
  assert.equal(mimeUitBytes(png), 'image/png');
  assert.equal(valideerAanvraagFoto({ type: 'application/x-msdownload', size: 12, bytes: new Uint8Array([0x4d, 0x5a]) }).ok, false);
  const token = '11111111-1111-1111-1111-111111111111';
  const id = '22222222-2222-2222-2222-222222222222';
  assert.equal(aanvraagFotoPad(4, token, id, 'image/jpeg'), `aanvragen/4/${token}/${id}.jpg`);
  assert.equal(aanvraagFotoPad(4, '../token', id, 'image/jpeg'), '');
});

test('een historische aanvraag zonder nieuwe adresvelden blijft leesbaar', async () => {
  const tabellen: Record<string, Record<string, unknown>[]> = {
    relaties: [],
    relatie_rollen: [],
    boekingen: [],
    betalingen: [],
    interne_activiteiten: [],
    gastbegeleider_toewijzingen: [],
    vrienden: [],
    nieuwsbrieven: [],
    documenten: [],
    communicatie_templates: [],
    instellingen: [],
    publieke_activiteiten: [],
    aanvragen: [{
      id: 3,
      status: 'nieuw',
      naam: 'Oud',
      email: 'oud@example.test',
      telefoon: '0612345678',
      adres: 'Dorpsstraat 1, 6575 JA Persingen',
      verhuurtype_sleutel: 'diverse',
      start_datum: '2026-12-01',
      eind_datum: '2026-12-01',
      aantal_personen: '10',
      toelichting: '',
      binnengekomen_op: '2024-01-01',
      website: '',
      boeking_id: null,
      afwijsreden: '',
      relatie_id: null,
      informatievraag: '',
      akkoord_voorwaarden: false,
      mede_exposanten: 'Piet en Marie',
    }],
    communicatie_jobs: [],
    tarieven: [],
    activiteit_bron: [],
  };
  const client: SupabaseLeesClient = {
    from(tabel: string) {
      return {
        select() {
          if (!(tabel in tabellen)) return Promise.resolve({ data: null, error: { message: `onbekend ${tabel}` } });
          return Promise.resolve({ data: tabellen[tabel], error: null });
        },
      };
    },
  };
  const snapshot = await leesSupabaseBeheer(client, { vandaag: '2026-11-01', testmodus: true });
  assert.equal(snapshot.aanvragen[0]?.adres, 'Dorpsstraat 1, 6575 JA Persingen');
  assert.equal(snapshot.aanvragen[0]?.soort, 'diverse');
  assert.equal(labelAkkoordVoorwaarden(snapshot.aanvragen[0]!.soort, snapshot.aanvragen[0]?.akkoordVoorwaarden), '-');
  assert.equal(toonMedeExposanten(snapshot.aanvragen[0]?.medeExposanten), 'Piet en Marie');
});

test('vijf mede-exposanten worden bij validatie geweigerd', () => {
  const basis = {
    datum: '2099-01-01',
    datumTot: '',
    soort: 'expositie',
    personen: '',
    naam: 'Kim',
    email: 'kim@voorbeeld.nl',
    adres: 'Persingensestraat 13, 6575 JA Persingen',
    straat: 'Persingensestraat',
    huisnummer: '13',
    toevoeging: '',
    postcode: '6575 JA',
    woonplaats: 'Persingen',
    telefoon: '0612345678',
    toelichting: '',
    website: 'https://voorbeeld.nl',
    eerderGeexposeerd: 'nee',
    medeExposanten: '',
    akkoordVoorwaarden: 'ja',
    negeerWaarschuwing: '',
  } satisfies Aanvraag;
  assert.equal(valideer({ ...basis, website: '' }).website, undefined);
  assert.equal(valideer(basis).website, undefined);
  const vijf = valideer({ ...basis, medeExposanten: serialiseerMedeExposanten(['a', 'b', 'c', 'd', 'e']) });
  assert.match(vijf.medeExposanten ?? '', /maximaal 4/);
});
