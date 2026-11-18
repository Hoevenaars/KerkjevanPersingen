import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { STANDAARD_AUTOMATISERINGEN, magAutomatiseringUitvoeren, type Automatisering, type AutomatiseringStatus } from '../src/platform/automatisering.ts';
import { voegDagenToe } from '../src/platform/datum.ts';
import { legeWereld, voerOpdrachtUit, type MailTransport } from '../src/lib/operatie/kern.ts';
import {
  BETALING_DICHT,
  berichtsoortVoorSjabloon,
  betalingscommunicatieBesluit,
  isBetalingsTemplate,
} from '../src/platform/betalingscommunicatie.ts';
import { actueleVerzendingen, type CommunicatieContext } from '../src/platform/continuiteit.ts';
import { verstuurGecontroleerd } from '../src/lib/mail-transport.ts';
import { besluitContractViaSessie } from '../src/lib/operatie/contract-besluit.ts';

function registerMet(status: Partial<Record<string, AutomatiseringStatus>>): Automatisering[] {
  return STANDAARD_AUTOMATISERINGEN.map((item) => ({
    ...item,
    status: status[item.sleutel] ?? item.status,
  }));
}

const betaling: CommunicatieContext = {
  status: 'definitief',
  start: '2027-02-12',
  verhuurtype: 'concert',
  publicatieTrigger: 'niet_publiceren',
  inhoudStatus: 'niet_vereist',
  aanbetalingOntvangen: false,
  aanbetalingVerplicht: true,
  optieAangemaaktOp: '2026-11-01',
  betaaldeadline: '2026-11-15',
  gastheerAanwezig: false,
  verzonden: new Set(),
  vandaag: '2026-11-17',
};

test('A een ontbrekende of uitgezette poort blokkeert elke betalingsroute', () => {
  assert.equal(betalingscommunicatieBesluit(undefined).modus, 'uit');
  assert.equal(betalingscommunicatieBesluit([]).modus, 'uit');
  assert.equal(betalingscommunicatieBesluit(STANDAARD_AUTOMATISERINGEN).modus, 'uit');
  assert.equal(betalingscommunicatieBesluit(registerMet({ betaalherinnering: 'actief', statusmail_huurder: 'actief' })).modus, 'uit');
  assert.equal(isBetalingsTemplate('booking_payment_reminder'), true);
  assert.equal(isBetalingsTemplate('booking_confirmed'), false);
});

test('B een featurevlag of een herstart zet de poort niet aan', () => {
  const metVlag = registerMet({});
  assert.equal(betalingscommunicatieBesluit(metVlag).modus, 'uit');
  assert.equal(betalingscommunicatieBesluit(metVlag).provider, false);
  const opnieuw = betalingscommunicatieBesluit(STANDAARD_AUTOMATISERINGEN);
  assert.equal(opnieuw.modus, 'uit');
});

test('C een al geplande betalingsstap gaat niet uit zolang de poort uit staat', () => {
  assert.equal(actueleVerzendingen(betaling).some((stap) => stap.keten === 'betaling'), false);
  const historisch = actueleVerzendingen({ ...betaling, betalingsActiefVanaf: '2026-11-17' });
  assert.equal(historisch.some((stap) => stap.keten === 'betaling'), false);
});

test('D alleen een expliciet aangezette poort laat een verschuldigde stap toe, geen oude', () => {
  assert.equal(betalingscommunicatieBesluit(registerMet({ betalingscommunicatie: 'actief' })).modus, 'aan');
  const vandaag = actueleVerzendingen({
    ...betaling,
    vandaag: '2026-11-08',
    betalingsActiefVanaf: '2026-11-08',
  });
  assert.equal(vandaag.some((stap) => stap.templateId === 'booking_payment_reminder'), true);
  const alVerstuurd = actueleVerzendingen({
    ...betaling,
    vandaag: '2026-11-08',
    betalingsActiefVanaf: '2026-11-08',
    verzonden: new Set(['booking_payment_reminder']),
  });
  assert.equal(alVerstuurd.some((stap) => stap.templateId === 'booking_payment_reminder'), false);
});

test('E uit opnieuw blokkeert cron, herhaling en een handmatige route', async () => {
  let provider = 0;
  const register = registerMet({
    betalingscommunicatie: 'uit',
    betaalherinnering: 'actief',
    statusmail_huurder: 'actief',
    handmatige_template: 'actief',
  });
  const transport = { async verstuur() { provider += 1; return 'mag-niet'; } };
  const herinnering = await verstuurGecontroleerd(
    { sleutel: 'betaalherinnering', naar: 'huurder@example.com', onderwerp: 'Herinnering', tekst: 'Open betaling', templateId: 'booking_payment_reminder', berichtsoort: 'betaling' },
    { register, transport },
  );
  const handmatig = await verstuurGecontroleerd(
    { sleutel: 'handmatige_template', naar: 'huurder@example.com', onderwerp: 'Betaling', tekst: 'Rond de betaling af', templateId: 'booking_approved_payment_required', berichtsoort: 'betaling' },
    { register, transport },
  );
  const factuurBijlage = await verstuurGecontroleerd(
    {
      sleutel: 'handmatige_template',
      naar: 'huurder@example.com',
      onderwerp: 'Contract',
      tekst: 'Bijlage',
      bijlagen: [{ bestandsnaam: 'Factuur-KVPF-2026-000001.pdf', inhoud: new Uint8Array([1]) }],
      berichtsoort: 'betaling',
    },
    { register, transport },
  );
  assert.equal(herinnering.providerAangeroepen, false);
  assert.equal(handmatig.providerAangeroepen, false);
  assert.equal(factuurBijlage.providerAangeroepen, false);
  assert.match(herinnering.melding ?? '', /Betalingscommunicatie staat uit/);
  assert.equal(provider, 0);
  assert.equal(actueleVerzendingen({ ...betaling, betalingsActiefVanaf: '2026-11-08', vandaag: '2026-11-17' }).some((stap) => stap.geplandOp < '2026-11-08'), false);
});

function transport(): MailTransport & { n: number; templates: string[] } {
  return {
    n: 0,
    templates: [],
    async verstuur(input) {
      this.n += 1;
      this.templates.push(input.templateSleutel ?? '');
      if ((input.onderwerp ?? '').includes('FOUT')) throw new Error('provider weigert');
    },
  };
}

test('cron, herstart, ingeplande job en retry sturen niets zolang de poort uit staat', async () => {
  const start = '2026-11-01T09:00:00Z';
  const later = '2026-11-10T07:00:00Z';
  let wereld = legeWereld();
  const mail = transport();
  ({ wereld } = await voerOpdrachtUit(wereld, {
    soort: 'dien_aanvraag',
    naam: 'Proef Huurder',
    email: 'klant@example.nl',
    verhuurtype: 'vergadering',
    start: '2026-12-01',
    eind: '2026-12-01',
    toelichting: 'Bijeenkomst',
  }, {
    nu: new Date(start),
    env: { FACTUURPAKKET_V3: 'true', DOCUMENTENFLOW: 'true', VERCEL_ENV: 'preview', MAIL_STAGING_ALLOWLIST: 'klant@example.nl' },
    actor: { type: 'gebruiker', naam: 'Bestuur', rechten: { isSuperAdmin: true, perModule: {} } },
    basisUrl: 'https://preview.kerkje.test',
    internEmail: 'bestuur@example.nl',
  }, mail));
  const aanvraagId = wereld.aanvragen[0].id;
  ({ wereld } = await voerOpdrachtUit(wereld, { soort: 'beoordeel', aanvraagId, besluit: 'goedkeuren' }, {
    nu: new Date(start),
    env: { FACTUURPAKKET_V3: 'true', VERCEL_ENV: 'preview', MAIL_STAGING_ALLOWLIST: 'klant@example.nl' },
    actor: { type: 'gebruiker', naam: 'Bestuur', rechten: { isSuperAdmin: true, perModule: {} } },
    basisUrl: 'https://preview.kerkje.test',
    internEmail: 'bestuur@example.nl',
  }, mail));
  const boeking = wereld.boekingen[0];
  const zouVersturen = actueleVerzendingen({
    status: 'optie',
    start: boeking.start,
    verhuurtype: boeking.verhuurtype,
    publicatieTrigger: 'niet_publiceren',
    inhoudStatus: 'niet_vereist',
    aanbetalingOntvangen: false,
    aanbetalingVerplicht: boeking.aanbetalingBedrag > 0,
    optieAangemaaktOp: boeking.optieAangemaaktOp,
    betaaldeadline: boeking.optieEind,
    gastheerAanwezig: false,
    verzonden: new Set(),
    vandaag: '2026-11-10',
    actiefVanaf: '2026-11-01',
    betalingsActiefVanaf: '2026-11-01',
  });
  assert.equal(boeking.aanbetalingBedrag > 0, true);
  assert.equal(zouVersturen.some((stap) => stap.templateId === 'booking_payment_reminder'), true);
  wereld.jobs.push({
    id: 'mislukt',
    boekingId: boeking.id,
    aanvraagId,
    relatieId: boeking.relatieId,
    templateSleutel: 'booking_payment_reminder',
    status: 'fout',
    modus: 'automatisch',
    geplandOp: '2026-11-08T07:00:00Z',
    dedup: `job:${boeking.id}:booking_payment_reminder`,
    ontvangerEmail: 'klant@example.nl',
    onderwerp: 'Herinnering',
    pogingen: 1,
    foutmelding: 'provider weigert',
  });
  const context = {
    nu: new Date(later),
    env: { FACTUURPAKKET_V3: 'true', DOCUMENTENFLOW: 'true', VERCEL_ENV: 'production' },
    actor: { type: 'systeem' as const, naam: 'planner' },
    basisUrl: 'https://kerkjepersingen.nl',
    internEmail: 'bestuur@example.nl',
    actiefVanaf: '2026-11-01',
    betalingsActiefVanaf: null,
    sjabloonOpen: (templateId: string) => {
      if (isBetalingsTemplate(templateId)) return false;
      return magAutomatiseringUitvoeren('workflow', STANDAARD_AUTOMATISERINGEN).modus === 'aan';
    },
  };
  const voor = mail.n;
  ({ wereld } = await voerOpdrachtUit(wereld, { soort: 'scheduler' }, context, mail));
  ({ wereld } = await voerOpdrachtUit(wereld, { soort: 'scheduler' }, context, mail));
  assert.equal(mail.n, voor);
  assert.equal(mail.templates.some((item) => isBetalingsTemplate(item)), false);
  assert.equal(wereld.jobs.some((job) => isBetalingsTemplate(job.templateSleutel) && job.status === 'verzonden'), false);

  const herstart = execFileSync(process.execPath, ['--experimental-strip-types', '-e', `
    import { STANDAARD_AUTOMATISERINGEN } from './src/platform/automatisering.ts';
    import { betalingscommunicatieBesluit } from './src/platform/betalingscommunicatie.ts';
    const besluit = betalingscommunicatieBesluit(STANDAARD_AUTOMATISERINGEN);
    if (besluit.modus !== 'uit' || besluit.provider) process.exit(2);
  `], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, FACTUURPAKKET_V3: 'true', DOCUMENTENFLOW: 'true', V4_ATOMAIR_CONTRACT: 'true' },
    encoding: 'utf8',
  });
  assert.equal(herstart, '');
});

test('expliciet aan laat alleen de nieuwe stap toe en uit daarna blokkeert de retry', async () => {
  const gekozen = actueleVerzendingen({
    ...betaling,
    vandaag: '2026-11-08',
    betalingsActiefVanaf: '2026-11-08',
  }).filter((stap) => stap.templateId === 'booking_payment_reminder');
  assert.equal(gekozen.length, 1);
  assert.equal(gekozen[0].geplandOp, voegDagenToe('2026-11-01', 7));
  const oud = actueleVerzendingen({
    ...betaling,
    vandaag: '2026-11-18',
    betalingsActiefVanaf: '2026-11-18',
  }).filter((stap) => stap.keten === 'betaling');
  assert.equal(oud.length, 0);
  let provider = 0;
  const aan = registerMet({ betalingscommunicatie: 'actief', betaalherinnering: 'actief' });
  const live = await verstuurGecontroleerd(
    { sleutel: 'betaalherinnering', naar: 'klant@example.nl', onderwerp: 'Herinnering', tekst: 'Open', templateId: 'booking_payment_reminder', berichtsoort: 'betaling' as const },
    { register: aan, transport: { async verstuur() { provider += 1; return 'id-1'; } }, env: { VERCEL_ENV: 'production' } },
  );
  assert.equal(live.providerAangeroepen, true);
  const uit = registerMet({ betalingscommunicatie: 'uit', betaalherinnering: 'actief' });
  const retry = await verstuurGecontroleerd(
    { sleutel: 'betaalherinnering', naar: 'klant@example.nl', onderwerp: 'Herinnering', tekst: 'Open', templateId: 'booking_payment_reminder', berichtsoort: 'betaling' as const },
    { register: uit, transport: { async verstuur() { provider += 1; return 'id-2'; } }, env: { VERCEL_ENV: 'production' } },
  );
  assert.equal(retry.providerAangeroepen, false);
  assert.equal(provider, 1);
});

test('F de tweede Ja verstuurt geen factuurmail en valt niet terug op een onvolledig pakket', async () => {
  let geraakt = false;
  const uit = await besluitContractViaSessie({
    client: { from() { geraakt = true; throw new Error('database'); } } as never,
    env: { FACTUURPAKKET_V3: 'true', DOCUMENTENFLOW: 'true', V4_ATOMAIR_CONTRACT: 'true' },
    actor: {
      type: 'gebruiker',
      naam: 'Bestuur',
      rechten: { isSuperAdmin: false, perModule: { aanvragen: 'schrijven', instellingen: 'schrijven', boekingen: 'schrijven' } },
    },
    boekingId: '18',
    besluit: 'ja',
    verwachteVersie: 1,
    modus: 'aan',
    testadres: null,
    promotieAanwezig: false,
    verstuur: async () => {
      geraakt = true;
      return { verzonden: true, berichtId: 'provider', melding: 'verstuurd' };
    },
  });
  assert.equal(uit.ok, false);
  assert.equal(uit.melding, BETALING_DICHT);
  assert.equal(geraakt, false);
  const tegelijk = await Promise.all([
    besluitContractViaSessie({
      client: { from() { geraakt = true; throw new Error('database'); } } as never,
      env: { FACTUURPAKKET_V3: 'true', DOCUMENTENFLOW: 'true' },
      actor: {
        type: 'gebruiker',
        naam: 'Bestuur',
        rechten: { isSuperAdmin: false, perModule: { aanvragen: 'schrijven', instellingen: 'schrijven', boekingen: 'schrijven' } },
      },
      boekingId: '18',
      besluit: 'ja',
      verwachteVersie: 1,
      modus: 'aan',
      testadres: null,
      promotieAanwezig: false,
      verstuur: async () => {
        geraakt = true;
        return { verzonden: true, berichtId: 'provider', melding: 'verstuurd' };
      },
    }),
    besluitContractViaSessie({
      client: { from() { geraakt = true; throw new Error('database'); } } as never,
      env: { FACTUURPAKKET_V3: 'true' },
      actor: {
        type: 'gebruiker',
        naam: 'Tweede bestuurder',
        rechten: { isSuperAdmin: false, perModule: { aanvragen: 'schrijven', instellingen: 'schrijven', boekingen: 'schrijven' } },
      },
      boekingId: '18',
      besluit: 'ja',
      verwachteVersie: 1,
      modus: 'aan',
      testadres: null,
      promotieAanwezig: false,
      verstuur: async () => {
        geraakt = true;
        return { verzonden: true, berichtId: 'provider-2', melding: 'verstuurd' };
      },
    }),
  ]);
  assert.equal(tegelijk.every((item) => item.ok === false && item.melding === BETALING_DICHT), true);
  assert.equal(geraakt, false);
});

test('vrije tekst en een onbekend bericht zijn financieel; gewone mails blijven open', async () => {
  assert.equal(berichtsoortVoorSjabloon('vrij'), null);
  assert.equal(berichtsoortVoorSjabloon(''), null);
  assert.equal(berichtsoortVoorSjabloon('onbekend_sjabloon'), null);
  assert.equal(berichtsoortVoorSjabloon('booking_payment_reminder'), 'betaling');
  assert.equal(berichtsoortVoorSjabloon('booking_approved_payment_required'), 'betaling');
  assert.equal(berichtsoortVoorSjabloon('contract_begeleiding'), 'geen_betaling');
  assert.equal(berichtsoortVoorSjabloon('huurovereenkomst'), 'geen_betaling');
  assert.equal(berichtsoortVoorSjabloon('booking_practical_information'), 'geen_betaling');
  assert.equal(berichtsoortVoorSjabloon('booking_content_request'), 'geen_betaling');

  let provider = 0;
  const register = registerMet({
    betalingscommunicatie: 'uit',
    handmatige_template: 'actief',
    workflow: 'actief',
    content_herinnering: 'actief',
    herinnering: 'actief',
  });
  const transport = { async verstuur() { provider += 1; return 'id'; } };
  const gevallen = [
    { naam: 'factuur-pdf', berichtsoort: 'betaling' as const, tekst: 'Zie de factuur', templateId: 'huurovereenkomst' },
    { naam: 'verzoek-zonder-pdf', berichtsoort: 'betaling' as const, tekst: 'Wilt u 250 euro overmaken', templateId: 'booking_approved_payment_required' },
    { naam: 'vrije-tekst', berichtsoort: undefined, tekst: 'Maak 250 euro over op onze rekening', templateId: 'vrij' },
    { naam: 'onbekend', berichtsoort: undefined, tekst: 'Hallo', templateId: 'zelf_bedacht' },
    { naam: 'contract-met-factuur', berichtsoort: 'betaling' as const, tekst: 'Op de factuur staat het verschuldigde bedrag', templateId: 'huurovereenkomst' },
  ];
  for (const geval of gevallen) {
    const uit = await verstuurGecontroleerd(
      {
        sleutel: 'handmatige_template',
        naar: 'huurder@example.com',
        onderwerp: geval.naam,
        tekst: geval.tekst,
        templateId: geval.templateId,
        berichtsoort: geval.berichtsoort,
      },
      { register, transport },
    );
    assert.equal(uit.providerAangeroepen, false, geval.naam);
    assert.equal(uit.melding, BETALING_DICHT, geval.naam);
  }
  const gewoonContract = await verstuurGecontroleerd(
    {
      sleutel: 'handmatige_template',
      naar: 'huurder@example.com',
      onderwerp: 'Uw huurovereenkomst',
      tekst: 'Na ondertekening is de reservering nog niet definitief. Hiervoor gelden de betaalafspraken uit de overeenkomst.',
      templateId: 'huurovereenkomst',
      berichtsoort: 'geen_betaling',
    },
    { register, transport },
  );
  const handmatig = await verstuurGecontroleerd(
    {
      sleutel: 'handmatige_template',
      naar: 'huurder@example.com',
      onderwerp: 'Praktische informatie',
      tekst: 'De sleutel ligt bij de begeleider.',
      templateId: 'booking_practical_information',
      berichtsoort: berichtsoortVoorSjabloon('booking_practical_information') ?? undefined,
    },
    { register, transport },
  );
  const automatisch = await verstuurGecontroleerd(
    {
      sleutel: 'content_herinnering',
      naar: 'huurder@example.com',
      onderwerp: 'Informatie',
      tekst: 'Wilt u de tekst voor de website aanleveren?',
      templateId: 'booking_content_request',
      berichtsoort: berichtsoortVoorSjabloon('booking_content_request') ?? undefined,
    },
    { register, transport },
  );
  const zonderRij = await verstuurGecontroleerd(
    {
      sleutel: 'betaalherinnering',
      naar: 'huurder@example.com',
      onderwerp: 'Herinnering',
      tekst: 'De betaling staat open',
      berichtsoort: 'betaling',
    },
    { register: register.filter((item) => item.sleutel !== 'betalingscommunicatie'), transport },
  );
  assert.equal(gewoonContract.providerAangeroepen, true);
  assert.equal(handmatig.providerAangeroepen, true);
  assert.equal(automatisch.providerAangeroepen, true);
  assert.equal(zonderRij.providerAangeroepen, false);
  assert.equal(zonderRij.melding, BETALING_DICHT);
  assert.equal(provider, 3);
});
