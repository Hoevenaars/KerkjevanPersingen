import assert from 'node:assert/strict';
import test from 'node:test';
import { actiepuntenKomendeWeken } from '../src/platform/actiepunten.ts';
import { grensVoorActivatie, magJobStarten } from '../src/platform/activatiegrens.ts';
import { loggingNaProvider, tijdlijnVoor } from '../src/platform/communicatie-tijdlijn.ts';
import { stelDocumentOp } from '../src/platform/document-samenstellen.ts';
import { beoordeelPortaalToken, portaalMagPubliceren, resetPortaalLimiet, portaalTeVaak, uploadToegestaan, valideerAanlevering } from '../src/platform/exposant-portaal.ts';
import { planNieuwsbrief } from '../src/platform/nieuwsbrief-keten.ts';
import { leesRelatieInvoer } from '../src/platform/relatie-invoer.ts';
import { planReservelijst } from '../src/platform/reservelijst-keten.ts';
import { ROLVOORSTEL } from '../src/platform/rolvoorstel.ts';
import { rechtVoor } from '../src/platform/rechten.ts';
import { moduleVoorPad, beheerToegang } from '../src/platform/autorisatie.ts';
import { actueleVerzendingen, communicatieStappen, type CommunicatieContext } from '../src/platform/continuiteit.ts';
import {
  GEEN_TESTMAILADRES,
  normaliseerTestmailadres,
  pasTestmodusToe,
  providerPayloadIsTestveilig,
} from '../src/platform/testmail.ts';
import { veiligStatusTekst } from '../src/platform/systeemstatus.ts';
import { STANDAARD_AUTOMATISERINGEN, magAutomatiseringUitvoeren } from '../src/platform/automatisering.ts';
import { verstuurGecontroleerd } from '../src/lib/mail-transport.ts';
import { CONTRACTBEHEER_EMAIL } from '../src/lib/mail-adressen.ts';

const TEST = 'nhoevenaars@gmail.com';

test('testmailadres accepteert één adres en weigert lijsten', () => {
  const geldig = normaliseerTestmailadres('  NHoevEnaars@gmail.com ');
  assert.equal(geldig.ok && geldig.adres, TEST);
  assert.equal(normaliseerTestmailadres('').ok, false);
  assert.equal(normaliseerTestmailadres('a@b.nl, c@d.nl').ok, false);
  assert.equal(normaliseerTestmailadres('a@b.nl;c@d.nl').ok, false);
  assert.equal(normaliseerTestmailadres('geen-adres').ok, false);
});

test('TEST herschrijft To en verwijdert productie-cc en bcc', () => {
  const uit = pasTestmodusToe(
    {
      to: ['klant@example.com'],
      cc: ['cc@example.com'],
      bcc: ['nhoevenaars@gmail.com', 'bcc@example.com'],
      subject: 'Bevestiging',
      replyTo: CONTRACTBEHEER_EMAIL,
      bedoeldeOntvanger: 'klant@example.com',
    },
    TEST,
  );
  assert.equal(uit.ok, true);
  if (!uit.ok) return;
  assert.deepEqual(uit.to, [TEST]);
  assert.deepEqual(uit.cc, []);
  assert.deepEqual(uit.bcc, []);
  assert.equal(uit.subject, '[TEST] Bevestiging');
  assert.equal(uit.replyTo, CONTRACTBEHEER_EMAIL);
  assert.equal(uit.bedoeldeOntvanger, 'klant@example.com');
  assert.equal(providerPayloadIsTestveilig(uit, TEST), true);
  assert.equal(pasTestmodusToe({ to: ['klant@example.com'], subject: 'x', bedoeldeOntvanger: 'klant@example.com' }, '').ok, false);
});

test('uit en dry-run doen geen provider-call, aan behoudt de ontvanger', async () => {
  let aangeroepen = 0;
  let naar = '';
  const transport = {
    async verstuur(brief: { naar: string }) {
      aangeroepen += 1;
      naar = brief.naar;
    },
  };
  const uit = await verstuurGecontroleerd(
    { sleutel: 'nieuwsbrief', naar: 'vriend@example.com', onderwerp: 'nb', tekst: 'x' },
    { transport, modus: 'uit' },
  );
  const droog = await verstuurGecontroleerd(
    { sleutel: 'nieuwsbrief', naar: 'vriend@example.com', onderwerp: 'nb', tekst: 'x' },
    { transport, modus: 'dry-run' },
  );
  const aan = await verstuurGecontroleerd(
    { sleutel: 'aanvraag_bestuur', naar: 'bestuur@example.com', onderwerp: 'nb', tekst: 'x' },
    { register: STANDAARD_AUTOMATISERINGEN, transport, modus: 'aan' },
  );
  assert.equal(uit.providerAangeroepen, false);
  assert.equal(droog.providerAangeroepen, false);
  assert.equal(aan.providerAangeroepen, true);
  assert.equal(naar, 'bestuur@example.com');
  assert.equal(aangeroepen, 1);
  assert.equal(magAutomatiseringUitvoeren('aanvraag_bevestiging').modus, 'uit');
  assert.equal(magAutomatiseringUitvoeren('aanvraag_bevestiging').provider, false);
});

test('ontbrekend testadres blokkeert zonder provider', async () => {
  const uit = await verstuurGecontroleerd(
    { sleutel: 'mailtemplate_test', naar: 'klant@example.com', onderwerp: 'x', tekst: 'y' },
    { register: STANDAARD_AUTOMATISERINGEN, testadres: '   ', transport: { async verstuur() { throw new Error('provider'); } } },
  );
  assert.equal(uit.providerAangeroepen, false);
  assert.equal(uit.melding, GEEN_TESTMAILADRES);
});

test('loggingfout na een geslaagde provider herhaalt de mail niet', () => {
  const gevolg = loggingNaProvider({ gelukt: false, fout: 'insert faalde' });
  assert.equal(gevolg.opnieuwVersturen, false);
  assert.equal(gevolg.status, 'logging_mislukt');
});

test('tijdlijn toont test, fout en provider-id op het dossier', () => {
  const regels = tijdlijnVoor(
    {
      verzendingen: [{
        id: 1,
        aanvraag_id: 9,
        template_sleutel: 'booking_request_received',
        onderwerp: '[TEST] Ontvangen',
        bedoelde_ontvanger: 'klant@example.com',
        werkelijke_ontvanger: TEST,
        afzender: 'Het Kerkje',
        reply_to: CONTRACTBEHEER_EMAIL,
        richting: 'uitgaand',
        status: 'verzonden',
        provider_bericht_id: 're_123',
        verzonden_op: '2026-10-14T12:00:00Z',
      }],
      jobs: [{ id: 2, aanvraag_id: 9, template_sleutel: 'booking_request_received', status: 'gepland', ontvanger_email: 'klant@example.com' }],
    },
    { aanvraagId: '9' },
  );
  assert.equal(regels.length, 1);
  assert.equal(regels[0]?.providerBerichtId, 're_123');
  assert.equal(regels[0]?.werkelijkeOntvanger, TEST);
  assert.equal(regels[0]?.bedoeldeOntvanger, 'klant@example.com');
});

test('actiepunten negeren finance en blijven binnen acht weken', () => {
  const punten = actiepuntenKomendeWeken({
    vandaag: '2026-10-14',
    boekingen: [
      { id: '1', titel: 'Expo', start: '2026-11-01', eind: '2026-11-02', status: 'definitief', soort: 'expositie' },
      { id: '2', titel: 'Ver', start: '2027-06-01', eind: '2027-06-02', status: 'definitief', soort: 'expositie' },
      { id: '3', titel: 'Weg', start: '2026-10-20', eind: '2026-10-20', status: 'geannuleerd', soort: 'expositie' },
    ],
    activiteiten: [],
    incidenten: [{ id: 'i', boekingId: '1', status: 'open', omschrijving: 'Lekkage' }],
  });
  assert.ok(punten.some((punt) => punt.code === 'gastheer_ontbreekt'));
  assert.ok(punten.some((punt) => punt.code === 'incident'));
  assert.equal(punten.some((punt) => punt.titel === 'Ver'), false);
  assert.equal(punten.some((punt) => punt.code === ('betaling' as never)), false);
});

test('rechten: super admin alles, legacy instellingen blijft, systeembeheer niet', () => {
  const superAdmin = rechtVoor({ isSuperAdmin: true, perModule: {} }, 'systeembeheer');
  assert.equal(superAdmin, 'schrijven');
  const geerfd = rechtVoor({ isSuperAdmin: false, perModule: { instellingen: 'schrijven' } }, 'gastheerbeheer');
  assert.equal(geerfd, 'schrijven');
  const expliciet = rechtVoor({ isSuperAdmin: false, perModule: { instellingen: 'schrijven', automatiseringen: 'verborgen' } }, 'automatiseringen');
  assert.equal(expliciet, 'verborgen');
  const systeem = rechtVoor({ isSuperAdmin: false, perModule: { instellingen: 'schrijven' } }, 'systeembeheer');
  assert.equal(systeem, 'verborgen');
  assert.equal(moduleVoorPad('/beheer/instellingen/systeem/'), 'systeembeheer');
  assert.equal(moduleVoorPad('/beheer/instellingen/gastheren/'), 'gastheerbeheer');
  assert.equal(beheerToegang({
    methode: 'POST',
    module: 'systeembeheer',
    ingelogd: true,
    actief: true,
    rechten: { isSuperAdmin: false, perModule: { instellingen: 'schrijven' } },
    viewAsActief: false,
  }), 'verborgen');
  assert.equal(ROLVOORSTEL.paul.finance, 'lezen');
  assert.equal(ROLVOORSTEL.hans.finance, undefined);
});

test('activatiegrens slaat historische triggers over', () => {
  const vandaag = '2026-10-14';
  assert.equal(grensVoorActivatie(null, vandaag), vandaag);
  assert.equal(magJobStarten({ geplandOp: '2026-04-01', alAfgehandeld: false, alVerzonden: false, geannuleerd: false }, vandaag), false);
  assert.equal(magJobStarten({ geplandOp: '2026-10-13', alAfgehandeld: false, alVerzonden: false, geannuleerd: false }, vandaag), false);
  assert.equal(magJobStarten({ geplandOp: vandaag, alAfgehandeld: false, alVerzonden: false, geannuleerd: false }, vandaag), true);
  assert.equal(magJobStarten({ geplandOp: '2026-12-01', alAfgehandeld: false, alVerzonden: false, geannuleerd: false }, vandaag), true);
  assert.equal(magJobStarten({ geplandOp: vandaag, alAfgehandeld: false, alVerzonden: true, geannuleerd: false }, vandaag), false);
  assert.equal(magJobStarten({ geplandOp: vandaag, alAfgehandeld: false, alVerzonden: false, geannuleerd: true }, vandaag), false);
});

test('review blijft één dag na de einddatum en een geannuleerde boeking valt af', () => {
  const basis: CommunicatieContext = {
    status: 'definitief',
    start: '2026-10-10',
    eind: '2026-10-12',
    verhuurtype: 'expositie',
    publicatieTrigger: 'niet_publiceren',
    inhoudStatus: 'niet_vereist',
    aanbetalingOntvangen: true,
    aanbetalingVerplicht: false,
    optieAangemaaktOp: null,
    betaaldeadline: null,
    gastheerAanwezig: true,
    verzonden: new Set(),
    vandaag: '2026-10-13',
  };
  const review = communicatieStappen(basis).find((stap) => stap.templateId === 'booking_review_request');
  assert.equal(review?.geplandOp, '2026-10-13');
  const gekozen = actueleVerzendingen(basis).some((stap) => stap.templateId === 'booking_review_request');
  assert.equal(gekozen, true);
  const oud = actueleVerzendingen({ ...basis, actiefVanaf: '2026-10-14' }).some((stap) => stap.templateId === 'booking_review_request');
  assert.equal(oud, false);
  const geannuleerd = actueleVerzendingen({ ...basis, geannuleerd: true, status: 'geannuleerd' }).some((stap) => stap.templateId === 'booking_review_request');
  assert.equal(geannuleerd, false);
});

test('nieuwsbrief en reservelijst mailen in test alleen het testadres', () => {
  const nieuws = planNieuwsbrief({
    modus: 'test',
    editieId: '2026-10-12',
    ontvangers: [
      { id: '1', email: 'vriend@example.com', actief: true },
      { id: '2', email: 'stil@example.com', actief: false },
    ],
    alVerzonden: new Set(),
    testadres: TEST,
    uitgeschreven: new Set(['vriend@example.com']),
  });
  assert.equal(nieuws.providerAanroepen, 0);
  const metVrienden = planNieuwsbrief({
    modus: 'test',
    editieId: '2026-10-12',
    ontvangers: [{ id: '1', email: 'vriend@example.com', actief: true }],
    alVerzonden: new Set(['nieuwsbrief:2026-10-12:vriend@example.com']),
    testadres: TEST,
  });
  assert.deepEqual(metVrienden.werkelijkeOntvangers, [TEST]);
  assert.equal(metVrienden.providerAanroepen, 1);
  const uit = planNieuwsbrief({ modus: 'uit', editieId: 'x', ontvangers: [{ id: '1', email: 'vriend@example.com', actief: true }], alVerzonden: new Set(), testadres: TEST });
  assert.equal(uit.providerAanroepen, 0);
  const droog = planNieuwsbrief({ modus: 'dry-run', editieId: 'x', ontvangers: [{ id: '1', email: 'vriend@example.com', actief: true }], alVerzonden: new Set(), testadres: TEST });
  assert.equal(droog.providerAanroepen, 0);

  const reserve = planReservelijst({
    modus: 'test',
    periode: '2026-11-07',
    kandidaten: [
      { relatieId: '1', email: 'a@example.com', actief: true, opReservelijst: true },
      { relatieId: '2', email: 'b@example.com', actief: true, opReservelijst: true },
    ],
    gekozenIds: ['1'],
    alVerzonden: new Set(),
    testadres: TEST,
  });
  assert.deepEqual(reserve.werkelijkeOntvangers, [TEST]);
  assert.equal(reserve.dedupSleutels[0], 'reservelijst:2026-11-07:1');
  const iedereen = planReservelijst({
    modus: 'uit',
    periode: '2026-11-07',
    kandidaten: [{ relatieId: '1', email: 'a@example.com', actief: true, opReservelijst: true }],
    gekozenIds: ['1'],
    alVerzonden: new Set(),
    testadres: TEST,
  });
  assert.equal(iedereen.providerAanroepen, 0);
});

test('relatie weigert een leeg of meervoudig e-mailadres', () => {
  assert.equal('fout' in leesRelatieInvoer({ get: () => '' }), true);
  const lijst = leesRelatieInvoer({
    get: (naam) => (naam === 'naam' ? 'Ada' : naam === 'email' ? 'a@b.nl, c@d.nl' : ''),
  });
  assert.equal('fout' in lijst, true);
});

test('documentmodule verzint geen contracttekst', () => {
  const uit = stelDocumentOp({
    type: 'huurovereenkomst',
    boeking: { id: '1', nummer: 'KVP-1', titel: 'Expo', start: '2026-11-01', eind: '2026-11-02', huurder: 'Ada', email: 'a@b.nl', soort: 'expositie' },
    sjabloon: null,
    goedgekeurd: false,
    bestaande: [],
  });
  assert.equal(uit.tekst, null);
  assert.match(uit.ontbreekt ?? '', /geen contracttekst/i);
  assert.equal(uit.versie, 1);
});

test('exposantenportaal isoleert het dossier en publiceert niet', () => {
  resetPortaalLimiet();
  const nu = new Date('2026-10-14T12:00:00Z');
  assert.equal(beoordeelPortaalToken(null, nu).ok, false);
  assert.equal(beoordeelPortaalToken({ hash: 'x', doel: 'content', boekingId: '4', verlooptOp: '2026-10-01T00:00:00Z', ingetrokkenOp: null }, nu).ok, false);
  assert.equal(beoordeelPortaalToken({ hash: 'x', doel: 'content', boekingId: '4', verlooptOp: '2026-11-01T00:00:00Z', ingetrokkenOp: '2026-10-01' }, nu).ok, false);
  const geldig = beoordeelPortaalToken({ hash: 'x', doel: 'content', boekingId: '4', verlooptOp: '2026-11-01T00:00:00Z', ingetrokkenOp: null }, nu);
  assert.equal(geldig.ok && geldig.boekingId, '4');
  assert.equal(portaalMagPubliceren(), false);
  assert.equal(uploadToegestaan('image/jpeg', 1000), true);
  assert.equal(uploadToegestaan('application/pdf', 1000), false);
  assert.equal(valideerAanlevering({ titel: 'Titel', korteTekst: 'Kort', langeTekst: '', praktisch: '', hoofdafbeelding: false, extraFotos: 1 }).ok, true);
  for (let i = 0; i < 8; i += 1) portaalTeVaak('token');
  assert.equal(portaalTeVaak('token'), true);
});

test('systeemstatus verbergt sleutels en adressen', () => {
  const tekst = veiligStatusTekst('mislukt voor ada@example.com met re_secret_key');
  assert.equal(tekst.includes('ada@example.com'), false);
  assert.equal(tekst.includes('re_secret_key'), false);
});
